/* ========================================================
   수업 리포트 — Client App (with Auth + Firestore)
   ======================================================== */

const LOCAL = {
  token: 'rpt.token',
  tutor: 'rpt.tutor',
  globalMemo: 'rpt.globalMemo.v3', // per-tutor, local only
};

/* ── Helpers ── */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const now = () => new Date().toLocaleString('ko-KR', { hour12: false });

let authToken = localStorage.getItem(LOCAL.token) || '';
let tutorName = localStorage.getItem(LOCAL.tutor) || '';

function headers(extra = {}) {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': authToken, ...extra };
}

async function api(method, path, body) {
  const opts = { method, headers: headers() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

function setStatus(text, kind = '') {
  const el = $('status');
  if (!el) return;
  el.textContent = text || '';
  el.className = `status ${kind}`.trim();
}

/* ════════════════════════════════════
   AUTH
   ════════════════════════════════════ */
function showLogin() {
  $('loginScreen').hidden = false;
  $('mainApp').hidden = true;
}
function showApp() {
  $('loginScreen').hidden = true;
  $('mainApp').hidden = false;
  $('tutorBadge').textContent = tutorName;
  boot();
}
function logout() {
  authToken = '';
  tutorName = '';
  localStorage.removeItem(LOCAL.token);
  localStorage.removeItem(LOCAL.tutor);
  showLogin();
}

async function tryLogin(name, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Login failed');
  authToken = data.token;
  tutorName = data.tutor;
  localStorage.setItem(LOCAL.token, authToken);
  localStorage.setItem(LOCAL.tutor, tutorName);
}

async function checkAuth() {
  if (!authToken) return false;
  try {
    const data = await api('GET', '/api/me');
    tutorName = data.tutor;
    return true;
  } catch { return false; }
}

/* ════════════════════════════════════
   SHARED DATA (via API → Firestore)
   ════════════════════════════════════ */

// Students
let studentsCache = [];
async function loadStudents() {
  try {
    const { students } = await api('GET', '/api/students');
    studentsCache = students || [];
  } catch { studentsCache = []; }
  renderChips();
}
async function addStudent(name) {
  await api('POST', '/api/students', { name });
  await loadStudents();
}
async function deleteStudent(id) {
  await api('DELETE', `/api/students/${id}`);
  await loadStudents();
}

function renderChips() {
  const root = $('studentChips');
  if (!root) return;
  root.innerHTML = '';
  const current = $('studentName').value.trim();
  for (const s of studentsCache) {
    const el = document.createElement('span');
    el.className = `chip${s.name === current ? ' active' : ''}`;
    el.innerHTML = `${esc(s.name)}<span class="chip-x" data-id="${s.id}" title="삭제">&times;</span>`;
    el.addEventListener('click', async e => {
      if (e.target.classList.contains('chip-x')) {
        await deleteStudent(e.target.dataset.id);
        return;
      }
      $('studentName').value = s.name;
      await loadStudentContext(s.name);
      renderChips();
    });
    root.appendChild(el);
  }
}

// Student memo (shared)
let memoSaveTimer = null;
async function loadStudentMemo(name) {
  try {
    const { memo } = await api('GET', `/api/student-memo/${encodeURIComponent(name)}`);
    $('studentMemo').value = memo || '';
  } catch { $('studentMemo').value = ''; }
}
async function saveStudentMemo(name, memo) {
  try { await api('POST', `/api/student-memo/${encodeURIComponent(name)}`, { memo }); } catch {}
}

// Past comments (shared finalized)
async function loadPastComments(name) {
  const root = $('studentPastComments');
  if (!root) return;
  try {
    const { comments } = await api('GET', `/api/comments?student=${encodeURIComponent(name)}`);
    if (!comments.length) {
      root.innerHTML = '<p class="empty-state">이 학생의 저장된 코멘트가 없습니다.</p>';
      return;
    }
    root.innerHTML = '';
    for (const c of comments.slice(0, 8)) {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <div class="history-meta">
          <span class="history-title">${esc(c.bookTitle || '')} <span style="font-weight:400;color:var(--text-tertiary);font-size:11px">by ${esc(c.tutorName || '')}</span></span>
          <span class="history-time">${esc(c.createdAt ? new Date(c.createdAt).toLocaleString('ko-KR', { hour12: false }) : '')}</span>
        </div>
        <p class="history-text">${esc(c.text || '')}</p>`;
      root.appendChild(el);
    }
    return comments.slice(0, 3).map(c => c.text).filter(Boolean);
  } catch {
    root.innerHTML = '<p class="empty-state">불러오기 실패</p>';
    return [];
  }
}

// All history (shared)
async function loadHistory() {
  const root = $('history');
  if (!root) return;
  try {
    const { comments } = await api('GET', '/api/comments');
    if (!comments.length) {
      root.innerHTML = '<p class="empty-state">저장된 코멘트가 없습니다.</p>';
      return;
    }
    root.innerHTML = '';
    for (const c of comments) {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <div class="history-meta">
          <span class="history-title">${esc(c.studentName || '')} · ${esc(c.bookTitle || '')} <span style="font-weight:400;color:var(--text-tertiary);font-size:11px">by ${esc(c.tutorName || '')}</span></span>
          <span class="history-time">${esc(c.createdAt ? new Date(c.createdAt).toLocaleString('ko-KR', { hour12: false }) : '')}</span>
        </div>
        <p class="history-text">${esc(c.text || '')}</p>
        <div class="history-actions">
          <button class="btn-sm btn-sm-ghost js-copy" type="button">복사</button>
        </div>`;
      el.querySelector('.js-copy').addEventListener('click', async () => {
        await navigator.clipboard.writeText(c.text || '');
        setStatus('복사 완료!', 'good');
      });
      root.appendChild(el);
    }
  } catch {
    root.innerHTML = '<p class="empty-state">불러오기 실패</p>';
  }
}

async function loadStudentContext(name) {
  await Promise.all([loadStudentMemo(name), loadPastComments(name)]);
}

/* ════════════════════════════════════
   RECORDING
   ════════════════════════════════════ */
let recorder = null, chunks = [], recording = false, timerInterval = null, recordStart = 0;
function fmtTime(ms) { const s = Math.floor(ms/1000); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

function setupRecording() {
  const btn = $('btnRecord'), timer = $('recordTimer'), status = $('recordStatus');
  btn.addEventListener('click', async () => {
    if (recording) {
      recorder.stop(); btn.classList.remove('recording');
      btn.querySelector('.record-label').textContent = '녹음';
      clearInterval(timerInterval); status.textContent = '처리 중...'; recording = false; return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream); chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        status.textContent = '변환 중...';
        try {
          const fd = new FormData(); fd.append('audio', blob, 'recording.webm');
          const res = await fetch('/api/transcribe', { method: 'POST', body: fd, headers: { 'X-Auth-Token': authToken } });
          const data = await res.json().catch(()=>({}));
          if (!res.ok) throw new Error(data?.error || 'Failed');
          const prev = $('transcription').value.trim();
          $('transcription').value = prev ? prev + '\n' + data.text : data.text;
          status.textContent = '완료!';
          setTimeout(() => { status.textContent = ''; }, 3000);
        } catch (err) { status.textContent = '실패: ' + (err.message || ''); }
      };
      recorder.start(); recording = true; recordStart = Date.now();
      btn.classList.add('recording'); btn.querySelector('.record-label').textContent = '중지';
      status.textContent = ''; timer.textContent = '00:00';
      timerInterval = setInterval(() => { timer.textContent = fmtTime(Date.now() - recordStart); }, 500);
    } catch { status.textContent = '마이크 오류'; }
  });
}

/* ════════════════════════════════════
   MAIN APP BOOT
   ════════════════════════════════════ */
let booted = false;
async function boot() {
  if (booted) return;
  booted = true;

  setupRecording();
  $('globalMemo').value = localStorage.getItem(LOCAL.globalMemo) || '';
  await loadStudents();
  await loadHistory();

  const chat = { msgs: [], undo: [] };

  // Auto-save local global memo
  $('globalMemo').addEventListener('input', () => {
    localStorage.setItem(LOCAL.globalMemo, $('globalMemo').value);
  });

  // Auto-save shared student memo (debounced)
  $('studentMemo').addEventListener('input', () => {
    const n = $('studentName').value.trim();
    if (!n) return;
    clearTimeout(memoSaveTimer);
    memoSaveTimer = setTimeout(() => saveStudentMemo(n, $('studentMemo').value), 800);
  });

  // Load student context on name change
  const onNameChange = async () => {
    const n = $('studentName').value.trim();
    if (n) { await loadStudentContext(n); renderChips(); }
  };
  $('studentName').addEventListener('change', onNameChange);
  $('studentName').addEventListener('blur', onNameChange);

  // Save student
  $('btnSaveStudent').addEventListener('click', async () => {
    const n = $('studentName').value.trim();
    if (!n) return;
    await addStudent(n);
  });

  // ── Generate ──
  $('btnGenerate').addEventListener('click', async () => {
    const studentName = $('studentName').value.trim();
    const bookTitle = $('bookTitle').value.trim();
    if (!studentName) { setStatus('학생 이름을 입력하세요.', 'bad'); return; }
    if (!bookTitle) { setStatus('책 제목을 입력하세요.', 'bad'); return; }

    // Gather past comments for context
    let pastComments = [];
    try {
      const { comments } = await api('GET', `/api/comments?student=${encodeURIComponent(studentName)}`);
      pastComments = (comments || []).slice(0, 3).map(c => c.text).filter(Boolean);
    } catch {}

    const btn = $('btnGenerate');
    btn.disabled = true;
    setStatus('생성 중...', '');

    try {
      const data = await api('POST', '/api/generate', {
        studentName, bookTitle,
        pagesOrChapter: $('pagesOrChapter').value.trim(),
        transcription: $('transcription').value.trim(),
        tutorNotes: $('tutorNotes').value.trim(),
        studentMemo: $('studentMemo').value.trim(),
        globalMemo: $('globalMemo').value.trim(),
        pastComments,
      });
      $('output').value = data.text;
      $('btnCopy').disabled = false;
      $('btnFinalSave').disabled = false;
      $('btnFinalSave').classList.remove('saved');
      $('btnFinalSave').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> 최종저장`;
      toggleEditSection();
      setStatus('완료! 수정 후 "최종저장"을 눌러주세요.', 'good');
    } catch (e) {
      setStatus(e?.message || '생성 실패', 'bad');
    } finally { btn.disabled = false; }
  });

  // ── 최종저장 ──
  $('btnFinalSave').addEventListener('click', async () => {
    const studentName = $('studentName').value.trim();
    const bookTitle = $('bookTitle').value.trim();
    const text = ($('output').value || '').trim();
    if (!text) return;

    $('btnFinalSave').disabled = true;
    try {
      await api('POST', '/api/comments', { studentName, bookTitle, text, tutorName });
      $('btnFinalSave').classList.add('saved');
      $('btnFinalSave').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 저장됨`;
      setStatus('최종 저장 완료!', 'good');
      // Refresh shared data
      await Promise.all([loadPastComments(studentName), loadHistory()]);
    } catch (e) {
      setStatus(e?.message || '저장 실패', 'bad');
      $('btnFinalSave').disabled = false;
    }
  });

  // Copy
  $('btnCopy').addEventListener('click', async () => {
    const t = $('output').value || '';
    if (!t.trim()) return;
    await navigator.clipboard.writeText(t);
    const btn = $('btnCopy');
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 완료`;
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
    setStatus('복사 완료!', 'good');
  });

  // ── Edit chat ──
  function toggleEditSection() {
    $('editChatSection').hidden = !($('output').value || '').trim();
  }
  function renderEditChat() {
    const root = $('editChatMessages');
    if (!root) return;
    root.innerHTML = '';
    if (!chat.msgs.length) {
      root.innerHTML = '<div class="edit-msg meta">수정 요청을 입력하면 AI가 다듬어 줍니다.</div>';
      return;
    }
    chat.msgs.forEach(m => {
      const d = document.createElement('div');
      d.className = `edit-msg ${m.role}`;
      d.textContent = m.content;
      root.appendChild(d);
    });
    root.scrollTop = root.scrollHeight;
  }
  renderEditChat();
  toggleEditSection();
  $('output')?.addEventListener('input', toggleEditSection);

  async function runEdit() {
    const inp = $('editChatInput'), out = $('output');
    const instruction = (inp?.value || '').trim();
    if (!instruction || !(out?.value || '').trim()) return;
    $('btnEditSend').disabled = true;
    try {
      chat.msgs.push({ role: 'user', content: instruction });
      renderEditChat();
      chat.undo.push(out.value);
      const data = await api('POST', '/api/edit', { text: out.value, instruction });
      out.value = data.text;
      $('btnCopy').disabled = !data.text.trim();
      $('btnFinalSave').disabled = !data.text.trim();
      $('btnFinalSave').classList.remove('saved');
      toggleEditSection();
      chat.msgs.push({ role: 'assistant', content: '반영 완료' });
      renderEditChat();
      setStatus('수정 완료', 'good');
      inp.value = '';
    } catch (e) {
      chat.undo.pop();
      chat.msgs.push({ role: 'assistant', content: `실패: ${e?.message || ''}` });
      renderEditChat();
      setStatus(e?.message || '수정 실패', 'bad');
    } finally {
      $('btnEditSend').disabled = false;
      $('btnEditUndo').disabled = chat.undo.length === 0;
    }
  }
  $('btnEditSend')?.addEventListener('click', runEdit);
  $('editChatInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runEdit(); }
  });
  $('btnEditUndo')?.addEventListener('click', () => {
    if (!chat.undo.length) return;
    $('output').value = chat.undo.pop();
    $('btnEditUndo').disabled = chat.undo.length === 0;
    $('btnCopy').disabled = !($('output').value || '').trim();
    setStatus('되돌림', 'warn');
  });
  $('btnEditClear')?.addEventListener('click', () => { chat.msgs = []; renderEditChat(); });

  // Reset
  $('btnReset').addEventListener('click', () => {
    ['studentName','bookTitle','pagesOrChapter','transcription','tutorNotes','studentMemo','output'].forEach(id => $(id).value = '');
    $('btnCopy').disabled = true;
    $('btnFinalSave').disabled = true;
    $('btnFinalSave').classList.remove('saved');
    $('studentPastComments').innerHTML = '<p class="empty-state">학생을 선택하면 저장된 코멘트가 표시됩니다.</p>';
    setStatus('');
    toggleEditSection();
    renderChips();
  });

  // Logout
  $('btnLogout').addEventListener('click', () => { booted = false; logout(); });
}

/* ════════════════════════════════════
   INIT
   ════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Tab switching
  document.querySelectorAll('.login-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      $('loginForm').hidden = !isLogin;
      $('registerForm').hidden = isLogin;
      // Clear messages
      $('loginError').textContent = '';
      $('regError').textContent = '';
      $('regSuccess').textContent = '';
    });
  });

  // Login form
  const doLogin = async () => {
    const name = $('loginName').value.trim();
    const pass = $('loginPass').value.trim();
    $('loginError').textContent = '';
    if (!name || !pass) { $('loginError').textContent = '이름과 비밀번호를 입력하세요.'; return; }
    try {
      await tryLogin(name, pass);
      showApp();
    } catch (e) {
      $('loginError').textContent = e?.message || '로그인 실패';
    }
  };
  $('btnLogin').addEventListener('click', doLogin);
  $('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('loginName').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginPass').focus(); });

  // Register form
  const doRegister = async () => {
    const name = $('regName').value.trim();
    const pass = $('regPass').value.trim();
    const passConfirm = $('regPassConfirm').value.trim();
    $('regError').textContent = '';
    $('regSuccess').textContent = '';
    if (!name || !pass) { $('regError').textContent = '이름과 비밀번호를 입력하세요.'; return; }
    if (pass !== passConfirm) { $('regError').textContent = '비밀번호가 일치하지 않습니다.'; return; }
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password: pass }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '가입 실패');
      $('regSuccess').textContent = data.message || '가입 완료! 관리자 승인 후 로그인할 수 있습니다.';
      $('regName').value = '';
      $('regPass').value = '';
      $('regPassConfirm').value = '';
    } catch (e) {
      $('regError').textContent = e?.message || '가입 실패';
    }
  };
  $('btnRegister').addEventListener('click', doRegister);
  $('regPassConfirm').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
  $('regName').addEventListener('keydown', e => { if (e.key === 'Enter') $('regPass').focus(); });
  $('regPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('regPassConfirm').focus(); });

  // Auto-login if token exists
  if (authToken && await checkAuth()) {
    showApp();
  } else {
    showLogin();
  }
});
