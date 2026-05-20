import { JournalEntry } from '../types';
import { format } from 'date-fns';
import { useEffect, useState, useRef } from 'react';

interface EditorProps {
  entry: JournalEntry | null;
  onUpdate: (id: string, updates: Partial<JournalEntry>) => void;
}

export default function Editor({ entry, onUpdate }: EditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Sync state when active entry changes
  useEffect(() => {
    if (entry) {
      setTitle(entry.title);
      setContent(entry.content);
    } else {
      setTitle('');
      setContent('');
    }
  }, [entry?.id]); 

  // Auto-save logic
  useEffect(() => {
    if (!entry) return;
    
    // Instead of auto-saving on every keystroke immediately, we debounce
    const timeout = setTimeout(() => {
        onUpdate(entry.id, { title, content, updatedAt: Date.now() });
    }, 1000); 
    
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]); // Excluding onUpdate and entry.id from deps to avoid cyclic calls

  // Auto-resize title textarea
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = 'auto';
      titleRef.current.style.height = titleRef.current.scrollHeight + 'px';
    }
  }, [title]);

  if (!entry) {
    return (
      <div className="flex-1 hidden md:flex items-center justify-center bg-white text-zinc-400 font-serif text-xl italic tracking-wide">
        Select a journal entry, or start a new one.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden selection:bg-zinc-200">
      <div className="w-full max-w-2xl mx-auto flex-1 flex flex-col p-6 md:p-16 overflow-y-auto">
        <p className="text-[10px] md:text-xs font-sans font-medium tracking-[0.2em] uppercase text-zinc-400 mb-8 md:mb-12">
          {format(entry.createdAt, 'MMMM d, yyyy · h:mm a')}
        </p>
        <textarea
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New Entry"
          className="text-4xl md:text-5xl font-serif text-zinc-900 placeholder:text-zinc-200 border-none outline-none bg-transparent mb-6 md:mb-10 resize-none focus:ring-0 leading-tight block w-full py-0"
          rows={1}
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Begin writing..."
          className="flex-1 text-lg md:text-xl font-serif leading-[1.8] text-zinc-700 placeholder:text-zinc-300 border-none outline-none bg-transparent resize-none focus:ring-0 w-full py-0"
        />
      </div>
    </div>
  );
}
