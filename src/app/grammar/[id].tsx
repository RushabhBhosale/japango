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
import { getGrammarById, startContentSession, toggleContentBookmark } from '@/services/database/content-learning-repository';
import type { GrammarLesson } from '@/types/content-learning';

export default function GrammarLessonScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [lesson, setLesson] = useState<GrammarLesson>(); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [failed, setFailed] = useState(false);
  const load = useCallback(async () => { try { setLesson(id ? await getGrammarById(id) : undefined); } catch { setFailed(true); } finally { setLoading(false); } }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const toggleBookmark = async () => { if (!lesson) return; setSaving(true); try { const bookmarked = await toggleContentBookmark(lesson.id); setLesson((current) => current ? { ...current, bookmarked } : current); } catch { setFailed(true); } finally { setSaving(false); } };
  const practise = async () => { if (!lesson) return; setSaving(true); try { const session = await startContentSession(lesson.id, 'grammar'); router.push(`/practice/${encodeURIComponent(session.id)}` as Href); } catch { setFailed(true); } finally { setSaving(false); } };
  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening grammar…" /></ScreenContainer>;
  if (!lesson || failed) return <ScreenContainer><EmptyState title="Grammar is unavailable" message="This release item could not be opened." symbol="!" /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn')} /></ScreenContainer>;
  return <ScreenContainer>
    <PageHeader eyebrow={`${lesson.level} grammar`} title={lesson.title} subtitle={lesson.meanings.join('; ')} />
    <Card><StatusBadge status={lesson.mastery.status} /><JapaneseSpeechButton text={lesson.title} label="Play pattern" /><AppButton label={lesson.bookmarked ? 'Remove bookmark' : 'Bookmark grammar'} variant="quiet" loading={saving} onPress={() => void toggleBookmark()} /></Card>
    <SectionHeading title="Formation" />
    <Card>{lesson.formation.length ? lesson.formation.map((part) => <ThemedText key={`${part.base}-${part.structure}`}>{part.base}: {part.structure}</ThemedText>) : <ThemedText themeColor="textSecondary">Canonical formation guidance is not available for this pattern yet.</ThemedText>}</Card>
    {lesson.notes ? <><SectionHeading title="Usage note" /><Card><ThemedText>{lesson.notes}</ThemedText></Card></> : null}
    {lesson.examples.length ? <><SectionHeading title="Examples" />{lesson.examples.map((example) => <Card key={example.id}><ThemedText type="japanese">{example.japanese}</ThemedText><ThemedText themeColor="textSecondary">{example.reading}</ThemedText><ThemedText>{example.meaning}</ThemedText><JapaneseSpeechButton text={example.japanese} label="Play example" rate={0.76} /></Card>)}</> : null}
    {lesson.relatedGrammar.length ? <><SectionHeading title="Related grammar" />{lesson.relatedGrammar.map((item) => <AppButton key={item.id} label={`${item.title} · ${item.meaning ?? ''}`} variant="secondary" onPress={() => router.push(`/grammar/${encodeURIComponent(item.id)}` as Href)} />)}</> : null}
    <AiTeacherCard feature="explain_grammar" label="Explain this grammar" moreExamples context={{ learnerLevel: lesson.level, item: { id: lesson.id, type: 'grammar', title: lesson.title, meaning: lesson.meanings.join('; '), details: [...lesson.formation.map((part) => `${part.base}: ${part.structure}`), lesson.notes ?? ''].filter(Boolean) } }} />
    <SectionHeading title="Practise" detail={`${lesson.questionCount} questions`} />
    <AppButton label="Start grammar practice" loading={saving} disabled={!lesson.questionCount} onPress={() => void practise()} />
  </ScreenContainer>;
}
