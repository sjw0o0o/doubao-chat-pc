import { useEffect, useMemo, useState } from 'react'
import { useChatStore } from '../app/store/chatStore'
import HistoryDrawer from '../components/chat/HistoryDrawer'
import MessageList from '../components/chat/MessageList'
import MobileChatInput from '../components/chat/MobileChatInput'

export default function ChatMobilePage() {
  const [historyOpen, setHistoryOpen] = useState(false)
  const initialized = useChatStore((state) => state.initialized)
  const loadingMessages = useChatStore((state) => state.loadingMessages)
  const sending = useChatStore((state) => state.sending)
  const conversations = useChatStore((state) => state.conversations)
  const activeConversationId = useChatStore((state) => state.activeConversationId)
  const messagesByConversation = useChatStore((state) => state.messagesByConversation)
  const initialize = useChatStore((state) => state.initialize)
  const setActiveConversation = useChatStore((state) => state.setActiveConversation)
  const sendMessage = useChatStore((state) => state.sendMessage)

  useEffect(() => {
    if (!initialized) {
      void initialize()
    }
  }, [initialized, initialize])

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [activeConversationId, conversations],
  )
  const messages = activeConversationId ? (messagesByConversation[activeConversationId] ?? []) : []

  return (
    <main className="mobile-chat-page">
      <header className="mobile-chat-header">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label="打开历史会话"
          onClick={() => setHistoryOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>

        <div className="mobile-title-wrap">
          <div className="mobile-chat-title">豆包</div>
          <div className="mobile-chat-subtitle">内容由 AI 生成</div>
        </div>

        <div className="mobile-header-actions" aria-hidden="true">
          <span>☎</span>
          <span>⌁</span>
        </div>
      </header>

      <MessageList messages={messages} loading={!initialized || loadingMessages} />

      <MobileChatInput disabled={sending} onSend={sendMessage} />

      <HistoryDrawer
        open={historyOpen}
        conversations={conversations}
        activeConversationId={activeConversation?.id ?? null}
        onSelect={setActiveConversation}
        onClose={() => setHistoryOpen(false)}
      />
    </main>
  )
}
