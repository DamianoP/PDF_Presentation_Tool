/**
 * pdfRenderer.js — PDF Loading & Canvas Rendering
 *
 * Handles PDF.js document loading, single-page rendering with optional
 * Beamer half-page clipping or Google Docs top-portion clipping,
 * and batched thumbnail generation.
 */

import AppState from './state.js';

/** @type {Map<number, HTMLCanvasElement>} */
const thumbnailCache = new Map();

/** @type {Map<HTMLCanvasElement, object>} Track active render tasks per canvas */
const activeRenders = new Map();

/**
 * Load a PDF from a File/Blob and detect Beamer or Google Docs split mode.
 * @param {File|Blob} fileBlob
 * @returns {Promise<{pdfDocument, totalPages, isBeamerSplitMode, isGDocsSplitMode}>}
 */
async function loadPDF(fileBlob) {
  const url = URL.createObjectURL(fileBlob);
  const pdfjsLib = window.pdfjsLib;

  const pdfDocument = await pdfjsLib.getDocument({ url }).promise;
  const totalPages = pdfDocument.numPages;

  // Detect Beamer split mode: double-width pages have aspect ratio > 2.2
  const firstPage = await pdfDocument.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });
  const aspectRatio = viewport.width / viewport.height;
  const isBeamerSplitMode = aspectRatio > 2.2;

  let isGDocsSplitMode = false;
  let gDocsSlideRect = null;
  let gDocsNotesMap = null;

  // If not Beamer, try Google Docs detection
  if (!isBeamerSplitMode) {
    const detection = await detectGDocsMode(pdfDocument, firstPage, viewport);
    if (detection) {
      const confirmCrop = window.confirm(
        'Does this PDF originate from Google Docs and contain notes? By confirming, the PDF will be cropped and the notes will be displayed in the correct panel.'
      );
      
      if (confirmCrop) {
        isGDocsSplitMode = true;
        gDocsSlideRect = detection.slideRect;
        // Extract notes for all pages
        gDocsNotesMap = await extractGDocsNotes(pdfDocument, totalPages, viewport, detection.notesBoundaryY);
        console.log('[pdfRenderer] Detected Google Docs split mode, slide rect:', gDocsSlideRect);
      } else {
        console.log('[pdfRenderer] Google Docs split mode detected but skipped by user');
      }
    }
  }

  AppState.setState({
    pdfDocument,
    totalPages,
    isBeamerSplitMode,
    isGDocsSplitMode,
    gDocsSlideRect,
    gDocsNotesMap,
    pdfBlobUrl: url,
    currentPage: 1,
  });

  return { pdfDocument, totalPages, isBeamerSplitMode, isGDocsSplitMode };
}

/**
 * Detect Google Docs notes layout by scanning the first few pages for
 * a clear visual gap separating slide content (upper) from notes (lower).
 *
 * Tries pages 1–5 so detection works even when page 1 has no notes
 * (e.g. a title slide).
 *
 * @param {PDFDocumentProxy} pdfDoc
 * @param {PDFPageProxy} firstPage
 * @param {Object} viewport
 * @returns {Promise<{slideRect: {x,y,w,h}, notesBoundaryY: number}|null>}
 */
async function detectGDocsMode(pdfDoc, firstPage, viewport) {
  const pageW = viewport.width;
  const pageH = viewport.height;
  const aspectRatio=pageW/pageH;
  // Only consider portrait or near-square pages (aspect < 1.5)
  if (aspectRatio > 1.5) return null;
  if (aspectRatio > 1.32 && aspectRatio < 1.34) return null;

  // Try multiple pages — page 1 might be a title slide without notes
  const maxPages = Math.min(pdfDoc.numPages, 5);

  for (let p = 1; p <= maxPages; p++) {
    const page = (p === 1) ? firstPage : await pdfDoc.getPage(p);
    const result = await analyzePageForGDocsPattern(page, pageW, pageH);
    if (result) return result;
  }

  return null;
}

/**
 * Analyze a single page for the Google Docs notes pattern.
 * Uses font-size-aware gap detection to find the largest vertical gap
 * between text groups in the middle portion of the page.
 *
 * @param {PDFPageProxy} page
 * @param {number} pageW
 * @param {number} pageH
 * @returns {Promise<{slideRect: {x,y,w,h}, notesBoundaryY: number}|null>}
 */
