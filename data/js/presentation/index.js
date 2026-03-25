import { state } from './state.js';
import { tryAutoFullscreen, toggleFullscreen, loadPDF, renderCurrentSlide, setBlackout } from './slides.js';
import { showLaser, hideLaser, showSpotlight, hideSpotlight, drawStrokeOnOverlay, clearDrawOverlay, applyZoom, resetZoom, updateProgressBar, showQaOverlay, hideQaOverlay, startBreakTimer, stopBreakTimer, syncDrawOverlaySize, showWebcamBubble, hideWebcamBubble, setWebcamBubbleVisibility } from './overlays.js';

const CHANNEL_NAME = 'pdf-presenter-sync';
let channel = null;

function initComm() {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => handleMessage(event.data);
  }

  // postMessage fallback
  window.addEventListener('message', (event) => {
    if (event.data && event.data._presenterSync) {
      handleMessage(event.data);
    }
  });

  // Tell the opener we're ready
  if (channel) {
    channel.postMessage({
      type: 'presentation-ready',
      payload: {},
      _presenterSync: true,
    });
  }
}

function handleMessage(data) {
  const { type, payload } = data;

  switch (type) {
    case 'state-sync':
      state.isBeamerSplitMode = payload.isBeamerSplitMode;
      state.isGDocsSplitMode = payload.isGDocsSplitMode || false;
      state.gDocsSlideRect = payload.gDocsSlideRect || null;
      state.currentPage = payload.currentPage;
      state.totalPages = payload.totalPages || 0;
      state.mediaType = payload.mediaType || 'pdf';
      state.playlist = payload.playlist || [];
      state.transitionType = payload.transitionType || 'none';
      state.captionsEnabled = payload.captionsEnabled || false;
      state.captionsFontSize = payload.captionsFontSize || '5vh';

      if (payload.mediaType === 'video' || payload.mediaType === 'image') {
        renderCurrentSlide();
      } else if (payload.pdfBlobUrl && !state.pdfDocument) {
        loadPDF(payload.pdfBlobUrl);
      } else {
        renderCurrentSlide();
      }
      setBlackout(payload.isBlackoutActive);
      updateProgressBar();
      // Auto-fullscreen on first state sync
      tryAutoFullscreen();
      break;

    case 'page-change':
      state.currentPage = payload.page;
      if (payload.totalPages) state.totalPages = payload.totalPages;
      renderCurrentSlide();
      clearDrawOverlay();
      resetZoom();
      updateProgressBar();
      break;

    case 'transition-change':
      state.transitionType = payload.type;
      break;

    case 'blackout-toggle':
      setBlackout(payload.active);
      setWebcamBubbleVisibility(!payload.active);
      break;

    case 'pdf-loaded':
      state.isBeamerSplitMode = payload.isBeamerSplitMode;
      state.isGDocsSplitMode = payload.isGDocsSplitMode || false;
      state.gDocsSlideRect = payload.gDocsSlideRect || null;
      state.currentPage = payload.currentPage || 1;
      state.totalPages = payload.totalPages || 0;
      state.mediaType = payload.mediaType || 'pdf';
      
      if (payload.mediaType === 'video' || payload.mediaType === 'image') {
        state.playlist = payload.playlist || [];
        state.pdfDocument = null;
        renderCurrentSlide();
      } else if (payload.pdfBlobUrl) {
        state.pdfDocument = null;
        loadPDF(payload.pdfBlobUrl);
      }
      clearDrawOverlay();
      resetZoom();
      updateProgressBar();
      break;

    case 'fullscreen-toggle':
      toggleFullscreen();
      break;

    case 'fullscreen-request':
      tryAutoFullscreen();
      break;

    case 'laser-move':
      if (payload.mode === 'spotlight') {
        showSpotlight(payload.x, payload.y, payload.visible);
        hideLaser();
      } else {
        showLaser(payload.x, payload.y, payload.visible);
        hideSpotlight();
      }
      break;

    case 'close-presentation':
      window.close();
      break;

    case 'break-start':
      startBreakTimer(payload.duration, payload.title);
      break;

    case 'break-stop':
      stopBreakTimer();
      break;

    case 'draw-stroke':
      drawStrokeOnOverlay(payload);
      break;

    case 'draw-clear':
      clearDrawOverlay();
      break;

    case 'zoom-area':
      applyZoom(payload.x, payload.y, payload.scale || 2.0);
      break;

    case 'zoom-reset':
      resetZoom();
      break;

    case 'progress-bar-toggle':
      state.progressBarVisible = !!payload.visible;
      updateProgressBar();
      break;

    case 'qa-show':
      console.log('[presentationUI] Received qa-show', payload);
      showQaOverlay(payload.qaUrl, payload.qrUrl);
      break;

    case 'qa-hide':
      hideQaOverlay();
      break;

    case 'webcam-start':
      showWebcamBubble(payload.position);
      break;

    case 'webcam-stop':
      hideWebcamBubble();
      break;

    case 'captions-config':
      state.captionsEnabled = payload.enabled;
      state.captionsFontSize = payload.fontSize;
      const capOverlay = document.getElementById('captions-overlay');
      if (capOverlay) {
         capOverlay.style.display = state.captionsEnabled ? 'flex' : 'none';
         capOverlay.style.fontSize = state.captionsFontSize;
         if (!state.captionsEnabled) {
           const box = capOverlay.querySelector('.captions-text-box');
           if (box) box.textContent = '';
         }
      }
      break;

    case 'captions-text':
      if (state.captionsEnabled) {
        const capOverlayText = document.querySelector('#captions-overlay .captions-text-box');
        if (capOverlayText) {
          capOverlayText.textContent = payload.text;
          
          if (window.captionsTimeout) clearTimeout(window.captionsTimeout);
          window.captionsTimeout = setTimeout(() => {
            capOverlayText.textContent = '';
          }, 4000);
        }
      }
      break;

    case 'video-sync':
      const video = document.getElementById('slide-video');
      if (!video) break;
      
      if (payload.type === 'play') {
        video.play().catch(() => {});
      } else if (payload.type === 'pause') {
        video.pause();
      } else if (payload.type === 'seeked' || payload.type === 'timeupdate') {
        // Only adjust if drift is significant to avoid stuttering
        if (Math.abs(video.currentTime - payload.currentTime) > 0.5) {
          video.currentTime = payload.currentTime;
        }
      } else if (payload.type === 'ratechange') {
        video.playbackRate = payload.playbackRate;
      }
      break;
  }
}

