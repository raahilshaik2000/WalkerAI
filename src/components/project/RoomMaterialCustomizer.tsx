import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Polygon, Rect } from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { RoomType } from '@/constants/enums';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import type { SurfaceSelection } from '@/stores/project-wizard.store';
import {
  getCustomizableSurfaces,
  mergeSurfaceSelections,
  sortSurfacesForPreview,
  type SurfaceOption,
} from '@/lib/room-customizer';
import {
  categoriesForSurface,
  formatCatalogPrice,
  productImageUrl,
  productSwatchHex,
  type DesignCatalogProduct,
} from '@/lib/design-catalog';
import { supabase } from '@/lib/supabase/client';
import { GlassCard } from '@/components/ui';

interface Props {
  roomType: RoomType | null;
  selections: Record<string, SurfaceSelection>;
  answers?: Record<string, unknown>;
  onSelect: (selection: SurfaceSelection) => void;
  /** Hide the 2D SVG preview when a native 3D customizer is already on screen. */
  compact?: boolean;
}

function shapeForSurface(
  surfaceId: string,
  color: string,
  active: boolean,
  onPress: () => void,
) {
  const commonProps = {
    onPress,
    opacity: active ? 1 : 0.92,
    stroke: active ? Colors.success : 'rgba(255,255,255,0.12)',
    strokeWidth: active ? 2 : 1,
  } as const;

  switch (surfaceId) {
    case 'walls':
      return <Rect x="20" y="18" width="260" height="146" rx="6" fill={color} {...commonProps} />;
    case 'flooring':
    case 'floor_tile':
      return <Polygon points="20,164 280,164 294,212 6,212" fill={color} {...commonProps} />;
    case 'backsplash':
      return <Rect x="44" y="74" width="212" height="44" rx="2" fill={color} {...commonProps} />;
    case 'cabinets':
      return (
        <React.Fragment>
          <Rect x="44" y="28" width="212" height="46" rx="4" fill={color} {...commonProps} />
          <Rect x="44" y="126" width="212" height="38" rx="4" fill={color} {...commonProps} />
        </React.Fragment>
      );
    case 'countertops':
      return <Rect x="38" y="118" width="224" height="8" rx="2" fill={color} {...commonProps} />;
    case 'shower_tile':
      return <Rect x="36" y="28" width="80" height="134" rx="4" fill={color} {...commonProps} />;
    case 'vanity':
      return <Rect x="136" y="104" width="124" height="58" rx="4" fill={color} {...commonProps} />;
    case 'vanity_counter':
      return <Rect x="132" y="96" width="132" height="8" rx="2" fill={color} {...commonProps} />;
    case 'fixtures':
      return <Rect x="174" y="38" width="48" height="50" rx="24" fill={color} {...commonProps} />;
    default:
      return null;
  }
}

