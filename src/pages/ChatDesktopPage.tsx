import { useEffect } from 'react'
import { useChatStore } from '../app/store/chatStore'
import ChatPane from '../components/layout/ChatPane'
import Sidebar from '../components/layout/Sidebar'

export default function ChatDesktopPage() {
  const initialized = useChatStore((state) => state.initialized)
  const conversations = useChatStore((state) => state.conversations)
  const activeConversationId = useChatStore((state) => state.activeConversationId)
  const messagesByConversation = useChatStore((state) => state.messagesByConversation)
  const sending = useChatStore((state) => state.sending)
  const loadingMessages = useChatStore((state) => state.loadingMessages)
  const initialize = useChatStore((state) => state.initialize)
  const createConversation = useChatStore((state) => state.createConversation)
  const setActiveConversation = useChatStore((state) => state.setActiveConversation)
  const sendMessage = useChatStore((state) => state.sendMessage)

  useEffect(() => {
    if (!initialized) {
      void initialize()
    }
  }, [initialized, initialize])

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? null

  const messages = activeConversationId ? (messagesByConversation[activeConversationId] ?? []) : []

  return (
    <main className="chat-page">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onCreate={createConversation}
        onSelect={setActiveConversation}
      />

      <ChatPane
        conversation={activeConversation}
        messages={messages}
        sending={sending}
        loadingMessages={loadingMessages}
        onSend={sendMessage}
      />
    </main>
  )
}
