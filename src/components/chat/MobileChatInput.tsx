import { Button, TextArea } from 'antd-mobile'
import { useState } from 'react'

type MobileChatInputProps = {
  disabled: boolean
  onSend: (content: string) => Promise<void>
}

export default function MobileChatInput({ disabled, onSend }: MobileChatInputProps) {
  const [value, setValue] = useState('')
  const canSend = value.trim().length > 0 && !disabled

  async function handleSend() {
    const content = value.trim()
    if (!content || disabled) return

    setValue('')
    await onSend(content)
  }

  return (
    <div className="mobile-chat-input-wrap">
      <button type="button" className="mobile-input-icon" aria-label="打开相机">
        ⌾
      </button>
      <TextArea
        className="mobile-chat-input"
        value={value}
        onChange={setValue}
        placeholder="发消息或按住说话..."
        autoSize={{ minRows: 1, maxRows: 4 }}
        disabled={disabled}
      />
      <Button
        className="mobile-send-btn"
        color="primary"
        shape="rounded"
        size="small"
        disabled={!canSend}
        onClick={handleSend}
      >
        ↑
      </Button>
    </div>
  )
}
