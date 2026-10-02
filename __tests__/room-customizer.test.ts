import {
  answersWithSurfaceSelections,
  buildSurfaceSelectionSummary,
  defaultSurfaceSelections,
  FINISH_CUSTOMIZER_ANSWERS_KEY,
  getCustomizableSurfaces,
  projectAnswersWithSurfaceSelections,
  readPersistedSurfaceSelections,
  sortSurfacesForPreview,
  surfaceSelectionSourceLabel,
} from '../src/lib/room-customizer';
import type { SurfaceSelection } from '../src/stores/project-wizard.store';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('room customizer data flow', () => {
  it('builds default kitchen and bathroom surface selections', () => {
    expect(defaultSurfaceSelections('kitchen').countertops.material).toBe('Quartz');
    expect(defaultSurfaceSelections('bathroom').shower_tile.material).toBe('Porcelain tile');
  });

  it('draws room preview surfaces in visual z-order instead of tab order', () => {
    const kitchenPreviewOrder = sortSurfacesForPreview(getCustomizableSurfaces('kitchen')).map((surface) => surface.id);
    const bathroomPreviewOrder = sortSurfacesForPreview(getCustomizableSurfaces('bathroom')).map((surface) => surface.id);

    expect(getCustomizableSurfaces('kitchen').map((surface) => surface.id)).toEqual([
      'cabinets',
      'countertops',
      'backsplash',
      'flooring',
      'walls',
    ]);
    expect(kitchenPreviewOrder.indexOf('walls')).toBeLessThan(kitchenPreviewOrder.indexOf('cabinets'));
    expect(kitchenPreviewOrder.indexOf('walls')).toBeLessThan(kitchenPreviewOrder.indexOf('countertops'));
    expect(kitchenPreviewOrder.indexOf('flooring')).toBeLessThan(kitchenPreviewOrder.indexOf('cabinets'));

    expect(bathroomPreviewOrder.indexOf('floor_tile')).toBeLessThan(bathroomPreviewOrder.indexOf('vanity'));
    expect(bathroomPreviewOrder.indexOf('vanity')).toBeLessThan(bathroomPreviewOrder.indexOf('vanity_counter'));
    expect(bathroomPreviewOrder.indexOf('fixtures')).toBeGreaterThan(bathroomPreviewOrder.indexOf('vanity_counter'));
  });

  it('lets homeowners tap the preview surfaces directly to select finishes', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/components/project/RoomMaterialCustomizer.tsx'),
      'utf8',
    );

    expect(source).toContain('Tap a surface, then pick a Walker supplier product');
    expect(source).toContain('onPress={() => setActiveSurfaceId(surface.id)}');
    expect(source).toContain('stroke: active ? Colors.success');
    expect(source).toContain('Walker products');
    expect(source).toContain('handleProduct');
  });

  it('maps kitchen countertop finish choices into existing pricing answers', () => {
    const selections: Record<string, SurfaceSelection> = {
      countertops: {
        surfaceId: 'countertops',
        surfaceLabel: 'Countertops',
        material: 'Granite',
        colorName: 'Salt and pepper',
        colorHex: '#8C8A84',
        answerId: 'k_ct_granite',
      },
    };

    expect(answersWithSurfaceSelections({ k_countertops: 'k_ct_quartz' }, 'kitchen', selections))
      .toMatchObject({ k_countertops: 'k_ct_granite' });
  });

  it('does not let default finish choices override explicit keep scope answers', () => {
    const answers = {
      k_cabinets: 'k_cab_keep',
      k_countertops: 'k_ct_keep',
      k_flooring: 'k_floor_keep',
    };

    expect(answersWithSurfaceSelections(answers, 'kitchen', {})).toEqual(answers);

    const persisted = projectAnswersWithSurfaceSelections(answers, 'kitchen', {});
    expect(persisted).toMatchObject(answers);
    expect(readPersistedSurfaceSelections(persisted)).toEqual(expect.arrayContaining([
      expect.objectContaining({ surfaceId: 'cabinets', material: 'Keep existing cabinets', source: 'questionnaire' }),
      expect.objectContaining({ surfaceId: 'countertops', material: 'Keep existing countertops', source: 'questionnaire' }),
      expect.objectContaining({ surfaceId: 'flooring', material: 'Keep existing floor', source: 'questionnaire' }),
    ]));
    expect(readPersistedSurfaceSelections(persisted)).toHaveLength(3);
  });

  it('allows explicit customizer selections to change directly mapped pricing answers', () => {
    const payload = projectAnswersWithSurfaceSelections(
      { k_countertops: 'k_ct_keep' },
      'kitchen',
      {
        countertops: {
          surfaceId: 'countertops',
          surfaceLabel: 'Countertops',
          material: 'Quartz',
          colorName: 'Calacatta white',
          colorHex: '#F7F4EE',
          answerId: 'k_ct_quartz',
        },
      },
    );

    expect(payload.k_countertops).toBe('k_ct_quartz');
    expect(readPersistedSurfaceSelections(payload)).toContainEqual(expect.objectContaining({
      surfaceId: 'countertops',
      source: 'selected',
    }));
  });

  it('summarizes selected finishes for the project brief prompt', () => {
    const summary = buildSurfaceSelectionSummary('kitchen', {
      cabinets: {
        surfaceId: 'cabinets',
        surfaceLabel: 'Cabinets',
        material: 'White oak',
        colorName: 'Natural oak',
        colorHex: '#C9A775',
      },
    });

    expect(summary).toContain('Cabinets: White oak, Natural oak');
    expect(summary).toContain('Cabinets: White oak, Natural oak (Homeowner selected)');
    expect(summary).toContain('Countertops: Quartz, Calacatta white (Preview default)');
  });

  it('summarizes finish defaults from existing questionnaire answers', () => {
    const summary = buildSurfaceSelectionSummary(
      'kitchen',
      {},
      { k_countertops: 'k_ct_keep', k_flooring: 'k_floor_keep' },
    );

    expect(summary).toContain('Countertops: Keep existing countertops, Existing (From questionnaire)');
    expect(summary).toContain('Flooring: Keep existing floor, Existing (From questionnaire)');
  });

  it('persists only homeowner-intent finish choices alongside pricing answer ids', () => {
    const payload = projectAnswersWithSurfaceSelections(
      { k_countertops: 'k_ct_quartz' },
      'kitchen',
      {
        countertops: {
          surfaceId: 'countertops',
          surfaceLabel: 'Countertops',
          material: 'Granite',
          colorName: 'Salt and pepper',
          colorHex: '#8C8A84',
          answerId: 'k_ct_granite',
        },
      },
    );

    expect(payload.k_countertops).toBe('k_ct_granite');
    expect(readPersistedSurfaceSelections(payload)).toContainEqual(expect.objectContaining({
      surfaceId: 'countertops',
      material: 'Granite',
      colorName: 'Salt and pepper',
      source: 'selected',
    }));
    expect(payload[FINISH_CUSTOMIZER_ANSWERS_KEY]).toHaveLength(1);
  });

  it('does not persist or read preview-only default finishes as homeowner intent', () => {
    const payload = projectAnswersWithSurfaceSelections({}, 'kitchen', {});

    expect(payload[FINISH_CUSTOMIZER_ANSWERS_KEY]).toEqual([]);
    expect(readPersistedSurfaceSelections({
      [FINISH_CUSTOMIZER_ANSWERS_KEY]: [
        {
          surfaceId: 'cabinets',
          surfaceLabel: 'Cabinets',
          material: 'Painted shaker',
          colorName: 'Warm white',
          colorHex: '#F2EFE8',
          source: 'preview_default',
        },
        {
          surfaceId: 'countertops',
          surfaceLabel: 'Countertops',
          material: 'Granite',
          colorName: 'Salt and pepper',
          colorHex: '#8C8A84',
          source: 'selected',
        },
      ],
    })).toEqual([
      {
        surfaceId: 'countertops',
        surfaceLabel: 'Countertops',
        material: 'Granite',
        colorName: 'Salt and pepper',
        colorHex: '#8C8A84',
        source: 'selected',
      },
    ]);
  });

  it('labels persisted finish selection sources for UI display', () => {
    expect(surfaceSelectionSourceLabel('selected')).toBe('Homeowner selected');
    expect(surfaceSelectionSourceLabel('questionnaire')).toBe('From questionnaire');
    expect(surfaceSelectionSourceLabel('preview_default')).toBe('Preview default');
    expect(surfaceSelectionSourceLabel(undefined)).toBe('Saved finish');
  });

  it('ignores malformed persisted finish choices', () => {
    expect(readPersistedSurfaceSelections({
      [FINISH_CUSTOMIZER_ANSWERS_KEY]: [
        { surfaceId: 'walls', material: 'Paint' },
        {
          surfaceId: 'walls',
          surfaceLabel: 'Walls',
          material: 'Paint',
          colorName: 'Soft white',
          colorHex: '#F3F0E8',
        },
      ],
    })).toEqual([
      {
        surfaceId: 'walls',
        surfaceLabel: 'Walls',
        material: 'Paint',
        colorName: 'Soft white',
        colorHex: '#F3F0E8',
      },
    ]);
  });

  it('polishes scanned USDZ mesh without injecting misaligned box furniture', () => {
    const nativeSource = fs.readFileSync(
      path.join(__dirname, '../ios/WalkerAI/RoomPlan/RoomCustomizerViewController.swift'),
      'utf8',
    );
    const uiSource = fs.readFileSync(
      path.join(__dirname, '../src/components/project/RoomCustomizer3D.tsx'),
      'utf8',
    );

    expect(nativeSource).toContain('polishCapturedMeshAppearance');
    expect(nativeSource).toContain('Do NOT inject kitchen/bath box furniture onto a live RoomPlan mesh');
    expect(nativeSource).toContain('scene.lightingEnvironment.contents');
    expect(nativeSource).toContain('camera.wantsHDR = true');
    expect(uiSource).toContain('showroom lighting');
  });
});
