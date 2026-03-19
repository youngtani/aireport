import React, { useState } from 'react';
import { getHistoryOpen, setHistoryOpen } from '../storage';

export default function HistoryPanel({ history, onLoad, onCopy, onClear }) {
  const [open, setOpen] = useState(getHistoryOpen());

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setHistoryOpen(next);
  };

  return (
    <div className="details" style={{ borderRadius: 14, padding: 12 }}>
      <div className="details-summary" onClick={toggle} style={{ cursor: 'pointer' }}>
        <span className="card-title small" style={{ margin: 0 }}>
          최근 생성 기록
        </span>
        <span className="details-hint">{open ? '접기' : '클릭해서 열기'}</span>
      </div>
      {open && (
        <>
          <div className="row row-between" style={{ marginTop: 10 }}>
            <div className="hint" style={{ margin: 0 }}>
              최근 20개까지 저장됩니다(로컬 저장).
            </div>
            <button className="btn btn-ghost" type="button" onClick={onClear}>
              기록 삭제
            </button>
          </div>
          <div className="history">
            {history.length === 0 && <div className="hint">아직 생성 기록이 없습니다.</div>}
            {history.map((it, i) => (
              <div key={i} className="history-item">
                <div className="history-meta">
                  <div className="history-title">
                    {it.studentName} · {it.bookTitle || '(책 없음)'}
                  </div>
                  <div className="history-time">{it.time}</div>
                </div>
                <p className="history-text">{it.text}</p>
                <div className="history-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => onLoad(it)}
                  >
                    불러오기
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => onCopy(it.text)}
                  >
                    복사
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
