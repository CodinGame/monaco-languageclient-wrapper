import {
  Env
} from 'monaco-languageclient'

/**
 * This function comes from vscode: https://github.com/microsoft/vscode/blob/85bf8af5b9661b0c7f9587d33b3cb61499f6e4b8/src/vs/base/browser/dom.ts#L1282
 */
export function windowOpenWithSuccess (url: string, noOpener = true): boolean {
  const newTab = window.open()
  if (newTab != null) {
    if (noOpener) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (newTab as any).opener = null
    }
    newTab.location.href = url
    return true
  }
  return false
}

export default class CodinGameMonacoEnv implements Env {
  openExternal: Env['openExternal'] = async (uri) => {
    return windowOpenWithSuccess(uri.toString())
  }
}
