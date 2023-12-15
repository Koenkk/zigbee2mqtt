
module.exports = {
    'env': {
        'jest/globals': true,
        'es6': true,
        'node': true,
    },
    'extends': ['eslint:recommended', 'google', 'plugin:jest/recommended', 'plugin:jest/style'],
    'parserOptions': {
        'ecmaVersion': 2018,
        'sourceType': 'module',
    },
    'rules': {
        'require-jsdoc': 'off',
        'indent': ['error', 4],
        'max-len': ['error', {'code': 120}],
        'no-prototype-builtins': 'off',
        'linebreak-style': ['error', (process.platform === 'win32' ? 'windows' : 'unix')], // https://stackoverflow.com/q/39114446/2771889
    },
    'plugins': [
        'jest',
    ],
    'overrides': [{
        files: ['*.ts'],
        parser: '@typescript-eslint/parser',
        plugins: ['@typescript-eslint'],
        extends: ['plugin:@typescript-eslint/recommended'],
        parserOptions: {
            project: './tsconfig.json',
        },
        rules: {
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/explicit-function-return-type': 'error',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': 'error',
            '@typescript-eslint/semi': ['error'],
            'array-bracket-spacing': ['error', 'never'],
            'indent': ['error', 4],
            'max-len': ['error', {'code': 120}],
            'no-return-await': 'error',
            'object-curly-spacing': ['error', 'never'],
        },
    }],
};
