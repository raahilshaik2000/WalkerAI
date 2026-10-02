import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { MaterialOrder, Supplier, SupplierCatalogItem } from '@/types/database.types';

export const supplierQueryKeys = {
  profile: (userId: string) => ['supplier', 'profile', userId] as const,
  openOrders: (supplierId: string) => ['supplier', 'open-orders', supplierId] as const,
  activeOrders: (supplierId: string) => ['supplier', 'active-orders', supplierId] as const,
  catalog: (supplierId: string) => ['supplier', 'catalog', supplierId] as const,
  earnings: (supplierId: string) => ['supplier', 'earnings', supplierId] as const,
};

const SUPPLIER_PROFILE_SELECT = [
  'id',
  'user_id',
  'business_name',
  'address',
  'city',
  'province',
  'postal_code',
  'lat',
  'lng',
  'service_radius_km',
  'license_number',
  'license_doc_url',
  'categories',
  'stripe_account_id',
  'stripe_details_submitted',
  'stripe_payouts_enabled',
  'stripe_transfers_active',
  'stripe_onboarding_checked_at',
  'verified',
  'rating',
  'total_reviews',
  'fulfillment_rate',
  'avg_delivery_days',
  'created_at',
].join(', ');

const OPEN_ORDER_SELECT = `
  id, project_id, material_id, status, accepted_supplier_id, category,
  quantity_needed, unit, quality_tier, offered_price, final_price,
  delivery_deadline, created_at,
  material:materials!material_orders_material_id_fkey(id, item, unit)
`;

const ACTIVE_ORDER_SELECT = `
  id, project_id, material_id, status, accepted_supplier_id, category,
  quantity_needed, unit, quality_tier, offered_price, final_price,
  delivery_deadline, tracking_number, carrier, shipped_at, delivered_at,
  confirmed_at, delivery_photo_url, created_at,
  material:materials!material_orders_material_id_fkey(id, item, unit)
`;

const EARNINGS_ORDER_SELECT = `
  id, status, final_price, offered_price, confirmed_at, category, quantity_needed, unit,
  material:materials!material_orders_material_id_fkey(item)
`;

function supplierCategories(supplier: Supplier): string[] {
  return Array.isArray(supplier.categories) ? supplier.categories : [];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const current = nextIndex;
        nextIndex += 1;
        if (current >= items.length) return;
        results[current] = await mapper(items[current]);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

/** Category filter + capped concurrent RPC checks (claim edge function is final authority). */
export async function filterClaimableOrders(
  supplier: Supplier,
  orders: MaterialOrder[],
): Promise<MaterialOrder[]> {
  const categories = supplierCategories(supplier);
  const categoryFiltered = orders.filter((order) => !order.category || categories.includes(order.category));
  if (categoryFiltered.length === 0) return [];

  const checks = await mapWithConcurrency(categoryFiltered, 6, async (order) => {
    const { data, error } = await supabase.rpc('supplier_can_fulfill_material_order', {
      p_order_id: order.id,
      p_supplier_id: supplier.id,
    });

    if (!error) return data === true ? order : null;

    const message = error.message?.toLowerCase() ?? '';
    if (
      message.includes('supplier_can_fulfill_material_order')
      || message.includes('function')
      || message.includes('schema cache')
    ) {
      return order;
    }
    throw error;
  });

  return checks.filter((order): order is MaterialOrder => !!order);
}

export async function fetchSupplierProfile(userId: string): Promise<Supplier | null> {
  const { data, error } = await supabase
    .from('suppliers')
    .select(SUPPLIER_PROFILE_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Supplier | null) ?? null;
}

export async function fetchSupplierOpenOrders(supplier: Supplier): Promise<MaterialOrder[]> {
  if (!supplier.verified) return [];

  const { data, error } = await supabase
    .from('material_orders')
    .select(OPEN_ORDER_SELECT)
    .eq('status', 'open')
    .order('delivery_deadline', { ascending: true })
    .limit(75);

  if (error) throw error;
  return filterClaimableOrders(supplier, (data as MaterialOrder[]) ?? []);
}

export async function fetchSupplierActiveOrders(supplierId: string): Promise<MaterialOrder[]> {
  const { data, error } = await supabase
    .from('material_orders')
    .select(ACTIVE_ORDER_SELECT)
    .eq('accepted_supplier_id', supplierId)
    .not('status', 'in', '("open","cancelled")')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data as MaterialOrder[]) ?? [];
}

