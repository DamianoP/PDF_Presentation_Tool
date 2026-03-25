import screenManager from '../screenManager.js';
import comm from '../communication.js';
import AppState from '../state.js';
import { els } from './elements.js';
import { uiState } from './uiState.js';

export async function handleStartPresentation() {
  // If already presenting, ask to stop
  if (screenManager.isPresentationOpen()) {
    const confirmed = confirm('Stop the current presentation?');
    if (confirmed) {
      comm.broadcast('close-presentation', {});
      // The window will close itself; the polling will update the button
      // Force-close if the window didn't respond
      setTimeout(() => {
        if (screenManager.isPresentationOpen()) {
          try { screenManager.presentationWindow.close(); } catch (_) {}
        }
        updatePresentationButton();
      }, 500);
    }
    return;
  }

  try {
    const screens = await screenManager.getAvailableScreens();
    if (screens && screens.length > 1) {
      showScreenPicker(screens, async (screen) => {
        await screenManager.openPresentationWindow(screen);
        updatePresentationButton();
        startWindowCloseCheck();
      });
    } else {
      await screenManager.openPresentationWindow(null);
      updatePresentationButton();
      startWindowCloseCheck();
    }
  } catch (err) {
    alert(err.message);
  }
}

export async function handleScreenSwitch() {
  try {
    const screens = await screenManager.getAvailableScreens();
    if (screens && screens.length > 1) {
      showScreenPicker(screens, async (screen) => {
        await screenManager.switchScreen(screen);
        // Push full state to the new window
        setTimeout(() => {
          comm.broadcast('state-sync', AppState.getSerializableState());
        }, 800);
      });
    } else {
      alert('Only one screen detected. Cannot switch.');
    }
  } catch (err) {
    alert(err.message);
  }
}

export function showScreenPicker(screens, onSelect) {
  // Remove any existing picker
  const existing = document.getElementById('screen-picker-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'screen-picker-modal';
  modal.className = 'modal-overlay';

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  const title = document.createElement('h3');
  title.textContent = 'Select Monitor';
  panel.appendChild(title);

  screens.forEach((screen, idx) => {
    const btn = document.createElement('button');
    btn.className = 'screen-option-btn';
    btn.textContent = `${screen.label || 'Screen ' + (idx + 1)} — ${screen.width}×${screen.height}${screen.isPrimary ? ' (primary)' : ''}`;
    btn.addEventListener('click', () => {
      modal.remove();
      onSelect(screen);
    });
    panel.appendChild(btn);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-cancel-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => modal.remove());
  panel.appendChild(cancelBtn);

  modal.appendChild(panel);
  document.body.appendChild(modal);
}

export function togglePresentationFullscreen() {
  if (!screenManager.isPresentationOpen()) return;
  const presWin = screenManager.presentationWindow;
  try {
    if (presWin.document.fullscreenElement) {
      presWin.document.exitFullscreen();
    } else {
      presWin.document.documentElement.requestFullscreen();
    }
  } catch (err) {
    console.warn('[presenterUI] Fullscreen toggle failed:', err);
  }
}

export function updatePresentationButton() {
  if (!els.startPresentationBtn) return;
  const isOpen = screenManager.isPresentationOpen();
  //els.startPresentationBtn.textContent = isOpen ? '✓ Presenting' : '▶ Present';
  els.startPresentationBtn.classList.toggle('presenting', isOpen);
  if (isOpen) {
    els.startPresentationBtn.classList.remove('primary');
  } else {
    els.startPresentationBtn.classList.add('primary');
  }
}

export function startWindowCloseCheck() {
  clearInterval(uiState.windowCheckIntervalId);
  uiState.windowCheckIntervalId = setInterval(() => {
    if (!screenManager.isPresentationOpen()) {
      clearInterval(uiState.windowCheckIntervalId);
      uiState.windowCheckIntervalId = null;
      updatePresentationButton();
    }
  }, 1000);
}
