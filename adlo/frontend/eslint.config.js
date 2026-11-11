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
              name: '@adlo/kernel',
              message:
                'UI 层禁止直接从 @adlo/kernel 导入。请从 @shared/ipc 导入类型，或在 shared/ipc/<domain>.ts 中添加 re-export。',
              allowTypeImports: false,
            },
          ],
          patterns: [
            {
              group: ['@adlo/kernel/*'],
              message:
                'UI 层禁止直接从 @adlo/kernel 子路径导入。请从 @shared/ipc 导入。',
              allowTypeImports: false,
            },
          ],
        },
      ],
    },
  },
  {
    // 面板作用域计数唯一入口：panelTabSelectors（2026-11-11 徽章曾把中心标签重复计入）。
    // 全量 `.length` 只允许出现在 stores（数据层）、divider-strip（排序指纹）与
    // workspace-browser（未接线组件）内；其余位置请用 panelTabSelectors 派生。
    files: ['src/app/**/*.{ts,tsx}'],
    ignores: [
      'src/app/stores/**',
      'src/app/features/divider-strip/**',
      'src/app/features/workspace-browser/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportNamespaceSpecifier',
          message: '禁止 star import (import * as)。请使用具名导入。',
        },
        {
          selector: "MemberExpression[property.name='length'][object.name='browserTabs']",
          message:
            '面板作用域计数请用 panelTabSelectors（中心标签不计入）；确需全量计数时请落到 stores 层。',
        },
        {
          selector: "MemberExpression[property.name='length'][object.name='terminalTabs']",
          message:
            '面板作用域计数请用 panelTabSelectors（中心标签不计入）；确需全量计数时请落到 stores 层。',
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
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-import-type-side-effects': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    // 构建/工具配置（`vite.config.ts` 等）：Node 环境、不需要 React 规则。
    // 纳入 lint 是为了让「配置里的相对路径/语法」在门禁里可见——2026-10-25 曾漏掉一处
    // `../../scripts` 的错误相对路径，直到人工审查才发现（会让 dev/build 全部起不来）。
    files: ['*.config.{ts,js,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      'react-hooks/rules-of-hooks': 'off',
    },
  },
);
