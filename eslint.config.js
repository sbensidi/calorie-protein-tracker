import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // React Compiler experimental rules — disabled: the project does not use
      // the React Compiler. These rules produce false positives on valid patterns
      // (e.g. useEffect triggering a fetch that internally calls setState, or
      // sub-components defined inside a parent for co-location readability).
      'react-hooks/set-state-in-effect':         'off',
      'react-hooks/purity':                      'off',
      'react-hooks/static-components':           'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability':                'off',
      // Allow _-prefixed names as intentionally unused (e.g. _init, _err)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
])
