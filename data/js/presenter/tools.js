import AppState from '../state.js';
import comm from '../communication.js';
import { els } from './elements.js';
import { uiState } from './uiState.js';

export const LASER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='5' fill='%23ff2020'/%3E%3Ccircle cx='12' cy='12' r='7' fill='none' stroke='%23ff2020' stroke-opacity='0.4' stroke-width='2'/%3E%3C/svg%3E") 12 12, crosshair`;
export const SPOTLIGHT_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='%23f0c040' stroke-opacity='0.7' stroke-width='2'/%3E%3Ccircle cx='12' cy='12' r='3' fill='%23f0c040'/%3E%3C/svg%3E") 12 12, crosshair`;
export const ZOOM_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='10' cy='10' r='6' fill='none' stroke='%230080ff' stroke-width='2'/%3E%3Cline x1='14.5' y1='14.5' x2='20' y2='20' stroke='%230080ff' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='10' y1='7' x2='10' y2='13' stroke='%230080ff' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='7' y1='10' x2='13' y2='10' stroke='%230080ff' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") 12 12, zoom-in`;

function getActiveMediaElement() {
  if (AppState.mediaType === 'video') return els.currentSlideVideo;
  if (AppState.mediaType === 'image') return els.currentSlideImage;
  return els.currentSlideCanvas;
}

export function getMediaRect(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const mediaWidth = element.videoWidth || element.naturalWidth || element.width || 1;
  const mediaHeight = element.videoHeight || element.naturalHeight || element.height || 1;
  const mediaRatio = mediaWidth / mediaHeight;
  const boxRatio = rect.width / rect.height;

  let actualWidth = rect.width;
  let actualHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (mediaRatio > boxRatio) {
    actualHeight = rect.width / mediaRatio;
    offsetY = (rect.height - actualHeight) / 2;
  } else {
    actualWidth = rect.height * mediaRatio;
    offsetX = (rect.width - actualWidth) / 2;
  }

  return {
    left: rect.left + offsetX,
    top: rect.top + offsetY,
    width: actualWidth,
    height: actualHeight
  };
}

export function toggleLaser() {
  uiState.laserActive = !uiState.laserActive;

  // Turn off spotlight if laser activates
  if (uiState.laserActive && uiState.spotlightActive) {
    uiState.spotlightActive = false;
    stopPointerTracking();
  }

  if (uiState.laserActive) {
    // Turn off other interactive modes
    if (uiState.drawActive) toggleDrawMode();
    if (uiState.zoomActive) toggleZoom();

    const target = getActiveMediaElement();
    target.style.cursor = LASER_CURSOR;
    target.addEventListener('mousemove', handlePointerMove);
    target.addEventListener('mouseleave', handlePointerLeave);
  } else {
    stopPointerTracking();
  }
}

export function handlePointerMove(e) {
  if (uiState.pointerRafPending) return;
  uiState.pointerRafPending = true;
  requestAnimationFrame(() => {
    uiState.pointerRafPending = false;
    if (!uiState.laserActive && !uiState.spotlightActive) return; // Prevent late rAF execution
    const target = getActiveMediaElement();
    const actualRect = getMediaRect(target);
    if (!actualRect) return;
    const x = (e.clientX - actualRect.left) / actualRect.width;
    const y = (e.clientY - actualRect.top) / actualRect.height;
    const mode = uiState.spotlightActive ? 'spotlight' : 'laser';
    comm.broadcast('laser-move', { x, y, visible: true, mode });

    // Local spotlight preview on presenter
    if (uiState.spotlightActive && els.presenterSpotlightOverlay) {
      const container = els.currentSlideContainer;
      const containerRect = container.getBoundingClientRect();
      const localX = e.clientX - containerRect.left;
      const localY = e.clientY - containerRect.top;
      els.presenterSpotlightOverlay.style.background =
        `radial-gradient(circle 120px at ${localX}px ${localY}px, transparent 0%, transparent 50%, rgba(0,0,0,0.75) 100%)`;
      els.presenterSpotlightOverlay.classList.add('visible');
    }
  });
}

function handlePointerLeave() {
  comm.broadcast('laser-move', { x: 0, y: 0, visible: false });
}

export function stopPointerTracking() {
  const target = getActiveMediaElement();
  target.style.cursor = '';
  target.removeEventListener('mousemove', handlePointerMove);
  target.removeEventListener('mouseleave', handlePointerLeave);
  comm.broadcast('laser-move', { x: 0, y: 0, visible: false });

  // Hide presenter spotlight overlay
  if (els.presenterSpotlightOverlay) {
    els.presenterSpotlightOverlay.classList.remove('visible');
  }
}

export function toggleSpotlight() {
  uiState.spotlightActive = !uiState.spotlightActive;

  // Turn off laser if spotlight activates
  if (uiState.spotlightActive && uiState.laserActive) {
    uiState.laserActive = false;
    stopPointerTracking();
  }

  if (uiState.spotlightActive) {
    // Turn off other interactive modes
    if (uiState.drawActive) toggleDrawMode();
    if (uiState.zoomActive) toggleZoom();

    const target = getActiveMediaElement();
    target.style.cursor = SPOTLIGHT_CURSOR;
    target.addEventListener('mousemove', handlePointerMove);
    target.addEventListener('mouseleave', handlePointerLeave);
  } else {
    stopPointerTracking();
  }
}