async function analyzePageForGDocsPattern(page, pageW, pageH) {
  const textContent = await page.getTextContent();
  const textItems = textContent.items.filter(item => item.str && item.str.trim().length > 0);

  if (textItems.length < 3) return null;

  // Build position info for each text item, accounting for font size.
  // In PDF.js: transform[5] = baseline y from bottom; transform[3] ≈ font size.
  // We compute visual bounds: top (baseline - ascenders) and bottom (baseline + descenders).
  const positions = textItems.map(item => {
    const fontSize = Math.abs(item.transform[3]) || 10;
    const baselineFromTop = pageH - item.transform[5];
    const visualTop = baselineFromTop - fontSize * 0.85;  // ascenders
    const visualBottom = baselineFromTop + fontSize * 0.2; // descenders
    return { visualTop, visualBottom };
  });

  // Sort by visual top position (topmost first)
  positions.sort((a, b) => a.visualTop - b.visualTop);

  // Find the largest vertical gap in the 30–60% region of the page.
  // This gap separates the slide content (above) from notes text (below).
  let bestGap = { size: 0, boundary: 0 };

  for (let i = 0; i < positions.length - 1; i++) {
    const gapTop = positions[i].visualBottom;
    const gapBottom = positions[i + 1].visualTop;
    const gapSize = gapBottom - gapTop;
    const gapCenter = (gapTop + gapBottom) / 2;

    // Only consider gaps in the middle portion of the page
    if (gapCenter >= pageH * 0.30 && gapCenter <= pageH * 0.60 && gapSize > bestGap.size) {
      bestGap = { size: gapSize, boundary: gapCenter };
    }
  }

  // Need a noticeable gap (at least 8 pts ≈ visible separator)
  if (bestGap.size < 8) return null;

  // Verify there's content ABOVE and BELOW the gap
  const aboveCount = positions.filter(p => p.visualBottom < bestGap.boundary).length;
  const belowCount = positions.filter(p => p.visualTop > bestGap.boundary).length;
  if (aboveCount < 1 || belowCount < 2) return null;

  let notesBoundaryY = bestGap.boundary;
  notesBoundaryY += 85;
  const slideRect = {
    x: 0.06, //left
    y: 0.075, //top
    w: 0.89, //right
    h: 0.376, // bottom
  };

  // Sanity check: slide area should be between 30% and 60% of page height
  if (slideRect.h < 0.30 || slideRect.h > 0.60) return null;

  return { slideRect, notesBoundaryY };
}

/**
 * Extract text notes from all pages for Google Docs layout.
 * Notes are text items positioned below the slide bounding box.
 * Pages with upper content (slide) are treated as slide pages.
 * Pages with only lower content are continuation pages (skipped for now).
 *
 * @param {PDFDocumentProxy} pdfDoc
 * @param {number} totalPages
 * @param {Object} viewport (of page 1, for dimensions)
 * @param {number} notesBoundaryY — y position (from top) below which text is notes
 * @returns {Promise<Object>} { pageNum: notesText }
 */
async function extractGDocsNotes(pdfDoc, totalPages, viewport, notesBoundaryY) {
  const pageH = viewport.height;
  const notesMap = {};

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();

    const allItems = textContent.items.filter(item => item.str && item.str.trim().length > 0);

    if (allItems.length === 0) continue;

    // Separate slide text (above boundary) from notes text (below boundary)
    // Use baseline position for separation (boundary was computed with visual bounds)
    const noteItems = [];
    let hasUpperContent = false;

    for (const item of allItems) {
      const baselineFromTop = pageH - item.transform[5];
      if (baselineFromTop >= notesBoundaryY) {
        noteItems.push(item);
      } else {
        hasUpperContent = true;
      }
    }

    if (hasUpperContent) {
      // This is a slide page
      if (noteItems.length > 0) {
        // Has notes — extract the text
        noteItems.sort((a, b) => {
          const yA = pageH - a.transform[5];
          const yB = pageH - b.transform[5];
          if (Math.abs(yA - yB) > 3) return yA - yB;
          return a.transform[4] - b.transform[4];
        });

        const lines = [];
        let currentLine = [noteItems[0]];

        for (let j = 1; j < noteItems.length; j++) {
          const prevY = pageH - currentLine[0].transform[5];
          const currY = pageH - noteItems[j].transform[5];
          if (Math.abs(currY - prevY) <= 3) {
            currentLine.push(noteItems[j]);
          } else {
            lines.push(currentLine.map(it => it.str).join(' '));
            currentLine = [noteItems[j]];
          }
        }
        lines.push(currentLine.map(it => it.str).join(' '));

        notesMap[i] = lines.join('\n');
      } else {
        // Slide page with no notes
        notesMap[i] = '';
      }
    }
    // If !hasUpperContent → continuation page, skip for now
  }

  return notesMap;
}

