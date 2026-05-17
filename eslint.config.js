import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
    js.configs.recommended,
    eslintConfigPrettier, // This disables ESLint styling rules that conflict with Prettier
    {
        rules: {
            'no-unused-vars': 'warn',
            'no-console': 'off',
        },
    },
];
