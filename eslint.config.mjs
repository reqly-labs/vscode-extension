import stylistic from '@stylistic/eslint-plugin';
import typescriptEslint from 'typescript-eslint';

export default [
    {
        files: ['**/*.ts'],
    },
    {
        plugins: {
            '@typescript-eslint': typescriptEslint.plugin,
            '@stylistic': stylistic,
        },

        languageOptions: {
            parser: typescriptEslint.parser,
            ecmaVersion: 2022,
            sourceType: 'module',
        },

        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase'],
                },
            ],

            '@stylistic/lines-between-class-members': [
                'warn',
                'always',
                { exceptAfterSingleLine: true },
            ],

            '@stylistic/padding-line-between-statements': [
                'warn',
                { blankLine: 'always', prev: 'import', next: '*' },
                { blankLine: 'any', prev: 'import', next: 'import' },
                { blankLine: 'always', prev: '*', next: 'return' },
                { blankLine: 'always', prev: 'block-like', next: '*' },
                { blankLine: 'always', prev: ['const', 'let'], next: '*' },
                { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: ['function', 'class', 'interface', 'type', 'export'],
                },
                {
                    blankLine: 'always',
                    prev: ['function', 'class', 'interface', 'type', 'export'],
                    next: '*',
                },
            ],

            curly: 'warn',
            eqeqeq: 'warn',
            'no-throw-literal': 'warn',
            semi: 'warn',
        },
    },
];
