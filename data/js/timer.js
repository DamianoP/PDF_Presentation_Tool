/**
 * timer.js — Session Timer & Clock
 *
 * Manages a start/pause/reset timer with optional target duration.
 * Updates AppState.timerState every second while running.
 */

import AppState from './state.js';

class Timer {
  constructor() {
    /** @type {number|null} */
    this._intervalId = null;
  }

  start() {
    if (AppState.timerState.running) return;

    const now = Date.now();
    const elapsed = AppState.timerState.elapsed;

    AppState.setState({
      timerState: {
        ...AppState.timerState,
        running: true,
        startTime: now - elapsed,
      },
    });

    this._intervalId = setInterval(() => this._tick(), 1000);
  }

  pause() {
    if (!AppState.timerState.running) return;

    clearInterval(this._intervalId);
    this._intervalId = null;

    AppState.setState({
      timerState: {
        ...AppState.timerState,
        running: false,
        elapsed: Date.now() - AppState.timerState.startTime,
      },
    });
  }

  reset() {
    clearInterval(this._intervalId);
    this._intervalId = null;

    AppState.setState({
      timerState: {
        ...AppState.timerState,
        running: false,
        startTime: null,
        elapsed: 0,
      },
    });
  }

  setTargetDuration(minutes) {
    const ms = Math.max(0, minutes) * 60 * 1000;
    AppState.setState({
      timerState: {
        ...AppState.timerState,
        targetDuration: ms,
      },
    });
  }

  /** Current elapsed milliseconds (live). */
  getElapsed() {
    const ts = AppState.timerState;
    if (ts.running && ts.startTime) {
      return Date.now() - ts.startTime;
    }
    return ts.elapsed;
  }

  /** True when elapsed exceeds target (and target is set). */
  isOverTarget() {
    const target = AppState.timerState.targetDuration;
    if (!target) return false;
    return this.getElapsed() >= target;
  }

  formatElapsed(ms) {
    const totalSeconds = Math.floor(Math.max(0, ms || 0) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  _tick() {
    if (!AppState.timerState.running) return;
    const elapsed = Date.now() - AppState.timerState.startTime;
    AppState.setState({
      timerState: {
        ...AppState.timerState,
        elapsed,
      },
    });
  }

  destroy() {
    clearInterval(this._intervalId);
    this._intervalId = null;
  }
}

const timer = new Timer();
export default timer;
