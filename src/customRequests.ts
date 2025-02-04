import { ProtocolNotificationType, ProtocolRequestType } from 'vscode-languageserver-protocol'
import { LanguageClient } from './languageClient'

export interface WillShutdownParams {
  delay: number
}
export const willShutdownNotificationType = new ProtocolNotificationType<WillShutdownParams, void>(
  'willShutdown'
)

export interface WriteFileParams {
  uri: string
  content: string
}

export const writeFileRequestType = new ProtocolRequestType<
  WriteFileParams,
  void,
  never,
  void,
  void
>('file/write')

export interface ReadFileParams {
  uri: string
}

export interface ReadFileResult {
  content: string
}

export const readFileRequestType = new ProtocolRequestType<
  ReadFileParams,
  ReadFileResult,
  never,
  void,
  void
>('file/read')

export interface StatFileParams {
  uri: string
}
export interface StatFileResult {
  type: 'directory' | 'file'
  size: number
  name: string
  mtime: number
}

export const getFileStatsRequestType = new ProtocolRequestType<
  StatFileParams,
  StatFileResult,
  never,
  void,
  void
>('file/stats')

export interface ListFilesParams {
  directory: string
}
export interface ListFilesResult {
  files: string[]
}

export const listFileRequestType = new ProtocolRequestType<
  ListFilesParams,
  ListFilesResult,
  never,
  void,
  void
>('file/readdir')

export function writeFile(
  uri: string,
  content: string,
  languageClient: LanguageClient
): Promise<void> {
  return languageClient.sendRequest(writeFileRequestType, {
    uri,
    content
  })
}

export function readFile(uri: string, languageClient: LanguageClient): Promise<ReadFileResult> {
  return languageClient.sendRequest(readFileRequestType, {
    uri
  })
}

export function getFileStats(uri: string, languageClient: LanguageClient): Promise<StatFileResult> {
  return languageClient.sendRequest(getFileStatsRequestType, {
    uri
  })
}

export function listFiles(
  directory: string,
  languageClient: LanguageClient
): Promise<ListFilesResult> {
  return languageClient.sendRequest(listFileRequestType, {
    directory
  })
}
