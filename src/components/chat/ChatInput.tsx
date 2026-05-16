import { useState } from 'react'

type ChatInputProps = {
  disabled: boolean
  onSend: (content: string) => Promise<void>
}

export default function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [value, setValue] = useState('')

  const handleSend = async () => {
    const content = value.trim()
    if (!content || disabled) return
    setValue('')
    await onSend(content)
  }

  return (
    <div className="chat-input-wrap">
      <textarea
        className="chat-input"
        placeholder="输入消息，Enter 发送，Shift + Enter 换行"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void handleSend()
          }
        }}
      />
      <button type="button" className="send-btn" disabled={disabled} onClick={() => void handleSend()}>
        发送
      </button>
    </div>
  )
}
