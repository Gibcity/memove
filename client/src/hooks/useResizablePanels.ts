import { useState, useEffect, useRef } from 'react'

const MIN_SIDEBAR = 200
const MAX_SIDEBAR = 520

// ponytail: #34 — transparent full-viewport overlay during a drag. Stops
// iframes/embeds from capturing mousemove (they'd otherwise steal the
// events and the drag would never release). One shared utility, every
// caller of this hook benefits.
function createDragShield(): HTMLDivElement {
  const el = document.createElement('div')
  el.setAttribute('data-drag-shield', '')
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '9999',
    cursor: 'col-resize',
    background: 'transparent',
  })
  return el
}

export function useResizablePanels() {
  const [leftWidth, setLeftWidth] = useState<number>(() => parseInt(localStorage.getItem('sidebarLeftWidth') || '') || 340)
  const [rightWidth, setRightWidth] = useState<number>(() => parseInt(localStorage.getItem('sidebarRightWidth') || '') || 300)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const isResizingLeft = useRef(false)
  const isResizingRight = useRef(false)

  useEffect(() => {
    let shield: HTMLDivElement | null = null
    const removeShield = () => {
      if (shield && shield.isConnected) {
        document.body.removeChild(shield)
      }
      shield = null
    }
    const onMove = (e: MouseEvent) => {
      if (isResizingLeft.current) {
        const w = Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, e.clientX - 10))
        setLeftWidth(w)
        localStorage.setItem('sidebarLeftWidth', String(w))
      }
      if (isResizingRight.current) {
        const w = Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, window.innerWidth - e.clientX - 10))
        setRightWidth(w)
        localStorage.setItem('sidebarRightWidth', String(w))
      }
    }
    const onUp = () => {
      isResizingLeft.current = false
      isResizingRight.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      removeShield()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      removeShield()
    }
  }, [])

  const startResizeLeft = () => {
    isResizingLeft.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    // ponytail: shield is appended lazily on first mousemove so the initial
    // click on the resize handle still hits the handle, not the overlay.
    document.addEventListener('mousemove', appendShieldOnce, { once: true })
  }
  const startResizeRight = () => {
    isResizingRight.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', appendShieldOnce, { once: true })
  }

  function appendShieldOnce() {
    const shield = createDragShield()
    document.body.appendChild(shield)
    const cleanup = () => {
      document.removeEventListener('mouseup', cleanup)
      if (shield.isConnected) document.body.removeChild(shield)
    }
    document.addEventListener('mouseup', cleanup)
  }

  return { leftWidth, rightWidth, leftCollapsed, rightCollapsed, setLeftCollapsed, setRightCollapsed, startResizeLeft, startResizeRight }
}
