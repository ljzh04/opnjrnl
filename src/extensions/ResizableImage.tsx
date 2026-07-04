import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2, RefreshCw } from 'lucide-react'
import { useDriveMedia } from '../hooks/useDriveMedia'

export interface ResizableImageOptions {
  HTMLAttributes: Record<string, any>
}

type LayoutMode = 'inline' | 'wrap' | 'break' | 'front'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setResizableImage: (options: { src: string; width?: number; alt?: string; layout?: LayoutMode; driveFileId?: string }) => ReturnType
    }
  }
}

const HANDLE_SIZE = 44

function ResizableImageNodeView(props: any) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [selected, setSelected] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number; aspect: number; handle: string; axis: 'both' | 'h' | 'v' } | null>(null)

  useEffect(() => {
    const ed = props.editor
    const onSelect = () => {
      setSelected(ed.isActive('resizableImage'))
    }
    ed.on('selectionUpdate', onSelect)
    return () => { ed.off('selectionUpdate', onSelect) }
  }, [props.editor])

  const onPointerDown = useCallback((handle: string, axis: 'both' | 'h' | 'v') => (e: React.PointerEvent) => {
    e.preventDefault()
    const img = imgRef.current
    if (!img) return

    const rect = img.getBoundingClientRect()
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

      if (img) {
        img.style.width = `${w}px`
        img.style.height = `${h}px`
      }
    }

    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      const img = imgRef.current
      if (img && dragRef.current) {
        const w = Math.round(img.width)
        props.updateAttributes({ width: w })
      }
      dragRef.current = null
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [props.updateAttributes])

  const { blobUrl, isLoading: driveLoading, error: driveError, refresh: refreshDrive } = useDriveMedia(props.node.attrs.driveFileId)
  const effectiveSrc = props.node.attrs.driveFileId ? blobUrl : props.node.attrs.src
  const width = props.node.attrs.width || undefined
  const layout: LayoutMode = props.node.attrs.layout || 'break'

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

  const getImageStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: width ? `${width}px` : '100%',
      height: 'auto',
      display: 'block',
      margin: 0,
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
            <div className="w-px h-4 mx-1" style={{ backgroundColor: '#e5e7eb' }} />
            <button
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => props.deleteNode()}
              className="p-1.5 rounded-full transition-all hover:bg-red-100 active:scale-95 cursor-pointer"
              style={{ color: '#ef4444' }}
              title="Delete image"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
      {props.node.attrs.driveFileId && driveLoading ? (
        <div
          style={{
            ...getImageStyle(),
            width: width ? `${width}px` : '200px',
            height: '150px',
            backgroundColor: '#f0f0f0',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="w-5 h-5 border-2 border-zinc-300 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : props.node.attrs.driveFileId && driveError ? (
        <div
          onClick={refreshDrive}
          style={{
            ...getImageStyle(),
            width: width ? `${width}px` : '200px',
            height: '150px',
            backgroundColor: '#fef2f2',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            gap: 4,
            color: '#ef4444',
            fontSize: 11,
            fontFamily: 'monospace',
          }}
        >
          <RefreshCw className="w-4 h-4" />
          <span>Tap to retry</span>
        </div>
      ) : (
        <img
          ref={imgRef}
          src={effectiveSrc || ''}
          alt={props.node.attrs.alt || ''}
          style={getImageStyle()}
          draggable={false}
        />
      )}
      {selected && (
        <>
          {/* NW */}
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
          {/* N */}
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
          {/* NE */}
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
          {/* E */}
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
          {/* SE */}
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
          {/* S */}
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
          {/* W */}
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
          {/* SW */}
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

const ResizableImage = Node.create<ResizableImageOptions>({
  name: 'resizableImage',

  group: 'block',

  draggable: true,

  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      width: { default: null },
      layout: { default: 'break', parseHTML: (el) => el.getAttribute('data-layout') },
      driveFileId: { default: null, parseHTML: (el) => el.getAttribute('data-drive-file-id') },
    }
  },

  parseHTML() {
    return [
      { tag: 'img[src]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs: Record<string, any> = {
      src: HTMLAttributes.src,
      alt: HTMLAttributes.alt || null,
    }
    if (HTMLAttributes.width) {
      attrs.width = HTMLAttributes.width
    }
    if (HTMLAttributes.layout && HTMLAttributes.layout !== 'break') {
      attrs['data-layout'] = HTMLAttributes.layout
    }
    if (HTMLAttributes.driveFileId) {
      attrs['data-drive-file-id'] = HTMLAttributes.driveFileId
    }
    return ['img', mergeAttributes(this.options.HTMLAttributes, attrs)]
  },

  addCommands() {
    return {
      setResizableImage: (options) => ({ tr, dispatch }) => {
        const node = this.type.create(options)
        if (dispatch) {
          dispatch(tr.replaceSelectionWith(node))
        }
        return true
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView)
  },
})

export default ResizableImage
