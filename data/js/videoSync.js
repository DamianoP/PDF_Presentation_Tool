/**
 * videoSync.js — Video Playback Synchronization
 *
 * Synchronizes playback state (play, pause, seek, ratechange)
 * from the presenter window's video element to the audience window.
 */

import comm from './communication.js';
import { els } from './presenter/elements.js';

let isSyncing = false;

export function initVideoSync() {
  const video = els.currentSlideVideo;
  if (!video) return;

  const syncEvent = (type) => {
    if (isSyncing) return;
    comm.broadcast('video-sync', {
      type,
      currentTime: video.currentTime,
      paused: video.paused,
      playbackRate: video.playbackRate
    });
  };

  video.addEventListener('play', () => syncEvent('play'));
  video.addEventListener('pause', () => syncEvent('pause'));
  video.addEventListener('seeked', () => syncEvent('seeked'));
  video.addEventListener('ratechange', () => syncEvent('ratechange'));
}
