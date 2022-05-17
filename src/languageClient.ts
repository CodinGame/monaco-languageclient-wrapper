import * as monaco from 'monaco-editor'
import {
  CloseAction, ErrorAction, MonacoLanguageClient, Emitter, Event, TextDocument, Services, State, DisposableCollection, CancellationToken, RequestType, NotificationType, LogMessageNotification
} from 'monaco-languageclient'
import delay from 'delay'
import { updateServices } from './services'
import createLanguageClient from './createLanguageClient'
import { WillShutdownParams } from './customRequests'
import { FileSystemFeature, InitializeTextDocumentFeature, WillDisposeFeature } from './extensions'
import { loadExtensionConfigurations } from './extensionConfiguration'
import { getLanguageClientOptions, LanguageClientId, LanguageClientOptions } from './languageClientOptions'
import { Infrastructure } from './infrastructure'

export interface LanguageClient {
  sendNotification<P>(type: NotificationType<P>, params?: P): void
  sendRequest<P, R, E> (request: RequestType<P, R, E>, params: P, token?: CancellationToken): Promise<R>
}

type Status = 'ready' | 'error' | 'connecting' | 'connected' | 'closed'

export interface StatusChangeEvent {
  status: Status
}

export class LanguageClientManager implements LanguageClient {
  languageClient?: MonacoLanguageClient
  private disposed: boolean = false
  protected readonly onDidChangeStatusEmitter = new Emitter<StatusChangeEvent>()
  protected readonly onErrorEmitter = new Emitter<Error>()
  protected readonly onDidCloseEmitter = new Emitter<void>()
  protected readonly onWillShutdownEmitter = new Emitter<WillShutdownParams>()
  protected currentStatus: Status = 'connecting'
  private useMutualizedProxy: boolean

  constructor (
    private id: LanguageClientId,
    private clientOptions: LanguageClientOptions,
    private infrastructure: Infrastructure
  ) {
    this.useMutualizedProxy = this.infrastructure.useMutualizedProxy(this.id, this.clientOptions)
  }

  private updateStatus (status: Status) {
    this.currentStatus = status
    this.notifyStatusChanged()
  }

  private notifyStatusChanged () {
    this.onDidChangeStatusEmitter.fire({
      status: this.currentStatus
    })
  }

  isConnected (): boolean {
    return ['connected', 'ready'].includes(this.currentStatus)
  }

  async dispose (): Promise<void> {
    this.disposed = true
    try {
      if (this.languageClient != null) {
        const languageClient = this.languageClient
        this.languageClient = undefined
        await languageClient.stop()
      }
    } finally {
      this.onDidCloseEmitter.fire()
    }
  }

  get onDidChangeStatus (): Event<StatusChangeEvent> {
    return this.onDidChangeStatusEmitter.event
  }

  get onDidClose (): Event<void> {
    return this.onDidCloseEmitter.event
  }

  get onWillShutdown (): Event<WillShutdownParams> {
    return this.onWillShutdownEmitter.event
  }

  get onError (): Event<Error> {
    return this.onErrorEmitter.event
  }

  isModelManaged (document: TextDocument): boolean {
    if (this.clientOptions.documentSelector == null) {
      return false
    }
    return Services.get().languages.match(this.clientOptions.documentSelector, document)
  }

  isDisposed (): boolean {
    return this.disposed
  }

  private handleClose = () => {
    if (this.isDisposed()) {
      return {
        action: CloseAction.DoNotRestart
      }
    }
    return {
      action: CloseAction.Restart
    }
  }

  private handleError = (error: Error) => {
    monaco.errorHandler.onUnexpectedError(new Error('[LSP] Language client error', {
      cause: error
    }))
    this.onErrorEmitter.fire(error)
    this.updateStatus('error')

    return {
      action: ErrorAction.Continue
    }
  }

  public async start (): Promise<void> {
    try {
      await loadExtensionConfigurations([this.id], this.useMutualizedProxy)
    } catch (error) {
      monaco.errorHandler.onUnexpectedError(new Error('[LSP] Unable to load extension configuration', {
        cause: error as Error
      }))
    }
    if (!this.isDisposed()) {
      this._start()
    }
  }

