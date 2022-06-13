const fs = require('fs/promises')

Object.defineProperty(document, 'queryCommandSupported', {
  value: jest.fn().mockImplementation(() => true),
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // Deprecated
    removeListener: jest.fn(), // Deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

Object.defineProperty(window, 'fetch', {
  value: jest.fn(async (path) => {

    const content = await fs.readFile(path)
    return {
      json: async () => JSON.stringify(JSON.parse(content.toString())),
      arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)
    }
  })
})

Object.defineProperty(URL, 'createObjectURL', {
  value: jest.fn((blob) => {

    return null
  })
})

Object.defineProperty(window, 'Worker', {
  value: class Worker {
    constructor(stringUrl) {}
    postMessage(msg) {}
    terminate () {}
  }
})

Object.defineProperty(window, 'ResizeObserver', {
  value: class ResizeObserver {
    constructor(stringUrl) {}
    observe() {}
  }
})

Object.defineProperty(window, 'TextEncoder', {
  value: class TextObserver {
    constructor(stringUrl) {}
    encode(src) { return src }
  }
})