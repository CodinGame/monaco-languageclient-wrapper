import { createEditor, initializePromise, monaco, registerEditorOpenHandler } from '@codingame/monaco-editor-wrapper'
import { initUserConfiguration } from '@codingame/monaco-vscode-configuration-service-override'
import { CompletionTriggerKind, ServerCapabilities, TextDocumentSyncKind, Range } from 'vscode-languageserver-protocol'
import {
  _Connection,
  _
} from 'vscode-languageserver/lib/common/api'
import { createModelReference } from 'vscode/monaco'
import * as vscode from 'vscode'
import { RegisteredFileSystemProvider, RegisteredMemoryFile, registerFileSystemOverlay } from '@codingame/monaco-vscode-files-service-override'
import pDefer, { TestInfrastructure, waitClientNotification, waitClientRequest } from './tools'
import { GetTextDocumentParams, getTextDocumentRequestType, GetTextDocumentResult, saveTextDocumentRequestType } from '../customRequests'
import { createLanguageClientManager, LanguageClientManager, getLanguageClientOptions, StaticLanguageClientId } from '..'

async function initializeLanguageClientAndGetConnection (
  languageClientId: StaticLanguageClientId,
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
  const mainFileUri = monaco.Uri.file('/tmp/project/src/main/Toto.java')
  const fs = new RegisteredFileSystemProvider(false)
  const fileContent = 'public class Toto {}'

  fs.registerFile(new RegisteredMemoryFile(mainFileUri, fileContent))
  const fileSystemDisposable = registerFileSystemOverlay(1, fs)

  const modelRef = await createModelReference(mainFileUri)
  const model = modelRef.object.textEditorModel!

  const el = document.createElement('div')
  document.body.append(el)
  const editor = createEditor(el, {
    model
  })

  // Expect the model to be open
  expect(await waitClientNotification(connection.onDidOpenTextDocument)).toEqual({
    textDocument: {
      uri: mainFileUri.toString(),
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
      uri: mainFileUri.toString(),
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

  // wait 1sec to be sure no request is sent during this interval
  await new Promise(resolve => setTimeout(resolve, 1000))

  // Test a completion request
  const completionRequestPromise = waitClientRequest(connection.onCompletion)
  editor.setPosition(new monaco.Position(1, 20))
  editor.trigger('me', 'editor.action.triggerSuggest', {})
  editor.focus()

  const [completionRequest, sendCompletionRequestResponse] = await completionRequestPromise
  expect(completionRequest).toEqual({
    textDocument: { uri: mainFileUri.toString() },
    position: { line: 0, character: 19 },
    context: {
      triggerKind: CompletionTriggerKind.Invoked,
      triggerCharacter: undefined
    }
  })
  sendCompletionRequestResponse(null)

  // Test a hover request
  const hoverRequestPromise = waitClientRequest(connection.onHover)
  await editor.getAction('editor.action.showHover')!.run()
  const [, sendHoverRequestResponse] = await hoverRequestPromise
  sendHoverRequestResponse(null)

  // Test go to declaration + getTextDocument
  const definitionRequestPromise = waitClientRequest(connection.onDefinition)

  void vscode.commands.executeCommand('editor.action.revealDefinition')

  const [, sendDefinitionRequestResponse] = await definitionRequestPromise
  sendDefinitionRequestResponse({
    uri: 'file:///tmp/project/src/main/Otherfile.java',
    range: Range.create(1, 1, 1, 10)
  })

  const editorOpenDeferred = pDefer<monaco.editor.IStandaloneCodeEditor>()
  const editorHandlerDisposable = registerEditorOpenHandler(async (modelRef) => {
    // do nothing
    const editor = createEditor(document.createElement('div'), {
      model: modelRef.object.textEditorModel
    })
    editor.onDidDispose(() => {
      modelRef.dispose()
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

  const openNotificationPromise = waitClientNotification(connection.onDidOpenTextDocument)

  sendGetDocumentRequestResponse({
    text: 'other file content'
  })

  // Expect the model to be open
  expect(await openNotificationPromise).toEqual({
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

  const savePromise = modelRef.object.save()

  // Expect the model to be saved
  const willSavePromise = waitClientNotification(connection.onWillSaveTextDocument)
  const saveRequestPromise = waitClientRequest(handler => connection.onRequest(saveTextDocumentRequestType, handler))
  const didSavePromise = waitClientNotification(connection.onDidSaveTextDocument)

  expect(await willSavePromise).toEqual({
    textDocument: {
      uri: mainFileUri.toString()
    },
    reason: vscode.TextDocumentSaveReason.Manual
  })
  const [saveRequest, sendSaveRequestResponse] = await saveRequestPromise
  expect(await saveRequest).toEqual({
    textDocument: {
      uri: mainFileUri.toString(),
      text: modelRef.object.textEditorModel!.getValue()
    }
  })
  sendSaveRequestResponse(null)

  expect(await didSavePromise).toEqual({
    textDocument: {
      uri: mainFileUri.toString()
    }
  })

  await savePromise

  editor.dispose()
  modelRef.dispose()

  // Expect the model to be closed
  expect(await waitClientNotification(connection.onDidCloseTextDocument)).toEqual({
    textDocument: {
      uri: mainFileUri.toString()
    }
  })

  fileSystemDisposable.dispose()

  const disposePromise = languageClient.dispose()

  const [, sendShutdownResponse] = await waitClientRequest<void, void, void>((handler) => connection.onShutdown((token) => handler(undefined, token)))
  sendShutdownResponse()

  await waitClientNotification<void>(handler => connection.onExit(() => handler(undefined)))

  await disposePromise

  expect(onRemainingRequest).not.toHaveBeenCalled()
  expect(onRemainingNotification).not.toHaveBeenCalled()
}

beforeAll(async () => {
  await initializePromise
})

void initUserConfiguration(JSON.stringify({
  'files.autoSave': 'off'
}))
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
