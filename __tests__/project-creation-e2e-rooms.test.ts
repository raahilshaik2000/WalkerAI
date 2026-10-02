import { getQuestionsForRoomType } from '../src/data/fixed-questions';
import { analyzeTranscriptForQuestionOption } from '../src/lib/project-voice';
import {
  catalogSelectionsToMaterialRows,
  catalogSelectionsEstimateCents,
  categoriesForSurface,
} from '../src/lib/design-catalog';
import {
  getCustomizableSurfaces,
  type SurfaceSelection,
} from '../src/lib/room-customizer';
import { estimateProjectCost, calculateQuantities } from '../src/data/pricing-reference';

describe('End-to-End Kitchen Project Workflow', () => {
  it('navigates complete kitchen creation: questions, voice matching, catalog picks, cost estimate, and brief materials', () => {
    const roomType = 'kitchen';
    const questions = getQuestionsForRoomType(roomType);
    expect(questions.length).toBeGreaterThanOrEqual(5);

    // 1. Voice Walkthrough: Spoken answers match expected options with high confidence
    const voiceAnswers: Record<string, string> = {};
    const simulatedSpokenTranscripts: Record<string, string> = {
      k_style: 'I like a classic and modern mix',
      k_tier: 'middle range finishes',
      k_cabinets: 'rip out the old cabinets and put in new cabinets',
      k_countertops: 'I want quartz countertops',
      k_appliances: 'full suite of appliances',
      k_flooring: 'full replacement new flooring',
      k_layout: 'do not move anything, same layout',
      k_timeline: 'as soon as possible',
      k_home: 'yes living at home',
    };

    for (const q of questions) {
      const spoken = simulatedSpokenTranscripts[q.id];
      if (spoken) {
        const match = analyzeTranscriptForQuestionOption(spoken, q);
        expect(match).not.toBeNull();
        expect(match!.confidence).toBeGreaterThanOrEqual(0.65);
        voiceAnswers[q.id] = match!.optionId;
      } else {
        voiceAnswers[q.id] = q.options[0].id;
      }
    }

    // 2. Kitchen Surface Customization with Real Supplier SKUs
    const kitchenSurfaces = getCustomizableSurfaces(roomType);
    expect(kitchenSurfaces.some((s) => s.id === 'cabinets')).toBe(true);
    expect(kitchenSurfaces.some((s) => s.id === 'countertops')).toBe(true);
    expect(kitchenSurfaces.some((s) => s.id === 'backsplash')).toBe(true);
    expect(kitchenSurfaces.some((s) => s.id === 'flooring')).toBe(true);

    const cabinetCategories = categoriesForSurface('cabinets');
    expect(cabinetCategories).toContain('Cabinets & Storage');

    const countertopCategories = categoriesForSurface('countertops');
    expect(countertopCategories).toContain('Countertops & Surfaces');

    const sampleKitchenCatalogPicks: SurfaceSelection[] = [
      {
        surfaceId: 'cabinets',
        surfaceLabel: 'Cabinets',
        material: 'Craftline Canada · Craftline Shaker Cabinet Package — Pure White',
        colorName: 'SKU WKR-CAB-SHAKER-WHT',
        colorHex: '#F2EFE8',
        catalogItemId: 'cat-cab-001',
        sku: 'WKR-CAB-SHAKER-WHT',
        brand: 'Craftline Canada',
        priceCents: 480000,
        imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800',
        supplierId: 'sup-toronto-001',
      },
      {
        surfaceId: 'countertops',
        surfaceLabel: 'Countertops',
        material: 'Silestone by Cosentino · Calacatta Gold Quartz Slab 3cm',
        colorName: 'SKU WKR-CT-CALACATTA-GLD',
        colorHex: '#F7F4EE',
        catalogItemId: 'cat-ct-001',
        sku: 'WKR-CT-CALACATTA-GLD',
        brand: 'Silestone by Cosentino',
        priceCents: 9500,
        imageUrl: 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=800',
        supplierId: 'sup-toronto-001',
      },
      {
        surfaceId: 'backsplash',
        surfaceLabel: 'Backsplash',
        material: 'Centura Tile · Artisan Handmade Subway Tile 3×12 — Gloss White',
        colorName: 'SKU WKR-TILE-SUBWAY-ART',
        colorHex: '#F8F7F2',
        catalogItemId: 'cat-tile-001',
        sku: 'WKR-TILE-SUBWAY-ART',
        brand: 'Centura Tile',
        priceCents: 750,
        imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800',
        supplierId: 'sup-toronto-001',
      },
    ];

    const catalogTotal = catalogSelectionsEstimateCents(sampleKitchenCatalogPicks);
    expect(catalogTotal).toBe(480000 + 9500 + 750);

    // 3. Kitchen Cost Estimation & Verified Quantities
    const quantities = calculateQuantities({
      lengthFt: '14',
      widthFt: '12',
      ceilingHeightFt: '9',
      upperLinearFt: '18',
      lowerLinearFt: '22',
      countertopLinearFt: '22',
      numDoors: '1',
      numWindows: '2',
    });
    expect(quantities.countertop_lf).toBe(22);
    expect(quantities.upper_cabinet_lf).toBe(18);
    expect(quantities.lower_cabinet_lf).toBe(22);
    expect(quantities.floor_area_sqf).toBe(168);
    expect(quantities.floor_tile_sqf).toBe(Math.round(168 * 1.1));

    // 4. Transform to Materials Table Rows with Verified Quantities
    const materialRows = catalogSelectionsToMaterialRows(sampleKitchenCatalogPicks, 900, 'mid-range', quantities);
    expect(materialRows).toHaveLength(3);

    const cabinetRow = materialRows.find((r) => r.item.includes('Cabinets'));
    expect(cabinetRow).toBeDefined();
    expect(cabinetRow!.brand_preference).toBe('Craftline Canada');
    expect(cabinetRow!.specific_model).toBe('WKR-CAB-SHAKER-WHT');
    // Cabinets combine upper (18) + lower (22) = 40 LF
    expect(cabinetRow!.quantity).toBe(40);
    expect(cabinetRow!.unit).toBe('LF');
    expect(cabinetRow!.contractor_notes).toContain('Walker catalog item cat-cab-001');
    expect(cabinetRow!.contractor_notes).toContain('SKU WKR-CAB-SHAKER-WHT');
    expect(cabinetRow!.contractor_notes).toContain('Supplier sup-toronto-001');
    expect(cabinetRow!.contractor_notes).toContain('Catalog unit price $4,800.00');

    const countertopRow = materialRows.find((r) => r.item.includes('Countertop'));
    expect(countertopRow).toBeDefined();
    expect(countertopRow!.quantity).toBe(quantities.countertop_lf);
    expect(countertopRow!.unit).toBe('LF');
    expect(countertopRow!.specific_model).toBe('WKR-CT-CALACATTA-GLD');
    expect(countertopRow!.contractor_notes).toContain('SKU WKR-CT-CALACATTA-GLD');

    const backsplashRow = materialRows.find((r) => r.item.includes('Backsplash'));
    expect(backsplashRow).toBeDefined();
    expect(backsplashRow!.quantity).toBe(33); // 22 LF * 1.5 = 33 SQF
    expect(backsplashRow!.unit).toBe('SQF');
    expect(backsplashRow!.specific_model).toBe('WKR-TILE-SUBWAY-ART');
    expect(backsplashRow!.contractor_notes).toContain('SKU WKR-TILE-SUBWAY-ART');

    const catalogTotalWithQuantities = catalogSelectionsEstimateCents(sampleKitchenCatalogPicks, quantities);
    expect(catalogTotalWithQuantities).toBe(
      480000 * 40 + 9500 * quantities.countertop_lf + 750 * 33
    );

    const costEst = estimateProjectCost({
      roomType: 'kitchen',
      qualityTier: 'mid-range',
      answers: voiceAnswers,
      quantities,
      provinceCode: 'ON',
    });

    expect(costEst.avgDollars).toBeGreaterThan(15000);
    expect(costEst.lineItems.length).toBeGreaterThan(0);
  });
});

