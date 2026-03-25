import AppState from '../state.js';
import comm from '../communication.js';
import { renderPage, updateThumbnailHighlight } from '../pdfRenderer.js';
import { renderNoteForPage } from '../notesManager.js';
import remoteManager from '../remoteManager.js';
import { uiState } from './uiState.js';
import { els } from './elements.js';
import { clearPresenterDrawing, updateBlackoutButton } from './tools.js';

export function navigateTo(page) {
  if (AppState.mediaType === 'pdf' && !AppState.pdfDocument) return;
  if (!AppState.playlist && !AppState.pdfDocument) return;
  const clamped = Math.max(1, Math.min(page, AppState.totalPages));
  if (clamped === AppState.currentPage) return;

  AppState.setState({ currentPage: clamped });
  comm.broadcast('page-change', { page: clamped, totalPages: AppState.totalPages });

  // Clear drawing on page change
  clearPresenterDrawing();
  comm.broadcast('draw-clear', {});

  // Reset zoom on page change
  if (uiState.zoomApplied) {
    uiState.zoomApplied = false;
    comm.broadcast('zoom-reset', {});
  }
}

export async function renderAllPreviews() {
  if (AppState.mediaType === 'pdf') {
    if (!AppState.pdfDocument) return;
    els.currentSlideCanvas.style.display = '';
    els.currentSlideVideo.style.display = 'none';
    els.currentSlideVideo.pause();
    els.currentSlideImage.style.display = 'none';
    
    els.nextSlideCanvas.style.display = 'none';
    els.nextSlideVideo.style.display = 'none';
    els.nextSlideVideo.pause();
    els.nextSlideImage.style.display = 'none';

    const currentContainer = els.currentSlideContainer;
    const nextContainer = els.nextSlideContainer;

    const clip = AppState.isBeamerSplitMode ? 'left'
               : AppState.isGDocsSplitMode ? 'top'
               : null;

    // Current slide
    await renderPage(AppState.currentPage, els.currentSlideCanvas, {
      maxWidth: currentContainer.clientWidth - 16,
      maxHeight: currentContainer.clientHeight - 16,
      clip,
    });

    // Next slide
    const nextPage = AppState.currentPage + 1;
    if (nextPage <= AppState.totalPages) {
      els.nextSlideCanvas.style.display = '';
      await renderPage(nextPage, els.nextSlideCanvas, {
        maxWidth: nextContainer.clientWidth - 16,
        maxHeight: nextContainer.clientHeight - 40,
        clip,
      });
    } else {
      els.nextSlideCanvas.style.display = 'none';
    }
  } else if (AppState.mediaType === 'video' || AppState.mediaType === 'image') {
    const isVid = AppState.mediaType === 'video';
    
    // Toggle active media elements
    els.currentSlideCanvas.style.display = 'none';
    els.currentSlideVideo.style.display = isVid ? '' : 'none';
    if (!isVid) els.currentSlideVideo.pause();
    els.currentSlideImage.style.display = isVid ? 'none' : '';
    
    els.nextSlideCanvas.style.display = 'none';
    els.nextSlideVideo.style.display = 'none';
    els.nextSlideVideo.pause();
    els.nextSlideImage.style.display = 'none';
    
    // Current media
    const currentMediaUrl = AppState.playlist[AppState.currentPage - 1];
    if (isVid) {
      if (els.currentSlideVideo.src !== currentMediaUrl) els.currentSlideVideo.src = currentMediaUrl;
    } else {
      if (els.currentSlideImage.src !== currentMediaUrl) els.currentSlideImage.src = currentMediaUrl;
    }
    
    // Next media
    const nextPage = AppState.currentPage + 1;
    if (nextPage <= AppState.totalPages) {
      const nextMediaUrl = AppState.playlist[nextPage - 1];
      if (isVid) {
        els.nextSlideVideo.style.display = '';
        if (els.nextSlideVideo.src !== nextMediaUrl) els.nextSlideVideo.src = nextMediaUrl;
      } else {
        els.nextSlideImage.style.display = '';
        if (els.nextSlideImage.src !== nextMediaUrl) els.nextSlideImage.src = nextMediaUrl;
      }
    }
  }

  // Notes
  await renderNotes();

  // Page indicator
  els.pageIndicator.textContent = `${AppState.currentPage} / ${AppState.totalPages}`;

  // Thumbnail highlight
  updateThumbnailHighlight(els.thumbnailContainer, AppState.currentPage);

  // Blackout button
  updateBlackoutButton();

  // Push state to connected remotes
  remoteManager.sendStateUpdate(AppState.currentPage, AppState.totalPages);
}

export async function renderNotes() {
  if (AppState.isBeamerSplitMode) {
    // Beamer: render right-half canvas
    els.notesPlaceholder.style.display = 'none';
    els.notesCanvas.style.display = '';

    const container = els.notesContent;
    const maxW = (container.clientWidth - 16) * uiState.notesZoom;
    const maxH = (container.clientHeight - 16) * uiState.notesZoom;

    await renderNoteForPage(AppState.currentPage, els.notesCanvas, maxW, maxH);
  } else if (AppState.isGDocsSplitMode && AppState.gDocsNotesMap) {
    // Google Docs: show extracted text
    els.notesCanvas.style.display = 'none';
    els.notesPlaceholder.style.display = '';

    const notesText = AppState.gDocsNotesMap[AppState.currentPage];
    if (notesText) {
      els.notesPlaceholder.textContent = notesText;
      els.notesPlaceholder.style.whiteSpace = 'pre-wrap';
      els.notesPlaceholder.style.fontSize = `${uiState.notesZoom * 100}%`;
    } else {
      els.notesPlaceholder.textContent = 'No notes available for this slide.';
      els.notesPlaceholder.style.whiteSpace = '';
      els.notesPlaceholder.style.fontSize = '';
    }
  } else {
    els.notesCanvas.style.display = 'none';
    els.notesPlaceholder.style.display = '';
    els.notesPlaceholder.textContent = 'No notes available for this slide.';
    els.notesPlaceholder.style.whiteSpace = '';
    els.notesPlaceholder.style.fontSize = '';
  }
}

export function setNotesZoom(value) {
  uiState.notesZoom = Math.max(0.4, Math.min(3.0, value));
  renderNotes();
}
