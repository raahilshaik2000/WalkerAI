import {
  generateRenderUserMessage,
  shouldGenerateImagePreview,
  shouldLoadExistingImagePreviews,
  visualPreviewUnavailableMessage,
} from '@/lib/visual-preview';
import {
  catalogSelectionsEstimateCents,
  catalogSelectionsToMaterialRows,
  listCatalogSelections,
} from '@/lib/design-catalog';
import type { SurfaceSelection } from '@/stores/project-wizard.store';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('shouldGenerateImagePreview', () => {
  it('enables Fal AI generation when a project id exists', () => {
    expect(shouldGenerateImagePreview('project-1', null)).toBe(true);
    expect(shouldGenerateImagePreview(null, null)).toBe(false);
    expect(shouldGenerateImagePreview('project-1', { roomDimensions: { length: 10, width: 8 } })).toBe(true);
  });
});

describe('shouldLoadExistingImagePreviews', () => {
  it('allows loading cached images when a project exists but does not require them', () => {
    expect(shouldLoadExistingImagePreviews('project-1', null)).toBe(true);
    expect(shouldLoadExistingImagePreviews(null, null)).toBe(false);
  });
});

describe('project creation visual preview copy', () => {
  it('does not promise renders before the optional visual preview step', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );

    expect(source).toContain("label={isTerminalQuestion ? 'Design & Materials' : 'Next'}");
    expect(source).not.toContain("'See Renders'");
    expect(source).not.toContain("'Visual Preview'");
  });

  it('uses Fal AI recommended design plus catalog materials', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/renders.tsx'),
      'utf8',
    );

    expect(source).toContain('Design & Materials');
    expect(source).toContain('Selected Walker products');
    expect(source).toContain('<RoomMaterialCustomizer');
    expect(source).toContain('RoomCustomizer3D');
    expect(source).toContain('generate-render');
    expect(source).toContain('Scrap & generate new design');
    expect(source).not.toContain('images.unsplash.com');
  });

  it('re-applies 3D material selections after the native customizer lays out', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/components/project/RoomCustomizer3D.tsx'),
      'utf8',
    );

    expect(source).toContain('const [nativeLayoutVersion, setNativeLayoutVersion] = useState(0);');
    expect(source).toContain('setNativeLayoutVersion((version) => version + 1);');
    expect(source).toContain('onLayout={handleNativeLayout}');
    expect(source).toContain('}, [surfaces, mergedSelections, nativeLayoutVersion, applyMaterialToNative]);');
    expect(source).toContain('Scanned mesh');
    expect(source).toContain('Layout preview');
    expect(source).toContain('catalogItemId: previous?.catalogItemId');
    expect(source).toContain('option.imageUrl ?? \'\'');
    expect(source).toContain('imageUrl: sel.imageUrl');
  });
});

describe('visualPreviewUnavailableMessage', () => {
  it('does not expose provider configuration details to homeowners', () => {
    expect(visualPreviewUnavailableMessage('No image-based render provider is configured')).toBe(
      'Visual preview is unavailable right now'
    );
    expect(visualPreviewUnavailableMessage('REimagineHome render failed')).toBe(
      'Visual preview is unavailable right now'
    );
  });

  it('preserves actionable non-technical messages', () => {
    expect(visualPreviewUnavailableMessage('Project is missing. Continue to the brief.')).toBe(
      'Project is missing. Continue to the brief.'
    );
  });
});

describe('generateRenderUserMessage', () => {
  it('surfaces a safe message when AI provider is missing', () => {
    expect(
      generateRenderUserMessage({
        fallback: true,
        reason: 'No image-based render provider is configured',
        renders: [],
      }),
    ).toBe('Visual preview is unavailable right now');
  });

  it('surfaces a safe message when generation falls back with a reason', () => {
    expect(
      generateRenderUserMessage({
        fallback: true,
        reason: 'Fal edit failed: 401',
        renders: [],
      }),
    ).toBe('Visual preview is unavailable right now');
  });

  it('hardens Fal prompts against duplicate kitchen faucets and sinks', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-render/index.ts'),
      'utf8',
    );

    expect(source).toContain('function fixtureIntegrityGuidance(roomType: string, expectedRoomState?');
    expect(source).toContain('typically one primary sink with one faucet');
    expect(source).toContain('Do not invent a second sink, second faucet');
    expect(source).toContain('fixtureIntegrityGuidance(params.room_type, params.expected_room_state)');
    expect(source).toContain('guidance_scale: 7.5');
    expect(source).toContain('enable_prompt_expansion: false');
  });
});

describe('catalog selections → materials', () => {
  const picks: Record<string, SurfaceSelection> = {
    cabinets: {
      surfaceId: 'cabinets',
      surfaceLabel: 'Cabinets',
      material: 'Acme · Shaker Oak',
      colorName: 'SKU AO-1',
      colorHex: '#abc',
      catalogItemId: 'cat-1',
      sku: 'AO-1',
      brand: 'Acme',
      priceCents: 12500,
      supplierId: 'sup-1',
    },
    walls: {
      surfaceId: 'walls',
      surfaceLabel: 'Walls',
      material: 'Paint',
      colorName: 'Soft white',
      colorHex: '#fff',
    },
  };

  it('lists only catalog-backed picks', () => {
    expect(listCatalogSelections(picks)).toHaveLength(1);
    expect(catalogSelectionsEstimateCents(listCatalogSelections(picks))).toBe(12500);
  });

  it('builds material rows with SKU notes', () => {
    const rows = catalogSelectionsToMaterialRows(listCatalogSelections(picks), 5, 'mid-range');
    expect(rows).toHaveLength(1);
    expect(rows[0].sort_order).toBe(5);
    expect(rows[0].specific_model).toBe('AO-1');
    expect(rows[0].contractor_notes).toContain('Walker catalog item cat-1');
    expect(rows[0].item).toContain('Cabinets');
  });
});
