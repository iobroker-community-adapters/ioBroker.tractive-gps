import config from '@iobroker/eslint-config';

export default [
    {
        ignores: [
            'admin/build/**',
            'build/**',
            'coverage/**',
            '**/*.d.ts',
            'node_modules/**',
            'www/**',
            'src/old Main.ts',
        ],
    },
    ...config,
    {
        rules: {
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-use-before-define': 'off',
            'jsdoc/no-blank-blocks': 'off',
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/require-param-description': 'off',
        },
    },
];
