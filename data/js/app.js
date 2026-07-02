/**
 * app.js — Application Entry Point
 *
 * Bootstraps the PDF Presentation Tool: wires file input, initialises modules,
 * registers the service worker, and handles communication events.
 */

import AppState from './state.js';
import comm from './communication.js';
import { loadPDF, generateThumbnails } from './pdfRenderer.js';
import { init as initPresenterUI, showPresenterView } from './presenter/index.js';
import { renderAllPreviews, navigateTo } from './presenter/slides.js';
import { initVideoSync } from './videoSync.js';
import screenManager from './screenManager.js';
import { uiState } from './presenter/uiState.js';
/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */
const APP_VERSION = '20260701-125431';
console.log('[app] App version:', APP_VERSION);
export default function initApp() {
  // Configure PDF.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  
  initPresenterUI();
  bindFileInput();
  bindCommListeners();
  initVideoSync();
  registerServiceWorker();
}
initApp();

/* ------------------------------------------------------------------ */
/*  File input                                                         */
/* ------------------------------------------------------------------ */

function bindFileInput() {
  const input = document.getElementById('pdf-input');
  const dropZone = document.getElementById('drop-zone');

  if (input) {
    input.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) handleFiles(files);
      // We intentionally do NOT reset input.value = '' here.
      // Clearing the input.value instantly invalidates the underlying File handle in Chromium,
      // which causes the audience window Blob URL fetch to fail with ERR_FILE_NOT_FOUND,
      // creating a desync where the audience window gets stuck on the previous presentation's slide.
    });
  }

  // Drag-and-drop support on landing screen
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleFiles(files);
      }
    });
  }
}

async function handleFiles(files) {
  try {
    // Check if we are dealing with videos or images
    const isVideo = files.every(f => f.type.startsWith('video/'));
    const isImage = files.every(f => f.type.startsWith('image/'));
    const isPdf = files.length === 1 && files[0].type === 'application/pdf';

    if (!isVideo && !isPdf && !isImage) {
      alert('Please select a single PDF file, or one or more video/image files.');
      return;
    }

    // Revoke old blob URLs if switching
    if (AppState.pdfBlobUrl) {
      URL.revokeObjectURL(AppState.pdfBlobUrl);
    }
    if (AppState.playlist && AppState.playlist.length > 0) {
      AppState.playlist.forEach(url => URL.revokeObjectURL(url));
    }

    // Show presenter view first so canvases/videos have layout dimensions
    showPresenterView();

    if (isPdf) {
      AppState.setState({ mediaType: 'pdf', playlist: [] });
      const { pdfDocument, totalPages, isBeamerSplitMode, isGDocsSplitMode } = await loadPDF(files[0]);

      const container = document.getElementById('thumbnail-container');
      generateThumbnails(pdfDocument, container, (page) => {
        navigateTo(page);
      });

      comm.broadcast('pdf-loaded', {
        pdfBlobUrl: AppState.pdfBlobUrl,
        totalPages,
        isBeamerSplitMode,
        isGDocsSplitMode,
        gDocsSlideRect: AppState.gDocsSlideRect,
        currentPage: 1,
      });

    } else if (isVideo || isImage) {
      const newMediaType = isVideo ? 'video' : 'image';
      
      let playlist = [];
      if (isVideo) {
        // Videos can still safely use ObjectURLs if the presentation window is an opener
        // However, a more robust way for images is FileReader Data URLs. 
        // We will keep ObjectURLs for videos due to size constraints.
        playlist = files.map(f => URL.createObjectURL(f));
        finalizePlaylist(playlist, newMediaType);
      } else {
        // Images must be Base64 Data URLs so they can be sent across BroadcastChannel to the audience window
        const readers = files.map(f => {
          return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(f);
          });
        });
        
        Promise.all(readers).then(results => {
          finalizePlaylist(results, newMediaType);
        });
      }

      function finalizePlaylist(finalPlaylist, mType) {
        AppState.setState({ 
          mediaType: mType, 
          playlist: finalPlaylist, 
          totalPages: finalPlaylist.length, 
          currentPage: 1,
          isBeamerSplitMode: false,
          isGDocsSplitMode: false,
          gDocsSlideRect: null,
          gDocsNotesMap: null,
          pdfDocument: null,
          pdfBlobUrl: null
        });

        // trigger the UI update (hiding canvas, showing media, etc)
        navigateTo(1);

        // Generate thumbnails for navigation
        const container = document.getElementById('thumbnail-container');
        container.innerHTML = '';
        finalPlaylist.forEach((url, i) => {
           const wrapper = document.createElement('div');
           wrapper.className = 'thumbnail-item';
           if (i === 0) wrapper.classList.add('active');
           wrapper.dataset.page = i + 1;
           
           let mediaThumb;
           if (isVideo) {
             mediaThumb = document.createElement('video');
             mediaThumb.muted = true;
             mediaThumb.preload = 'metadata';
             mediaThumb.addEventListener('loadedmetadata', () => {
                 mediaThumb.currentTime = 1;
             }, { once: true });
           } else {
             mediaThumb = document.createElement('img');
           }
           
           mediaThumb.className = 'thumbnail-canvas';
           mediaThumb.src = url;
           
           const label = document.createElement('span');
           label.className = 'thumbnail-label';
           label.textContent = `${isVideo ? 'Video' : 'Image'} ${i + 1}`;
           
           wrapper.appendChild(mediaThumb);
           wrapper.appendChild(label);
           container.appendChild(wrapper);
           
           wrapper.addEventListener('click', () => navigateTo(i + 1));
        });

        comm.broadcast('pdf-loaded', {
          mediaType: mType,
          playlist: finalPlaylist,
          totalPages: finalPlaylist.length,
          isBeamerSplitMode: false,
          isGDocsSplitMode: false,
          gDocsSlideRect: null,
          currentPage: 1,
        });
      }
    }

  } catch (err) {
    console.error('[app] Failed to load media:', err);
    alert('Failed to load media: ' + err.message);
  }
}

/* ------------------------------------------------------------------ */
/*  Communication listeners (presenter side)                           */
/* ------------------------------------------------------------------ */

function bindCommListeners() {
  // When the presentation window signals ready, push full state
  comm.on('presentation-ready', () => {
    if (AppState.pdfDocument || AppState.playlist) {
      comm.broadcast('state-sync', AppState.getSerializableState());
    }
    // Re-broadcast webcam state if active (slight delay to let audience finish initial render)
    if (uiState.webcamActive) {
      setTimeout(() => {
        comm.broadcast('webcam-start', { position: uiState.webcamPosition });
      }, 500);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Service worker                                                     */
/* ------------------------------------------------------------------ */

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        console.log('[app] Service worker registered:', reg.scope);
      })
      .catch((err) => {
        console.warn('[app] Service worker registration failed:', err);
      });
  }
}
