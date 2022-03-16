import {
  MonacoWorkspace, TextDocument, TextDocumentSaveReason,
  ProtocolToMonacoConverter, MonacoToProtocolConverter, Emitter, Event, TextDocumentWillSaveEvent, Disposable
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

  constructor (
    p2m: ProtocolToMonacoConverter,
    m2p: MonacoToProtocolConverter,
    _rootUri: string | null = null,
    public workspaceFolders: typeof vscode.workspace.workspaceFolders
  ) {
    super(monaco, p2m, m2p, _rootUri)

    // "workaround" for https://github.com/TypeFox/monaco-languageclient/pull/199#issuecomment-593414330
    if (this.workspaceFolders == null && _rootUri != null) {
      const uri = monaco.Uri.parse(_rootUri)
      this.workspaceFolders = [{
        uri,
        index: 0,
        name: uri.toString()
      }]
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
      console.error('[LSP]', 'Unable to save file on language server', err)
    }
  }
}
