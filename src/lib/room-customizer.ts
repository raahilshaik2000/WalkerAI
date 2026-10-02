import type { RoomType } from '@/constants/enums';
import type { SurfaceSelection } from '@/stores/project-wizard.store';
export type { SurfaceSelection };

export interface SurfaceOption {
  material: string;
  colorName: string;
  colorHex: string;
  answerId?: string;
}

export interface CustomizableSurface {
  id: string;
  label: string;
  options: SurfaceOption[];
}

export interface PersistedSurfaceSelection {
  surfaceId: string;
  surfaceLabel: string;
  material: string;
  colorName: string;
  colorHex: string;
  answerId?: string;
  source?: SurfaceSelectionSource;
  catalogItemId?: string;
  sku?: string;
  brand?: string;
  priceCents?: number;
  imageUrl?: string;
  supplierId?: string;
}

export const FINISH_CUSTOMIZER_ANSWERS_KEY = 'finish_customizer_selections';
export type SurfaceSelectionSource = 'selected' | 'questionnaire' | 'preview_default';

const KITCHEN_SURFACES: CustomizableSurface[] = [
  {
    id: 'cabinets',
    label: 'Cabinets',
    options: [
      { material: 'Painted shaker', colorName: 'Deep navy', colorHex: '#23344A' },
      { material: 'White oak', colorName: 'Natural oak', colorHex: '#C9A775' },
      { material: 'Painted shaker', colorName: 'Warm white', colorHex: '#F2EFE8' },
      { material: 'Painted shaker', colorName: 'Sage green', colorHex: '#8FA68E' },
      { material: 'Painted slab', colorName: 'Charcoal', colorHex: '#33363A' },
      { material: 'White oak', colorName: 'Bleached oak', colorHex: '#E0CFA8' },
      { material: 'Walnut veneer', colorName: 'Deep walnut', colorHex: '#5C3A24' },
      { material: 'Walnut veneer', colorName: 'Smoky walnut', colorHex: '#3A2618' },
      { material: 'Two-tone cabinets', colorName: 'Cream + oak', colorHex: '#D9C9A8' },
      { material: 'Keep existing cabinets', colorName: 'Existing', colorHex: '#77736B', answerId: 'k_cab_keep' },
    ],
  },
  {
    id: 'countertops',
    label: 'Countertops',
    options: [
      { material: 'Quartz', colorName: 'Calacatta white', colorHex: '#F7F4EE', answerId: 'k_ct_quartz' },
      { material: 'Quartz', colorName: 'Soft white', colorHex: '#EEEBE3', answerId: 'k_ct_quartz' },
      { material: 'Quartz', colorName: 'Charcoal grey', colorHex: '#3D3F42', answerId: 'k_ct_quartz' },
      { material: 'Granite', colorName: 'Salt and pepper', colorHex: '#7A7770', answerId: 'k_ct_granite' },
      { material: 'Granite', colorName: 'Black galaxy', colorHex: '#1B1C1E', answerId: 'k_ct_granite' },
      { material: 'Marble', colorName: 'Carrara white', colorHex: '#E8E4DC', answerId: 'k_ct_marble' },
      { material: 'Quartzite', colorName: 'Taj Mahal cream', colorHex: '#DDC9A8', answerId: 'k_ct_marble' },
      { material: 'Porcelain slab', colorName: 'Concrete grey', colorHex: '#9B9A94', answerId: 'k_ct_porcelain' },
      { material: 'Butcher block', colorName: 'Warm walnut', colorHex: '#7C4E2B' },
      { material: 'Keep existing countertops', colorName: 'Existing', colorHex: '#77736B', answerId: 'k_ct_keep' },
    ],
  },
  {
    id: 'backsplash',
    label: 'Backsplash',
    options: [
      { material: 'Zellige tile', colorName: 'Sea glass', colorHex: '#89A7A2' },
      { material: 'Ceramic subway tile', colorName: 'Gloss white', colorHex: '#F8F7F2' },
      { material: 'Ceramic subway tile', colorName: 'Matte black', colorHex: '#1E1F22' },
      { material: 'Zellige tile', colorName: 'Terracotta', colorHex: '#B86A4F' },
      { material: 'Porcelain tile', colorName: 'Charcoal', colorHex: '#3F4142' },
      { material: 'Stone slab', colorName: 'Bookmatched marble', colorHex: '#D8D2C6' },
      { material: 'Mosaic tile', colorName: 'Penny white', colorHex: '#F0EBDD' },
      { material: 'Mosaic tile', colorName: 'Hex sage', colorHex: '#A8B89F' },
    ],
  },
  {
    id: 'flooring',
    label: 'Flooring',
    options: [
      { material: 'Engineered hardwood', colorName: 'Natural oak', colorHex: '#C9A775' },
      { material: 'Engineered hardwood', colorName: 'Honey maple', colorHex: '#D6B07A' },
      { material: 'Engineered hardwood', colorName: 'Smoky walnut', colorHex: '#5A3E2A' },
      { material: 'Luxury vinyl plank', colorName: 'Light oak', colorHex: '#D7B98B' },
      { material: 'Luxury vinyl plank', colorName: 'Weathered grey', colorHex: '#8B8780' },
      { material: 'Porcelain floor tile', colorName: 'Limestone', colorHex: '#B8B2A4' },
      { material: 'Porcelain floor tile', colorName: 'Concrete grey', colorHex: '#94918B' },
      { material: 'Terrazzo tile', colorName: 'Warm terrazzo', colorHex: '#C6B39D' },
      { material: 'Keep existing floor', colorName: 'Existing', colorHex: '#77736B', answerId: 'k_floor_keep' },
    ],
  },
  {
    id: 'walls',
    label: 'Walls',
    options: [
      { material: 'Paint', colorName: 'Soft white', colorHex: '#F3F0E8' },
      { material: 'Paint', colorName: 'Warm greige', colorHex: '#BEB4A6' },
      { material: 'Paint', colorName: 'Deep navy', colorHex: '#1F3041' },
      { material: 'Paint', colorName: 'Forest green', colorHex: '#2F4634' },
      { material: 'Paint', colorName: 'Terracotta', colorHex: '#B96A4A' },
      { material: 'Paint', colorName: 'Charcoal', colorHex: '#2A2C2E' },
      { material: 'Limewash', colorName: 'Stone beige', colorHex: '#C9BEAA' },
      { material: 'Limewash', colorName: 'Misty grey', colorHex: '#A8A9A2' },
      { material: 'Wallpaper', colorName: 'Botanical green', colorHex: '#6B7E5C' },
    ],
  },
];

