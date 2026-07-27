import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
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
import { getReadingById, startContentSession, toggleContentBookmark } from '@/services/database/content-learning-repository';
import type { ReadingLesson } from '@/types/content-learning';

export default function ReadingLessonScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [lesson, setLesson] = useState<ReadingLesson>(); const [loading, setLoading] = useState(true); const [showReading, setShowReading] = useState(false); const [showTranslation, setShowTranslation] = useState(false); const [largeText, setLargeText] = useState(false); const [saving, setSaving] = useState(false); const [failed, setFailed] = useState(false);
  const load = useCallback(async () => { try { setLesson(id ? await getReadingById(id) : undefined); } catch { setFailed(true); } finally { setLoading(false); } }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const bookmark = async () => { if (!lesson) return; setSaving(true); try { const bookmarked = await toggleContentBookmark(lesson.id); setLesson((current) => current ? { ...current, bookmarked } : current); } catch { setFailed(true); } finally { setSaving(false); } };
  const practise = async () => { if (!lesson) return; setSaving(true); try { const session = await startContentSession(lesson.id, 'reading'); router.push(`/practice/${encodeURIComponent(session.id)}` as Href); } catch { setFailed(true); } finally { setSaving(false); } };
  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening reading…" /></ScreenContainer>;
  if (!lesson || failed) return <ScreenContainer><EmptyState title="Reading unavailable" message="No installed reading lesson with this ID is available." /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn')} /></ScreenContainer>;
  return <ScreenContainer>
    <PageHeader eyebrow={`${lesson.level} reading · ${lesson.estimatedReadingSeconds}s`} title={lesson.title} subtitle={`Difficulty ${lesson.difficultyRank} of 5`} />
    <Card><StatusBadge status={lesson.mastery.status} /><JapaneseSpeechButton text={lesson.japanese} label="Play passage" rate={0.72} /><AppButton label={largeText ? 'Use regular text' : 'Increase text size'} variant="quiet" onPress={() => setLargeText((current) => !current)} /><AppButton label={lesson.bookmarked ? 'Remove bookmark' : 'Bookmark reading'} variant="quiet" loading={saving} onPress={() => void bookmark()} /></Card>
    <Card><ThemedText type="japanese" style={largeText ? styles.largeJapanese : undefined}>{lesson.japanese}</ThemedText>{showReading ? <ThemedText themeColor="textSecondary">{lesson.readingText}</ThemedText> : null}{showTranslation ? <ThemedText>{lesson.translation}</ThemedText> : null}<AppButton label={showReading ? 'Hide reading aid' : 'Show reading aid'} variant="secondary" onPress={() => setShowReading((current) => !current)} /><AppButton label={showTranslation ? 'Hide translation' : 'Reveal translation'} variant="secondary" onPress={() => setShowTranslation((current) => !current)} /></Card>
    {lesson.linkedVocabulary.length ? <><SectionHeading title="Words in this passage" />{lesson.linkedVocabulary.map((item) => <AppButton key={item.id} label={`${item.title} · ${item.meaning ?? ''}`} variant="secondary" onPress={() => router.push(`/vocabulary/${encodeURIComponent(item.id)}` as Href)} />)}</> : null}
    {lesson.linkedGrammar.length ? <><SectionHeading title="Grammar in this passage" />{lesson.linkedGrammar.map((item) => <AppButton key={item.id} label={`${item.title} · ${item.meaning ?? ''}`} variant="secondary" onPress={() => router.push(`/grammar/${encodeURIComponent(item.id)}` as Href)} />)}</> : null}
    <AiTeacherCard feature="reading_coach" label="Coach me through this reading" context={{ learnerLevel: lesson.level, item: { id: lesson.id, type: 'reading', title: lesson.title, details: [lesson.japanese, lesson.translation, ...lesson.linkedGrammar.map((item) => item.title)].slice(0, 6) } }} />
    <SectionHeading title="Comprehension" detail={`${lesson.questionCount} questions`} /><AppButton label="Answer comprehension questions" loading={saving} onPress={() => void practise()} />
  </ScreenContainer>;
}

const styles = StyleSheet.create({ largeJapanese: { fontSize: 25, lineHeight: 40 } });
