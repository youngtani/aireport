import { useState, useRef, useCallback, useEffect } from 'react';

function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function getExtFromMime(mime) {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'mp4';
  return 'webm';
}

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);

  const start = useCallback(async () => {
    try {
      setError('');
      setAudioBlob(null);
      setAudioUrl('');
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        const mimeType = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setRecording(false);
      };

      mr.start(1000);
      recorderRef.current = mr;
      startTimeRef.current = Date.now();
      setElapsed(0);
      setRecording(true);

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch {
      setError('마이크 접근이 거부되었습니다. 브라우저 설정을 확인해 주세요.');
    }
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const discard = useCallback(() => {
    setAudioBlob(null);
    setAudioUrl('');
    setElapsed(0);
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const formatTime = (s) => {
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${m}:${sec}`;
  };

  return {
    recording,
    audioBlob,
    audioUrl,
    elapsed,
    error,
    formattedTime: formatTime(elapsed),
    start,
    stop,
    discard,
    getExtFromMime,
  };
}
