import { useCallback, useState } from 'react';
import { router, useFocusEffect, type Href } from 'expo-router';
import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { bookmarkMistakeItem, clearMistakes, getMistakeQuestions, removeMistake, startMistakePractice } from '@/services/database/exam-repository';
import type { PracticeQuestion } from '@/types/exam';

export default function MistakeNotebookScreen() { const [questions, setQuestions] = useState<PracticeQuestion[]>(); const [busy, setBusy] = useState(false); const load = useCallback(async () => setQuestions(await getMistakeQuestions()), []); useFocusEffect(useCallback(() => { void load(); }, [load])); const remove = async (id: string) => { await removeMistake(id); await load(); }; const review = async () => { if (!questions?.length) return; setBusy(true); try { const session = await startMistakePractice(); router.push(`/exams/${encodeURIComponent(session.id)}` as Href); } finally { setBusy(false); } }; if (!questions) return <ScreenContainer scroll={false}><LoadingState label="Opening your mistakes…" /></ScreenContainer>; return <ScreenContainer><PageHeader eyebrow="Review notebook" title="Mistakes" subtitle="Incorrect answers stay here until you remove them." />{questions.length ? <><AppButton label="Review mistakes" loading={busy} onPress={() => void review()} /><AppButton label="Clear all mistakes" variant="quiet" loading={busy} onPress={() => void clearMistakes().then(load)} />{questions.map((question) => <Card key={question.id}><ThemedText type="smallBold">{question.domain.toUpperCase()}</ThemedText><ThemedText type="heading">{question.prompt}</ThemedText><AppButton label="Open lesson" variant="secondary" onPress={() => router.push(`/${question.domain}/${encodeURIComponent(question.itemId)}` as Href)} /><AppButton label="Bookmark mistake" variant="quiet" onPress={() => void bookmarkMistakeItem(question)} /><AppButton label="Remove" variant="quiet" onPress={() => void remove(question.id)} /></Card>)}</> : <EmptyState title="No saved mistakes" message="Incorrect practice and exam answers will appear here." />}</ScreenContainer>; }
