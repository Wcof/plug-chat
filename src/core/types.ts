export type ProviderId = 'doubao' | 'qianwen' | 'deepseek' | 'chatgpt' | 'gemini'

export interface Provider {
  id: ProviderId
  name: string
  url: string
  origins: readonly string[]
  color: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export interface ChatSnapshot {
  provider: ProviderId
  url: string
  title: string
  capturedAt: string
  messages: ChatMessage[]
  coverage: 'loaded-messages'
  warnings: string[]
}

export interface SessionTarget {
  id: string
  title: string
}

export type TransferMode = 'all' | 'recent' | 'selected' | 'incremental'

export interface TransferOptions {
  mode: TransferMode
  recentCount?: number
  selectedIds?: string[]
  instruction: string
}

export interface PreparedTransfer {
  targetId: string
  chatKey: string
  text: string
  messages: ChatMessage[]
  fingerprints: string[]
  sourceCharacters: number
  sentCharacters: number
  skippedMessages: number
}

export class ChatError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'ChatError'
  }
}
