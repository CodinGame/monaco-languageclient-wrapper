import * as monaco from 'monaco-editor'
import { Window } from 'vscode/services'
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

export default class WatchableConsoleWindow implements Window {
  protected readonly channels = new Map<string, WatchableOutputChannel>()

  createOutputChannel (name: string): vscode.OutputChannel {
    let channel = this.channels.get(name)
    if (channel == null) {
      channel = new WatchableOutputChannel(name)
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
