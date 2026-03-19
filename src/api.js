export async function apiGenerate(payload) {
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

export async function apiGenerateBatch(payload) {
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

export async function apiEdit({ text, instruction }) {
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

export async function apiTranscribe(audioBlob, ext) {
  const formData = new FormData();
  formData.append('audio', audioBlob, `recording.${ext}`);
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Transcription failed (${res.status})`);
  if (!data?.text) throw new Error('Empty transcription result');
  return data.text;
}

export async function apiGenerateFromTranscript(payload) {
  const res = await fetch('/api/generate-from-transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  if (!data?.text) throw new Error('No text returned');
  return data.text;
}
