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

  it('resets QA credentials through explicit helper functions without logging generated passwords', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const source = fs.readFileSync(path.join(repoRoot, 'scripts/reset-qa-credentials.mjs'), 'utf8');

    expect(packageJson.scripts['qa:reset']).toBe('node scripts/reset-qa-credentials.mjs');
    expect(source).toContain('/functions/v1/seed-qa');
    expect(source).toContain('/functions/v1/create-test-user');
    expect(source).toContain("email: 'qa-gc@walkerai.app'");
    expect(source).toContain('invokeCreateTestUserForAll');
    expect(source).toContain('Neither seed-qa nor create-test-user is deployed');
    expect(source).toContain('Deploy supabase/functions/seed-qa or supabase/functions/create-test-user');
    expect(source).toContain('writeCredentials(credentials)');
    expect(source).toContain("mode = 'create-test-user'");
    expect(source).toContain('credentials_path: credentialsPath');
    expect(source).toMatch(/accounts: Object\.fromEntries\([\s\S]*?\{ email: account\.email \}/);
    expect(source).not.toContain('console.log(credentials)');
    expect(source).not.toMatch(/console\.(?:log|error)\([\s\S]*password/);
  });

  it('documents the QA general contractor as its own account type', () => {
    const claude = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
    const progress = fs.readFileSync(path.join(repoRoot, 'DEV_PROGRESS.md'), 'utf8');

    expect(claude).toContain('| General Contractor | `qa-gc@walkerai.app` |');
    expect(claude).toContain('Separate GC account type');
    expect(claude).not.toContain('Pre-seeded as general_contractor');
    expect(progress).toContain('General Contractor is a separate account role and profile surface.');
    expect(progress).not.toContain('seed existing companies with `general_contractor` as default');
  });
});
