import { request } from './client'
import type { Conversation, Message, SendChatPayload, SendChatResponse } from '../types/chat'

export function fetchConversations() {
  return request<{ conversations: Conversation[] }>('/conversations')
}

export function createConversation() {
  return request<{ conversation: Conversation }>('/conversations', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function fetchMessages(conversationId: string) {
  return request<{ messages: Message[] }>(`/conversations/${conversationId}/messages`)
}

export function sendMessage(payload: SendChatPayload) {
  return request<SendChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
