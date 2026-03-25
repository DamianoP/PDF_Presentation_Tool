import { uiState } from './uiState.js';
import { els } from './elements.js';
import { renderAllPreviews } from './slides.js';

export function initSplitter(splitterEl, direction) {
  if (!splitterEl) return;

  let startPos = 0;
  let startRatio = 0;
  let parentSize = 0;

  function onMouseDown(e) {
    e.preventDefault();
    const parent = splitterEl.parentElement;

    if (direction === 'horizontal') {
      startPos = e.clientX;
      startRatio = uiState.slidesSplitRatio;
      parentSize = parent.clientWidth;
    } else {
      startPos = e.clientY;
      startRatio = uiState.contentSplitRatio;
      parentSize = parent.clientHeight;
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.classList.add('resizing');
    splitterEl.classList.add('active');
  }

  function onMouseMove(e) {
    const delta = (direction === 'horizontal')
      ? e.clientX - startPos
      : e.clientY - startPos;

    const deltaRatio = delta / parentSize;
    const newRatio = Math.max(0.2, Math.min(0.8, startRatio + deltaRatio));

    if (direction === 'horizontal') {
      uiState.slidesSplitRatio = newRatio;
    } else {
      uiState.contentSplitRatio = newRatio;
    }

    applySplitLayout();
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.classList.remove('resizing');
    splitterEl.classList.remove('active');

    // Re-render after resize
    renderAllPreviews();
  }

  splitterEl.addEventListener('mousedown', onMouseDown);
}

export function applySplitLayout() {
  const root = document.documentElement;
  root.style.setProperty('--slides-split', `${uiState.slidesSplitRatio * 100}%`);
  root.style.setProperty('--content-split', `${uiState.contentSplitRatio * 100}%`);
}

export function initSidebarSplitter(splitterEl) {
  if (!splitterEl) return;

  let startX = 0;
  let startWidth = 0;

  function onMouseDown(e) {
    e.preventDefault();
    startX = e.clientX;
    startWidth = els.thumbnailSidebar.offsetWidth;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.classList.add('resizing');
    splitterEl.classList.add('active');
  }

  function onMouseMove(e) {
    const delta = e.clientX - startX;
    const newWidth = Math.max(100, Math.min(450, startWidth + delta));
    document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.classList.remove('resizing');
    splitterEl.classList.remove('active');
    renderAllPreviews();
  }

  splitterEl.addEventListener('mousedown', onMouseDown);
}

export function toggleNotesCollapse() {
  uiState.notesCollapsed = !uiState.notesCollapsed;
  if (els.mainContent) {
    els.mainContent.classList.toggle('notes-collapsed', uiState.notesCollapsed);
  }
  setTimeout(() => renderAllPreviews(), 50);
}

export function toggleSidebarCollapse() {
  uiState.sidebarCollapsed = !uiState.sidebarCollapsed;
  if (els.presenterView) {
    els.presenterView.classList.toggle('sidebar-collapsed', uiState.sidebarCollapsed);
  }
  setTimeout(() => renderAllPreviews(), 50);
}

export function toggleNextSlideCollapse() {
  uiState.nextSlideCollapsed = !uiState.nextSlideCollapsed;
  if (els.slidesArea) {
    els.slidesArea.classList.toggle('next-collapsed', uiState.nextSlideCollapsed);
  }
  setTimeout(() => renderAllPreviews(), 50);
}