/* ------------------------------------------------------------------ */
/*  Global Listeners                                                   */
/* ------------------------------------------------------------------ */

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.mediaType === 'video' || state.mediaType === 'image') {
       syncDrawOverlaySize();
    } else {
       renderCurrentSlide();
       syncDrawOverlaySize();
    }
  }, 150);
});

document.addEventListener('fullscreenchange', () => {
  setTimeout(() => {
    renderCurrentSlide();
    syncDrawOverlaySize();
  }, 200);
});

document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('selectstart', (e) => e.preventDefault());

// Enforce fullscreen on specific interactions to ensure audience window goes fullscreen
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === 'F11' || e.key === 'Escape') return;

  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    toggleFullscreen();
    return;
  }

  // Handle slide navigation commands
  if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
     e.preventDefault();
     if (channel) {
        channel.postMessage({
           type: 'audience-navigate',
           payload: {
               direction: ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) ? 'prev' : 'next'
           },
           _presenterSync: true
        });
     } else if (window.opener) {
        window.opener.postMessage({
           type: 'audience-navigate',
           payload: {
               direction: ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) ? 'prev' : 'next'
           },
           _presenterSync: true
        }, '*');
     }
     return;
  }

  e.preventDefault();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
});

document.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
});

// Init
initComm();
