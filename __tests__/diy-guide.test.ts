declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

export {};

describe('DIY guide photo persistence', () => {
  it('awaits project photo metadata before generating a DIY guide', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/diy-generating.tsx'),
      'utf8',
    );

    expect(source).toContain('const photoRows: Array<{ project_id: string; url: string; storage_path: string }> = [];');
    expect(source).toContain("const { error: photoInsertError } = await supabase.from('project_photos').insert(photoRows);");
    expect(source).toContain('throw new Error(`Photo upload metadata failed: ${photoInsertError.message}`);');
    expect(source).not.toContain("console.warn('project_photos insert failed (non-fatal):'");
    expect(source).not.toContain(".then(({ error }) =>");
  });
});
