/**
 * communication.js — Inter-Window Messaging
 *
 * Uses BroadcastChannel (primary) with postMessage fallback.
 * Message format: { type, payload, _presenterSync: true }
 */

const CHANNEL_NAME = 'pdf-presenter-sync';
 
class Communication {
  constructor() {
    /** @type {BroadcastChannel|null} */
    this.channel = null;
    /** @type {Window|null} */
    this.windowRef = null;
    /** @type {Map<string, Set<function>>} */
    this._handlers = new Map();

    this._init();
  }

  _init() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event) => this._dispatch(event.data);
    }

    // Fallback: listen for postMessage from opener / opened window
    window.addEventListener('message', (event) => {
      if (event.data && event.data._presenterSync) {
        this._dispatch(event.data);
      }
    });
  }

  /**
   * Broadcast a message to all listening windows.
   */
  broadcast(type, payload) {
    const msg = { type, payload, _presenterSync: true };
    if (this.channel) {
      this.channel.postMessage(msg);
    }
    if (this.windowRef && !this.windowRef.closed) {
      try {
        this.windowRef.postMessage(msg, '*');
      } catch (_) {
        /* cross-origin or closed */
      }
    }
  }

  /**
   * Register a handler for a specific message type.
   */
  on(type, handler) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, new Set());
    }
    this._handlers.get(type).add(handler);
  }

  /**
   * Unregister a handler.
   */
  off(type, handler) {
    const set = this._handlers.get(type);
    if (set) set.delete(handler);
  }

  /**
   * Store a reference to the presentation window for postMessage fallback.
   */
  setWindowRef(ref) {
    this.windowRef = ref;
  }

  destroy() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }

  _dispatch(data) {
    const { type, payload } = data;
    const set = this._handlers.get(type);
    if (set) {
      set.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[comm] handler error for "${type}":`, err);
        }
      });
    }
  }
}

const comm = new Communication();
export default comm;
