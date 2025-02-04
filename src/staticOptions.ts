import * as vscode from 'vscode'
import { Middleware } from 'vscode-languageclient'
import type { LanguageClientOptions } from './languageClientOptions'

type LanguageClientOptionsById<T extends string> = Record<T, LanguageClientOptions>
const asLanguageClientOptionsById = <K extends string>(
  options: LanguageClientOptionsById<K>
): LanguageClientOptionsById<K> => options

const clangdHotfixMiddleware: Middleware = {
  async provideCompletionItem(document, position, context, token, next) {
    const list = await next(document, position, context, token)
    // Hotfix (see https://github.com/clangd/vscode-clangd/blob/df56a9a058fca773eb4c096d0f6a5a31b71b79d7/src/clangd-context.ts#L124)
    const items = Array.isArray(list) ? list : list?.items
    if (items != null) {
      for (const item of items) {
        item.commitCharacters = []
      }
    }
    return list
  }
}

const staticOptions = asLanguageClientOptionsById({
  angular: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.ts'
      }
    ],
    mutualizable: true
  },
  bash: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.bash'
      }
    ],
    mutualizable: true,
    maxInitializeDuration: 1000
  },
  c: {
    documentSelector: [
      { scheme: 'file', language: 'c' },
      { scheme: 'file', language: 'cpp' }
    ],
    middleware: clangdHotfixMiddleware,
    mutualizable: false
  },
  csharp: {
    documentSelector: [{ scheme: 'file', language: 'csharp' }],
    mutualizable: true,
    middleware: {
      async provideDefinition(document, position, token, next) {
        const definition = await next(document, position, token)
        // Transform file:/$metadata$/... uris to omnisharp-metadata:/... so we can register a text document content provider
        // See https://github.com/OmniSharp/omnisharp-roslyn/issues/2238
        if (definition != null && !Array.isArray(definition)) {
          const metadataMatch = /^\/\$metadata\$(.*)$/.exec(definition.uri.fsPath)
          if (metadataMatch != null) {
            return {
              ...definition,
              uri: vscode.Uri.from({ scheme: 'omnisharp-metadata', path: metadataMatch[1] })
            }
          }
        }
        return definition
      }
    },
    async createAdditionalFeatures(client) {
      const { CsharpExtensionFeature } = await import('./extensions/csharp')
      return [new CsharpExtensionFeature(client)]
    }
  },
  cpp: {
    documentSelector: [
      { scheme: 'file', language: 'c' },
      { scheme: 'file', language: 'cpp' },
      { scheme: 'file', language: 'cuda-cpp' }
    ],
    middleware: clangdHotfixMiddleware,
    mutualizable: false
  },
  clojure: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.clj',
        language: 'clojure'
      }
    ],
    mutualizable: true
  },
  cobol: {
    documentSelector: [{ scheme: 'file', language: 'COBOL' }],
    synchronize: {
      configurationSection: 'cobol-lsp'
    },
    mutualizable: false,
    defaultConfigurationOverride: {
      'cobol-lsp.subroutine-manager.paths-local': ['/tmp/project']
    },
    async createAdditionalFeatures(client) {
      const { CobolResolveSubroutineFeature } = await import('./extensions/cobol')
      return [new CobolResolveSubroutineFeature(client)]
    }
  },
  dart: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.dart',
        language: 'dart'
      }
    ],
    mutualizable: true
  },
  go: {
    documentSelector: [
      { language: 'go', scheme: 'file' },
      { language: 'go.mod', scheme: 'file' },
      { language: 'go.sum', scheme: 'file' },
      { language: 'go.work', scheme: 'file' },
      { language: 'tmpl', scheme: 'file' }
    ],
    mutualizable: true,
    defaultConfigurationOverride: {
      gopls: {
        'ui.navigation.importShortcut': 'Definition'
      }
    }
  },
  groovy: {
    documentSelector: [{ scheme: 'file', language: 'groovy' }],
    synchronize: {
      configurationSection: 'groovy'
    },
    mutualizable: true
  },
  java: {
    documentSelector: [
      { scheme: 'file', language: 'java' },
      { scheme: 'jdt', language: 'java' },
      { scheme: 'untitled', language: 'java' }
    ],
    synchronize: {
      configurationSection: ['java', 'editor.insertSpaces', 'editor.tabSize']
    },
    mutualizable: true,
    async createAdditionalFeatures(client) {
      const { JavaExtensionFeature } = await import('./extensions/java')
      return [new JavaExtensionFeature(client)]
    },
    initializationOptions: {
      extendedClientCapabilities: {
        classFileContentsSupport: true,
        overrideMethodsPromptSupport: true,
        hashCodeEqualsPromptSupport: true,
        advancedOrganizeImportsSupport: true,
        generateToStringPromptSupport: true,
        advancedGenerateAccessorsSupport: true,
        generateConstructorsPromptSupport: true,
        generateDelegateMethodsPromptSupport: true
      }
    }
  },
  javascript: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.{js}',
        language: 'javascript'
      },
      {
        scheme: 'file',
        pattern: '**/**.{js,jsx}',
        language: 'javascript'
      },
      {
        scheme: 'file',
        pattern: '**/*.{ts}',
        language: 'typescript'
      }
    ],
    mutualizable: true
  },
  kotlin: {
    // https://github.com/fwcd/vscode-kotlin/blob/db5916080868a6a8e064c60d49624926c2fa61bd/src/languageSetup.ts#L104
    documentSelector: [
      { language: 'kotlin', scheme: 'file' },
      { language: 'kotlin', scheme: 'kls' }
    ],
    synchronize: {
      configurationSection: 'kotlin'
    },
    mutualizable: false,
    maxInitializeDuration: 60_000
  },
  lua: {
    documentSelector: [{ scheme: 'file', language: 'lua' }],
    synchronize: {
      configurationSection: 'Lua'
    },
    mutualizable: true,
    defaultConfigurationOverride: {
      'Lua.runtime.version': 'Lua 5.4',
      'Lua.diagnostics.enable': true,
      'Lua.diagnostics.disable': ['lowercase-global']
    }
  },
  mysql: {
    documentSelector: [
      {
        scheme: 'file',
        language: 'sql'
      }
    ],
    // Disable code actions
    middleware: {
      provideCodeActions() {
        return []
      }
    },
    mutualizable: false
  },
  ocaml: {
    documentSelector: [
      {
        scheme: 'file',
        language: 'ocaml'
      }
    ],
    mutualizable: false
  },
  'objective-c': {
    documentSelector: [
      { scheme: 'file', language: 'c' },
      { scheme: 'file', language: 'cpp' },
      { scheme: 'file', language: 'objective-c' }
    ],
    middleware: clangdHotfixMiddleware,
    mutualizable: false
  },
  'php-serenata': {
    // https://gitlab.com/Serenata/visual-studio-code-client/-/blob/master/src/extension.ts#L120
    documentSelector: [
      {
        pattern: '**/*.php',
        scheme: 'file'
      }
    ],
    synchronize: {
      configurationSection: 'serenata'
    },
    initializationOptions: () => ({
      configuration: {
        uris: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.toString()),
        phpVersion: 7.3,
        fileExtensions: ['php'],
        indexDatabaseUri: 'file:///tmp/index.sqlite',
        excludedPathExpressions: ['file:///opt/serenata']
      }
    }),
    mutualizable: true
  },
  php: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.php',
        language: 'php'
      }
    ],
    mutualizable: true
  },
  postgresql: {
    documentSelector: [
      {
        scheme: 'file',
        language: 'postgres'
      }
    ],
    // Disable code actions
    middleware: {
      provideCodeActions() {
        return []
      }
    },
    mutualizable: false
  },
  python: {
    documentSelector: [{ scheme: 'file', language: 'python' }],
    synchronize: {
      configurationSection: 'python'
    },
    mutualizable: true
  },
  r: {
    // https://github.com/REditorSupport/vscode-R/blob/96ed4740101d8cd82f908b415df1dd205b4be824/src/languageService.ts#L186
    documentSelector: [
      { scheme: 'file', language: 'r' },
      { scheme: 'file', language: 'rmd' }
    ],
    synchronize: {
      configurationSection: 'r.lsp'
    },
    mutualizable: true,
    defaultConfigurationOverride: {
      'r.lsp.diagnostics': false
    }
  },
  react: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.{tsx,jsx}'
      }
    ],
    synchronize: {},
    mutualizable: true
  },
  ruby: {
    // https://github.com/castwide/vscode-solargraph/blob/3ebd9241f013305a84ec64334fca45b487bde904/src/language-client.ts#L56
    documentSelector: [{ scheme: 'file', language: 'ruby' }],
    mutualizable: true,
    defaultConfigurationOverride: {
      'solargraph.diagnostics': true,
      'solargraph.formatting': true
    },
    synchronize: {
      configurationSection: 'solargraph'
    }
  },
  rust: {
    // https://github.com/rust-lang/vscode-rust/blob/b1ae67b06640ffab6e1ebb72e07364b4477dfbf1/rust-analyzer/editors/code/src/client.ts#L42
    documentSelector: [{ scheme: 'file', language: 'rust' }],
    mutualizable: false
  },
  scala: {
    documentSelector: [{ scheme: 'file', language: 'scala' }],
    synchronize: {
      configurationSection: 'metals'
    },
    mutualizable: false,
    maxInitializeDuration: 60_000,
    readinessMessageMatcher: /compiled scala-project in/
  },
  sql: {
    documentSelector: [
      {
        scheme: 'file',
        language: 'sql'
      }
    ],
    // Disable code actions
    middleware: {
      provideCodeActions() {
        return []
      }
    },
    mutualizable: false
  },
  swift: {
    documentSelector: [{ scheme: 'file', language: 'swift' }],
    synchronize: {},
    mutualizable: true
  },
  typescript: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.{ts}',
        language: 'typescript'
      }
    ],
    synchronize: {},
    mutualizable: true
  },
  verilog: {
    documentSelector: [
      {
        scheme: 'file',
        language: 'verilog'
      }
    ],
    mutualizable: false,
    defaultConfigurationOverride: {
      'systemverilog.linter': 'icarus',
      'systemverilog.launchConfiguration': 'iverilog -g2012 -t null'
    }
  },
  vue: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.js',
        language: 'javascript'
      },
      {
        scheme: 'file',
        pattern: '**/*.{ts}',
        language: 'typescript'
      }
    ],
    synchronize: {},
    mutualizable: true
  }
})

export type StaticLanguageClientId = keyof typeof staticOptions

export default staticOptions
