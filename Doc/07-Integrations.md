# Integrations and Auxiliary Features

The PDF Presentation Tool incorporates several advanced integrations to enhance the presenter's workflow and the audience's experience. These features reside in dedicated modules within the `data/js/` directory and handle complex interactions like real-time remote control, webcam embedding, multi-monitor management, and session timing.

## 1. Phone Remote Control (`remoteManager.js`)

The `remoteManager.js` module is the client-side counterpart to the Node.js WebSocket server. It allows a presenter to use their smartphone as a clicker to navigate slides.

### 1.1. Module Purpose and Architecture

This module manages a WebSocket connection to the backend server. It operates as a stateful client, handling connection establishment, automatic reconnection with exponential backoff, session ID generation, and message routing.

### 1.2. Key Functionality

*   **Initialization (`init`):**
    *   Generates a cryptographically strong, random 64-character hexadecimal string to serve as the unique `sessionId`.
    *   Constructs the full URL for the remote control interface (`remote.html?session=...`) and requests a QR code from the server's `/api/qr` endpoint.
    *   Initiates the WebSocket connection (`connectWS()`).
*   **Connection Management (`connectWS`):**
    *   Establishes a `WebSocket` object pointing to the server's `/ws` endpoint.
    *   Upon a successful `open` event, it immediately sends a `create-session` message containing the generated `sessionId`.
    *   Implements an `onclose` handler that attempts to reconnect automatically if the connection is lost unexpectedly, using a backoff strategy (delay increases with each failed attempt up to a maximum number of retries).
*   **Message Handling (`onmessage`):**
    *   Parses incoming JSON messages from the server.
    *   `remote-joined` / `remote-left`: Updates the internal `remoteCount` and triggers any registered status change listeners (updating the UI button).
    *   `remote-command`: Extracts the command payload (e.g., 'next', 'prev') and invokes the registered command listener, which in turn calls `navigateTo()` in `slides.js`.
    *   `qa-question`: Extracts the text and timestamp of an audience question and passes it to the registered Q&A listener for display in the presenter's UI.
*   **State Broadcasting (`sendStateUpdate`):**
    *   A public method called whenever the presenter changes slides. It sends a `state-update` message to the server containing the `currentPage` and `totalPages`. The server relays this to all connected phone remotes, ensuring their displays remain synchronized with the main presentation.

## 2. Webcam Integration (`webcamManager.js`)

The `webcamManager.js` module allows the presenter to embed a live feed of themselves directly onto the audience's screen, useful for hybrid or recorded presentations.

### 2.1. Module Purpose and Architecture

This module handles the complexities of accessing user media devices and streaming video across browser contexts. Because standard `postMessage` or `BroadcastChannel` APIs cannot serialize and transmit live `MediaStream` objects, this module ingeniously employs a local WebRTC (Web Real-Time Communication) connection.

### 2.2. Key Functionality

*   **Device Enumeration (`getDevices`):**
    *   Uses `navigator.mediaDevices.enumerateDevices()` to retrieve a list of available video input devices (webcams).
*   **Media Acquisition (`startCapture`):**
    *   Uses `navigator.mediaDevices.getUserMedia({ video: { deviceId } })` to request access to a specific camera.
    *   Stores the resulting local `MediaStream`.
*   **WebRTC Signaling (`initWebRTC`):**
    *   This is the core innovation. It creates two `RTCPeerConnection` instances *within the same browser instance*, but logically separated.
    *   One peer connection (the "sender") adds the tracks from the local `MediaStream`.
    *   The other peer connection (the "receiver") is designed to receive these tracks.
    *   The module manages the exchange of ICE candidates and SDP offers/answers between these two local peers via the `BroadcastChannel` (`communication.js`).
*   **Streaming to Audience:**
    *   The audience window, upon receiving the signaling messages, sets up its own `RTCPeerConnection` to receive the remote stream.
    *   Once the connection is established, the audience window assigns the received `MediaStream` to the `srcObject` of the `<video id="webcam-bubble">` element.
*   **Teardown (`stopCapture`):**
    *   Stops all tracks of the local `MediaStream`, closes the `RTCPeerConnection` instances, and signals the audience window to hide the webcam bubble.

## 3. Multi-Monitor Management (`screenManager.js`)

The `screenManager.js` module attempts to automate the placement of the audience window on a secondary display.

### 3.1. Module Purpose and Architecture

This module utilizes the experimental Window Management API (formerly Multi-Screen Window Placement API) to query the physical displays connected to the user's computer.

### 3.2. Key Functionality

*   **Capability Check (`isSupported`):**
    *   Verifies if the browser supports the `getScreenDetails()` method (typically requiring HTTPS and a Chromium-based browser).
*   **Screen Enumeration (`getScreens`):**
    *   Requests permission from the user to access window management features.
    *   If granted, it returns an array of screen detail objects.
*   **Automatic Placement (`openPresentationWindow`):**
    *   When the presenter clicks "Present", this function identifies a screen that is *not* the current primary screen (where the presenter view resides).
    *   If a secondary screen is found, it calculates the necessary coordinates (`left`, `top`) and dimensions (`width`, `height`) to position a new window precisely on that screen.
    *   It uses `window.open(url, name, features)` with the calculated coordinates to spawn the audience window (`presentation.html`).
*   **Fallback:**
    *   If the API is unsupported, denied, or only one screen is detected, it simply calls `window.open()` without specific coordinates. The audience window opens as a standard popup, which the presenter must manually drag to their secondary monitor and maximize.

## 4. Session Timer (`timer.js`)

The `timer.js` module provides a simple stopwatch functionality to help the presenter manage their time.

### 4.1. Module Purpose

It tracks the elapsed time since the presentation started and compares it against an optional target duration, providing visual cues when time is running out.

### 4.2. Key Functionality

*   **State Management:**
    *   Maintains internal variables for `startTime`, `elapsedTime`, `timerInterval`, and `targetDuration` (in minutes).
*   **Control Methods (`start`, `pause`, `reset`):**
    *   `start()`: Records `Date.now()` and initiates a `setInterval` loop that recalculates the elapsed time every 1000ms. It calls a callback function provided during initialization to update the UI.
    *   `pause()`: Clears the interval, stopping the calculation.
    *   `reset()`: Clears the interval and resets all internal counters to zero.
*   **Formatting (`formatElapsed`):**
    *   Converts the raw elapsed milliseconds into a user-friendly `MM:SS` string format.
*   **Target Comparison (`isOverTarget`):**
    *   A boolean method that checks if `targetDuration` is set (> 0) and if the current `elapsedTime` exceeds that duration. This method is used by the presenter UI (`index.js`) to apply a visual "overtime" warning class to the timer display element.