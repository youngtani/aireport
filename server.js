import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

export const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

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

// --- Transcription endpoint ---
// We use express raw body parsing for multipart audio
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!getApiKey()) {
      return res.status(400).json({ error: 'OPENAI_API_KEY is not set.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const client = createClient();
    // Convert buffer to a File-like object for OpenAI
    const file = new File([req.file.buffer], req.file.originalname || 'audio.webm', {
      type: req.file.mimetype || 'audio/webm',
    });

    const transcription = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file: file,
      language: 'ko',
    });

    return res.json({ text: transcription.text || '' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription error';
    return res.status(500).json({ error: message });
  }
});

// --- Generate comment ---
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
      ? `[이 학생의 과거 코멘트 (참고용 - 톤과 스타일을 유지하되 내용은 오늘 수업 기준으로 작성)]\n${pastComments.join('\n---\n')}`
      : null,
  ].filter(Boolean).join('\n\n');

  const response = await client.responses.create({
    model: 'gpt-5',
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userParts },
    ],
  });

  const text =
    response.output_text ||
    response.output?.map((o) => o?.content?.map((c) => c?.text).filter(Boolean).join('')).filter(Boolean).join('\n') ||
    '';

  return text;
}

async function editOne({ originalText, instruction }) {
  const client = createClient();
  const system = [
    '당신은 한국어 수업 리포트를 편집하는 도우미입니다.',
    '원문을 기반으로 사용자의 편집 지시사항을 반영해 자연스럽게 다듬어 주세요.',
    '의미/정보를 임의로 크게 바꾸지 마세요.',
    '이모지/특수문자 금지. 수정된 리포트 텍스트만 반환하세요.',
  ].join('\n');

  const user = `원문:\n${originalText}\n\n편집 지시:\n${instruction}`;

  const response = await client.responses.create({
    model: 'gpt-5',
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  return response.output_text ||
    response.output?.map((o) => o?.content?.map((c) => c?.text).filter(Boolean).join('')).filter(Boolean).join('\n') ||
    '';
}

app.post('/api/generate', async (req, res) => {
  try {
    if (!getApiKey()) {
      return res.status(400).json({ error: 'OPENAI_API_KEY is not set. Create a .env file with OPENAI_API_KEY=your_key and restart.' });
    }

    const studentName = asNonEmptyString(req.body?.studentName);
    const bookTitle = asNonEmptyString(req.body?.bookTitle);
    const pagesOrChapter = asNonEmptyString(req.body?.pagesOrChapter);
    const transcription = asNonEmptyString(req.body?.transcription);
    const tutorNotes = asNonEmptyString(req.body?.tutorNotes);
    const studentMemo = asNonEmptyString(req.body?.studentMemo);
    const globalMemo = asNonEmptyString(req.body?.globalMemo);
    const pastComments = Array.isArray(req.body?.pastComments) ? req.body.pastComments.filter(c => typeof c === 'string' && c.trim()).slice(0, 3) : [];

    if (!studentName) return res.status(400).json({ error: 'studentName is required' });
    if (!bookTitle) return res.status(400).json({ error: 'bookTitle is required' });

    const text = await generateOne({ studentName, bookTitle, pagesOrChapter, transcription, tutorNotes, studentMemo, globalMemo, pastComments });
    if (!text.trim()) return res.status(502).json({ error: 'Empty response from model' });

    return res.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/edit', async (req, res) => {
  try {
    if (!getApiKey()) {
      return res.status(400).json({ error: 'OPENAI_API_KEY is not set.' });
    }

    const originalText = asNonEmptyString(req.body?.text);
    const instruction = asNonEmptyString(req.body?.instruction);

    if (!originalText) return res.status(400).json({ error: 'text is required' });
    if (!instruction) return res.status(400).json({ error: 'instruction is required' });

    const text = await editOne({ originalText, instruction });
    if (!text.trim()) return res.status(502).json({ error: 'Empty response' });

    return res.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

app.get('/api/ping', (req, res) => res.json({ ok: true }));

// Only start server locally (not on Vercel)
if (!process.env.VERCEL) {
  const server = app.listen(port, () => {
    const present = !!getApiKey();
    console.log(`수업 리포트 앱 실행: http://localhost:${port}`);
    console.log(`OPENAI_API_KEY ${present ? '감지됨' : '없음'}`);
  });

  server.on('error', (err) => {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
      console.error(`포트 ${port}가 이미 사용 중입니다.`);
      process.exit(1);
    }
    console.error('서버 시작 실패:', err);
    process.exit(1);
  });
}

export default app;
