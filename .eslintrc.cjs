module.exports = {
  env: {
    browser: true,
    es6: true,
    jest: true
  },
  extends: [
    '@codingame'
  ],
  plugins: [
    '@typescript-eslint',
    'unused-imports',
    'import',
    'jest'
  ],
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error', 'debug', 'info'] }]
  }
}
