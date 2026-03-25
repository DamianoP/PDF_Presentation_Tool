import { state } from './state.js';

function captureForFade() {
  if (state.transitionType !== 'fade') return null;

  const canvas = document.getElementById('slide-canvas');
  const video = document.getElementById('slide-video');
  const img = document.getElementById('slide-image');

  let activeEl = null;
  if (canvas && canvas.style.display !== 'none') activeEl = canvas;
  else if (video && video.style.display !== 'none') activeEl = video;
  else if (img && img.style.display !== 'none') activeEl = img;

  if (!activeEl) return null;

  const overlay = document.createElement('canvas');
  overlay.className = 'slide-transition-fade';
  overlay.style.position = 'absolute';
  overlay.style.top = '50%';
  overlay.style.left = '50%';
  overlay.style.transform = 'translate(-50%, -50%)';
  overlay.style.zIndex = '2';
  overlay.style.pointerEvents = 'none';

  if (activeEl === canvas) {
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    overlay.style.width = canvas.style.width || canvas.clientWidth + 'px';
    overlay.style.height = canvas.style.height || canvas.clientHeight + 'px';
    overlay.getContext('2d').drawImage(canvas, 0, 0);
  } else {
    const rect = activeEl.getBoundingClientRect();
    overlay.width = rect.width * (window.devicePixelRatio || 1);
    overlay.height = rect.height * (window.devicePixelRatio || 1);
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.getContext('2d').drawImage(activeEl, 0, 0, overlay.width, overlay.height);
  }

  document.body.appendChild(overlay);
  return overlay;
}

function triggerFadeOut(overlay) {
  if (!overlay) return;
  requestAnimationFrame(() => {
    overlay.classList.add('slide-fade-out');
    setTimeout(() => overlay.remove(), 400); 
  });
}


export function tryAutoFullscreen() {
  if (state.hasRequestedFullscreen) return;
  state.hasRequestedFullscreen = true;

  setTimeout(() => {
    document.documentElement.requestFullscreen().catch(() => {
      console.log('[presentationUI] Auto-fullscreen denied — use F key');
    });
  }, 300);
}

export function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

let hasRenderedOnce = false;

export async function loadPDF(blobUrl) {
  try {
    const pdfjsLib = window.pdfjsLib;
    const canvas = document.getElementById('slide-canvas');
    
    // Hide totally at boot to prevent showing visually miscalculated layouts 
    // while the browser window is requesting and animating into Fullscreen.
    if (canvas && !hasRenderedOnce) {
      canvas.style.opacity = '0';
      canvas.style.transition = 'none';
    }

    state.pdfDocument = await pdfjsLib.getDocument({ url: blobUrl }).promise;

    if (!hasRenderedOnce) {
      hasRenderedOnce = true;
      // 300ms for tryAutoFullscreen trigger + 300ms for the OS animation to finish
      setTimeout(async () => {
        await renderCurrentSlide();
        if (canvas) {
          canvas.style.transition = 'opacity 0.6s ease';
          canvas.style.opacity = '1';
        }
      }, 600);
    } else {
      renderCurrentSlide();
    }
  } catch (err) {
    console.error('[presentationUI] Failed to load PDF:', err);
  }
}

