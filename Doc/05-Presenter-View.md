# Presenter View Overview

The `data/js/presenter/` directory contains the logic that powers the presenter's interface (the control panel). This view is responsible for managing the presentation flow, displaying the current and next slides, providing access to tools (like blackout, laser pointer, timers), and communicating state changes to the audience window.

## 1. Module Architecture and Interactions

The presenter view is highly modular, with specific files handling distinct responsibilities. The entry point is `index.js`, which orchestrates the initialization and event binding across all sub-components.

*   `index.js`: Initialization, event listeners, and global state subscriptions.
*   `elements.js`: Caching DOM element references.
*   `uiState.js`: Managing UI-specific state (e.g., collapsed panels, zoom levels, tool selections) separate from the global presentation state.
*   `slides.js`: Logic for navigating slides and rendering previews in the presenter view.
*   `tools.js`: Implementation of presentation tools (blackout, drawing).
*   `modals.js`: Handling the display and interaction of various modals (Help, Break Timer, Q&A, Remote Connect, Webcam).
*   `splitters.js`: Logic for the resizable panels (sidebar, notes, slides).
*   `screens.js`: Logic for managing the secondary display (audience window).
*   `keyboard.js`: Global keyboard shortcut handler.

## 2. Initialization and Event Binding (`index.js`)

The `init()` function serves as the bootstrap sequence for the presenter UI.

1.  **Cache Elements:** Calls `cacheElements()` from `elements.js` to store references to all necessary DOM nodes, optimizing subsequent DOM access.
2.  **Bind Events:** Attaches event listeners to buttons, inputs, and splitters. This includes navigation buttons (`navPrev`, `navNext`), timer controls (`timerStart`, `timerPause`, `timerReset`), tool toggles (`blackoutBtn`, `breakBtn`, `qaBtn`), and remote commands from `remoteManager.js`.
3.  **Start Clock:** Initiates a `setInterval` loop to update the real-time clock display in the bottom bar.
4.  **Apply Layout:** Restores the saved layout configuration (panel sizes) via `applySplitLayout()` from `splitters.js`.
5.  **State Subscription:** Subscribes to changes in `AppState`. When global state properties change (e.g., `currentPage`, `isBlackoutActive`), it triggers corresponding UI updates (e.g., `renderAllPreviews()`, toggling button states).

## 3. Slide Navigation and Rendering (`slides.js`)

This module manages what the presenter sees concerning the presentation content itself.

### `navigateTo(page)`

*   **Execution Flow:** Validates the requested `page` against the `totalPages` bound. If valid, it updates the `AppState` with the new `currentPage` and broadcasts a `page-change` event via `communication.js`. It also resets any active drawing or zoom states to ensure a clean slate for the new slide.

### `renderAllPreviews()`

*   **Execution Flow:** This function is triggered by state changes (e.g., loading a new PDF, changing pages, resizing the window).
    1.  **Media Type Check:** Determines if the current media is a PDF, video, or image.
    2.  **PDF Rendering:** If PDF, it utilizes `renderPage()` from `pdfRenderer.js` to draw the current and next slides onto their respective canvas elements within the presenter's view (`els.currentSlideCanvas`, `els.nextSlideCanvas`). It applies the appropriate clipping based on whether Beamer or Google Docs split modes are active.
    3.  **Media Elements:** If video or image, it updates the `src` attribute of the corresponding HTML5 media elements (`els.currentSlideVideo`, `els.currentSlideImage`).
    4.  **Notes Rendering:** Calls `renderNotes()` to handle the notes panel.
    5.  **UI Updates:** Updates the page indicator text, highlights the active thumbnail in the sidebar, and pushes the new state to any connected remote controls via `remoteManager.js`.

### `renderNotes()`

*   **Execution Flow:** Determines how notes should be displayed based on the detected presentation mode.
    *   **Beamer Split Mode:** Renders the right half of the PDF page onto the notes canvas (`els.notesCanvas`).
    *   **Google Docs Split Mode:** Retrieves the extracted text string from `AppState.gDocsNotesMap` and populates the text container (`els.notesPlaceholder`).
    *   **Standard PDF:** Displays a "No notes available" message.

## 4. Tools and Overlays (`tools.js` & `modals.js`)

These modules provide the interactive features available to the presenter.

### `tools.js`

*   **`toggleBlackout()`:** Flips the boolean `isBlackoutActive` in `AppState` and broadcasts a `blackout-toggle` event. This instantly hides the presentation content on the audience screen.
*   **Drawing Logic:** Manages the whiteboard feature. It listens for mouse events (`mousedown`, `mousemove`, `mouseup`) on the presenter's `drawCanvas`. As the presenter draws, it records the stroke data (color, width, coordinates) and broadcasts a `draw-stroke` event so the audience window can replicate the drawing in real-time.

### `modals.js`

Handles the presentation and logic of specialized overlay windows within the presenter view.

*   **Break Timer:** Prompts the user for a duration (e.g., 5, 10, 15 minutes). When started, it broadcasts a `break-start` event with the duration, triggering the full-screen countdown on the audience display.
*   **Audience Q&A:** Requests a QR code URL from the `server.js` endpoint containing a link to a Q&A submission form. It broadcasts a `qa-show` event with the URL, displaying the QR code on the audience screen.
*   **Remote Connection:** Displays a QR code containing the current session ID, allowing a user to connect a mobile device via the WebSocket relay managed by `server.js` and `remoteManager.js`.
*   **Webcam:** Requests access to the user's camera via `getUserMedia`, allows them to select a device and position, and broadcasts a `webcam-start` event to display the video feed on the audience screen using WebRTC (managed by `webcamManager.js`).

## 5. Keyboard Shortcuts (`keyboard.js`)

Provides an alternative, fast way to control the presentation without relying on the mouse.

*   **`handleKeyDown(e)`:** An event listener attached to the global `document`. It intercepts key presses and maps them to specific actions:
    *   **Navigation:** Arrow keys, Page Up/Down, Space, Home, End trigger `navigateTo()`.
    *   **Tools:** 'B' or '.' toggles blackout, 'L' toggles laser pointer, 'S' toggles spotlight, 'Z' toggles zoom, 'D' toggles drawing mode.
    *   **Window Management:** 'F' broadcasts a request for the audience window to enter fullscreen mode.