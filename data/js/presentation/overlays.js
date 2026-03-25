import { state } from './state.js';

export function getLaserDot() {
  let el = document.getElementById('laser-dot');
  if (!el) {
    el = document.createElement('div');
    el.id = 'laser-dot';
    el.style.cssText = 'display:none;position:fixed;width:12px;height:12px;margin-left:-6px;margin-top:-6px;border-radius:50%;background:#ff2020;box-shadow:0 0 8px 3px rgba(255,32,32,.6);pointer-events:none;z-index:9998;transition:left 30ms linear,top 30ms linear;';
    document.body.appendChild(el);
  }
  return el;
}

function getActiveMediaElement() {
  if (state.mediaType === 'video') return document.getElementById('slide-video');
  if (state.mediaType === 'image') return document.getElementById('slide-image');
  return document.getElementById('slide-canvas');
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

export function showLaser(x, y, visible) {
  const dot = getLaserDot();
  const target = getActiveMediaElement();
  if (!visible || x == null || y == null || !target) {
    dot.style.display = 'none';
    return;
  }

  const actualRect = getMediaRect(target);
  const screenX = actualRect.left + x * actualRect.width;
  const screenY = actualRect.top + y * actualRect.height;

  dot.style.display = 'block';
  dot.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
}

export function hideLaser() {
  getLaserDot().style.display = 'none';
}
let spotlightRadius = 260;
export function showSpotlight(x, y, visible) {
  const overlay = document.getElementById('spotlight-overlay');
  const target = getActiveMediaElement();
  if (!overlay || !target) return;

  if (!visible || x == null || y == null) {
    overlay.classList.remove('visible');
    return;
  }

  const actualRect = getMediaRect(target);
  const screenX = actualRect.left + x * actualRect.width;
  const screenY = actualRect.top + y * actualRect.height;

  overlay.style.background = `radial-gradient(circle ${spotlightRadius}px at ${screenX}px ${screenY}px, transparent 0%, transparent 50%, rgba(0,0,0,0.80) 100%)`;
  overlay.classList.add('visible');
}

export function hideSpotlight() {
  const overlay = document.getElementById('spotlight-overlay');
  if (overlay) overlay.classList.remove('visible');
}

export function getDrawOverlay() {
  return document.getElementById('draw-overlay');
}

export function syncDrawOverlaySize() {
  const drawCanvas = getDrawOverlay();
  const target = getActiveMediaElement();
  if (!drawCanvas || !target) return;
  // Use the actual visible media area (excluding letterbox padding)
  const actualRect = getMediaRect(target);
  if (!actualRect) return;
  drawCanvas.width = actualRect.width;
  drawCanvas.height = actualRect.height;
  drawCanvas.style.left = actualRect.left + 'px';
  drawCanvas.style.top = actualRect.top + 'px';
  drawCanvas.style.width = actualRect.width + 'px';
  drawCanvas.style.height = actualRect.height + 'px';
}

export function drawStrokeOnOverlay(stroke) {
  const drawCanvas = getDrawOverlay();
  const target = getActiveMediaElement();
  if (!drawCanvas || !target) return;

  const actualRect = getMediaRect(target);
  if (!actualRect) return;

  if (drawCanvas.width !== Math.floor(actualRect.width) ||
      drawCanvas.height !== Math.floor(actualRect.height)) {
    syncDrawOverlaySize();
  }

  const ctx = drawCanvas.getContext('2d');
  const points = stroke.points;
  if (!points || points.length < 2) return;

  const w = drawCanvas.width;
  const h = drawCanvas.height;

  if (stroke.eraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color || '#ff2020';
  }
  ctx.lineWidth = stroke.width || 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The draw canvas is sized and positioned to match the actual visible
  // media area, so normalized coordinates map directly to canvas pixels.
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const cx = points[i].x * w;
    const cy = points[i].y * h;
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

export function clearDrawOverlay() {
  const drawCanvas = getDrawOverlay();
  if (!drawCanvas) return;
  const ctx = drawCanvas.getContext('2d');
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

export function storeCanvasRect() {
  const target = getActiveMediaElement();
  if (!state.isZoomed && target) {
    state.canvasOrigRect = target.getBoundingClientRect();
    state.actualOrigRect = getMediaRect(target);
  }
}

export function applyZoom(x, y, scale) {
  const target = getActiveMediaElement();
  if (!target) return;

  storeCanvasRect();
  const rect = state.canvasOrigRect;
  const actual = state.actualOrigRect;

  const focalX = (actual.left + x * actual.width) - rect.left;
  const focalY = (actual.top + y * actual.height) - rect.top;

  const viewCenterX = window.innerWidth / 2;
  const viewCenterY = window.innerHeight / 2;
  const tx = viewCenterX - focalX * scale;
  const ty = viewCenterY - focalY * scale;

  target.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  target.style.transformOrigin = '0 0';
  state.isZoomed = true;
}

export function resetZoom() {
  if (!state.isZoomed) return;
  const target = getActiveMediaElement();
  if (target) {
    target.style.transform = '';
    target.style.transformOrigin = '';
  }
  state.isZoomed = false;
  state.canvasOrigRect = null;
  state.actualOrigRect = null;
}

export function updateProgressBar() {
  const bar = document.getElementById('audience-progress-bar');
  if (!bar) return;

  bar.classList.toggle('visible', state.progressBarVisible);
  if (state.totalPages > 0) {
    const pct = (state.currentPage / state.totalPages) * 100;
    bar.style.width = pct + '%';
  }
}

export function showQaOverlay(qaUrl, qrUrl) {
  const overlay = document.getElementById('qa-overlay');
  if (!overlay) return;

  const qrImg = document.getElementById('qa-overlay-qr');
  const urlText = document.getElementById('qa-overlay-url');

  if (qrImg && qrUrl) {
    qrImg.src = qrUrl.startsWith('/') ? location.origin + qrUrl : qrUrl;
  }
  if (urlText && qaUrl) urlText.textContent = qaUrl;

  overlay.classList.add('visible');
}

export function hideQaOverlay() {
  const overlay = document.getElementById('qa-overlay');
  if (overlay) overlay.classList.remove('visible');
}

export function startBreakTimer(duration, title) {
  const overlay = document.getElementById('break-overlay');
  const titleEl = document.getElementById('break-title');
  const minutesEl = document.getElementById('break-minutes');
  const secondsEl = document.getElementById('break-seconds');
  const progressBar = document.getElementById('break-progress-bar');
  const progressText = document.getElementById('break-progress-text');

  if (!overlay) return;

  state.breakDuration = duration * 60 * 1000;
  state.breakStartTime = Date.now();

  titleEl.textContent = title || 'Break timer';
  overlay.classList.add('visible');
  progressBar.style.backgroundColor = '#3498db';

  if (state.breakTimerId) clearInterval(state.breakTimerId);

  function updateBreak() {
    const elapsed = Date.now() - state.breakStartTime;
    const remaining = Math.max(0, state.breakDuration - elapsed);
    const percentage = Math.min((elapsed / state.breakDuration) * 100, 100);

    const totalSec = Math.ceil(remaining / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;

    minutesEl.textContent = String(min).padStart(2, '0');
    secondsEl.textContent = String(sec).padStart(2, '0');
    progressBar.style.width = percentage + '%';
    progressText.textContent = Math.floor(percentage) + '%';

    if (remaining < 60000 && remaining > 0) {
      progressBar.style.backgroundColor = '#f0883e';
    }

    if (remaining <= 0) {
      clearInterval(state.breakTimerId);
      state.breakTimerId = null;
      minutesEl.textContent = '00';
      secondsEl.textContent = '00';
      progressBar.style.width = '100%';
      progressBar.style.backgroundColor = '#3fb950';
      progressText.textContent = '100%';
      titleEl.textContent = '✓ Break Over';
    }
  }

  updateBreak();
  state.breakTimerId = setInterval(updateBreak, 200);
}

export function stopBreakTimer() {
  const overlay = document.getElementById('break-overlay');
  if (state.breakTimerId) {
    clearInterval(state.breakTimerId);
    state.breakTimerId = null;
  }
  if (overlay) overlay.classList.remove('visible');
}

/* ------------------------------------------------------------------ */
/*  Webcam bubble                                                      */
/* ------------------------------------------------------------------ */

/**
 * Show the webcam bubble at the given position.
 */
export function showWebcamBubble(position) {
  const bubble = document.getElementById('webcam-bubble');
  if (!bubble) return;

  // Set position class
  bubble.classList.remove('bottom-left', 'top-left', 'top-right', 'bottom-right');
  bubble.classList.add(position || 'bottom-left');
  bubble.classList.add('visible');
}

export function hideWebcamBubble() {
  const bubble = document.getElementById('webcam-bubble');
  if (bubble) {
    bubble.classList.remove('visible');
    bubble.srcObject = null;
  }
}

export function setWebcamBubbleVisibility(visible) {
  const bubble = document.getElementById('webcam-bubble');
  if (!bubble || !bubble.srcObject) return;
  if (visible) {
    bubble.classList.add('visible');
  } else {
    bubble.classList.remove('visible');
  }
}

import comm from '../communication.js';

let webrtcReceiverPc = null;
let iceCandidateQueue = [];

comm.on('webrtc-offer', async (offerData) => {
  console.log('[WebRTC Receiver] Received offer');
  if (webrtcReceiverPc) {
    webrtcReceiverPc.close();
  }
  webrtcReceiverPc = new RTCPeerConnection({ iceServers: [] });
  iceCandidateQueue = [];
  
  webrtcReceiverPc.onicecandidate = (e) => {
    if (e.candidate) {
      comm.broadcast('webrtc-ice-receiver', e.candidate.toJSON());
    }
  };

  webrtcReceiverPc.ontrack = (e) => {
    console.log('[WebRTC Receiver] Received track:', e.track.kind);
    const bubble = document.getElementById('webcam-bubble');
    if (bubble && e.streams && e.streams[0]) {
      bubble.srcObject = e.streams[0];
      bubble.play().catch(err => console.error('[WebRTC Receiver] play() failed:', err));
    }
  };

  webrtcReceiverPc.onconnectionstatechange = () => {
    console.log('[WebRTC Receiver] Connection state:', webrtcReceiverPc.connectionState);
  };

  try {
    await webrtcReceiverPc.setRemoteDescription(new RTCSessionDescription(offerData));
    
    // Add queued ICE candidates
    for (const c of iceCandidateQueue) {
      await webrtcReceiverPc.addIceCandidate(c);
    }
    iceCandidateQueue = [];

    const answer = await webrtcReceiverPc.createAnswer();
    await webrtcReceiverPc.setLocalDescription(answer);
    const desc = webrtcReceiverPc.localDescription;
    comm.broadcast('webrtc-answer', { type: desc.type, sdp: desc.sdp });
    console.log('[WebRTC Receiver] Answer sent');
  } catch (err) {
    console.error('[WebRTC Receiver] failed to process offer:', err);
  }
});

comm.on('webrtc-ice-sender', async (candidateData) => {
  if (webrtcReceiverPc) {
    try {
      const c = new RTCIceCandidate(candidateData);
      if (webrtcReceiverPc.remoteDescription) {
        await webrtcReceiverPc.addIceCandidate(c);
      } else {
        iceCandidateQueue.push(c);
      }
    } catch (err) {
      console.error('[WebRTC Receiver] failed to add ICE candidate:', err);
    }
  }
});

