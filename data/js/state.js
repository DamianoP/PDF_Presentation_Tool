/**
 * state.js — Centralized Application State
 *
 * Single source of truth for the presenter application.
 * All mutations go through setState(), which notifies listeners.
 */

const AppState = {
  /* ---- Media ---- */
  mediaType: 'pdf', // 'pdf' | 'video'
  playlist: [], // Array of video Blob URLs

  /* ---- PDF ---- */
  currentPage: 1,
  totalPages: 0,
  pdfDocument: null,
  pdfBlobUrl: null,

  /* ---- Beamer ---- */
  isBeamerSplitMode: false,

  /* ---- Google Docs ---- */
  isGDocsSplitMode: false,
  gDocsSlideRect: null,      // { x, y, w, h } in relative 0–1 coords
  gDocsNotesMap: null,        // { pageNum: notesText } extracted text notes

  /* ---- Display ---- */
  isBlackoutActive: false,
  selectedScreen: null,
  isFullscreen: false,
  transitionType: localStorage.getItem('ppt_transitionType') || 'none',

  /* ---- Extra Features ---- */
  captionsEnabled: false,
  captionsFontSize: '3vh',

  /* ---- Timer ---- */
  timerState: {
    running: false,
    startTime: null,
    elapsed: 0,
    targetDuration: 0,
  },

  /* ---- Internal ---- */
  _listeners: new Set(),

  /**
   * Subscribe to state changes.
   * @param {function(state, changes, oldState)} listener
   * @returns {function} unsubscribe
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  },

  /**
   * Apply a partial state update and notify all listeners.
   * @param {object} patch — key/value pairs to merge
   */
  setState(patch) {
    const oldState = {};
    const changes = Object.keys(patch);
    changes.forEach((key) => {
      oldState[key] = this[key];
      this[key] = patch[key];
    });
    if (changes.includes('transitionType')) {
      localStorage.setItem('ppt_transitionType', this.transitionType);
    }
    this._listeners.forEach((fn) => {
      try {
        fn(this, changes, oldState);
      } catch (err) {
        console.error('[state] listener error:', err);
      }
    });
  },

  /**
   * Return a plain object safe for BroadcastChannel / postMessage.
   */
  getSerializableState() {
    return {
      mediaType: this.mediaType,
      playlist: [...this.playlist],
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      isBeamerSplitMode: this.isBeamerSplitMode,
      isGDocsSplitMode: this.isGDocsSplitMode,
      gDocsSlideRect: this.gDocsSlideRect ? { ...this.gDocsSlideRect } : null,
      isBlackoutActive: this.isBlackoutActive,
      pdfBlobUrl: this.pdfBlobUrl,
      timerState: { ...this.timerState },
      transitionType: this.transitionType,
      captionsEnabled: this.captionsEnabled,
      captionsFontSize: this.captionsFontSize,
    };
  },
};

export default AppState;
