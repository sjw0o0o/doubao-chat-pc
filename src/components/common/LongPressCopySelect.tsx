import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

type Point = {
  x: number
  y: number
}

type FloatingPosition = {
  left: number
  top: number
}

type TextPosition = {
  node: Text
  offset: number
}

type SelectionState = {
  start: TextPosition
  end: TextPosition
}

type SelectionOverlay = {
  rects: DOMRect[]
  startHandle: FloatingPosition
  endHandle: FloatingPosition
  copyPosition: FloatingPosition
}

type DragHandle = 'start' | 'end' | null

type LongPressCopySelectProps = {
  text: string
  children: ReactNode
  disabled?: boolean
  longPressDelay?: number
}

type DocumentWithCaretRange = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null
  caretPositionFromPoint?: (x: number, y: number) => {
    offsetNode: Node
    offset: number
  } | null
}

const MOVE_THRESHOLD = 8
const MENU_WIDTH = 164
const MENU_HEIGHT = 48
const SELECT_COPY_WIDTH = 72
const DEFAULT_SELECTION_LENGTH = 4

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getRangeRect(range: Range) {
  const rect = range.getBoundingClientRect()
  if (rect.width || rect.height) return rect

  for (const item of Array.from(range.getClientRects())) {
    if (item.width || item.height) return item
  }

  return rect
}

function selectionIntersectsNode(selection: Selection, node: Node) {
  if (selection.rangeCount === 0) return false

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index)
    if (range.intersectsNode(node)) return true
  }

  return false
}

function getSelectedCopyPosition(range: Range, root: HTMLElement): FloatingPosition {
  const rect = getRangeRect(range)
  const fallbackRect = root.getBoundingClientRect()
  const targetRect = rect.width || rect.height ? rect : fallbackRect

  return {
    left: clamp(targetRect.left + targetRect.width / 2 - SELECT_COPY_WIDTH / 2, 12, window.innerWidth - SELECT_COPY_WIDTH - 12),
    top: Math.max(12, targetRect.top - 48),
  }
}

function createRangeFromSelection(selection: SelectionState) {
  const range = document.createRange()
  range.setStart(selection.start.node, selection.start.offset)
  range.setEnd(selection.end.node, selection.end.offset)
  return range
}

function compareTextPosition(a: TextPosition, b: TextPosition) {
  if (a.node === b.node) return a.offset - b.offset

  const position = a.node.compareDocumentPosition(b.node)
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
  return 0
}

function normalizeSelection(start: TextPosition, end: TextPosition): SelectionState {
  return compareTextPosition(start, end) <= 0 ? { start, end } : { start: end, end: start }
}

function getSelectionOverlay(selection: SelectionState, root: HTMLElement): SelectionOverlay {
  const range = createRangeFromSelection(selection)
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width && rect.height)
  const fallbackRect = getRangeRect(range)
  const visibleRects = rects.length > 0 ? rects : [fallbackRect]
  const firstRect = visibleRects[0]
  const lastRect = visibleRects[visibleRects.length - 1]

  return {
    rects: visibleRects,
    startHandle: {
      left: firstRect.left,
      top: firstRect.top + firstRect.height,
    },
    endHandle: {
      left: lastRect.right,
      top: lastRect.top + lastRect.height,
    },
    copyPosition: getSelectedCopyPosition(range, root),
  }
}

function applyNativeSelection(selection: SelectionState) {
  const nativeSelection = window.getSelection()
  if (!nativeSelection) return

  const range = createRangeFromSelection(selection)
  nativeSelection.removeAllRanges()
  nativeSelection.addRange(range)
}

function getSelectionText(selection: SelectionState) {
  return createRangeFromSelection(selection).toString()
}

function getCaretRangeFromPoint(point: Point) {
  const caretDocument = document as DocumentWithCaretRange

  if (caretDocument.caretRangeFromPoint) {
    return caretDocument.caretRangeFromPoint(point.x, point.y)
  }

  if (caretDocument.caretPositionFromPoint) {
    const position = caretDocument.caretPositionFromPoint(point.x, point.y)
    if (!position) return null

    const range = document.createRange()
    range.setStart(position.offsetNode, position.offset)
    range.collapse(true)
    return range
  }

  return null
}

