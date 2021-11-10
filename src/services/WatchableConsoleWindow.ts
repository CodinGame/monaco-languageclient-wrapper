import { MessageType, OutputChannel, Window, MessageActionItem, Emitter, Event } from '@codingame/monaco-languageclient'
import swal from 'sweetalert'

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
      console.error(displayedMessage)
    }
    if (type === MessageType.Warning) {
      console.warn(displayedMessage)
    }
    if (type === MessageType.Info) {
      console.info(displayedMessage)
    }
    if (type === MessageType.Log) {
      // eslint-disable-next-line no-console
      console.log(displayedMessage)
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
}
