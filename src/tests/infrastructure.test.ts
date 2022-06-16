
import { createEditor, monaco, registerEditorOpenHandler } from '@codingame/monaco-editor-wrapper'
import { CompletionTriggerKind, ServerCapabilities, TextDocumentSyncKind, Range } from 'vscode-languageserver-protocol'
import {
  _Connection,
  _
} from 'vscode-languageserver/lib/common/api'
import pDefer, { TestInfrastructure, waitClientNotification, waitClientRequest } from './tools'
import { GetTextDocumentParams, getTextDocumentRequestType, GetTextDocumentResult, SaveTextDocumentParams, saveTextDocumentRequestType } from '../customRequests'
import { createLanguageClientManager, LanguageClientId, LanguageClientManager, getLanguageClientOptions } from '..'

async function initializeLanguageClientAndGetConnection (
  languageClientId: LanguageClientId,
  capabilities: ServerCapabilities<unknown>,
  automaticTextDocumentUpdate: boolean = false,
  useMutualizedProxy: boolean = false
): Promise<[LanguageClientManager, _Connection<_, _, _, _, _, _, _>]> {
  const infrastructure = new TestInfrastructure(automaticTextDocumentUpdate, useMutualizedProxy)

  const languageClient = createLanguageClientManager(languageClientId, infrastructure, {
    ...getLanguageClientOptions(languageClientId),
    createAdditionalFeatures: undefined
  })
  const startPromise = languageClient.start()

  const connection = await infrastructure.getConnection()

  const [, sendInitializationResult] = await waitClientRequest(connection.onInitialize)

  sendInitializationResult({
    capabilities
  })

  await startPromise

  return [languageClient, connection]
}

