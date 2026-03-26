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

/* ── Transcription ── */
app.post('/api/transcribe', authMiddleware, upload.single('audio'), async (req, res) => {
  try {
    if (!getApiKey()) return res.status(400).json({ error: 'OPENAI_API_KEY is not set.' });
    if (!req.file) return res.status(400).json({ error: 'No audio file' });
    const client = createClient();
    const file = new File([req.file.buffer], req.file.originalname || 'audio.webm', { type: req.file.mimetype || 'audio/webm' });
    const transcription = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      prompt: '이 수업에서는 한국어와 English를 함께 사용합니다. 영어 단어와 문장은 영어 그대로 transcribe 해주세요.',
    });
    return res.json({ text: transcription.text || '' });
  } catch (err) { return res.status(500).json({ error: err.message || 'Transcription error' }); }
});

/* ── Generate comment ── */
const SYSTEM_PROMPT = `당신은 독서학원(영어 리딩 학원) 선생님이 학부모에게 보내는 수업 코멘트를 작성합니다.
아래의 스타일 가이드와 예시를 정확히 따라 작성하세요.

═══ 스타일 가이드 ═══

[구조 - 반드시 이 순서를 따를 것]
1. 도입: "[이름]은/는 오늘 [책 제목]을/를 읽었습니다." 또는 "[이름]은/는 오늘 [책 제목]을/를 읽으며 [범위]까지 진행했습니다."
2. 줄거리 이해: 학생이 이해하고 설명해 준 내용을 구체적으로 서술. "~장면까지 잘 이해하고 설명해 주었습니다" 패턴 사용.
3. 스토리텔링/인상 깊은 부분: 학생이 가장 인상 깊었던 장면이나 느낀 점을 영어로 표현한 내용 언급.
4. 북리포트/에세이 활동 (가장 중요): 어떤 질문에 답했는지, 어떤 내용을 글로 정리했는지, 문장 확장이나 리라이팅을 어떻게 했는지 구체적으로 서술.
5. 문법/어휘 학습: 배운 문법 포인트(시제, 전치사, 접속사, 관계대명사 등)와 새로운 어휘를 구체적으로 언급. 반드시 학생이 쓴 영어 문장을 "큰따옴표"로 인용.
6. 마무리: 학생 이름을 부르며 격려. "오늘도 수고 많았어요~", "잘 따라와줘서 고마워요! ^^" 등.

[톤과 표현]
- 따뜻하고 구체적. 학부모가 읽었을 때 "오늘 아이가 뭘 했는지" 선명하게 보여야 함.
- 자연스러운 한국어 문어체. "~해주었습니다", "~살펴보았습니다", "~진행하였습니다", "~함께 배워보았습니다" 스타일.
- 격려 표현: "기특했습니다", "잘 정리해 주었습니다", "잘 따라와 주었습니다" 등 자연스럽게 섞기.
- 마무리에 ~, ^^, ! 자연스럽게 사용. 이모지는 사용 금지.
- 영어 책 제목, 단어, 문장은 반드시 영어 그대로 표기.

[형식]
- 한 문단 또는 2-3개의 짧은 문단. 줄바꿈 최소화.
- 학생이 쓴 영어 문장을 인용할 때 큰따옴표 사용: "He solved many problems."
- 어휘를 나열할 때: lawyer, courthouse, judge와 같은 / slyly, clumsy와 같은
- 문법 설명: "A 대신 B와 같이 보다 정확하고 구체적인 단어를 사용해보았습니다" 패턴

[금지사항]
- 이모지 사용 금지 (^^, ~, ! 는 허용)
- 과도한 칭찬 나열 금지. 구체적 사실 위주로 서술.
- 과거 코멘트의 내용을 그대로 반복 금지. 오늘 수업 기준으로 새로 작성.
- 수업에서 다루지 않은 내용 지어내기 금지. 제공된 대화/메모에 있는 내용만 활용.

═══ 참고 예시 (톤과 구조를 따라할 것) ═══

<example_1>
예나는 오늘 Fantastic Mr Fox를 읽으며 Chapter 1-7까지 진행했습니다. 이야기의 앞부분에서 Mr Fox가 가족과 함께 굴에 살며 밤마다 먹이를 구하러 나가는 내용과, 세 농부 Boggis, Bunce, Bean이 Mr Fox를 잡기 위해 계획을 세우는 흐름을 잘 이해하고 설명해 주었습니다. 북리포트 시간에는 전체 줄거리를 보다 매끄럽게 다듬으며 리라이팅을 진행했고, 사건의 흐름을 순서에 맞게 정리하는 연습도 함께 이루어졌습니다. 문법적으로는 시제를 과거형으로 일치시키도록 문장을 수정하였으며, slyly, clumsy와 같은 책 속 어휘를 활용해 주어+동사 구조의 간결한 문장을 함께 작성해 보며 기본 문장 형식을 복습하였습니다. 오늘은 새로운 표현을 평소보다 조금 많이 배웠지만 끝까지 집중하며 잘 따라와주어 정말 기특했습니다! ^^
</example_1>

<example_2>
예나는 오늘 Stone Fox를 완독했습니다. 이야기의 마지막 부분에서 썰매견 대회에 참가하게 되고, 결국 주인공 강아지 Searchlight가 죽게 되는 장면까지 잘 이해하고 설명해주었습니다.
스토리텔링 시간에 가장 인상 깊었던 부분을 물어보니, 앞부분에서 주인공이 편찮으신 할아버지를 도와드리는 장면이 기억에 남았다고 영어로 잘 표현해주었습니다. 예나가 이야기 속 인물들의 상황과 마음을 헤아리면서 읽었다는 점을 알 수 있었습니다. ^^
북리포트에선 How did the story make you feel?라는 질문에 주인공 강아지 searchlight 이 죽는 부분이 슬펐다고 sad라고 답해주어서 I felt sad because Searchlight died in the end.와 같이 문장으로 확장해보는 연습도 함께 진행했습니다. 또한 단순히 did와 같은 표현보다는 participated와 같이 보다 정확하고 구체적인 단어를 사용해보았습니다. Stone Fox 이후에는 Roald Dahl 작가의 Fantastic Mr. Fox를 진행할 예정이며, 오늘은 챕터 2까지 읽어보았습니다. 예나 오늘도 수고 많았어요~
</example_2>

<example_3>
수는 오늘 Abe Lincoln's Hat을 읽으며 아브라함 링컨의 이야기를 살펴보았습니다. 다소 난이도가 있는 내용이었지만 끝까지 집중하며 잘 따라와 주었고, 줄거리도 스스로 잘 정리해 주었습니다. "He solved many problems, for example, people argued about animals, land and money."와 같이 for example을 활용해 예를 덧붙이며 문장을 확장한 점이 정말 기특했습니다. 오늘은 lawyer, courthouse, judge와 같은 관련 어휘도 함께 배우며 내용 이해를 도왔습니다. 오늘 단어 공부까지 열심히 해준 수 정말 수고 많았어요!
</example_3>

<example_4>
오늘은 Mouse Tales를 읽었습니다. 이 책은 7가지의 짧은 이야기가 묶여 있는 구성인데, 그중에서 수가 가장 인상 깊었다고 한 "Clouds" 이야기를 골라 설명해주었고, 그 내용에 대해 글로도 잘 정리해주었습니다.
오늘은 특히 about (~에 관한) 표현을 배워보았습니다.
The book is about animals.
The movie is about history.
와 같은 문장을 만들어보며, about이 '~에 대한 내용'을 설명할 때 사용된다는 점을 익혔습니다. 배운 표현을 바로 문장에 적용해보는 모습이 좋았습니다. 오늘도 차분하게 열심히 수업한 수, 정말 수고 많았어요~ ^^
</example_4>

<example_5>
지안이는 The Mysterious Benedict Society를 완독하고 AR 테스트에서 Reading 18/20, Vocabulary 16/20으로 안정적인 이해도를 보여주었습니다. 네 명의 아이들이 베네딕트 씨에게 선발되어 각자의 능력을 바탕으로 함께 임무를 수행하는 이야기를 구조적으로 잘 이해하고, 인물들의 특징과 역할까지 연결해 설명해 주었습니다.
북리포트 시간에는 관계대명사를 활용해 문장을 확장하는 연습을 했고, while that과 같이 어색했던 표현을 while they were studying on the island로 구체적으로 수정하며 문장의 정확도와 자연스러움을 높였습니다. 또한 문장을 쓸 때 시제와 주어를 맞추는 부분도 함께 점검하며 전체적인 문장 완성도를 높였습니다. 지안이 오늘도 수고 많았어요! ^^
</example_5>

═══ 작성 지침 ═══
위 예시들의 톤, 단어 선택, 문장 구조, 마무리 방식을 충실히 따라 작성하세요.
제공된 수업 대화 내용과 메모를 바탕으로, 오늘 수업에서 실제로 다룬 내용만 사용하여 코멘트를 작성하세요.`;

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
  });
  server.on('error', err => {
    if (err?.code === 'EADDRINUSE') { console.error(`Port ${port} in use`); process.exit(1); }
    console.error('Server error:', err); process.exit(1);
  });
}

export default app;
