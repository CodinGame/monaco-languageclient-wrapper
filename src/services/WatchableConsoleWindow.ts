import * as monaco from 'monaco-editor'
import { Window, Severity } from 'vscode/services'
import swal from 'sweetalert'
import type * as vscode from 'vscode'

class WatchableOutputChannel implements vscode.OutputChannel {
  logs: string = ''
  readonly name: string
  protected readonly onWillCloseEmitter = new monaco.Emitter<void>()
  protected readonly onDidChangeLogEmitter = new monaco.Emitter<void>()

  constructor (name: string) {
    this.name = name
  }

  replace (): void {
    throw new Error('Method not implemented.')
  }

  clear (): void {
    throw new Error('Method not implemented.')
  }

  hide (): void {
    throw new Error('Method not implemented.')
  }

  get onWillClose (): monaco.IEvent<void> {
    return this.onWillCloseEmitter.event
  }

  get onDidChangeLog (): monaco.IEvent<void> {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMessageItem (item: any): item is vscode.MessageItem {
  return item != null && item.title
}

function getMessage (item: string | vscode.MessageItem) {
  return isMessageItem(item) ? item.title : item
}

export default class WatchableConsoleWindow implements Window {
  protected readonly onDidChangeChannelsEmitter = new monaco.Emitter<void>()
  protected readonly channels = new Map<string, WatchableOutputChannel>()

  async showMessage<T extends vscode.MessageOptions | string | vscode.MessageItem> (type: Severity, message: string, ...actions: T[]): Promise<T | undefined> {
    const optionsOrFirstItem = actions[0]
    let items: (string | vscode.MessageItem)[]

    let options: vscode.MessageOptions | undefined
    if (typeof optionsOrFirstItem === 'string' || isMessageItem(optionsOrFirstItem)) {
      items = actions as (string | vscode.MessageItem)[]
    } else {
      options = optionsOrFirstItem
      items = actions.slice(1) as (string | vscode.MessageItem)[]
    }

    let displayedMessage = message
    if (items.length > 0) {
      displayedMessage = `${displayedMessage}\nActions:\n${items.map(action => `- ${getMessage(action)}`).join('\n')}`
    }

    if (type === Severity.Error) {
      console.error('[LSP]', displayedMessage)
    }
    if (type === Severity.Warning) {
      console.warn('[LSP]', displayedMessage)
    }
    if (type === Severity.Info) {
      console.info('[LSP]', displayedMessage)
    }

    const defaultAction = items.find(item => isMessageItem(item) && (item.isCloseAffordance ?? false)) as T | undefined ?? actions[0]

    if (items.length > 1) {
      return (await swal({
        title: message,
        text: options?.detail,
        closeOnEsc: true,
        closeOnClickOutside: true,
        buttons: items.reduce((acc, action, index) => ({
          ...acc,
          [`option-${index}`]: {
            text: getMessage(action),
            value: action
          }
        }), {})
      })) ?? defaultAction
    }

    return defaultAction
  }

  createOutputChannel (name: string): vscode.OutputChannel {
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

  get onDidChangeChannels (): monaco.IEvent<void> {
    return this.onDidChangeChannelsEmitter.event
  }

  withProgress: Window['withProgress'] = async <R> (options: vscode.ProgressOptions, task: (progress: vscode.Progress<{ message?: string, increment?: number }>, token: monaco.CancellationToken) => PromiseLike<R>): Promise<R> => {
    console.info('[LSP]', 'Starting task with progress:', options.location, options.title)
    try {
      return await task({
        report: (params) => {
          console.info('[LSP]', `Task progress: ${params.increment}%:`, params.message)
        }
      }, new monaco.CancellationTokenSource().token)
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
