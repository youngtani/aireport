const KEYS = {
  students: 'aireport.students.v1',
  profiles: 'aireport.studentProfiles.v1',
  history: 'aireport.history.v1',
  historyOpen: 'aireport.historyOpen.v1',
};

export const DEFAULT_STUDENTS = ['현성이', '민준', '서연'];

export const DEFAULT_PHRASES = [
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

export const DEFAULT_WORDS = [
  'vocabulary', 'pronunciation', 'summary', 'inference',
  'comprehension', 'grammar', 'discussion',
];

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function uniq(arr) {
  const seen = new Set();
  return arr.filter((s) => {
    const t = (typeof s === 'string' ? s : '').trim();
    if (!t || seen.has(t)) return false;
    seen.add(t);
    return true;
  }).map((s) => s.trim());
}

function uniqLower(arr) {
  const seen = new Set();
  return arr.filter((s) => {
    const t = (typeof s === 'string' ? s : '').trim();
    if (!t || seen.has(t.toLowerCase())) return false;
    seen.add(t.toLowerCase());
    return true;
  }).map((s) => s.trim());
}

// --- Students ---
export function getStudents() {
  const s = load(KEYS.students, null);
  return Array.isArray(s) && s.length ? uniq(s) : DEFAULT_STUDENTS.slice();
}

export function setStudents(list) {
  save(KEYS.students, uniq(list));
}

// --- Profiles ---
function loadProfiles() {
  const r = load(KEYS.profiles, null);
  return r && typeof r === 'object' ? r : {};
}

function saveProfiles(p) {
  save(KEYS.profiles, p);
}

export function ensureProfile(name) {
  if (!name) return null;
  const all = loadProfiles();
  if (!all[name]) {
    all[name] = {
      phrases: DEFAULT_PHRASES.slice(),
      words: DEFAULT_WORDS.slice(),
      selectedPhrases: [],
      selectedWords: [],
      form: { bookTitle: '', pagesOrChapter: '', tutorNotes: '', tone: '', length: '' },
    };
    saveProfiles(all);
  }
  const p = all[name];
  p.phrases = uniq(Array.isArray(p.phrases) ? p.phrases : DEFAULT_PHRASES.slice());
  p.words = uniqLower(Array.isArray(p.words) ? p.words : DEFAULT_WORDS.slice());
  p.selectedPhrases = uniq(Array.isArray(p.selectedPhrases) ? p.selectedPhrases : []);
  p.selectedWords = uniqLower(Array.isArray(p.selectedWords) ? p.selectedWords : []);
  p.form = p.form && typeof p.form === 'object' ? p.form : {};
  return p;
}

export function saveProfile(name, patch) {
  if (!name) return;
  const all = loadProfiles();
  const cur = ensureProfile(name) || {};
  all[name] = { ...cur, ...patch };
  saveProfiles(all);
}

export function deleteProfile(name) {
  const all = loadProfiles();
  delete all[name];
  saveProfiles(all);
}

// --- History ---
export function getHistory() {
  const h = load(KEYS.history, []);
  return Array.isArray(h) ? h : [];
}

export function addHistory(item) {
  const items = getHistory();
  items.unshift(item);
  save(KEYS.history, items.slice(0, 20));
}

export function clearHistory() {
  save(KEYS.history, []);
}

export function getHistoryOpen() {
  return !!load(KEYS.historyOpen, false);
}

export function setHistoryOpen(v) {
  save(KEYS.historyOpen, !!v);
}