describe('End-to-End Bathroom Project Workflow', () => {
  it('navigates complete bathroom creation: questions, voice matching, catalog picks, cost estimate, and brief materials', () => {
    const roomType = 'bathroom';
    const questions = getQuestionsForRoomType(roomType);
    expect(questions.length).toBeGreaterThanOrEqual(5);

    // 1. Voice Walkthrough: Spoken answers match expected options with high confidence
    const voiceAnswers: Record<string, string> = {};
    const simulatedSpokenTranscripts: Record<string, string> = {
      b_style: 'Modern clean lines frameless glass',
      b_tier: 'Mid-range quality porcelain tile',
      b_shower: 'Walk-in shower only remove tub',
      b_vanity: 'New single vanity',
      b_tile: 'Full tile job floor shower walls',
      b_toilet: 'Replace with new toilet',
      b_plumbing: 'Refresh mode keep all fixtures in same location',
      b_timeline: 'ASAP ready to start',
      b_home: 'Yes I will be home throughout',
    };

    for (const q of questions) {
      const spoken = simulatedSpokenTranscripts[q.id];
      if (spoken) {
        const match = analyzeTranscriptForQuestionOption(spoken, q);
        expect(match).not.toBeNull();
        expect(match!.confidence).toBeGreaterThanOrEqual(0.78);
        voiceAnswers[q.id] = match!.optionId;
      } else {
        voiceAnswers[q.id] = q.options[0].id;
      }
    }

    // 2. Bathroom Surface Customization with Real Supplier SKUs
    const bathroomSurfaces = getCustomizableSurfaces(roomType);
    expect(bathroomSurfaces.some((s) => s.id === 'vanity')).toBe(true);
    expect(bathroomSurfaces.some((s) => s.id === 'vanity_counter')).toBe(true);
    expect(bathroomSurfaces.some((s) => s.id === 'shower_tile')).toBe(true);
    expect(bathroomSurfaces.some((s) => s.id === 'floor_tile')).toBe(true);
    expect(bathroomSurfaces.some((s) => s.id === 'fixtures')).toBe(true);

    const vanityCategories = categoriesForSurface('vanity');
    expect(vanityCategories).toContain('Cabinets & Storage');

    const showerTileCategories = categoriesForSurface('shower_tile');
    expect(showerTileCategories).toContain('Tile & Flooring');

    const fixtureCategories = categoriesForSurface('fixtures');
    expect(fixtureCategories).toContain('Plumbing Fixtures');

    const sampleBathroomCatalogPicks: SurfaceSelection[] = [
      {
        surfaceId: 'vanity',
        surfaceLabel: 'Vanity',
        material: 'Aria Bath · 36" Freestanding White Oak Vanity with Ceramic Sink',
        colorName: 'SKU WKR-VAN-36-OAK',
        colorHex: '#C8A675',
        catalogItemId: 'cat-van-001',
        sku: 'WKR-VAN-36-OAK',
        brand: 'Aria Bath',
        priceCents: 129900,
        imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800',
        supplierId: 'sup-toronto-001',
      },
      {
        surfaceId: 'shower_tile',
        surfaceLabel: 'Shower Tile',
        material: 'Olympia Tile · Statuario Polished Porcelain Tile 12×24',
        colorName: 'SKU WKR-TILE-SHOWER-STAT',
        colorHex: '#DDDAD2',
        catalogItemId: 'cat-shw-001',
        sku: 'WKR-TILE-SHOWER-STAT',
        brand: 'Olympia Tile',
        priceCents: 850,
        imageUrl: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
        supplierId: 'sup-toronto-001',
      },
      {
        surfaceId: 'floor_tile',
        surfaceLabel: 'Floor Tile',
        material: 'Olympia Tile · 2" Matte Black Porcelain Hexagon Mosaic',
        colorName: 'SKU WKR-TILE-HEX-BLK',
        colorHex: '#26282A',
        catalogItemId: 'cat-flr-001',
        sku: 'WKR-TILE-HEX-BLK',
        brand: 'Olympia Tile',
        priceCents: 1150,
        imageUrl: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800',
        supplierId: 'sup-toronto-001',
      },
      {
        surfaceId: 'fixtures',
        surfaceLabel: 'Fixtures',
        material: 'Riobel Canada · Thermostatic Rain Shower Kit with Handheld — Matte Black',
        colorName: 'SKU WKR-PLM-SHOWER-MB',
        colorHex: '#1F1F1F',
        catalogItemId: 'cat-plm-001',
        sku: 'WKR-PLM-SHOWER-MB',
        brand: 'Riobel Canada',
        priceCents: 54900,
        imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800',
        supplierId: 'sup-toronto-001',
      },
    ];

    const catalogTotal = catalogSelectionsEstimateCents(sampleBathroomCatalogPicks);
    expect(catalogTotal).toBe(129900 + 850 + 1150 + 54900);

    // 3. Bathroom Cost Estimation & Verified Quantities
    const quantities = calculateQuantities({
      lengthFt: '10',
      widthFt: '8',
      ceilingHeightFt: '8',
      numDoors: '1',
      numWindows: '0',
      showerLengthFt: '5',
      showerWidthFt: '3',
      wallTileAreaSqf: '120',
      floorTileAreaSqf: '50',
    });
    // 50 sqft + 10% tile waste factor = 55 sqft
    expect(quantities.floor_tile_sqf).toBe(55);
    expect(quantities.shower_sqf).toBe(120);

    // 4. Transform to Materials Table Rows with Verified Quantities
    const materialRows = catalogSelectionsToMaterialRows(sampleBathroomCatalogPicks, 900, 'mid-range', quantities);
    expect(materialRows).toHaveLength(4);

    const vanityRow = materialRows.find((r) => r.item.includes('Vanity'));
    expect(vanityRow).toBeDefined();
    expect(vanityRow!.brand_preference).toBe('Aria Bath');
    expect(vanityRow!.specific_model).toBe('WKR-VAN-36-OAK');
    expect(vanityRow!.quantity).toBe(1);
    expect(vanityRow!.contractor_notes).toContain('Walker catalog item cat-van-001');
    expect(vanityRow!.contractor_notes).toContain('SKU WKR-VAN-36-OAK');
    expect(vanityRow!.contractor_notes).toContain('Catalog unit price $1,299.00');

    const showerTileRow = materialRows.find((r) => r.item.includes('Shower Tile'));
    expect(showerTileRow).toBeDefined();
    expect(showerTileRow!.quantity).toBe(quantities.shower_sqf);
    expect(showerTileRow!.unit).toBe('SQF');
    expect(showerTileRow!.specific_model).toBe('WKR-TILE-SHOWER-STAT');
    expect(showerTileRow!.contractor_notes).toContain('SKU WKR-TILE-SHOWER-STAT');

    const floorTileRow = materialRows.find((r) => r.item.includes('Floor Tile'));
    expect(floorTileRow).toBeDefined();
    expect(floorTileRow!.quantity).toBe(quantities.floor_tile_sqf);
    expect(floorTileRow!.unit).toBe('SQF');
    expect(floorTileRow!.specific_model).toBe('WKR-TILE-HEX-BLK');
    expect(floorTileRow!.contractor_notes).toContain('SKU WKR-TILE-HEX-BLK');

    const showerKitRow = materialRows.find((r) => r.item.includes('Fixtures'));
    expect(showerKitRow).toBeDefined();
    expect(showerKitRow!.brand_preference).toBe('Riobel Canada');
    expect(showerKitRow!.specific_model).toBe('WKR-PLM-SHOWER-MB');
    expect(showerKitRow!.quantity).toBe(1);
    expect(showerKitRow!.contractor_notes).toContain('SKU WKR-PLM-SHOWER-MB');
    expect(showerKitRow!.contractor_notes).toContain('Catalog unit price $549.00');

    const catalogTotalWithQuantities = catalogSelectionsEstimateCents(sampleBathroomCatalogPicks, quantities);
    expect(catalogTotalWithQuantities).toBe(
      129900 * 1 + 850 * quantities.shower_sqf + 1150 * quantities.floor_tile_sqf + 54900 * 1
    );

    const costEst = estimateProjectCost({
      roomType: 'bathroom',
      qualityTier: 'mid-range',
      answers: voiceAnswers,
      quantities,
      provinceCode: 'ON',
    });

    expect(costEst.avgDollars).toBeGreaterThan(8000);
    expect(costEst.lineItems.length).toBeGreaterThan(0);
  });
});
