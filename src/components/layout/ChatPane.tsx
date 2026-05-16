import type { Conversation, Message } from '../../app/types/chat'
import ChatInput from '../chat/ChatInput'
import MessageList from '../chat/MessageList'

type ChatPaneProps = {
  conversation: Conversation | null
  messages: Message[]
  sending: boolean
  loadingMessages: boolean
  onSend: (content: string) => Promise<void>
}

export default function ChatPane({
  conversation,
  messages,
  sending,
  loadingMessages,
  onSend,
}: ChatPaneProps) {
  if (!conversation) {
    return (
      <section className="chat-pane">
        <div className="chat-empty">请先在左侧新建会话</div>
      </section>
    )
  }

  return (
    <section className="chat-pane">
      <header className="chat-header">{conversation.title}</header>
      <MessageList messages={messages} loading={loadingMessages} />
      <ChatInput disabled={sending} onSend={onSend} />
    </section>
  )
}
