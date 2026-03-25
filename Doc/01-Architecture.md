# Architecture Overview

The PDF Presentation Tool is built with a client-heavy architecture, utilizing modern web technologies to deliver a dual-monitor presentation experience. The system is divided into a lightweight backend server and a robust frontend client that operates across multiple browser windows.

## 1. Module Purpose and Role in Architecture

The architecture is designed to support a multi-window presentation setup without relying on intensive server-side processing. The core functionality—rendering PDFs, displaying videos, and managing state—is executed entirely within the browser. The server acts primarily as a static file host and a signaling relay for remote control features.

## 2. Client-Server Split

### 2.1. Lightweight Backend Server

The backend is implemented in Node.js using the Express framework. Its responsibilities are strictly limited to:

*   **Static Asset Delivery:** Serving the HTML, CSS, and JavaScript files required by the client applications.
*   **WebSocket Relay:** Providing a WebSocket server to facilitate real-time communication between the presentation session and remote control clients (e.g., smartphones).
*   **QR Code Generation:** Offering an API endpoint to generate QR codes dynamically, used for pairing remote controls and facilitating audience Q&A sessions.
*   **Analytics:** Maintaining a simple connection counter to track unique visits.

### 2.2. Robust Frontend Client

The frontend is a Single Page Application (SPA) architecture, distributed across different HTML entry points to support the dual-monitor workflow. It handles all heavy lifting, including:

*   **Media Rendering:** Utilizing PDF.js for parsing and rendering PDF documents onto HTML5 Canvas elements, and standard HTML5 media elements for video and image playback.
*   **State Management:** Maintaining a centralized application state to ensure synchronization across different views.
*   **User Interface:** Providing complex UI components for the presenter (slide navigation, toolbars, notes, timer) and the audience (full-screen display, overlays, webcam bubbles).

## 3. Execution Flow and Inter-Window Communication

The system relies on asynchronous messaging to keep the presenter and audience windows synchronized.

### 3.1. BroadcastChannel API

The primary mechanism for inter-window communication is the `BroadcastChannel` API. This allows scripts running in different browsing contexts (windows, tabs, or iframes) of the same origin to communicate seamlessly.

*   **Presenter Window (Sender):** When the presenter navigates to a new slide, toggles the blackout screen, or uses a tool like the laser pointer, the presenter window dispatches state update messages via the BroadcastChannel.
*   **Audience Window (Receiver):** The audience window listens to the BroadcastChannel. Upon receiving state updates, it applies the changes locally (e.g., rendering the specified page number, showing the laser pointer at the received coordinates).

### 3.2. Fallback Mechanism

In environments where `BroadcastChannel` is not fully supported or restricted by browser policies, the system falls back to the `window.postMessage` API, relying on the relationship between the opener (presenter) and the opened window (audience).

## 4. Remote Control Integration via WebSocket

To enable remote control functionality from mobile devices, the architecture incorporates a WebSocket relay.

*   **Session Creation:** The presenter window initiates a WebSocket connection to the server and requests the creation of a unique session.
*   **Remote Pairing:** The server generates a session ID, which the presenter window displays as a QR code. The user scans this code with their mobile device to open the remote control web interface, passing the session ID in the URL.
*   **Command Relay:** The remote control client connects to the WebSocket server and joins the session. When the user presses a button on the remote (e.g., "Next Slide"), the command is sent to the server, which relays it to the presenter window.
*   **State Synchronization:** The presenter window processes the command, updates the presentation state, broadcasts the update to the audience window, and sends a state confirmation back through the WebSocket to update the remote control interface (e.g., current page number).

## 5. Data Processing Logic

All presentation data (PDF files, images, videos) remains on the client side. When a user selects a file, the application reads it into memory using the `File` and `FileReader` APIs or generates `Blob` URLs. The data is never uploaded to the server, ensuring privacy and eliminating upload latency. The processing logic involves extracting PDF metadata, determining slide layouts (e.g., Beamer split mode), and managing rendering pipelines concurrently to ensure smooth performance.