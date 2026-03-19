const STORAGE_KEYS = {
  students: 'aireport.students.v1',
  phrases: 'aireport.phrases.v1', // legacy (global)
  profiles: 'aireport.studentProfiles.v1',
  history: 'aireport.history.v1',
  historyOpen: 'aireport.historyOpen.v1',
};

const DEFAULT_STUDENTS = ['현성이', '민준', '서연'];

const DEFAULT_PHRASES = [
  '오늘은 책 내용을 소리 내어 읽으며 발음과 억양을 함께 체크했습니다.',
  '읽고 나서 핵심 줄거리와 인물 관계를 정리했습니다.',
  '조금 어려웠던 단어/표현을 뽑아서 뜻과 예문으로 복습했습니다.',
  '문장 구조(주어/동사/목적어)로 문법 포인트를 간단히 정리했습니다.',
  '지문 속 중요한 문장을 해석하고 왜 그렇게 해석되는지 설명했습니다.',
  '질문을 통해 내용 이해를 확인하고, 학생 의견을 말하도록 유도했습니다.',
  '학생이 특히 흥미로워한 장면/인물에 대해 대화를 나눴습니다.',
  '집중이 흐트러질 때는 짧게 쉬고 다시 읽기 루틴을 잡았습니다.',
  '다음 시간에는 이어서 다음 범위를 읽고, 오늘 단어를 다시 확인할 예정입니다.',
  '수업 태도가 좋았고 끝까지 성실하게 참여했습니다.',
];

const DEFAULT_WORDS = [
  'vocabulary',
  'pronunciation',
  'summary',
  'inference',
  'comprehension',
  'grammar',
  'discussion',
];

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
  const dt = new Date();
  return dt.toLocaleString('ko-KR', { hour12: false });
}

