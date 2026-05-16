import { useEffect, useRef } from 'react'
import type { Message } from '../../app/types/chat'
import MarkdownContent from './MarkdownContent'

type MessageListProps = {
  messages: Message[]
  loading: boolean
}

export default function MessageList({ messages, loading }: MessageListProps) {
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  return (
    <div className="message-list" ref={listRef}>
      {loading ? <div className="message-empty">正在加载消息...</div> : null}
      {!loading && messages.length === 0 ? <div className="message-empty">开始一段新的对话吧</div> : null}

      {messages.map((message) => (
        <div key={message.id} className={`message-row ${message.role}`}>
          <div className={`message-bubble ${message.role}`}>
            <MarkdownContent content={message.content} />
            {message.pending ? <span className="message-status">发送中...</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}
