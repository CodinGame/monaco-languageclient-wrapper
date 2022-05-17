import {
  Env
} from 'monaco-languageclient'

/**
 * Attempts to open a window and returns whether it succeeded. This technique is
 * not appropriate in certain contexts, like for example when the JS context is
 * executing inside a sandboxed iframe. If it is not necessary to know if the
 * browser blocked the new window, use {@link windowOpenNoOpener}.
 *
 * See https://github.com/microsoft/monaco-editor/issues/601
 * See https://github.com/microsoft/monaco-editor/issues/2474
 * See https://mathiasbynens.github.io/rel-noopener/
 *
 * @param url the url to open
 * @param noOpener whether or not to set the {@link window.opener} to null. You should leave the default
 * (true) unless you trust the url that is being opened.
 * @returns boolean indicating if the {@link window.open} call succeeded
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
