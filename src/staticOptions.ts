import { DocumentSelector, LanguageClientOptions } from '@codingame/monaco-languageclient'

export interface LanguageServerConfig {
  documentSelector: DocumentSelector
  synchronizeConfigurationSection?: string | string[]
  initializationOptions?: unknown | (() => unknown)
}

export type StaticLanguageClientOptions = Pick<LanguageClientOptions, 'documentSelector' | 'synchronize' | 'initializationOptions' | 'middleware'>

type LanguageClientOptionsById<T extends string> = Record<T, StaticLanguageClientOptions>
const asLanguageClientOptionsById = <K extends string> (options: LanguageClientOptionsById<K>): LanguageClientOptionsById<K> => options

const staticOptions = asLanguageClientOptionsById({
  angular: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.ts'
      }
    ]
  },
  bash: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.bash'
      }
    ]
  },
  c: {
    documentSelector: [
      { scheme: 'file', language: 'c' },
      { scheme: 'file', language: 'cpp' }
    ]
  },
  csharp: {
    documentSelector: [
      { language: 'csharp' }
    ]
  },
  cpp: {
    documentSelector: [
      { scheme: 'file', language: 'c' },
      { scheme: 'file', language: 'cpp' },
      { scheme: 'file', language: 'cuda-cpp' }
    ]
  },
  clojure: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.clj',
        language: 'clojure'
      }
    ]
  },
  cobol: {
    documentSelector: ['COBOL'],
    synchronize: {
      configurationSection: 'cobol-lsp'
    }
  },
  dart: {
    documentSelector: [
      {
        scheme: 'file',
        pattern: '**/*.dart',
        language: 'dart'
      }
    ]
  },
  go: {
    documentSelector: [
      { language: 'go', scheme: 'file' },
      { language: 'go.mod', scheme: 'file' },
      { language: 'go.sum', scheme: 'file' },
      { language: 'go.work', scheme: 'file' },
      { language: 'tmpl', scheme: 'file' }
    ]
  },
  groovy: {
    documentSelector: [
      { scheme: 'file', language: 'groovy' }
    ],
    synchronize: {
      configurationSection: 'groovy'
    }
  },
  java: {
    documentSelector: [
      { scheme: 'file', language: 'java' },
      { scheme: 'jdt', language: 'java' },
      { scheme: 'untitled', language: 'java' }
    ],
    synchronize: {
      configurationSection: ['java', 'editor.insertSpaces', 'editor.tabSize']
    }
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
    ]
  },
  kotlin: {
    // https://github.com/fwcd/vscode-kotlin/blob/db5916080868a6a8e064c60d49624926c2fa61bd/src/languageSetup.ts#L104
    documentSelector: [
      { language: 'kotlin', scheme: 'file' },
      { language: 'kotlin', scheme: 'kls' }
    ],
    synchronize: {
      configurationSection: 'kotlin'
    }
  },
  lua: {
    documentSelector: [
      { scheme: 'file', language: 'lua' }
    ],
    synchronize: {
      configurationSection: 'Lua'
    }
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
    initializationOptions: {
      configuration: {
        uris: [
          'file:///tmp/project'
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
    }
  },
  php: {
    documentSelector: [
      {
        pattern: '**/*.php',
        language: 'php'
      }
    ]
  },
  python: {
    documentSelector: [
      { language: 'python' }
    ],
    synchronize: {
      configurationSection: 'python'
    }
  },
  r: {
    // https://github.com/REditorSupport/vscode-R/blob/96ed4740101d8cd82f908b415df1dd205b4be824/src/languageService.ts#L186
    documentSelector: [
      { scheme: 'file', language: 'r' },
      { scheme: 'file', language: 'rmd' }
    ],
    synchronize: {
      configurationSection: 'r.lsp'
    }
  },
  react: {
    documentSelector: [
      {
        pattern: '**/*.{js,jsx}',
        language: 'javascript'
      }
    ],
    synchronize: {}
  },
  ruby: {
    // https://github.com/rubyide/vscode-ruby/blob/8ba0e01956865a3dbd932279a3d42f7183bcf73a/packages/vscode-ruby-client/src/client.ts#L30
    documentSelector: [
      { scheme: 'file', language: 'ruby' },
      { scheme: 'untitled', language: 'ruby' }
    ]
  },
  rust: {
    // https://github.com/rust-lang/vscode-rust/blob/b1ae67b06640ffab6e1ebb72e07364b4477dfbf1/rust-analyzer/editors/code/src/client.ts#L42
    documentSelector: [
      { scheme: 'file', language: 'rust' }
    ]
  },
  scala: {
    documentSelector: [
      { scheme: 'file', language: 'scala' }
    ],
    synchronize: {
      configurationSection: 'metals'
    }
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
    }
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
    synchronize: {}
  },
  typescript: {
    documentSelector: [
      {
        pattern: '**/*.{ts}',
        language: 'typescript'
      }
    ],
    synchronize: {}
  },
  vue: {
    documentSelector: [
      {
        pattern: '**/*.js',
        language: 'javascript'
      }
    ],
    synchronize: {}
  }
})

export type LanguageClientId = keyof typeof staticOptions

export default staticOptions
