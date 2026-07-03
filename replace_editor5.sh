#!/bin/bash
sed -i '658,685c\
          {/* Composing Textarea Area */}\
          <div className="w-full max-w-[65ch] prose-measure mx-auto py-2 min-h-[50vh]">\
            <EditorContent \
              editor={editor}\
              style={{ color: theme.textPrimary }}\
            />\
          </div>' src/components/Editor.tsx

