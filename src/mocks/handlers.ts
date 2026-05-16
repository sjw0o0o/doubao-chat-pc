import { delay, http, HttpResponse } from 'msw'
import type { Conversation, Message } from '../app/types/chat'
import { conversations, createId, getNowISO, messagesByConversation } from './data'

function sortConversations() {
  conversations.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
}

function buildAssistantReply(input: string) {
  return `你刚刚说的是：\n\n> ${input}\n\n这里是一个 mock 回复示例：\n\n- 支持会话管理\n- 支持 Markdown 渲染\n- 可随时替换为真实后端接口`
}

export const handlers = [
  http.get('/api/conversations', async () => {
    await delay(180)
    sortConversations()
    return HttpResponse.json({ conversations })
  }),

  http.post('/api/conversations', async () => {
    await delay(120)
    const now = getNowISO()
    const conversation: Conversation = {
      id: createId('conv'),
      title: '新会话',
      createdAt: now,
      updatedAt: now,
    }

    conversations.unshift(conversation)
    messagesByConversation[conversation.id] = []

    return HttpResponse.json({ conversation })
  }),

  http.get('/api/conversations/:id/messages', async ({ params }) => {
    await delay(120)
    const id = String(params.id)
    const messages = messagesByConversation[id] ?? []
    return HttpResponse.json({ messages })
  }),

  http.post('/api/chat', async ({ request }) => {
    await delay(600)

    const body = (await request.json()) as { conversationId?: string; content?: string }
    const content = (body.content ?? '').trim()

    if (!content) {
      return HttpResponse.json({ message: '内容不能为空' }, { status: 400 })
    }

    let conversation = conversations.find((item) => item.id === body.conversationId)
    const now = getNowISO()

    if (!conversation) {
      conversation = {
        id: (body.conversationId ?? '').trim() || createId('conv'),
        title: '新会话',
        createdAt: now,
        updatedAt: now,
      }
      conversations.unshift(conversation)
      messagesByConversation[conversation.id] = []
    }

    const userMessage: Message = {
      id: createId('msg-user'),
      conversationId: conversation.id,
      role: 'user',
      content,
      createdAt: now,
    }

    const assistantMessage: Message = {
      id: createId('msg-assistant'),
      conversationId: conversation.id,
      role: 'assistant',
      content: buildAssistantReply(content),
      createdAt: getNowISO(),
    }

    if (conversation.title === '新会话') {
      conversation.title = content.slice(0, 20) || '新会话'
    }

    conversation.updatedAt = assistantMessage.createdAt

    const currentMessages = messagesByConversation[conversation.id] ?? []
    currentMessages.push(userMessage, assistantMessage)
    messagesByConversation[conversation.id] = currentMessages

    sortConversations()

    return HttpResponse.json({
      conversation,
      userMessage,
      assistantMessage,
    })
  }),
]