export function RoomMaterialCustomizer({
  roomType,
  selections,
  answers = {},
  onSelect,
  compact = false,
}: Props) {
  const surfaces = useMemo(() => getCustomizableSurfaces(roomType), [roomType]);
  const previewSurfaces = useMemo(() => sortSurfacesForPreview(surfaces), [surfaces]);
  const mergedSelections = useMemo(
    () => mergeSurfaceSelections(roomType, selections, answers),
    [roomType, selections, answers],
  );
  const [activeSurfaceId, setActiveSurfaceId] = useState(surfaces[0]?.id ?? '');
  const [mode, setMode] = useState<'products' | 'presets'>('products');
  const [products, setProducts] = useState<DesignCatalogProduct[]>([]);
  const [productsScope, setProductsScope] = useState<'category' | 'all'>('category');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const activeSurface = surfaces.find((surface) => surface.id === activeSurfaceId) ?? surfaces[0];

  useEffect(() => {
    if (surfaces[0] && !surfaces.some((s) => s.id === activeSurfaceId)) {
      setActiveSurfaceId(surfaces[0].id);
    }
  }, [surfaces, activeSurfaceId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!activeSurface) {
        setProducts([]);
        setProductsScope('category');
        setProductsError(null);
        return;
      }
      setLoadingProducts(true);
      setProductsError(null);
      try {
        const categories = categoriesForSurface(activeSurface.id);
        const selectCols =
          'id, name, description, category, sku, brand, unit, price_per_unit, quality_tier, image_urls, supplier_id, in_stock';
        const { data, error } = await supabase
          .from('supplier_catalog')
          .select(selectCols)
          .in('category', categories)
          .eq('in_stock', true)
          .order('created_at', { ascending: false })
          .limit(40);
        if (error) throw error;

        let rows = (data as DesignCatalogProduct[]) ?? [];
        let scope: 'category' | 'all' = 'category';

        // Empty category (common in QA when paint SKUs are missing) — show any in-stock items.
        if (rows.length === 0) {
          const fallback = await supabase
            .from('supplier_catalog')
            .select(selectCols)
            .eq('in_stock', true)
            .order('created_at', { ascending: false })
            .limit(40);
          if (fallback.error) throw fallback.error;
          rows = (fallback.data as DesignCatalogProduct[]) ?? [];
          scope = 'all';
        }

        if (!mounted) return;
        setProducts(rows);
        setProductsScope(scope);
        setMode(rows.length === 0 ? 'presets' : 'products');
      } catch {
        if (!mounted) return;
        setProducts([]);
        setProductsScope('category');
        setProductsError('Could not load catalog products. Use style presets for now.');
        setMode('presets');
      } finally {
        if (mounted) setLoadingProducts(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [activeSurface]);

  const handleOption = (option: SurfaceOption) => {
    if (!activeSurface) return;
    onSelect({
      surfaceId: activeSurface.id,
      surfaceLabel: activeSurface.label,
      material: option.material,
      colorName: option.colorName,
      colorHex: option.colorHex,
      answerId: option.answerId,
    });
  };

  const handleProduct = (product: DesignCatalogProduct) => {
    if (!activeSurface) return;
    const imageUrl = productImageUrl(product) ?? undefined;
    onSelect({
      surfaceId: activeSurface.id,
      surfaceLabel: activeSurface.label,
      material: product.brand ? `${product.brand} · ${product.name}` : product.name,
      colorName: product.sku ? `SKU ${product.sku}` : product.category,
      colorHex: productSwatchHex(product.id),
      catalogItemId: product.id,
      sku: product.sku ?? undefined,
      brand: product.brand ?? undefined,
      priceCents: product.price_per_unit,
      imageUrl,
      supplierId: product.supplier_id,
    });
  };

  return (
    <GlassCard style={styles.card} padding={14}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {compact ? 'Lock Walker products' : 'Design with real products'}
          </Text>
          <Text style={styles.subtitle}>
            {compact
              ? 'Pick a surface, then a live supplier SKU. Catalog photos apply to the 3D room and update the design preview.'
              : 'Tap a surface, then pick a Walker supplier product. Catalog photos apply in 3D and keep the AI design preview in sync.'}
          </Text>
        </View>
        <View style={styles.badge}>
          <Ionicons name="storefront-outline" size={14} color={Colors.success} />
          <Text style={styles.badgeText}>Catalog</Text>
        </View>
      </View>

      {!compact ? (
        <View style={styles.preview}>
          <Svg width="100%" height="220" viewBox="0 0 300 220">
            <Rect x="16" y="16" width="268" height="198" rx="14" fill="#111315" />
            <Rect x="20" y="18" width="260" height="146" rx="6" fill="#1E2023" />
            <Polygon points="20,164 280,164 294,212 6,212" fill="#181A1D" />
            {previewSurfaces.map((surface) => {
              const selection = mergedSelections[surface.id];
              const isActive = activeSurface?.id === surface.id;
              return (
                <React.Fragment key={surface.id}>
                  {shapeForSurface(
                    surface.id,
                    selection.colorHex,
                    isActive,
                    () => setActiveSurfaceId(surface.id),
                  )}
                </React.Fragment>
              );
            })}
            <Rect x="16" y="16" width="268" height="198" rx="14" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
          </Svg>
        </View>
      ) : null}

      <View style={styles.surfaceTabs}>
        {surfaces.map((surface) => {
          const selected = activeSurface?.id === surface.id;
          const finish = mergedSelections[surface.id];
          const hasCatalog = !!finish.catalogItemId;
          return (
            <TouchableOpacity
              key={surface.id}
              style={[styles.surfaceTab, selected && styles.surfaceTabActive]}
              onPress={() => setActiveSurfaceId(surface.id)}
              activeOpacity={0.85}
            >
              {finish.imageUrl ? (
                <Image source={{ uri: finish.imageUrl }} style={styles.swatchImage} />
              ) : (
                <View style={[styles.swatch, { backgroundColor: finish.colorHex }]} />
              )}
              <Text style={[styles.surfaceLabel, selected && styles.surfaceLabelActive]} numberOfLines={1}>
                {surface.label}
                {hasCatalog ? ' · SKU' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeChip, mode === 'products' && styles.modeChipActive]}
          onPress={() => setMode('products')}
        >
          <Text style={[styles.modeChipText, mode === 'products' && styles.modeChipTextActive]} numberOfLines={1}>
            Walker products
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeChip, mode === 'presets' && styles.modeChipActive]}
          onPress={() => setMode('presets')}
        >
          <Text style={[styles.modeChipText, mode === 'presets' && styles.modeChipTextActive]} numberOfLines={1}>
            Style presets
          </Text>
        </TouchableOpacity>
      </View>

      {activeSurface && mode === 'presets' ? (
        <View style={styles.options}>
          <Text style={styles.optionHeading}>{activeSurface.label} · presets</Text>
          {activeSurface.options.map((option) => {
            const current = mergedSelections[activeSurface.id];
            const selected =
              !current.catalogItemId &&
              current.material === option.material &&
              current.colorName === option.colorName;
            return (
              <TouchableOpacity
                key={`${option.material}-${option.colorName}`}
                style={[styles.optionRow, selected && styles.optionRowSelected]}
                onPress={() => handleOption(option)}
                activeOpacity={0.85}
              >
                <View style={[styles.optionSwatch, { backgroundColor: option.colorHex }]} />
                <View style={styles.optionText}>
                  <Text style={styles.optionMaterial} numberOfLines={1}>{option.material}</Text>
                  <Text style={styles.optionColor} numberOfLines={1}>{option.colorName}</Text>
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={20} color={Colors.success} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {activeSurface && mode === 'products' ? (
        <View style={styles.options}>
          <Text style={styles.optionHeading}>
            {activeSurface.label} ·{' '}
            {productsScope === 'all' ? 'all in-stock catalog' : 'live supplier catalog'}
          </Text>
          {productsError ? <Text style={styles.productsError}>{productsError}</Text> : null}
          {loadingProducts ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.success} />
              <Text style={styles.optionColor}>Loading products…</Text>
            </View>
          ) : products.length === 0 ? (
            <View style={styles.emptyProductsWrap}>
              <Text style={styles.emptyProducts}>
                No in-stock catalog items yet. Log in as the QA supplier and add products, or use style presets below.
              </Text>
              <TouchableOpacity
                style={styles.switchPresetsBtn}
                onPress={() => setMode('presets')}
                activeOpacity={0.85}
              >
                <Text style={styles.switchPresetsText}>Use style presets</Text>
              </TouchableOpacity>
            </View>
          ) : (
            products.map((product) => {
              const current = mergedSelections[activeSurface.id];
              const selected = current.catalogItemId === product.id;
              const image = productImageUrl(product);
              return (
                <TouchableOpacity
                  key={product.id}
                  style={[styles.optionRow, selected && styles.optionRowSelected]}
                  onPress={() => handleProduct(product)}
                  activeOpacity={0.85}
                >
                  {image ? (
                    <Image source={{ uri: image }} style={styles.productThumb} />
                  ) : (
                    <View style={[styles.optionSwatch, { backgroundColor: productSwatchHex(product.id) }]} />
                  )}
                  <View style={styles.optionText}>
                    <Text style={styles.optionMaterial} numberOfLines={1}>
                      {product.name}
                    </Text>
                    <Text style={styles.optionColor} numberOfLines={1}>
                      {[product.brand, product.sku ? `SKU ${product.sku}` : null, formatCatalogPrice(product.price_per_unit)]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={20} color={Colors.success} /> : null}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { ...Typography.h3 },
  subtitle: { ...Typography.caption, marginTop: 3, lineHeight: 17 },
  badge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.28)',
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    minHeight: 28,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: Colors.success },
  preview: {
    height: 220,
    borderRadius: Radius.item,
    overflow: 'hidden',
    backgroundColor: Colors.bg.primary,
    marginBottom: 12,
  },
  surfaceTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  surfaceTab: {
    minHeight: 36,
    maxWidth: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    paddingHorizontal: 10,
  },
  surfaceTabActive: {
    borderColor: Colors.success,
    backgroundColor: 'rgba(255, 107, 0, 0.10)',
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    flexShrink: 0,
  },
  swatchImage: {
    width: 16,
    height: 16,
    borderRadius: 8,
    flexShrink: 0,
  },
  surfaceLabel: { fontSize: 12, color: Colors.text.secondary, fontWeight: '600', flexShrink: 1, minWidth: 0 },
  surfaceLabelActive: { color: Colors.text.primary },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeChip: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  modeChipActive: {
    borderColor: Colors.success,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
  },
  modeChipText: { fontSize: 12, fontWeight: '600', color: Colors.text.secondary },
  modeChipTextActive: { color: Colors.text.primary },
  options: { gap: 8 },
  optionHeading: { ...Typography.label, color: Colors.text.tertiary, marginBottom: 2 },
  optionRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
  },
  optionRowSelected: {
    borderColor: Colors.success,
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
  },
  optionSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    flexShrink: 0,
  },
  productThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.bg.primary,
    flexShrink: 0,
  },
  optionText: { flex: 1, minWidth: 0 },
  optionMaterial: { fontSize: 13, fontWeight: '700', color: Colors.text.primary },
  optionColor: { ...Typography.caption, marginTop: 1 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  emptyProductsWrap: { gap: 10, paddingVertical: 4 },
  emptyProducts: { ...Typography.caption, lineHeight: 18 },
  productsError: { ...Typography.caption, color: Colors.error, marginBottom: 4, lineHeight: 17 },
  switchPresetsBtn: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  switchPresetsText: { fontSize: 12, fontWeight: '700', color: Colors.text.primary },
});
