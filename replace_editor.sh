#!/bin/bash
# A script to modify Editor.tsx

# Replace imports
sed -i 's/import ReactMarkdown from '\''react-markdown'\'';//g' src/components/Editor.tsx
sed -i 's/import remarkGfm from '\''remark-gfm'\'';/import { useEditor, EditorContent } from '\''@tiptap\/react'\'';\nimport StarterKit from '\''@tiptap\/starter-kit'\'';\nimport TipTapUnderline from '\''@tiptap\/extension-underline'\'';\nimport TipTapLink from '\''@tiptap\/extension-link'\'';\nimport TipTapImage from '\''@tiptap\/extension-image'\'';/g' src/components/Editor.tsx

# Replace states and refs
sed -i 's/const contentRef = useRef<HTMLTextAreaElement>(null);//g' src/components/Editor.tsx
sed -i 's/const \[isEditingContent, setIsEditingContent\] = useState(false);//g' src/components/Editor.tsx

