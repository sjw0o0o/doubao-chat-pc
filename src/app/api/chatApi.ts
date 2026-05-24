import { request, requestSseByXhr } from './client'
import type {
  BackendResponse,
  Conversation,
  GetSessionData,
  GetSessionsData,
  Message,
  RawFile,
  RawSessionMessage,
  SendChatPayload,
  SendChatResponse,
  StreamEvent,
} from '../types/chat'

const ENDPOINTS = {
  conversations: '/api/conversations',
  conversationMessages: (conversationId: string) => `/api/conversations/${conversationId}/messages`,
  chat: '/api/chat',
  getSessions: '/api/getSessions',
  getSession: '/api/getSession',
  streamChat: '/stream/chat',
}

export function fetchConversations() {
  return request<{ conversations: Conversation[] }>(ENDPOINTS.conversations)
}

export function createConversation() {
  return request<{ conversation: Conversation }>(ENDPOINTS.conversations, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function fetchMessages(conversationId: string) {
  return request<{ messages: Message[] }>(ENDPOINTS.conversationMessages(conversationId))
}

export function sendMessage(payload: SendChatPayload) {
  return request<SendChatResponse>(ENDPOINTS.chat, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

function normalizeTimestamp(value?: string) {
  if (!value) return new Date().toISOString()
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function fileToMarkdown(file: RawFile) {
  const label = file.fileName || file.fileId || '文件'
  const lowerType = file.fileType.toLowerCase()

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(lowerType)) {
    return `![${label}](${file.url})`
  }

  return `[${label}](${file.url})`
}

function getMessageContent(message: RawSessionMessage) {
  const text = message.content.trim()
  if (text) return text
  return (message.fileList ?? []).map(fileToMarkdown).join('\n')
}

export function mapSessions(data: GetSessionsData): Conversation[] {
  const now = new Date().toISOString()

  return data.sessions.map((session, index) => ({
    id: session.session_id,
    title: session.title || '新会话',
    createdAt: now,
    updatedAt: new Date(Date.now() - index).toISOString(),
  }))
}

export function mapSessionMessages(data: GetSessionData): Message[] {
  return data.messages
    .map((message, index) => ({
      id: `${message.qaId}-${message.role}-${index}`,
      conversationId: data.sessionId,
      role: message.role,
      content: getMessageContent(message),
      createdAt: normalizeTimestamp(message.timestamp),
    }))
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
}

export async function fetchSessions() {
  const response = await request<BackendResponse<GetSessionsData>>(ENDPOINTS.getSessions)
  return mapSessions(response.data)
}

export async function fetchSession(sessionId: string) {
  const search = new URLSearchParams({ sessionId })
  const response = await request<BackendResponse<GetSessionData>>(`${ENDPOINTS.getSession}?${search}`)
  return mapSessionMessages(response.data)
}

export function streamChat({
  conversationId,
  content,
  onEvent,
  signal,
}: {
  conversationId: string
  content: string
  onEvent: (event: StreamEvent) => void
  signal?: AbortSignal
}) {
  return requestSseByXhr({
    path: ENDPOINTS.streamChat,
    body: {
      session_id: conversationId,
      content,
    },
    onEvent: (event) => onEvent(event as StreamEvent),
    signal,
  })
}
