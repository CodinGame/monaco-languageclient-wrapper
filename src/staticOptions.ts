import { Services } from 'monaco-languageclient'
import type { LanguageClientOptions } from './languageClientOptions'

type LanguageClientOptionsById<T extends string> = Record<T, LanguageClientOptions>
const asLanguageClientOptionsById = <K extends string> (options: LanguageClientOptionsById<K>): LanguageClientOptionsById<K> => options

const staticOptions = asLanguageClientOptionsById({
  angular: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.ts'
      }
    ],
    mutualizable: true,
    vscodeExtensionIds: ['typescript-language-features', 'angular']
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
    mutualizable: false
    // The extension is cpptools BUT the language server is unable to use the client configuration (it requires client code)
    // vscodeExtensionIds: ['cpptools']
  },
  csharp: {
    documentSelector: [
      { language: 'csharp' }
    ],
    mutualizable: true,
    vscodeExtensionIds: ['omnisharp']
  },
  cpp: {
    documentSelector: [
      { scheme: 'file', language: 'c' },
      { scheme: 'file', language: 'cpp' },
      { scheme: 'file', language: 'cuda-cpp' }
    ],
    mutualizable: false
    // The extension is cpptools BUT the language server is unable to use the client configuration (it requires client code)
    // vscodeExtensionIds: ['cpptools']
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
    documentSelector: ['COBOL'],
    synchronize: {
      configurationSection: 'cobol-lsp'
    },
    mutualizable: false,
    vscodeExtensionIds: ['cobol']
  },
  dart: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.dart',
        language: 'dart'
      }
    ],
    mutualizable: true,
    vscodeExtensionIds: ['dart']
  },
  go: {
    documentSelector: [
      { language: 'go', scheme: 'file' },
      { language: 'go.mod', scheme: 'file' },
      { language: 'go.sum', scheme: 'file' },
      { language: 'go.work', scheme: 'file' },
      { language: 'tmpl', scheme: 'file' }
    ],
    mutualizable: true
  },
  groovy: {
    documentSelector: [
      { scheme: 'file', language: 'groovy' }
    ],
    synchronize: {
      configurationSection: 'groovy'
    },
    mutualizable: true,
    vscodeExtensionIds: ['vscode-groovy']
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
    vscodeExtensionIds: ['java']
  },
  javascript: {
    documentSelector: [
      {
        pattern: '**/*.{js}',
        language: 'javascript'
      },
      {
        pattern: '**/**.{js,jsx}',
        language: 'javascript'
      }
    ],
    mutualizable: true,
    vscodeExtensionIds: ['typescript-language-features']
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
    documentSelector: [
      { scheme: 'file', language: 'lua' }
    ],
    synchronize: {
      configurationSection: 'Lua'
    },
    mutualizable: true,
    vscodeExtensionIds: ['lua']
  },
  mysql: {
    documentSelector: [{
      language: 'sql'
    }],
    // Disable code actions
    middleware: {
      provideCodeActions () {
        return []
      }
    },
    mutualizable: false
  },
  ocaml: {
    documentSelector: [{
      scheme: 'file',
      language: 'ocaml'
    }],
    mutualizable: false
  },
  'objective-c': {
    documentSelector: [
      { scheme: 'file', language: 'c' },
      { scheme: 'file', language: 'cpp' },
      { scheme: 'file', language: 'objective-c' }
    ],
    mutualizable: false
    // The extension is cpptools BUT the language server is unable to use the client configuration (it requires client code)
    // vscodeExtensionIds: ['cpptools']
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
        uris: [
          Services.get().workspace.rootUri
        ],
        phpVersion: 7.3,
        fileExtensions: [
          'php'
        ],
        indexDatabaseUri: 'file:///tmp/index.sqlite',
        excludedPathExpressions: [
          'file:///opt/serenata'
        ]
      }
    }),
    mutualizable: true
  },
  php: {
    documentSelector: [
      {
        pattern: '**/*.php',
        language: 'php'
      }
    ],
    mutualizable: true
  },
  postgresql: {
    documentSelector: [{
      language: 'postgres'
    }],
    // Disable code actions
    middleware: {
      provideCodeActions () {
        return []
      }
    },
    mutualizable: false
  },
  python: {
    documentSelector: [
      { language: 'python' }
    ],
    synchronize: {
      configurationSection: 'python'
    },
    mutualizable: true,
    vscodeExtensionIds: ['vscode-python']
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
    vscodeExtensionIds: ['vscode-R']
  },
  react: {
    documentSelector: [
      {
        pattern: '**/*.{tsx,jsx}'
      }
    ],
    synchronize: {},
    mutualizable: true,
    vscodeExtensionIds: ['typescript-language-features']
  },
  ruby: {
    // https://github.com/castwide/vscode-solargraph/blob/3ebd9241f013305a84ec64334fca45b487bde904/src/language-client.ts#L56
    documentSelector: [
      { scheme: 'file', language: 'ruby' }
    ],
    mutualizable: true,
    vscodeExtensionIds: ['solargraph'],
    synchronize: {
      configurationSection: 'solargraph'
    }
  },
  rust: {
    // https://github.com/rust-lang/vscode-rust/blob/b1ae67b06640ffab6e1ebb72e07364b4477dfbf1/rust-analyzer/editors/code/src/client.ts#L42
    documentSelector: [
      { scheme: 'file', language: 'rust' }
    ],
    mutualizable: false
  },
  scala: {
    documentSelector: [
      { scheme: 'file', language: 'scala' }
    ],
    synchronize: {
      configurationSection: 'metals'
    },
    mutualizable: false,
    vscodeExtensionIds: ['scalameta'],
    maxInitializeDuration: 60_000,
    readinessMessageMatcher: /compiled scala-project in/
  },
  sql: {
    documentSelector: [
      {
        language: 'sql'
      }
    ],
    // Disable code actions
    middleware: {
      provideCodeActions () {
        return []
      }
    },
    mutualizable: false
  },
  swift: {
    // https://github.com/apple/sourcekit-lsp/blob/59b5e68f7f8408b5bc44bd47f71ef1afdc63e7a6/Editors/vscode/src/extension.ts#L22
    documentSelector: [
      'swift',
      'cpp',
      'c',
      'objective-c',
      'objective-cpp'
    ],
    synchronize: {},
    mutualizable: true
  },
  typescript: {
    documentSelector: [
      {
        pattern: '**/*.{ts}',
        language: 'typescript'
      }
    ],
    synchronize: {},
    mutualizable: true,
    vscodeExtensionIds: ['typescript-language-features']
  },
  verilog: {
    documentSelector: [
      {
        language: 'verilog'
      }
    ],
    mutualizable: false,
    vscodeExtensionIds: ['svlangserver']
  },
  vue: {
    documentSelector: [
      {
        pattern: '**/*.js',
        language: 'javascript'
      }
    ],
    synchronize: {},
    mutualizable: true,
    vscodeExtensionIds: ['typescript-language-features']
  }
})

export type StaticLanguageClientId = keyof typeof staticOptions

export default staticOptions
