import {
  CloseAction, ErrorAction, State
} from 'vscode-languageclient'
import {
  MonacoLanguageClient, DisposableCollection
} from 'monaco-languageclient'
import delay from 'delay'
import { CancellationToken, Emitter, NotificationType, RequestType, Event, LogMessageNotification } from 'vscode-languageserver-protocol'
import * as vscode from 'vscode'
import { errorHandler } from 'vscode/monaco'
import once from 'once'
import { updateServices } from './services'
import createLanguageClient from './createLanguageClient'
import { WillShutdownParams } from './customRequests'
import { FileSystemFeature, InitializeTextDocumentFeature, WillDisposeFeature } from './extensions'
import { loadExtensionConfigurations } from './extensionConfiguration'
import { getLanguageClientOptions, LanguageClientId, LanguageClientOptions } from './languageClientOptions'
import { Infrastructure } from './infrastructure'

export interface LanguageClient {
  sendNotification<P>(type: NotificationType<P>, params?: P): Promise<void>
  sendRequest<P, R, E> (request: RequestType<P, R, E>, params: P, token?: CancellationToken): Promise<R>
}

type Status = 'ready' | 'error' | 'connecting' | 'connected' | 'closed'

export interface StatusChangeEvent {
  status: Status
}

const RETRY_CONNECTION_DELAY = 3000

export interface LanguageClientManagerOptions {
  /**
   * The language client will stop trying to start after `maxStartAttemptCount` failed attempts
   */
   maxStartAttemptCount?: number
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
  private startPromise: Promise<void> | undefined

  constructor (
    private id: LanguageClientId,
    private clientOptions: LanguageClientOptions,
    private infrastructure: Infrastructure,
    private managerOptions: LanguageClientManagerOptions
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

  async dispose (timeout?: number): Promise<void> {
    this.disposed = true
    try {
      if (this.startPromise != null) {
        // Wait for language client to be started or it throws and error
        try {
          await this.startPromise
        } catch (error) {
          // ignore
        }
      }
      if (this.languageClient != null) {
        const languageClient = this.languageClient
        this.languageClient = undefined
        await languageClient.dispose(timeout)
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

  isModelManaged (document: vscode.TextDocument): boolean {
    if (this.clientOptions.documentSelector == null) {
      return false
    }
    return vscode.languages.match(this.clientOptions.documentSelector, document) > 0
  }

  isDisposed (): boolean {
    return this.disposed
  }

  private handleClose = () => {
    return {
      action: CloseAction.DoNotRestart
    }
  }

  private handleError = (error: Error) => {
    errorHandler.onUnexpectedError(new Error('[LSP] Language client error', {
      cause: error
    }))
    this.onErrorEmitter.fire(error)
    this.updateStatus('error')

    return {
      action: ErrorAction.Shutdown
    }
  }

  public async start (): Promise<void> {
    let started = false
    let attempt = 0
    const maxStartAttemptCount = this.managerOptions.maxStartAttemptCount
    while (
      !this.isDisposed() &&
      !started
    ) {
      if (maxStartAttemptCount != null && attempt >= maxStartAttemptCount) {
        throw new Error(`Max connection attempt count exceeded: ${maxStartAttemptCount}`)
      }
      try {
        this.startPromise = this._start()
        await this.startPromise
        // If the initialize request fails, the start method still returns a resolve promise due to a vscode-languageclient bug
        if (!(this.languageClient?.isRunning() ?? false)) {
          throw new Error('Language server not running')
        }
        started = true
      } catch (error) {
        this.languageClient = undefined
        this.startPromise = undefined
        errorHandler.onUnexpectedError(new Error(`[LSP] Unable to start language client, retrying in ${RETRY_CONNECTION_DELAY} ms`, {
          cause: error as Error
        }))
        await delay(RETRY_CONNECTION_DELAY)
      }
      ++attempt
    }
  }

  private prepare = once(async () => {
    try {
      await loadExtensionConfigurations([this.clientOptions], this.useMutualizedProxy)
    } catch (error) {
      errorHandler.onUnexpectedError(new Error('[LSP] Unable to load extension configuration', {
        cause: error as Error
      }))
    }
  })

  private async _start (): Promise<void> {
    await this.prepare()

    const onServerResponse = new Emitter<void>()

    const languageClient = await createLanguageClient(
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
            errorHandler.onUnexpectedError(new Error(`[LSP] Error while waiting for the ${this.id} language client to be ready`, {
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
          setTimeout(() => {
            // setTimeout is required or the dispose() fails (Client is stopping but no stop promise available.)
            void languageClient.dispose()
          })
          if (state.oldState === State.Running && !this.isDisposed() && this.languageClient === languageClient) {
            this.languageClient = undefined
            console.info('[LSP] Restarting language client', state)
            this.start().catch(error => {
              errorHandler.onUnexpectedError(new Error('[LSP] Language client stopped', {
                cause: error as Error
              }))
            })
          }
          break
        }
      }
    })

    this.languageClient.registerFeature(new WillDisposeFeature(this.languageClient, this.onWillShutdownEmitter))

    this.languageClient.registerFeature(new FileSystemFeature(this.infrastructure, this))

    if (!this.infrastructure.automaticTextDocumentUpdate) {
      this.languageClient.registerFeature(new InitializeTextDocumentFeature(this, this.infrastructure))
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
  clientOptions: LanguageClientOptions = getLanguageClientOptions(id),
  managerOptions: LanguageClientManagerOptions = {}
): LanguageClientManager {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (clientOptions == null) {
    throw new Error(`Unknown ${id} language server`)
  }

  if (infrastructure.useMutualizedProxy(id, clientOptions) && clientOptions.mutualizable) {
    // When using the mutualized proxy, we don't need to synchronize the configuration
    clientOptions = {
      ...clientOptions,
      synchronize: undefined
    }
  }

  updateServices(infrastructure)

  return new LanguageClientManager(id, clientOptions, infrastructure, managerOptions)
}

export {
  createLanguageClientManager
}
