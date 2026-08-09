import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      '.vite',
      'dev/**',
      'e2e/**',
      'src/test-fixtures/**',
      'src/mock/**',
      'src/types/**',
      'src/shared/ipc-types.generated.ts',
      'src/shared/ipc/generated/**',
      '*.config.ts',
      '*.config.js',
      '*.d.ts',
    ],
  },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      prettier,
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'prettier/prettier': 'warn',

      ...reactPlugin.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true },
      ],

      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/consistent-type-definitions': ['warn', 'interface'],
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/prefer-function-type': 'warn',
      '@typescript-eslint/prefer-for-of': 'warn',
      '@typescript-eslint/array-type': ['warn', { default: 'array' }],

      'eqeqeq': ['warn', 'smart'],
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-debugger': 'error',
      'no-else-return': 'warn',
      'no-case-declarations': 'warn',
      'curly': ['warn', 'all'],

      'no-restricted-syntax': [
        'warn',
        {
          selector: 'ImportNamespaceSpecifier',
          message:
            '禁止 star import (import * as)。请使用具名导入。',
        },
      ],

      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-useless-escape': 'off',
      'no-empty': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/shared/**',
      'src/tauri-bridge/**',
      'src/preview-bridge/**',
      'src/httpBridge/**',
      'src/httpBridge.ts',
      'src/mock/**',
      'src/app/stores/**',
      'src/app/regions/**',
      'src/app/utils/**',
      'src/app/hooks/**',
      'src/app/App.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@ai-digital-life/kernel',
              message:
                'UI 层禁止直接从 @ai-digital-life/kernel 导入。请从 @shared/ipc 导入类型，或在 shared/ipc/<domain>.ts 中添加 re-export。',
              allowTypeImports: false,
            },
          ],
          patterns: [
            {
              group: ['@ai-digital-life/kernel/*'],
              message:
                'UI 层禁止直接从 @ai-digital-life/kernel 子路径导入。请从 @shared/ipc 导入。',
              allowTypeImports: false,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-import-type-side-effects': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
