# State and Communication Overview

The PDF Presentation Tool relies on two core modules to manage data and ensure synchronization across the multi-window architecture: `data/js/state.js` and `data/js/communication.js`. These modules form the backbone of the client-side logic, handling everything from tracking the current slide to dispatching commands between the presenter interface and the audience display.

## 1. Centralized Application State (`state.js`)

The `state.js` module implements a centralized state management system using a Publisher-Subscriber (Pub/Sub) pattern. This object serves as the single source of truth for the entire application, preventing fragmented or inconsistent data across different components.

### 1.1. Module Purpose and Architecture

The `AppState` object is responsible for storing and managing all critical variables related to the presentation. By enforcing a strict rule that all mutations must go through the `setState()` method, it ensures that any change in the application's state predictably triggers updates in all dependent UI components and modules.

### 1.2. State Structure

The `AppState` object maintains several categories of data:

*   **Media State:**
    *   `mediaType`: A string indicating the active media ('pdf', 'video', or 'image').
    *   `playlist`: An array of strings representing the Blob URLs or Data URLs of the loaded media files (used when `mediaType` is 'video' or 'image').
*   **PDF State:**
    *   `currentPage`: An integer representing the currently displayed page or media index (1-based).
    *   `totalPages`: An integer representing the total number of pages in the PDF or items in the playlist.
    *   `pdfDocument`: A reference to the active `PDFDocumentProxy` object returned by PDF.js.
    *   `pdfBlobUrl`: A string containing the `Blob` URL of the loaded PDF file, essential for sharing the file across windows.
*   **Beamer & Google Docs State:**
    *   `isBeamerSplitMode`: A boolean indicating if the PDF has double-width pages and should be split (left half for slide, right half for notes).
    *   `isGDocsSplitMode`: A boolean indicating if the application has detected a layout characteristic of Google Docs exports, requiring custom cropping.
    *   `gDocsSlideRect`: An object `{ x, y, w, h }` defining the relative coordinates (0.0 to 1.0) of the slide portion within a Google Docs page.
    *   `gDocsNotesMap`: An object mapping page numbers to extracted text strings representing speaker notes.
*   **Display State:**
    *   `isBlackoutActive`: A boolean indicating if the audience screen should be blacked out.
    *   `selectedScreen`: Currently unused, intended for multi-monitor selection logic.
    *   `isFullscreen`: A boolean indicating if the audience window is in fullscreen mode.
*   **Timer State:**
    *   `timerState`: An object containing nested properties (`running`, `startTime`, `elapsed`, `targetDuration`) to track the session timer.

### 1.3. Methods

*   **`subscribe(listener)`:**
    *   **Input Parameter:** `listener` - A callback function that will be executed whenever the state changes. The listener receives three arguments: the current state object, an array of changed keys, and an object containing the previous values of the changed keys.
    *   **Return Value:** A function that, when invoked, removes the `listener` from the subscription list.
    *   **Logic:** Adds the provided function to the internal `_listeners` Set.
*   **`setState(patch)`:**
    *   **Input Parameter:** `patch` - An object containing key-value pairs representing the state updates to be applied.
    *   **Execution Flow:** Iterates over the keys in the `patch` object. It stores the old value of each key, applies the new value to the `AppState` object, and then iterates through the `_listeners` Set, invoking each registered callback with the updated state, the list of changed keys, and the old state values. Errors in listener execution are caught and logged to prevent breaking the update cycle.
*   **`getSerializableState()`:**
    *   **Return Value:** A plain JavaScript object containing a subset of the `AppState` properties that are safe to be serialized and transmitted across window boundaries (e.g., via `BroadcastChannel`). Complex objects like `pdfDocument` and sets/maps are omitted or converted to primitive arrays/objects.

## 2. Inter-Window Communication (`communication.js`)

The `communication.js` module provides a robust, bidirectional messaging system. It abstracts the complexities of cross-window communication, offering a simple interface for dispatching and receiving events.

### 2.1. Module Purpose and Architecture

The primary goal of the `Communication` class is to synchronize the presenter window and the audience window. It relies on the `BroadcastChannel` API as its primary mechanism, providing seamless communication between browsing contexts of the same origin. It also implements a fallback mechanism using `window.postMessage` to support environments where `BroadcastChannel` might be restricted or unavailable.

### 2.2. Initialization (`_init`)

Upon instantiation, the `Communication` class attempts to establish a `BroadcastChannel` named `pdf-presenter-sync`.

*   If successful, it attaches an `onmessage` event listener that routes incoming data to the internal `_dispatch` method.
*   Regardless of `BroadcastChannel` support, it sets up an event listener on the global `window` object for the `message` event. This acts as the `postMessage` fallback. It filters incoming messages, looking for a specific marker (`_presenterSync: true`) to ignore irrelevant traffic from other scripts or extensions.

### 2.3. Methods

*   **`broadcast(type, payload)`:**
    *   **Input Parameters:**
        *   `type`: A string representing the event identifier (e.g., 'state-sync', 'page-change', 'laser-move').
        *   `payload`: Any data associated with the event (e.g., coordinates, page numbers).
    *   **Execution Flow:** Constructs a message object `{ type, payload, _presenterSync: true }`. It attempts to send this object via the `BroadcastChannel` using `postMessage()`. Simultaneously, it checks if a direct `windowRef` is available (established when the presenter opens the audience window). If so, it attempts to use the traditional `window.postMessage(msg, '*')` API as a fallback, suppressing any cross-origin errors.
*   **`on(type, handler)`:**
    *   **Input Parameters:** `type` (string), `handler` (function).
    *   **Logic:** Registers a callback function to be executed when a message of the specified `type` is received. It manages these subscriptions within a Map of Sets (`_handlers`).
*   **`off(type, handler)`:**
    *   **Input Parameters:** `type` (string), `handler` (function).
    *   **Logic:** Removes the specified callback function from the subscription Set for the given `type`.
*   **`setWindowRef(ref)`:**
    *   **Input Parameter:** `ref` - A reference to a `Window` object.
    *   **Logic:** Stores a reference to the opened audience window. This reference is crucial for the `postMessage` fallback mechanism to function correctly when the presenter window broadcasts events.
*   **`_dispatch(data)`:**
    *   **Input Parameter:** `data` - The parsed message object received from the channel or window event.
    *   **Execution Flow:** Internal method that extracts the `type` and `payload` from the message. It retrieves the Set of registered handlers for that specific `type` and executes each one synchronously, passing the `payload` as the argument. Errors thrown by handlers are caught and logged.