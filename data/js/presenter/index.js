import AppState from '../state.js';
import comm from '../communication.js';
import timer from '../timer.js';
import remoteManager from '../remoteManager.js';
import { els, cacheElements } from './elements.js';
import { uiState } from './uiState.js';
import { initSplitter, initSidebarSplitter, applySplitLayout, toggleNotesCollapse, toggleSidebarCollapse, toggleNextSlideCollapse } from './splitters.js';
import { navigateTo, renderAllPreviews, setNotesZoom } from './slides.js';
import { handleScreenSwitch, handleStartPresentation } from './screens.js';
import { toggleBlackout, clearPresenterDrawing, syncPresenterDrawCanvas } from './tools.js';
import { showHelpModal, handleBreakToggle, handleRemoteToggle, updateRemoteButton, handleQaToggle, updateQaButton, updateQaModalList, handleWebcamToggle } from './modals.js';
import { handleKeyDown } from './keyboard.js';
import { initCaptions } from './captionsManager.js';
import { initRecording } from './recordingManager.js';

export function init() {
  cacheElements();
  bindEvents();
  startClock();
  applySplitLayout();
  initCaptions();
  initRecording();

  if (uiState.notesCollapsed && els.mainContent) {
    els.mainContent.classList.add('notes-collapsed');
  }

  window.AppState = AppState;
  AppState.subscribe(onStateChange);
}

function bindEvents() {
  els.navPrev?.addEventListener('click', () => navigateTo(AppState.currentPage - 1));
  els.navNext?.addEventListener('click', () => navigateTo(AppState.currentPage + 1));

  els.slideJump?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const num = parseInt(els.slideJump.value, 10);
      if (num >= 1 && num <= AppState.totalPages) navigateTo(num);
      els.slideJump.value = '';
      els.slideJump.blur();
    }
  });

  els.timerStart?.addEventListener('click', () => timer.start());
  els.timerPause?.addEventListener('click', () => timer.pause());
  els.timerReset?.addEventListener('click', () => timer.reset());
  els.timerTarget?.addEventListener('change', () => {
    const val = parseInt(els.timerTarget.value, 10);
    if (val > 0) timer.setTargetDuration(val);
  });

  els.blackoutBtn?.addEventListener('click', toggleBlackout);
  els.screenSwitchBtn?.addEventListener('click', handleScreenSwitch);
  els.startPresentationBtn?.addEventListener('click', handleStartPresentation);

  els.notesZoomIn?.addEventListener('click', () => setNotesZoom(uiState.notesZoom + 0.15));
  els.notesZoomOut?.addEventListener('click', () => setNotesZoom(uiState.notesZoom - 0.15));
  els.notesZoomReset?.addEventListener('click', () => setNotesZoom(1.0));

  els.notesCollapse?.addEventListener('click', (e) => { e.stopPropagation(); toggleNotesCollapse(); });
  els.notesHeader?.addEventListener('click', (e) => { if (!e.target.closest('#notes-zoom')) toggleNotesCollapse(); });

  els.changePdfBtn?.addEventListener('click', () => {
    const input = document.getElementById('pdf-input');
    if (input) input.click();
  });

  els.helpBtn?.addEventListener('click', showHelpModal);
  els.breakBtn?.addEventListener('click', handleBreakToggle);
  els.remoteBtn?.addEventListener('click', handleRemoteToggle);

  remoteManager.onRemoteCommand((command) => {
    if (command === 'next') navigateTo(AppState.currentPage + 1);
    else if (command === 'prev') navigateTo(AppState.currentPage - 1);
  });

  comm.on('audience-navigate', ({ direction }) => {
     if (direction === 'next') navigateTo(AppState.currentPage + 1);
     else if (direction === 'prev') navigateTo(AppState.currentPage - 1);
  });
  remoteManager.onStatusChange((status) => {
    updateRemoteButton(status);
    if (status && status.connected && status.remoteCount > 0) {
      remoteManager.sendStateUpdate(AppState.currentPage, AppState.totalPages);
    }
  });

  els.sidebarCollapse?.addEventListener('click', (e) => { e.stopPropagation(); toggleSidebarCollapse(); });
  els.sidebarHeader?.addEventListener('click', () => toggleSidebarCollapse());

  els.nextSlideCollapse?.addEventListener('click', (e) => { e.stopPropagation(); toggleNextSlideCollapse(); });
  els.nextSlideContainer?.addEventListener('click', () => toggleNextSlideCollapse());
  //els.nextSlideHeader?.addEventListener('click', () => toggleNextSlideCollapse());

  document.addEventListener('keydown', handleKeyDown);

  initSplitter(els.slidesSplitter, 'horizontal');
  initSplitter(els.contentSplitter, 'vertical');
  initSidebarSplitter(els.sidebarSplitter);

  let resizeTimeout = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      renderAllPreviews();
      syncPresenterDrawCanvas();
    }, 250);
  });

  if (els.drawToolbar) {
    els.drawToolbar.querySelectorAll('.draw-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        uiState.drawColor = btn.dataset.color;
        uiState.drawEraser = false;
        els.drawToolbar.querySelectorAll('.draw-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const eraserBtn = document.getElementById('draw-eraser-btn');
        if (eraserBtn) eraserBtn.classList.remove('active');
      });
    });
    els.drawToolbar.querySelectorAll('.draw-width-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        uiState.drawWidth = parseInt(btn.dataset.width, 10) || 3;
        els.drawToolbar.querySelectorAll('.draw-width-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    const eraserBtn = document.getElementById('draw-eraser-btn');
    if (eraserBtn) {
      eraserBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        uiState.drawEraser = !uiState.drawEraser;
        eraserBtn.classList.toggle('active', uiState.drawEraser);
      });
    }
    const clearBtn = document.getElementById('draw-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearPresenterDrawing();
        comm.broadcast('draw-clear', {});
      });
    }
  }

  els.qaBtn?.addEventListener('click', handleQaToggle);
  els.webcamBtn?.addEventListener('click', handleWebcamToggle);

  remoteManager.onQaQuestion((question) => {
    uiState.qaQuestions.unshift(question);
    updateQaButton();
    updateQaModalList();
  });
}

function startClock() {
  updateClock();
  uiState.clockIntervalId = setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  if (els.clockDisplay) els.clockDisplay.textContent = `${h}:${m}:${s}`;
}

function onStateChange(state, changes) {
  if (changes.includes('currentPage') || changes.includes('totalPages') || changes.includes('pdfDocument')) {
    renderAllPreviews();
  }
  if (changes.includes('isBlackoutActive')) {
    const active = AppState.isBlackoutActive;
    if (els.blackoutBtn) {
      els.blackoutBtn.classList.toggle('active', active);
      els.blackoutBtn.dataset.tooltip = active ? 'Unblackout Screen (B)' : 'Blackout Screen (B)';
    }
  }
  if (changes.includes('timerState')) updateTimerDisplay();
}

function updateTimerDisplay() {
  if (!els.timerDisplay) return;
  const elapsed = timer.getElapsed();
  els.timerDisplay.textContent = timer.formatElapsed(elapsed);
  els.timerDisplay.classList.toggle('over-target', timer.isOverTarget());
}

export function showPresenterView() {
  if (els.landingScreen) els.landingScreen.style.display = 'none';
  if (els.presenterView) els.presenterView.style.display = 'grid';
}
