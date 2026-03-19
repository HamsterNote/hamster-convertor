import reactConfig from '@system-ui-js/development-base/eslint.react.config.js'

// 复用 development-base 提供的 React Flat 配置
export default [
  {
    ignores: [
      'dist/**',
      'build/**',
      'coverage/**',
      'node_modules/**',
      '.yalc/**',
      '*.config.cjs',
      '*.min.js'
    ]
  },
  ...reactConfig
]
