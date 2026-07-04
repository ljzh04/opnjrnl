# Graph Report - .  (2026-07-04)

## Corpus Check
- Corpus is ~15,927 words - fits in a single context window. You may not need a graph.

## Summary
- 185 nodes · 196 edges · 36 communities (11 shown, 25 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_External Dependencies|External Dependencies]]
- [[_COMMUNITY_App Core and Auth|App Core and Auth]]
- [[_COMMUNITY_Project Docs and Features|Project Docs and Features]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Editor UI Components|Editor UI Components]]
- [[_COMMUNITY_PWA Manifest|PWA Manifest]]
- [[_COMMUNITY_Package Config|Package Config]]
- [[_COMMUNITY_Build Dependencies|Build Dependencies]]
- [[_COMMUNITY_WebAuthn Security|WebAuthn Security]]
- [[_COMMUNITY_Vault Setup Scripts|Vault Setup Scripts]]
- [[_COMMUNITY_Vault Setup Scripts|Vault Setup Scripts]]
- [[_COMMUNITY_Vault Setup Scripts|Vault Setup Scripts]]
- [[_COMMUNITY_Vault Setup Scripts|Vault Setup Scripts]]
- [[_COMMUNITY_Vault Setup Scripts|Vault Setup Scripts]]
- [[_COMMUNITY_CICD Deployment|CI/CD Deployment]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_License|License]]
- [[_COMMUNITY_Site Verification|Site Verification]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 15 edges
2. `opnjrnl - Minimal Journal App` - 11 edges
3. `JournalEntry` - 7 edges
4. `scripts` - 6 edges
5. `MinimalTheme` - 6 edges
6. `registerDeviceLock()` - 4 edges
7. `README - opnjrnl` - 4 edges
8. `EditorProps` - 3 edges
9. `SidebarProps` - 3 edges
10. `verifyDeviceLock()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `App Icon SVG - Notebook Icon` --references--> `opnjrnl - Minimal Journal App`  [INFERRED]
  public/icon.svg → README.md
- `PWA Installable App` --conceptually_related_to--> `PWABuilder Native Packaging`  [INFERRED]
  README.md → .github/workflows/pwa-release.yml
- `README - opnjrnl` --references--> `Main HTML Entry`  [EXTRACTED]
  README.md → index.html
- `README - opnjrnl` --references--> `License Agreement HTML`  [EXTRACTED]
  README.md → public/license.html
- `Privacy Policy` --references--> `Google Drive Sync`  [EXTRACTED]
  public/privacy.html → README.md

## Import Cycles
- 1-file cycle: `src/lib/auth.ts -> src/lib/auth.ts`

## Hyperedges (group relationships)
- **opnjrnl Legal Documents** — public_privacy, public_terms, public_license, license [EXTRACTED 1.00]

## Communities (36 total, 25 thin omitted)

### Community 0 - "External Dependencies"
Cohesion: 0.08
Nodes (26): dependencies, date-fns, dotenv, express, firebase, @google/genai, idb-keyval, lucide-react (+18 more)

### Community 1 - "App Core and Auth"
Cohesion: 0.16
Nodes (14): app, auth, getAccessToken(), googleSignIn(), initAuth(), logout(), provider, deleteEntryFromDirectory() (+6 more)

### Community 2 - "Project Docs and Features"
Cohesion: 0.13
Nodes (18): JSON Export Import, PWA Release Workflow, Google Drive Sync, Main HTML Entry, LocalStorage Data Storage, Multiple Minimalist Themes, Offline-First Journaling, opnjrnl - Minimal Journal App (+10 more)

### Community 3 - "TypeScript Config"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+8 more)

### Community 4 - "Editor UI Components"
Cohesion: 0.24
Nodes (12): Editor, EditorProps, MOOD_ICONS, MOOD_ICONS, Sidebar, SidebarProps, MINIMAL_THEMES, MOOD_SCALE (+4 more)

### Community 5 - "PWA Manifest"
Cohesion: 0.17
Nodes (11): background_color, description, display, icons, id, name, orientation, screenshots (+3 more)

### Community 6 - "Package Config"
Cohesion: 0.18
Nodes (10): name, private, scripts, build, clean, dev, lint, preview (+2 more)

### Community 7 - "Build Dependencies"
Cohesion: 0.20
Nodes (10): devDependencies, autoprefixer, esbuild, tailwindcss, tsx, @types/express, @types/node, @types/uuid (+2 more)

### Community 8 - "WebAuthn Security"
Cohesion: 0.60
Nodes (4): base64urlToBuffer(), bufferToBase64url(), registerDeviceLock(), verifyDeviceLock()

## Knowledge Gaps
- **110 isolated node(s):** `add_dir_handle.sh script`, `add_fs_imports.sh script`, `add_vault_props.sh script`, `add_vault_section.sh script`, `connect_vault.sh script` (+105 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `External Dependencies` to `Package Config`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Build Dependencies` to `Package Config`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `add_dir_handle.sh script`, `add_fs_imports.sh script`, `add_vault_props.sh script` to the rest of the system?**
  _110 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `External Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `Project Docs and Features` be split into smaller, more focused modules?**
  _Cohesion score 0.13071895424836602 - nodes in this community are weakly interconnected._
- **Should `TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._