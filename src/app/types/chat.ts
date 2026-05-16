export type Role = 'user' | 'assistant'

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  conversationId: string
  role: Role
  content: string
  createdAt: string
  pending?: boolean
}

export interface SendChatPayload {
  conversationId: string
  content: string
}

export interface SendChatResponse {
  conversation: Conversation
  userMessage: Message
  assistantMessage: Message
}
