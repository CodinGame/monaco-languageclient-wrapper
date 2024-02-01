import { initializePromise } from '@codingame/monaco-editor-wrapper'
import * as monaco from 'monaco-editor'

void initializePromise.then(() => {
  monaco.editor.onWillDisposeModel(model => {
  // We need to do it in a timeout or else the marker change event is delayed
    setTimeout(() => {
      monaco.editor.setModelMarkers(model, 'default', [])
    })
  })
})
