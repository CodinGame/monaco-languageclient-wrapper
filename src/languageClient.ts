import * as monaco from 'monaco-editor'
import {
  CloseAction, ErrorAction, Disposable, MonacoLanguageClient, Emitter, Event, TextDocument, Services, State
} from '@codingame/monaco-languageclient'
import delay from 'delay'
import { Uri } from 'monaco-editor'
import { registerTextModelContentProvider } from '@codingame/monaco-editor-wrapper'
import { installServices } from './services'
import createLanguageClient from './createLanguageClient'
import { getFile } from './customRequests'
import staticOptions, { LanguageClientId, StaticLanguageClientOptions } from './staticOptions'
import { WillDisposeFeature, WillShutdownParams } from './extensions'
import { loadExtensionConfigurations } from './extensionConfiguration'

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

export class LanguageClientManager implements LanguageClient {
  languageClient?: MonacoLanguageClient
  private disposed: boolean = false
  protected readonly onDidChangeStatusEmitter = new Emitter<StatusChangeEvent>()
  protected readonly onErrorEmitter = new Emitter<Error>()
  protected readonly onWillCloseEmitter = new Emitter<void>()
  protected readonly onWillShutdownEmitter = new Emitter<WillShutdownParams>()
  protected currentStatus?: Status

  constructor (
    private id: LanguageClientId,
    private sessionId: string | undefined,
    private languageServerAddress: string,
    private getSecurityToken: () => Promise<string>,
    private languageServerOptions: StaticLanguageClientOptions,
    private libraryUrls: string[],
    private useMutualizedProxy: boolean
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
    this.disposed = true
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

  get onWillShutdown (): Event<WillShutdownParams> {
    return this.onWillShutdownEmitter.event
  }

  get onError (): Event<Error> {
    return this.onErrorEmitter.event
  }

  isModelManaged (document: TextDocument): boolean {
    if (this.languageServerOptions.documentSelector == null) {
      return false
    }
    return Services.get().languages.match(this.languageServerOptions.documentSelector, document)
  }

  isDisposed (): boolean {
    return this.disposed
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

  public async start (): Promise<void> {
    try {
      await loadExtensionConfigurations([this.id], this.useMutualizedProxy)
    } catch (error) {
      console.error('Unable to load extension configuration', error)
    }
    if (!this.isDisposed()) {
      this._start()
    }
  }

  private _start (): void {
    const onServerResponse = new Emitter<void>()

    const languageClient = createLanguageClient(
      this.id,
      this.sessionId,
      this.languageServerOptions,
      this.languageServerAddress,
      this.getSecurityToken,
      this.libraryUrls, {
        error: this.handleError,
        closed: this.handleClose
      }, {
        ...(this.languageServerOptions.middleware ?? {}),
        handleDiagnostics: (uri, diagnostics, next) => {
          if (this.languageServerOptions.middleware?.handleDiagnostics != null) {
            this.languageServerOptions.middleware.handleDiagnostics(uri, diagnostics, next)
          } else {
            next(uri, diagnostics)
          }
          onServerResponse.fire()
        },
        provideCodeActions: async (document, range, context, token, next) => {
          try {
            if (this.languageServerOptions.middleware?.provideCodeActions != null) {
              return await this.languageServerOptions.middleware.provideCodeActions(document, range, context, token, next)
            } else {
              return await next(document, range, context, token)
            }
          } finally {
            onServerResponse.fire()
          }
        },
        provideDocumentRangeSemanticTokens: async (document, range, token, next) => {
          try {
            if (this.languageServerOptions.middleware?.provideDocumentRangeSemanticTokens != null) {
              return await this.languageServerOptions.middleware.provideDocumentRangeSemanticTokens(document, range, token, next)
            } else {
              return await next(document, range, token)
            }
          } finally {
            onServerResponse.fire()
          }
        },
        provideDocumentSemanticTokens: async (document, token, next) => {
          try {
            if (this.languageServerOptions.middleware?.provideDocumentSemanticTokens != null) {
              return await this.languageServerOptions.middleware.provideDocumentSemanticTokens(document, token, next)
            } else {
              return await next(document, token)
            }
          } finally {
            onServerResponse.fire()
          }
        },
        handleWorkDoneProgress: async (token, params, next) => {
          if (this.languageServerOptions.middleware?.handleWorkDoneProgress != null) {
            this.languageServerOptions.middleware.handleWorkDoneProgress(token, params, next)
          } else {
            next(token, params)
          }
          if (params.kind === 'end') {
            onServerResponse.fire()
          }
        },
        provideHover: async (document, position, token, next) => {
          try {
            if (this.languageServerOptions.middleware?.provideHover != null) {
              return await this.languageServerOptions.middleware.provideHover(document, position, token, next)
            } else {
              return await next(document, position, token)
            }
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

    this.languageClient.registerFeature(new WillDisposeFeature(this.languageClient, this.onWillShutdownEmitter))

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

/**
 * Create a language client manager
 * @param id The predefined id of the language client
 * @param sessionId An optional sessionId when connecting to the session-mutualized server
 * @param languageServerAddress The domain of the server
 * @param getSecurityToken A function which returns a valid JWT token to use to connect to the server
 * @param libraryUrls A list of urls which link to zip files containing libraries/resources
 * @param useMutualizedProxy The language server proxy is used, so we only need to load configurations for language servers which are not mutualized
 * @returns A language client manager
 */
function createLanguageClientManager (
  id: LanguageClientId,
  sessionId: string | undefined,
  languageServerAddress: string,
  getSecurityToken: () => Promise<string>,
  libraryUrls: string[],
  useMutualizedProxy: boolean = languageServerAddress.includes('mutualized')
): LanguageClientManager {
  if (languageClientManagerByLanguageId[id] != null) {
    throw new Error(`Language client for language ${id} already started`)
  }
  let languageServerOptions = staticOptions[id]
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (languageServerOptions == null) {
    throw new Error(`Unknown ${id} language server`)
  }

  if (useMutualizedProxy && languageServerOptions.mutualizable) {
    // When using the mutualized proxy, we don't need to synchronize the configuration nor send the initialization options
    languageServerOptions = {
      ...languageServerOptions,
      synchronize: undefined,
      initializationOptions: undefined
    }
  }

  installServices()

  const languageClientManager = new LanguageClientManager(id, sessionId, languageServerAddress, getSecurityToken, languageServerOptions, libraryUrls, useMutualizedProxy)
  languageClientManagerByLanguageId[id] = languageClientManager

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
    delete languageClientManagerByLanguageId[id]
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
