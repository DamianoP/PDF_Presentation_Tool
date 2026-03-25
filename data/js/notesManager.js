/**
 * notesManager.js — Speaker Notes Rendering
 *
 * Supports two modes:
 * - Beamer (LaTeX): renders the right-half of split-mode pages as canvas
 * - Google Docs: displays pre-extracted text notes in a DOM element
 */

import { renderPage } from './pdfRenderer.js';
import AppState from './state.js';

/**
 * Render the notes for a given page.
 *
 * For Beamer: renders right-half of split page onto the canvas.
 * For GDocs: returns the extracted text notes (caller handles display).
 * For normal PDFs: clears the canvas.
 *
 * @param {number}            pageNum
 * @param {HTMLCanvasElement}  canvas
 * @param {number}            maxWidth
 * @param {number}            maxHeight
 * @returns {Promise<string|null>} text notes for GDocs mode, null otherwise
 */
async function renderNoteForPage(pageNum, canvas, maxWidth, maxHeight) {
  if (AppState.isBeamerSplitMode) {
    // Beamer: render right half as canvas
    await renderPage(pageNum, canvas, {
      clip: 'right',
      maxWidth,
      maxHeight,
    });
    return null;
  }

  if (AppState.isGDocsSplitMode && AppState.gDocsNotesMap) {
    // Google Docs: return text notes (canvas not used)
    const ctx = canvas.getContext('2d');
    canvas.width = maxWidth || 300;
    canvas.height = maxHeight || 200;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return AppState.gDocsNotesMap[pageNum] || null;
  }

  // Normal PDF: no notes
  const ctx = canvas.getContext('2d');
  canvas.width = maxWidth || 300;
  canvas.height = maxHeight || 200;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return null;
}

/**
 * Render a plain-text manual note to a container element (future use).
 */
function renderManualNote(text, container) {
  container.textContent = text || '';
}

export { renderNoteForPage, renderManualNote };
