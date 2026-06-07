import type { RoomType } from '@/constants/enums';
import type { SurfaceSelection } from '@/stores/project-wizard.store';

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
}

export const FINISH_CUSTOMIZER_ANSWERS_KEY = 'finish_customizer_selections';
export type SurfaceSelectionSource = 'selected' | 'questionnaire' | 'preview_default';

const KITCHEN_SURFACES: CustomizableSurface[] = [
  {
    id: 'cabinets',
    label: 'Cabinets',
    options: [
      { material: 'Painted shaker', colorName: 'Warm white', colorHex: '#F2EFE8' },
      { material: 'Painted slab', colorName: 'Sage green', colorHex: '#8FA68E' },
      { material: 'White oak', colorName: 'Natural oak', colorHex: '#C9A775' },
      { material: 'Walnut veneer', colorName: 'Deep walnut', colorHex: '#5C3A24' },
      { material: 'Keep existing cabinets', colorName: 'Existing', colorHex: '#77736B', answerId: 'k_cab_keep' },
    ],
  },
  {
    id: 'countertops',
    label: 'Countertops',
    options: [
      { material: 'Quartz', colorName: 'Calacatta white', colorHex: '#F7F4EE', answerId: 'k_ct_quartz' },
      { material: 'Granite', colorName: 'Salt and pepper', colorHex: '#8C8A84', answerId: 'k_ct_granite' },
      { material: 'Marble or quartzite', colorName: 'Soft grey vein', colorHex: '#DAD6CF', answerId: 'k_ct_marble' },
      { material: 'Porcelain slab', colorName: 'Concrete grey', colorHex: '#9B9A94', answerId: 'k_ct_porcelain' },
      { material: 'Keep existing countertops', colorName: 'Existing', colorHex: '#77736B', answerId: 'k_ct_keep' },
    ],
  },
  {
    id: 'backsplash',
    label: 'Backsplash',
    options: [
      { material: 'Ceramic subway tile', colorName: 'Gloss white', colorHex: '#F8F7F2' },
      { material: 'Zellige tile', colorName: 'Sea glass', colorHex: '#89A7A2' },
      { material: 'Porcelain tile', colorName: 'Charcoal', colorHex: '#3F4142' },
      { material: 'Stone slab', colorName: 'Bookmatched stone', colorHex: '#CFC7BA' },
    ],
  },
  {
    id: 'flooring',
    label: 'Flooring',
    options: [
      { material: 'Luxury vinyl plank', colorName: 'Light oak', colorHex: '#D7B98B' },
      { material: 'Engineered hardwood', colorName: 'Natural maple', colorHex: '#CFAE76' },
      { material: 'Porcelain floor tile', colorName: 'Limestone', colorHex: '#B8B2A4' },
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
      { material: 'Limewash', colorName: 'Stone beige', colorHex: '#C9BEAA' },
    ],
  },
];

const BATHROOM_SURFACES: CustomizableSurface[] = [
  {
    id: 'vanity',
    label: 'Vanity',
    options: [
      { material: 'Painted vanity', colorName: 'Warm white', colorHex: '#F4F1E8' },
      { material: 'Floating vanity', colorName: 'White oak', colorHex: '#C8A675' },
      { material: 'Custom vanity', colorName: 'Walnut', colorHex: '#5D3B25' },
      { material: 'Refinish existing vanity', colorName: 'Existing', colorHex: '#77736B', answerId: 'b_van_keep' },
    ],
  },
  {
    id: 'vanity_counter',
    label: 'Vanity Counter',
    options: [
      { material: 'Quartz', colorName: 'Bright white', colorHex: '#F6F4EF' },
      { material: 'Granite', colorName: 'Grey speckle', colorHex: '#85827C' },
      { material: 'Marble', colorName: 'Carrara', colorHex: '#DDDAD2' },
      { material: 'Solid surface', colorName: 'Matte cream', colorHex: '#DED4C0' },
    ],
  },
  {
    id: 'shower_tile',
    label: 'Shower Tile',
    options: [
      { material: 'Porcelain tile', colorName: 'Stone grey', colorHex: '#A8A69E' },
      { material: 'Ceramic tile', colorName: 'Gloss white', colorHex: '#F8F7F2' },
      { material: 'Natural stone', colorName: 'Travertine', colorHex: '#B9A282' },
      { material: 'Keep existing tile', colorName: 'Existing', colorHex: '#77736B', answerId: 'b_tile_keep' },
    ],
  },
  {
    id: 'floor_tile',
    label: 'Floor Tile',
    options: [
      { material: 'Porcelain tile', colorName: 'Limestone', colorHex: '#B8B2A4' },
      { material: 'Porcelain mosaic', colorName: 'Matte white', colorHex: '#F0EEE8' },
      { material: 'Large-format tile', colorName: 'Charcoal', colorHex: '#3E4140' },
      { material: 'Terrazzo tile', colorName: 'Warm terrazzo', colorHex: '#C6B39D' },
    ],
  },
  {
    id: 'fixtures',
    label: 'Fixtures',
    options: [
      { material: 'Plumbing fixtures', colorName: 'Chrome', colorHex: '#C8CDD2' },
      { material: 'Plumbing fixtures', colorName: 'Brushed nickel', colorHex: '#B0A99F' },
      { material: 'Plumbing fixtures', colorName: 'Matte black', colorHex: '#1F1F1F' },
      { material: 'Plumbing fixtures', colorName: 'Brushed brass', colorHex: '#C59B45' },
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
    const first = surface.options.find((option) => option.answerId === answerId) ?? surface.options[0];
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
      return `- ${surface.label}: ${selection.material}, ${selection.colorName} (${source})`;
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
