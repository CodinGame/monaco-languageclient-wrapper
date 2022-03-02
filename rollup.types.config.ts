import * as rollup from 'rollup'
import dts from 'rollup-plugin-dts'
import pkg from './package.json'

const externals = [
  ...Object.keys(pkg.dependencies),
  'monaco-editor'
]

export default rollup.defineConfig({
  input: './dist/types/index.d.ts',
  output: [{ file: 'dist/index.d.ts', format: 'es' }],
  external: function isExternal (source, importer, isResolved) {
    if (isResolved) {
      return false
    }
    // Do not include types that rollup-plugin-dts fails to parse
    if (/^vscode$|proxy-polyfill/.test(source)) {
      return true
    }
    // Force include all types from vscode-* libs (vscode-languageclient, vscode-languageserver-protocol....)
    if (/^vscode-/.test(source)) {
      return false
    }
    return externals.some(external => source.startsWith(external))
  },
  plugins: [
    dts({
      respectExternal: true
    })
  ]
})
