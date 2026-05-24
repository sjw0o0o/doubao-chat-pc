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

export interface BackendResponse<T> {
  code: number
  message: string
  data: T
  traceId: string | null
  msg: string | null
}

export interface RawSession {
  session_id: string
  title: string
}

export interface RawFile {
  fileName: string | null
  fileType: string
  url: string
  fileId: string
}

export interface RawSessionMessage {
  role: Role
  content: string
  fileList?: RawFile[]
  timestamp: string
  qaId: string
}

export interface GetSessionsData {
  sessions: RawSession[]
  user_id: string
}

export interface GetSessionData {
  sessionId: string
  userId: string
  createdAt: string
  messages: RawSessionMessage[]
  total: number
  pageNo: number
  pageSize: number
  totalPages: number
}

export interface StreamStartData {
  session_id: string
  mode: string
}

export interface StreamStatusData {
  phase: string
  message: string
  mode_used: string
}

export interface StreamContentData {
  chunk: string
}

export interface StreamDoneData {
  response: string
  elapsed_ms?: number
  mode_used?: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  thinking?: string
}

export type StreamEvent =
  | { event: 'start'; data: StreamStartData }
  | { event: 'status'; data: StreamStatusData }
  | { event: 'content'; data: StreamContentData }
  | { event: 'done'; data: StreamDoneData }
  | { event: string; data: unknown }
