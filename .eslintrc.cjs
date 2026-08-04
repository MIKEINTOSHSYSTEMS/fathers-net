module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'security'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:security/recommended-legacy',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    'security/detect-unsafe-regex': 'warn',
    'no-console': 'warn',
  },
  ignorePatterns: ['dist/**', 'node_modules/**', 'coverage/**', '*.d.ts', 'scripts/**'],
  overrides: [
    {
      files: ['**/*.test.ts', '**/test/**/*.ts'],
      env: {
        jest: true,
        node: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        // Test assertions index parsed payloads / response objects freely;
        // keys are fixed test expectations, not untrusted input.
        'security/detect-object-injection': 'off',
      },
    },
  ],
};
