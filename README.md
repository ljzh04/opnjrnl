# opnjrnl (Minimal Journal)

A fast, clean, offline-first journaling application built with React, Vite, and Tailwind CSS. **opnjrnl** provides a minimal, distraction-free writing environment that keeps your data securely locked on your local device.

## Features

- **Offline-First:** All journal entries are stored securely in your browser's LocalStorage. No server, no databases, no tracking.
- **Privacy & Security:** Support for app-specific passwords and biometric device locks (via WebAuthn) to keep your entries private.
- **Progressive Web App (PWA):** Installable as a native app on mobile and desktop via PWABuilder.
- **Themes & Customization:** Multiple minimalist themes (Paper, Dark, Midnight, etc.) to suit your writing mood.
- **Export & Import:** Easily export your journal data as JSON and import it on any other device.
- **Google Drive Sync:** Optional integration to back up and restore your journal data securely via your personal Google Drive.
- **Reminders:** Push notifications to remind you to log your daily entries.

## Tech Stack

- [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [date-fns](https://date-fns.org/)
- [idb-keyval](https://github.com/jakearchibald/idb-keyval)
- [Lucide Icons](https://lucide.dev/)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ljzh04/opnjrnl.git
   cd opnjrnl
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## Deployment

### GitHub Pages

A GitHub Actions workflow is included (`.github/workflows/deploy.yml`) for automated deployments to GitHub Pages.

1. Go to your repository settings.
2. Navigate to **Pages** in the left sidebar.
3. Under **Build and deployment > Source**, select **GitHub Actions**.
4. The workflow will automatically build and deploy your app when you push to the `main` branch.

### PWA Packaging

This application includes all the necessary files to package it as a native mobile or desktop app using [PWABuilder](https://www.pwabuilder.com/):
- Web App Manifest (`public/manifest.json`)
- Service Worker (`public/sw.js`)
- Legal pages (`public/privacy.html`, `public/terms.html`, `public/license.html`)

## License

This project is licensed under the MIT License - see the [LICENSE](public/license.html) file for details.
