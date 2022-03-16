import { PluginImpl } from 'rollup'

const plugin: PluginImpl<{}> = () => {
  return {
    // Remove "declare module 'vscode'" from vscode type
    // Or else dts plugin is unable to extract types from it
    name: 'remove-vscode-declare-module',
    transform (code, id) {
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

  }
}

export default plugin
