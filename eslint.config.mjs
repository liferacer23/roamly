import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'next-env.d.ts',
      'public/pdf.worker.min.mjs',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
);
