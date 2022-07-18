import * as monaco from 'monaco-editor'
import { Window } from 'vscode/services'
import type * as vscode from 'vscode'
import { Disposable } from 'vscode-languageserver-protocol'

class PopupOutputChannel implements vscode.OutputChannel {
  private displayLogDisposable: Disposable | undefined
  private logs: string = ''
  readonly name: string
  protected readonly onWillCloseEmitter = new monaco.Emitter<void>()
  protected readonly onDidChangeLogEmitter = new monaco.Emitter<void>()

  constructor (name: string) {
    this.name = name
  }

  replace (value: string): void {
    this.logs = value
    this.onDidChangeLogEmitter.fire()
  }

  clear (): void {
    this.logs = ''
    this.onDidChangeLogEmitter.fire()
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

  dispose (): void {
    this.onWillCloseEmitter.fire()
  }

  hide (): void {
    this.displayLogDisposable?.dispose()
    this.displayLogDisposable = undefined
  }

  show (): void {
    if (this.displayLogDisposable != null) {
      return
    }
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.zIndex = '10000'
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
    container.style.top = container.style.bottom = container.style.left = container.style.right = '0'
    container.style.cursor = 'pointer'

    const contentEl = document.createElement('pre')
    contentEl.style.position = 'absolute'
    contentEl.style.overflow = 'auto'
    contentEl.style.top = contentEl.style.bottom = contentEl.style.left = contentEl.style.right = '0'
    contentEl.style.margin = 'auto'
    contentEl.style.width = '80%'
    contentEl.style.height = '80%'
    contentEl.style.background = 'white'
    contentEl.style.color = 'black'
    container.style.cursor = 'auto'
    contentEl.innerText = this.logs
    const watcherDisposable = this.onDidChangeLog(() => {
      const atBottom = Math.abs(contentEl.scrollHeight - contentEl.scrollTop - contentEl.clientHeight) < 10
      contentEl.innerText = this.logs

      if (atBottom) {
        // Glue to the bottom
        setTimeout(() => {
          contentEl.scrollTo({ top: contentEl.scrollHeight, behavior: 'smooth' })
        })
      }
    })
    container.appendChild(contentEl)
    document.body.appendChild(container)
    setTimeout(() => {
      contentEl.scrollTop = contentEl.scrollHeight
    })
    const disposable: Disposable = {
      dispose () {
        watcherDisposable.dispose()
        document.body.removeChild(container)
      }
    }
    this.displayLogDisposable = disposable
    container.addEventListener('mousedown', (event) => {
      if (event.target !== container) {
        return
      }
      disposable.dispose()
      this.displayLogDisposable = undefined
    })
  }
}

export default class WatchableConsoleWindow implements Window {
  protected readonly channels = new Map<string, PopupOutputChannel>()

  createOutputChannel (name: string): vscode.OutputChannel {
    let channel = this.channels.get(name)
    if (channel == null) {
      channel = new PopupOutputChannel(name)
      channel.onWillClose(() => {
        this.channels.delete(name)
      })

      this.channels.set(name, channel)
    }
    return channel
  }

  withProgress: Window['withProgress'] = async (options, task) => {
    console.info('[LSP]', 'Starting task with progress:', options.location, options.title)
    try {
      return await task({
        report: (params) => {
          console.info('[LSP]', `Task progress: ${params.increment}%:`, params.message)
        }
      })
    } finally {
      console.info('[LSP]', 'Task completed:', options.title)
    }
  }
}