const BATHROOM_SURFACES: CustomizableSurface[] = [
  {
    id: 'vanity',
    label: 'Vanity',
    options: [
      { material: 'Floating vanity', colorName: 'White oak', colorHex: '#C8A675' },
      { material: 'Painted vanity', colorName: 'Navy blue', colorHex: '#23344A' },
      { material: 'Painted vanity', colorName: 'Warm white', colorHex: '#F4F1E8' },
      { material: 'Painted vanity', colorName: 'Sage green', colorHex: '#8FA68E' },
      { material: 'Painted vanity', colorName: 'Matte black', colorHex: '#1E1F22' },
      { material: 'Floating vanity', colorName: 'Bleached oak', colorHex: '#E0CFA8' },
      { material: 'Custom vanity', colorName: 'Walnut', colorHex: '#5D3B25' },
      { material: 'Custom vanity', colorName: 'Smoky walnut', colorHex: '#3A2618' },
      { material: 'Refinish existing vanity', colorName: 'Existing', colorHex: '#77736B', answerId: 'b_van_keep' },
    ],
  },
  {
    id: 'vanity_counter',
    label: 'Vanity Counter',
    options: [
      { material: 'Quartz', colorName: 'Bright white', colorHex: '#F6F4EF' },
      { material: 'Quartz', colorName: 'Charcoal', colorHex: '#3D3F42' },
      { material: 'Granite', colorName: 'Salt and pepper', colorHex: '#7A7770' },
      { material: 'Granite', colorName: 'Black galaxy', colorHex: '#1B1C1E' },
      { material: 'Marble', colorName: 'Carrara', colorHex: '#DDDAD2' },
      { material: 'Marble', colorName: 'Calacatta gold', colorHex: '#EFE9D6' },
      { material: 'Quartzite', colorName: 'Taj Mahal cream', colorHex: '#DDC9A8' },
      { material: 'Solid surface', colorName: 'Matte cream', colorHex: '#DED4C0' },
      { material: 'Porcelain slab', colorName: 'Concrete grey', colorHex: '#9B9A94' },
    ],
  },
  {
    id: 'shower_tile',
    label: 'Shower Tile',
    options: [
      { material: 'Porcelain tile', colorName: 'Stone grey', colorHex: '#A8A69E' },
      { material: 'Porcelain tile', colorName: 'Concrete', colorHex: '#7E7C78' },
      { material: 'Porcelain tile', colorName: 'Matte black', colorHex: '#26282A' },
      { material: 'Ceramic subway tile', colorName: 'Gloss white', colorHex: '#F8F7F2' },
      { material: 'Ceramic subway tile', colorName: 'Sage green', colorHex: '#8FA68E' },
      { material: 'Natural stone', colorName: 'Travertine', colorHex: '#B9A282' },
      { material: 'Natural stone', colorName: 'Carrara marble', colorHex: '#DDDAD2' },
      { material: 'Zellige tile', colorName: 'Sea glass', colorHex: '#89A7A2' },
      { material: 'Mosaic tile', colorName: 'Penny round', colorHex: '#EFE9DD' },
      { material: 'Keep existing tile', colorName: 'Existing', colorHex: '#77736B', answerId: 'b_tile_keep' },
    ],
  },
  {
    id: 'floor_tile',
    label: 'Floor Tile',
    options: [
      { material: 'Porcelain tile', colorName: 'Limestone', colorHex: '#B8B2A4' },
      { material: 'Porcelain tile', colorName: 'Concrete grey', colorHex: '#94918B' },
      { material: 'Porcelain mosaic', colorName: 'Matte white', colorHex: '#F0EEE8' },
      { material: 'Porcelain mosaic', colorName: 'Hex charcoal', colorHex: '#3A3B3D' },
      { material: 'Large-format tile', colorName: 'Charcoal', colorHex: '#3E4140' },
      { material: 'Large-format tile', colorName: 'Soft cream', colorHex: '#E4DECF' },
      { material: 'Terrazzo tile', colorName: 'Warm terrazzo', colorHex: '#C6B39D' },
      { material: 'Terrazzo tile', colorName: 'Black terrazzo', colorHex: '#2E2F2F' },
      { material: 'Natural stone', colorName: 'Travertine', colorHex: '#B9A282' },
    ],
  },
  {
    id: 'fixtures',
    label: 'Fixtures',
    options: [
      { material: 'Plumbing fixtures', colorName: 'Chrome', colorHex: '#C8CDD2' },
      { material: 'Plumbing fixtures', colorName: 'Polished chrome', colorHex: '#D8DCE0' },
      { material: 'Plumbing fixtures', colorName: 'Brushed nickel', colorHex: '#B0A99F' },
      { material: 'Plumbing fixtures', colorName: 'Matte black', colorHex: '#1F1F1F' },
      { material: 'Plumbing fixtures', colorName: 'Brushed brass', colorHex: '#C59B45' },
      { material: 'Plumbing fixtures', colorName: 'Polished gold', colorHex: '#D9B25C' },
      { material: 'Plumbing fixtures', colorName: 'Brushed bronze', colorHex: '#7A5A3A' },
    ],
  },
];

