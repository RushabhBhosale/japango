import { useCallback, useState } from 'react';
import { router, useFocusEffect, type Href } from 'expo-router';
import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { getExamHistory } from '@/services/database/exam-repository';
import type { ExamHistoryItem } from '@/types/exam';

export default function ExamHistoryScreen() { const [history, setHistory] = useState<ExamHistoryItem[]>(); const load = useCallback(async () => setHistory(await getExamHistory()), []); useFocusEffect(useCallback(() => { void load(); }, [load])); if (!history) return <ScreenContainer scroll={false}><LoadingState label="Loading exam history…" /></ScreenContainer>; return <ScreenContainer><PageHeader eyebrow="Saved locally" title="Exam history" subtitle="Reopen any previous mock or section session." />{history.length ? history.map((exam) => <Card key={exam.id}><ThemedText type="heading">{exam.level} · {exam.kind.replaceAll('-', ' ')}</ThemedText><ThemedText themeColor="textSecondary">{exam.percentage ?? '—'}% · {exam.questionCount} questions · {Math.floor(exam.elapsedSeconds / 60)} min · {exam.status}</ThemedText><AppButton label={exam.status === 'completed' || exam.status === 'time-expired' ? 'Open results' : 'Resume'} variant="secondary" onPress={() => router.push(`${exam.status === 'completed' || exam.status === 'time-expired' ? '/exams/results?sessionId=' : '/exams/'}${encodeURIComponent(exam.id)}` as Href)} /></Card>) : <EmptyState title="No mock exams yet" message="Your completed mock and section exams will appear here." />}</ScreenContainer>; }
