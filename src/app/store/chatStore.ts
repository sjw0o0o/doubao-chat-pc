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

  initialize: async () => {
    if (get().initialized) return

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
    const { messages } = await fetchMessages(conversationId)

    set((state) => ({
      loadingMessages: false,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: messages,
      },
    }))
  },

  setActiveConversation: (conversationId: string) => {
    set({ activeConversationId: conversationId })

    const messages = get().messagesByConversation[conversationId]
    if (!messages) {
      void get().loadMessages(conversationId)
    }
  },

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

  sendMessage: async (content: string) => {
    const text = content.trim()
    if (!text) return

    let conversationId = get().activeConversationId
    if (!conversationId) {
      await get().createConversation()
      conversationId = get().activeConversationId
      if (!conversationId) return
    }

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