export async function fetchSupplierCatalog(supplierId: string): Promise<SupplierCatalogItem[]> {
  const { data, error } = await supabase
    .from('supplier_catalog')
    .select('id, supplier_id, name, description, category, sku, unit, price_per_unit, quality_tier, brand, lead_time_days, in_stock, stock_quantity, image_urls, created_at')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as SupplierCatalogItem[]) ?? [];
}

export async function fetchSupplierEarningsOrders(supplierId: string): Promise<MaterialOrder[]> {
  const { data, error } = await supabase
    .from('material_orders')
    .select(EARNINGS_ORDER_SELECT)
    .eq('accepted_supplier_id', supplierId)
    .in('status', ['confirmed', 'paid'])
    .order('confirmed_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data as MaterialOrder[]) ?? [];
}

export function useSupplierProfile(userId: string | undefined) {
  return useQuery({
    queryKey: supplierQueryKeys.profile(userId ?? 'anonymous'),
    enabled: !!userId,
    queryFn: () => fetchSupplierProfile(userId!),
    staleTime: 45_000,
  });
}

export function useSupplierOpenOrders(userId: string | undefined) {
  const profileQuery = useSupplierProfile(userId);
  const supplier = profileQuery.data ?? null;

  const ordersQuery = useQuery({
    queryKey: supplierQueryKeys.openOrders(supplier?.id ?? 'none'),
    enabled: !!supplier?.id && supplier.verified === true,
    queryFn: () => fetchSupplierOpenOrders(supplier!),
    staleTime: 20_000,
  });

  return { profileQuery, ordersQuery, supplier };
}

export function useSupplierActiveOrders(userId: string | undefined) {
  const profileQuery = useSupplierProfile(userId);
  const supplier = profileQuery.data ?? null;

  const ordersQuery = useQuery({
    queryKey: supplierQueryKeys.activeOrders(supplier?.id ?? 'none'),
    enabled: !!supplier?.id,
    queryFn: () => fetchSupplierActiveOrders(supplier!.id),
    staleTime: 20_000,
  });

  return { profileQuery, ordersQuery, supplier };
}

export function useSupplierCatalog(userId: string | undefined) {
  const profileQuery = useSupplierProfile(userId);
  const supplier = profileQuery.data ?? null;

  const catalogQuery = useQuery({
    queryKey: supplierQueryKeys.catalog(supplier?.id ?? 'none'),
    enabled: !!supplier?.id,
    queryFn: () => fetchSupplierCatalog(supplier!.id),
    staleTime: 30_000,
  });

  return { profileQuery, catalogQuery, supplier };
}

export function useSupplierEarnings(userId: string | undefined) {
  const profileQuery = useSupplierProfile(userId);
  const supplier = profileQuery.data ?? null;

  const earningsQuery = useQuery({
    queryKey: supplierQueryKeys.earnings(supplier?.id ?? 'none'),
    enabled: !!supplier?.id,
    queryFn: () => fetchSupplierEarningsOrders(supplier!.id),
    staleTime: 30_000,
  });

  return { profileQuery, earningsQuery, supplier };
}

export function useInvalidateSupplierQueries() {
  const queryClient = useQueryClient();
  return (userId?: string, supplierId?: string | null) => {
    if (userId) {
      queryClient.invalidateQueries({ queryKey: supplierQueryKeys.profile(userId) });
    }
    if (supplierId) {
      queryClient.invalidateQueries({ queryKey: supplierQueryKeys.openOrders(supplierId) });
      queryClient.invalidateQueries({ queryKey: supplierQueryKeys.activeOrders(supplierId) });
      queryClient.invalidateQueries({ queryKey: supplierQueryKeys.catalog(supplierId) });
      queryClient.invalidateQueries({ queryKey: supplierQueryKeys.earnings(supplierId) });
    }
  };
}
