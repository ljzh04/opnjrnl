#!/bin/bash
sed -i 's/import Sidebar from '\''.\/components\/Sidebar'\'';/import Sidebar from '\''.\/components\/Sidebar'\'';\nimport { getSavedDirectoryHandle, promptDirectorySelection, loadEntriesFromDirectory, saveEntryToDirectory, deleteEntryFromDirectory } from '\''.\/lib\/fsStorage'\'';/g' src/App.tsx