function setStatus(text, kind = '') {
  const el = $('status');
  el.textContent = text || '';
  el.className = `status ${kind}`.trim();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function uniqTrimmed(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const t = typeof s === 'string' ? s.trim() : '';
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function uniqTrimmedWords(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const t = typeof s === 'string' ? s.trim() : '';
    if (!t) continue;
    const norm = t.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(t);
  }
  return out;
}

function getDefaultTone() {
  return $('tone')?.value || '따뜻하고 긍정적';
}

function getDefaultLength() {
  return $('length')?.value || '짧게(4~6문장)';
}

// --- Students ---
function getStudents() {
  const students = loadJson(STORAGE_KEYS.students, null);
  if (Array.isArray(students) && students.length) return uniqTrimmed(students);
  return DEFAULT_STUDENTS.slice();
}

function setStudents(students) {
  saveJson(STORAGE_KEYS.students, uniqTrimmed(students));
}

function renderStudentSelect(selected = '') {
  const select = $('studentSelect');
  const students = getStudents();
  select.innerHTML = '';
  for (const name of students) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  if (selected && students.includes(selected)) select.value = selected;
}

function buildStudentSelectHtml(selected = '') {
  const students = getStudents();
  const options = students
    .map((n) => `<option value="${escapeHtml(n)}"${n === selected ? ' selected' : ''}>${escapeHtml(n)}</option>`)
    .join('');
  return `<select class="control js-batch-student">${options}</select>`;
}

function renderStudentManager() {
  const list = $('studentList');
  const students = getStudents();
  list.innerHTML = '';

  if (!students.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = '학생이 없습니다. 위에서 추가해 주세요.';
    list.appendChild(empty);
    return;
  }

  for (const name of students) {
    const row = document.createElement('div');
    row.className = 'list-item';

    const label = document.createElement('div');
    label.className = 'list-name';
    label.textContent = name;

    const actions = document.createElement('div');
    actions.className = 'list-actions';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-ghost';
    del.textContent = '삭제';
    del.addEventListener('click', () => {
      const next = getStudents().filter((s) => s !== name);
      setStudents(next);
      deleteProfile(name);
      renderStudentSelect($('studentSelect').value === name ? next[0] || '' : $('studentSelect').value);
      renderStudentManager();
    });

    actions.appendChild(del);
    row.appendChild(label);
    row.appendChild(actions);
    list.appendChild(row);
  }
}

// --- Student Profiles (phrases/words + selected) ---
function loadProfilesRaw() {
  const raw = loadJson(STORAGE_KEYS.profiles, null);
  if (raw && typeof raw === 'object') return raw;
  return {};
}

function migrateProfilesIfNeeded() {
  const existing = loadJson(STORAGE_KEYS.profiles, null);
  if (existing && typeof existing === 'object') return;

  // Migrate legacy global phrases into per-student profiles once.
  const legacyPhrases = loadJson(STORAGE_KEYS.phrases, null);
  const phrases = Array.isArray(legacyPhrases) && legacyPhrases.length ? uniqTrimmed(legacyPhrases) : DEFAULT_PHRASES.slice();
  const students = getStudents();

  const profiles = {};
  for (const name of students) {
    profiles[name] = {
      phrases: phrases.slice(),
      words: DEFAULT_WORDS.slice(),
      selectedPhrases: [],
      selectedWords: [],
    };
  }
  saveJson(STORAGE_KEYS.profiles, profiles);
}

function saveProfilesRaw(raw) {
  saveJson(STORAGE_KEYS.profiles, raw);
}

function ensureProfile(studentName) {
  if (!studentName) return null;
  migrateProfilesIfNeeded();
  const raw = loadProfilesRaw();
  if (!raw[studentName]) {
    raw[studentName] = {
      phrases: DEFAULT_PHRASES.slice(),
      words: DEFAULT_WORDS.slice(),
      selectedPhrases: [],
      selectedWords: [],
      form: {
        bookTitle: '',
        pagesOrChapter: '',
        tutorNotes: '',
        tone: '',
        length: '',
      },
    };
    saveProfilesRaw(raw);
  }
  const p = raw[studentName] || {};
  p.phrases = uniqTrimmed(Array.isArray(p.phrases) ? p.phrases : DEFAULT_PHRASES.slice());
  p.words = uniqTrimmedWords(Array.isArray(p.words) ? p.words : DEFAULT_WORDS.slice());
  p.selectedPhrases = uniqTrimmed(Array.isArray(p.selectedPhrases) ? p.selectedPhrases : []);
  p.selectedWords = uniqTrimmedWords(Array.isArray(p.selectedWords) ? p.selectedWords : []);
  p.form = p.form && typeof p.form === 'object' ? p.form : {};
  p.form.bookTitle = typeof p.form.bookTitle === 'string' ? p.form.bookTitle : '';
  p.form.pagesOrChapter = typeof p.form.pagesOrChapter === 'string' ? p.form.pagesOrChapter : '';
  p.form.tutorNotes = typeof p.form.tutorNotes === 'string' ? p.form.tutorNotes : '';
  p.form.tone = typeof p.form.tone === 'string' ? p.form.tone : '';
  p.form.length = typeof p.form.length === 'string' ? p.form.length : '';
  raw[studentName] = p;
  saveProfilesRaw(raw);
  return p;
}

function saveProfile(studentName, patch) {
  if (!studentName) return;
  migrateProfilesIfNeeded();
  const raw = loadProfilesRaw();
  const current = ensureProfile(studentName) || {};
  const next = { ...current, ...patch };
  next.phrases = uniqTrimmed(Array.isArray(next.phrases) ? next.phrases : []);
  next.words = uniqTrimmedWords(Array.isArray(next.words) ? next.words : []);
  next.selectedPhrases = uniqTrimmed(Array.isArray(next.selectedPhrases) ? next.selectedPhrases : []);
  next.selectedWords = uniqTrimmedWords(Array.isArray(next.selectedWords) ? next.selectedWords : []);
  raw[studentName] = next;
  saveProfilesRaw(raw);
}

function deleteProfile(studentName) {
  if (!studentName) return;
  const raw = loadProfilesRaw();
  if (raw && raw[studentName]) {
    delete raw[studentName];
    saveProfilesRaw(raw);
  }
}

function setSelectedPointsTextarea(selectedPhrasesSet, selectedWordsSet) {
  const lines = [];
  for (const p of selectedPhrasesSet) lines.push(p);
  for (const w of selectedWordsSet) lines.push(w);
  $('selectedPoints').value = lines.join('\n');
}

function createPillWrap({ text, selected, onToggle, onRemove }) {
  const wrap = document.createElement('span');
  wrap.className = 'pill-wrap' + (selected ? ' selected' : '');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pill-btn';
  btn.textContent = text;
  btn.addEventListener('click', () => onToggle?.());

  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'pill-remove';
  rm.textContent = '삭제';
  rm.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove?.();
  });

  wrap.appendChild(btn);
  wrap.appendChild(rm);
  return wrap;
}

