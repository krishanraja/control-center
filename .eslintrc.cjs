module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: { browser: true, node: true, es2022: true },
  plugins: ['@typescript-eslint', 'react-hooks'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
  },
  ignorePatterns: [
    'dist',
    'node_modules',
    '.vercel',
    'public',
    '*.config.*',
    'vite.config.ts',
    'postcss.config.js',
    'tailwind.config.js',
  ],
}
