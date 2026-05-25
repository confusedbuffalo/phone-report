import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
    js.configs.recommended,
    eslintConfigPrettier, // This disables ESLint styling rules that conflict with Prettier
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                OSM: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-console': 'off',
        },
    },
];
