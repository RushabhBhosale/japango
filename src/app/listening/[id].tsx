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
import { getListeningById, startContentSession, toggleContentBookmark } from '@/services/database/content-learning-repository';
import type { ListeningLesson } from '@/types/content-learning';

export default function ListeningLessonScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [lesson, setLesson] = useState<ListeningLesson>(); const [loading, setLoading] = useState(true); const [showTranscript, setShowTranscript] = useState(false); const [showTranslation, setShowTranslation] = useState(false); const [saving, setSaving] = useState(false); const [failed, setFailed] = useState(false);
  const load = useCallback(async () => { try { setLesson(id ? await getListeningById(id) : undefined); } catch { setFailed(true); } finally { setLoading(false); } }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const bookmark = async () => { if (!lesson) return; setSaving(true); try { const bookmarked = await toggleContentBookmark(lesson.id); setLesson((current) => current ? { ...current, bookmarked } : current); } catch { setFailed(true); } finally { setSaving(false); } };
  const practise = async () => { if (!lesson) return; setSaving(true); try { const session = await startContentSession(lesson.id, 'listening'); router.push(`/practice/${encodeURIComponent(session.id)}` as Href); } catch { setFailed(true); } finally { setSaving(false); } };
  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening listening…" /></ScreenContainer>;
  if (!lesson || failed) return <ScreenContainer><EmptyState title="Listening unavailable" message="No installed listening lesson with this ID is available." /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn')} /></ScreenContainer>;
  return <ScreenContainer>
    <PageHeader eyebrow={`${lesson.level} listening · ${lesson.estimatedDurationSeconds}s`} title={lesson.title} subtitle="Listen before revealing the transcript." />
    <Card><StatusBadge status={lesson.mastery.status} /><JapaneseSpeechButton text={lesson.speechText} label="Play" rate={0.78} /><JapaneseSpeechButton text={lesson.speechText} label="Play slowly" rate={0.64} /><AppButton label={lesson.bookmarked ? 'Remove bookmark' : 'Bookmark listening'} variant="quiet" loading={saving} onPress={() => void bookmark()} /></Card>
    <SectionHeading title="Questions" detail={`${lesson.questionCount} questions`} /><AppButton label="Start listening questions" loading={saving} onPress={() => void practise()} />
    <AppButton label={showTranscript ? 'Hide transcript' : 'Reveal transcript'} variant="secondary" onPress={() => setShowTranscript((current) => !current)} />
    {showTranscript ? <><Card>{lesson.turns.map((turn) => <Card key={turn.id}><ThemedText type="smallBold">{turn.speakerLabel}</ThemedText><ThemedText type="japanese">{turn.displayText}</ThemedText><JapaneseSpeechButton text={turn.speechText} label="Replay line" rate={0.76} /></Card>)}</Card><AppButton label={showTranslation ? 'Hide translation' : 'Reveal translation'} variant="secondary" onPress={() => setShowTranslation((current) => !current)} />{showTranslation ? <Card><ThemedText>{lesson.translation}</ThemedText></Card> : null}</> : null}
    {showTranscript && lesson.linkedVocabulary.length ? <><SectionHeading title="Words used" />{lesson.linkedVocabulary.map((item) => <AppButton key={item.id} label={`${item.title} · ${item.meaning ?? ''}`} variant="secondary" onPress={() => router.push(`/vocabulary/${encodeURIComponent(item.id)}` as Href)} />)}</> : null}
    {showTranscript && lesson.linkedGrammar.length ? <><SectionHeading title="Grammar used" />{lesson.linkedGrammar.map((item) => <AppButton key={item.id} label={`${item.title} · ${item.meaning ?? ''}`} variant="secondary" onPress={() => router.push(`/grammar/${encodeURIComponent(item.id)}` as Href)} />)}</> : null}
    <AiTeacherCard feature="listening_coach" label="Explain this dialogue" context={{ learnerLevel: lesson.level, item: { id: lesson.id, type: 'listening', title: lesson.title, details: [lesson.transcript, lesson.translation, ...lesson.linkedGrammar.map((item) => item.title)].slice(0, 6) } }} />
  </ScreenContainer>;
}
