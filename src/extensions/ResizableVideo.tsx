import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2, RefreshCw } from 'lucide-react'
import { useDriveMedia } from '../hooks/useDriveMedia'

export interface ResizableVideoOptions {
  HTMLAttributes: Record<string, any>
}

type LayoutMode = 'inline' | 'wrap' | 'break' | 'front'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableVideo: {
      setResizableVideo: (options: { src: string; width?: number; type?: 'embed' | 'file'; layout?: LayoutMode; driveFileId?: string }) => ReturnType
    }
  }
}

const HANDLE_SIZE = 44

function toEmbedUrl(url: string): string {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
  const ytShortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/)
  if (ytShortsMatch) return `https://www.youtube.com/embed/${ytShortsMatch[1]}`
  const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/)
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  return url
}

function detectVideoType(url: string): 'embed' | 'file' {
  const embedPatterns = [
    /youtube\.com\/watch\?v=/,
    /youtu\.be\//,
    /youtube\.com\/shorts\//,
    /vimeo\.com\//,
  ]
  return embedPatterns.some(p => p.test(url)) ? 'embed' : 'file'
}

function ResizableVideoNodeView(props: any) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(false)
  const [playMode, setPlayMode] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number; aspect: number; handle: string; axis: 'both' | 'h' | 'v' } | null>(null)

  useEffect(() => {
    const ed = props.editor
    const onSelect = () => {
      setSelected(ed.isActive('resizableVideo'))
    }
    ed.on('selectionUpdate', onSelect)
    return () => { ed.off('selectionUpdate', onSelect) }
  }, [props.editor])

  useEffect(() => {
    if (!playMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlayMode(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [playMode])

  const onPointerDown = useCallback((handle: string, axis: 'both' | 'h' | 'v') => (e: React.PointerEvent) => {
    e.preventDefault()
    const el = contentRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      aspect: rect.width / rect.height,
      handle,
      axis,
    }

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return

      const dx = ev.clientX - d.startX
      const dy = ev.clientY - d.startY

      const sx = d.handle.includes('e') ? 1 : -1
      const sy = d.handle.includes('s') ? 1 : -1

      let w: number, h: number

      if (d.axis === 'v') {
        h = Math.max(60, d.startH + sy * dy)
        w = d.startW
      } else if (d.axis === 'h') {
        w = Math.max(60, d.startW + sx * dx)
        h = d.startH
      } else {
        const useDx = Math.abs(dx) >= Math.abs(dy)
        const delta = useDx ? dx : dy
        const sign = useDx ? sx : sy
        w = Math.max(60, d.startW + sign * delta)
        h = w / d.aspect
      }

      if (el) {
        el.style.width = `${w}px`
        el.style.height = `${h}px`
      }
    }

    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      const el = contentRef.current
      if (el && dragRef.current) {
        const w = Math.round(el.getBoundingClientRect().width)
        props.updateAttributes({ width: w })
      }
      dragRef.current = null
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [props.updateAttributes])

  const { blobUrl, isLoading: driveLoading, error: driveError, refresh: refreshDrive } = useDriveMedia(props.node.attrs.driveFileId)
  const width = props.node.attrs.width || undefined
  const layout: LayoutMode = props.node.attrs.layout || 'break'
  const src = props.node.attrs.driveFileId ? blobUrl : props.node.attrs.src
  const type = props.node.attrs.driveFileId ? 'file' : (props.node.attrs.type || 'file')

  const embedHeight = width ? Math.round(width * 9 / 16) : 360

  const getWrapperStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {}
    switch (layout) {
      case 'wrap':
        return { ...base, display: 'inline-block', float: 'left', marginRight: '1.5rem', marginBottom: '0.5rem' }
      case 'inline':
        return { ...base, display: 'inline-block' }
      case 'break':
        return { ...base, display: 'inline-block', marginTop: '0.5rem', marginBottom: '0.5rem' }
      case 'front':
        return { ...base, display: 'inline-block', position: 'relative', zIndex: 1, top: '-2rem', marginBottom: '-2rem' }
      default:
        return { ...base, display: 'inline-block' }
    }
  }

  const getContentStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: width ? `${width}px` : '100%',
      display: 'block',
      margin: 0,
    }
    if (type === 'embed') {
      base.height = width ? `${embedHeight}px` : '360px'
    } else {
      base.height = 'auto'
    }
    return base
  }

  const layouts: { key: LayoutMode; label: string }[] = [
    { key: 'inline', label: 'In' },
    { key: 'wrap', label: 'Wr' },
    { key: 'break', label: 'Br' },
    { key: 'front', label: 'Fr' },
  ]
  const handleLayoutClick = useCallback((l: LayoutMode) => {
    props.updateAttributes({ layout: l })
  }, [props.updateAttributes])

  return (
    <NodeViewWrapper
      className="relative"
      style={getWrapperStyle()}
      data-drag-handle="true"
    >
      {selected && (
        <div
          className="absolute"
          style={{
            bottom: '100%', left: '50%', transform: 'translateX(-50%)',
            marginBottom: 8, whiteSpace: 'nowrap', zIndex: 10,
          }}
        >
          <div
            className="flex items-center gap-1 rounded-full border shadow-lg px-1 py-1 backdrop-blur-md"
            style={{
              backgroundColor: '#ffffff',
              borderColor: '#e5e7eb',
            }}
          >
            {layouts.map((l) => (
              <button
                key={l.key}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => handleLayoutClick(l.key)}
                className="text-[10px] font-mono font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer select-none"
                style={{
                  padding: '3px 7px',
                  color: layout === l.key ? '#ffffff' : '#6b7280',
                  backgroundColor: layout === l.key ? '#3b82f6' : 'transparent',
                }}
              >
                {l.label}
              </button>
            ))}
            <button
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setPlayMode(!playMode)}
              className="text-[10px] font-mono font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer select-none"
              style={{
                padding: '3px 7px',
                color: playMode ? '#ffffff' : '#6b7280',
                backgroundColor: playMode ? '#3b82f6' : 'transparent',
              }}
              title={playMode ? 'Stop' : 'Play'}
            >
              {playMode ? 'Stop' : 'Play'}
            </button>
            <div className="w-px h-4 mx-1" style={{ backgroundColor: '#e5e7eb' }} />
            <button
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => props.deleteNode()}
              className="p-1.5 rounded-full transition-all hover:bg-red-100 active:scale-95 cursor-pointer"
              style={{ color: '#ef4444' }}
              title="Delete video"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      <div ref={contentRef} style={{ ...getContentStyle(), position: 'relative' }}>
        {props.node.attrs.driveFileId && driveLoading ? (
          <div
            style={{
              width: '100%', height: width ? `${Math.round(width * 9 / 16)}px` : '180px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#f0f0f0', borderRadius: 8,
            }}
          >
            <div className="w-5 h-5 border-2 border-zinc-300 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : props.node.attrs.driveFileId && driveError ? (
          <div
            onClick={refreshDrive}
            style={{
              width: '100%', height: width ? `${Math.round(width * 9 / 16)}px` : '180px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#fef2f2', borderRadius: 8, cursor: 'pointer', gap: 4,
              color: '#ef4444', fontSize: 11, fontFamily: 'monospace',
            }}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Tap to retry</span>
          </div>
        ) : type === 'embed' ? (
          <iframe
            src={src}
            style={{
              width: '100%', height: '100%', border: 0, display: 'block',
              pointerEvents: playMode ? 'auto' : 'none',
            }}
            allowFullScreen
            draggable={false}
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        ) : (
          <video
            src={src}
            style={{
              width: '100%', height: 'auto', display: 'block',
              pointerEvents: playMode ? 'auto' : 'none',
            }}
            controls
            draggable={false}
          />
        )}
        {!playMode && (
          <div
            className="absolute inset-0 z-10"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              const pos = props.getPos()
              props.editor.chain().focus().setNodeSelection(pos).run()
            }}
            onDoubleClick={() => setPlayMode(true)}
          />
        )}
      </div>

      {selected && (
        <>
          <div
            onPointerDown={onPointerDown('nw', 'both')}
            className="absolute"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE,
              top: -(HANDLE_SIZE / 2), left: -(HANDLE_SIZE / 2),
              cursor: 'nwse-resize', touchAction: 'none',
            }}
          >
            <div className="w-3 h-3 rounded-sm border-2 border-white shadow-md absolute"
              style={{ backgroundColor: '#3b82f6', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          </div>
          <div
            onPointerDown={onPointerDown('n', 'v')}
            className="absolute"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE,
              top: -(HANDLE_SIZE / 2), left: '50%',
              transform: 'translateX(-50%)',
              cursor: 'ns-resize', touchAction: 'none',
            }}
          >
            <div className="w-3 h-3 rounded-sm border-2 border-white shadow-md absolute"
              style={{ backgroundColor: '#3b82f6', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          </div>
          <div
            onPointerDown={onPointerDown('ne', 'both')}
            className="absolute"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE,
              top: -(HANDLE_SIZE / 2), right: -(HANDLE_SIZE / 2),
              cursor: 'nesw-resize', touchAction: 'none',
            }}
          >
            <div className="w-3 h-3 rounded-sm border-2 border-white shadow-md absolute"
              style={{ backgroundColor: '#3b82f6', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          </div>
          <div
            onPointerDown={onPointerDown('e', 'h')}
            className="absolute"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE,
              top: '50%', right: -(HANDLE_SIZE / 2),
              transform: 'translateY(-50%)',
              cursor: 'ew-resize', touchAction: 'none',
            }}
          >
            <div className="w-3 h-3 rounded-sm border-2 border-white shadow-md absolute"
              style={{ backgroundColor: '#3b82f6', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          </div>
          <div
            onPointerDown={onPointerDown('se', 'both')}
            className="absolute"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE,
              bottom: -(HANDLE_SIZE / 2), right: -(HANDLE_SIZE / 2),
              cursor: 'nwse-resize', touchAction: 'none',
            }}
          >
            <div className="w-3 h-3 rounded-sm border-2 border-white shadow-md absolute"
              style={{ backgroundColor: '#3b82f6', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          </div>
          <div
            onPointerDown={onPointerDown('s', 'v')}
            className="absolute"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE,
              bottom: -(HANDLE_SIZE / 2), left: '50%',
              transform: 'translateX(-50%)',
              cursor: 'ns-resize', touchAction: 'none',
            }}
          >
            <div className="w-3 h-3 rounded-sm border-2 border-white shadow-md absolute"
              style={{ backgroundColor: '#3b82f6', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          </div>
          <div
            onPointerDown={onPointerDown('w', 'h')}
            className="absolute"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE,
              top: '50%', left: -(HANDLE_SIZE / 2),
              transform: 'translateY(-50%)',
              cursor: 'ew-resize', touchAction: 'none',
            }}
          >
            <div className="w-3 h-3 rounded-sm border-2 border-white shadow-md absolute"
              style={{ backgroundColor: '#3b82f6', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          </div>
          <div
            onPointerDown={onPointerDown('sw', 'both')}
            className="absolute"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE,
              bottom: -(HANDLE_SIZE / 2), left: -(HANDLE_SIZE / 2),
              cursor: 'nesw-resize', touchAction: 'none',
            }}
          >
            <div className="w-3 h-3 rounded-sm border-2 border-white shadow-md absolute"
              style={{ backgroundColor: '#3b82f6', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          </div>
        </>
      )}
    </NodeViewWrapper>
  )
}

