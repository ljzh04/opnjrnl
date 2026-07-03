#!/bin/bash
sed -i '182,215c\
  const applyFormatting = (format: string, url?: string) => {\
    if (!editor) return;\
    switch (format) {\
      case "bold":\
        editor.chain().focus().toggleBold().run();\
        break;\
      case "italic":\
        editor.chain().focus().toggleItalic().run();\
        break;\
      case "underline":\
        editor.chain().focus().toggleUnderline().run();\
        break;\
      case "bulletList":\
        editor.chain().focus().toggleBulletList().run();\
        break;\
      case "link":\
        if (url) {\
          editor.chain().focus().setLink({ href: url }).run();\
        } else {\
          editor.chain().focus().unsetLink().run();\
        }\
        break;\
      case "image":\
        if (url) {\
          editor.chain().focus().setImage({ src: url }).run();\
        }\
        break;\
    }\
  };' src/components/Editor.tsx

