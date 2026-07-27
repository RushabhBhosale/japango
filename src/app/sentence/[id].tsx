import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { JapaneseSpeechButton } from '@/components/lesson/japanese-speech-button';
import { ThemedText } from '@/components/themed-text';
import { getSentenceById } from '@/services/database/content-learning-repository';
import type { ContentSentence } from '@/types/content-learning';
export default function SentenceScreen() { const { id } = useLocalSearchParams<{ id?: string }>(); const [sentence, setSentence] = useState<ContentSentence>(); const [loading, setLoading] = useState(true); const load = useCallback(async () => { try { setSentence(id ? await getSentenceById(id) : undefined); } finally { setLoading(false); } }, [id]); useFocusEffect(useCallback(() => { void load(); }, [load])); if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening sentence…" /></ScreenContainer>; if (!sentence) return <ScreenContainer><EmptyState title="Sentence unavailable" message="This sentence is not in the installed curriculum." /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn')} /></ScreenContainer>; return <ScreenContainer><PageHeader eyebrow="Example sentence" title="In context" /><Card><ThemedText type="japanese">{sentence.japanese}</ThemedText><ThemedText themeColor="textSecondary">{sentence.reading}</ThemedText><ThemedText>{sentence.meaning}</ThemedText><JapaneseSpeechButton text={sentence.japanese} label="Play sentence" /></Card></ScreenContainer>; }
