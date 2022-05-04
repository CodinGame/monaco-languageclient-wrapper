import {
  MonacoWorkspace, TextDocument, TextDocumentSaveReason,
  ProtocolToMonacoConverter, MonacoToProtocolConverter, Emitter, Event, TextDocumentWillSaveEvent, Disposable, DisposableCollection
} from 'monaco-languageclient'
import * as monaco from 'monaco-editor'
import type * as vscode from 'vscode'
import Configuration from './Configuration'

export interface ITextModelContentSaveHandler {
  saveTextContent(document: TextDocument, reason: TextDocumentSaveReason): Promise<void>
}

export default class CodinGameMonacoWorkspace extends MonacoWorkspace {
  protected readonly onWillSaveTextDocumentEmitter = new Emitter<TextDocumentWillSaveEvent>()
  private readonly savehandlers: ITextModelContentSaveHandler[] = []
  protected readonly onDidSaveTextDocumentEmitter = new Emitter<TextDocument>()

  configurations = new Configuration()

  private autoSaveModelDisposable: Disposable | undefined

  public workspaceFolders: typeof vscode.workspace.workspaceFolders

  constructor (
    p2m: ProtocolToMonacoConverter,
    m2p: MonacoToProtocolConverter,
    rootUri: string | null = null
  ) {
    super(monaco, p2m, m2p, rootUri)
  }

  public initialize (
    rootUri: string | null = null,
    workspaceFolders: typeof vscode.workspace.workspaceFolders,
    autoSaveModels: boolean
  ): void {
    this._rootUri = rootUri
    if (workspaceFolders != null) {
      this.workspaceFolders = workspaceFolders
    } else if (rootUri != null) {
      const uri = monaco.Uri.parse(rootUri)
      this.workspaceFolders = [{
        uri,
        index: 0,
        name: uri.toString()
      }]
    }
    if (autoSaveModels && this.autoSaveModelDisposable == null) {
      this.autoSaveModelDisposable = this.autoSaveModels()
    } else if (!autoSaveModels && this.autoSaveModelDisposable != null) {
      this.autoSaveModelDisposable.dispose()
      this.autoSaveModelDisposable = undefined
    }
  }

  get onWillSaveTextDocument (): Event<TextDocumentWillSaveEvent> {
    return this.onWillSaveTextDocumentEmitter.event
  }

  get onDidSaveTextDocument (): Event<TextDocument> {
    return this.onDidSaveTextDocumentEmitter.event
  }

  registerSaveDocumentHandler (handler: ITextModelContentSaveHandler): Disposable {
    this.savehandlers.push(handler)
    return Disposable.create(() => {
      const index = this.savehandlers.indexOf(handler)
      if (index >= 0) {
        this.savehandlers.splice(index, 1)
      }
    })
  }

  async saveDocument (document: TextDocument, reason: TextDocumentSaveReason): Promise<void> {
    this.onWillSaveTextDocumentEmitter.fire({
      textDocument: document,
      reason
    })

    try {
      await Promise.all(this.savehandlers.map(handler => {
        return handler.saveTextContent(document, reason)
      }))

      this.onDidSaveTextDocumentEmitter.fire(document)
    } catch (err) {
      monaco.errorHandler.onUnexpectedError(new Error(`[LSP] Unable to save file on language server: ${document.uri.toString()}`, {
        cause: err as Error
      }))
    }
  }

  private autoSaveModels (): Disposable {
    const disposableCollection = new DisposableCollection()
    const timeoutMap = new Map<string, number>()
    disposableCollection.push(this.onDidChangeTextDocument(e => {
      const timeout = timeoutMap.get(e.textDocument.uri)
      if (timeout != null) {
        window.clearTimeout(timeout)
        timeoutMap.delete(e.textDocument.uri)
      }
      timeoutMap.set(e.textDocument.uri, window.setTimeout(() => {
        timeoutMap.delete(e.textDocument.uri)
        this.saveDocument(e.textDocument, TextDocumentSaveReason.AfterDelay).catch((error: Error) => {
          monaco.errorHandler.onUnexpectedError(new Error(`[LSP] Unable to save the document ${e.textDocument.uri.toString()}`, {
            cause: error
          }))
        })
      }, 500))
    }))
    disposableCollection.push(Disposable.create(() => {
      for (const timeout of Array.from(timeoutMap.values())) {
        window.clearTimeout(timeout)
      }
    }))
    return disposableCollection
  }

  override dispose (): void {
    super.dispose()
    this.autoSaveModelDisposable?.dispose()
    this.configurations.dispose()
    this.onWillSaveTextDocumentEmitter.dispose()
    this.onDidSaveTextDocumentEmitter.dispose()
  }
}
