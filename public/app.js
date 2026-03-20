const STORAGE_KEYS = {
  students: 'aireport.students.v2',
  history: 'aireport.history.v2',
  historyOpen: 'aireport.historyOpen.v2',
  studentComments: 'aireport.studentComments.v2', // per-student past comments
  studentMemos: 'aireport.studentMemos.v2',       // per-student memo
  globalMemo: 'aireport.globalMemo.v2',           // global memo
};

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function $(id) {
  return document.getElementById(id);
}
function nowKST() {
  return new Date().toLocaleString('ko-KR', { hour12: false });
}
function setStatus(text, kind = '') {
  const el = $('status');
  el.textContent = text || '';
  el.className = `status ${kind}`.trim();
}
function escapeHtml(s) {
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

// --- Students ---
function getStudents() {
  return loadJson(STORAGE_KEYS.students, []);
}
function setStudents(list) {
  const unique = [...new Set(list.map(s => s.trim()).filter(Boolean))];
  saveJson(STORAGE_KEYS.students, unique);
}

function renderStudentChips() {
  const root = $('studentChips');
  root.innerHTML = '';
  const students = getStudents();
  for (const name of students) {
    const chip = document.createElement('span');
    chip.className = 'student-chip';
    chip.innerHTML = `${escapeHtml(name)} <span class="remove" title="삭제">&times;</span>`;
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove')) {
        setStudents(getStudents().filter(s => s !== name));
        renderStudentChips();
        return;
      }
      $('studentName').value = name;
      loadStudentMemo(name);
      renderStudentPastComments(name);
    });
    root.appendChild(chip);
  }
}

// --- Student Comments (per-student history for AI reference) ---
function getStudentComments() {
  return loadJson(STORAGE_KEYS.studentComments, {});
}
function addStudentComment(studentName, comment) {
  const all = getStudentComments();
  if (!all[studentName]) all[studentName] = [];
  all[studentName].unshift(comment);
  // Keep last 10 per student
  all[studentName] = all[studentName].slice(0, 10);
  saveJson(STORAGE_KEYS.studentComments, all);
}
function getStudentPastComments(studentName) {
  const all = getStudentComments();
  return all[studentName] || [];
}

