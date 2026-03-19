import React, { useState, useRef, useEffect } from 'react';
import { apiEdit } from '../api';

export default function EditChat({ output, onOutputChange }) {
  const [messages, setMessages] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (!(output || '').trim()) return null;

  const send = async () => {
    const instruction = input.trim();
    if (!instruction || !output.trim()) return;

    setSending(true);
    setMessages((m) => [...m, { role: 'user', content: instruction }]);
    setUndoStack((s) => [...s, output]);
    setInput('');

    try {
      const edited = await apiEdit({ text: output, instruction });
      onOutputChange(edited);
      setMessages((m) => [...m, { role: 'assistant', content: '반영했어요. 결과 텍스트를 업데이트했습니다.' }]);
      setStatusMsg('');
    } catch (err) {
      setUndoStack((s) => s.slice(0, -1));
      setMessages((m) => [...m, { role: 'assistant', content: `실패: ${err?.message}` }]);
      setStatusMsg(err?.message || 'AI 수정에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  const undo = () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    onOutputChange(prev);
  };

  return (
    <>
      <div className="divider" />
      <div className="card-title small">AI로 결과 수정(채팅)</div>
      <div className="chat">
        <div className="chat-messages" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="chat-msg meta">
              원하는 수정 요청을 입력하면, AI가 아래 결과 텍스트를 바로 다듬어 줍니다.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.content}
            </div>
          ))}
        </div>
        <div className="chat-actions">
          <textarea
            className="control textarea textarea-chat"
            placeholder="예: 마지막 문장을 더 따뜻하게 바꿔줘"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="row chat-buttons">
            <button className="btn btn-primary" type="button" disabled={sending} onClick={send}>
              {sending ? '수정 중...' : 'AI 수정'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!undoStack.length}
              onClick={undo}
            >
              되돌리기
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setMessages([])}
            >
              대화 지우기
            </button>
          </div>
        </div>
      </div>
      {statusMsg && <div className="status bad">{statusMsg}</div>}
    </>
  );
}