  private async _start (): Promise<void> {
    const onServerResponse = new Emitter<void>()

    const languageClient = createLanguageClient(
      this.id,
      this.infrastructure,
      this.clientOptions, {
        error: this.handleError,
        closed: this.handleClose
      }, {
        ...(this.clientOptions.middleware ?? {}),
        handleDiagnostics: (uri, diagnostics, next) => {
          if (this.clientOptions.middleware?.handleDiagnostics != null) {
            this.clientOptions.middleware.handleDiagnostics(uri, diagnostics, next)
          } else {
            next(uri, diagnostics)
          }
          onServerResponse.fire()
        },
        provideCodeActions: async (document, range, context, token, next) => {
          try {
            if (this.clientOptions.middleware?.provideCodeActions != null) {
              return await this.clientOptions.middleware.provideCodeActions(document, range, context, token, next)
            } else {
              return await next(document, range, context, token)
            }
          } finally {
            onServerResponse.fire()
          }
        },
        provideDocumentRangeSemanticTokens: async (document, range, token, next) => {
          try {
            if (this.clientOptions.middleware?.provideDocumentRangeSemanticTokens != null) {
              return await this.clientOptions.middleware.provideDocumentRangeSemanticTokens(document, range, token, next)
            } else {
              return await next(document, range, token)
            }
          } finally {
            onServerResponse.fire()
          }
        },
        provideDocumentSemanticTokens: async (document, token, next) => {
          try {
            if (this.clientOptions.middleware?.provideDocumentSemanticTokens != null) {
              return await this.clientOptions.middleware.provideDocumentSemanticTokens(document, token, next)
            } else {
              return await next(document, token)
            }
          } finally {
            onServerResponse.fire()
          }
        },
        handleWorkDoneProgress: async (token, params, next) => {
          if (this.clientOptions.middleware?.handleWorkDoneProgress != null) {
            this.clientOptions.middleware.handleWorkDoneProgress(token, params, next)
          } else {
            next(token, params)
          }
          if (params.kind === 'end') {
            onServerResponse.fire()
          }
        },
        provideHover: async (document, position, token, next) => {
          try {
            if (this.clientOptions.middleware?.provideHover != null) {
              return await this.clientOptions.middleware.provideHover(document, position, token, next)
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
          this.updateStatus('connecting')
          readyPromise = Promise.resolve().then(async () => {
            const disposableCollection = new DisposableCollection()

            let readyPromise: Promise<void>
            const { maxInitializeDuration, readinessMessageMatcher } = this.clientOptions
            if (readinessMessageMatcher != null && !this.useMutualizedProxy) {
              readyPromise = new Promise<void>(resolve => {
                disposableCollection.push(languageClient.onNotification(LogMessageNotification.type, logMessage => {
                  if (readinessMessageMatcher.exec(logMessage.message) != null) {
                    resolve()
                  }
                }))
              })
            } else {
              readyPromise = new Promise<void>(resolve => {
                disposableCollection.push(onServerResponse.event(resolve))
              })
            }

            await Promise.race([
              readyPromise,
              delay(maxInitializeDuration ?? 15_000)
            ])
            disposableCollection.dispose()
          }, (error: Error) => {
            monaco.errorHandler.onUnexpectedError(new Error(`[LSP] Error while waiting for the ${this.id} language client to be ready`, {
              cause: error
            }))
          })
          break
        }
        case State.Running: {
          this.updateStatus('connected')

          await readyPromise

          this.updateStatus('ready')
          break
        }
        case State.Stopped: {
          this.updateStatus('closed')
          break
        }
      }
    })

    this.languageClient.registerFeature(new WillDisposeFeature(this.languageClient, this.onWillShutdownEmitter))

    this.languageClient.registerFeature(new FileSystemFeature(this.infrastructure, this))

    if (!this.infrastructure.automaticTextDocumentUpdate) {
      this.languageClient.registerFeature(new InitializeTextDocumentFeature(this))
    }

    await this.languageClient.start()
  }

  async sendNotification<P> (type: NotificationType<P>, params?: P): Promise<void> {
    await this.languageClient!.sendNotification(type, params)
  }

  sendRequest<P, R, E> (type: RequestType<P, R, E>, params: P): Promise<R> {
    return this.languageClient!.sendRequest<P, R, E>(type, params)
  }
}

/**
 * Create a language client manager
 * @param id The predefined id of the language client
 * @param infrastructure The infrastructure to use
 * @returns A language client manager
 */
function createLanguageClientManager (
  id: LanguageClientId,
  infrastructure: Infrastructure,
  clientOptions: LanguageClientOptions = getLanguageClientOptions(id)
): LanguageClientManager {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (clientOptions == null) {
    throw new Error(`Unknown ${id} language server`)
  }

  if (infrastructure.useMutualizedProxy(id, clientOptions) && clientOptions.mutualizable) {
    // When using the mutualized proxy, we don't need to synchronize the configuration nor send the initialization options
    clientOptions = {
      ...clientOptions,
      synchronize: undefined,
      initializationOptions: undefined
    }
  }

  updateServices(infrastructure)

  return new LanguageClientManager(id, clientOptions, infrastructure)
}

export {
  createLanguageClientManager
}
