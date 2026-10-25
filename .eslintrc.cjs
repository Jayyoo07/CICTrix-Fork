module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', 'coverage', 'scratch', '.worktrees', '.claude', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    // Off until the Supabase rows are typed; see docs/plans/2026-10-20-eslint-cleanup.md.
    '@typescript-eslint/no-explicit-any': 'off',
    // A leading underscore marks a deliberately unused binding (stub signatures, mocks).
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Dev-only Fast Refresh hint; pages deliberately co-locate helpers and fixtures.
    'react-refresh/only-export-components': 'off',
  },
};