export function getCustomizableSurfaces(roomType: RoomType | string | null | undefined) {
  return roomType === 'bathroom' ? BATHROOM_SURFACES : KITCHEN_SURFACES;
}

const SURFACE_PREVIEW_Z_ORDER: Record<string, number> = {
  walls: 0,
  shower_tile: 1,
  backsplash: 1,
  flooring: 2,
  floor_tile: 2,
  cabinets: 3,
  vanity: 3,
  countertops: 4,
  vanity_counter: 4,
  fixtures: 5,
};

export function sortSurfacesForPreview(surfaces: CustomizableSurface[]) {
  return [...surfaces].sort((a, b) => {
    const aOrder = SURFACE_PREVIEW_Z_ORDER[a.id] ?? 10;
    const bOrder = SURFACE_PREVIEW_Z_ORDER[b.id] ?? 10;
    return aOrder - bOrder;
  });
}

function answerForSurface(
  roomType: RoomType | string | null | undefined,
  surfaceId: string,
  answers: Record<string, unknown>,
) {
  if (roomType === 'bathroom') {
    if (surfaceId === 'vanity') return answers.b_vanity;
    if (surfaceId === 'shower_tile') return answers.b_tile;
    return undefined;
  }

  if (surfaceId === 'cabinets') return answers.k_cabinets;
  if (surfaceId === 'countertops') return answers.k_countertops;
  if (surfaceId === 'flooring') return answers.k_flooring;
  return undefined;
}