const ResizableVideo = Node.create<ResizableVideoOptions>({
  name: 'resizableVideo',

  group: 'block',

  draggable: true,

  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      width: { default: null },
      type: { default: 'file' },
      layout: { default: 'break', parseHTML: (el) => el.getAttribute('data-layout') },
      driveFileId: { default: null, parseHTML: (el) => el.getAttribute('data-drive-file-id') },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-video-src]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs: Record<string, any> = {
      'data-video-src': HTMLAttributes.src,
      'data-video-type': HTMLAttributes.type || 'file',
    }
    if (HTMLAttributes.width) {
      attrs['data-width'] = HTMLAttributes.width
    }
    if (HTMLAttributes.layout && HTMLAttributes.layout !== 'break') {
      attrs['data-layout'] = HTMLAttributes.layout
    }
    if (HTMLAttributes.driveFileId) {
      attrs['data-drive-file-id'] = HTMLAttributes.driveFileId
    }
    return ['div', mergeAttributes(this.options.HTMLAttributes, attrs)]
  },

  addCommands() {
    return {
      setResizableVideo: (options) => ({ tr, dispatch }) => {
        const node = this.type.create(options)
        if (dispatch) {
          dispatch(tr.replaceSelectionWith(node))
        }
        return true
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableVideoNodeView)
  },
})

export { toEmbedUrl, detectVideoType }
export default ResizableVideo
