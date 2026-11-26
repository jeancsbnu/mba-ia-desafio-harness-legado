// Lint do Balcão (gate G2, e também G5 e G11 pelo plugin local).
// Nada de exceção por arquivo: as únicas pastas fora de uma regra são as que a
// própria regra define (config/ na G5 e na G11).
import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import balcao from './scripts/eslint-balcao.mjs'

const CODIGO_API = ['api/src/**/*.ts']
const CODIGO_WEB = ['web/src/**/*.{ts,tsx}']
const CONFIG_API = ['api/src/config/**']
const CONFIG_WEB = ['web/src/config/**']

export default defineConfig([
  { ignores: ['**/node_modules/**', '**/dist/**', '.balcao/**', 'kit-gates/**', 'blackbox/**'] },
  {
    // Comentário de supressão não vale: `eslint-disable` é ignorado e acusado.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'all' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: { 'no-unused-vars': ['error', { caughtErrors: 'all' }] },
  },
  {
    files: ['api/**/*.{ts,mts}', 'scripts/**/*.mjs', '*.{mjs,cjs}', 'web/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
  { files: ['web/src/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },
  {
    plugins: { balcao },
    files: [...CODIGO_API, ...CODIGO_WEB],
    ignores: [...CONFIG_API, ...CONFIG_WEB],
    rules: {
      'balcao/env-so-em-config': 'error',
      'balcao/sem-endereco-fixo': 'error',
    },
  },
])
