'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface ManagementLesson { id: string; lessonId: string; title: string; slug: string; level: 'N5' | 'N4'; version: number; status: string; }

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json() as { success?: boolean; data?: unknown; error?: { message?: string } };
  if (!response.ok || !body.success) throw new Error(body.error?.message ?? 'Lessons V2 request failed.');
  return body.data;
}

export function LessonsV2AdminClient() {
  const [lessons, setLessons] = useState<ManagementLesson[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const load = useCallback(async () => {
    try {
      const data = await api('/api/admin/lessons-v2') as { lessons: ManagementLesson[] };
      setLessons(data.lessons);
      setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Lessons V2 could not load.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const action = async (lessonId: string, actionName: 'validate' | 'publish' | 'archive' | 'new-version') => {
    const destructive = actionName === 'publish' || actionName === 'archive' || actionName === 'new-version';
    if (destructive && !window.confirm(`${actionName === 'publish' ? 'Publish' : actionName === 'archive' ? 'Archive' : 'Create a new draft version of'} this lesson? This action is explicit because authentication is disabled.`)) return;
    setBusy(`${lessonId}-${actionName}`);
    try {
      await api(`/api/admin/lessons-v2/${lessonId}/${actionName}`, { method: 'POST', body: destructive ? JSON.stringify({ confirm: true }) : undefined });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Action failed.'); }
    finally { setBusy(undefined); }
  };

  return <main>
    <p><Link href="/admin">← Management home</Link></p>
    <h1>Lessons V2 editor</h1>
    <p><strong>Single-user local-development mode.</strong> Every management API is open while <code>LESSONS_V2_AUTH_MODE=disabled</code>; do not expose this page publicly.</p>
    {error ? <p role="alert" style={{ color: '#a22' }}>{error}</p> : null}
    <button onClick={() => void load()} disabled={Boolean(busy)}>Refresh</button>
    {!lessons.length ? <p>No V2 lesson drafts yet. Create the pilot through the seed command, then validate before publishing.</p> : null}
    <ul>{lessons.map((lesson) => <li key={lesson.id} style={{ margin: '18px 0' }}>
      <strong>{lesson.title}</strong> · {lesson.level} · v{lesson.version} · {lesson.status}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <Link href={`/admin/lessons-v2/${lesson.lessonId}`}>Edit JSON</Link>
        <button onClick={() => void action(lesson.lessonId, 'validate')} disabled={Boolean(busy)}>Validate</button>
        <button onClick={() => void action(lesson.lessonId, 'publish')} disabled={Boolean(busy) || lesson.status === 'published'}>Publish</button>
        <button onClick={() => void action(lesson.lessonId, 'new-version')} disabled={Boolean(busy)}>New version</button>
        <button onClick={() => void action(lesson.lessonId, 'archive')} disabled={Boolean(busy)}>Archive</button>
      </div>
    </li>)}</ul>
  </main>;
}
