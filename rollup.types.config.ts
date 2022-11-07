import * as rollup from 'rollup'
import dts from 'rollup-plugin-dts'
import pkg from './package.json' assert { type: 'json' }
import removeVscodeDeclareModule from './rollup/rollup-plugin-remove-vscode-declare-module'

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
    if (/^proxy-polyfill/.test(source)) {
      return true
    }
    if (externals.some(external => source === external || source.startsWith(`${external}/`))) {
      return true
    }
    return false
  },
  plugins: [
    removeVscodeDeclareModule(),
    dts({
      respectExternal: true
    })
  ]
})
