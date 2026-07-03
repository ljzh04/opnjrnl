#!/bin/bash
sed -i 's/import TipTapImage from '\''@tiptap\/extension-image'\'';/import TipTapImage from '\''@tiptap\/extension-image'\'';\nimport Placeholder from '\''@tiptap\/extension-placeholder'\'';/g' src/components/Editor.tsx

# Find TipTapImage inside extensions array and add Placeholder after it
sed -i 's/TipTapImage,/TipTapImage,\n      Placeholder.configure({ placeholder: "Begin writing..." }),/g' src/components/Editor.tsx

