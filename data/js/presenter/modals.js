import comm from '../communication.js';
import remoteManager from '../remoteManager.js';
import webcamManager from '../webcamManager.js';
import { isSupported, applyCaptionsSettings, isEnabled as captionsEnabled, currentFontSize, recognition } from './captionsManager.js';
import { els } from './elements.js';
import { uiState } from './uiState.js';

export function showHelpModal() {
  const existing = document.getElementById('help-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'help-modal';
  modal.className = 'modal-overlay';

  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  panel.style.maxWidth = '480px';

  panel.innerHTML = `
    <h3>Presentation Settings</h3>
    <div style="margin-bottom:1rem;">
      <label for="transition-select" style="margin-right:.5rem;">Slide Transition:</label>
      <select id="transition-select" style="padding:.4em; border-radius:6px; background:var(--bg-elevated); color:var(--text-primary); border:1px solid var(--border);">
        <option value="none">None</option>
        <option value="fade">Fade</option>
      </select>
    </div>
    
    <h3>Keyboard Shortcuts</h3>
    <table class="help-table">
      <tr><td><kbd>Right</kbd> <kbd>Down</kbd> <kbd>Space</kbd> <kbd>PgDn</kbd></td><td>Next slide</td></tr>
      <tr><td><kbd>Left</kbd> <kbd>Up</kbd> <kbd>PgUp</kbd></td><td>Previous slide</td></tr>
      <tr><td><kbd>Home</kbd></td><td>First slide</td></tr>
      <tr><td><kbd>End</kbd></td><td>Last slide</td></tr>
      <tr><td><kbd>B</kbd> or <kbd>.</kbd></td><td>Toggle blackout</td></tr>
      <tr><td><kbd>F</kbd></td><td>Toggle fullscreen (presentation)</td></tr>
      <tr><td><kbd>L</kbd></td><td>Toggle laser pointer</td></tr>
      <tr><td><kbd>S</kbd></td><td>Toggle spotlight</td></tr>
      <tr><td><kbd>D</kbd></td><td>Toggle whiteboard drawing</td></tr>
      <tr><td><kbd>Z</kbd></td><td>Toggle zoom lens (follows mouse)</td></tr>
      <tr><td><kbd>P</kbd></td><td>Toggle progress bar (audience)</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Exit current mode</td></tr>
    </table>
    <div style="margin-top:1rem;">
      <button class="modal-cancel-btn" id="help-close-btn">Close</button>
    </div>
  `;

  modal.appendChild(panel);
  document.body.appendChild(modal);

  const transitionSelect = document.getElementById('transition-select');
  // Load value from window.state or assume 'none' by default
  const currentState = window.AppState ? window.AppState.transitionType : 'none';
  transitionSelect.value = currentState || 'none';
  
  transitionSelect.addEventListener('change', (e) => {
    if (window.AppState) {
      window.AppState.transitionType = e.target.value; 
      // Update local state instance
      if (window.AppState.setState) {
         window.AppState.setState({ transitionType: e.target.value });
      }
      comm.broadcast('transition-change', { type: e.target.value });
    }
  });

  modal.appendChild(panel);
  document.body.appendChild(modal);

  document.getElementById('help-close-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

export async function handleRemoteToggle() {
  const existing = document.getElementById('remote-modal');
  if (existing) {
    existing.remove();
    return;
  }

  if (remoteManager.isConnected()) {
    showRemoteQRModal();
    return;
  }

  try {
    await remoteManager.connect();
    showRemoteQRModal();
  } catch (err) {
    console.error('[presenterUI] Remote connect failed:', err);
    alert('Failed to connect remote: ' + err.message);
  }
}

export function showRemoteQRModal() {
  const existing = document.getElementById('remote-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'remote-modal';
  modal.className = 'modal-overlay';

  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  panel.style.maxWidth = '400px';
  panel.style.textAlign = 'center';

  const title = document.createElement('h3');
  title.textContent = 'Phone Remote';
  panel.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.style.cssText = 'color: var(--text-secondary); font-size: .9rem; margin-bottom: 1rem;';
  subtitle.textContent = 'Scan this QR code with your phone to control the presentation.';
  panel.appendChild(subtitle);

  const qrImg = document.createElement('img');
  qrImg.src = remoteManager.getQRCodeUrl();
  qrImg.alt = 'QR Code for remote control';
  qrImg.className = 'qr-code-img';
  panel.appendChild(qrImg);

  const urlText = document.createElement('p');
  urlText.className = 'remote-url-text';
  urlText.textContent = remoteManager.getRemoteUrl();
  panel.appendChild(urlText);

  const statusEl = document.createElement('p');
  statusEl.id = 'remote-modal-status';
  statusEl.style.cssText = 'margin-top: .75rem; font-size: .85rem; color: var(--text-muted);';
  statusEl.textContent = 'Waiting for phone to connect\u2026';
  panel.appendChild(statusEl);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; gap: .5rem; margin-top: 1rem;';

  const disconnectBtn = document.createElement('button');
  disconnectBtn.className = 'modal-cancel-btn';
  disconnectBtn.textContent = 'Disconnect';
  disconnectBtn.style.flex = '1';
  disconnectBtn.addEventListener('click', () => {
    remoteManager.disconnect();
    modal.remove();
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-cancel-btn';
  closeBtn.textContent = 'Close';
  closeBtn.style.flex = '1';
  closeBtn.addEventListener('click', () => modal.remove());

  btnRow.appendChild(disconnectBtn);
  btnRow.appendChild(closeBtn);
  panel.appendChild(btnRow);

  modal.appendChild(panel);
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  const updateModalStatus = ({ remoteCount }) => {
    const el = document.getElementById('remote-modal-status');
    if (el) {
      if (remoteCount > 0) {
        el.textContent = `[OK] ${remoteCount} phone${remoteCount > 1 ? 's' : ''} connected`;
        el.style.color = 'var(--green)';
      } else {
        el.textContent = 'Waiting for phone to connect...';
        el.style.color = 'var(--text-muted)';
      }
    }
  };

  updateModalStatus({ remoteCount: remoteManager.getRemoteCount() });

  remoteManager.onStatusChange((status) => {
    updateRemoteButton(status);
    updateModalStatus(status);
  });
}

export function updateRemoteButton(status) {
  if (!els.remoteBtn) return;
  const badge = els.remoteBtn.querySelector('.btn-badge');
  if (status && status.connected && status.remoteCount > 0) {
    const count = status.remoteCount;
    els.remoteBtn.classList.add('active');
    if (badge) badge.textContent = count;
  } else {
    els.remoteBtn.classList.remove('active');
    if (badge) badge.textContent = '';
  }
}

export async function handleQaToggle() {
  if (!remoteManager.isConnected()) {
    try {
      await remoteManager.connect();
    } catch (err) {
      console.error('[presenterUI] Remote connect for Q&A failed:', err);
      alert('Failed to connect: ' + err.message);
      return;
    }
  }

  if (uiState.qaActive) {
    uiState.qaActive = false;
    comm.broadcast('qa-hide', {});
    const existing = document.getElementById('qa-modal');
    if (existing) existing.remove();
    updateQaButton();
  } else {
    uiState.qaActive = true;
    const qaUrl = remoteManager.getQaUrl();
    const qrUrl = remoteManager.getQaQRCodeUrl();
    comm.broadcast('qa-show', {
      qaUrl,
      qrUrl: qrUrl.startsWith('/') ? location.origin + qrUrl : qrUrl,
    });
    showQaModal();
    updateQaButton();
  }
}

export function showQaModal() {
  const existing = document.getElementById('qa-modal');
  if (existing) { existing.remove(); }

  const modal = document.createElement('div');
  modal.id = 'qa-modal';
  modal.className = 'modal-overlay';

  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  panel.style.maxWidth = '480px';

  panel.innerHTML = `
    <h3>Audience Q&A</h3>
    <p style="color: var(--text-secondary); font-size: .9rem; margin-bottom: 1rem;">
      The QR code is now visible on the audience screen.
      Questions from the audience will appear below.
    </p>
    <div id="qa-question-list" class="qa-question-list"></div>
    <div style="display: flex; gap: .5rem; margin-top: .75rem;">
      <button class="modal-cancel-btn" id="qa-clear-all-btn" style="flex:1">Clear All</button>
      <button class="modal-cancel-btn" id="qa-close-btn" style="flex:1">Close</button>
    </div>
  `;

  modal.appendChild(panel);
  document.body.appendChild(modal);

  document.getElementById('qa-close-btn').addEventListener('click', () => modal.remove());
  document.getElementById('qa-clear-all-btn').addEventListener('click', () => {
    uiState.qaQuestions = [];
    updateQaButton();
    updateQaModalList();
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  updateQaModalList();
}

export function updateQaButton() {
  if (!els.qaBtn) return;
  const badge = els.qaBtn.querySelector('.btn-badge');
  if (uiState.qaActive) {
    els.qaBtn.classList.add('active');
    if (badge) badge.textContent = uiState.qaQuestions.length > 0 ? uiState.qaQuestions.length : '';
  } else {
    els.qaBtn.classList.remove('active');
    if (badge) badge.textContent = uiState.qaQuestions.length > 0 ? uiState.qaQuestions.length : '';
  }
}

export function updateQaModalList() {
  const listEl = document.getElementById('qa-question-list');
  if (!listEl) return;

  if (uiState.qaQuestions.length === 0) {
    listEl.innerHTML = '<p class="qa-empty-text">No questions yet. Share the QR code with your audience!</p>';
    return;
  }

  listEl.innerHTML = '';
  uiState.qaQuestions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'qa-question-card';

    const time = new Date(q.timestamp);
    const timeStr = `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;

    card.innerHTML = `
      <span class="qa-question-text">${escapeHtml(q.text)}</span>
      <span class="qa-question-time">${timeStr}</span>
    `;

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'qa-dismiss-btn';
    dismissBtn.title = 'Dismiss';
    dismissBtn.textContent = '×';
    dismissBtn.addEventListener('click', () => {
      uiState.qaQuestions.splice(idx, 1);
      updateQaButton();
      updateQaModalList();
    });
    card.appendChild(dismissBtn);
    listEl.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function handleBreakToggle() {
  if (uiState.breakActive) {
    comm.broadcast('break-stop', {});
    uiState.breakActive = false;
    if (uiState.breakTimerId) {
      clearInterval(uiState.breakTimerId);
      uiState.breakTimerId = null;
    }
    updateBreakButton();
    return;
  }
  showBreakModal();
}

export function showBreakModal() {
  const existing = document.getElementById('break-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'break-modal';
  modal.className = 'modal-overlay';

  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  panel.style.maxWidth = '380px';
  panel.style.textAlign = 'center';

  panel.innerHTML = `
    <h3>Break Timer</h3>
    <p style="color: var(--text-secondary); font-size: .9rem; margin-bottom: 1rem;">
      Set the break duration. The countdown will appear on the presentation screen.
    </p>
    <div class="break-presets">
      <button class="break-preset-btn" data-minutes="5">5 min</button>
      <button class="break-preset-btn" data-minutes="10">10 min</button>
      <button class="break-preset-btn" data-minutes="15">15 min</button>
      <button class="break-preset-btn" data-minutes="20">20 min</button>
    </div>
    <div class="break-custom">
      <label for="break-custom-input" style="color: var(--text-secondary); font-size: .85rem;">Custom (minutes):</label>
      <input type="number" id="break-custom-input" class="break-custom-input" min="1" max="120" value="15">
    </div>
    <button class="break-start-btn" id="break-start-confirm">Start Break</button>
    <div style="margin-top: .75rem;">
      <button class="modal-cancel-btn" id="break-cancel-btn">Cancel</button>
    </div>
  `;

  modal.appendChild(panel);
  document.body.appendChild(modal);

  panel.querySelectorAll('.break-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('break-custom-input').value = btn.dataset.minutes;
    });
  });

  document.getElementById('break-start-confirm').addEventListener('click', () => {
    const minutes = parseInt(document.getElementById('break-custom-input').value, 10);
    if (minutes > 0) {
      comm.broadcast('break-start', { duration: minutes });
      uiState.breakActive = true;
      uiState.breakDuration = minutes * 60 * 1000;
      uiState.breakStartTime = Date.now();
      if (uiState.breakTimerId) {
        clearInterval(uiState.breakTimerId);
      }
      uiState.breakTimerId = setInterval(updateBreakButton, 200);
      updateBreakButton();
      modal.remove();
    }
  });

  document.getElementById('break-cancel-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

export function updateBreakButton() {
  if (!els.breakBtn) return;
  const textEl = els.breakBtn.querySelector('.btn-text');
  if (uiState.breakActive) {
    els.breakBtn.classList.add('active');
    
    const elapsed = Date.now() - uiState.breakStartTime;
    const remaining = Math.max(0, uiState.breakDuration - elapsed);
    
    if (remaining <= 0) {
      if (textEl) textEl.textContent = 'Fine';
      if (uiState.breakTimerId) {
        clearInterval(uiState.breakTimerId);
        uiState.breakTimerId = null;
      }
    } else {
      const totalSec = Math.ceil(remaining / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      const timeStr = `${min}:${String(sec).padStart(2, '0')}`;
      if (textEl) textEl.textContent = timeStr;
    }
  } else {
    els.breakBtn.classList.remove('active');
    if (textEl) textEl.textContent = '';
  }
}

/* ================================================================== */
/*  Webcam                                                             */
/* ================================================================== */

export function handleWebcamToggle() {
  showWebcamModal();
}

export async function showWebcamModal() {
  const existing = document.getElementById('webcam-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'webcam-modal';
  modal.className = 'modal-overlay';

  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  panel.style.maxWidth = '400px';
  panel.style.textAlign = 'center';

  const title = document.createElement('h3');
  title.textContent = 'Audio/Video Settings';
  panel.appendChild(title);

  // ---------- Webcam Section ----------
  const subtitle = document.createElement('p');
  subtitle.style.cssText = 'color: var(--text-secondary); font-size: .95rem; margin-top: 1rem; margin-bottom: .5rem; font-weight: bold;';
  subtitle.textContent = 'Webcam Bubble';
  panel.appendChild(subtitle);

  const webcamToggleLabel = document.createElement('label');
  webcamToggleLabel.style.cssText = 'display: block; margin-bottom: 1rem; cursor: pointer; text-align: left; font-size: .9rem;';
  const webcamToggle = document.createElement('input');
  webcamToggle.type = 'checkbox';
  webcamToggle.id = 'webcam-toggle';
  webcamToggle.checked = uiState.webcamActive;
  webcamToggle.style.marginRight = '.5rem';
  webcamToggleLabel.appendChild(webcamToggle);
  webcamToggleLabel.appendChild(document.createTextNode('Enable Webcam Bubble'));
  panel.appendChild(webcamToggleLabel);

  // Error message area
  const errorEl = document.createElement('p');
  errorEl.id = 'webcam-modal-error';
  errorEl.style.cssText = 'color: var(--red); font-size: .85rem; display: none; margin-bottom: .75rem;';
  panel.appendChild(errorEl);

  // Preview video (circular)
  const preview = document.createElement('video');
  preview.className = 'webcam-preview';
  preview.autoplay = true;
  preview.playsInline = true;
  preview.muted = true;
  panel.appendChild(preview);

  // Device select
  const select = document.createElement('select');
  select.className = 'webcam-device-select';
  select.id = 'webcam-device-select';
  panel.appendChild(select);

  // Position label
  const posLabel = document.createElement('p');
  posLabel.style.cssText = 'color: var(--text-secondary); font-size: .85rem; margin-bottom: .5rem;';
  posLabel.textContent = 'Bubble position:';
  panel.appendChild(posLabel);

  // Position grid
  const posGrid = document.createElement('div');
  posGrid.className = 'webcam-position-grid';
  const positions = [
    { id: 'top-left', label: 'Top Left' },
    { id: 'top-right', label: 'Top Right' },
    { id: 'bottom-left', label: 'Bottom Left' },
    { id: 'bottom-right', label: 'Bottom Right' },
  ];
  let selectedPosition = uiState.webcamPosition;

  positions.forEach(pos => {
    const btn = document.createElement('button');
    btn.className = 'webcam-position-btn';
    btn.dataset.position = pos.id;
    btn.textContent = pos.label;
    if (pos.id === selectedPosition) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      posGrid.querySelectorAll('.webcam-position-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedPosition = pos.id;
    });
    posGrid.appendChild(btn);
  });
  panel.appendChild(posGrid);

  // ---------- Captions Section ----------
  let toggleCheckbox = null;
  let langSelect = null;
  let fontSizeSelect = null;

  if (isSupported()) {
    const divider = document.createElement('hr');
    divider.style.cssText = 'border: 0; border-top: 1px solid var(--border); margin: 1.5rem 0;';
    panel.appendChild(divider);

    const capSubtitle = document.createElement('p');
    capSubtitle.style.cssText = 'color: var(--text-secondary); font-size: .95rem; margin-bottom: .5rem; font-weight: bold;';
    capSubtitle.textContent = 'Live Captions';
    panel.appendChild(capSubtitle);

    const toggleLabel = document.createElement('label');
    toggleLabel.style.cssText = 'display: block; margin-bottom: 1rem; cursor: pointer; text-align: left; font-size: .9rem;';
    
    toggleCheckbox = document.createElement('input');
    toggleCheckbox.type = 'checkbox';
    toggleCheckbox.id = 'captions-toggle';
    toggleCheckbox.style.marginRight = '.5rem';
    
    toggleLabel.appendChild(toggleCheckbox);
    toggleLabel.appendChild(document.createTextNode('Enable Auto-Captions'));
    panel.appendChild(toggleLabel);

    // Language
    const langWrapper = document.createElement('div');
    langWrapper.style.cssText = 'margin-bottom: 1rem; text-align: left;';
    const langLabel = document.createElement('label');
    langLabel.style.cssText = 'display: block; margin-bottom: .3rem; font-size: .85rem; color: var(--text-secondary);';
    langLabel.textContent = 'Language:';
    langWrapper.appendChild(langLabel);

    langSelect = document.createElement('select');
    langSelect.style.cssText = 'width: 100%; padding: .5rem; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text-primary);';
    const langs = [
      { v: 'en-US', l: 'English (US)' },
      { v: 'it-IT', l: 'Italian' },
      { v: 'fr-FR', l: 'French' },
      { v: 'es-ES', l: 'Spanish' },
      { v: 'de-DE', l: 'German' }
    ];
    langs.forEach(lg => {
      const opt = document.createElement('option');
      opt.value = lg.v;
      opt.textContent = lg.l;
      langSelect.appendChild(opt);
    });
    langWrapper.appendChild(langSelect);
    panel.appendChild(langWrapper);

    // Font Size
    const sizeWrapper = document.createElement('div');
    sizeWrapper.style.cssText = 'margin-bottom: 1.5rem; text-align: left;';
    const sizeLabel = document.createElement('label');
    sizeLabel.style.cssText = 'display: block; margin-bottom: .3rem; font-size: .85rem; color: var(--text-secondary);';
    sizeLabel.textContent = 'Font Size:';
    sizeWrapper.appendChild(sizeLabel);

    fontSizeSelect = document.createElement('select');
    fontSizeSelect.style.cssText = 'width: 100%; padding: .5rem; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text-primary);';
    const sizes = [
      { v: '3vh', l: 'Small' },
      { v: '5vh', l: 'Medium' },
      { v: '8vh', l: 'Large' },
      { v: '12vh', l: 'Extra Large' }
    ];
    sizes.forEach(sz => {
      const opt = document.createElement('option');
      opt.value = sz.v;
      opt.textContent = sz.l;
      fontSizeSelect.appendChild(opt);
    });
    sizeWrapper.appendChild(fontSizeSelect);
    panel.appendChild(sizeWrapper);
  }

  // Set initial Captions state if supported
  if (isSupported()) {
    toggleCheckbox.checked = captionsEnabled;
    langSelect.value = recognition ? recognition.lang : 'en-US';
    fontSizeSelect.value = currentFontSize;
  }

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; gap: .5rem; margin-top: .75rem;';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'modal-cancel-btn';
  confirmBtn.style.cssText = 'flex: 1; margin-top: 0; background: #3fb950; color: #fff; border-color: #3fb950; font-weight: 600;';
  confirmBtn.textContent = 'Apply & Close';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-cancel-btn';
  cancelBtn.style.cssText = 'flex: 1; margin-top: 0;';
  cancelBtn.textContent = 'Cancel';

  btnRow.appendChild(confirmBtn);
  btnRow.appendChild(cancelBtn);

  panel.appendChild(btnRow);
  modal.appendChild(panel);
  document.body.appendChild(modal);

  // Keep track of the preview stream so we can stop it on cancel
  let previewStream = null;

  // Populate devices
  async function populateDevices() {
    try {
      const devices = await webcamManager.enumerateVideoDevices();
      select.innerHTML = '';
      if (devices.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No cameras found';
        opt.disabled = true;
        select.appendChild(opt);
        return;
      }
      devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label;
        select.appendChild(opt);
      });
      // Pre-select the active device if any
      if (webcamManager.getActiveDeviceId()) {
        select.value = webcamManager.getActiveDeviceId();
      }
      // Start preview with the first/selected device
      await startPreview(select.value);
    } catch (err) {
      showError('Camera access denied. Please allow camera permissions.');
      console.error('[webcamModal] enumerate error:', err);
    }
  }

  async function startPreview(deviceId) {
    try {
      // Stop any existing preview stream
      if (previewStream) {
        previewStream.getTracks().forEach(t => t.stop());
      }
      previewStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 320 }, height: { ideal: 320 } },
        audio: false,
      });
      preview.srcObject = previewStream;
      hideError();
    } catch (err) {
      showError('Could not access the selected camera.');
      console.error('[webcamModal] preview error:', err);
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function hideError() {
    errorEl.style.display = 'none';
  }

  // Device change → restart preview
  select.addEventListener('change', () => startPreview(select.value));

  // Confirm
  confirmBtn.addEventListener('click', async () => {
    // 1. Apply Webcam Settings
    if (webcamToggle.checked) {
      const deviceId = select.value;
      if (deviceId) {
        try {
          await webcamManager.startStream(deviceId);
          uiState.webcamActive = true;
          uiState.webcamPosition = selectedPosition;
          comm.broadcast('webcam-start', { position: selectedPosition });
        } catch (err) {
          showError('Failed to start webcam: ' + err.message);
          console.error('[webcamModal] start error:', err);
          return; // Stop applying if webcam failed
        }
      }
    } else {
      if (uiState.webcamActive) {
        webcamManager.stopStream();
        uiState.webcamActive = false;
        comm.broadcast('webcam-stop', {});
      }
    }

    // 2. Apply Captions Settings
    if (isSupported()) {
      applyCaptionsSettings(toggleCheckbox.checked, langSelect.value, fontSizeSelect.value);
    }

    updateWebcamButton();

    // Cleanup and close
    if (previewStream && previewStream !== webcamManager.getStream()) {
      previewStream.getTracks().forEach(t => t.stop());
    }
    modal.remove();
  });

  // Cancel
  cancelBtn.addEventListener('click', () => {
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
    }
    modal.remove();
  });

  // Clean up on cancel
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      if (previewStream) {
        previewStream.getTracks().forEach(t => t.stop());
      }
      modal.remove();
    }
  });

  await populateDevices();
}

export function updateWebcamButton() {
  if (!els.webcamBtn) return;
  const isWebcam = uiState.webcamActive;
  const isCaptions = captionsEnabled;

  if (isWebcam || isCaptions) {
    els.webcamBtn.classList.add('active');
  } else {
    els.webcamBtn.classList.remove('active');
  }
}

