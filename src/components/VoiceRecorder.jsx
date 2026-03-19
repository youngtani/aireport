import React, { useState } from 'react';
import { useRecorder } from '../hooks/useRecorder';
import { apiTranscribe } from '../api';

export default function VoiceRecorder({ transcript, onTranscriptChange }) {
  const recorder = useRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [status, setStatus] = useState({ text: '', kind: '' });

  const handleTranscribe = async () => {
    if (!recorder.audioBlob) return;
    try {
      setTranscribing(true);
      setStatus({ text: 'Whisper로 변환 중... (시간이 걸릴 수 있습니다)', kind: '' });
      const ext = recorder.getExtFromMime(recorder.audioBlob.type);
      const text = await apiTranscribe(recorder.audioBlob, ext);
      const existing = (transcript || '').trim();
      onTranscriptChange(existing ? existing + '\n\n' + text : text);
      setStatus({ text: '변환 완료!', kind: 'good' });
    } catch (err) {
      setStatus({ text: err?.message || '변환에 실패했습니다.', kind: 'bad' });
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <>
      <div className="divider" />
      <div className="card-title small">수업 대화 녹음</div>
      <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
        수업 중 대화를 녹음하면 Whisper가 자동으로 텍스트로 변환합니다.
      </div>

      <div className="recorder">
        <div className="recorder-controls">
          <button
            className="btn btn-record"
            type="button"
            disabled={recorder.recording}
            onClick={recorder.start}
          >
            <span className="record-dot" /> 녹음 시작
          </button>
          <button
            className="btn btn-stop"
            type="button"
            disabled={!recorder.recording}
            onClick={recorder.stop}
          >
            녹음 중지
          </button>
          <span className="record-timer">{recorder.formattedTime}</span>
        </div>

        {recorder.recording && (
          <div className="recording-indicator">
            <span className="pulse-dot" /> 녹음 중...
          </div>
        )}

        {recorder.error && (
          <div className="status bad">{recorder.error}</div>
        )}

        {recorder.audioUrl && !recorder.recording && (
          <div className="audio-playback">
            <audio src={recorder.audioUrl} controls />
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="btn btn-primary"
                type="button"
                disabled={transcribing}
                onClick={handleTranscribe}
              >
                {transcribing ? '변환 중...' : '텍스트 변환 (Whisper)'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={recorder.discard}>
                녹음 삭제
              </button>
            </div>
          </div>
        )}

        {status.text && <div className={`status ${status.kind}`}>{status.text}</div>}
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label className="label">녹취록 (자동 변환 또는 직접 입력)</label>
        <textarea
          className="control textarea"
          placeholder="녹음 후 '텍스트 변환'을 누르면 여기에 자동으로 채워집니다. 직접 입력/수정도 가능합니다."
          value={transcript}
          onChange={(e) => onTranscriptChange(e.target.value)}
        />
      </div>
    </>
  );
}