function sourceForSurface(
  roomType: RoomType | string | null | undefined,
  surfaceId: string,
  selections: Record<string, SurfaceSelection>,
  answers: Record<string, unknown>,
): SurfaceSelectionSource {
  if (selections[surfaceId]) return 'selected';
  return answerForSurface(roomType, surfaceId, answers) ? 'questionnaire' : 'preview_default';
}

export function surfaceSelectionSourceLabel(source: SurfaceSelectionSource | undefined) {
  switch (source) {
    case 'selected':
      return 'Homeowner selected';
    case 'questionnaire':
      return 'From questionnaire';
    case 'preview_default':
      return 'Preview default';
    default:
      return 'Saved finish';
  }
}

export function defaultSurfaceSelections(
  roomType: RoomType | string | null | undefined,
  answers: Record<string, unknown> = {},
) {
  return getCustomizableSurfaces(roomType).reduce<Record<string, SurfaceSelection>>((acc, surface) => {
    const answerId = answerForSurface(roomType, surface.id, answers);
    // Only try to match against the user's questionnaire answer when one
    // exists. Without this guard, .find(opt => opt.answerId === undefined)
    // returns the first option that has no answerId set, which is rarely
    // the intended visual default.
    const first = (typeof answerId === 'string' && answerId.length > 0)
      ? (surface.options.find((option) => option.answerId === answerId) ?? surface.options[0])
      : surface.options[0];
    acc[surface.id] = {
      surfaceId: surface.id,
      surfaceLabel: surface.label,
      material: first.material,
      colorName: first.colorName,
      colorHex: first.colorHex,
      answerId: first.answerId,
    };
    return acc;
  }, {});
}

export function mergeSurfaceSelections(
  roomType: RoomType | string | null | undefined,
  selections: Record<string, SurfaceSelection>,
  answers: Record<string, unknown> = {},
) {
  return { ...defaultSurfaceSelections(roomType, answers), ...selections };
}

