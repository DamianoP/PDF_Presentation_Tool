/**
 * webcamManager.js — Webcam Device Enumeration & Stream Management
 *
 * Encapsulates the MediaDevices API: enumerates cameras, starts/stops
 * the MediaStream, and handles WebRTC loopback to securely transfer 
 * the video stream to the audience window.
 */

import comm from './communication.js';

class WebcamManager {
  constructor() {
    /** @type {MediaStream|null} */
    this._stream = null;
    /** @type {string|null} */
    this._activeDeviceId = null;
    /** @type {RTCPeerConnection|null} */
    this._pc = null;

    // Listen for WebRTC signalling from Audience window
    comm.on('webrtc-answer', async (answerData) => {
      console.log('[webcamManager] Received answer');
      if (this._pc) {
        try {
          await this._pc.setRemoteDescription(new RTCSessionDescription(answerData));
          
          // Add any queued ICE candidates
          if (this._iceCandidateQueue) {
            for (const c of this._iceCandidateQueue) {
              await this._pc.addIceCandidate(c);
            }
            this._iceCandidateQueue = [];
          }
        } catch (err) {
          console.error('[webcamManager] setRemoteDescription error:', err);
        }
      }
    });

    this._iceCandidateQueue = [];

    comm.on('webrtc-ice-receiver', async (candidateData) => {
      if (this._pc) {
        try {
          const c = new RTCIceCandidate(candidateData);
          if (this._pc.remoteDescription) {
            await this._pc.addIceCandidate(c);
          } else {
            this._iceCandidateQueue.push(c);
          }
        } catch (err) {
          console.error('[webcamManager] addIceCandidate error:', err);
        }
      }
    });

    // Re-negotiate if presentation window opens while webcam is already active
    comm.on('presentation-ready', () => {
      if (this.isActive()) {
        this._startWebRTC();
      }
    });
  }

  /**
   * Enumerate available video input devices.
   * Requests temporary permission if labels are empty.
   * @returns {Promise<Array<{deviceId: string, label: string}>>}
   */
  async enumerateVideoDevices() {
    // Request a temporary stream to trigger permission prompt if needed
    let tempStream = null;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      // If labels are empty, we need to request permission first
      if (videoDevices.length > 0 && !videoDevices[0].label) {
        tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const updatedDevices = await navigator.mediaDevices.enumerateDevices();
        return updatedDevices
          .filter(d => d.kind === 'videoinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${i + 1}`,
          }));
      }

      return videoDevices.map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }));
    } finally {
      if (tempStream) {
        tempStream.getTracks().forEach(t => t.stop());
      }
    }
  }

  /**
   * Start a video stream from the specified device.
   * Stops any existing stream first.
   * @param {string} deviceId
   * @returns {Promise<MediaStream>}
   */
  async startStream(deviceId) {
    this.stopStream();

    const constraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 320 },
        height: { ideal: 320 },
        frameRate: { ideal: 24 },
      },
      audio: false,
    };

    this._stream = await navigator.mediaDevices.getUserMedia(constraints);
    this._activeDeviceId = deviceId;
    this._startWebRTC();
    return this._stream;
  }

  /**
   * Initialize WebRTC local loopback.
   */
  _startWebRTC() {
    console.log('[webcamManager] Starting WebRTC Sender');
    if (this._pc) {
      this._pc.close();
    }

    this._pc = new RTCPeerConnection({ iceServers: [] });
    
    this._pc.onicecandidate = (e) => {
      if (e.candidate) {
        comm.broadcast('webrtc-ice-sender', e.candidate.toJSON());
      }
    };

    this._pc.onconnectionstatechange = () => {
      console.log('[webcamManager] Connection state:', this._pc.connectionState);
    };

    if (this._stream) {
      this._stream.getTracks().forEach(track => {
        this._pc.addTrack(track, this._stream);
      });
    }

    this._pc.createOffer()
      .then(offer => this._pc.setLocalDescription(offer))
      .then(() => {
        const desc = this._pc.localDescription;
        comm.broadcast('webrtc-offer', { type: desc.type, sdp: desc.sdp });
        console.log('[webcamManager] Offer sent');
      })
      .catch(err => console.error('[webcamManager] createOffer error:', err));
  }

  /**
   * Stop the current stream and release all tracks.
   */
  stopStream() {
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    this._activeDeviceId = null;
    if (this._pc) {
      this._pc.close();
      this._pc = null;
    }
  }

  /**
   * @returns {MediaStream|null}
   */
  getStream() {
    return this._stream;
  }

  /**
   * @returns {string|null}
   */
  getActiveDeviceId() {
    return this._activeDeviceId;
  }

  /**
   * @returns {boolean}
   */
  isActive() {
    return this._stream !== null &&
           this._stream.active &&
           this._stream.getVideoTracks().length > 0;
  }
}

const webcamManager = new WebcamManager();
export default webcamManager;