async function testLanguageClient (
  automaticTextDocumentUpdate: boolean,
  useMutualizedProxy: boolean
) {
  // Create a java language client supporting all document sync features
  const [languageClient, connection] = await initializeLanguageClientAndGetConnection('java', {
    completionProvider: {},
    textDocumentSync: {
      openClose: true,
      change: TextDocumentSyncKind.Incremental,
      save: true,
      willSave: true
    },
    hoverProvider: true,
    declarationProvider: true,
    definitionProvider: true,
    typeDefinitionProvider: true,
    implementationProvider: true,
    referencesProvider: true
  }, automaticTextDocumentUpdate, useMutualizedProxy)

  const onRemainingRequest = jest.fn()
  const onRemainingNotification = jest.fn()
  connection.onRequest(onRemainingRequest)
  connection.onNotification(onRemainingNotification)

  const initializedNotifPromise = waitClientNotification(connection.onInitialized)

  if (!useMutualizedProxy) {
    const configuration = await waitClientNotification(connection.onDidChangeConfiguration)
    // The java lsp expect the client to send the configuration
    expect(configuration).toHaveProperty('settings.java')
  }

  await initializedNotifPromise

  // Creating a java model which will be open in the language client
  const model = monaco.editor.createModel('public class Toto {}', 'java', monaco.Uri.file('/tmp/project/src/main/Toto.java'))

  const editor = createEditor(document.createElement('div'), {
    model
  })

  // Expect the model to be open
  expect(await waitClientNotification(connection.onDidOpenTextDocument)).toEqual({
    textDocument: {
      uri: 'file:///tmp/project/src/main/Toto.java',
      languageId: 'java',
      version: 1,
      text: 'public class Toto {}'
    }
  })

  // Change the model...
  model.applyEdits([{
    range: {
      startLineNumber: 1,
      startColumn: 20,
      endLineNumber: 1,
      endColumn: 20
    },
    text: '\n\tSystem.out.println("toto");\n'
  }])

  // ... and expect the changed to be sent to the server
  expect(await waitClientNotification(connection.onDidChangeTextDocument)).toEqual({
    textDocument: {
      uri: 'file:///tmp/project/src/main/Toto.java',
      version: 2
    },
    contentChanges: [{
      range: {
        start: { line: 0, character: 19 },
        end: { line: 0, character: 19 }
      },
      rangeLength: 0,
      text: '\n\tSystem.out.println("toto");\n'
    }]
  })

  if (!automaticTextDocumentUpdate) {
    // expect the document to being saved after 500ms
    await Promise.all([
      waitClientNotification(connection.onWillSaveTextDocument),
      waitClientRequest<SaveTextDocumentParams, void, never>(handler => connection.onRequest(saveTextDocumentRequestType, handler)).then(([params, sendResponse]) => {
        sendResponse()
        return params
      }),
      waitClientNotification(connection.onDidSaveTextDocument)
    ])
  } else {
    // wait 1sec to be sure no request is sent during this interval
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // Test a completion request
  const completionRequestPromise = waitClientRequest(connection.onCompletion)
  editor.setPosition(new monaco.Position(1, 20))
  editor.trigger('me', 'editor.action.triggerSuggest', {})

  const [completionRequest, sendCompletionRequestResponse] = await completionRequestPromise
  expect(completionRequest).toEqual({
    textDocument: { uri: 'file:///tmp/project/src/main/Toto.java' },
    position: { line: 0, character: 19 },
    context: {
      triggerKind: CompletionTriggerKind.Invoked,
      triggerCharacter: undefined
    }
  })
  sendCompletionRequestResponse(null)

  // Test a hover request
  const hoverRequestPromise = waitClientRequest(connection.onHover)
  await editor.getAction('editor.action.showHover').run()
  const [, sendHoverRequestResponse] = await hoverRequestPromise
  sendHoverRequestResponse(null)

  // Test go to declaration + getTextDocument
  const definitionRequestPromise = waitClientRequest(connection.onDefinition)
  editor.trigger('me', 'editor.action.goToDeclaration', {})
  const [, sendDefinitionRequestResponse] = await definitionRequestPromise
  sendDefinitionRequestResponse({
    uri: 'file:///tmp/project/src/main/Otherfile.java',
    range: Range.create(1, 1, 1, 10)
  })

  const editorOpenDeferred = pDefer<monaco.editor.IStandaloneCodeEditor>()
  const editorHandlerDisposable = registerEditorOpenHandler(async (model) => {
    // do nothing
    const editor = createEditor(document.createElement('div'), {
      model
    })
    setTimeout(() => {
      editorOpenDeferred.resolve(editor)
    })
    editorHandlerDisposable.dispose()
    return editor
  })

  const [getDocumentRequest, sendGetDocumentRequestResponse] = await waitClientRequest<GetTextDocumentParams, GetTextDocumentResult, never>(handler => connection.onRequest(getTextDocumentRequestType, handler))
  expect(getDocumentRequest).toEqual({
    textDocument: {
      uri: 'file:///tmp/project/src/main/Otherfile.java'
    }
  })
  sendGetDocumentRequestResponse({
    text: 'other file content'
  })

  // Expect the model to be open
  expect(await waitClientNotification(connection.onDidOpenTextDocument)).toEqual({
    textDocument: {
      uri: 'file:///tmp/project/src/main/Otherfile.java',
      languageId: 'java',
      version: 1,
      text: 'other file content'
    }
  })

  const createdEditor = await editorOpenDeferred.promise
  createdEditor.dispose()

  // Expect the model to be closed
  expect(await waitClientNotification(connection.onDidCloseTextDocument)).toEqual({
    textDocument: {
      uri: 'file:///tmp/project/src/main/Otherfile.java'
    }
  })

  editor.dispose()
  model.dispose()

  // Expect the model to be closed
  expect(await waitClientNotification(connection.onDidCloseTextDocument)).toEqual({
    textDocument: {
      uri: 'file:///tmp/project/src/main/Toto.java'
    }
  })

  const disposePromise = languageClient.dispose()

  const [, sendShutdownResponse] = await waitClientRequest<void, void, void>((handler) => connection.onShutdown((token) => handler(undefined, token)))
  sendShutdownResponse()

  await waitClientNotification<void>(handler => connection.onExit(() => handler(undefined)))

  await disposePromise

  expect(onRemainingRequest).not.toHaveBeenCalled()
  expect(onRemainingNotification).not.toHaveBeenCalled()
}

describe('Infrastructure', () => {
  test('Codingame behavior without mutualization', async () => {
    await testLanguageClient(false, false)
  })

  test('Codingame behavior with mutualization', async () => {
    await testLanguageClient(false, true)
  })

  test('With automatic text document update ', async () => {
    await testLanguageClient(true, false)
  })
})
