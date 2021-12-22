import * as monaco from 'monaco-editor'
import {
  CloseAction, ErrorAction, Disposable, MonacoLanguageClient, Emitter, Event, DocumentSelector, TextDocument, Services, State, HandleDiagnosticsSignature
} from '@codingame/monaco-languageclient'
import delay from 'delay'
import type * as vscode from 'vscode'
import { Uri } from 'monaco-editor'
import { registerTextModelContentProvider } from '@codingame/monaco-editor-wrapper'
import { installServices, updateConfiguration } from './services'
import createLanguageClient from './createLanguageClient'
import { getFile } from './customRequests'

type Status = {
  type: string
  message: string
}

export interface LanguageClient {
  sendNotification (method: string, params: unknown): void
  sendRequest<R> (method: string, params: unknown): Promise<R>
}

export interface StatusChangeEvent {
  status: Status
}

export interface LanguageServerConfig {
  language: string
  documentSelector: DocumentSelector
  configurationSection?: string
  configuration?: unknown
  initializationOptions?: unknown | (() => unknown)
}

export class LanguageClientManager implements LanguageClient {
  languageClient?: MonacoLanguageClient
  protected readonly onDidChangeStatusEmitter = new Emitter<StatusChangeEvent>()
  protected readonly onErrorEmitter = new Emitter<Error>()
  protected readonly onWillCloseEmitter = new Emitter<void>()
  protected currentStatus?: Status

  constructor (
    private languageServerUrl: string,
    private getSecurityToken: () => Promise<string>,
    private languageServerConfig: LanguageServerConfig,
    private libraryUrls: string[]
  ) {
  }

  private updateStatus (status: Status) {
    this.currentStatus = status
    this.notifyStatusChanged()
  }

  private notifyStatusChanged () {
    if (this.currentStatus != null) {
      this.onDidChangeStatusEmitter.fire({
        status: this.currentStatus
      })
    }
  }

  isReady (): boolean {
    return this.currentStatus?.type === 'ready'
  }

  async dispose (): Promise<void> {
    this.onWillCloseEmitter.fire()
    if (this.languageClient != null) {
      const languageClient = this.languageClient
      this.languageClient = undefined
      await languageClient.stop()
    }
  }

  get onDidChangeStatus (): Event<StatusChangeEvent> {
    return this.onDidChangeStatusEmitter.event
  }

  get onWillClose (): Event<void> {
    return this.onWillCloseEmitter.event
  }

  get onError (): Event<Error> {
    return this.onErrorEmitter.event
  }

  isModelManaged (document: TextDocument): boolean {
    return Services.get().languages.match(this.languageServerConfig.documentSelector, document)
  }

  isDisposed (): boolean {
    return this.languageClient == null
  }

  private handleClose = () => {
    if (this.isDisposed()) {
      return CloseAction.DoNotRestart
    }

    return CloseAction.Restart
  }

  private handleError = (error: Error) => {
    this.onErrorEmitter.fire(error)
    this.updateStatus({ type: 'error', message: error.message })

    return ErrorAction.Continue
  }

  start (): void {
    const onServerResponse = new Emitter<void>()

    const languageClient = createLanguageClient(
      this.languageServerConfig,
      this.languageServerUrl,
      this.getSecurityToken,
      this.libraryUrls, {
        error: this.handleError,
        closed: this.handleClose
      }, {
        handleDiagnostics: (uri: Uri, diagnostics: vscode.Diagnostic[], next: HandleDiagnosticsSignature) => {
          next(uri, diagnostics)
          onServerResponse.fire()
        },
        provideCodeActions: async (document, range, context, token, next) => {
          try {
            return await next(document, range, context, token)
          } finally {
            onServerResponse.fire()
          }
        },
        provideDocumentRangeSemanticTokens: async (document, range, token, next) => {
          try {
            return await next(document, range, token)
          } finally {
            onServerResponse.fire()
          }
        },
        provideDocumentSemanticTokens: async (document, token, next) => {
          try {
            return await next(document, token)
          } finally {
            onServerResponse.fire()
          }
        },
        handleWorkDoneProgress: async (token, params, next) => {
          next(token, params)
          if (params.kind === 'end') {
            onServerResponse.fire()
          }
        },
        provideHover: async (document, position, token, next) => {
          try {
            return await next(document, position, token)
          } finally {
            onServerResponse.fire()
          }
        }
      })
    this.languageClient = languageClient

    let readyPromise: Promise<void> | null = null
    languageClient.onDidChangeState(async (state) => {
      switch (state.newState) {
        case State.Starting: {
          this.updateStatus({ type: 'connecting', message: 'Connecting language server...' })
          readyPromise = languageClient.onReady().then(async () => {
            let disposable: Disposable | null = null
            await Promise.race([
              new Promise<void>(resolve => {
                disposable = onServerResponse.event(resolve)
              }),
              delay(15000)
            ])
            disposable!.dispose()
          }, error => {
            console.error('[LSP]', 'Error while waiting for the language client to be ready', error)
          })
          break
        }
        case State.Running: {
          this.updateStatus({ type: 'connected', message: 'Connected to language server' })

          await readyPromise

          this.updateStatus({ type: 'ready', message: 'Language server ready' })
          break
        }
        case State.Stopped: {
          this.updateStatus({ type: 'closed', message: 'Connection closed' })
          break
        }
      }
    })

    this.languageClient.start()
  }

  sendNotification (method: string, params: unknown): void {
    this.languageClient!.sendNotification(method, params)
  }

  sendRequest<R> (method: string, params: unknown): Promise<R> {
    return this.languageClient!.sendRequest<R>(method, params)
  }
}

const languageClientManagerByLanguageId: Partial<Record<string, LanguageClientManager>> = {}

function createLanguageClientManager (
  languageServerUrl: string,
  getSecurityToken: () => Promise<string>,
  languageServerConfig: LanguageServerConfig,
  libraryUrls: string[]
): LanguageClientManager {
  if (languageClientManagerByLanguageId[languageServerConfig.language] != null) {
    throw new Error(`Language client for language ${languageServerConfig.language} already started`)
  }
  installServices()

  const languageClientManager = new LanguageClientManager(languageServerUrl, getSecurityToken, languageServerConfig, libraryUrls)
  languageClientManagerByLanguageId[languageServerConfig.language] = languageClientManager

  const textModelContentProviderDisposable = registerTextModelContentProvider('file', {
    async provideTextContent (resource: Uri): Promise<monaco.editor.ITextModel | null> {
      try {
        const content = (await getFile(resource.toString(true), languageClientManager)).text
        return monaco.editor.createModel(content, undefined, resource)
      } catch (error) {
        // file not found
        return null
      }
    }
  })

  languageClientManager.onWillClose(() => {
    delete languageClientManagerByLanguageId[languageServerConfig.language]
    textModelContentProviderDisposable.dispose()
  })

  return languageClientManager
}

function getAllLanguageClientManagers (): LanguageClientManager[] {
  return Object.values(languageClientManagerByLanguageId) as LanguageClientManager[]
}

function getAllLanguageClientManagersByTextDocument (textDocument: TextDocument): LanguageClientManager[] {
  return getAllLanguageClientManagers().filter(manager => manager.isModelManaged(textDocument))
}

export {
  createLanguageClientManager,
  getAllLanguageClientManagers,
  getAllLanguageClientManagersByTextDocument
}
