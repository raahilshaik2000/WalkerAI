import {
  buildPhotoAnalysisPayload,
  buildProjectAnalysisFallback,
  isMissingAnalysisFunctionError,
  visionMediaTypeFor,
} from '../src/lib/project-analysis';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('project analysis fallback', () => {
  it('marks unavailable photo analysis without inventing measurements', () => {
    const fallback = buildProjectAnalysisFallback('bathroom', 'Function not found');

    expect(fallback).toMatchObject({
      room_type: 'bathroom',
      layout: {
        estimated_sqft: 0,
        has_island: false,
        plumbing_wall_visible: false,
        window_count: 0,
      },
      analysis_fallback: true,
    });
    expect(String(fallback.ai_observations)).toContain('Automated photo analysis was unavailable');
  });

  it('detects missing edge-function errors only', () => {
    expect(isMissingAnalysisFunctionError('Function not found')).toBe(true);
    expect(isMissingAnalysisFunctionError('Cannot find edge function analyze-photos')).toBe(true);
    expect(isMissingAnalysisFunctionError('Anthropic error 401')).toBe(false);
  });

  it('preserves supported image media types for photo analysis payloads', () => {
    expect(buildPhotoAnalysisPayload([
      { base64: 'data:image/png;base64,abc123', contentType: 'image/png' },
      { base64: 'def456', contentType: 'image/webp' },
    ])).toEqual([
      { data: 'abc123', media_type: 'image/png' },
      { data: 'def456', media_type: 'image/webp' },
    ]);
  });

  it('falls back to jpeg for unsupported vision media types', () => {
    expect(visionMediaTypeFor('image/heif')).toBe('image/jpeg');
    expect(visionMediaTypeFor('image/jpg')).toBe('image/jpeg');
  });

  it('lets homeowners retry transient analysis failures from the error screen', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/analyzing.tsx'),
      'utf8',
    );

    expect(source).toContain('const [analysisRunId, setAnalysisRunId] = useState(0);');
    expect(source).toContain('didRunAnalysis.current = false;');
    expect(source).toContain('setAnalysisRunId((runId) => runId + 1);');
    expect(source).toContain('Retry analysis');
    expect(source).toContain('Back to photos');
  });
});