function renderPhraseAndWordBoxes(activeStudentName, selectedPhrasesSet, selectedWordsSet) {
  const p = ensureProfile(activeStudentName);
  const phraseBox = $('phraseBox');
  const wordBox = $('wordBox');
  phraseBox.innerHTML = '';
  wordBox.innerHTML = '';

  for (const text of p.phrases) {
    const el = createPillWrap({
      text,
      selected: selectedPhrasesSet.has(text),
      onToggle: () => {
        if (selectedPhrasesSet.has(text)) selectedPhrasesSet.delete(text);
        else selectedPhrasesSet.add(text);
        saveProfile(activeStudentName, { selectedPhrases: Array.from(selectedPhrasesSet) });
        renderPhraseAndWordBoxes(activeStudentName, selectedPhrasesSet, selectedWordsSet);
        setSelectedPointsTextarea(selectedPhrasesSet, selectedWordsSet);
      },
      onRemove: () => {
        const next = p.phrases.filter((x) => x !== text);
        selectedPhrasesSet.delete(text);
        saveProfile(activeStudentName, { phrases: next, selectedPhrases: Array.from(selectedPhrasesSet) });
        renderPhraseAndWordBoxes(activeStudentName, selectedPhrasesSet, selectedWordsSet);
        setSelectedPointsTextarea(selectedPhrasesSet, selectedWordsSet);
      },
    });
    phraseBox.appendChild(el);
  }

  for (const w of p.words) {
    const el = createPillWrap({
      text: w,
      selected: selectedWordsSet.has(w),
      onToggle: () => {
        if (selectedWordsSet.has(w)) selectedWordsSet.delete(w);
        else selectedWordsSet.add(w);
        saveProfile(activeStudentName, { selectedWords: Array.from(selectedWordsSet) });
        renderPhraseAndWordBoxes(activeStudentName, selectedPhrasesSet, selectedWordsSet);
        setSelectedPointsTextarea(selectedPhrasesSet, selectedWordsSet);
      },
      onRemove: () => {
        const next = p.words.filter((x) => x !== w);
        selectedWordsSet.delete(w);
        saveProfile(activeStudentName, { words: next, selectedWords: Array.from(selectedWordsSet) });
        renderPhraseAndWordBoxes(activeStudentName, selectedPhrasesSet, selectedWordsSet);
        setSelectedPointsTextarea(selectedPhrasesSet, selectedWordsSet);
      },
    });
    wordBox.appendChild(el);
  }
}

// --- History ---
function getHistory() {
  const h = loadJson(STORAGE_KEYS.history, []);
  return Array.isArray(h) ? h : [];
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
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = '아직 생성 기록이 없습니다.';
    root.appendChild(empty);
    return;
  }

  for (const it of items) {
    const card = document.createElement('div');
    card.className = 'history-item';

    const meta = document.createElement('div');
    meta.className = 'history-meta';

    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = `${it.studentName} · ${it.bookTitle}`;

    const time = document.createElement('div');
    time.className = 'history-time';
    time.textContent = it.time;

    meta.appendChild(title);
    meta.appendChild(time);

    const p = document.createElement('p');
    p.className = 'history-text';
    p.textContent = it.text;

    const actions = document.createElement('div');
    actions.className = 'history-actions';

    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'btn btn-secondary';
    useBtn.textContent = '불러오기';
    useBtn.addEventListener('click', () => {
      $('studentSelect').value = it.studentName;
      $('bookTitle').value = it.bookTitle;
      $('pagesOrChapter').value = it.pagesOrChapter || '';
      $('tone').value = it.tone || $('tone').value;
      $('length').value = it.length || $('length').value;
      $('tutorNotes').value = it.tutorNotes || '';
      $('output').value = it.text;
      $('btnCopy').disabled = !it.text;
      setStatus('기록을 불러왔습니다.', 'good');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-ghost';
    copyBtn.textContent = '복사';
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(it.text);
      setStatus('복사했습니다.', 'good');
    });

    actions.appendChild(useBtn);
    actions.appendChild(copyBtn);

    card.appendChild(meta);
    card.appendChild(p);
    card.appendChild(actions);
    root.appendChild(card);
  }
}

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

