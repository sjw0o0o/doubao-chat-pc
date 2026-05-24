import { create } from 'zustand'
import {
  createConversation as apiCreateConversation,
  fetchConversations,
  fetchMessages,
  fetchSession,
  fetchSessions,
  sendMessage as apiSendMessage,
  streamChat,
} from '../api/chatApi'
import type { Conversation, Message, StreamDoneData } from '../types/chat'

const STORAGE_KEY = 'doubao-chat-state-v1'

interface ChatState {
  initialized: boolean
  loadingMessages: boolean
  sending: boolean
  conversations: Conversation[]
  activeConversationId: string | null
  messagesByConversation: Record<string, Message[]>
  initialize: () => Promise<void>
  setActiveConversation: (conversationId: string) => void
  createConversation: () => Promise<void>
  sendMessage: (content: string) => Promise<void>
  loadMessages: (conversationId: string) => Promise<void>
}

type PersistedChatState = Pick<
  ChatState,
  'conversations' | 'activeConversationId' | 'messagesByConversation'
>

function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
}

function upsertConversation(conversations: Conversation[], target: Conversation) {
  const exists = conversations.some((item) => item.id === target.id)
  if (!exists) {
    return [target, ...conversations]
  }

  return conversations.map((item) => (item.id === target.id ? target : item))
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function loadPersistedState(): PersistedChatState | null {
  if (!canUseStorage()) return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as PersistedChatState

    if (!Array.isArray(parsed.conversations)) return null
    if (typeof parsed.messagesByConversation !== 'object' || parsed.messagesByConversation === null) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function savePersistedState(state: PersistedChatState) {
  if (!canUseStorage()) return

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      conversations: state.conversations,
      activeConversationId: state.activeConversationId,
      messagesByConversation: state.messagesByConversation,
    }),
  )
}

function createLocalConversation(title = '新会话'): Conversation {
  const now = new Date().toISOString()

  return {
    id: `local-${Date.now()}`,
    title,
    createdAt: now,
    updatedAt: now,
  }
}

function updateMessage(
  messages: Message[],
  messageId: string,
  updater: (message: Message) => Message,
) {
  return messages.map((message) => (message.id === messageId ? updater(message) : message))
}

function getDoneResponse(data: unknown) {
  if (typeof data !== 'object' || data === null) return ''
  return ((data as StreamDoneData).response ?? '').trim()
}

