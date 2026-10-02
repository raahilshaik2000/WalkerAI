import type { SupplierCategory } from '@/constants/enums';
import type { PersistedSurfaceSelection } from '@/lib/room-customizer';
import type { SurfaceSelection } from '@/stores/project-wizard.store';

/** Map finish-customizer surface ids → supplier catalog categories. */
export const SURFACE_TO_CATALOG_CATEGORIES: Record<string, SupplierCategory[]> = {
  cabinets: ['Cabinets & Storage'],
  countertops: ['Countertops & Surfaces'],
  backsplash: ['Tile & Flooring', 'Countertops & Surfaces'],
  flooring: ['Tile & Flooring'],
  // Paint is ideal; Other keeps walls usable when paint SKUs are not stocked yet.
  walls: ['Paint & Wall Coverings', 'Other'],
  vanity: ['Cabinets & Storage', 'Plumbing Fixtures'],
  vanity_counter: ['Countertops & Surfaces'],
  shower_tile: ['Tile & Flooring'],
  floor_tile: ['Tile & Flooring'],
  fixtures: ['Plumbing Fixtures', 'Hardware & Fixtures', 'Lighting & Electrical'],
};

export type DesignCatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  sku: string | null;
  brand: string | null;
  unit: string;
  price_per_unit: number;
  quality_tier: string | null;
  image_urls: string[] | null;
  supplier_id: string;
  in_stock: boolean | null;
};

export function categoriesForSurface(surfaceId: string): SupplierCategory[] {
  const mapped = SURFACE_TO_CATALOG_CATEGORIES[surfaceId] ?? ['Other'];
  if (mapped.includes('Other')) return mapped;
  return [...mapped, 'Other'];
}

export function productImageUrl(product: Pick<DesignCatalogProduct, 'image_urls'>): string | null {
  const urls = product.image_urls ?? [];
  const first = urls.find((u) => typeof u === 'string' && u.startsWith('http'));
  return first ?? null;
}

/** Deterministic swatch color from product id when no image/color is available. */
export function productSwatchHex(productId: string): string {
  let hash = 0;
  for (let i = 0; i < productId.length; i += 1) {
    hash = (hash * 31 + productId.charCodeAt(i)) >>> 0;
  }
  // RN Color / SVG reliably accept hex — avoid hsl() which can fail on some builds.
  const r = 70 + (hash & 0x5f);
  const g = 70 + ((hash >>> 8) & 0x5f);
  const b = 70 + ((hash >>> 16) & 0x5f);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function formatCatalogPrice(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return '—';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export type CatalogMaterialRow = {
  item: string;
  quantity: number;
  unit: string;
  quality_tier: 'budget' | 'mid-range' | 'luxury';
  brand_preference: string | null;
  color_finish: string | null;
  specific_model: string | null;
  contractor_notes: string | null;
  sort_order: number;
};

function asQualityTier(value: string | null | undefined): 'budget' | 'mid-range' | 'luxury' {
  if (value === 'budget' || value === 'luxury' || value === 'mid-range') return value;
  return 'mid-range';
}

export type MeasuredQuantitiesSummary = {
  floor_area_sqf?: number;
  wall_area_net_sqf?: number;
  floor_tile_sqf?: number;
  shower_sqf?: number;
  countertop_lf?: number;
  upper_cabinet_lf?: number;
  lower_cabinet_lf?: number;
  baseboard_lf?: number;
};

export function quantityAndUnitForSurface(
  surfaceId: string,
  quantities?: MeasuredQuantitiesSummary | null,
): { quantity: number; unit: string } {
  if (!quantities) return { quantity: 1, unit: 'units' };

  switch (surfaceId) {
    case 'flooring':
    case 'floor_tile': {
      const sqf = quantities.floor_tile_sqf || quantities.floor_area_sqf;
      return sqf ? { quantity: sqf, unit: 'SQF' } : { quantity: 1, unit: 'SQF' };
    }
    case 'shower_tile': {
      const sqf = quantities.shower_sqf;
      return sqf ? { quantity: sqf, unit: 'SQF' } : { quantity: 1, unit: 'SQF' };
    }
    case 'backsplash': {
      const sqf = Math.round(Math.min((quantities.countertop_lf || 22) * 1.5, 40));
      return { quantity: sqf, unit: 'SQF' };
    }
    case 'countertops': {
      const lf = quantities.countertop_lf;
      return lf ? { quantity: lf, unit: 'LF' } : { quantity: 1, unit: 'LF' };
    }
    case 'cabinets': {
      const lf = (quantities.upper_cabinet_lf ?? 0) + (quantities.lower_cabinet_lf ?? 0);
      return lf > 0 ? { quantity: lf, unit: 'LF' } : { quantity: 1, unit: 'LF' };
    }
    case 'walls': {
      const wallSqf = quantities.wall_area_net_sqf;
      const gallons = wallSqf ? Math.ceil(wallSqf / 350) + 1 : 1;
      return { quantity: gallons, unit: 'Gallon' };
    }
    case 'vanity':
    case 'vanity_counter':
    case 'fixtures':
    default:
      return { quantity: 1, unit: 'EA' };
  }
}

/** Turn homeowner catalog SKU picks into materials rows for the project brief. */
export function catalogSelectionsToMaterialRows(
  selections: Array<SurfaceSelection | PersistedSurfaceSelection>,
  startSortOrder = 0,
  defaultTier: 'budget' | 'mid-range' | 'luxury' = 'mid-range',
  quantities?: MeasuredQuantitiesSummary | null,
): CatalogMaterialRow[] {
  const rows: CatalogMaterialRow[] = [];
  let sort = startSortOrder;

  for (const selection of selections) {
    if (!selection.catalogItemId) continue;
    const { quantity, unit } = quantityAndUnitForSurface(selection.surfaceId, quantities);
    const priceNote =
      selection.priceCents != null
        ? `Catalog unit price ${formatCatalogPrice(selection.priceCents)}.`
        : '';
    rows.push({
      item: `${selection.surfaceLabel}: ${selection.material}`,
      quantity,
      unit,
      quality_tier: asQualityTier(defaultTier),
      brand_preference: selection.brand ?? null,
      color_finish: selection.colorName ?? null,
      specific_model: selection.sku ?? selection.catalogItemId,
      contractor_notes: [
        `Walker catalog item ${selection.catalogItemId}.`,
        selection.sku ? `SKU ${selection.sku}.` : null,
        selection.supplierId ? `Supplier ${selection.supplierId}.` : null,
        priceNote || null,
        'Homeowner-selected product for design tool — prefer this SKU when ordering.',
      ]
        .filter(Boolean)
        .join(' '),
      sort_order: sort++,
    });
  }

  return rows;
}

export function catalogSelectionsEstimateCents(
  selections: Array<SurfaceSelection | PersistedSurfaceSelection>,
  quantities?: MeasuredQuantitiesSummary | null,
): number {
  return selections.reduce((sum, s) => {
    if (!s.catalogItemId || !s.priceCents) return sum;
    const { quantity } = quantityAndUnitForSurface(s.surfaceId, quantities);
    return sum + (s.priceCents * quantity);
  }, 0);
}

export function listCatalogSelections(
  selections: Record<string, SurfaceSelection>,
): SurfaceSelection[] {
  return Object.values(selections).filter((s) => !!s.catalogItemId);
}
