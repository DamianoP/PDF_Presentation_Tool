import AppState from '../state.js';
import { navigateTo } from './slides.js';
import { toggleBlackout, toggleLaser, toggleSpotlight, toggleDrawMode, toggleZoom, toggleProgressBar } from './tools.js';
import { togglePresentationFullscreen } from './screens.js';
import { uiState } from './uiState.js';

export function handleKeyDown(e) {
  // Ignore when focused on an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case ' ':
    case 'PageDown':
      e.preventDefault();
      navigateTo(AppState.currentPage + 1);
      break;

    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      e.preventDefault();
      navigateTo(AppState.currentPage - 1);
      break;

    case 'Home':
      e.preventDefault();
      navigateTo(1);
      break;

    case 'End':
      e.preventDefault();
      navigateTo(AppState.totalPages);
      break;

    case 'b':
    case 'B':
    case '.':
      e.preventDefault();
      toggleBlackout();
      break;

    case 'f':
    case 'F':
      e.preventDefault();
      togglePresentationFullscreen();
      break;

    case 'l':
    case 'L':
      e.preventDefault();
      toggleLaser();
      break;

    case 'd':
    case 'D':
      e.preventDefault();
      toggleDrawMode();
      break;

    case 's':
    case 'S':
      e.preventDefault();
      toggleSpotlight();
      break;

    case 'z':
    case 'Z':
      e.preventDefault();
      toggleZoom();
      break;

    case 'p':
    case 'P':
      e.preventDefault();
      toggleProgressBar();
      break;

    case 'Escape':
      if (uiState.drawActive) { e.preventDefault(); toggleDrawMode(); }
      else if (uiState.zoomActive) { e.preventDefault(); toggleZoom(); }
      else if (uiState.spotlightActive) { e.preventDefault(); toggleSpotlight(); }
      else if (uiState.laserActive) { e.preventDefault(); toggleLaser(); }
      break;
  }
}
