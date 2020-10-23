const fs = require('fs')

let config = {
  root: true,
  settings: {
    react: {
      version: 'latest'
    }
  },
  extends: [
    'eslint:recommended',
    'plugin:jest/recommended',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'prettier/@typescript-eslint',
    'prettier/react'
  ],
  plugins: ['@typescript-eslint', 'react', 'jest', 'import', 'prettier'],
  rules: {
    'eol-last': 'warn',
    'no-console': 'warn',
    'no-multiple-empty-lines': ['warn', { max: 1 }],
    'lines-between-class-members': [
      'warn',
      'always',
      { exceptAfterSingleLine: true }
    ],
    'no-unneeded-ternary': 'error',
    'no-nested-ternary': 'warn',
    'prefer-object-spread': 'warn',
    'import/no-default-export': 'error',
    'import/newline-after-import': 'warn',
    'import/order': [
      'warn',
      {
        'newlines-between': 'always',
        groups: [
          'builtin',
          ['internal', 'external'],
          'parent',
          'sibling',
          'index'
        ]
      }
    ]
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: `${__dirname}/tsconfig.eslint.json`,
    // This is the default, likely want to override it for use with an IDE
    createDefaultProgram: false
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        semi: ['error', 'never']
      }
    },
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-member-accessibility': 'off',
        '@typescript-eslint/no-use-before-define': 'warn',
        '@typescript-eslint/indent': ['off', 2],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-parameter-properties': 'off',
        // There are ways around this so ...
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/promise-function-async': 'warn',
        '@typescript-eslint/no-unused-vars': 'warn',
        '@typescript-eslint/restrict-plus-operands': 'warn',
        '@typescript-eslint/no-empty-function': 'warn',
        '@typescript-eslint/ban-types': [
          'warn',
          {
            extendDefaults: true,
            types: {
              Function:
                'its OK to eat functions cause they dont have any feelings'
            }
          }
        ]
      }
    }
  ],
  env: {
    node: true,
    'jest/globals': true
  }
}

if (fs.existsSync(`${__dirname}/.eslintrc.local.js`)) {
  config = require('./.eslintrc.local.js')(config)
}

module.exports = config