function renderStudentPastComments(studentName) {
  const root = $('studentPastComments');
  if (!root) return;
  const comments = getStudentPastComments(studentName);
  if (!comments.length) {
    root.innerHTML = '<div class="hint">이 학생의 과거 코멘트가 없습니다.</div>';
    return;
  }
  root.innerHTML = '';
  for (const c of comments.slice(0, 5)) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-meta">
        <div class="history-title">${escapeHtml(c.bookTitle || '')}</div>
        <div class="history-time">${escapeHtml(c.time || '')}</div>
      </div>
      <p class="history-text">${escapeHtml(c.text || '')}</p>
    `;
    root.appendChild(item);
  }
}

// --- Student Memos ---
function getStudentMemos() {
  return loadJson(STORAGE_KEYS.studentMemos, {});
}
function getStudentMemo(name) {
  return getStudentMemos()[name] || '';
}
function setStudentMemo(name, memo) {
  const all = getStudentMemos();
  all[name] = memo;
  saveJson(STORAGE_KEYS.studentMemos, all);
}
function loadStudentMemo(name) {
  $('studentMemo').value = getStudentMemo(name);
}

// --- Global Memo ---
function getGlobalMemo() {
  return localStorage.getItem(STORAGE_KEYS.globalMemo) || '';
}
function setGlobalMemo(memo) {
  localStorage.setItem(STORAGE_KEYS.globalMemo, memo);
}

// --- History ---
function getHistory() {
  return loadJson(STORAGE_KEYS.history, []);
}
function setHistory(items) {
  saveJson(STORAGE_KEYS.history, items);
}
function addHistory(item) {
  const items = getHistory();
  items.unshift(item);
  setHistory(items.slice(0, 20));
}
function renderHistory() {
  const root = $('history');
  const items = getHistory();
  root.innerHTML = '';
  if (!items.length) {
    root.innerHTML = '<div class="hint">아직 기록이 없습니다.</div>';
    return;
  }
  for (const it of items) {
    const card = document.createElement('div');
    card.className = 'history-item';
    card.innerHTML = `
      <div class="history-meta">
        <div class="history-title">${escapeHtml(it.studentName)} · ${escapeHtml(it.bookTitle)}</div>
        <div class="history-time">${escapeHtml(it.time)}</div>
      </div>
      <p class="history-text">${escapeHtml(it.text)}</p>
      <div class="history-actions">
        <button class="btn btn-secondary js-use" type="button">불러오기</button>
        <button class="btn btn-ghost js-copy" type="button">복사</button>
      </div>
    `;
    card.querySelector('.js-use').addEventListener('click', () => {
      $('studentName').value = it.studentName || '';
      $('bookTitle').value = it.bookTitle || '';
      $('pagesOrChapter').value = it.pagesOrChapter || '';
      $('transcription').value = it.transcription || '';
      $('tutorNotes').value = it.tutorNotes || '';
      $('output').value = it.text || '';
      $('btnCopy').disabled = !it.text;
      setStatus('기록을 불러왔습니다.', 'good');
    });
    card.querySelector('.js-copy').addEventListener('click', async () => {
      await navigator.clipboard.writeText(it.text || '');
      setStatus('복사했습니다.', 'good');
    });
    root.appendChild(card);
  }
}

// --- API calls ---
async function generateReport(payload) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  if (!data?.text) throw new Error('No text returned');
  return data.text;
}

async function editReport({ text, instruction }) {
  const res = await fetch('/api/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, instruction }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  if (!data?.text) throw new Error('No text returned');
  return data.text;
}

// --- Voice Recording ---
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

function setupRecording() {
  const btn = $('btnRecord');
  const status = $('recordStatus');

  btn.addEventListener('click', async () => {
    if (isRecording) {
      mediaRecorder.stop();
      btn.textContent = '녹음 시작';
      btn.classList.remove('recording');
      status.textContent = '처리 중...';
      isRecording = false;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        status.textContent = '텍스트 변환 중...';

        try {
          const formData = new FormData();
          formData.append('audio', blob, 'recording.webm');
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Transcription failed');
          const existing = $('transcription').value.trim();
          $('transcription').value = existing ? existing + '\n' + data.text : data.text;
          status.textContent = '변환 완료!';
        } catch (err) {
          status.textContent = '변환 실패: ' + (err.message || 'Unknown error');
        }
      };

      mediaRecorder.start();
      isRecording = true;
      btn.textContent = '녹음 중지';
      btn.classList.add('recording');
      status.textContent = '녹음 중...';
    } catch (err) {
      status.textContent = '마이크 접근 실패: ' + (err.message || '');
    }
  });
}

// --- Boot ---
document.addEventListener('DOMContentLoaded', () => {
  renderStudentChips();
  renderHistory();
  setupRecording();

  // Load global memo
  $('globalMemo').value = getGlobalMemo();

  const editChat = { messages: [], undoStack: [] };

  // History collapse
  const historyDetails = $('historyDetails');
  historyDetails.open = !!loadJson(STORAGE_KEYS.historyOpen, false);
  historyDetails.addEventListener('toggle', () => {
    saveJson(STORAGE_KEYS.historyOpen, !!historyDetails.open);
  });

  // Auto-save global memo
  $('globalMemo').addEventListener('input', () => {
    setGlobalMemo($('globalMemo').value);
  });

  // Auto-save student memo on input
  $('studentMemo').addEventListener('input', () => {
    const name = $('studentName').value.trim();
    if (name) setStudentMemo(name, $('studentMemo').value);
  });

  // Load student memo when name changes
  $('studentName').addEventListener('change', () => {
    const name = $('studentName').value.trim();
    if (name) {
      loadStudentMemo(name);
      renderStudentPastComments(name);
    }
  });
  $('studentName').addEventListener('blur', () => {
    const name = $('studentName').value.trim();
    if (name) {
      loadStudentMemo(name);
      renderStudentPastComments(name);
    }
  });

  // Save student
  $('btnSaveStudent').addEventListener('click', () => {
    const name = $('studentName').value.trim();
    if (!name) return;
    const list = getStudents();
    if (!list.includes(name)) {
      list.push(name);
      setStudents(list);
      renderStudentChips();
    }
  });

  // Generate
  $('btnGenerate').addEventListener('click', async () => {
    const studentName = $('studentName').value.trim();
    const bookTitle = $('bookTitle').value.trim();
    const pagesOrChapter = $('pagesOrChapter').value.trim();
    const transcription = $('transcription').value.trim();
    const tutorNotes = $('tutorNotes').value.trim();
    const studentMemo = $('studentMemo').value.trim();
    const globalMemo = $('globalMemo').value.trim();

    if (!studentName) { setStatus('학생 이름을 입력해 주세요.', 'bad'); return; }
    if (!bookTitle) { setStatus('책 제목을 입력해 주세요.', 'bad'); return; }

    // Get past comments for this student to send to AI
    const pastComments = getStudentPastComments(studentName).slice(0, 3).map(c => c.text).filter(Boolean);

    try {
      setStatus('생성 중...', '');
      $('btnGenerate').disabled = true;

      const text = await generateReport({
        studentName,
        bookTitle,
        pagesOrChapter,
        transcription,
        tutorNotes,
        studentMemo,
        globalMemo,
        pastComments,
      });

      $('output').value = text;
      $('btnCopy').disabled = false;
      updateEditChatVisibility();
      setStatus('완료!', 'good');

      // Save to general history
      const historyItem = { studentName, bookTitle, pagesOrChapter, transcription, tutorNotes, text, time: nowKST() };
      addHistory(historyItem);
      renderHistory();

      // Save to per-student comment history
      addStudentComment(studentName, { bookTitle, text, time: nowKST() });
      renderStudentPastComments(studentName);

    } catch (e) {
      setStatus(e?.message || '생성에 실패했습니다.', 'bad');
    } finally {
      $('btnGenerate').disabled = false;
    }
  });

  // Copy
  $('btnCopy').addEventListener('click', async () => {
    const text = $('output').value || '';
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    setStatus('복사했습니다.', 'good');
  });

  // Edit chat
  function renderEditChat() {
    const root = $('editChatMessages');
    if (!root) return;
    root.innerHTML = '';
    if (!editChat.messages.length) {
      root.innerHTML = '<div class="chat-msg meta">수정 요청을 입력하면 AI가 결과를 다듬어 줍니다.</div>';
      return;
    }
    editChat.messages.forEach(m => {
      const div = document.createElement('div');
      div.className = `chat-msg ${m.role}`;
      div.textContent = m.content;
      root.appendChild(div);
    });
    root.scrollTop = root.scrollHeight;
  }

  function updateEditChatVisibility() {
    const section = $('editChatSection');
    const output = $('output');
    if (section && output) section.hidden = !(output.value || '').trim();
  }

  renderEditChat();
  updateEditChatVisibility();
  $('output')?.addEventListener('input', updateEditChatVisibility);

  async function runEditChat() {
    const input = $('editChatInput');
    const output = $('output');
    const instruction = (input?.value || '').trim();
    const current = (output?.value || '').trim();
    if (!instruction || !current) return;

    $('btnEditSend').disabled = true;
    try {
      editChat.messages.push({ role: 'user', content: instruction });
      renderEditChat();
      editChat.undoStack.push(output.value);

      const edited = await editReport({ text: output.value, instruction });
      output.value = edited;
      $('btnCopy').disabled = !edited.trim();
      updateEditChatVisibility();
      editChat.messages.push({ role: 'assistant', content: '반영했습니다.' });
      renderEditChat();
      setStatus('AI 수정 완료', 'good');
      input.value = '';
    } catch (e) {
      editChat.undoStack.pop();
      setStatus(e?.message || 'AI 수정 실패', 'bad');
      editChat.messages.push({ role: 'assistant', content: `실패: ${e?.message || ''}` });
      renderEditChat();
    } finally {
      $('btnEditSend').disabled = false;
      $('btnEditUndo').disabled = editChat.undoStack.length === 0;
    }
  }

  $('btnEditSend')?.addEventListener('click', runEditChat);
  $('editChatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runEditChat(); }
  });
  $('btnEditUndo')?.addEventListener('click', () => {
    if (!editChat.undoStack.length) return;
    $('output').value = editChat.undoStack.pop();
    $('btnEditUndo').disabled = editChat.undoStack.length === 0;
    $('btnCopy').disabled = !($('output').value || '').trim();
    setStatus('되돌렸습니다.', 'warn');
  });
  $('btnEditClear')?.addEventListener('click', () => {
    editChat.messages = [];
    renderEditChat();
  });

  // Clear history
  $('btnClearHistory').addEventListener('click', () => {
    setHistory([]);
    renderHistory();
    setStatus('기록을 삭제했습니다.', 'warn');
  });

  // Reset
  $('btnReset').addEventListener('click', () => {
    $('studentName').value = '';
    $('bookTitle').value = '';
    $('pagesOrChapter').value = '';
    $('transcription').value = '';
    $('tutorNotes').value = '';
    $('studentMemo').value = '';
    $('output').value = '';
    $('btnCopy').disabled = true;
    $('studentPastComments').innerHTML = '';
    setStatus('');
    updateEditChatVisibility();
  });
});
