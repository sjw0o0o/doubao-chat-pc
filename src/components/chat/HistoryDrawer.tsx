import { Popup } from 'antd-mobile'
import type { Conversation } from '../../app/types/chat'
import ConversationList from './ConversationList'

type HistoryDrawerProps = {
  open: boolean
  conversations: Conversation[]
  activeConversationId: string | null
  onSelect: (conversationId: string) => void
  onClose: () => void
}

export default function HistoryDrawer({
  open,
  conversations,
  activeConversationId,
  onSelect,
  onClose,
}: HistoryDrawerProps) {
  return (
    <Popup
      visible={open}
      onMaskClick={onClose}
      position="left"
      bodyClassName="history-drawer-panel"
    >
      <div className="history-drawer-content">
        <div className="history-search">
          <span className="history-search-icon">⌕</span>
          <span>搜索</span>
        </div>

        <button type="button" className="history-profile" onClick={onClose}>
          <span className="history-avatar">豆</span>
          <span>豆包</span>
        </button>

        <nav className="history-nav" aria-label="快捷入口">
          <button type="button">AI 创作</button>
          <button type="button">发现智能体</button>
        </nav>

        <div className="history-divider" />

        <div className="history-list-wrap">
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={(conversationId) => {
              onSelect(conversationId)
              onClose()
            }}
          />
        </div>

        <div className="history-footer">
          <span className="history-footer-avatar">洛</span>
          <span>洛北_</span>
          <span className="history-footer-actions">⌗  ♡  ⚙</span>
        </div>
      </div>
    </Popup>
  )
}
