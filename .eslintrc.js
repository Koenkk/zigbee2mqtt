
module.exports = {
    'env': {
        'jest/globals': true,
        'es6': true,
        'node': true,
    },
    'extends': ['eslint:recommended', 'plugin:jest/recommended', 'plugin:jest/style', 'prettier'],
    'parserOptions': {
        'ecmaVersion': 2018,
        'sourceType': 'module',
    },
    'rules': {
        'require-jsdoc': 'off',
        'no-prototype-builtins': 'off',
        '@typescript-eslint/no-floating-promises': 'error',
    },
    'plugins': [
        'jest',
        'perfectionist',
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
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-unused-vars': 'error',
            'no-return-await': 'error',
            "perfectionist/sort-imports": [
                "error",
                {
                  "groups": [
                    "type",
                    [
                      "builtin",
                      "external"
                    ],
                    "internal-type",
                    "internal",
                    [
                      "parent-type",
                      "sibling-type",
                      "index-type"
                    ],
                    [
                      "parent",
                      "sibling",
                      "index"
                    ],
                    "object",
                    "unknown"
                  ],
                  "custom-groups": {
                    "value": {},
                    "type": {}
                  },
                  "newlines-between": "always",
                  "internal-pattern": [
                    "~/**"
                  ],
                  "type": "natural",
                  "order": "asc",
                  "ignore-case": false
                }
              ],
        },
    }],
};
