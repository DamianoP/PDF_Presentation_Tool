import comm from '../communication.js';
import { updateWebcamButton } from './modals.js';

export let recognition = null;
export let isEnabled = false;
export let currentFontSize = '3vh';

export function isSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function initCaptions() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';

  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';
    
    const startIndex = Math.max(0, event.results.length - 2);
    for (let i = startIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    
    const text = finalTranscript || interimTranscript;
    if (text.trim().length > 0) {
      comm.broadcast('captions-text', { text: text });
    }
  };

  recognition.onend = () => {
    if (isEnabled) {
      try { recognition.start(); } catch (e) {}
    }
  };
  
  recognition.onerror = (e) => {
    console.error('[captions] error:', e.error);
    if (e.error === 'not-allowed' && isEnabled) {
      isEnabled = false;
      stopRecognition();
      updateWebcamButton();
    }
  };
}

export function applyCaptionsSettings(enabled, lang, fontSize) {
  if (!recognition) return;

  const changedLang = (recognition.lang !== lang);
  recognition.lang = lang;
  currentFontSize = fontSize;
  
  // If toggled off
  if (!enabled && isEnabled) {
    isEnabled = false;
    stopRecognition();
    return;
  }

  // If toggled on
  if (enabled && !isEnabled) {
    isEnabled = true;
    startRecognition();
    return;
  }

  // If language or font changed while enabled
  if (enabled && isEnabled) {
     if (changedLang) {
       stopRecognition();
       setTimeout(startRecognition, 100);
     } else {
       comm.broadcast('captions-config', { enabled: true, fontSize: currentFontSize });
     }
  }
}

function startRecognition() {
  if (!recognition) return;
  try {
    recognition.start();
  } catch(e) {}
  comm.broadcast('captions-config', { enabled: true, fontSize: currentFontSize });
}

function stopRecognition() {
  if (!recognition) return;
  try {
    recognition.stop();
  } catch(e) {}
  comm.broadcast('captions-config', { enabled: false, fontSize: currentFontSize });
}
