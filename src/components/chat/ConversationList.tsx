import type { Conversation } from '../../app/types/chat'

type ConversationListProps = {
  conversations: Conversation[]
  activeConversationId: string | null
  onSelect: (conversationId: string) => void
}

function formatDateText(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return <div className="conversation-empty">暂无历史会话</div>
  }

  return (
    <ul className="conversation-list">
      {conversations.map((conversation) => {
        const active = conversation.id === activeConversationId
        return (
          <li key={conversation.id}>
            <button
              type="button"
              className={`conversation-item ${active ? 'active' : ''}`}
              onClick={() => onSelect(conversation.id)}
            >
              <div className="conversation-title">{conversation.title}</div>
              <div className="conversation-time">{formatDateText(conversation.updatedAt)}</div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
