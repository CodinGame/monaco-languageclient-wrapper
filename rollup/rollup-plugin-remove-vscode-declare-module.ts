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
        if (index < 0) throw new Error('Module declaration not found')

        lines.splice(index, 1)
        for (; lines[index] !== '}'; index++) {
          // unindent
          lines[index] = lines[index]!.slice(4)
        }
        lines.splice(index, 1)

        return lines.join('\n')
      }
      return code
    }

  }
}

export default plugin
