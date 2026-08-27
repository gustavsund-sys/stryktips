import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'functions/lib/**', 'node_modules/**'] },
  { files: ['**/*.{js,mjs,cjs}'], ...js.configs.recommended, languageOptions: { globals: globals.node } },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['**/*.{ts,tsx}'], languageOptions: { ...config.languageOptions, globals: { ...globals.browser, ...globals.node } }, rules: { ...config.rules, '@typescript-eslint/no-explicit-any': 'off' } })),
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: { ...reactHooks.configs.recommended.rules, 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] },
  },
);
