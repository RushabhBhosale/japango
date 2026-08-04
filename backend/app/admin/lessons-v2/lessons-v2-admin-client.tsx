'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface ManagementLesson { id: string; lessonId: string; title: string; slug: string; level: 'N5' | 'N4'; version: number; status: string; }
interface ContentAudit { scannedLessons: number; scannedGeneratedQuestions: number; scannedTextFields: number; exactDuplicateCount: number; highSimilarityCount: number; repetitivePatternCount: number; issues: Array<{ severity: 'info' | 'warning' | 'critical'; message: string; lessonVersionId: string }>; }

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
  const [contentAudit, setContentAudit] = useState<ContentAudit>();

  const load = useCallback(async () => {
    try {
      const data = await api('/api/admin/lessons-v2') as { lessons: ManagementLesson[] };
      setLessons(data.lessons);
      setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Lessons V2 could not load.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const auditContent = async () => {
    setBusy('content-audit');
    try {
      setContentAudit(await api('/api/admin/lessons-v2/audit') as ContentAudit);
      setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Lessons V2 content audit could not run.'); }
    finally { setBusy(undefined); }
  };

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
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={() => void load()} disabled={Boolean(busy)}>Refresh</button>
      <button onClick={() => void auditContent()} disabled={Boolean(busy)}>Audit all content</button>
    </div>
    {contentAudit ? <section aria-live="polite">
      <p>Scanned {contentAudit.scannedLessons} active lesson snapshots, {contentAudit.scannedGeneratedQuestions} generated questions, and {contentAudit.scannedTextFields} text fields: {contentAudit.exactDuplicateCount} exact duplicates, {contentAudit.highSimilarityCount} high-similarity pairs, and {contentAudit.repetitivePatternCount} review warnings.</p>
      {contentAudit.issues.length ? <ul>{contentAudit.issues.slice(0, 20).map((issue, index) => <li key={`${issue.lessonVersionId}-${index}`}><strong>{issue.severity}</strong>: {issue.message}</li>)}</ul> : <p>No repeated-content findings.</p>}
    </section> : null}
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
