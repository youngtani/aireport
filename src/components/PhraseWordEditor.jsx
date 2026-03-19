import React, { useState } from 'react';

function Pill({ text, selected, onToggle, onRemove }) {
  return (
    <span className={`pill-wrap${selected ? ' selected' : ''}`}>
      <button type="button" className="pill-btn" onClick={onToggle}>
        {text}
      </button>
      <button
        type="button"
        className="pill-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        삭제
      </button>
    </span>
  );
}

export default function PhraseWordEditor({
  phrases,
  words,
  selectedPhrases,
  selectedWords,
  onTogglePhrase,
  onToggleWord,
  onRemovePhrase,
  onRemoveWord,
  onAddPhrase,
  onAddWord,
}) {
  const [newPhrase, setNewPhrase] = useState('');
  const [newWord, setNewWord] = useState('');

  const handleAddPhrase = () => {
    const v = newPhrase.trim();
    if (!v) return;
    onAddPhrase(v);
    setNewPhrase('');
  };

  const handleAddWord = () => {
    const raw = newWord.trim();
    if (!raw) return;
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    parts.forEach(onAddWord);
    setNewWord('');
  };

  const selectedPointsText = [...selectedPhrases, ...selectedWords].join('\n');

  return (
    <>
      <div className="row row-between">
        <div className="card-title">자주쓰는 문구/단어</div>
      </div>
      <div className="hint">학생별로 저장됩니다. 클릭=포함, 삭제=저장 목록에서 제거</div>

      <div className="field" style={{ marginTop: 10 }}>
        <label className="label">문구 추가</label>
        <div className="row">
          <textarea
            className="control textarea textarea-compact"
            placeholder="예: 오늘은 ~을 중심으로 수업했습니다."
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
          />
          <button className="btn btn-secondary" type="button" onClick={handleAddPhrase}>
            추가
          </button>
        </div>
      </div>

      <div className="pillbox-container">
        <div className="pillbox">
          {phrases.map((text) => (
            <Pill
              key={text}
              text={text}
              selected={selectedPhrases.includes(text)}
              onToggle={() => onTogglePhrase(text)}
              onRemove={() => onRemovePhrase(text)}
            />
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label className="label">단어 추가</label>
        <div className="row">
          <input
            className="control"
            type="text"
            placeholder="예: infer / persuade / summarize"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddWord()}
          />
          <button className="btn btn-secondary" type="button" onClick={handleAddWord}>
            추가
          </button>
        </div>
        <div className="hint">여러 개를 한 번에 추가하려면 쉼표(,)로 구분해서 입력해도 됩니다.</div>
      </div>

      <div className="pillbox-container">
        <div className="pillbox">
          {words.map((w) => (
            <Pill
              key={w}
              text={w}
              selected={selectedWords.includes(w)}
              onToggle={() => onToggleWord(w)}
              onRemove={() => onRemoveWord(w)}
            />
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label className="label">포함될 포인트(자동)</label>
        <textarea
          className="control textarea textarea-points"
          placeholder="문구/단어 chips를 클릭하면 여기에 자동으로 쌓입니다."
          readOnly
          value={selectedPointsText}
        />
      </div>
    </>
  );
}
