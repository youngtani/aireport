import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import multer from 'multer';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config();

/* ── Firebase init ── */
let db = null;
try {
  const fbConfig = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;
  if (fbConfig) {
    initializeApp({ credential: cert(fbConfig) });
    db = getFirestore();
    console.log('[Firebase] Connected');
  } else {
    console.warn('[Firebase] FIREBASE_SERVICE_ACCOUNT not set — using in-memory fallback');
  }
} catch (e) {
  console.error('[Firebase] Init error:', e.message);
}

/* ── Express setup ── */
export const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/* ── Tutors (Firebase-managed) ── */
// Tutors are stored in Firestore 'tutors' collection
// Each doc: { name, password, approved: true/false, createdAt }
// Only approved tutors can log in. Admin sets approved=true in Firebase console.

async function fbGetTutor(name) {
  if (!db) return null;
  const snap = await db.collection('tutors').where('name', '==', name).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function fbRegisterTutor(name, password) {
  if (!db) throw new Error('Firebase not connected');
  const existing = await db.collection('tutors').where('name', '==', name).get();
  if (!existing.empty) throw new Error('이미 등록된 이름입니다.');
  const ref = await db.collection('tutors').add({
    name,
    password,
    approved: false,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

/* ── Session tokens (Firestore-backed) ── */
function generateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
}

async function fbCreateSession(token, tutor, expiresMs) {
  if (!db) return;
  await db.collection('sessions').doc(token).set({
    tutor,
    expires: Date.now() + expiresMs,
    createdAt: new Date().toISOString(),
  });
}

async function fbGetSession(token) {
  if (!db || !token) return null;
  const doc = await db.collection('sessions').doc(token).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (data.expires < Date.now()) {
    db.collection('sessions').doc(token).delete().catch(() => {});
    return null;
  }
  return data;
}

async function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'];
  const session = await fbGetSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized — please log in' });
  }
  req.tutorName = session.tutor;
  next();
}

/* ── Auth endpoints ── */
app.post('/api/login', async (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: '이름과 비밀번호를 입력하세요.' });
  try {
    const tutor = await fbGetTutor(name);
    if (!tutor || tutor.password !== password) return res.status(401).json({ error: '이름 또는 비밀번호가 틀렸습니다.' });
    if (!tutor.approved) return res.status(403).json({ error: '승인 대기 중입니다. 관리자에게 문의하세요.' });
    const token = generateToken();
    await fbCreateSession(token, name, 24 * 60 * 60 * 1000); // 24h
    return res.json({ token, tutor: name });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.post('/api/logout', async (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token && db) {
    db.collection('sessions').doc(token).delete().catch(() => {});
  }
  return res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: '이름과 비밀번호를 입력하세요.' });
  if (name.length < 1 || password.length < 2) return res.status(400).json({ error: '비밀번호는 2자 이상이어야 합니다.' });
  try {
    const id = await fbRegisterTutor(name, password);
    return res.json({ id, message: '가입 완료! 관리자 승인 후 로그인할 수 있습니다.' });
  } catch (e) { return res.status(400).json({ error: e.message }); }
});

app.get('/api/me', authMiddleware, (req, res) => {
  return res.json({ tutor: req.tutorName });
});

/* ── Helper ── */
function getApiKey() {
  dotenv.config();
  const key = process.env.OPENAI_API_KEY;
  return typeof key === 'string' ? key.trim() : '';
}
function createClient() {
  return new OpenAI({ apiKey: getApiKey() || 'missing' });
}
function asNonEmptyString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/* ── Firestore helpers ── */
// Collections: students, studentMemos, comments (finalized), studentComments (drafts per-student)

