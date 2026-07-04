import { JournalEntry, MinimalTheme, Attachment } from '../types';
import { format } from 'date-fns';
import { MOOD_SCALE } from '../themeData';
import { useEffect, useLayoutEffect, useState, useRef, KeyboardEvent, ReactNode, memo, useMemo } from 'react';
import {
  Heart, 
  Trash2, 
  Share2, 
  Check, 
  Plus, 
  X, 
  BookOpen, 
  Sparkles,
  Smile,
  Meh,
  Frown,
  CloudRain,
  Sun,
  Shield,
  Lock,
  Info,
  Paperclip,
  Link2,
  Bold,
  Italic,
  Underline,
  List,
  Type,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  ExternalLink,
  Unlink,
  Undo,
  Redo,
  Copy,
  Pen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import TipTapUnderline from '@tiptap/extension-underline';
import TipTapLink from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import ResizableImage from '../extensions/ResizableImage';
import ResizableVideo, { toEmbedUrl, detectVideoType } from '../extensions/ResizableVideo';
import { openGoogleDrivePicker } from '../lib/drivePicker';

const MOOD_ICONS: Record<string, ReactNode> = {
  terrible: <CloudRain className="w-5 h-5" />,
  bad: <Frown className="w-5 h-5" />,
  okay: <Meh className="w-5 h-5" />,
  good: <Smile className="w-5 h-5" />,
  great: <Sun className="w-5 h-5" />,
};

interface EditorProps {
  entry: JournalEntry | null;
  onUpdate: (id: string, updates: Partial<JournalEntry>) => void;
  onDelete: (id: string) => void;
  theme: MinimalTheme;
  allUserTags: string[];
  driveConnected: boolean;
}

function LinkBubbleContent({ editor, setLinkUrl, setShowLinkDialog }: {
  editor: Editor;
  setLinkUrl: (url: string) => void;
  setShowLinkDialog: (show: boolean) => void;
}) {
  const href = useEditorState({
    editor,
    selector: (ctx) => ctx.editor.getAttributes('link').href,
  })

  return (
    <div
      className="flex items-center gap-1 rounded-full border shadow-lg px-3 py-1.5 backdrop-blur-md text-xs"
      style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}
    >
      <a
        href={href || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate max-w-[180px] font-mono text-xs underline underline-offset-2"
        style={{ color: '#3b82f6' }}
        onClick={(e) => e.stopPropagation()}
      >
        {href}
      </a>
      <div className="w-px h-4 mx-1" style={{ backgroundColor: '#e5e7eb' }} />
      <button
        onClick={() => { if (href) navigator.clipboard.writeText(href) }}
        className="p-1.5 rounded-full transition-all hover:bg-black/5 active:scale-95 cursor-pointer"
        style={{ color: '#6b7280' }}
        title="Copy link"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => { setLinkUrl(href || ''); setShowLinkDialog(true) }}
        className="p-1.5 rounded-full transition-all hover:bg-black/5 active:scale-95 cursor-pointer"
        style={{ color: '#6b7280' }}
        title="Edit link"
      >
        <Pen className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => editor.chain().focus().unsetLink().run()}
        className="p-1.5 rounded-full transition-all hover:bg-black/5 active:scale-95 cursor-pointer"
        style={{ color: '#6b7280' }}
        title="Remove link"
      >
        <Unlink className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

const Editor = memo(function Editor({ entry, onUpdate, onDelete, theme, allUserTags, driveConnected }: EditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [showTagAdder, setShowTagAdder] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const linkSelectionRef = useRef<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      TipTapUnderline,
      TipTapLink.configure({ openOnClick: false }),
      ResizableImage,
      ResizableVideo,
      Placeholder.configure({ placeholder: "Begin writing..." }),
    ],
    content: entry?.content || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setContent(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm md:prose-base dark:prose-invert font-serif leading-[1.8] focus:outline-none min-h-[50vh] w-full max-w-[65ch] mx-auto',
      },
    },
  });

  

  // Sync state when active entry changes
  useEffect(() => {
    if (entry) {
      setTitle(entry.title);
      setContent(entry.content);
      setAttachments(entry.attachments || []);
      setShowDeleteConfirm(false);
      if (editor && editor.getHTML() !== entry.content) {
        queueMicrotask(() => editor.commands.setContent(entry.content));
      }
    } else {
      setTitle('');
      setContent('');
      setAttachments([]);
      setShowDeleteConfirm(false);
      if (editor) {
        queueMicrotask(() => editor.commands.setContent(''));
      }
    }
  }, [entry?.id, editor]);

  // Debounced auto-save
  useEffect(() => {
    if (!entry) return;
    
    const timeout = setTimeout(() => {
      onUpdate(entry.id, { 
        title, 
        content, 
        attachments,
        updatedAt: Date.now() 
      });
    }, 600);
    
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, attachments]);

  const resizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    
    // Preserve scroll position of the main scrolling container
    const scrollContainer = el.closest('.overflow-y-auto') as HTMLElement;
    const scrollPos = scrollContainer ? scrollContainer.scrollTop : 0;

    el.style.height = '0px';
    const newHeight = el.scrollHeight;
    el.style.height = `${newHeight}px`;

    if (scrollContainer) {
      scrollContainer.scrollTop = scrollPos;
    }
  };

  // Auto-resize textareas to expand with content

  useEffect(() => {
    const handleResize = () => {
      resizeTextarea(titleRef.current);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleFavorite = () => {
    if (!entry) return;
    const nextVal = !entry.isFavorite;
    onUpdate(entry.id, { isFavorite: nextVal });
    triggerToast(nextVal ? "Marked as Favorite" : "Removed from Favorites");
  };

  const handleAddTag = (tag: string) => {
    if (!entry) return;
    const trimmed = tag.trim().replace(/^#/, '');
    if (!trimmed) return;
    
    if (!entry.tags.includes(trimmed)) {
      const updatedTags = [...entry.tags, trimmed];
      onUpdate(entry.id, { tags: updatedTags });
      triggerToast(`Tagged as #${trimmed}`);
    }
    setNewTagInput('');
    setShowTagAdder(false);
  };

  const handleKeyDownTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag(newTagInput);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!entry) return;
    const updatedTags = entry.tags.filter(t => t !== tagToRemove);
    onUpdate(entry.id, { tags: updatedTags });
  };

  const applyFormatting = (format: string, url?: string, driveFileId?: string) => {
    if (!editor) return;
    switch (format) {
      case "bold":
        editor.chain().focus().toggleBold().run();
        break;
      case "italic":
        editor.chain().focus().toggleItalic().run();
        break;
      case "underline":
        editor.chain().focus().toggleUnderline().run();
        break;
      case "bulletList":
        editor.chain().focus().toggleBulletList().run();
        break;
      case "link":
        if (url) {
          const chain = editor.chain().focus()
          if (linkSelectionRef.current) {
            chain.setTextSelection(linkSelectionRef.current)
          }
          chain.setLink({ href: url }).run()
        } else {
          editor.chain().focus().unsetLink().run()
        }
        linkSelectionRef.current = null
        break;
      case "image":
        if (url || driveFileId) {
          editor.chain().focus().setResizableImage({ src: url || '', driveFileId }).run();
        }
        break;
      case "video":
        if (url || driveFileId) {
          const vType = driveFileId ? 'file' : detectVideoType(url || '');
          const embedUrl = vType === 'embed' ? toEmbedUrl(url || '') : (url || '');
          editor.chain().focus().setResizableVideo({ src: embedUrl, type: vType, driveFileId }).run();
        }
        break;
      case "undo":
        editor.chain().focus().undo().run();
        break;
      case "redo":
        editor.chain().focus().redo().run();
        break;
    }
  };

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => {
      setShowToast(prev => prev === msg ? null : prev);
    }, 2500);
  };

  // Fixed and robust Clipboard copy functionality (with foolproof fallback for sandbox iframes)
  const shareEntry = async () => {
    if (!entry) return;
    const textToCopy = `${entry.title || 'Untitled Entry'}\n${format(entry.createdAt, 'MMMM d, yyyy')}\n\n${entry.content}`;
    
    // Web Share API
    if (navigator.share) {
      try {
        await navigator.share({
          title: entry.title || 'Journal Entry',
          text: textToCopy,
        });
        return;
      } catch (err) {
        // Fallback to clipboard if user cancels or it fails
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        } else {
          return; // user cancelled share menu
        }
      }
    }

    // Try modern Navigator Clipboard API first
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        triggerToast("Copied content to clipboard");
        return;
      }
    } catch {
      // Ignore and attempt classic fallback mechanism
    }

    // Classic selection hack fallback (always works in embedded iframes/browsers)
    try {
      const tempTextArea = document.createElement("textarea");
      tempTextArea.value = textToCopy;
      tempTextArea.style.position = "fixed";
      tempTextArea.style.top = "0";
      tempTextArea.style.left = "0";
      tempTextArea.style.opacity = "0";
      document.body.appendChild(tempTextArea);
      tempTextArea.focus();
      tempTextArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(tempTextArea);
      
      if (success) {
        triggerToast("Copied content to clipboard");
      } else {
        triggerToast("Failed to copy content");
      }
    } catch {
      triggerToast("Copy failed");
    }
  };

  const wordsCount = useMemo(() => {
    return content.trim() === '' ? 0 : content.trim().split(/\s+/).length;
  }, [content]);

  // Extract all unique tags historically typed by user, excluding those on the active entry
  const availableTags = useMemo(() => {
    return allUserTags.filter((tag) => entry && !entry.tags.includes(tag));
  }, [allUserTags, entry]);

  if (!entry) {
    return (
      <div 
        className="flex-1 hidden md:flex flex-col h-full overflow-y-auto"
        style={{ backgroundColor: theme.surface }}
      >
        <div className="w-full max-w-2xl mx-auto px-8 py-12 flex-1 flex flex-col justify-between">
          
          {/* Main Hero & Identifiers */}
          <div className="flex flex-col mb-10">
            <div className="flex items-center gap-3.5 mb-5 select-none">
              <div 
                className="w-11 h-11 rounded-xl flex items-center justify-center border shadow-sm"
                style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.background }}
              >
                <BookOpen className="w-5 h-5 text-current opacity-75" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-bold tracking-tight" style={{ color: theme.textPrimary }}>
                  opnjrnl
                </h1>
                <p className="text-[9px] uppercase tracking-[0.2em] opacity-50 font-mono">
                  Autonomous personal ledger
                </p>
              </div>
            </div>

            <h2 className="text-xl md:text-2xl font-serif font-medium tracking-tight mb-4 leading-snug" style={{ color: theme.textPrimary }}>
              Your private space to capture life, moments, and daily reflections.
            </h2>
            
            <p className="text-sm font-sans opacity-75 leading-relaxed" style={{ color: theme.textSecondary }}>
              opnjrnl is an elegant, open-source personal writing companion built on a foundation of absolute privacy and local-first architecture. It works completely offline on all your devices with no setup, accounts, or trackers required.
            </p>
          </div>

          {/* Key Functionality & Features Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
            <div 
              className="p-5 rounded-xl border flex flex-col gap-2 shadow-sm"
              style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.background }}
            >
              <div className="flex items-center gap-2 mb-1" style={{ color: theme.textPrimary }}>
                <Shield className="w-4 h-4 opacity-80" />
                <h3 className="font-sans font-semibold text-xs tracking-wide uppercase">100% privacy & local-first</h3>
              </div>
              <p className="text-xs leading-relaxed opacity-70" style={{ color: theme.textSecondary }}>
                All written chapters, mood data, tags, and favorites are stored directly inside your browser's local sandbox memory (IndexedDB). No analytics, trackers, or centralized servers ever receive or parse your memories.
              </p>
            </div>

            <div 
              className="p-5 rounded-xl border flex flex-col gap-2 shadow-sm"
              style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.background }}
            >
              <div className="flex items-center gap-2 mb-1" style={{ color: theme.textPrimary }}>
                <Lock className="w-4 h-4 opacity-80" />
                <h3 className="font-sans font-semibold text-xs tracking-wide uppercase">Local screen lock & passwords</h3>
              </div>
              <p className="text-xs leading-relaxed opacity-70" style={{ color: theme.textSecondary }}>
                Safeguard the contents of your app against physical intruders using state-of-the-art WebAuthn biometric security (Face ID / Touch ID) or setup a traditional custom encrypted app passcode in your settings.
              </p>
            </div>

            <div 
              className="p-5 rounded-xl border flex flex-col gap-2 shadow-sm"
              style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.background }}
            >
              <div className="flex items-center gap-2 mb-1" style={{ color: theme.textPrimary }}>
                <Smile className="w-4 h-4 opacity-80" />
                <h3 className="font-sans font-semibold text-xs tracking-wide uppercase">Intuitive organization</h3>
              </div>
              <p className="text-xs leading-relaxed opacity-70" style={{ color: theme.textSecondary }}>
                Easily index, filter, and track patterns over time with natural daily mood tags, smart inline keyword indexing, favorite markers, automatic tag suggestions, and lightning-fast fuzzy global search.
              </p>
            </div>

            <div 
              className="p-5 rounded-xl border flex flex-col gap-2 shadow-sm"
              style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.background }}
            >
              <div className="flex items-center gap-2 mb-1" style={{ color: theme.textPrimary }}>
                <Sparkles className="w-4 h-4 opacity-80" />
                <h3 className="font-sans font-semibold text-xs tracking-wide uppercase">Visual ease themes</h3>
              </div>
              <p className="text-xs leading-relaxed opacity-70 font-sans" style={{ color: theme.textSecondary }}>
                Tailor your writing canvas to your immediate reading conditions. Effortlessly cycle between beautiful distraction-free styles like Warm Paper, Creamy Vintage, or Charcoal Midnight interfaces.
              </p>
            </div>
          </div>

          {/* Prominent Google Drive Scope & Transparency Disclosures */}
          <div 
            className="p-6 rounded-xl border flex flex-col gap-3.5 mb-11 shadow-sm"
            style={{ 
              borderColor: theme.surfaceBorder, 
              backgroundColor: theme.background,
              backgroundImage: 'linear-gradient(rgba(0,0,0,0.01), rgba(0,0,0,0.02))'
            }}
          >
            <div className="flex items-center gap-2.5" style={{ color: theme.accent }}>
              <Info className="w-5 h-5 shrink-0" />
              <h3 className="font-sans font-bold text-xs tracking-wide uppercase">
                Google Drive cloud sync & verification disclosure
              </h3>
            </div>
            
            <div className="text-xs leading-relaxed flex flex-col gap-3" style={{ color: theme.textSecondary }}>
              <p>
                To offer cross-device synchronization without hosting any custom cloud databases (which could compromise your private reflections), <strong>opnjrnl</strong> supports an <strong>optional, user-initiated backup integration to your own Google Drive storage</strong>.
              </p>
              
              <p>
                When you choose to authenticate with Google, our application requests access strictly through the official, unrestricted <strong><code className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-black/5 dark:bg-white/10 text-current font-bold">https://www.googleapis.com/auth/drive.appdata</code></strong> scope.
              </p>
              
              <ul className="list-disc pl-5 flex flex-col gap-1.5 font-sans mt-1">
                <li>
                  <strong>Scope limit:</strong> The app CANNOT view, read, modify, or delete any of your files, folders, documents, or photos in your Google Drive.
                </li>
                <li>
                  <strong>Exclusive purpose:</strong> Access is limited strictly to creating and updating its own hidden configuration and backup data (<code className="font-mono text-[10px] font-bold">opnjrnl_backup.json</code>) inside an application-isolated directory. This folder is managed solely by Google Drive for this app and is completely invisible to other applications and search indexers.
                </li>
                <li>
                  <strong>Self-custody ownership:</strong> Your journal data is transferred securely and directly between your browser database and your personal Google Drive storage space over HTTPS. It is never transmitted, processed, or logged by opnjrnl or any other third-party servers.
                </li>
              </ul>
            </div>
          </div>


          
        </div>
      </div>
    );
  }

  return (
    <div 
      className="flex-1 overflow-y-auto h-full relative selection:bg-zinc-200 transition-colors duration-300 scrollbar-thin md:scrollbar-thin"
      style={{ backgroundColor: theme.surface, color: theme.textPrimary }}
    >
      {/* Dynamic Tiny Alert Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute left-1/2 -translate-x-1/2 bottom-8 z-50 text-[11px] font-mono tracking-wider uppercase px-4 py-2.5 rounded shadow-lg flex items-center gap-1.5"
            style={{ backgroundColor: theme.accent, color: theme.surface }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{showToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor Canvas */}
      <article className="min-h-full pb-4 md:pb-6">
        <div className="w-full max-w-2xl mx-auto px-6 pt-6 md:pt-10 flex flex-col">
          
          <header className="shrink-0 flex flex-col">
            {/* Action Bar (Replaces Top Tool Shelf) */}
            <div className="flex justify-end items-center mb-6 min-h-[36px]">
            {showDeleteConfirm ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 bg-rose-50 dark:bg-rose-500/10 px-4 py-1.5 rounded-full text-xs select-none shadow-sm"
              >
                <span className="text-rose-600 dark:text-rose-400 font-semibold text-[10px] uppercase tracking-widest mr-1">Delete page?</span>
                <button
                  onClick={() => {
                    onDelete(entry.id);
                    setShowDeleteConfirm(false);
                  }}
                  className="px-3 py-1 text-[10px] uppercase tracking-widest bg-rose-500 active:bg-rose-600 active:scale-95 text-white rounded-full font-bold cursor-pointer transition-all shadow-sm"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1 text-[10px] uppercase tracking-widest bg-black/5 dark:bg-white/5 active:bg-black/10 dark:active:bg-white/10 rounded-full font-bold cursor-pointer transition-all active:scale-95"
                  style={{ color: theme.textPrimary }}
                >
                  Cancel
                </button>
              </motion.div>
            ) : (
              <div className="flex items-center gap-1 opacity-70 active:opacity-100 transition-opacity">
                {/* Favorite heart */}
                <button
                  onClick={toggleFavorite}
                  className="p-2 rounded-full cursor-pointer transition-colors active:bg-black/5 dark:active:bg-white/5"
                  style={{ 
                    color: entry.isFavorite ? '#ef4444' : theme.textSecondary,
                  }}
                  title={entry.isFavorite ? "Remove favorite" : "Mark favorite"}
                >
                  <Heart className={`w-4 h-4 ${entry.isFavorite ? 'fill-current' : ''}`} />
                </button>

                {/* Share/Copy */}
                <button
                  onClick={shareEntry}
                  className="p-2 rounded-full cursor-pointer transition-colors active:bg-black/5 dark:active:bg-white/5"
                  style={{ color: theme.textSecondary }}
                  title="Copy entry text"
                >
                  <Share2 className="w-4 h-4" />
                </button>

                {/* Delete Page indicator trigger */}
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 rounded-full cursor-pointer text-zinc-400 active:text-red-500 transition-colors active:bg-black/5 dark:active:bg-white/5"
                  title="Delete page permanently"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Pristine Title Textarea */}
          <textarea
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled page"
            className="text-3xl md:text-4xl font-serif text-zinc-900 border-none outline-none bg-transparent resize-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 leading-snug block w-full py-0 font-semibold placeholder:text-zinc-300 dark:placeholder:text-zinc-600 mb-4 md:mb-5 overflow-hidden"
            style={{ color: theme.textPrimary }}
            rows={1}
          />

          {/* Subtle Timestamp line */}
          <div className="mb-6 flex flex-wrap gap-2.5 items-center text-[10px] font-mono uppercase tracking-[0.15em] opacity-40">
            <span>{format(entry.createdAt, 'EEEE, MMM dd yyyy')}</span>
            <span className="opacity-30">·</span>
            <span>{format(entry.createdAt, 'hh:mm a')}</span>
            {entry.updatedAt && entry.updatedAt > entry.createdAt && (
              <>
                <span className="opacity-30">·</span>
                <span>Edited {format(entry.updatedAt, 'MMM dd')}</span>
              </>
            )}
            <span className="opacity-30">·</span>
            <span>{wordsCount} words</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            {/* Mood Tracker */}
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[9px] uppercase opacity-40 tracking-[0.1em]">Mood</span>
              <div className="flex items-center gap-1.5">
                {MOOD_SCALE.map((m) => {
                  const isSelected = entry.mood === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => onUpdate(entry.id, { mood: isSelected ? undefined : m.id })}
                      className={`w-8 h-8 flex items-center justify-center rounded-full transition-all cursor-pointer ${
                        isSelected ? 'scale-110 shadow-sm opacity-100 grayscale-0 ring-1' : 'opacity-30 grayscale active:opacity-100 active:grayscale-0 active:bg-black/5 dark:active:bg-white/5'
                      }`}
                      title={m.label}
                      style={{
                        backgroundColor: isSelected ? theme.accentLight : 'transparent',
                        
                      }}
                    >
                      {MOOD_ICONS[m.id]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tags list & Adder */}
            <div className="flex flex-col gap-2.5 relative">
              <span className="font-mono text-[9px] uppercase opacity-40 tracking-[0.1em]">Tags</span>
              <div className="flex flex-wrap gap-1.5 items-center">
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 md:px-2.5 py-1 md:py-0.5 rounded text-[11px] font-sans border"
                    style={{
                      backgroundColor: theme.accentLight,
                      borderColor: theme.surfaceBorder,
                      color: theme.textSecondary
                    }}
                  >
                    <span>#{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="active:opacity-100 opacity-50 transition-opacity ml-1 p-2 md:p-1 -mr-2 md:-mr-0 cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}

                {showTagAdder ? (
                  <div className="flex items-center gap-1 border rounded px-2.5 py-0.5" style={{ borderColor: theme.accent }}>
                    <span className="opacity-40 text-[10px]">#</span>
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={handleKeyDownTag}
                      placeholder="tag..."
                      className="outline-none text-[11px] w-14 bg-transparent border-0 py-0 px-0 focus:ring-0 focus:outline-none placeholder:opacity-50"
                      autoFocus
                    />
                    <button
                      onClick={() => handleAddTag(newTagInput)}
                      className="p-1.5 text-zinc-500 active:text-zinc-900 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setShowTagAdder(false)}
                      className="p-1.5 text-zinc-400 cursor-pointer active:text-zinc-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowTagAdder(true)}
                    className="flex items-center justify-center w-6 h-6 rounded border transition-all cursor-pointer opacity-40 active:opacity-100"
                    style={{ borderColor: theme.surfaceBorder, color: theme.textSecondary }}
                    title="Add tag"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
              </div>
              
                {/* Suggestions drawn entirely from user-made tags in other entries! */}
                {showTagAdder && availableTags.length > 0 && (
                  <div 
                    className="absolute z-10 top-full left-0 mt-2 flex max-w-[200px] flex-wrap gap-1 p-2 rounded border shadow-xl text-[10px]" 
                    style={{ 
                      borderColor: theme.surfaceBorder,
                      backgroundColor: theme.surface,
                      color: theme.textPrimary
                    }}
                  >
                    <span className="opacity-40 w-full mb-0.5 lowercase font-mono">Suggestions:</span>
                    {availableTags.map((uTag) => (
                      <button
                        key={uTag}
                        onClick={() => handleAddTag(uTag)}
                        className="px-2 py-1 rounded cursor-pointer opacity-80 active:opacity-100 active:scale-95 transition-all"
                        style={{ 
                          backgroundColor: theme.accentLight,
                          color: theme.textSecondary 
                        }}
                      >
                        +{uTag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <hr className="mb-4 border-t" style={{ borderColor: theme.surfaceBorder }} />
          </header>

          {/* Composing Textarea Area */}
          <div className="w-full max-w-[65ch] prose-measure mx-auto py-2 min-h-[50vh]">
            <EditorContent 
              editor={editor}
              style={{ color: theme.textPrimary }}
            />
          </div>

          {/* Link Bubble */}
          {editor && (
            <BubbleMenu
              editor={editor}
              tippyOptions={{ duration: 150, maxWidth: 420, zIndex: 20, placement: 'bottom' }}
              shouldShow={({ editor }) => editor.isActive('link')}
            >
              <LinkBubbleContent
                editor={editor}
                setLinkUrl={setLinkUrl}
                setShowLinkDialog={setShowLinkDialog}
              />
            </BubbleMenu>
          )}

          {/* File Attachments Section */}
          {attachments.length > 0 && (
            <div className="w-full max-w-[65ch] mx-auto mt-6 space-y-2">
              <span className="font-mono text-[9px] uppercase opacity-40 tracking-[0.1em]">Attachments</span>
              <div className="flex flex-col gap-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs"
                    style={{ borderColor: theme.surfaceBorder, backgroundColor: theme.background }}
                  >
                    <FileText className="w-4 h-4 shrink-0 opacity-60" style={{ color: theme.textSecondary }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: theme.textPrimary }}>{att.name}</p>
                      <p className="text-[10px] opacity-50 font-mono" style={{ color: theme.textSecondary }}>
                        {(att.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <a
                      href={att.data}
                      download={att.name}
                      className="p-2 rounded-full transition-all opacity-60 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                      style={{ color: theme.textSecondary }}
                      title="Download"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => {
                        const next = attachments.filter((a) => a.id !== att.id);
                        setAttachments(next);
                      }}
                      className="p-2 rounded-full transition-all opacity-40 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                      style={{ color: theme.textSecondary }}
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>

      {/* Sticky Utility Ribbon (Gmail style) */}
      <div className="sticky bottom-0 left-0 right-0 w-full flex justify-center pb-4 md:pb-6 pointer-events-none z-10 px-4">
        <div 
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 rounded-full border shadow-lg backdrop-blur-md transition-colors"
          style={{ 
            backgroundColor: theme.surface,
            borderColor: theme.surfaceBorder 
          }}
        >
          {/* Undo / Redo */}
          <button 
            className="p-2 rounded-full transition-all opacity-60 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" 
            style={{ color: theme.textPrimary }}
            title="Undo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormatting('undo')}
          >
            <Undo className="w-4 h-4" />
          </button>
          <button 
            className="p-2 rounded-full transition-all opacity-60 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" 
            style={{ color: theme.textPrimary }}
            title="Redo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormatting('redo')}
          >
            <Redo className="w-4 h-4" />
          </button>

          <div className="w-px h-5 mx-1" style={{ backgroundColor: theme.surfaceBorder }}></div>

          {/* Format Section */}

          <button 
            className="p-2 rounded-full transition-all opacity-60 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" 
            style={{ color: theme.textPrimary }}
            title="Bold"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormatting('bold')}
          >
            <Bold className="w-4 h-4" />
          </button>
          <button 
            className="p-2 rounded-full transition-all opacity-60 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" 
            style={{ color: theme.textPrimary }}
            title="Italic"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormatting('italic')}
          >
            <Italic className="w-4 h-4" />
          </button>
          <button 
            className="p-2 rounded-full transition-all opacity-60 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" 
            style={{ color: theme.textPrimary }}
            title="Underline"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormatting('underline')}
          >
            <Underline className="w-4 h-4" />
          </button>
          <button 
            className="p-2 rounded-full transition-all opacity-60 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" 
            style={{ color: theme.textPrimary }}
            title="Bulleted list"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormatting('bulletList')}
          >
            <List className="w-4 h-4" />
          </button>
          
          <div className="w-px h-5 mx-1" style={{ backgroundColor: theme.surfaceBorder }}></div>

          {/* Attachments & Links Section */}
          <button 
            className="p-2 rounded-full transition-all opacity-60 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" 
            style={{ color: theme.textPrimary }}
            title="Attach files"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button 
            className="p-2 rounded-full transition-all opacity-60 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" 
            style={{ color: theme.textPrimary }}
            title="Insert link"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!editor) return;
              const attrs = editor.getAttributes('link');
              setLinkUrl(attrs.href || '');
              const { from, to } = editor.state.selection
              linkSelectionRef.current = from !== to ? { from, to } : null
              setShowLinkDialog(true);
              setTimeout(() => linkInputRef.current?.focus(), 100);
            }}
          >
            <Link2 className="w-4 h-4" />
          </button>
          <button 
            className="p-2 rounded-full transition-all opacity-60 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" 
            style={{ color: theme.textPrimary }}
            title="Insert image"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setImageUrl('');
              setShowImageDialog(true);
            }}
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button 
            className="p-2 rounded-full transition-all opacity-60 hover:opacity-100 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" 
            style={{ color: theme.textPrimary }}
            title="Insert video"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setVideoUrl('');
              setShowVideoDialog(true);
            }}
          >
            <VideoIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const data = ev.target?.result as string;
              const newAtt: Attachment = {
                id: crypto.randomUUID(),
                name: file.name,
                type: file.type,
                data,
                size: file.size,
                createdAt: Date.now(),
              };
              setAttachments((prev) => [...prev, newAtt]);
              triggerToast(`Attached ${file.name}`);
            };
            reader.readAsDataURL(file);
          });
          e.target.value = '';
        }}
      />

      {/* Link Dialog */}
      <AnimatePresence>
        {showLinkDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
            onClick={() => { setShowLinkDialog(false); linkSelectionRef.current = null; }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="rounded-xl border shadow-xl p-5 w-[320px]"
              style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold mb-3" style={{ color: theme.textPrimary }}>
                {editor?.getAttributes('link').href ? 'Edit link' : 'Insert link'}
              </h3>
              <input
                ref={linkInputRef}
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors mb-3"
                style={{
                  borderColor: theme.surfaceBorder,
                  backgroundColor: theme.background,
                  color: theme.textPrimary,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (linkUrl) {
                      applyFormatting('link', linkUrl);
                    }
                    setShowLinkDialog(false);
                  }
                }}
              />
              <div className="flex items-center gap-2 justify-end">
                {editor?.getAttributes('link').href && (
                  <button
                    onClick={() => {
                      applyFormatting('link', undefined);
                      setShowLinkDialog(false);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    style={{ color: theme.textSecondary }}
                  >
                    <Unlink className="w-3 h-3" />
                    Remove
                  </button>
                )}
                <button
                  onClick={() => { setShowLinkDialog(false); linkSelectionRef.current = null; }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                  style={{ color: theme.textSecondary }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (linkUrl) {
                      applyFormatting('link', linkUrl);
                    }
                    setShowLinkDialog(false);
                  }}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                  style={{ backgroundColor: theme.accent, color: theme.surface }}
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Dialog */}
      <AnimatePresence>
        {showImageDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
            onClick={() => setShowImageDialog(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="rounded-xl border shadow-xl p-5 w-[320px]"
              style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold mb-3" style={{ color: theme.textPrimary }}>
                Insert image
              </h3>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors"
                style={{
                  borderColor: theme.surfaceBorder,
                  backgroundColor: theme.background,
                  color: theme.textPrimary,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (imageUrl) {
                      applyFormatting('image', imageUrl);
                      setShowImageDialog(false);
                    }
                  }
                }}
              />

              {driveConnected && (
                <>
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px" style={{ backgroundColor: theme.surfaceBorder }} />
                    <span className="text-[10px] font-mono uppercase tracking-wider opacity-40" style={{ color: theme.textSecondary }}>or</span>
                    <div className="flex-1 h-px" style={{ backgroundColor: theme.surfaceBorder }} />
                  </div>
                  <button
                    onClick={async () => {
                      const result = await openGoogleDrivePicker('image');
                      if (result) {
                        applyFormatting('image', '', result.fileId);
                        setShowImageDialog(false);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                    style={{ borderColor: theme.surfaceBorder, color: theme.textSecondary }}
                  >
                    Choose from Google Drive
                  </button>
                </>
              )}

              <div className="flex items-center gap-2 justify-end mt-3">
                <button
                  onClick={() => setShowImageDialog(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                  style={{ color: theme.textSecondary }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (imageUrl) {
                      applyFormatting('image', imageUrl);
                      setShowImageDialog(false);
                    }
                  }}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                  style={{ backgroundColor: theme.accent, color: theme.surface }}
                >
                  Insert
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Dialog */}
      <AnimatePresence>
        {showVideoDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
            onClick={() => setShowVideoDialog(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="rounded-xl border shadow-xl p-5 w-[340px]"
              style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold mb-3" style={{ color: theme.textPrimary }}>
                Insert video
              </h3>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=... or video URL"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors"
                style={{
                  borderColor: theme.surfaceBorder,
                  backgroundColor: theme.background,
                  color: theme.textPrimary,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (videoUrl) {
                      applyFormatting('video', videoUrl);
                      setShowVideoDialog(false);
                    }
                  }
                }}
              />

              <p className="text-[10px] font-mono opacity-40 mt-2 text-center" style={{ color: theme.textSecondary }}>
                YouTube, Vimeo URLs auto-convert to embeds
              </p>

              {driveConnected && (
                <>
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px" style={{ backgroundColor: theme.surfaceBorder }} />
                    <span className="text-[10px] font-mono uppercase tracking-wider opacity-40" style={{ color: theme.textSecondary }}>or</span>
                    <div className="flex-1 h-px" style={{ backgroundColor: theme.surfaceBorder }} />
                  </div>
                  <button
                    onClick={async () => {
                      const result = await openGoogleDrivePicker('video');
                      if (result) {
                        applyFormatting('video', '', result.fileId);
                        setShowVideoDialog(false);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                    style={{ borderColor: theme.surfaceBorder, color: theme.textSecondary }}
                  >
                    Choose from Google Drive
                  </button>
                </>
              )}

              <div className="flex items-center gap-2 justify-end mt-3">
                <button
                  onClick={() => setShowVideoDialog(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                  style={{ color: theme.textSecondary }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (videoUrl) {
                      applyFormatting('video', videoUrl);
                      setShowVideoDialog(false);
                    }
                  }}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                  style={{ backgroundColor: theme.accent, color: theme.surface }}
                >
                  Insert
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default Editor;
