import {
  shouldGenerateImagePreview,
  shouldLoadExistingImagePreviews,
  visualPreviewUnavailableMessage,
} from '@/lib/visual-preview';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('shouldGenerateImagePreview', () => {
  it('does not auto-generate image renders during project creation', () => {
    expect(shouldGenerateImagePreview('project-1', null)).toBe(false);
    expect(shouldGenerateImagePreview(null, null)).toBe(false);
    expect(shouldGenerateImagePreview('project-1', { roomDimensions: { length: 10, width: 8 } })).toBe(false);
  });
});

describe('shouldLoadExistingImagePreviews', () => {
  it('loads cached image previews only when a project exists and no room model exists', () => {
    expect(shouldLoadExistingImagePreviews('project-1', null)).toBe(true);
    expect(shouldLoadExistingImagePreviews(null, null)).toBe(false);
    expect(shouldLoadExistingImagePreviews('project-1', { roomDimensions: { length: 10, width: 8 } })).toBe(false);
  });
});

describe('project creation visual preview copy', () => {
  it('does not promise renders before the optional visual preview step', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/questionnaire.tsx'),
      'utf8',
    );

    expect(source).toContain("label={isTerminalQuestion ? 'Visual Preview' : 'Next'}");
    expect(source).not.toContain("'See Renders'");
  });

  it('uses the finish customizer without auto-invoking the render provider', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/renders.tsx'),
      'utf8',
    );

    expect(source).toContain('shouldLoadExistingImagePreviews');
    expect(source).toContain('Generated image previews are skipped for now.');
    expect(source).toContain('Use the finish customizer below');
    expect(source).toContain('<RoomMaterialCustomizer');
    expect(source).not.toContain("supabase.functions.invoke('generate-render'");
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
