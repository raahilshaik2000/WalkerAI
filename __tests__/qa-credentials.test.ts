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

  it('resets QA credentials through the explicit seed helper without logging generated passwords', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const source = fs.readFileSync(path.join(repoRoot, 'scripts/reset-qa-credentials.mjs'), 'utf8');

    expect(packageJson.scripts['qa:reset']).toBe('node scripts/reset-qa-credentials.mjs');
    expect(source).toContain('/functions/v1/seed-qa');
    expect(source).toContain("email: 'qa-gc@walkerai.app'");
    expect(source).toContain('Deploy supabase/functions/seed-qa first');
    expect(source).toContain('writeCredentials(credentials)');
    expect(source).toContain('credentials_path: credentialsPath');
    expect(source).toMatch(/accounts: Object\.fromEntries\([\s\S]*?\{ email: account\.email \}/);
    expect(source).not.toContain('console.log(credentials)');
    expect(source).not.toContain('password: account.password');
  });
});
