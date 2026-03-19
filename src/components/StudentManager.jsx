import React, { useState, useRef, useEffect } from 'react';

export default function StudentManager({ open, onClose, students, onAdd, onDelete }) {
  const [name, setName] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const handleAdd = () => {
    const n = name.trim();
    if (!n) return;
    onAdd(n);
    setName('');
  };

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose}>
      <form method="dialog" className="dialog-inner">
        <div className="dialog-title">학생 목록 관리</div>
        <div className="field">
          <label className="label">학생 추가</label>
          <div className="row">
            <input
              className="control"
              type="text"
              placeholder="예: 현성이"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
            />
            <button className="btn btn-primary" type="button" onClick={handleAdd}>
              추가
            </button>
          </div>
        </div>
        <div className="list">
          {students.length === 0 && (
            <div className="hint">학생이 없습니다. 위에서 추가해 주세요.</div>
          )}
          {students.map((s) => (
            <div key={s} className="list-item">
              <div className="list-name">{s}</div>
              <div className="list-actions">
                <button className="btn btn-ghost" type="button" onClick={() => onDelete(s)}>
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </form>
    </dialog>
  );
}
