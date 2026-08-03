'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Props { lessonId: string; }

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json() as { success?: boolean; data?: unknown; error?: { message?: string } };
  if (!response.ok || !body.success) throw new Error(body.error?.message ?? 'Editor request failed.');
  return body.data;
}

export function LessonsV2EditorClient({ lessonId }: Props) {
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('Loading draft…');
  useEffect(() => { void (async () => {
    try {
      const data = await api(`/api/admin/lessons-v2/${lessonId}`) as { lesson: unknown };
      setValue(JSON.stringify(data.lesson, null, 2));
      setMessage('Edit only draft/review content. Published versions are immutable.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to load draft.'); }
  })(); }, [lessonId]);
  const save = async () => {
    try {
      const parsed = JSON.parse(value) as { title?: string; objectives?: string[]; estimatedMinutes?: number; sections?: unknown; sourceReferences?: unknown; status?: string };
      await api(`/api/admin/lessons-v2/${lessonId}`, { method: 'PATCH', body: JSON.stringify({ title: parsed.title, objectives: parsed.objectives, estimatedMinutes: parsed.estimatedMinutes, sections: parsed.sections, sourceReferences: parsed.sourceReferences, status: parsed.status }) });
      setMessage('Draft saved. Validate before publishing.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Invalid JSON.'); }
  };
  return <main>
    <p><Link href="/admin/lessons-v2">← Lessons</Link></p>
    <h1>Lessons V2 draft editor</h1>
    <p><strong>Local development only.</strong> Token fixes and source references must be reviewed manually.</p>
    <p role="status">{message}</p>
    <textarea aria-label="Lesson V2 JSON editor" value={value} onChange={(event) => setValue(event.target.value)} style={{ boxSizing: 'border-box', fontFamily: 'ui-monospace, monospace', height: 600, width: '100%' }} />
    <p><button onClick={() => void save()}>Save draft</button></p>
  </main>;
}
