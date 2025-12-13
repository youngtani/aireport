import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load env at startup (we also re-try inside requests to handle late-created .env files).
dotenv.config();

export const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

function getApiKey() {
  // If the user creates/edits .env after the server started, this gives us a chance to pick it up.
  dotenv.config();
  const key = process.env.OPENAI_API_KEY;
  return typeof key === 'string' ? key.trim() : '';
}

function createClient() {
  const apiKey = getApiKey();
  return new OpenAI({ apiKey: apiKey || 'missing' });
}

function asNonEmptyString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function norm(s) {
  return String(s || '').toLowerCase();
}

function missingWords(text, words) {
  const hay = norm(text);
  const missing = [];
  for (const w of words || []) {
    const t = typeof w === 'string' ? w.trim() : '';
    if (!t) continue;
    if (!hay.includes(norm(t))) missing.push(t);
  }
  return missing;
}

function createLimiter(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency) return;
    const job = queue.shift();
    if (!job) return;
    active++;
    Promise.resolve()
      .then(job.fn)
      .then(job.resolve, job.reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

async function generateOne({
  studentName,
  bookTitle,
  pagesOrChapter,
  selectedPhrases,
  selectedWords,
  tutorNotes,
  tone,
  length,
}) {
  const client = createClient();
  const phrases = Array.isArray(selectedPhrases) ? selectedPhrases.slice(0, 8) : [];
  const words = Array.isArray(selectedWords) ? selectedWords.slice(0, 10) : [];

  const system = [
    '당신은 학부모에게 보내는 과외 수업 리포트를 작성하는 한국어 작가입니다.',
    '입력된 사실을 자연스럽게 연결해 주세요.',
    '말투는 친근하지만 예의 바르게, 이모지/특수문자 남발은 금지합니다.',
    '출력은 한 개의 문단(줄바꿈 최소)로, 마지막은 격려 멘트로 마무리합니다.',
    '',
    '중요 규칙(반드시 지키기):',
    '- 선택한 "문구"는 문장 그대로 복붙이 아니어도 되지만, 핵심 내용이 리포트에 분명히 드러나게 반영한다.',
    '- 선택한 "단어/키워드"는 철자 그대로 리포트 본문에 반드시 포함한다(가능하면 자연스럽게).',
    '- 누락되면 전체를 다시 작성해 조건을 만족시킨다(출력에는 수정된 최종 리포트만).',
  ].join('\n');

  const user = [
    `학생 이름: ${studentName}`,
    `오늘 읽은 책: ${bookTitle}`,
    pagesOrChapter ? `범위(선택): ${pagesOrChapter}` : null,
    phrases.length ? `필수 반영(선택 문구 · 내용 반영):\n- ${phrases.join('\n- ')}` : null,
    words.length ? `필수 포함(선택 단어/키워드 · 철자 그대로):\n- ${words.join('\n- ')}` : null,
    tutorNotes ? `추가 메모(사실 위주): ${tutorNotes}` : null,
    `원하는 톤: ${tone}`,
    `길이: ${length}`,
    '',
    '요구사항:',
    '- 학부모에게 보내는 메시지 형태로 자연스럽게 작성',
    '- 오늘 수업에서 한 활동(읽기/복습/문법/토론 등)을 구체적으로 2~4개 포함',
    '- 학생의 반응/흥미 포인트를 1개 포함(입력된 내용이 없으면 일반적으로 표현)',
    '- 다음 수업 계획을 1문장으로 포함',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.responses.create({
    model: 'gpt-4.1-nano',
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user },
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
    '당신은 한국어 과외 수업 리포트를 "편집"하는 도우미입니다.',
    '입력된 원문을 기반으로, 사용자의 편집 지시사항을 반영해 자연스럽게 다듬어 주세요.',
    '의미/정보를 임의로 크게 바꾸지 마세요.',
    '이모지/특수문자 남발 금지. 출력은 "수정된 리포트 텍스트만" 반환하세요.',
  ].join('\n');

  const user = [
    '원문:',
    originalText,
    '',
    '편집 지시:',
    instruction,
  ].join('\n');

  const response = await client.responses.create({
    model: 'gpt-4.1-nano',
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const text =
    response.output_text ||
    response.output?.map((o) => o?.content?.map((c) => c?.text).filter(Boolean).join('')).filter(Boolean).join('\n') ||
    '';

  return text;
}

app.post('/api/generate', async (req, res) => {
  try {
    if (!getApiKey()) {
      return res.status(400).json({
        error:
          'OPENAI_API_KEY is not set. Set it via a local .env file or an environment variable (PowerShell example: $env:OPENAI_API_KEY="YOUR_KEY"; npm start). Then restart the server.',
      });
    }

    const studentName = asNonEmptyString(req.body?.studentName);
    const bookTitle = asNonEmptyString(req.body?.bookTitle);
    const pagesOrChapter = asNonEmptyString(req.body?.pagesOrChapter);
    const selectedPhrases = Array.isArray(req.body?.selectedPhrases) ? req.body.selectedPhrases : [];
    const selectedWords = Array.isArray(req.body?.selectedWords) ? req.body.selectedWords : [];
    const tutorNotes = asNonEmptyString(req.body?.tutorNotes);
    const tone = asNonEmptyString(req.body?.tone, '따뜻하고 긍정적');
    const length = asNonEmptyString(req.body?.length, '짧게(4~6문장)');

    if (!studentName) return res.status(400).json({ error: 'studentName is required' });
    if (!bookTitle) return res.status(400).json({ error: 'bookTitle is required' });

    const text = await generateOne({
      studentName,
      bookTitle,
      pagesOrChapter,
      selectedPhrases,
      selectedWords,
      tutorNotes,
      tone,
      length,
    });

    if (!text.trim()) {
      return res.status(502).json({ error: 'Empty response from model' });
    }

    return res.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/edit', async (req, res) => {
  try {
    if (!getApiKey()) {
      return res.status(400).json({
        error:
          'OPENAI_API_KEY is not set. Set it via a local .env file or an environment variable (PowerShell example: $env:OPENAI_API_KEY="YOUR_KEY"; npm start). Then restart the server.',
      });
    }

    const originalText = asNonEmptyString(req.body?.text);
    const instruction = asNonEmptyString(req.body?.instruction);

    if (!originalText) return res.status(400).json({ error: 'text is required' });
    if (!instruction) return res.status(400).json({ error: 'instruction is required' });

    const text = await editOne({ originalText, instruction });
    if (!text.trim()) return res.status(502).json({ error: 'Empty response from model' });

    return res.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

app.get('/api/ping', (req, res) => {
  return res.json({ ok: true });
});

app.post('/api/generate-batch', async (req, res) => {
  try {
    if (!getApiKey()) {
      return res.status(400).json({
        error:
          'OPENAI_API_KEY is not set. Set it via a local .env file or an environment variable (PowerShell example: $env:OPENAI_API_KEY="YOUR_KEY"; npm start). Then restart the server.',
      });
    }

    const common = req.body?.common || {};
    const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
    const tone = asNonEmptyString(common?.tone, '따뜻하고 긍정적');
    const length = asNonEmptyString(common?.length, '짧게(4~6문장)');
    const selectedPhrases = Array.isArray(common?.selectedPhrases) ? common.selectedPhrases : [];
    const selectedWords = Array.isArray(common?.selectedWords) ? common.selectedWords : [];
    const commonNotes = asNonEmptyString(common?.tutorNotes, '');

    if (!sessions.length) return res.status(400).json({ error: 'sessions is required' });
    if (sessions.length > 20) return res.status(400).json({ error: 'Too many sessions (max 20)' });

    const limit = createLimiter(2);
    const results = await Promise.all(
      sessions.map((s, idx) =>
        limit(async () => {
          const studentName = asNonEmptyString(s?.studentName);
          const bookTitle = asNonEmptyString(s?.bookTitle);
          const pagesOrChapter = asNonEmptyString(s?.pagesOrChapter);
          const perNotes = asNonEmptyString(s?.tutorNotes);
          const perPhrases = Array.isArray(s?.selectedPhrases) ? s.selectedPhrases : null;
          const perWords = Array.isArray(s?.selectedWords) ? s.selectedWords : null;

          if (!studentName) return { idx, ok: false, error: 'studentName is required' };
          if (!bookTitle) return { idx, ok: false, error: 'bookTitle is required' };

          const mergedNotes =
            commonNotes && perNotes
              ? `공통 메모: ${commonNotes}\n개인 메모: ${perNotes}`
              : commonNotes || perNotes || '';

          try {
            const text = await generateOne({
              studentName,
              bookTitle,
              pagesOrChapter,
              selectedPhrases: perPhrases ?? selectedPhrases,
              selectedWords: perWords ?? selectedWords,
              tutorNotes: mergedNotes,
              tone,
              length,
            });
            if (!text.trim()) return { idx, ok: false, error: 'Empty response from model' };
            return { idx, ok: true, text };
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            return { idx, ok: false, error: message };
          }
        }),
      ),
    );

    return res.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

// Only start a real HTTP server locally. On Vercel, this file is loaded as a serverless function.
if (!process.env.VERCEL) {
  const server = app.listen(port, () => {
    const present = !!getApiKey();
    console.log(`AI report app running: http://localhost:${port}`);
    console.log(`[env] cwd=${process.cwd()}`);
    console.log(`[env] OPENAI_API_KEY ${present ? 'detected' : 'missing'}`);
  });

  server.on('error', (err) => {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
      console.error(`[ERROR] Port ${port} is already in use.`);
      console.error(
        '[FIX] Stop the other process using this port, or start with a different port (PowerShell: $env:PORT="3001"; npm start).',
      );
      process.exit(1);
    }
    console.error('[ERROR] Server failed to start:', err);
    process.exit(1);
  });
}

export default app;


