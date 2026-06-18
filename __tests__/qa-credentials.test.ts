declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

export {};

describe('QA credential checker script', () => {
  const repoRoot = path.resolve(__dirname, '..');

  it('checks all four QA roles without printing passwords', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const source = fs.readFileSync(path.join(repoRoot, 'scripts/check-qa-credentials.mjs'), 'utf8');

    expect(packageJson.scripts['qa:check']).toBe('node scripts/check-qa-credentials.mjs');
    expect(source).toContain("const expectedRoles = ['homeowner', 'company', 'supplier', 'general_contractor']");
    expect(source).toContain('/auth/v1/token?grant_type=password');
    expect(source).toContain('password: row.password');
    expect(source).toContain('email: row.email');
    expect(source).not.toContain('console.log(row.password)');
    expect(source).toContain('checks.push({');
    expect(source).toMatch(/checks\.push\(\{[\s\S]*?role: row\.role,[\s\S]*?email: row\.email,[\s\S]*?ok: result\.ok,[\s\S]*?status: result\.status,[\s\S]*?error: result\.error,[\s\S]*?\}\);/);
  });
});
