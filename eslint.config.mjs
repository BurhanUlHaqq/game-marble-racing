import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['dist/**', '.tooling/**', 'verification-output/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['scripts/*.mjs'], languageOptions: { globals: {
    process: 'readonly', console: 'readonly', setTimeout: 'readonly', URL: 'readonly',
    AudioContext: 'readonly', window: 'readonly', document: 'readonly', navigator: 'readonly',
  } } },
);
