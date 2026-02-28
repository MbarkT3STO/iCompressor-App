# iCompressor

A cross-platform desktop file compressor application built with Electron + TypeScript. Compress and extract common archive formats with a modern, professional UI—no frontend frameworks, pure web technologies.

## Features

- **Compression**: ZIP, 7Z, TAR, TAR.GZ
- **Extraction**: ZIP, 7Z, RAR, TAR, TAR.GZ
- Drag & drop support
- File picker support
- Real-time progress bar
- Dark / Light / System theme
- Compression history
- Configurable settings (compression level, output directory, auto-open folder)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Main Process (Node.js)                       │
│  main.ts ──► IPC handlers, window management                         │
│  services/compressor.ts ──► archiver, node-7z                         │
│  services/settings.ts, history.ts ──► JSON file persistence          │
└────────────────────────────┬────────────────────────────────────────┘
                             │ IPC (contextBridge)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Preload (preload.ts)                              │
│  contextBridge.exposeInMainWorld('compressorAPI', api)               │
│  Safe IPC bridge: invoke handlers, subscribe to progress             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Renderer (Browser)                                │
│  index.html + CSS (theme.css, layout.css)                            │
│  scripts/ipc.ts, ui.ts, events.ts                                    │
│  Vanilla TypeScript, no React/Vue/Angular                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
/src
  main/
    main.ts          # Electron main process, IPC registration
    ipc-channels.ts  # Shared IPC channel constants
  preload/
    preload.ts       # contextBridge API exposure
  renderer/
    index.html       # App shell
    styles/
      theme.css      # CSS variables, light/dark
      layout.css     # Layout, components
    scripts/
      ipc.ts         # IPC layer
      ui.ts          # DOM updates, panels, toasts
      events.ts      # Event handlers, drag-drop
  services/
    compressor.ts    # archiver + node-7z
    settings.ts      # User preferences
    history.ts       # Operation history
```

## Tech Stack

- **Electron** – cross-platform desktop
- **TypeScript** – strict typing
- **archiver** – ZIP, TAR, TAR.GZ creation
- **node-7z** + **7zip-bin** – 7Z creation, extraction (ZIP, 7Z, RAR, TAR, TAR.GZ)
- **Context isolation** – no `nodeIntegration`, no `remote`

## Prerequisites

- Node.js 18+
- npm or yarn

## Install & Run

```bash
npm install
npm run build
npm start
```

## Scripts

- `npm run build` – compile TypeScript, copy renderer assets
- `npm start` – build + run Electron
- `npm run dev` – build + run with DevTools
- `npm run dist` – build distributable (dmg, exe, etc.)

## RAR Extraction

RAR extraction uses the 7-Zip binary from `7zip-bin`. On some systems, RAR support may require `p7zip-full` (Linux) or `p7zip` (macOS) for full compatibility.

## License

MIT
