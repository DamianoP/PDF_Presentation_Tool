/**
 * screenManager.js — Multi-Monitor & Presentation Window
 *
 * Uses the Screen Enumeration API (window.getScreenDetails) when available.
 * Falls back to a simple window.open with manual positioning.
 */

import comm from './communication.js';
import AppState from './state.js';

class ScreenManager {
  constructor() {
    /** @type {Window|null} */
    this.presentationWindow = null;
    /** @type {ScreenDetailed[]|null} */
    this.screens = null;
  }

  /**
   * Query available hardware screens.
   * Returns an array of ScreenDetailed objects or null if API unavailable.
   */
  async getAvailableScreens() {
    try {
      if ('getScreenDetails' in window) {
        const details = await window.getScreenDetails();
        this.screens = Array.from(details.screens);
        return this.screens;
      }
    } catch (err) {
      console.warn('[screenManager] Screen Enumeration API not available:', err);
    }
    return null;
  }

  /**
   * Open the Presentation window (presentation.html).
   *
   * @param {ScreenDetailed|null} screen  target screen (null = default)
   * @returns {Promise<Window>}
   */
  async openPresentationWindow(screen) {
    this.closePresentationWindow();

    let features;
    if (screen && screen.availLeft !== undefined) {
      features = [
        `left=${screen.availLeft}`,
        `top=${screen.availTop}`,
        `width=${screen.availWidth}`,
        `height=${screen.availHeight}`,
      ].join(',');
    } else {
      features = 'width=1024,height=768';
    }

    this.presentationWindow = window.open(
      'presentation.html',
      'PresentationWindow',
      features,
    );

    if (!this.presentationWindow) {
      throw new Error(
        'Failed to open presentation window. Please allow popups for this site.',
      );
    }

    this.presentationWindow.focus();

    comm.setWindowRef(this.presentationWindow);
    AppState.setState({ selectedScreen: screen || 'default' });

    // Once the new window loads, push current state and request fullscreen
    this.presentationWindow.addEventListener('load', () => {
      comm.broadcast('state-sync', AppState.getSerializableState());
      setTimeout(() => {
        try {
          if (this.presentationWindow && !this.presentationWindow.closed) {
            this.presentationWindow.document.documentElement.requestFullscreen();
          }
        } catch (e) {
          console.warn('[screenManager] fullscreen request failed:', e);
        }
      }, 600);
    });

    return this.presentationWindow;
  }

  /**
   * Close current window, open on a new screen.
   */
  async switchScreen(newScreen) {
    this.closePresentationWindow();
    return this.openPresentationWindow(newScreen);
  }

  closePresentationWindow() {
    if (this.presentationWindow && !this.presentationWindow.closed) {
      this.presentationWindow.close();
    }
    this.presentationWindow = null;
  }

  isPresentationOpen() {
    return this.presentationWindow && !this.presentationWindow.closed;
  }
}

const screenManager = new ScreenManager();
export default screenManager;
