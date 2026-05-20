# opnjrnl (Minimal Journal)

A fast, clean, offline-first journaling application built with React, Vite, and Tailwind CSS.

## ⚠️ Fixing The "White Screen" on GitHub Pages

If you deployed to GitHub Pages and are getting a blank white screen with errors like:
`Loading module from “/src/main.tsx” was blocked because of a disallowed MIME type...`

**This happens because you published the raw source code instead of the compiled build.** GitHub Pages needs the built files from the `dist/` folder, not the unbuilt Vite `.tsx` files.

### The Solution (Automated)
We have added a GitHub Actions file (`.github/workflows/deploy.yml`) that fixes this instantly.

1. Go to your repository on GitHub.
2. Click **Settings** (⚙️) > **Pages** (on the left sidebar).
3. Under **Build and deployment** > Source, change the dropdown from `Deploy from a branch` to **GitHub Actions**.
4. Push these changes to your `main` branch. 
5. GitHub will now automatically run the build, generate the correct artifacts, and publish a working app gracefully.

---

## PWABuilder App Store Preparation

We've prepared the necessary structure required by [PWABuilder](https://www.pwabuilder.com/) so you can package this web app into a mobile (Android/iOS) or desktop application:

- **Manifest**: Included at `<your-url>/manifest.json` (defines colors, display boundaries, and naming details)
- **Service Worker**: Caching functionality included at `<your-url>/sw.js` (ensuring background caching works seamlessly)
- **Privacy Policy**: Viewable directly at `<your-url>/privacy.html`
- **License Details**: Viewable directly at `<your-url>/license.html`

The native app itself acts as the "home page" — simply enter your GitHub Pages URL to PWABuilder!