export const useChatStore = create<ChatState>((set, get) => ({
  initialized: false,
  loadingMessages: false,
  sending: false,
  conversations: [],
  activeConversationId: null,
  messagesByConversation: {},

  // 初始化：优先读取后端会话列表，失败时再恢复本地缓存。
  initialize: async () => {
    if (get().initialized) return

    try {
      const conversations = await fetchSessions()
      const activeConversationId = conversations[0]?.id ?? null

      set({
        initialized: true,
        conversations,
        activeConversationId,
        messagesByConversation: {},
      })

      if (activeConversationId) {
        await get().loadMessages(activeConversationId)
      }

      return
    } catch {
      const persisted = loadPersistedState()
      if (persisted && persisted.conversations.length > 0) {
        const sorted = sortConversations(persisted.conversations)
        const activeConversationId =
          persisted.activeConversationId && sorted.some((item) => item.id === persisted.activeConversationId)
            ? persisted.activeConversationId
            : sorted[0]?.id ?? null

        set({
          initialized: true,
          conversations: sorted,
          activeConversationId,
          messagesByConversation: persisted.messagesByConversation,
        })
        return
      }
    }

    const { conversations } = await fetchConversations()
    const sorted = sortConversations(conversations)

    if (sorted.length === 0) {
      await get().createConversation()
      set({ initialized: true })
      return
    }

    const activeConversationId = sorted[0].id
    set({ conversations: sorted, activeConversationId, initialized: true })
    await get().loadMessages(activeConversationId)
  },

  loadMessages: async (conversationId: string) => {
    const cachedMessages = get().messagesByConversation[conversationId]
    if (cachedMessages) return

    set({ loadingMessages: true })

    try {
      const messages = conversationId.startsWith('local-')
        ? []
        : await fetchSession(conversationId)

      set((state) => ({
        loadingMessages: false,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: messages,
        },
      }))
    } catch {
      const { messages } = await fetchMessages(conversationId)

      set((state) => ({
        loadingMessages: false,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: messages,
        },
      }))
    }
  },

  // 切换会话：先更新激活会话，再按需懒加载消息。
  setActiveConversation: (conversationId: string) => {
    set({ activeConversationId: conversationId })

    const messages = get().messagesByConversation[conversationId]
    if (!messages) {
      void get().loadMessages(conversationId)
    }
  },

  // 新建会话：后端不可用时创建本地会话，保证发送流程可继续。
  createConversation: async () => {
    try {
      const { conversation } = await apiCreateConversation()

      set((state) => ({
        conversations: sortConversations([conversation, ...state.conversations]),
        activeConversationId: conversation.id,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversation.id]: state.messagesByConversation[conversation.id] ?? [],
        },
      }))
    } catch {
      const conversation = createLocalConversation()

      set((state) => ({
        conversations: [conversation, ...state.conversations],
        activeConversationId: conversation.id,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversation.id]: [],
        },
      }))
    }
  },

  // 发送消息：先乐观插入用户消息，再用 XHR 流式回填 assistant 内容。
  sendMessage: async (content: string) => {
    const text = content.trim()
    if (!text || get().sending) return

    let conversationId = get().activeConversationId
    if (!conversationId) {
      await get().createConversation()
      conversationId = get().activeConversationId
      if (!conversationId) return
    }

    const now = new Date().toISOString()
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      conversationId,
      role: 'user',
      content: text,
      createdAt: now,
    }
    const assistantMessageId = `assistant-${Date.now()}`
    const assistantMessage: Message = {
      id: assistantMessageId,
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: now,
      pending: true,
    }

    set((state) => {
      const currentMessages = state.messagesByConversation[conversationId] ?? []
      const conversations = state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              title: conversation.title === '新会话' ? text.slice(0, 20) || '新会话' : conversation.title,
              updatedAt: now,
            }
          : conversation,
      )

      return {
        sending: true,
        conversations: sortConversations(conversations),
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...currentMessages, userMessage, assistantMessage],
        },
      }
    })

    try {
      let finalResponse = ''

      await streamChat({
        conversationId,
        content: text,
        onEvent: ({ event, data }) => {
          if (event === 'content' && typeof data === 'object' && data && 'chunk' in data) {
            const chunk = String(data.chunk ?? '')
            set((state) => {
              const currentMessages = state.messagesByConversation[conversationId] ?? []

              return {
                messagesByConversation: {
                  ...state.messagesByConversation,
                  [conversationId]: updateMessage(currentMessages, assistantMessageId, (message) => ({
                    ...message,
                    content: `${message.content}${chunk}`,
                  })),
                },
              }
            })
          }

          if (event === 'done') {
            finalResponse = getDoneResponse(data)
          }
        },
      })

      set((state) => {
        const currentMessages = state.messagesByConversation[conversationId] ?? []

        return {
          sending: false,
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: updateMessage(currentMessages, assistantMessageId, (message) => ({
              ...message,
              content: finalResponse || message.content,
              pending: false,
            })),
          },
        }
      })
    } catch {
      try {
        const { conversation, userMessage: realUserMessage, assistantMessage: realAssistantMessage } =
          await apiSendMessage({ conversationId, content: text })

        set((state) => {
          const currentMessages = state.messagesByConversation[conversationId] ?? []

          return {
            sending: false,
            conversations: sortConversations(upsertConversation(state.conversations, conversation)),
            messagesByConversation: {
              ...state.messagesByConversation,
              [conversationId]: currentMessages.map((message) => {
                if (message.id === userMessage.id) return realUserMessage
                if (message.id === assistantMessageId) return realAssistantMessage
                return message
              }),
            },
          }
        })
      } catch {
        set((state) => {
          const currentMessages = state.messagesByConversation[conversationId] ?? []

          return {
            sending: false,
            messagesByConversation: {
              ...state.messagesByConversation,
              [conversationId]: updateMessage(currentMessages, assistantMessageId, (message) => ({
                ...message,
                content: message.content || '抱歉，消息发送失败，请稍后重试。',
                pending: false,
              })),
            },
          }
        })
      }
    }
  },
}))

if (typeof window !== 'undefined') {
  useChatStore.subscribe((state) => {
    savePersistedState({
      conversations: state.conversations,
      activeConversationId: state.activeConversationId,
      messagesByConversation: state.messagesByConversation,
    })
  })
}