function getTextPositionFromPoint(root: HTMLElement, point: Point): TextPosition | null {
  const caretRange = getCaretRangeFromPoint(point)
  if (caretRange && root.contains(caretRange.startContainer)) {
    if (caretRange.startContainer.nodeType === Node.TEXT_NODE) {
      return {
        node: caretRange.startContainer as Text,
        offset: caretRange.startOffset,
      }
    }

    const walker = document.createTreeWalker(caretRange.startContainer, NodeFilter.SHOW_TEXT)
    const firstTextNode = walker.nextNode() as Text | null
    if (firstTextNode) {
      return { node: firstTextNode, offset: 0 }
    }
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })

  let nearest: TextPosition | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  let textNode = walker.nextNode() as Text | null

  while (textNode) {
    for (let offset = 0; offset <= textNode.length; offset += 1) {
      const range = document.createRange()
      range.setStart(textNode, offset)
      range.setEnd(textNode, Math.min(offset + 1, textNode.length))
      const rect = getRangeRect(range)

      if (rect.width || rect.height) {
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const distance = Math.hypot(centerX - point.x, centerY - point.y)

        if (distance < nearestDistance) {
          nearestDistance = distance
          nearest = { node: textNode, offset }
        }
      }
    }

    textNode = walker.nextNode() as Text | null
  }

  return nearest
}

function getTextPositionAfter(root: HTMLElement, start: TextPosition, length: number): TextPosition {
  let remaining = length
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  let foundStart = false

  while (node) {
    if (node === start.node) {
      foundStart = true
      const available = node.length - start.offset
      if (remaining <= available) {
        return { node, offset: start.offset + remaining }
      }
      remaining -= available
    } else if (foundStart) {
      if (remaining <= node.length) {
        return { node, offset: remaining }
      }
      remaining -= node.length
    }

    node = walker.nextNode() as Text | null
  }

  return { node: start.node, offset: start.node.length }
}

