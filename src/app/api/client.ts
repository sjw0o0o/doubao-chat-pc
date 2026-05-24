type SseEvent = {
  event: string
  data: unknown
}

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? ''

export function buildApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_ORIGIN}${normalizedPath}`
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

function parseSseBlock(block: string): SseEvent | null {
  const trimmed = block.trim()
  if (!trimmed) return null

  let event = 'message'
  const dataLines: string[] = []

  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }

  const rawData = dataLines.join('\n')
  let data: unknown = rawData

  try {
    data = JSON.parse(rawData)
  } catch {
    data = rawData
  }

  return { event, data }
}

export function requestSseByXhr<TBody>({
  path,
  method = 'POST',
  body,
  onEvent,
  signal,
}: {
  path: string
  method?: 'GET' | 'POST'
  body?: TBody
  onEvent: (event: SseEvent) => void
  signal?: AbortSignal
}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let cursor = 0
    let buffer = ''

    function consumeText(text: string) {
      buffer += text
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        const event = parseSseBlock(block)
        if (event) onEvent(event)
      }
    }

    function abortRequest() {
      xhr.abort()
      reject(new DOMException('Request aborted', 'AbortError'))
    }

    xhr.open(method, buildApiUrl(path), true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('Accept', 'text/event-stream')

    xhr.onprogress = () => {
      const nextText = xhr.responseText.slice(cursor)
      cursor = xhr.responseText.length
      consumeText(nextText)
    }

    xhr.onload = () => {
      const nextText = xhr.responseText.slice(cursor)
      cursor = xhr.responseText.length
      consumeText(nextText)

      const pendingEvent = parseSseBlock(buffer)
      if (pendingEvent) onEvent(pendingEvent)
      buffer = ''

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }

      reject(new Error(`Request failed: ${xhr.status}`))
    }

    xhr.onerror = () => reject(new Error('Network request failed'))
    xhr.ontimeout = () => reject(new Error('Network request timed out'))
    xhr.onabort = () => reject(new DOMException('Request aborted', 'AbortError'))

    if (signal) {
      if (signal.aborted) {
        abortRequest()
        return
      }
      signal.addEventListener('abort', abortRequest, { once: true })
    }

    xhr.send(body === undefined ? null : JSON.stringify(body))
  })
}