async function fbGetStudents() {
  if (!db) return [];
  const snap = await db.collection('students').orderBy('name').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function fbAddStudent(name) {
  if (!db) return null;
  const existing = await db.collection('students').where('name', '==', name).get();
  if (!existing.empty) return existing.docs[0].id;
  const ref = await db.collection('students').add({ name, createdAt: new Date().toISOString() });
  return ref.id;
}
async function fbDeleteStudent(id) {
  if (!db) return;
  await db.collection('students').doc(id).delete();
}

async function fbGetStudentMemo(studentName) {
  if (!db) return '';
  const snap = await db.collection('studentMemos').where('studentName', '==', studentName).limit(1).get();
  return snap.empty ? '' : snap.docs[0].data().memo || '';
}
async function fbSetStudentMemo(studentName, memo) {
  if (!db) return;
  const snap = await db.collection('studentMemos').where('studentName', '==', studentName).limit(1).get();
  if (snap.empty) {
    await db.collection('studentMemos').add({ studentName, memo, updatedAt: new Date().toISOString() });
  } else {
    await snap.docs[0].ref.update({ memo, updatedAt: new Date().toISOString() });
  }
}

async function fbGetFinalComments(studentName, limit = 10) {
  if (!db) return [];
  let q = db.collection('comments').orderBy('createdAt', 'desc').limit(limit);
  if (studentName) q = db.collection('comments').where('studentName', '==', studentName).orderBy('createdAt', 'desc').limit(limit);
  const snap = await q.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function fbSaveFinalComment(data) {
  if (!db) return null;
  const ref = await db.collection('comments').add({ ...data, createdAt: new Date().toISOString() });
  return ref.id;
}

/* ── Shared data API endpoints ── */

// Students (shared)
app.get('/api/students', authMiddleware, async (req, res) => {
  try {
    const students = await fbGetStudents();
    return res.json({ students });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});
app.post('/api/students', authMiddleware, async (req, res) => {
  try {
    const name = asNonEmptyString(req.body?.name);
    if (!name) return res.status(400).json({ error: 'name required' });
    const id = await fbAddStudent(name);
    return res.json({ id, name });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});
app.delete('/api/students/:id', authMiddleware, async (req, res) => {
  try {
    await fbDeleteStudent(req.params.id);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Student memos (shared per-student)
app.get('/api/student-memo/:name', authMiddleware, async (req, res) => {
  try {
    const memo = await fbGetStudentMemo(req.params.name);
    return res.json({ memo });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});
app.post('/api/student-memo/:name', authMiddleware, async (req, res) => {
  try {
    await fbSetStudentMemo(req.params.name, asNonEmptyString(req.body?.memo));
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Finalized comments (shared)
app.get('/api/comments', authMiddleware, async (req, res) => {
  try {
    const studentName = req.query.student || '';
    const comments = await fbGetFinalComments(studentName, 20);
    return res.json({ comments });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});
app.post('/api/comments', authMiddleware, async (req, res) => {
  try {
    const { studentName, bookTitle, text, tutorName } = req.body || {};
    if (!studentName || !bookTitle || !text) return res.status(400).json({ error: 'Missing fields' });
    const id = await fbSaveFinalComment({ studentName, bookTitle, text, tutorName: tutorName || req.tutorName });
    return res.json({ id });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

/* ── Soniox temporary API key for browser real-time transcription ── */
function getSonioxKey() {
  dotenv.config();
  const key = process.env.SONIOX_API_KEY;
  return typeof key === 'string' ? key.trim() : '';
}

app.get('/api/soniox-token', authMiddleware, async (req, res) => {
  try {
    const sonioxKey = getSonioxKey();
    if (!sonioxKey) return res.status(400).json({ error: 'SONIOX_API_KEY is not set.' });

    // Try to get a temporary API key first (preferred for security)
    try {
      const response = await fetch('https://api.soniox.com/v1/auth/temporary-api-key', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sonioxKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usage_type: 'transcribe_websocket',
          expires_in_seconds: 600,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.api_key) {
          console.log('[Soniox] Temporary key generated successfully');
          return res.json({ apiKey: data.api_key });
        }
      }
      const errBody = await response.text().catch(() => '');
      console.warn('[Soniox] Temporary key endpoint returned', response.status, errBody);
    } catch (tempErr) {
      console.warn('[Soniox] Temporary key fetch failed:', tempErr.message);
    }

    // Fallback: return the API key directly (still works with Soniox SDK)
    console.log('[Soniox] Using direct API key as fallback');
    return res.json({ apiKey: sonioxKey });
  } catch (err) {
    console.error('[Soniox] Token error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to get Soniox token' });
  }
});

/* ── Transcription (batch fallback via OpenAI) ── */
const TRANSCRIPTION_PROMPT = `This is a Korean tutoring session (독서학원 수업). The teacher and student freely mix Korean (한국어) and English in the SAME sentence.
Examples of what they say: "오늘 읽은 book은 Charlotte's Web이야", "character가 누구야?", "setting은 어디야?", "vocabulary 단어 중에 abandon이 뭐야?"
CRITICAL: Transcribe EXACTLY as spoken — keep Korean parts in Korean (한글) and English parts in English. Do NOT translate. Do NOT convert one language to the other. Mixed sentences are normal and expected.`;

app.post('/api/transcribe', authMiddleware, upload.single('audio'), async (req, res) => {
  try {
    if (!getApiKey()) return res.status(400).json({ error: 'OPENAI_API_KEY is not set.' });
    if (!req.file) return res.status(400).json({ error: 'No audio file' });
    const client = createClient();
    const file = new File([req.file.buffer], req.file.originalname || 'audio.webm', { type: req.file.mimetype || 'audio/webm' });
    const transcription = await client.audio.transcriptions.create({
      model: 'gpt-4o-transcribe',
      file,
      prompt: TRANSCRIPTION_PROMPT,
    });
    return res.json({ text: transcription.text || '' });
  } catch (err) { return res.status(500).json({ error: err.message || 'Transcription error' }); }
});

/* ── Generate comment ── */
const SYSTEM_PROMPT = `당신은 독서학원 선생님이 학부모에게 보내는 수업 코멘트를 작성하는 전문 작가입니다.

아래 규칙을 반드시 따르세요:

1. 대화 내용을 꼼꼼히 읽고 핵심 정보를 파악하세요: 책 제목, 학생이 설명한 줄거리, 등장인물, 배경, 배운 어휘, 학생이 작성한 문장, 시험 점수, 특별한 순간 등.

2. 아래 형식을 따르세요:
   - "오늘 [이름]은/는 [책 제목]을/를 읽었습니다." 로 시작
   - 책의 내용에 대한 간단한 소개
   - 학생이 정확히 파악한 것들 (등장인물, 배경 등)
   - 배운 어휘 단어들
   - 에세이 관련 내용 (매일 에세이를 쓰는데, 이 부분이 가장 중요합니다. 에세이에서 어떤 내용을 썼는지, 어떤 피드백을 받았는지 자세히 다뤄주세요)
   - 학생이 만든 문장들
   - 마지막은 학생의 이름을 부르며 격려하는 멘트로 마무리

3. 톤은 따뜻하고 격려하며, 학부모에게 오늘 아이가 수업에서 무엇을 했는지 구체적으로 보여주세요.

4. 출력은 한 개의 문단으로 작성하세요. 줄바꿈 최소화. 이모지/특수문자 사용 금지.

5. 자연스러운 한국어로 작성하되, 영어 책 제목, 단어, 문장은 영어 그대로 표기하세요.

6. 과거 코멘트가 제공된 경우, 톤과 스타일의 일관성을 유지하되 내용은 반드시 오늘 수업 기준으로 새로 작성하세요. 과거 코멘트의 내용을 그대로 반복하지 마세요.

7. 전체 메모나 학생 메모가 제공된 경우, 해당 정보를 참고하여 더 맞춤형 코멘트를 작성하세요.`;

async function generateOne({ studentName, bookTitle, pagesOrChapter, transcription, tutorNotes, studentMemo, globalMemo, pastComments }) {
  const client = createClient();
  const userParts = [
    `학생 이름: ${studentName}`,
    `오늘 읽은 책: ${bookTitle}`,
    pagesOrChapter ? `범위: ${pagesOrChapter}` : null,
    globalMemo ? `[전체 메모 - 모든 학생 공통]\n${globalMemo}` : null,
    studentMemo ? `[학생 메모 - ${studentName} 전용]\n${studentMemo}` : null,
    transcription ? `수업 대화 내용:\n${transcription}` : null,
    tutorNotes ? `추가 메모: ${tutorNotes}` : null,
    pastComments && pastComments.length
      ? `[이 학생의 과거 코멘트 (참고용)]\n${pastComments.join('\n---\n')}`
      : null,
  ].filter(Boolean).join('\n\n');

  const response = await client.responses.create({
    model: 'gpt-5',
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userParts },
    ],
  });
  return response.output_text ||
    response.output?.map(o => o?.content?.map(c => c?.text).filter(Boolean).join('')).filter(Boolean).join('\n') || '';
}

async function editOne({ originalText, instruction }) {
  const client = createClient();
  const system = '당신은 한국어 수업 리포트를 편집하는 도우미입니다.\n원문을 기반으로 사용자의 편집 지시사항을 반영해 자연스럽게 다듬어 주세요.\n이모지/특수문자 금지. 수정된 리포트 텍스트만 반환.';
  const response = await client.responses.create({
    model: 'gpt-5',
    input: [
      { role: 'system', content: system },
      { role: 'user', content: `원문:\n${originalText}\n\n편집 지시:\n${instruction}` },
    ],
  });
  return response.output_text ||
    response.output?.map(o => o?.content?.map(c => c?.text).filter(Boolean).join('')).filter(Boolean).join('\n') || '';
}

app.post('/api/generate', authMiddleware, async (req, res) => {
  try {
    if (!getApiKey()) return res.status(400).json({ error: 'OPENAI_API_KEY is not set.' });
    const studentName = asNonEmptyString(req.body?.studentName);
    const bookTitle = asNonEmptyString(req.body?.bookTitle);
    if (!studentName) return res.status(400).json({ error: 'studentName required' });
    if (!bookTitle) return res.status(400).json({ error: 'bookTitle required' });
    const text = await generateOne({
      studentName, bookTitle,
      pagesOrChapter: asNonEmptyString(req.body?.pagesOrChapter),
      transcription: asNonEmptyString(req.body?.transcription),
      tutorNotes: asNonEmptyString(req.body?.tutorNotes),
      studentMemo: asNonEmptyString(req.body?.studentMemo),
      globalMemo: asNonEmptyString(req.body?.globalMemo),
      pastComments: Array.isArray(req.body?.pastComments) ? req.body.pastComments.filter(c => typeof c === 'string' && c.trim()).slice(0, 3) : [],
    });
    if (!text.trim()) return res.status(502).json({ error: 'Empty response' });
    return res.json({ text });
  } catch (err) { return res.status(500).json({ error: err.message || 'Unknown error' }); }
});

app.post('/api/edit', authMiddleware, async (req, res) => {
  try {
    if (!getApiKey()) return res.status(400).json({ error: 'OPENAI_API_KEY not set' });
    const originalText = asNonEmptyString(req.body?.text);
    const instruction = asNonEmptyString(req.body?.instruction);
    if (!originalText || !instruction) return res.status(400).json({ error: 'text and instruction required' });
    const text = await editOne({ originalText, instruction });
    if (!text.trim()) return res.status(502).json({ error: 'Empty response' });
    return res.json({ text });
  } catch (err) { return res.status(500).json({ error: err.message || 'Unknown error' }); }
});

app.get('/api/ping', (req, res) => res.json({ ok: true }));

/* ── Start server ── */
if (!process.env.VERCEL) {
  const server = app.listen(port, () => {
    console.log(`수업 리포트 앱: http://localhost:${port}`);
    console.log(`OPENAI_API_KEY: ${getApiKey() ? 'OK' : 'MISSING'}`);
    console.log(`Firebase: ${db ? 'OK' : 'MISSING'}`);
    console.log(`Tutors: Firebase-managed`);
    console.log(`Soniox: ${getSonioxKey() ? 'OK' : 'MISSING (will use OpenAI fallback)'}`);
    console.log(`Transcription: ${getSonioxKey() ? 'Soniox real-time' : 'OpenAI chunked'}`);

  });
  server.on('error', err => {
    if (err?.code === 'EADDRINUSE') { console.error(`Port ${port} in use`); process.exit(1); }
    console.error('Server error:', err); process.exit(1);
  });
}

export default app;
