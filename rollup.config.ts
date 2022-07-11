import visualizer from 'rollup-plugin-visualizer'
import commonjs from '@rollup/plugin-commonjs'
import alias from '@rollup/plugin-alias'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import eslint from '@rollup/plugin-eslint'
import { babel } from '@rollup/plugin-babel'
import * as rollup from 'rollup'
import * as recast from 'recast'
import path from 'path'
import pkg from './package.json'

const PURE_ANNO = '#__PURE__'
const EXTENSION_DIR = path.resolve(__dirname, 'extensions')

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
  treeshake: {
    annotations: true,
    moduleSideEffects: false
  },
  external: function isExternal (source, importer, isResolved) {
    if (isResolved) {
      return false
    }
    if (source.startsWith('extensions/')) {
      return false
    }
    if (externals.some(external => source === external || source.startsWith(`${external}/`))) {
      return true
    }
    return false
  },
  output: [{
    chunkFileNames: '[name].js',
    hoistTransitiveImports: false,
    dir: 'dist',
    format: 'esm',
    paths: {
      'monaco-editor': 'monaco-editor/esm/vs/editor/editor.api',
      'monaco-editor-core': 'monaco-editor/esm/vs/editor/editor.api'
    }
  }],
  plugins: [
    eslint({
      throwOnError: true,
      throwOnWarning: true,
      include: ['**/*.ts']
    }),
    nodeResolve({
      extensions,
      browser: true
    }),
    {
      name: 'resolve-extensions',
      resolveId (id) {
        if (id.startsWith('extensions/')) {
          return path.resolve(__dirname, `${id}.js`)
        }
        return undefined
      }
    },
    commonjs({
      esmExternals: (id) => {
        if (id === 'vscode') {
          return true
        }
        if (id.match(/^vscode-languageserver-protocol(\/.*)?/) != null) {
          return true
        }
        return false
      }
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
        replacement: 'monaco-editor/esm/vs/editor/editor.api'
      }, {
        find: /^(monaco-editor|monaco-editor-core)$/,
        replacement: 'monaco-editor/esm/vs/editor/editor.api'
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
    },
    {
      name: 'improve-extension-treeshaking',
      transform (code, id) {
        if (id.startsWith(EXTENSION_DIR)) {
          const ast = recast.parse(code, {
            parser: require('recast/parsers/babylon')
          })
          let transformed: boolean = false
          function addComment (node: recast.types.namedTypes.Expression) {
            if (!(node.comments ?? []).some(comment => comment.value === PURE_ANNO)) {
              transformed = true
              node.comments = [recast.types.builders.commentBlock(PURE_ANNO, true)]
            }
          }
          recast.visit(ast.program.body, {
            visitNewExpression (path) {
              const node = path.node
              if (node.callee.type === 'Identifier') {
                addComment(node)
              }
              this.traverse(path)
            },
            visitCallExpression (path) {
              const node = path.node
              if (node.callee.type === 'Identifier') {
                addComment(node)
              } else if (node.callee.type === 'FunctionExpression') {
                // Mark IIFE as pure, because typescript compile enums as IIFE
                addComment(node)
              }
              this.traverse(path)
              return undefined
            },
            visitFunctionDeclaration () {
              // Do not treeshake code inside functions, only at root
              return false
            },
            visitThrowStatement () {
              return false
            }
          })
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (transformed) {
            code = recast.print(ast).code
            code = code.replace(/\/\*#__PURE__\*\/\s+/g, '/*#__PURE__*/ ') // Remove space after PURE comment
            return code
          }
        }
        return undefined
      }
    }
  ]
})
