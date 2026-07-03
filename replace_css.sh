#!/bin/bash
sed -i 's/@import "tailwindcss";/@import "tailwindcss";\n@plugin "@tailwindcss\/typography";/g' src/index.css