export default function LongPressCopySelect({
  text,
  children,
  disabled = false,
  longPressDelay = 550,
}: LongPressCopySelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const pressTimerRef = useRef<number | null>(null)
  const pressPointRef = useRef<Point | null>(null)
  const longPressTriggeredRef = useRef(false)
  const [menuPosition, setMenuPosition] = useState<FloatingPosition | null>(null)
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null)
  const [selectionOverlay, setSelectionOverlay] = useState<SelectionOverlay | null>(null)
  const dragHandleRef = useRef<DragHandle>(null)
  const selecting = selectionState !== null

  function clearPressTimer() {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

  function closeMenu() {
    setMenuPosition(null)
  }

  function clearSelection() {
    window.getSelection()?.removeAllRanges()
    setSelectionState(null)
    setSelectionOverlay(null)
    dragHandleRef.current = null
  }

  function setCustomSelection(nextSelection: SelectionState) {
    const root = rootRef.current
    if (!root) return

    const normalizedSelection = normalizeSelection(nextSelection.start, nextSelection.end)
    setSelectionState(normalizedSelection)
    setSelectionOverlay(getSelectionOverlay(normalizedSelection, root))
    applyNativeSelection(normalizedSelection)
  }

  function openMenu(point: Point) {
    longPressTriggeredRef.current = true
    setSelectionOverlay(null)
    setMenuPosition({
      left: clamp(point.x - MENU_WIDTH / 2, 12, window.innerWidth - MENU_WIDTH - 12),
      top: clamp(point.y - MENU_HEIGHT - 12, 12, window.innerHeight - MENU_HEIGHT - 12),
    })
  }

  async function handleCopyWhole() {
    await copyText(text)
    closeMenu()
    clearSelection()
  }

  function handleSelectFromPressPoint() {
    const root = rootRef.current
    const pressPoint = pressPointRef.current
    if (!root || !pressPoint) return

    const start = getTextPositionFromPoint(root, pressPoint)
    if (!start) return

    const end = getTextPositionAfter(root, start, DEFAULT_SELECTION_LENGTH)
    closeMenu()
    setCustomSelection({ start, end })
  }

  async function handleCopySelection() {
    const selectedText = selectionState ? getSelectionText(selectionState) : window.getSelection()?.toString() ?? ''
    if (!selectedText.trim()) return

    await copyText(selectedText)
    clearSelection()
  }

  function startDragHandle(handle: DragHandle) {
    dragHandleRef.current = handle
  }

  const updateDragSelection = useCallback((point: Point) => {
    const root = rootRef.current
    const selection = selectionState
    const handle = dragHandleRef.current
    if (!root || !selection || !handle) return

    const position = getTextPositionFromPoint(root, point)
    if (!position) return

    if (handle === 'start') {
      setCustomSelection({ start: position, end: selection.end })
      return
    }

    setCustomSelection({ start: selection.start, end: position })
  }, [selectionState])

  function stopDragHandle() {
    dragHandleRef.current = null
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || event.pointerType === 'mouse' && event.button !== 0) return

    clearPressTimer()
    longPressTriggeredRef.current = false
    pressPointRef.current = { x: event.clientX, y: event.clientY }
    pressTimerRef.current = window.setTimeout(() => {
      if (!pressPointRef.current) return
      openMenu(pressPointRef.current)
    }, longPressDelay)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const point = pressPointRef.current
    if (!point) return

    const distance = Math.hypot(event.clientX - point.x, event.clientY - point.y)
    if (distance > MOVE_THRESHOLD) {
      clearPressTimer()
      pressPointRef.current = null
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    clearPressTimer()

    if (longPressTriggeredRef.current) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  useEffect(() => {
    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      const root = rootRef.current

      if (root && target && root.contains(target)) return
      closeMenu()
    }

    function handleSelectionChange() {
      const root = rootRef.current
      const nativeSelection = window.getSelection()

      if (!root) return

      if (selectionState) {
        setSelectionOverlay(getSelectionOverlay(selectionState, root))
        return
      }

      if (!nativeSelection || nativeSelection.rangeCount === 0 || nativeSelection.isCollapsed) {
        setSelectionOverlay(null)
        return
      }

      if (!selectionIntersectsNode(nativeSelection, root)) {
        setSelectionOverlay(null)
        return
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu()
        clearSelection()
      }
    }

    function handleScroll() {
      closeMenu()
      if (!selectionState) return

      const root = rootRef.current
      if (!root) return
      setSelectionOverlay(getSelectionOverlay(selectionState, root))
    }

    function handlePointerMove(event: PointerEvent) {
      if (!dragHandleRef.current) return
      event.preventDefault()
      updateDragSelection({ x: event.clientX, y: event.clientY })
    }

    function handlePointerUp() {
      stopDragHandle()
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerUp)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      clearPressTimer()
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [selectionState, updateDragSelection])

  return (
    <>
      <div
        ref={rootRef}
        className={`long-press-copy-select ${selecting ? 'selecting' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onContextMenu={(event) => {
          if (!disabled) event.preventDefault()
        }}
      >
        {children}
      </div>

      {menuPosition ? (
        <div
          className="long-press-copy-menu"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="long-press-copy-menu-btn"
            onPointerDown={(event) => event.preventDefault()}
            onClick={handleCopyWhole}
          >
            复制
          </button>
          <button
            type="button"
            className="long-press-copy-menu-btn"
            onPointerDown={(event) => event.preventDefault()}
            onClick={handleSelectFromPressPoint}
          >
            选择
          </button>
        </div>
      ) : null}

      {selectionOverlay ? (
        <div className="long-press-selection-layer" aria-hidden="true">
          {selectionOverlay.rects.map((rect, index) => (
            <span
              key={`${rect.left}-${rect.top}-${index}`}
              className="long-press-selection-highlight"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
              }}
            />
          ))}
          <span
            className="long-press-selection-handle start"
            style={{ left: selectionOverlay.startHandle.left, top: selectionOverlay.startHandle.top }}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              startDragHandle('start')
            }}
          />
          <span
            className="long-press-selection-handle end"
            style={{ left: selectionOverlay.endHandle.left, top: selectionOverlay.endHandle.top }}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              startDragHandle('end')
            }}
          />
        </div>
      ) : null}

      {selectionOverlay ? (
        <button
          type="button"
          className="long-press-selected-copy-btn"
          style={{ left: selectionOverlay.copyPosition.left, top: selectionOverlay.copyPosition.top }}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={handleCopySelection}
        >
          复制
        </button>
      ) : null}
    </>
  )
}
