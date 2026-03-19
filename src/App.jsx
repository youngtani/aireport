import React, { useState, useCallback, useEffect } from 'react';
import VoiceRecorder from './components/VoiceRecorder';
import PhraseWordEditor from './components/PhraseWordEditor';
import EditChat from './components/EditChat';
import StudentManager from './components/StudentManager';
import HistoryPanel from './components/HistoryPanel';
import {
  getStudents, setStudents as saveStudents,
  ensureProfile, saveProfile, deleteProfile,
  getHistory, addHistory, clearHistory,
} from './storage';
import { apiGenerate, apiGenerateFromTranscript } from './api';

function nowKST() {
  return new Date().toLocaleString('ko-KR', { hour12: false });
}

export default function App() {
  // Students
  const [students, setStudentsState] = useState(getStudents);
  const [selectedStudent, setSelectedStudent] = useState(() => getStudents()[0] || '');
  const [showStudentMgr, setShowStudentMgr] = useState(false);

  // Profile-driven state
  const [profile, setProfile] = useState(() => ensureProfile(getStudents()[0] || ''));

  // Form
  const [bookTitle, setBookTitle] = useState(profile?.form?.bookTitle || '');
  const [pagesOrChapter, setPagesOrChapter] = useState(profile?.form?.pagesOrChapter || '');
  const [tutorNotes, setTutorNotes] = useState(profile?.form?.tutorNotes || '');
  const [tone, setTone] = useState(profile?.form?.tone || '따뜻하고 긍정적');
  const [length, setLength] = useState(profile?.form?.length || '짧게(4~6문장)');
  const [transcript, setTranscript] = useState('');

  // Output
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState({ text: '', kind: '' });
  const [generating, setGenerating] = useState(false);

  // History
  const [history, setHistory] = useState(getHistory);

  // Phrases/words from profile
  const phrases = profile?.phrases || [];
  const words = profile?.words || [];
  const selectedPhrases = profile?.selectedPhrases || [];
  const selectedWords = profile?.selectedWords || [];

  const refreshStudents = () => {
    const s = getStudents();
    setStudentsState(s);
    return s;
  };

  const switchStudent = useCallback((name) => {
    // Save current student form
    if (selectedStudent) {
      saveProfile(selectedStudent, {
        form: { bookTitle, pagesOrChapter, tutorNotes, tone, length },
      });
    }
    setSelectedStudent(name);
    const p = ensureProfile(name);
    setProfile({ ...p });
    setBookTitle(p?.form?.bookTitle || '');
    setPagesOrChapter(p?.form?.pagesOrChapter || '');
    setTutorNotes(p?.form?.tutorNotes || '');
    setTone(p?.form?.tone || '따뜻하고 긍정적');
    setLength(p?.form?.length || '짧게(4~6문장)');
  }, [selectedStudent, bookTitle, pagesOrChapter, tutorNotes, tone, length]);

  // Save form on change
  useEffect(() => {
    if (!selectedStudent) return;
    const t = setTimeout(() => {
      saveProfile(selectedStudent, {
        form: { bookTitle, pagesOrChapter, tutorNotes, tone, length },
      });
    }, 300);
    return () => clearTimeout(t);
  }, [selectedStudent, bookTitle, pagesOrChapter, tutorNotes, tone, length]);

  const updateProfile = (patch) => {
    saveProfile(selectedStudent, patch);
    setProfile({ ...ensureProfile(selectedStudent) });
  };

  // Phrase/word handlers
  const togglePhrase = (text) => {
    const sp = selectedPhrases.includes(text)
      ? selectedPhrases.filter((x) => x !== text)
      : [...selectedPhrases, text];
    updateProfile({ selectedPhrases: sp });
  };

  const toggleWord = (w) => {
    const sw = selectedWords.includes(w)
      ? selectedWords.filter((x) => x !== w)
      : [...selectedWords, w];
    updateProfile({ selectedWords: sw });
  };

  const removePhrase = (text) => {
    updateProfile({
      phrases: phrases.filter((x) => x !== text),
      selectedPhrases: selectedPhrases.filter((x) => x !== text),
    });
  };

  const removeWord = (w) => {
    updateProfile({
      words: words.filter((x) => x !== w),
      selectedWords: selectedWords.filter((x) => x !== w),
    });
  };

  const addPhrase = (text) => {
    updateProfile({
      phrases: [...phrases, text],
      selectedPhrases: [...selectedPhrases, text],
    });
  };

  const addWord = (w) => {
    updateProfile({
      words: [...words, w],
      selectedWords: [...selectedWords, w],
    });
  };

  // Student management
  const handleAddStudent = (name) => {
    const next = [...new Set([...students, name.trim()])].filter(Boolean);
    saveStudents(next);
    refreshStudents();
    ensureProfile(name.trim());
  };

  const handleDeleteStudent = (name) => {
    const next = students.filter((s) => s !== name);
    saveStudents(next);
    deleteProfile(name);
    const s = refreshStudents();
    if (selectedStudent === name) switchStudent(s[0] || '');
  };

  // Generate report (standard mode - from phrases/words)
  const handleGenerate = async () => {
    if (!selectedStudent) return setStatus({ text: '학생을 선택해 주세요.', kind: 'bad' });
    if (!bookTitle.trim()) return setStatus({ text: '책 제목을 입력해 주세요.', kind: 'bad' });

    setGenerating(true);
    setStatus({ text: '생성 중…', kind: '' });
    try {
      const text = await apiGenerate({
        studentName: selectedStudent,
        bookTitle,
        pagesOrChapter,
        selectedPhrases,
        selectedWords,
        tutorNotes,
        tone,
        length,
      });
      setOutput(text);
      const item = { studentName: selectedStudent, bookTitle, pagesOrChapter, tutorNotes, tone, length, text, time: nowKST() };
      addHistory(item);
      setHistory(getHistory());
      setStatus({ text: '완료! 아래 결과를 복사해서 보내면 됩니다.', kind: 'good' });
    } catch (err) {
      setStatus({ text: err?.message || '생성에 실패했습니다.', kind: 'bad' });
    } finally {
      setGenerating(false);
    }
  };

  // Generate from transcript
  const handleGenerateFromTranscript = async () => {
    if (!selectedStudent) return setStatus({ text: '학생을 선택해 주세요.', kind: 'bad' });
    if (!transcript.trim()) return setStatus({ text: '녹취록이 비어 있습니다.', kind: 'bad' });

    setGenerating(true);
    setStatus({ text: '녹취록에서 리포트 생성 중…', kind: '' });
    try {
      const text = await apiGenerateFromTranscript({
        studentName: selectedStudent,
        bookTitle,
        transcript,
        additionalNotes: tutorNotes,
        tone,
        length,
      });
      setOutput(text);
      const item = {
        studentName: selectedStudent,
        bookTitle: bookTitle || '(녹취록)',
        pagesOrChapter,
        tutorNotes: `[녹취록 기반] ${tutorNotes.substring(0, 100)}`,
        tone, length, text, time: nowKST(),
      };
      addHistory(item);
      setHistory(getHistory());
      setStatus({ text: '녹취록 기반 리포트 생성 완료!', kind: 'good' });
    } catch (err) {
      setStatus({ text: err?.message || '리포트 생성에 실패했습니다.', kind: 'bad' });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (text) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setStatus({ text: '복사했습니다.', kind: 'good' });
  };

  const handleReset = () => {
    setBookTitle('');
    setPagesOrChapter('');
    setTutorNotes('');
    setTranscript('');
    setOutput('');
    setStatus({ text: '', kind: '' });
  };

  const handleLoadHistory = (it) => {
    setSelectedStudent(it.studentName);
    const p = ensureProfile(it.studentName);
    setProfile({ ...p });
    setBookTitle(it.bookTitle || '');
    setPagesOrChapter(it.pagesOrChapter || '');
    setTone(it.tone || tone);
    setLength(it.length || length);
    setTutorNotes(it.tutorNotes || '');
    setOutput(it.text);
    setStatus({ text: '기록을 불러왔습니다.', kind: 'good' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <div className="eyebrow">테스트용</div>
          <h1 className="title">AI 수업 리포트 생성기</h1>
          <p className="subtitle">녹음 &rarr; 자동 변환 &rarr; AI 리포트</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" type="button" onClick={handleReset}>
            초기화
          </button>
        </div>
      </header>

      <main className="grid">
        {/* Column 1: Student info + Recording */}
        <section className="card">
          <div className="card-title">기본 정보</div>

          <div className="field">
            <label className="label">학생</label>
            <div className="row">
              <select
                className="control"
                value={selectedStudent}
                onChange={(e) => switchStudent(e.target.value)}
              >
                {students.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setShowStudentMgr(true)}
              >
                목록 관리
              </button>
            </div>
            <div className="hint">학생 목록은 브라우저에 저장됩니다(로컬 저장).</div>
          </div>

          <div className="field">
            <label className="label">오늘 읽은 책 제목</label>
            <input
              className="control"
              type="text"
              placeholder="예: 앵무새 죽이기"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label">범위(선택)</label>
            <input
              className="control"
              type="text"
              placeholder="예: 3장 / p. 25-40"
              value={pagesOrChapter}
              onChange={(e) => setPagesOrChapter(e.target.value)}
            />
          </div>

          {/* Voice Recording */}
          <VoiceRecorder
            transcript={transcript}
            onTranscriptChange={setTranscript}
          />

          <div className="field">
            <label className="label">톤</label>
            <select className="control" value={tone} onChange={(e) => setTone(e.target.value)}>
              <option value="따뜻하고 긍정적">따뜻하고 긍정적</option>
              <option value="담백하고 간단">담백하고 간단</option>
              <option value="조금 더 격식 있게">조금 더 격식 있게</option>
            </select>
          </div>

          <div className="field">
            <label className="label">길이</label>
            <select className="control" value={length} onChange={(e) => setLength(e.target.value)}>
              <option value="짧게(4~6문장)">짧게(4~6문장)</option>
              <option value="보통(6~9문장)">보통(6~9문장)</option>
              <option value="길게(9~12문장)">길게(9~12문장)</option>
            </select>
          </div>
        </section>

        {/* Column 2: Phrases/words + actions */}
        <section className="card">
          <PhraseWordEditor
            phrases={phrases}
            words={words}
            selectedPhrases={selectedPhrases}
            selectedWords={selectedWords}
            onTogglePhrase={togglePhrase}
            onToggleWord={toggleWord}
            onRemovePhrase={removePhrase}
            onRemoveWord={removeWord}
            onAddPhrase={addPhrase}
            onAddWord={addWord}
          />

          <div className="divider" />

          <div className="field">
            <label className="label">추가 메모(선택)</label>
            <textarea
              className="control textarea"
              placeholder="예: 어려운 단어 5개 복습, 과거시제/관계대명사 설명"
              value={tutorNotes}
              onChange={(e) => setTutorNotes(e.target.value)}
            />
            <div className="hint">여기에 사실 위주로 적으면 더 '맞춤형' 리포트가 됩니다.</div>
          </div>

          <div className="actions">
            <button
              className="btn btn-accent"
              type="button"
              disabled={generating}
              onClick={handleGenerateFromTranscript}
            >
              {generating ? '생성 중...' : '녹취록으로 리포트 생성'}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={generating}
              onClick={handleGenerate}
            >
              Make report
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!output}
              onClick={() => handleCopy(output)}
            >
              복사
            </button>
          </div>

          {status.text && <div className={`status ${status.kind}`}>{status.text}</div>}
        </section>

        {/* Full-width: Results */}
        <section className="card card-wide">
          <div className="card-title">결과</div>
          <textarea
            className="control textarea output"
            placeholder="여기에 리포트가 생성됩니다"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
          />
          <div className="hint">
            필요하면 직접 수정해도 되고, 아래 채팅으로 AI에게 "이렇게 바꿔줘"라고 요청해도 됩니다.
          </div>

          <EditChat output={output} onOutputChange={setOutput} />

          <div className="divider" />

          <HistoryPanel
            history={history}
            onLoad={handleLoadHistory}
            onCopy={(text) => handleCopy(text)}
            onClear={() => {
              clearHistory();
              setHistory([]);
              setStatus({ text: '기록을 삭제했습니다.', kind: 'warn' });
            }}
          />
        </section>
      </main>

      <StudentManager
        open={showStudentMgr}
        onClose={() => setShowStudentMgr(false)}
        students={students}
        onAdd={handleAddStudent}
        onDelete={handleDeleteStudent}
      />
    </div>
  );
}
