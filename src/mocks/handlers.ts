import { delay, http, HttpResponse } from 'msw'
import type { Conversation, Message } from '../app/types/chat'
import getSessionsFixture from '../../mock/geSessions?raw'
import getSessionFixture from '../../mock/getSession?raw'
import streamFixture from '../../mock/stream?raw'
import { conversations, createId, getNowISO, messagesByConversation } from './data'

function sortConversations() {
  conversations.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
}

function buildAssistantReply(input: string) {
  return `你刚刚说的是：\n\n> ${input}\n\n这里是一个 mock 回复示例：\n\n- 支持会话管理\n- 支持 Markdown 渲染\n- 可随时替换为真实后端接口`
}

export const handlers = [
  http.get('/api/getSessions', async () => {
    await delay(120)
    return HttpResponse.json(JSON.parse(getSessionsFixture))
  }),

  http.get('/api/getSession', async ({ request }) => {
    await delay(120)
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId')
    const response = JSON.parse(getSessionFixture)

    if (sessionId && response.data) {
      response.data.sessionId = sessionId
    }

    return HttpResponse.json(response)
  }),

  http.post('/stream/chat', () => {
    const encoder = new TextEncoder()
    const blocks = streamFixture.split(/\r?\n\r?\n/).filter((block) => block.trim())

    const stream = new ReadableStream({
      async start(controller) {
        for (const block of blocks) {
          controller.enqueue(encoder.encode(`${block}\n\n`))
          await delay(45)
        }

        controller.close()
      },
    })

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  }),

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
