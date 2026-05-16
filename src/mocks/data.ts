import type { Conversation, Message } from '../app/types/chat'

const now = new Date().toISOString()

export const conversations: Conversation[] = [
  {
    id: 'conv-1',
    title: '欢迎使用 x-markdown 对话',
    createdAt: now,
    updatedAt: now,
  },
]

export const messagesByConversation: Record<string, Message[]> = {
  'conv-1': [
    {
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'assistant',
      content: '# 你好\n\n这是一个使用 **@ant-design/x-markdown** 渲染的会话页面。\n\n- 左侧可以切换历史会话\n- 右侧可以查看和发送消息',
      createdAt: now,
    },
  ],
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function getNowISO() {
  return new Date().toISOString()
}