/**
 * Render a single PDF page to a canvas.
 *
 * @param {number}            pageNum   1-indexed page number
 * @param {HTMLCanvasElement}  canvas    target canvas
 * @param {object}            options
 * @param {number}            [options.scale]     explicit scale factor
 * @param {string|null}       [options.clip]      'left' | 'right' | 'top' | null
 * @param {number}            [options.maxWidth]   fit within this width
 * @param {number}            [options.maxHeight]  fit within this height
 */
async function renderPage(pageNum, canvas, options = {}) {
  const { pdfDocument } = AppState;
  if (!pdfDocument || pageNum < 1 || pageNum > AppState.totalPages) return;

  // Cancel any in-flight render on this canvas
  const existing = activeRenders.get(canvas);
  if (existing) {
    try { existing.cancel(); } catch (_) { /* already done */ }
    activeRenders.delete(canvas);
  }

  const page = await pdfDocument.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });

  const isBeamer = AppState.isBeamerSplitMode;
  const isGDocs = AppState.isGDocsSplitMode;
  const clip = options.clip || null;

  // Effective visible dimensions (before scaling)
  let effectiveWidth = baseViewport.width;
  let effectiveHeight = baseViewport.height;
  if (isBeamer && clip) {
    effectiveWidth = baseViewport.width / 2;
  } else if (isGDocs && clip === 'top' && AppState.gDocsSlideRect) {
    // Only show the slide portion (upper part)
    effectiveWidth = baseViewport.width * AppState.gDocsSlideRect.w;
    effectiveHeight = baseViewport.height * AppState.gDocsSlideRect.h;
  }

  // Compute scale to fit within maxWidth/maxHeight
  let scale = options.scale || 1;
  if (options.maxWidth || options.maxHeight) {
    const scaleX = options.maxWidth ? options.maxWidth / effectiveWidth : Infinity;
    const scaleY = options.maxHeight ? options.maxHeight / effectiveHeight : Infinity;
    scale = Math.min(scaleX, scaleY);
  }

  // Hi-DPI: render at devicePixelRatio resolution for crisp display
  const dprCap = options.dprCap || 3;
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  const hiDpiScale = scale * dpr;

  const renderViewport = page.getViewport({ scale: hiDpiScale });

  // CSS (visual) dimensions vs canvas (backing) dimensions
  let cssWidth, cssHeight;
  if (isBeamer && clip) {
    canvas.width = Math.floor(renderViewport.width / 2);
    canvas.height = Math.floor(renderViewport.height);
    cssWidth = Math.floor(canvas.width / dpr);
    cssHeight = Math.floor(canvas.height / dpr);
  } else if (isGDocs && clip === 'top' && AppState.gDocsSlideRect) {
    canvas.width = Math.floor(renderViewport.width * AppState.gDocsSlideRect.w);
    canvas.height = Math.floor(renderViewport.height * AppState.gDocsSlideRect.h);
    cssWidth = Math.floor(canvas.width / dpr);
    cssHeight = Math.floor(canvas.height / dpr);
  } else {
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    cssWidth = Math.floor(canvas.width / dpr);
    cssHeight = Math.floor(canvas.height / dpr);
  }
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (isBeamer && clip) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.clip();

    const offsetX = clip === 'right' ? -(renderViewport.width / 2) : 0;
    ctx.translate(offsetX, 0);
  } else if (isGDocs && clip === 'top' && AppState.gDocsSlideRect) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.clip();
    const offsetX = -(renderViewport.width * AppState.gDocsSlideRect.x);
    const offsetY = -(renderViewport.height * AppState.gDocsSlideRect.y);
    ctx.translate(offsetX, offsetY);
  }

  const renderTask = page.render({
    canvasContext: ctx,
    viewport: renderViewport,
  });
  activeRenders.set(canvas, renderTask);

  try {
    await renderTask.promise;
  } catch (err) {
    // RenderingCancelledException is expected when we cancel a stale render
    if (err && err.name === 'RenderingCancelledException') {
      return;
    }
    throw err;
  } finally {
    // Only clean up if this is still the active render for this canvas
    if (activeRenders.get(canvas) === renderTask) {
      activeRenders.delete(canvas);
    }
  }

  if ((isBeamer && clip) || (isGDocs && clip === 'top' && AppState.gDocsSlideRect)) {
    ctx.restore();
  }
}

