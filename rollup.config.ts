import visualizer from 'rollup-plugin-visualizer'
import commonjs from '@rollup/plugin-commonjs'
import alias from '@rollup/plugin-alias'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import eslint from '@rollup/plugin-eslint'
import { babel } from '@rollup/plugin-babel'
import * as rollup from 'rollup'
import builtins from 'rollup-plugin-node-builtins'
import pkg from './package.json'

const externals = [
  ...Object.keys(pkg.dependencies),
  'monaco-editor'
]

const extensions = ['.js', '.ts']

export default rollup.defineConfig({
  cache: false,
  input: {
    index: 'src/index.ts'
  },
  external: function isExternal (source, importer, isResolved) {
    if (isResolved) {
      return false
    }
    if (externals.some(external => source.startsWith(external))) {
      return true
    }
    return false
  },
  output: [{
    chunkFileNames: '[name].js',
    dir: 'dist',
    format: 'esm',
    paths: {
      'monaco-editor': 'monaco-editor/esm/vs/editor/edcore.main',
      'monaco-editor-core': 'monaco-editor/esm/vs/editor/edcore.main'
    }
  }],
  plugins: [
    builtins() as rollup.Plugin,
    eslint({
      throwOnError: true,
      throwOnWarning: true,
      include: ['**/*.ts']
    }),
    nodeResolve({
      extensions
    }),
    commonjs({
      esmExternals: (id) => id.match(/^vscode-languageserver-protocol(\/.*)?/) != null // required for monaco-emacs with use import monaco-editor esm code from commonjs code
    }),
    babel({
      extensions,
      presets: [
        ['@babel/preset-env', {
          modules: false
        }],
        '@babel/preset-typescript'
      ],
      plugins: [
        '@babel/plugin-proposal-class-properties',
        '@babel/plugin-proposal-optional-chaining'
      ],
      babelHelpers: 'bundled',
      exclude: /node_modules\/(?!monaco-languageclient|vscode-languageserver-types|vscode-languageclient)/
    }),
    visualizer(),
    alias({
      entries: [{
        find: /^monaco-editor-core\//,
        replacement: 'monaco-editor/esm/vs/editor/edcore.main'
      }, {
        find: /^(monaco-editor|monaco-editor-core)$/,
        replacement: 'monaco-editor/esm/vs/editor/edcore.main'
      }, {
        find: 'vscode',
        replacement: require.resolve('monaco-languageclient/lib/vscode-compatibility')
      }]
    }),
    {
      name: 'dynamic-import-polyfill',
      renderDynamicImport (): { left: string, right: string } {
        return {
          left: 'import(',
          right: ').then(module => module)'
        }
      }
    }
  ]
})
