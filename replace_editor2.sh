#!/bin/bash

# Find line of 'const titleRef'
LINE=$(grep -n "const titleRef = useRef<HTMLTextAreaElement>(null);" src/components/Editor.tsx | cut -d: -f1)

# Insert the editor definition after titleRef
sed -i "${LINE}r"<(cat << 'INNER_EOF'

  const editor = useEditor({
    extensions: [
      StarterKit,
      TipTapUnderline,
      TipTapLink.configure({ openOnClick: false }),
      TipTapImage,
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

INNER_EOF
) src/components/Editor.tsx

