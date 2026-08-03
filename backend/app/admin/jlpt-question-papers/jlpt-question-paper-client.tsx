'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Paper { id: string; level: string; edition?: string; status: string; source_path_prefix: string; }
interface Pattern { id: string; level: string; section: string; type: string; confidence: number; status: string; }

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json() as { success?: boolean; data?: unknown; error?: { message?: string } };
  if (!response.ok || !body.success) throw new Error(body.error?.message ?? 'Question-paper request failed.');
  return body.data;
}

export function JlptQuestionPaperClient() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const data = await api('/api/admin/jlpt/question-papers') as { papers: Paper[]; patterns: Pattern[]; sourceQuestions: unknown[] };
      setPapers(data.papers); setPatterns(data.patterns); setMessage(`${data.sourceQuestions.length} private source chunks available for review.`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to load question-paper tools.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const action = async (actionName: 'import' | 'extract-patterns') => {
    try { await api('/api/admin/jlpt/question-papers', { method: 'POST', body: JSON.stringify({ action: actionName }) }); await load(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Action failed.'); }
  };
  return <main>
    <p><Link href="/admin">← Management home</Link></p>
    <h1>JLPT question-paper analysis</h1>
    <p><strong>Private analysis only.</strong> Raw OCR is never republished as app questions. Correct OCR transcription is stored separately from source files.</p>
    <p role="status">{message}</p>
    <p><button onClick={() => void action('import')}>Import ingested source chunks</button> <button onClick={() => void action('extract-patterns')}>Extract reviewable patterns</button></p>
    <h2>Sources</h2><ul>{papers.map((paper) => <li key={paper.id}>{paper.level} {paper.edition} · {paper.status} · <code>{paper.source_path_prefix}</code></li>)}</ul>
    <h2>Patterns awaiting approval</h2><ul>{patterns.map((pattern) => <li key={pattern.id}>{pattern.level} · {pattern.section} · {pattern.type} · {pattern.status} · confidence {pattern.confidence}</li>)}</ul>
  </main>;
}
