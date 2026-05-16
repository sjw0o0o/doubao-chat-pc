import { create } from 'zustand'
import {
  createConversation as apiCreateConversation,
  fetchConversations,
  fetchMessages,
  sendMessage as apiSendMessage,
} from '../api/chatApi'
import type { Conversation, Message } from '../types/chat'

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const useChatStore = create<ChatState>((set, get) => ({
  initialized: false,
  loadingMessages: false,
  sending: false,
  conversations: [],
  activeConversationId: null,
  messagesByConversation: {},

  // 初始化：优先恢复本地缓存，其次拉取远端会话。
  initialize: async () => {
    if (get().initialized) return

    const persisted = loadPersistedState()
    // 命中缓存时直接恢复状态并结束初始化。
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

    const { conversations } = await fetchConversations()
    const sorted = sortConversations(conversations)

    // 首次进入且无会话时，自动创建一个默认会话。
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
    // 已有缓存则不重复请求。
    if (cachedMessages) return

    set({ loadingMessages: true })
    const { messages } = await fetchMessages(conversationId)

    set((state) => ({
      loadingMessages: false,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: messages,
      },
    }))
  },

  // 切换会话：先更新激活会话，再按需懒加载消息。
  setActiveConversation: (conversationId: string) => {
    set({ activeConversationId: conversationId })

    const messages = get().messagesByConversation[conversationId]
    if (!messages) {
      void get().loadMessages(conversationId)
    }
  },

  // 新建会话：插入列表并设为当前会话。
  createConversation: async () => {
    const { conversation } = await apiCreateConversation()

    set((state) => ({
      conversations: sortConversations([conversation, ...state.conversations]),
      activeConversationId: conversation.id,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversation.id]: state.messagesByConversation[conversation.id] ?? [],
      },
    }))
  },

  // 发送消息：先乐观插入用户消息，再用服务端结果回填。
  sendMessage: async (content: string) => {
    const text = content.trim()
    if (!text) return

    let conversationId = get().activeConversationId
    // 没有当前会话时先创建会话，保证后续发送有归属。
    if (!conversationId) {
      await get().createConversation()
      conversationId = get().activeConversationId
      if (!conversationId) return
    }

    // 先插入临时消息，立即反馈发送状态。
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
      pending: true,
    }

    set((state) => ({
      sending: true,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: [...(state.messagesByConversation[conversationId] ?? []), tempMessage],
      },
    }))

    try {
      const { conversation, userMessage, assistantMessage } = await apiSendMessage({
        conversationId,
        content: text,
      })

      const streamMessageId = `stream-${assistantMessage.id}`

      // 用真实 userMessage 替换临时消息，并挂载一个空的 assistant 流式消息。
      set((state) => {
        const currentMessages = state.messagesByConversation[conversationId] ?? []
        const replacedMessages = currentMessages.map((item) =>
          item.id === tempMessage.id ? userMessage : item,
        )

        return {
          conversations: sortConversations(upsertConversation(state.conversations, conversation)),
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: [
              ...replacedMessages,
              {
                ...assistantMessage,
                id: streamMessageId,
                content: '',
                pending: true,
              },
            ],
          },
        }
      })

      const fullContent = assistantMessage.content
      const chunkSize = 10

      for (let index = chunkSize; index <= fullContent.length + chunkSize; index += chunkSize) {
        const partial = fullContent.slice(0, index)

        set((state) => {
          const currentMessages = state.messagesByConversation[conversationId] ?? []
          return {
            messagesByConversation: {
              ...state.messagesByConversation,
              [conversationId]: currentMessages.map((item) =>
                item.id === streamMessageId ? { ...item, content: partial } : item,
              ),
            },
          }
        })

        await sleep(30)
      }

      set((state) => {
        const currentMessages = state.messagesByConversation[conversationId] ?? []

        return {
          sending: false,
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: currentMessages.map((item) =>
              item.id === streamMessageId ? assistantMessage : item,
            ),
          },
        }
      })
    } catch {
      const errorMessage: Message = {
        id: `msg-error-${Date.now()}`,
        conversationId,
        role: 'assistant',
        content: '抱歉，mock 服务暂时不可用，请稍后重试。',
        createdAt: new Date().toISOString(),
      }

      set((state) => {
        const currentMessages = state.messagesByConversation[conversationId] ?? []
        const replacedMessages = currentMessages.map((item) =>
          item.id === tempMessage.id ? { ...item, pending: false } : item,
        )

        return {
          sending: false,
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: [...replacedMessages, errorMessage],
          },
        }
      })
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
