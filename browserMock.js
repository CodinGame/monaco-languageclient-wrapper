import fs from 'fs/promises'
import { performance } from 'perf_hooks'
import { fetch as fetchPolyfill } from 'whatwg-fetch'
import crypto from 'node:crypto'

Object.defineProperty(globalThis, 'crypto', { value: crypto })

Object.defineProperty(document, 'queryCommandSupported', {
  value: jest.fn().mockImplementation(() => true)
})

window.process = undefined

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // Deprecated
    removeListener: jest.fn(), // Deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }))
})

Object.defineProperty(window, 'fetch', {
  value: jest.fn(async (url, options) => {
    if (url.startsWith('file:')) {
      const content = await fs.readFile(new URL(url).pathname)
      return {
        json: async () => JSON.stringify(JSON.parse(content.toString())),
        arrayBuffer: async () =>
          content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
        status: 200
      }
    } else {
      return fetchPolyfill(url, options)
    }
  })
})

Object.defineProperty(URL, 'createObjectURL', {
  value: jest.fn((blob) => {
    return 'blob:not-working'
  })
})

Object.defineProperty(window, 'Worker', {
  value: class Worker {
    constructor(stringUrl) {}
    postMessage(msg) {}
    terminate() {}
    removeEventListener() {}
  }
})

Object.defineProperty(window, 'ResizeObserver', {
  value: class ResizeObserver {
    constructor() {}
    observe() {}
  }
})

Object.defineProperty(window, 'Buffer', { value: undefined })

// Force override performance, for some reason the implementation is empty otherwise
let _performance = performance
// remove nodeTiming because otherwise VSCode refuse to detect the env as a browser env, and it also fails to detect a node env (no `process`) so it generates an error
performance.nodeTiming = undefined
Object.defineProperty(global, 'performance', {
  get() {
    return _performance
  },
  set(v) {
    // ignore
  }
})

global.CSS = { escape: (v) => v }

Element.prototype.scrollIntoView = jest.fn()

window.document.adoptedStyleSheets = []
