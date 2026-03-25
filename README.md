# PDF Presentation Tool

A Dual-monitor presentation tool supporting PDFs, Videos, and Images, featuring phone remote control and a break timer. The Node.js backend serves static files and a WebSocket relay. All rendering runs client-side in the browser.
The official website is available at [PDF Presentation Tool](https://presentations.damianoperri.it)

## Features

- **Dual-monitor presentation** -- Separate presenter view and audience display windows
- **Beamer support** -- Automatic detection of LaTeX Beamer split-mode PDFs (slide + notes)
- **Phone remote control** -- Scan a QR code to control slides from your phone via WebSocket
- **Audience Q&A** -- Display a QR code on the audience screen for attendees to submit anonymous questions
- **Break timer** -- Set 5/10/15 min (or custom) breaks with a full-screen countdown on the audience display
- **Laser & Spotlight** -- Use a red laser dot or a yellow spotlight that dims the background, following your mouse
- **Whiteboard annotations** -- Draw directly on slides with multiple colors and line weights
- **Dynamic Zoom** -- Magnify a portion of the slide on the audience screen, following your mouse in real-time
- **Audience progress bar** -- Sleek progress indicator at the bottom of the audience screen
- **Blackout** -- Instantly blank the audience screen
- **Resizable panels** -- Drag splitters to resize all panels (sidebar, slides, notes)
- **Collapsible panels** -- Sidebar, next slide preview, and notes can be independently collapsed
- **Session timer** -- With target duration and visual overtime warning
- **Webcam Bubble** -- Display your webcam in a circular bubble on the audience screen (4 positions)
- **Keyboard shortcuts** -- Full keyboard control for navigation, blackout, fullscreen, and tools
- **PWA** -- Installable as a standalone app with offline support
- **Hi-DPI rendering** -- Crisp slides on Retina and high-DPI displays

## Getting Started

### With Docker (recommended)

```bash
docker compose build && docker compose up -d
```

The app will be available on port 80 inside the container.

### Usage

1. Drag and drop a PDF, or one or more Video/Image files onto the landing screen, or click to browse.
2. The presenter view loads with the current slide, next slide preview, and thumbnails
3. Click **▶ Present** to open the audience window -- drag it to your secondary monitor
4. Use keyboard shortcuts to navigate slides and control the presentation

### Phone Remote

1. Click **Remote** in the bottom bar (or have a phone ready)
2. A QR code appears -- scan it with your phone's camera
3. The phone opens a remote control page with large PREV/NEXT buttons
4. Navigate slides from your phone -- supports touch buttons, swipe gestures, and volume keys (Android)

### Break Timer

1. Click **Break** in the bottom bar
2. Choose a preset duration (5, 10, 15 min) or enter a custom time
3. Click **Start Break** -- a full-screen countdown appears on the audience display
4. Click **Stop Break** to end the break early and return to the current slide

### Audience Q&A

1. Click **Q&A** in the bottom bar
2. A QR code appears on the audience display
3. Attendees scan it to open a Q&A page where they can submit anonymous questions
4. Questions appear in real-time in the presenter's Q&A panel
5. Click the button again to hide the QR code and close the panel

### Webcam

1. Click **Webcam** in the bottom bar
2. Select your camera from the list and choose a bubble position (top/bottom, left/right)
3. The preview shows your face in a mirrored circular bubble
4. Click **Confirm** to show the bubble to the audience
5. The webcam is automatically hidden during **Blackout** mode to maintain focus

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Right / Down / Space / PgDn | Next slide |
| Left / Up / PgUp | Previous slide |
| Home | First slide |
| End | Last slide |
| B or . | Toggle blackout |
| F | Toggle fullscreen (audience window) |
| L | Toggle Laser Pointer mode |
| S | Toggle Spotlight mode |
| Z | Toggle Zoom mode (mouse-follow) |
| P | Toggle audience progress bar |
| D | Toggle Drawing / Whiteboard mode |
| E | Toggle Eraser (while drawing) |
| C | Clear all drawings (while drawing) |
| 1-5 | Change drawing color |
| + / - | Change drawing thickness |

## Beamer Split-Mode

When a PDF has pages with an aspect ratio greater than 2.2 (double-width), the application automatically activates Beamer mode:

- The **left half** of each page is displayed as the slide (to the audience)
- The **right half** is rendered as speaker notes (in the presenter's notes panel)

No manual configuration is needed.

## Architecture

```
Presenter Window (index.html)          Audience Window (presentation.html)
+---------------------------+          +---------------------------+
| Thumbnails | Current Media|          |                           |
|            | Next Media   |  <---->  |    Full-screen media      |
|            | Notes        |  Broad-  |    Blackout overlay       |
|            |              |  cast    |    Laser pointer dot      |
| Timer  Nav  Controls      |  Channel |    Break timer overlay    |
|                           |  +WebRTC |    Webcam bubble overlay  |
+---------------------------+          +---------------------------+
             |
             | WebSocket
             v
    Node.js Server (server.js)  <---- WebSocket ----  Phone Remote
    Static files + WS relay
    QR code generation
```

Both windows communicate via BroadcastChannel API with a postMessage fallback. Phone remotes connect via WebSocket through the Node.js server. All rendering is done client-side using PDF.js.

## Project Structure

```
├── Dockerfile                      -- Node.js 20 Alpine container
├── docker-compose.yml              -- Docker Compose config
├── package.json                    -- Dependencies (express, ws, qrcode)
├── server.js                       -- Static server + WebSocket relay + QR endpoint
└── data/
    ├── index.html                  -- Presenter view
    ├── presentation.html           -- Audience display
    ├── remote.html                 -- Phone remote control
    ├── manifest.json               -- PWA manifest
    ├── sw.js                       -- Service worker
    ├── css/
    │   main.css                    -- All styles (dark theme, grid, overlays)
    ├── assets/
    │   icon-192.png
    │   icon-512.png
    └── js/
        ├── app.js                  -- Application bootstrap
        ├── state.js                -- Centralized state management
        ├── communication.js        -- BroadcastChannel wrapper
        ├── pdfRenderer.js          -- PDF.js rendering with hi-DPI and Beamer clipping
        ├── presenter/              -- Presenter view modules (slides, tools, modals, UI state, splitters)
        ├── presentation/           -- Audience window modules (auto-fullscreen, overlays, slides, sync)
        ├── notesManager.js         -- Beamer notes extraction
        ├── screenManager.js        -- Multi-monitor management
        ├── remoteManager.js        -- WebSocket client for phone remote
        ├── webcamManager.js        -- WebRTC capture and signaling
        └── timer.js                -- Session timer
```

## Technical Details

- **Server**: Node.js with Express (static files) + ws (WebSocket relay) + qrcode (QR generation)
- **PDF rendering**: Mozilla PDF.js v3.11.174 (loaded from CDN)
- **Inter-window communication**: BroadcastChannel API with postMessage fallback
- **Phone remote**: WebSocket relay through Node.js server, 64-char session IDs
- **Multi-monitor**: Window Management API (requires HTTPS) with manual fallback
- **Hi-DPI**: Canvas renders at devicePixelRatio resolution with CSS scaling
- **Beamer clipping**: Canvas `clip()` + `translate()` to render half-page regions
- **Laser pointer**: Relative mouse coordinates broadcast from presenter to audience
- **Break timer**: Countdown overlay on audience window with progress bar
- **Webcam**: Captured via `getUserMedia` and streamed via local WebRTC `RTCPeerConnection` over `BroadcastChannel` to bypass cross-window security and autoplay restrictions. Video is mirrored for an intuitive presenter experience.

## Browser Compatibility

Tested on:

- **Chrome / Chromium** -- Full support
- **Firefox** -- Full support
- **Safari** -- Full support (laser pointer may be slightly less smooth)

Note: The Window Management API for automatic screen placement requires HTTPS and is currently supported only in Chromium-based browsers. On other browsers, the audience window opens as a regular popup that can be manually dragged to the secondary monitor.

## License

This project is provided as-is for personal and educational use.