/**
 * Generate thumbnails with concurrency limiting.
 *
 * @param {PDFDocumentProxy} pdfDoc
 * @param {HTMLElement}      container  DOM element to append thumbnails into
 * @param {function(number)} onClick    callback when a thumbnail is clicked
 * @param {number}           [concurrency=4]
 * @returns {Promise<Array>}
 */
async function generateThumbnails(pdfDoc, container, onClick, concurrency = 4) {
  const totalPages = pdfDoc.numPages;
  thumbnailCache.clear();
  container.innerHTML = '';

  // Determine which pages to show thumbnails for
  // For GDocs mode, skip continuation pages (pages without slides)
  const slidePages = getSlidePageNumbers();

  const thumbElements = [];

  // Create placeholder DOM elements for every slide page
  for (const i of slidePages) {
    const wrapper = document.createElement('div');
    wrapper.className = 'thumbnail-item';
    wrapper.dataset.page = i;
    if (i === AppState.currentPage) {
      wrapper.classList.add('active');
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'thumbnail-canvas';

    const label = document.createElement('span');
    label.className = 'thumbnail-label';
    label.textContent = i;

    wrapper.appendChild(canvas);
    wrapper.appendChild(label);
    container.appendChild(wrapper);

    wrapper.addEventListener('click', () => onClick(i));
    thumbElements.push({ pageNum: i, canvas, wrapper });
  }

  // Batched concurrent rendering
  let index = 0;

  async function worker() {
    while (index < thumbElements.length) {
      const item = thumbElements[index++];
      const clip = AppState.isBeamerSplitMode ? 'left'
                 : AppState.isGDocsSplitMode ? 'top'
                 : null;
      await renderPage(item.pageNum, item.canvas, {
        maxWidth: 180,
        maxHeight: 135,
        clip,
      });
      thumbnailCache.set(item.pageNum, item.canvas);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, slidePages.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return thumbElements;
}

/**
 * Get the list of page numbers that contain actual slides.
 * For Google Docs mode, pages that are only note continuations are excluded.
 * For Beamer and normal PDFs, all pages are slide pages.
 *
 * @returns {number[]}
 */
function getSlidePageNumbers() {
  const totalPages = AppState.totalPages;
  if (!AppState.isGDocsSplitMode || !AppState.gDocsNotesMap) {
    // All pages are slides
    const pages = [];
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  }

  // In GDocs mode, a page with notes is a slide page.
  // A page without notes that has no upper content is a continuation page.
  // For simplicity (single-page notes), every page that has an entry in notesMap is a slide page.
  // Pages without an entry might be continuation-only pages — exclude them.
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (AppState.gDocsNotesMap[i] !== undefined) {
      pages.push(i);
    }
  }
  // If somehow no pages matched (e.g. a page with slide but no notes),
  // fall back to all pages
  return pages.length > 0 ? pages : Array.from({ length: totalPages }, (_, i) => i + 1);
}

/**
 * Highlight the active thumbnail and scroll it into view.
 */
function updateThumbnailHighlight(container, pageNum) {
  const items = container.querySelectorAll('.thumbnail-item');
  items.forEach((item) => {
    item.classList.toggle('active', parseInt(item.dataset.page, 10) === pageNum);
  });

  const activeThumb = container.querySelector('.thumbnail-item.active');
  if (activeThumb) {
    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export {
  loadPDF,
  renderPage,
  generateThumbnails,
  updateThumbnailHighlight,
  thumbnailCache,
  getSlidePageNumbers,
};
