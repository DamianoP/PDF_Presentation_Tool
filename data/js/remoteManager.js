/**
 * remoteManager.js — WebSocket client for phone remote control
 *
 * Used by the presenter side to create a remote session,
 * generate the QR code URL, and handle commands from connected phones.
 */

const SESSION_KEY = 'pdf-presenter-remote-session';

let ws = null;
let sessionId = null;
let remoteCount = 0;
let _onCommand = null;
let _onStatusChange = null;
let reconnectTimer = null;
let _onQaQuestion = null;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Create a new remote session and connect to the WebSocket server.
 * @returns {Promise<string>} session ID
 */
function connect() {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState <= 1) {
      resolve(sessionId);
      return;
    }

    sessionId = generateSessionId();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws`;

    ws = new WebSocket(url);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'create-session', sessionId }));
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }

      switch (msg.type) {
        case 'session-created':
          _fireStatusChange();
          resolve(sessionId);
          break;

        case 'remote-joined':
          remoteCount = msg.remoteCount || 0;
          _fireStatusChange();
          break;

        case 'remote-left':
          remoteCount = msg.remoteCount || 0;
          _fireStatusChange();
          break;

        case 'remote-command':
          if (_onCommand) _onCommand(msg.command);
          break;

        case 'qa-question':
          if (_onQaQuestion) _onQaQuestion({ text: msg.text, timestamp: msg.timestamp });
          break;
      }
    };

    ws.onerror = () => {
      reject(new Error('WebSocket connection failed'));
    };

    ws.onclose = () => {
      remoteCount = 0;
      _fireStatusChange();
    };
  });
}

/**
 * Disconnect and destroy the session.
 */
function disconnect() {
  clearTimeout(reconnectTimer);
  if (ws) {
    ws.close();
    ws = null;
  }
  sessionId = null;
  remoteCount = 0;
  _fireStatusChange();
}

/**
 * Push current page state to all connected remotes.
 */
function sendStateUpdate(currentPage, totalPages) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({
      type: 'state-update',
      currentPage,
      totalPages,
    }));
  }
}

/**
 * Register callback for remote commands ('next' or 'prev').
 */
function onRemoteCommand(callback) {
  _onCommand = callback;
}

/**
 * Register callback for status changes (connected, remote count, etc).
 * callback({ connected, remoteCount })
 */
function onStatusChange(callback) {
  _onStatusChange = callback;
}

/**
 * Whether the WebSocket is connected.
 */
function isConnected() {
  return ws !== null && ws.readyState === 1 && sessionId !== null;
}

/**
 * Get the current session ID.
 */
function getSessionId() {
  return sessionId;
}

/**
 * Get the number of connected remotes.
 */
function getRemoteCount() {
  return remoteCount;
}

/**
 * Build the URL that the phone should open.
 */
function getRemoteUrl() {
  if (!sessionId) return null;
  return `${location.origin}/remote.html?session=${sessionId}`;
}

/**
 * Build the QR code image URL (server-generated PNG).
 */
function getQRCodeUrl() {
  const remoteUrl = getRemoteUrl();
  if (!remoteUrl) return null;
  return `/api/qr?url=${encodeURIComponent(remoteUrl)}`;
}

/**
 * Build the Q&A URL that the audience should open.
 */
function getQaUrl() {
  if (!sessionId) return null;
  return `${location.origin}/qa.html?session=${sessionId}`;
}

/**
 * Build the QR code image URL for Q&A.
 */
function getQaQRCodeUrl() {
  const qaUrl = getQaUrl();
  if (!qaUrl) return null;
  return `/api/qr?url=${encodeURIComponent(qaUrl)}`;
}

/**
 * Register callback for incoming Q&A questions.
 */
function onQaQuestion(callback) {
  _onQaQuestion = callback;
}

/* ------------------------------------------------------------------ */
/*  Internal                                                           */
/* ------------------------------------------------------------------ */

function generateSessionId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 64; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function _fireStatusChange() {
  if (_onStatusChange) {
    _onStatusChange({
      connected: isConnected(),
      remoteCount,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Export                                                              */
/* ------------------------------------------------------------------ */

export default {
  connect,
  disconnect,
  sendStateUpdate,
  onRemoteCommand,
  onStatusChange,
  isConnected,
  getSessionId,
  getRemoteCount,
  getRemoteUrl,
  getQRCodeUrl,
  getQaUrl,
  getQaQRCodeUrl,
  onQaQuestion,
};
