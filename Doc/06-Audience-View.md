# Audience View Overview

The `data/js/presentation/` directory encompasses the logic for the audience display (the window shown on the secondary monitor). This view is designed to be fully controlled by the presenter window via the `BroadcastChannel` API. It is responsible for rendering the full-screen presentation, displaying overlays (laser pointer, Q&A, break timer), and ensuring smooth media playback.

## 1. Module Architecture and Interactions

The audience view is structured to passively receive commands and reflect the state dictated by the presenter. The core modules are:

*   `index.js`: The entry point. Initializes communication, handles incoming broadcast messages, and manages global event listeners (like resizing and fullscreen changes).
*   `slides.js`: Responsible for rendering the current slide (PDF page, video, or image) onto the main display area.
*   `overlays.js`: Manages all visual elements layered on top of the main presentation content (laser pointer, spotlight, drawing canvas, Q&A QR code, break timer, webcam bubble).
*   `state.js`: A localized state object specifically for the audience window, keeping track of the current page, media type, and rendering tasks.

## 2. Initialization and Communication (`index.js`)

When the audience window (`presentation.html`) is opened by the presenter, `index.js` bootstraps the application.

1.  **Initialize Communication:** Calls `initComm()`. It attempts to establish a `BroadcastChannel` named `pdf-presenter-sync` and attaches an `onmessage` listener. As a fallback, it also listens to `window` for `message` events.
2.  **Signal Readiness:** Once the channel is established, it immediately broadcasts a `presentation-ready` message back to the presenter window. This signals the presenter to transmit the full application state so the audience window can synchronize.
3.  **Message Routing:** The `handleMessage(data)` function is the central dispatcher. It receives messages containing a `type` and a `payload`. Based on the `type` (e.g., `state-sync`, `page-change`, `laser-move`, `draw-stroke`), it invokes the appropriate functions in `slides.js` or `overlays.js`.
4.  **Global Listeners:** It attaches event listeners for window resizing and fullscreen transitions. When these occur, it triggers a re-render of the current slide and resynchronizes the drawing overlay dimensions to maintain crispness and correct positioning.

## 3. Slide Rendering (`slides.js`)

The primary responsibility of the audience window is to display the current presentation content clearly and efficiently.

### `renderCurrentSlide()`

*   **Execution Flow:** This function is called whenever the state dictates a change in what should be displayed (e.g., upon initialization, page changes, or window resizing).
    1.  **Media Type Check:** It first examines the `state.mediaType`.
    2.  **Video/Image Rendering:** If the media is a video or image, it hides the PDF canvas and displays the corresponding HTML5 media element (`#slide-video` or `#slide-image`). It updates the `src` attribute with the URL from the `state.playlist` corresponding to the `state.currentPage`. It also ensures the video is paused initially, waiting for sync commands from the presenter.
    3.  **PDF Rendering:** If the media is a PDF, it hides the media elements and ensures the PDF canvas (`#slide-canvas`) is visible.
    4.  **Cancel Active Render:** If a PDF render task is already in progress, it attempts to cancel it. This is crucial for performance when the presenter navigates quickly through slides.
    5.  **Calculate Dimensions:** It retrieves the `state.pdfDocument` and requests the page corresponding to `state.currentPage`. It calculates the effective width and height, taking into account if the application is in Beamer or Google Docs split mode (which requires rendering only a portion of the page).
    6.  **Scale and Render:** It determines the maximum possible scale to fit the page within the current window dimensions (`window.innerWidth`, `window.innerHeight`). It sets the canvas dimensions, applies any necessary clipping for split modes, and executes the PDF.js `page.render()` task.
*   **Performance:** The rendering is heavily optimized, prioritizing the cancellation of stale renders and ensuring the final output matches the exact pixel dimensions of the display for maximum clarity.

## 4. Overlays and Tools (`overlays.js`)

This module manages all interactive visual elements that sit above the presentation content.

### Tool Overlays

*   **Laser Pointer (`#laser-dot`):**
    *   **Logic:** Receives `x` and `y` coordinates (relative 0.0 to 1.0) via `laser-move` messages. It updates the CSS `left` and `top` properties of a small, distinct graphical element, creating the illusion of a laser dot following the presenter's mouse.
*   **Spotlight (`#spotlight-overlay`):**
    *   **Logic:** Similar to the laser pointer, it receives coordinates. However, it updates a CSS radial gradient background on a full-screen div. This creates a darkened overlay with a transparent "hole" (the spotlight) centered on the provided coordinates.
*   **Drawing / Whiteboard (`#draw-overlay`):**
    *   **Logic:** Maintains a secondary, transparent HTML5 Canvas perfectly aligned with the main presentation display. When it receives `draw-stroke` messages containing coordinate arrays and style information (color, width), it uses the Canvas 2D API (`lineTo()`, `stroke()`) to replicate the presenter's annotations in real-time.

### Informational Overlays

*   **Blackout (`#blackout-overlay`):**
    *   **Logic:** A simple, opaque black `div` that covers the entire screen. It toggles its visibility based on `blackout-toggle` messages, instantly hiding the presentation content.
*   **Break Timer (`#break-overlay`):**
    *   **Logic:** When a `break-start` message is received, it displays a full-screen countdown overlay. It uses `requestAnimationFrame` for a smooth countdown and a CSS-based progress bar, updating the displayed minutes and seconds until the specified duration elapses or a `break-stop` message is received.
*   **Audience Q&A (`#qa-overlay`):**
    *   **Logic:** Triggered by `qa-show`, it displays an overlay containing an `img` element. The `src` is updated with the QR code URL provided by the presenter window, allowing the audience to scan and submit questions.
*   **Audience Progress Bar (`#audience-progress-bar`):**
    *   **Logic:** A subtle visual indicator at the bottom of the screen. Its width is calculated as a percentage based on the `state.currentPage` relative to `state.totalPages`, providing the audience with a sense of the presentation's length.

## 5. Video Synchronization

The `index.js` message handler includes logic specifically for keeping video playback synchronized between the presenter and audience windows.

*   **Execution Flow:** When a `video-sync` message is received, it checks the `payload.type` property.
    *   `play`: Calls `video.play()`.
    *   `pause`: Calls `video.pause()`.
    *   `seeked` / `timeupdate`: Updates the `video.currentTime` to match the presenter's playback position. To avoid stuttering, it only applies the update if the difference (drift) between the audience's current time and the presenter's time is significant (e.g., greater than 0.5 seconds).
    *   `ratechange`: Updates the `video.playbackRate`.