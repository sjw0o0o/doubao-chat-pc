import type { Conversation } from '../../app/types/chat'
import ConversationList from '../chat/ConversationList'

type SidebarProps = {
  conversations: Conversation[]
  activeConversationId: string | null
  onCreate: () => Promise<void>
  onSelect: (conversationId: string) => void
}

export default function Sidebar({
  conversations,
  activeConversationId,
  onCreate,
  onSelect,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button type="button" className="new-chat-btn" onClick={() => void onCreate()}>
          + 新建会话
        </button>
      </div>

      <div className="sidebar-list">
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={onSelect}
        />
      </div>
    </aside>
  )
}