export function toggleDrawMode() {
  uiState.drawActive = !uiState.drawActive;

  if (uiState.drawActive) {
    if (uiState.laserActive) toggleLaser();
    if (uiState.spotlightActive) toggleSpotlight();
    if (uiState.zoomActive) toggleZoom();

    syncPresenterDrawCanvas();
    els.presenterDrawCanvas.classList.add('active');
    if (els.drawToolbar) els.drawToolbar.style.display = 'flex';

    uiState.presenterDrawCtx = els.presenterDrawCanvas.getContext('2d');

    els.presenterDrawCanvas.addEventListener('mousedown', onDrawStart);
    els.presenterDrawCanvas.addEventListener('mousemove', onDrawMove);
    els.presenterDrawCanvas.addEventListener('mouseup', onDrawEnd);
    els.presenterDrawCanvas.addEventListener('mouseleave', onDrawEnd);
    els.presenterDrawCanvas.addEventListener('touchstart', onDrawTouchStart, { passive: false });
    els.presenterDrawCanvas.addEventListener('touchmove', onDrawTouchMove, { passive: false });
    els.presenterDrawCanvas.addEventListener('touchend', onDrawEnd);
  } else {
    els.presenterDrawCanvas.classList.remove('active');
    if (els.drawToolbar) els.drawToolbar.style.display = 'none';

    els.presenterDrawCanvas.removeEventListener('mousedown', onDrawStart);
    els.presenterDrawCanvas.removeEventListener('mousemove', onDrawMove);
    els.presenterDrawCanvas.removeEventListener('mouseup', onDrawEnd);
    els.presenterDrawCanvas.removeEventListener('mouseleave', onDrawEnd);
    els.presenterDrawCanvas.removeEventListener('touchstart', onDrawTouchStart);
    els.presenterDrawCanvas.removeEventListener('touchmove', onDrawTouchMove);
    els.presenterDrawCanvas.removeEventListener('touchend', onDrawEnd);

    // Clear annotations on deactivation
    clearPresenterDrawing();
    comm.broadcast('draw-clear', {});
  }
}

export function syncPresenterDrawCanvas() {
  const target = getActiveMediaElement();
  if (!els.presenterDrawCanvas || !target) return;
  const slideRect = getMediaRect(target);
  const container = els.currentSlideContainer;
  const containerRect = container.getBoundingClientRect();

  els.presenterDrawCanvas.width = slideRect.width;
  els.presenterDrawCanvas.height = slideRect.height;
  els.presenterDrawCanvas.style.position = 'absolute';
  els.presenterDrawCanvas.style.left = (slideRect.left - containerRect.left) + 'px';
  els.presenterDrawCanvas.style.top = (slideRect.top - containerRect.top) + 'px';
  els.presenterDrawCanvas.style.width = slideRect.width + 'px';
  els.presenterDrawCanvas.style.height = slideRect.height + 'px';
  els.presenterDrawCanvas.style.transform = 'none';
}

function onDrawStart(e) {
  uiState.isDrawing = true;
  uiState.drawPoints = [];
  const target = getActiveMediaElement();
  const actualRect = getMediaRect(target);
  if (!actualRect) return;
  const x = (e.clientX - actualRect.left) / actualRect.width;
  const y = (e.clientY - actualRect.top) / actualRect.height;
  uiState.drawPoints.push({ x, y });
}

function onDrawMove(e) {
  if (!uiState.isDrawing) return;
  const target = getActiveMediaElement();
  const actualRect = getMediaRect(target);
  if (!actualRect) return;
  const x = (e.clientX - actualRect.left) / actualRect.width;
  const y = (e.clientY - actualRect.top) / actualRect.height;
  uiState.drawPoints.push({ x, y });

  drawLocalStroke(uiState.drawPoints);

  if (uiState.drawPoints.length >= 2) {
    const segment = uiState.drawPoints.slice(-2);
    comm.broadcast('draw-stroke', {
      points: segment,
      color: uiState.drawColor,
      width: uiState.drawWidth,
      eraser: uiState.drawEraser,
    });
  }
}

function onDrawTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  onDrawStart({ clientX: touch.clientX, clientY: touch.clientY });
}

function onDrawTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  onDrawMove({ clientX: touch.clientX, clientY: touch.clientY });
}

function onDrawEnd() {
  uiState.isDrawing = false;
  uiState.drawPoints = [];
}

