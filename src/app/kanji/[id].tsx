import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { StatusBadge } from '@/components/common/status-badge';
import { JapaneseSpeechButton } from '@/components/lesson/japanese-speech-button';
import { AiTeacherCard } from '@/components/lesson/ai-teacher-card';
import { ThemedText } from '@/components/themed-text';
import { getKanjiById, startContentSession, toggleContentBookmark } from '@/services/database/content-learning-repository';
import type { KanjiLesson } from '@/types/content-learning';

export default function KanjiLessonScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [lesson, setLesson] = useState<KanjiLesson>(); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [failed, setFailed] = useState(false);
  const load = useCallback(async () => { try { setLesson(id ? await getKanjiById(id) : undefined); } catch { setFailed(true); } finally { setLoading(false); } }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const bookmark = async () => { if (!lesson) return; setSaving(true); try { const bookmarked = await toggleContentBookmark(lesson.id); setLesson((current) => current ? { ...current, bookmarked } : current); } catch { setFailed(true); } finally { setSaving(false); } };
  const practise = async () => { if (!lesson) return; setSaving(true); try { const session = await startContentSession(lesson.id, 'kanji'); router.push(`/practice/${encodeURIComponent(session.id)}` as Href); } catch { setFailed(true); } finally { setSaving(false); } };
  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening kanji…" /></ScreenContainer>;
  if (!lesson || failed) return <ScreenContainer><EmptyState title="Kanji is unavailable" message="This release item could not be opened." symbol="!" /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn')} /></ScreenContainer>;
  return <ScreenContainer>
    <PageHeader eyebrow={`${lesson.level} kanji`} title={lesson.title} subtitle={lesson.meanings.join('; ')} />
    <Card><StatusBadge status={lesson.mastery.status} /><ThemedText>On: {lesson.onReadings.join(' · ') || '—'}</ThemedText><ThemedText>Kun: {lesson.kunReadings.join(' · ') || '—'}</ThemedText>{lesson.strokeCount ? <ThemedText>Strokes: {lesson.strokeCount}</ThemedText> : null}<AppButton label={lesson.bookmarked ? 'Remove bookmark' : 'Bookmark kanji'} variant="quiet" loading={saving} onPress={() => void bookmark()} /></Card>
    {lesson.linkedVocabulary.length ? <><SectionHeading title="Vocabulary" />{lesson.linkedVocabulary.map((item) => <Card key={item.id}><ThemedText type="japanese">{item.title}</ThemedText><ThemedText>{item.meaning}</ThemedText><JapaneseSpeechButton text={item.title} label="Play word" /><AppButton label="Open vocabulary" variant="quiet" onPress={() => router.push(`/vocabulary/${encodeURIComponent(item.id)}` as Href)} /></Card>)}</> : null}
    {lesson.examples.length ? <><SectionHeading title="Examples" />{lesson.examples.map((example) => <Card key={example.id}><ThemedText type="japanese">{example.japanese}</ThemedText><ThemedText themeColor="textSecondary">{example.reading}</ThemedText><ThemedText>{example.meaning}</ThemedText></Card>)}</> : null}
    {lesson.relatedKanji.length ? <><SectionHeading title="Related kanji" />{lesson.relatedKanji.map((item) => <AppButton key={item.id} label={`${item.title} · ${item.meaning ?? ''}`} variant="secondary" onPress={() => router.push(`/kanji/${encodeURIComponent(item.id)}` as Href)} />)}</> : null}
    <AiTeacherCard feature="explain_kanji" label="Explain this kanji" moreExamples context={{ learnerLevel: lesson.level, item: { id: lesson.id, type: 'kanji', title: lesson.title, meaning: lesson.meanings.join('; '), details: [`On: ${lesson.onReadings.join(' · ')}`, `Kun: ${lesson.kunReadings.join(' · ')}`, ...lesson.components] } }} />
    <SectionHeading title="Practise" detail={`${lesson.questionCount} questions`} /><AppButton label="Start kanji practice" loading={saving} disabled={!lesson.questionCount} onPress={() => void practise()} />
  </ScreenContainer>;
}
