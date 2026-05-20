import { JournalEntry } from '../types';
import { format } from 'date-fns';
import { PenLine, Trash2 } from 'lucide-react';

interface SidebarProps {
  entries: JournalEntry[];
  activeEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onNewEntry: () => void;
  onDeleteEntry: (id: string) => void;
}

export default function Sidebar({ entries, activeEntryId, onSelectEntry, onNewEntry, onDeleteEntry }: SidebarProps) {
  // sort entries by date descending
  const sortedEntries = [...entries].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="p-6 md:p-8 flex justify-between items-center bg-zinc-50 border-b border-zinc-200 shrink-0">
        <h1 className="text-xl md:text-2xl font-serif text-zinc-900 tracking-tight italic">Journal</h1>
        <button 
          onClick={onNewEntry}
          className="p-2 md:p-2.5 bg-zinc-900 text-white rounded-full shadow-sm hover:bg-zinc-800 transition-all hover:scale-105 active:scale-95"
          aria-label="New Entry"
        >
          <PenLine className="w-4 h-4 md:w-5 md:h-5" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto bg-zinc-50 pb-20 md:pb-0">
        {sortedEntries.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 font-serif italic text-sm md:text-base">
            No entries yet.<br/>Your pages are waiting.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200/60">
            {sortedEntries.map((entry) => (
              <li key={entry.id} className="relative group">
                <button
                  onClick={() => onSelectEntry(entry.id)}
                  className={`w-full text-left p-6 md:p-8 transition-colors ${
                    activeEntryId === entry.id 
                      ? 'bg-white shadow-[0_4px_24px_-12px_rgba(0,0,0,0.1)] z-10 relative border-l-2 border-l-zinc-900 -ml-[2px]' 
                      : 'hover:bg-zinc-100/50'
                  }`}
                >
                  <h3 className={`font-serif text-lg md:text-xl text-zinc-900 mb-1.5 truncate ${!entry.title ? 'text-zinc-400 italic' : ''}`}>
                    {entry.title || 'Untitled Entry'}
                  </h3>
                  <p className="text-[10px] md:text-xs text-zinc-500 font-sans tracking-widest mb-3 uppercase font-medium">
                    {format(entry.createdAt, 'MMM d, yyyy')}
                  </p>
                  <p className="text-sm md:text-base text-zinc-600 line-clamp-3 leading-relaxed font-serif">
                    {entry.content || '...'}
                  </p>
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if(confirm("Delete this entry?")) {
                      onDeleteEntry(entry.id);
                    }
                  }}
                  className="absolute top-6 right-6 p-2 text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white rounded-full shadow-sm"
                  aria-label="Delete Entry"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
