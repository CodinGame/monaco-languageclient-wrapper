declare module 'rollup-plugin-dts' {
  import type { PluginImpl } from 'rollup'
  import type { CompilerOptions } from 'typescript'

  interface Options {
    respectExternal?: boolean
    includeExternal?: string[]
    compilerOptions?: CompilerOptions
    tsconfig?: string
    sourcemap?: boolean
  }

  const plugin: PluginImpl<Options>

  export { plugin as default, plugin as dts }
  export type { Options }
}
