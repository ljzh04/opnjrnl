/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { JournalEntry } from './types';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft } from 'lucide-react';
import { get, set } from 'idb-keyval';

const STORAGE_KEY = 'minimal-journal-entries';

export default function App() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  useEffect(() => {
    get<JournalEntry[]>(STORAGE_KEY).then((data) => {
      if (data) {
        setEntries(data);
      }
      setIsLoaded(true);
    }).catch(() => {
      setIsLoaded(true); // Fallback if IDB fails
    });
  }, []);

  useEffect(() => {
    if (isLoaded) {
      set(STORAGE_KEY, entries).catch(console.error);
    }
  }, [entries, isLoaded]);

  const handleNewEntry = () => {
    const newEntry: JournalEntry = {
      id: uuidv4(),
      title: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setEntries([newEntry, ...entries]);
    setActiveEntryId(newEntry.id);
  };

  const handleUpdateEntry = (id: string, updates: Partial<JournalEntry>) => {
    setEntries(current =>
      current.map(entry =>
        entry.id === id ? { ...entry, ...updates } : entry
      )
    );
  };

  const handleDeleteEntry = (id: string) => {
    setEntries(current => current.filter(entry => entry.id !== id));
    if (activeEntryId === id) {
      setActiveEntryId(null);
    }
  };

  const activeEntry = entries.find(e => e.id === activeEntryId) || null;

  if (!isLoaded) {
    return <div className="h-[100dvh] w-full bg-white flex items-center justify-center font-serif text-zinc-400 italic">Reading journal...</div>;
  }

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-full bg-white text-zinc-900 overflow-hidden font-sans sm:select-auto select-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      {/* Sidebar - hidden on mobile if an entry is active */}
      <div 
        className={`bg-zinc-50 border-r border-zinc-200 transition-all duration-300 ease-in-out ${
          activeEntryId ? 'hidden md:flex md:w-[320px] lg:w-[400px]' : 'flex w-full md:w-[320px] lg:w-[400px]'
        }`}
      >
        <Sidebar
          entries={entries}
          activeEntryId={activeEntryId}
          onSelectEntry={setActiveEntryId}
          onNewEntry={handleNewEntry}
          onDeleteEntry={handleDeleteEntry}
        />
      </div>

      {/* Editor - hidden on mobile if NO entry is active */}
      <div className={`flex-1 flex flex-col min-w-0 bg-white sm:select-auto select-text ${!activeEntryId ? 'hidden md:flex' : 'flex'}`}>
        {/* Mobile back button header */}
        {activeEntryId && (
          <div className="md:hidden px-4 py-3 border-b border-zinc-100 flex items-center bg-white sticky top-0 z-10">
            <button
              onClick={() => setActiveEntryId(null)}
              className="flex items-center text-sm font-sans font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Entries
            </button>
          </div>
        )}
        <Editor
          entry={activeEntry}
          onUpdate={handleUpdateEntry}
        />
      </div>
    </div>
  );
}
