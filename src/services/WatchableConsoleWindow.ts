import * as monaco from 'monaco-editor'
import { MessageType, OutputChannel, Window, MessageActionItem, Emitter, Event, CancellationToken, CancellationTokenSource } from 'monaco-languageclient'
import swal from 'sweetalert'
import type * as vscode from 'vscode'

class WatchableOutputChannel implements OutputChannel {
  logs: string = ''
  readonly name: string
  protected readonly onWillCloseEmitter = new Emitter<void>()
  protected readonly onDidChangeLogEmitter = new Emitter<void>()

  constructor (name: string) {
    this.name = name
  }

  get onWillClose (): Event<void> {
    return this.onWillCloseEmitter.event
  }

  get onDidChangeLog (): Event<void> {
    return this.onDidChangeLogEmitter.event
  }

  append (value: string): void {
    this.logs += value
    this.onDidChangeLogEmitter.fire()
  }

  appendLine (line: string): void {
    this.logs += line + '\n'
    this.onDidChangeLogEmitter.fire()
  }

  show (): void {
    // ignore
  }

  dispose (): void {
    this.onWillCloseEmitter.fire()
  }
}

export default class WatchableConsoleWindow implements Window {
  protected readonly onDidChangeChannelsEmitter = new Emitter<void>()
  protected readonly channels = new Map<string, WatchableOutputChannel>()

  async showMessage<T extends MessageActionItem> (type: MessageType, message: string, ...actions: T[]): Promise<T | undefined> {
    const displayedMessage = message + '\n' + actions.map(action => `- ${action.title}`).join('\n')

    if (type === MessageType.Error) {
      console.error('[LSP]', displayedMessage)
    }
    if (type === MessageType.Warning) {
      console.warn('[LSP]', displayedMessage)
    }
    if (type === MessageType.Info) {
      console.info('[LSP]', displayedMessage)
    }
    if (type === MessageType.Log) {
      // eslint-disable-next-line no-console
      console.log('[LSP]', displayedMessage)
    }

    if (actions.length > 1) {
      return swal({
        text: message,
        buttons: actions.reduce((acc, action, index) => ({
          ...acc,
          [`option-${index}`]: {
            text: action.title,
            value: action
          }
        }), {})
      })
    }

    return actions[0]
  }

  createOutputChannel (name: string): OutputChannel {
    let channel = this.channels.get(name)
    if (channel == null) {
      channel = new WatchableOutputChannel(name)
      channel.onWillClose(() => {
        this.channels.delete(name)
        this.onDidChangeChannelsEmitter.fire()
      })

      this.channels.set(name, channel)
      this.onDidChangeChannelsEmitter.fire()
    }
    return channel
  }

  get onDidChangeChannels (): Event<void> {
    return this.onDidChangeChannelsEmitter.event
  }

  withProgress: Window['withProgress'] = async <R> (options: vscode.ProgressOptions, task: (progress: vscode.Progress<{ message?: string, increment?: number }>, token: CancellationToken) => PromiseLike<R>): Promise<R> => {
    console.info('[LSP]', 'Starting task with progress:', options.location, options.title)
    try {
      return await task({
        report: (params) => {
          console.info('[LSP]', `Task progress: ${params.increment}%:`, params.message)
        }
      }, new CancellationTokenSource().token)
    } finally {
      console.info('[LSP]', 'Task completed:', options.title)
    }
  }

  showTextDocument: Window['showTextDocument'] = async (document, options) => {
    const codeEditorService = monaco.extra.StandaloneServices.get(monaco.extra.ICodeEditorService)
    codeEditorService.getActiveCodeEditor()
    await codeEditorService.openCodeEditor({
      resource: document,
      options: {
        selection: options?.selection != null
          ? {
              startLineNumber: options.selection.start.line,
              startColumn: options.selection.start.character,
              endLineNumber: options.selection.end.line,
              endColumn: options.selection.end.character
            }
          : undefined,
        selectionSource: monaco.extra.TextEditorSelectionSource.PROGRAMMATIC
      }
    }, null)
  }
}