export async function renderCurrentSlide() {
  const slideCanvas = document.getElementById('slide-canvas');
  const slideVideo = document.getElementById('slide-video');
  const slideImage = document.getElementById('slide-image');
  if (!slideCanvas || !slideVideo || !slideImage) return;

  const fadeOverlay = captureForFade();

  if (state.mediaType === 'video' || state.mediaType === 'image') {
    const isVid = state.mediaType === 'video';
    
    slideCanvas.style.display = 'none';
    slideVideo.style.display = isVid ? '' : 'none';
    slideImage.style.display = isVid ? 'none' : '';
    
    if (!isVid) slideVideo.pause();
    
    // Switch media source if needed
    if (state.currentPage >= 1 && state.currentPage <= state.totalPages) {
      const currentMediaUrl = state.playlist[state.currentPage - 1];
      if (isVid) {
        if (slideVideo.src !== currentMediaUrl) {
          slideVideo.onloadeddata = () => triggerFadeOut(fadeOverlay);
          slideVideo.src = currentMediaUrl;
        } else {
          triggerFadeOut(fadeOverlay);
        }
      } else {
        if (slideImage.src !== currentMediaUrl) {
          slideImage.onload = () => triggerFadeOut(fadeOverlay);
          slideImage.src = currentMediaUrl;
        } else {
          triggerFadeOut(fadeOverlay);
        }
      }
    } else {
      triggerFadeOut(fadeOverlay);
    }
    return;
  }

  // Restore PDF mode visibility
  slideCanvas.style.display = '';
  slideVideo.style.display = 'none';
  slideVideo.pause();
  slideImage.style.display = 'none';

  if (!state.pdfDocument || state.currentPage < 1) return;

  if (state.activeRenderTask) {
    try { state.activeRenderTask.cancel(); } catch (_) {}
    state.activeRenderTask = null;
  }

  const page = await state.pdfDocument.getPage(state.currentPage);
  const baseViewport = page.getViewport({ scale: 1 });

  const isBeamer = state.isBeamerSplitMode;
  const isGDocs = state.isGDocsSplitMode;
  const clip = isBeamer ? 'left' : (isGDocs ? 'top' : null);

  let effectiveWidth = baseViewport.width;
  let effectiveHeight = baseViewport.height;
  if (isBeamer) {
    effectiveWidth = baseViewport.width / 2;
  } else if (isGDocs && state.gDocsSlideRect) {
    effectiveWidth = baseViewport.width * state.gDocsSlideRect.w;
    effectiveHeight = baseViewport.height * state.gDocsSlideRect.h;
  }

  const maxW = window.innerWidth;
  const maxH = window.innerHeight;
  const scale = Math.min(maxW / effectiveWidth, maxH / effectiveHeight);

  const renderViewport = page.getViewport({ scale });

  if (isBeamer) {
    slideCanvas.width = Math.floor(renderViewport.width / 2);
    slideCanvas.height = Math.floor(renderViewport.height);
  } else if (isGDocs && state.gDocsSlideRect) {
    slideCanvas.width = Math.floor(renderViewport.width * state.gDocsSlideRect.w);
    slideCanvas.height = Math.floor(renderViewport.height * state.gDocsSlideRect.h);
  } else {
    slideCanvas.width = Math.floor(renderViewport.width);
    slideCanvas.height = Math.floor(renderViewport.height);
  }

  const ctx = slideCanvas.getContext('2d');
  ctx.clearRect(0, 0, slideCanvas.width, slideCanvas.height);

  if (isBeamer) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, slideCanvas.width, slideCanvas.height);
    ctx.clip();
  } else if (isGDocs && state.gDocsSlideRect) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, slideCanvas.width, slideCanvas.height);
    ctx.clip();
    const offsetX = -(renderViewport.width * state.gDocsSlideRect.x);
    const offsetY = -(renderViewport.height * state.gDocsSlideRect.y);
    ctx.translate(offsetX, offsetY);
  }

  const renderTask = page.render({
    canvasContext: ctx,
    viewport: renderViewport,
  });
  state.activeRenderTask = renderTask;

  try {
    await renderTask.promise;
    triggerFadeOut(fadeOverlay);
  } catch (err) {
    if (err && err.name === 'RenderingCancelledException') {
      if (fadeOverlay) fadeOverlay.remove();
      return;
    }
    if (fadeOverlay) fadeOverlay.remove();
    throw err;
  } finally {
    if (state.activeRenderTask === renderTask) state.activeRenderTask = null;
  }

  if (isBeamer || (isGDocs && state.gDocsSlideRect)) {
    ctx.restore();
  }
}

export function setBlackout(active) {
  const blackoutOverlay = document.getElementById('blackout-overlay');
  if (blackoutOverlay) {
    blackoutOverlay.classList.toggle('visible', !!active);
  }
}