async function generateBatch(payload) {
  const res = await fetch('/api/generate-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  if (!data?.results) throw new Error('No results returned');
  return data.results;
}

async function editReport({ text, instruction }) {
  const res = await fetch('/api/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, instruction }),
  });
  if (res.status === 404) {
    throw new Error('AI 수정 API(/api/edit)를 찾을 수 없습니다. 서버를 재시작(npm start)했는지 확인해 주세요.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  if (!data?.text) throw new Error('No text returned');
  return data.text;
}

function createEmptyRow(defaultStudent = '') {
  return {
    studentName: defaultStudent || '',
    bookTitle: '',
    pagesOrChapter: '',
    tutorNotes: '',
  };
}

function renderBatchRows(rows) {
  const root = $('batchRows');
  root.innerHTML = '';
  rows.forEach((row, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'batch-row';
    wrap.dataset.idx = String(idx);

    wrap.innerHTML = `
      ${buildStudentSelectHtml(row.studentName)}
      <input class="control js-batch-book" type="text" placeholder="책 제목" value="${escapeHtml(row.bookTitle)}" />
      <input class="control js-batch-pages" type="text" placeholder="범위(선택)" value="${escapeHtml(row.pagesOrChapter)}" />
      <textarea class="control textarea js-batch-notes" placeholder="개인 메모(선택)">${escapeHtml(row.tutorNotes)}</textarea>
      <div class="batch-actions">
        <button class="btn btn-secondary btn-small js-batch-edit-points" type="button">포인트 편집</button>
        <button class="btn btn-ghost btn-small js-batch-remove" type="button">삭제</button>
      </div>
    `;

    // Events
    wrap.querySelector('.js-batch-student').addEventListener('change', (e) => {
      rows[idx].studentName = e.target.value;
    });
    wrap.querySelector('.js-batch-book').addEventListener('input', (e) => {
      rows[idx].bookTitle = e.target.value;
    });
    wrap.querySelector('.js-batch-pages').addEventListener('input', (e) => {
      rows[idx].pagesOrChapter = e.target.value;
    });
    wrap.querySelector('.js-batch-notes').addEventListener('input', (e) => {
      rows[idx].tutorNotes = e.target.value;
    });
    wrap.querySelector('.js-batch-remove').addEventListener('click', () => {
      rows.splice(idx, 1);
      renderBatchRows(rows);
    });
    wrap.querySelector('.js-batch-edit-points').addEventListener('click', () => {
      // Jump the phrase/word editor to this row's student in batch mode.
      $('batchMode').checked = true;
      setBatchMode(true);
      const target = (rows[idx].studentName || '').trim();
      syncProfileForStudent(target);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    root.appendChild(wrap);
  });
}

function setBatchMode(on) {
  $('batchSection').hidden = !on;
  $('studentSelect').closest('.field').hidden = on;
  $('bookTitle').closest('.field').hidden = on;
  $('pagesOrChapter').closest('.field').hidden = on;

  $('btnGenerate').hidden = on;
  $('btnCopy').hidden = on;
  $('btnGenerateAll').hidden = !on;
  $('btnCopyAll').hidden = !on;
  $('batchResults').hidden = !on;
}

// --- Boot ---
document.addEventListener('DOMContentLoaded', () => {
  migrateProfilesIfNeeded();

  let activeProfileStudent = '';
  const selectedPhrasesSet = new Set();
  const selectedWordsSet = new Set();
  const batchRows = [createEmptyRow(getStudents()[0] || '')];
  let currentSingleStudent = '';
  const editChat = {
    messages: [],
    undoStack: [],
  };

  renderStudentSelect();
  renderHistory();
  setBatchMode(false);
  renderBatchRows(batchRows);

  // History collapse default
  const historyDetails = $('historyDetails');
  const openPref = loadJson(STORAGE_KEYS.historyOpen, false);
  historyDetails.open = !!openPref;
  historyDetails.addEventListener('toggle', () => {
    saveJson(STORAGE_KEYS.historyOpen, !!historyDetails.open);
  });

  function syncProfileForStudent(studentName) {
    activeProfileStudent = studentName || '';
    const p = ensureProfile(activeProfileStudent);
    selectedPhrasesSet.clear();
    selectedWordsSet.clear();
    (p.selectedPhrases || []).forEach((x) => selectedPhrasesSet.add(x));
    (p.selectedWords || []).forEach((x) => selectedWordsSet.add(x));
    renderPhraseAndWordBoxes(activeProfileStudent, selectedPhrasesSet, selectedWordsSet);
    setSelectedPointsTextarea(selectedPhrasesSet, selectedWordsSet);

    // In single mode, load per-student form fields too.
    if (!$('batchMode').checked) {
      const form = p.form || {};
      $('bookTitle').value = form.bookTitle || '';
      $('pagesOrChapter').value = form.pagesOrChapter || '';
      $('tutorNotes').value = form.tutorNotes || '';
      $('tone').value = form.tone || getDefaultTone();
      $('length').value = form.length || getDefaultLength();
      currentSingleStudent = activeProfileStudent;
    }
  }

  function getActiveProfileStudentName() {
    const isBatch = $('batchMode').checked;
    return isBatch ? activeProfileStudent : $('studentSelect').value;
  }

  function saveSingleFormToProfile(studentName) {
    if (!studentName) return;
    if ($('batchMode').checked) return;
    const p = ensureProfile(studentName);
    const next = {
      ...(p.form || {}),
      bookTitle: $('bookTitle').value || '',
      pagesOrChapter: $('pagesOrChapter').value || '',
      tutorNotes: $('tutorNotes').value || '',
      tone: $('tone').value || '',
      length: $('length').value || '',
    };
    saveProfile(studentName, { form: next });
  }

  function renderEditChat() {
    const root = $('editChatMessages');
    if (!root) return;
    root.innerHTML = '';
    if (!editChat.messages.length) {
      const empty = document.createElement('div');
      empty.className = 'chat-msg meta';
      empty.textContent = '원하는 수정 요청을 입력하면, AI가 아래 결과 텍스트를 바로 다듬어 줍니다.';
      root.appendChild(empty);
      return;
    }
    editChat.messages.forEach((m) => {
      const div = document.createElement('div');
      div.className = `chat-msg ${m.role}`;
      div.textContent = m.content;
      root.appendChild(div);
    });
    root.scrollTop = root.scrollHeight;
  }

  function setUndoEnabled() {
    const btn = $('btnEditUndo');
    if (btn) btn.disabled = editChat.undoStack.length === 0;
  }

  function updateEditChatVisibility() {
    const section = $('editChatSection');
    const output = $('output');
    if (!section || !output) return;
    section.hidden = !(output.value || '').trim();
  }

  // Initial profile binding
  currentSingleStudent = $('studentSelect').value || getStudents()[0] || '';
  syncProfileForStudent(currentSingleStudent);

  // Persist per-student form fields while typing (single mode only)
  ['bookTitle', 'pagesOrChapter', 'tutorNotes'].forEach((id) => {
    $(id).addEventListener('input', () => saveSingleFormToProfile($('studentSelect').value));
  });
  ['tone', 'length'].forEach((id) => {
    $(id).addEventListener('change', () => saveSingleFormToProfile($('studentSelect').value));
  });

  // Result edit chat
  renderEditChat();
  setUndoEnabled();
  updateEditChatVisibility();
  $('output')?.addEventListener('input', updateEditChatVisibility);

  async function runEditChat() {
    const input = $('editChatInput');
    const output = $('output');
    const instruction = (input?.value || '').trim();
    const current = (output?.value || '').trim();
    if (!instruction) return;
    if (!current) {
      setStatus('결과가 비어 있습니다. 먼저 리포트를 생성해 주세요.', 'warn');
      return;
    }

    $('btnEditSend').disabled = true;
    try {
      editChat.messages.push({ role: 'user', content: instruction });
      renderEditChat();

      editChat.undoStack.push(output.value || '');
      setUndoEnabled();

      const edited = await editReport({ text: output.value || '', instruction });
      output.value = edited;
      $('btnCopy').disabled = !edited.trim();
      updateEditChatVisibility();
      editChat.messages.push({ role: 'assistant', content: '반영했어요. 결과 텍스트를 업데이트했습니다.' });
      renderEditChat();
      setStatus('AI 수정 완료', 'good');
      input.value = '';
    } catch (e) {
      // rollback undo push if edit failed
      editChat.undoStack.pop();
      setUndoEnabled();
      setStatus(e?.message || 'AI 수정에 실패했습니다.', 'bad');
      editChat.messages.push({ role: 'assistant', content: `실패: ${e?.message || 'Unknown error'}` });
      renderEditChat();
    } finally {
      $('btnEditSend').disabled = false;
    }
  }

  $('btnEditSend')?.addEventListener('click', runEditChat);
  $('editChatInput')?.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to send
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runEditChat();
    }
  });
  $('btnEditUndo')?.addEventListener('click', () => {
    const output = $('output');
    if (!editChat.undoStack.length) return;
    output.value = editChat.undoStack.pop();
    setUndoEnabled();
    $('btnCopy').disabled = !(output.value || '').trim();
    setStatus('되돌렸습니다.', 'warn');
  });
  $('btnEditClear')?.addEventListener('click', () => {
    editChat.messages = [];
    renderEditChat();
    setStatus('대화를 지웠습니다.', 'warn');
  });

  $('studentSelect').addEventListener('change', () => {
    if ($('batchMode').checked) return;
    saveSingleFormToProfile(currentSingleStudent);
    syncProfileForStudent($('studentSelect').value);
  });

  $('btnAddPhrase').addEventListener('click', () => {
    const targetStudent = getActiveProfileStudentName();
    const input = $('newPhrase');
    const value = (input.value || '').trim();
    if (!value) return;
    const p = ensureProfile(targetStudent);
    const next = uniqTrimmed([...(p.phrases || []), value]);
    selectedPhrasesSet.add(value);
    saveProfile(targetStudent, { phrases: next, selectedPhrases: Array.from(selectedPhrasesSet) });
    input.value = '';
    renderPhraseAndWordBoxes(targetStudent, selectedPhrasesSet, selectedWordsSet);
    setSelectedPointsTextarea(selectedPhrasesSet, selectedWordsSet);
  });

  $('btnAddWord').addEventListener('click', () => {
    const targetStudent = getActiveProfileStudentName();
    const input = $('newWord');
    const raw = (input.value || '').trim();
    if (!raw) return;
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const p = ensureProfile(targetStudent);
    const nextWords = uniqTrimmedWords([...(p.words || []), ...parts]);
    parts.forEach((w) => selectedWordsSet.add(w));
    saveProfile(targetStudent, { words: nextWords, selectedWords: Array.from(selectedWordsSet) });
    input.value = '';
    renderPhraseAndWordBoxes(targetStudent, selectedPhrasesSet, selectedWordsSet);
    setSelectedPointsTextarea(selectedPhrasesSet, selectedWordsSet);
  });

  $('btnManageStudents').addEventListener('click', () => {
    renderStudentManager();
    $('studentDialog').showModal();
  });

  $('btnAddStudent').addEventListener('click', () => {
    const input = $('newStudent');
    const name = (input.value || '').trim();
    if (!name) return;
    const next = uniqTrimmed([...getStudents(), name]);
    setStudents(next);
    renderStudentSelect(name);
    renderStudentManager();
    // Refresh batch dropdowns (keep current selections if possible)
    renderBatchRows(batchRows);
    // Refresh profile editor dropdown and ensure new profile
    ensureProfile(name);
    if ($('batchMode').checked) syncProfileForStudent(activeProfileStudent || name);
    input.value = '';
    input.focus();
  });

  $('batchMode').addEventListener('change', () => {
    setBatchMode($('batchMode').checked);
    setStatus('');
    if ($('batchMode').checked) {
      // Save current single-mode form before switching
      saveSingleFormToProfile($('studentSelect').value);
      const pick = (batchRows[0]?.studentName || getStudents()[0] || '').trim();
      syncProfileForStudent(pick);
    } else {
      syncProfileForStudent($('studentSelect').value);
    }
  });

  $('btnAddRow').addEventListener('click', () => {
    batchRows.push(createEmptyRow(getStudents()[0] || ''));
    renderBatchRows(batchRows);
  });

  $('btnAdd7Rows').addEventListener('click', () => {
    batchRows.splice(0, batchRows.length);
    const students = getStudents();
    const count = Math.min(7, Math.max(1, students.length || 7));
    for (let i = 0; i < count; i++) batchRows.push(createEmptyRow(students[i] || students[0] || ''));
    renderBatchRows(batchRows);
  });

  $('btnClearRows').addEventListener('click', () => {
    batchRows.splice(0, batchRows.length);
    batchRows.push(createEmptyRow(getStudents()[0] || ''));
    renderBatchRows(batchRows);
  });

  $('btnGenerate').addEventListener('click', async () => {
    try {
      setStatus('생성 중…', '');
      $('btnGenerate').disabled = true;

      const activeStudent = $('studentSelect').value;
      const prof = ensureProfile(activeStudent);
      const payload = {
        studentName: activeStudent,
        bookTitle: $('bookTitle').value,
        pagesOrChapter: $('pagesOrChapter').value,
        selectedPhrases: Array.isArray(prof?.selectedPhrases) ? prof.selectedPhrases : [],
        selectedWords: Array.isArray(prof?.selectedWords) ? prof.selectedWords : [],
        tutorNotes: $('tutorNotes').value,
        tone: $('tone').value,
        length: $('length').value,
      };

      if (!payload.studentName) throw new Error('학생을 선택해 주세요.');
      if (!payload.bookTitle.trim()) throw new Error('책 제목을 입력해 주세요.');

      const text = await generateReport(payload);
      $('output').value = text;
      $('btnCopy').disabled = false;
      updateEditChatVisibility();
      setStatus('완료! 아래 결과를 복사해서 보내면 됩니다.', 'good');

      addHistory({ ...payload, text, time: nowKST() });
      renderHistory();
    } catch (e) {
      setStatus(e?.message || '생성에 실패했습니다.', 'bad');
    } finally {
      $('btnGenerate').disabled = false;
    }
  });

  $('btnGenerateAll').addEventListener('click', async () => {
    try {
      setStatus('배치 생성 중…', '');
      $('btnGenerateAll').disabled = true;
      $('btnCopyAll').disabled = true;
      $('batchResults').innerHTML = '';
      $('output').value = '';

      const common = {
        // Backward compatibility: still send, but each session will include its own student profile points.
        selectedPhrases: [],
        selectedWords: [],
        tutorNotes: $('tutorNotes').value,
        tone: $('tone').value,
        length: $('length').value,
      };

      const sessions = batchRows.map((r) => {
        const studentName = (r.studentName || '').trim();
        const prof = ensureProfile(studentName);
        return {
        studentName: (r.studentName || '').trim(),
        bookTitle: (r.bookTitle || '').trim(),
        pagesOrChapter: (r.pagesOrChapter || '').trim(),
        tutorNotes: (r.tutorNotes || '').trim(),
        selectedPhrases: Array.isArray(prof?.selectedPhrases) ? prof.selectedPhrases : [],
        selectedWords: Array.isArray(prof?.selectedWords) ? prof.selectedWords : [],
        };
      });

      if (!sessions.length) throw new Error('배치 행이 없습니다. 행을 추가해 주세요.');
      const missing = sessions.find((s) => !s.studentName || !s.bookTitle);
      if (missing) throw new Error('배치 행에서 학생/책 제목은 필수입니다.');

      const results = await generateBatch({ common, sessions });

      const ordered = results.slice().sort((a, b) => a.idx - b.idx);
      const texts = [];
      const root = $('batchResults');
      root.innerHTML = '';

      ordered.forEach((r) => {
        const it = document.createElement('div');
        it.className = 'history-item';

        const session = sessions[r.idx];
        const title = `${session.studentName} · ${session.bookTitle}`;
        const time = nowKST();

        const ok = r.ok;
        const bodyText = ok ? r.text : `생성 실패: ${r.error || 'Unknown error'}`;

        it.innerHTML = `
          <div class="history-meta">
            <div class="history-title">${escapeHtml(title)}</div>
            <div class="history-time">${escapeHtml(time)}</div>
          </div>
          <p class="history-text">${escapeHtml(bodyText)}</p>
          <div class="history-actions">
            <button class="btn btn-secondary js-copy-one" type="button" ${ok ? '' : 'disabled'}>복사</button>
          </div>
        `;

        it.querySelector('.js-copy-one').addEventListener('click', async () => {
          await navigator.clipboard.writeText(ok ? r.text : '');
          setStatus('복사했습니다.', 'good');
        });

        root.appendChild(it);

        if (ok) {
          texts.push(r.text);
          addHistory({ ...common, ...session, text: r.text, time });
        }
      });

      renderHistory();

      const combined = texts.join('\n\n');
      $('output').value = combined;
      $('btnCopyAll').disabled = !combined.trim();
      updateEditChatVisibility();

      const okCount = ordered.filter((x) => x.ok).length;
      const failCount = ordered.length - okCount;
      setStatus(`완료! 성공 ${okCount}개${failCount ? ` / 실패 ${failCount}개` : ''}`, failCount ? 'warn' : 'good');
    } catch (e) {
      setStatus(e?.message || '배치 생성에 실패했습니다.', 'bad');
    } finally {
      $('btnGenerateAll').disabled = false;
    }
  });

  $('btnCopy').addEventListener('click', async () => {
    const text = $('output').value || '';
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    setStatus('복사했습니다.', 'good');
  });

  $('btnCopyAll').addEventListener('click', async () => {
    const text = $('output').value || '';
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    setStatus('전체를 복사했습니다.', 'good');
  });

  $('btnClearHistory').addEventListener('click', () => {
    setHistory([]);
    renderHistory();
    setStatus('기록을 삭제했습니다.', 'warn');
  });

  $('btnReset').addEventListener('click', () => {
    $('bookTitle').value = '';
    $('pagesOrChapter').value = '';
    $('tutorNotes').value = '';
    $('output').value = '';
    $('btnCopy').disabled = true;
    $('btnCopyAll').disabled = true;
    $('batchResults').innerHTML = '';
    $('newPhrase').value = '';
    $('newWord').value = '';
    $('transcript').value = '';
    discardRecording();
    setStatus('');
    syncProfileForStudent(getActiveProfileStudentName());
  });

  // --- Voice Recording ---
  let mediaRecorder = null;
  let audioChunks = [];
  let audioBlob = null;
  let recordTimerInterval = null;
  let recordStartTime = 0;

  function setTranscribeStatus(text, kind = '') {
    const el = $('transcribeStatus');
    el.textContent = text || '';
    el.className = `status ${kind}`.trim();
  }

  function updateRecordTimer() {
    const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    $('recordTimer').textContent = `${mins}:${secs}`;
  }

  function discardRecording() {
    audioBlob = null;
    audioChunks = [];
    $('audioPlayback').hidden = true;
    $('audioPlayer').src = '';
    $('recordTimer').textContent = '00:00';
    $('recordingIndicator').hidden = true;
    setTranscribeStatus('');
  }

  $('btnRecord').addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      audioBlob = null;
      $('audioPlayback').hidden = true;

      mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        audioBlob = new Blob(audioChunks, { type: mimeType });
        const url = URL.createObjectURL(audioBlob);
        $('audioPlayer').src = url;
        $('audioPlayback').hidden = false;
        $('recordingIndicator').hidden = true;
        clearInterval(recordTimerInterval);
        setTranscribeStatus('녹음 완료! "텍스트 변환"을 눌러 주세요.', 'good');
      };

      mediaRecorder.start(1000); // collect data every second
      recordStartTime = Date.now();
      recordTimerInterval = setInterval(updateRecordTimer, 1000);

      $('btnRecord').disabled = true;
      $('btnStopRecord').disabled = false;
      $('recordingIndicator').hidden = false;
      setTranscribeStatus('');
    } catch (err) {
      setTranscribeStatus('마이크 접근이 거부되었습니다. 브라우저 설정을 확인해 주세요.', 'bad');
    }
  });

  $('btnStopRecord').addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    $('btnRecord').disabled = false;
    $('btnStopRecord').disabled = true;
  });

  $('btnDiscardAudio').addEventListener('click', discardRecording);

  $('btnTranscribe').addEventListener('click', async () => {
    if (!audioBlob) {
      setTranscribeStatus('녹음 파일이 없습니다.', 'bad');
      return;
    }

    try {
      $('btnTranscribe').disabled = true;
      setTranscribeStatus('Whisper로 변환 중... (시간이 걸릴 수 있습니다)', '');

      const ext = getExtFromMime(audioBlob.type);
      const formData = new FormData();
      formData.append('audio', audioBlob, `recording.${ext}`);

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data?.error || `Transcription failed (${res.status})`);
      if (!data?.text) throw new Error('Empty transcription result');

      // Append to existing transcript
      const existing = ($('transcript').value || '').trim();
      $('transcript').value = existing ? existing + '\n\n' + data.text : data.text;
      setTranscribeStatus('변환 완료!', 'good');
    } catch (err) {
      setTranscribeStatus(err?.message || '변환에 실패했습니다.', 'bad');
    } finally {
      $('btnTranscribe').disabled = false;
    }
  });

  function getSupportedMimeType() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

  function getExtFromMime(mime) {
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('mp4')) return 'mp4';
    return 'webm';
  }

  // --- Generate report from transcript ---
  $('btnGenerateFromTranscript').addEventListener('click', async () => {
    try {
      const transcriptText = ($('transcript').value || '').trim();
      if (!transcriptText) {
        setStatus('녹취록이 비어 있습니다. 녹음 후 변환하거나 직접 입력해 주세요.', 'bad');
        return;
      }

      const activeStudent = $('studentSelect').value;
      if (!activeStudent) {
        setStatus('학생을 선택해 주세요.', 'bad');
        return;
      }

      setStatus('녹취록에서 리포트 생성 중…', '');
      $('btnGenerateFromTranscript').disabled = true;

      const payload = {
        studentName: activeStudent,
        bookTitle: $('bookTitle').value || '',
        transcript: transcriptText,
        additionalNotes: $('tutorNotes').value || '',
        tone: $('tone').value,
        length: $('length').value,
      };

      const res = await fetch('/api/generate-from-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      if (!data?.text) throw new Error('No text returned');

      $('output').value = data.text;
      $('btnCopy').disabled = false;
      updateEditChatVisibility();
      setStatus('녹취록 기반 리포트 생성 완료!', 'good');

      addHistory({
        studentName: activeStudent,
        bookTitle: $('bookTitle').value || '',
        pagesOrChapter: $('pagesOrChapter').value || '',
        tutorNotes: `[녹취록 기반] ${($('tutorNotes').value || '').substring(0, 100)}`,
        tone: $('tone').value,
        length: $('length').value,
        text: data.text,
        time: nowKST(),
      });
      renderHistory();
    } catch (e) {
      setStatus(e?.message || '리포트 생성에 실패했습니다.', 'bad');
    } finally {
      $('btnGenerateFromTranscript').disabled = false;
    }
  });
});


