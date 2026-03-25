# Media and PDF Rendering Overview

The core functionality of displaying presentation content is managed by `data/js/pdfRenderer.js` and `data/js/notesManager.js`. These modules handle the integration with the Mozilla PDF.js library, taking care of loading documents, detecting specific presentation formats (like LaTeX Beamer or Google Docs exports), rendering pages to HTML5 Canvas elements, and generating navigation thumbnails.

## 1. PDF Loading and Rendering (`pdfRenderer.js`)

The `pdfRenderer.js` module acts as the primary interface between the application state and the PDF.js library. It is responsible for parsing the PDF file, determining how it should be displayed, and executing the computationally intensive task of rendering individual pages onto canvas elements.

### 1.1. Module Purpose and Architecture

This module heavily utilizes asynchronous operations (`Promises` and `async/await`) to ensure that loading and rendering do not block the main browser thread. It maintains a `thumbnailCache` (a Map) to store generated thumbnail canvases and an `activeRenders` Map to track ongoing rendering tasks, allowing for cancellation if a user rapidly navigates through slides.

### 1.2. Key Functions

#### `loadPDF(fileBlob)`

*   **Input Parameters:** `fileBlob` (File or Blob object representing the PDF file).
*   **Execution Flow:**
    1.  Creates a temporary URL (`URL.createObjectURL`) for the provided file.
    2.  Invokes `pdfjsLib.getDocument()` to asynchronously load and parse the PDF document.
    3.  Retrieves the first page (`pdfDocument.getPage(1)`) to analyze its dimensions.
    4.  Calculates the aspect ratio (width / height) to detect **Beamer split mode**. If the ratio is > 2.2 (indicating a double-width page intended for dual-monitor setups), it sets a flag.
    5.  If Beamer mode is not detected, it calls the `detectGDocsMode()` heuristic function.
    6.  Updates the centralized `AppState` with the loaded document reference, total page count, mode flags, and the object URL.
*   **Return Value:** A Promise resolving to an object containing `{ pdfDocument, totalPages, isBeamerSplitMode, isGDocsSplitMode }`.

#### `detectGDocsMode(pdfDoc, firstPage, viewport)`

*   **Input Parameters:**
    *   `pdfDoc`: The `PDFDocumentProxy` instance.
    *   `firstPage`: The `PDFPageProxy` instance of the first page.
    *   `viewport`: The viewport object containing page dimensions.
*   **Execution Flow:** A heuristic algorithm that scans the first few pages (up to 5) to identify a specific visual layout characteristic of Google Docs presentations exported with speaker notes. It analyzes the text content (`page.getTextContent()`), looking for a significant vertical gap between the main slide content (upper portion) and the notes text (lower portion).
*   **Return Value:** A Promise resolving to either `null` (if the pattern isn't found) or an object containing `{ slideRect: {x,y,w,h}, notesBoundaryY: number }` detailing the coordinates of the slide area.

#### `extractGDocsNotes(pdfDoc, totalPages, viewport, notesBoundaryY)`

*   **Input Parameters:** The document, page count, viewport dimensions, and the Y-coordinate boundary separating slide content from notes.
*   **Execution Flow:** Iterates through all pages, extracting text items. Items below the `notesBoundaryY` are considered speaker notes. It attempts to reconstruct the text logically by sorting items by their vertical position and grouping them into lines.
*   **Return Value:** A Promise resolving to an object mapping page numbers to extracted text strings (e.g., `{ 1: "Welcome to the presentation...", 2: "Next topic is..." }`).

#### `renderPage(pageNum, canvas, options)`

*   **Input Parameters:**
    *   `pageNum`: Integer (1-indexed).
    *   `canvas`: The `HTMLCanvasElement` target for rendering.
    *   `options`: An object specifying scaling constraints (`scale`, `maxWidth`, `maxHeight`) and clipping instructions (`clip: 'left' | 'right' | 'top'`).
*   **Execution Flow:**
    1.  Validates the page number against the application state.
    2.  Cancels any existing render task on the target canvas to prevent race conditions.
    3.  Calculates the effective width and height based on Beamer/GDocs mode and clipping instructions.
    4.  Computes the necessary scale to fit the canvas within the provided `maxWidth`/`maxHeight`, accounting for high-DPI displays (`window.devicePixelRatio`).
    5.  Sets the canvas physical dimensions and CSS style dimensions accordingly.
    6.  Applies HTML5 Canvas 2D Context transformations (`clip()`, `translate()`) if splitting the page.
    7.  Initiates the PDF.js `page.render()` task and awaits its completion.
    8.  Restores the canvas context state if transformations were applied.

#### `generateThumbnails(pdfDoc, container, onClick, concurrency)`

*   **Input Parameters:** The PDF document proxy, the DOM container element, a click handler callback, and a concurrency limit (default 4).
*   **Execution Flow:** Generates navigation thumbnails. It creates DOM elements (canvas and label) for each slide page. It uses a batched asynchronous queue (workers) to render pages into the thumbnail canvases concurrently up to the specified limit, caching the results.

## 2. Speaker Notes Management (`notesManager.js`)

The `notesManager.js` module is a small utility dedicated to extracting and rendering speaker notes in the presenter's view.

### 2.1. Module Purpose and Architecture

This module abstracts the complexity of how notes are handled depending on the presentation format. It provides a unified interface for the presenter UI to request notes for a specific page without needing to know the underlying extraction mechanism.

### 2.2. Key Functions

#### `renderNoteForPage(pageNum, canvas, maxWidth, maxHeight)`

*   **Input Parameters:** The current page number, a target canvas element, and maximum dimensions.
*   **Execution Flow:**
    1.  **Beamer Mode:** If the application is in Beamer split mode, it leverages the `renderPage` function from `pdfRenderer.js`, passing the `'right'` clipping instruction to render the right half of the PDF page onto the notes canvas. It returns `null` because the notes are visual (rendered on canvas), not textual.
    2.  **Google Docs Mode:** If the application is in GDocs split mode, it clears the provided canvas (as it's not needed for visual notes) and retrieves the pre-extracted text string from the `AppState.gDocsNotesMap` for the specified page number.
    3.  **Normal PDF:** If no split mode is active, it clears the canvas and returns `null`.
*   **Return Value:** A Promise resolving to a string (for Google Docs text notes) or `null` (for Beamer visual notes or no notes).