export function buildSurfaceSelectionSummary(
  roomType: RoomType | string | null | undefined,
  selections: Record<string, SurfaceSelection>,
  answers: Record<string, unknown> = {},
) {
  const merged = mergeSurfaceSelections(roomType, selections, answers);
  return getCustomizableSurfaces(roomType)
    .map((surface) => {
      const selection = merged[surface.id];
      const source = surfaceSelectionSourceLabel(sourceForSurface(roomType, surface.id, selections, answers));
      return `- ${surface.label}: ${selection.material}, ${selection.colorName}${
        selection.sku ? ` · SKU ${selection.sku}` : ''
      }${selection.brand ? ` · ${selection.brand}` : ''} (${source})`;
    })
    .join('\n');
}

export function persistedSurfaceSelections(
  roomType: RoomType | string | null | undefined,
  selections: Record<string, SurfaceSelection>,
  answers: Record<string, unknown> = {},
): PersistedSurfaceSelection[] {
  const merged = mergeSurfaceSelections(roomType, selections, answers);
  return getCustomizableSurfaces(roomType)
    .map((surface) => {
      const selection = merged[surface.id];
      return {
        surfaceId: surface.id,
        surfaceLabel: selection.surfaceLabel,
        material: selection.material,
        colorName: selection.colorName,
        colorHex: selection.colorHex,
        answerId: selection.answerId,
        source: sourceForSurface(roomType, surface.id, selections, answers),
        catalogItemId: selection.catalogItemId,
        sku: selection.sku,
        brand: selection.brand,
        priceCents: selection.priceCents,
        imageUrl: selection.imageUrl,
        supplierId: selection.supplierId,
      };
    })
    .filter((selection) => selection.source !== 'preview_default');
}

export function answersWithSurfaceSelections(
  answers: Record<string, string>,
  roomType: RoomType | string | null | undefined,
  selections: Record<string, SurfaceSelection>,
) {
  const next = { ...answers };

  for (const selection of Object.values(selections)) {
    if (!selection.answerId) continue;
    if (roomType === 'kitchen' && selection.surfaceId === 'cabinets' && selection.answerId === 'k_cab_keep') {
      next.k_cabinets = selection.answerId;
    }
    if (roomType === 'kitchen' && selection.surfaceId === 'countertops') {
      next.k_countertops = selection.answerId;
    }
    if (roomType === 'kitchen' && selection.surfaceId === 'flooring' && selection.answerId === 'k_floor_keep') {
      next.k_flooring = selection.answerId;
    }
    if (roomType === 'bathroom' && selection.surfaceId === 'vanity' && selection.answerId === 'b_van_keep') {
      next.b_vanity = selection.answerId;
    }
    if (roomType === 'bathroom' && selection.surfaceId === 'shower_tile' && selection.answerId === 'b_tile_keep') {
      next.b_tile = selection.answerId;
    }
  }

  return next;
}

export function projectAnswersWithSurfaceSelections(
  answers: Record<string, string>,
  roomType: RoomType | string | null | undefined,
  selections: Record<string, SurfaceSelection>,
): Record<string, unknown> {
  const pricingAnswers = answersWithSurfaceSelections(answers, roomType, selections);
  return {
    ...pricingAnswers,
    [FINISH_CUSTOMIZER_ANSWERS_KEY]: persistedSurfaceSelections(roomType, selections, pricingAnswers),
  };
}

function isPersistedSurfaceSelection(value: unknown): value is PersistedSurfaceSelection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.surfaceId === 'string'
    && typeof candidate.surfaceLabel === 'string'
    && typeof candidate.material === 'string'
    && typeof candidate.colorName === 'string'
    && typeof candidate.colorHex === 'string'
    && (
      candidate.source === undefined
      || candidate.source === 'selected'
      || candidate.source === 'questionnaire'
      || candidate.source === 'preview_default'
    );
}

export function readPersistedSurfaceSelections(
  answers: Record<string, unknown> | null | undefined,
): PersistedSurfaceSelection[] {
  const raw = answers?.[FINISH_CUSTOMIZER_ANSWERS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPersistedSurfaceSelection)
    .filter((selection) => selection.source !== 'preview_default');
}
