
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let fileHandle = null;
let writableStream = null;

export function initRecording() {
  const btn = document.getElementById('record-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });
}

async function startRecording() {
  try {
    const canUseFilePicker = !!window.showSaveFilePicker;
    if (canUseFilePicker) {
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: `Presentation_Record_${new Date().toISOString().replace(/:/g, '-')}.webm`,
          types: [{
            description: 'WebM Video',
            accept: { 'video/webm': ['.webm'] },
          }],
        });
        writableStream = await fileHandle.createWritable();
      } catch (err) {
        if (err.name === 'AbortError') return; 
        console.warn('File picker failed, falling back to RAM:', err);
        writableStream = null;
      }
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
       video: { cursor: "always" },
       audio: true 
    });

    let micStream = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn('Microphone not accessible for recording:', err);
    }

    const tracks = [ ...displayStream.getVideoTracks() ];
    if (displayStream.getAudioTracks().length > 0) tracks.push(...displayStream.getAudioTracks());
    if (micStream) tracks.push(...micStream.getAudioTracks());

    const combinedStream = new MediaStream(tracks);

    // Some browsers default to different codecs
    const options = MediaRecorder.isTypeSupported('video/webm; codecs=vp8,opus') 
                    ? { mimeType: 'video/webm; codecs=vp8,opus' } 
                    : undefined;

    mediaRecorder = new MediaRecorder(combinedStream, options);
    recordedChunks = [];

    mediaRecorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        if (writableStream) {
          await writableStream.write(e.data);
        } else {
          recordedChunks.push(e.data);
        }
      }
    };

    mediaRecorder.onstop = async () => {
      if (writableStream) {
        await writableStream.close();
        writableStream = null;
      } else if (recordedChunks.length > 0) {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `Presentation_Record_${new Date().toISOString().replace(/:/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }
      
      combinedStream.getTracks().forEach(t => t.stop());
      isRecording = false;
      updateRecordButton();
    };

    mediaRecorder.start(1000); // Provide chunks to write directly
    isRecording = true;
    updateRecordButton();

    displayStream.getVideoTracks()[0].onended = () => {
      stopRecording();
    };

  } catch (err) {
    if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
      alert('Error starting recording: ' + err.message);
      console.error(err);
    }
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

function updateRecordButton() {
  const btn = document.getElementById('record-btn');
  if (!btn) return;
  if (isRecording) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
}