export function drawLocalStroke(points) {
  if (!uiState.presenterDrawCtx || points.length < 2) return;

  const w = els.presenterDrawCanvas.width;
  const h = els.presenterDrawCanvas.height;
  const ctx = uiState.presenterDrawCtx;

  if (uiState.drawEraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = uiState.drawColor;
  }
  ctx.lineWidth = uiState.drawWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const p0 = points[points.length - 2];
  const p1 = points[points.length - 1];

  // The draw canvas is already sized and positioned to match the actual
  // visible media area (via syncPresenterDrawCanvas), so normalized
  // coordinates map directly to canvas pixels.
  const x0 = p0.x * w;
  const y0 = p0.y * h;
  const x1 = p1.x * w;
  const y1 = p1.y * h;

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

export function clearPresenterDrawing() {
  if (!els.presenterDrawCanvas) return;
  const ctx = els.presenterDrawCanvas.getContext('2d');
  ctx.clearRect(0, 0, els.presenterDrawCanvas.width, els.presenterDrawCanvas.height);
}

export function toggleZoom() {
  const container = els.currentSlideContainer;
  if (uiState.zoomActive) {
    uiState.zoomActive = false;
    uiState.zoomApplied = false;
    uiState.zoomOrigRect = null;
    uiState.zoomOrigTargetRect = null;
    container.style.cursor = '';
    container.removeEventListener('mousemove', handleZoomMove);
    container.removeEventListener('mouseleave', handleZoomLeave);
    comm.broadcast('zoom-reset', {});
    // Reset local zoom on presenter
    resetPresenterZoom();
    return;
  }

  if (uiState.laserActive) toggleLaser();
  if (uiState.spotlightActive) toggleSpotlight();
  if (uiState.drawActive) toggleDrawMode();

  uiState.zoomActive = true;
  uiState.zoomApplied = true;
  uiState.zoomOrigRect = null;
  uiState.zoomOrigTargetRect = null;

  // Set cursor after other tools have deactivated
  requestAnimationFrame(() => {
    container.style.cursor = ZOOM_CURSOR;
  });

  container.addEventListener('mousemove', handleZoomMove);
  container.addEventListener('mouseleave', handleZoomLeave);
}

export function handleZoomMove(e) {
  if (uiState.zoomRafPending) return;
  uiState.zoomRafPending = true;
  requestAnimationFrame(() => {
    uiState.zoomRafPending = false;
    if (!uiState.zoomActive) return; // Prevent late rAF execution
    const target = getActiveMediaElement();
    if (!target) return;
    
    // Cache the UN-SCALED rects before the first zoom transform is applied
    if (!uiState.zoomOrigRect) {
      uiState.zoomOrigTargetRect = target.getBoundingClientRect();
      uiState.zoomOrigRect = getMediaRect(target);
    }
    
    const actualRect = uiState.zoomOrigRect;
    if (!actualRect) return;
    
    const x = (e.clientX - actualRect.left) / actualRect.width;
    const y = (e.clientY - actualRect.top) / actualRect.height;
    
    // Clamp to prevent wild zoom when mouse is outside the image bounds but inside container
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));

    comm.broadcast('zoom-area', { x: clampedX, y: clampedY, scale: 2.0 });

    // Local zoom preview on presenter
    applyPresenterZoom(clampedX, clampedY, 2.0, actualRect);
  });
}

function handleZoomLeave() {
  comm.broadcast('zoom-reset', {});
  resetPresenterZoom();
  uiState.zoomOrigRect = null;
  uiState.zoomOrigTargetRect = null;
}

/**
 * Apply a local zoom transform to the presenter's current slide element.
 */
function applyPresenterZoom(x, y, scale, actualRect) {
  const target = getActiveMediaElement();
  if (!target) return;
  const container = els.currentSlideContainer;
  const containerRect = container.getBoundingClientRect();

  // Focal point relative to container based on clamped x, y and unscaled actualRect
  const focalX = (actualRect.left + x * actualRect.width) - containerRect.left;
  const focalY = (actualRect.top + y * actualRect.height) - containerRect.top;

  // We apply the transform to the container's children via a CSS transform
  // on the media element itself, constrained within its container via overflow:hidden.
  const centerX = containerRect.width / 2;
  const centerY = containerRect.height / 2;
  const tx = centerX - focalX * scale;
  const ty = centerY - focalY * scale;

  target.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  target.style.transformOrigin = '0 0';
  container.style.overflow = 'hidden';
}

/**
 * Reset the presenter's local zoom transform.
 */
function resetPresenterZoom() {
  const target = getActiveMediaElement();
  if (target) {
    target.style.transform = '';
    target.style.transformOrigin = '';
  }
  const container = els.currentSlideContainer;
  if (container) {
    container.style.overflow = '';
  }
}

export function toggleProgressBar() {
  uiState.progressBarVisible = !uiState.progressBarVisible;
  comm.broadcast('progress-bar-toggle', { visible: uiState.progressBarVisible });
}

export function toggleBlackout() {
  const next = !AppState.isBlackoutActive;
  AppState.setState({ isBlackoutActive: next });
  comm.broadcast('blackout-toggle', { active: next });
  updateBlackoutButton();
}

export function updateBlackoutButton() {
  if (els.blackoutBtn) {
    els.blackoutBtn.classList.toggle('active', AppState.isBlackoutActive);
    els.blackoutBtn.title = AppState.isBlackoutActive
      ? 'Unblackout Screen (B)'
      : 'Blackout Screen (B)';
  }
}
