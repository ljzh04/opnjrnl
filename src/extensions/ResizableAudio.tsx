import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { useCallback, useEffect, useState } from 'react'
import { Trash2, RefreshCw } from 'lucide-react'
import { useDriveMedia } from '../hooks/useDriveMedia'

export interface ResizableAudioOptions {
  HTMLAttributes: Record<string, any>
}

type LayoutMode = 'inline' | 'wrap' | 'break' | 'front'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableAudio: {
      setResizableAudio: (options: { src: string; layout?: LayoutMode; driveFileId?: string }) => ReturnType
    }
  }
}

function ResizableAudioNodeView(props: any) {
  const [selected, setSelected] = useState(false)

  useEffect(() => {
    const ed = props.editor
    const onSelect = () => {
      setSelected(ed.isActive('resizableAudio'))
    }
    ed.on('selectionUpdate', onSelect)
    return () => { ed.off('selectionUpdate', onSelect) }
  }, [props.editor])

  const { blobUrl, isLoading: driveLoading, error: driveError, refresh: refreshDrive } = useDriveMedia(props.node.attrs.driveFileId)
  const layout: LayoutMode = props.node.attrs.layout || 'break'
  const src = props.node.attrs.driveFileId ? blobUrl : props.node.attrs.src

  const getWrapperStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {}
    switch (layout) {
      case 'wrap':
        return { ...base, display: 'inline-block', float: 'left', marginRight: '1.5rem', marginBottom: '0.5rem' }
      case 'inline':
        return { ...base, display: 'inline-block' }
      case 'break':
        return { ...base, display: 'block', marginTop: '0.5rem', marginBottom: '0.5rem' }
      case 'front':
        return { ...base, display: 'inline-block', position: 'relative', zIndex: 1, top: '-2rem', marginBottom: '-2rem' }
      default:
        return { ...base, display: 'inline-block' }
    }
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
              title="Delete audio"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {props.node.attrs.driveFileId && driveLoading ? (
        <div
          style={{
            width: '100%', height: '60px',
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
            width: '100%', height: '60px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#fef2f2', borderRadius: 8, cursor: 'pointer', gap: 4,
            color: '#ef4444', fontSize: 11, fontFamily: 'monospace',
          }}
        >
          <RefreshCw className="w-4 h-4" />
          <span>Tap to retry</span>
        </div>
      ) : (
        <audio
          src={src}
          controls
          style={{ width: '100%', display: 'block' }}
          draggable={false}
        />
      )}
    </NodeViewWrapper>
  )
}

const ResizableAudio = Node.create<ResizableAudioOptions>({
  name: 'resizableAudio',

  group: 'block',

  draggable: true,

  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      layout: { default: 'break', parseHTML: (el) => el.getAttribute('data-layout') },
      driveFileId: { default: null, parseHTML: (el) => el.getAttribute('data-drive-file-id') },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-audio-src]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const attrs: Record<string, any> = {
      'data-audio-src': HTMLAttributes.src,
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
      setResizableAudio: (options) => ({ tr, dispatch }) => {
        const node = this.type.create(options)
        if (dispatch) {
          dispatch(tr.replaceSelectionWith(node))
        }
        return true
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableAudioNodeView)
  },
})

export default ResizableAudio
