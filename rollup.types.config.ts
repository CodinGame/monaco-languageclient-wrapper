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
    if (/^proxy-polyfill/.test(source)) {
      return true
    }
    // Force include all types from vscode-* libs (vscode-languageclient, vscode-languageserver-protocol....)
    if (/^vscode-/.test(source)) {
      return false
    }
    return externals.some(external => source.startsWith(external))
  },
  plugins: [
    {
      // Remove "declare module 'vscode'" from vscode type
      // Or else dts plugin is unable to extract types from it
      name: 'remove-vscode-declare-module',
      transform: (code, id) => {
        if (id.endsWith('@types/vscode/index.d.ts')) {
          const lines = code.split('\n')
          let index = lines.indexOf('declare module \'vscode\' {')
          lines.splice(index, 1)
          if (index >= 0) {
            let end = false
            while (!end) {
              if (lines[index] === '}') {
                lines.splice(index, 1)
                end = true
              } else {
                // unindent
                lines[index] = lines[index].slice(4)
              }
              index++
            }
          }
          return lines.join('\n')
        }
        return code
      }
    },
    dts({
      respectExternal: true
    })
  ]
})
