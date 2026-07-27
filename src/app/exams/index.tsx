import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { defaultMockSelection, startPracticeSession } from '@/services/database/exam-repository';
import type { PracticeDomain, PracticeSelection } from '@/types/exam';

const domains: PracticeDomain[] = ['vocabulary', 'grammar', 'kanji', 'reading', 'listening'];
const questionCounts = [10, 20, 30];

export default function ExamsScreen() {
  const theme = useTheme(); const [level, setLevel] = useState<'N5' | 'N4'>('N5'); const [selectedDomains, setSelectedDomains] = useState<PracticeDomain[]>(domains); const [count, setCount] = useState(20); const [timed, setTimed] = useState(false); const [source, setSource] = useState<PracticeSelection['source']>('all'); const [targetInput, setTargetInput] = useState(''); const [tag, setTag] = useState(''); const [loading, setLoading] = useState(false); const [message, setMessage] = useState<string>();
  const toggleDomain = (domain: PracticeDomain) => setSelectedDomains((current) => current.includes(domain) ? current.length === 1 ? current : current.filter((value) => value !== domain) : [...current, domain]);
  const launch = async (selection: PracticeSelection) => { setLoading(true); setMessage(undefined); try { const session = await startPracticeSession(selection); router.push(`/exams/${encodeURIComponent(session.id)}` as Href); } catch (error) { setMessage(error instanceof Error ? error.message : 'Practice could not be started.'); } finally { setLoading(false); } };
  const seed = `${level}-${selectedDomains.join('-')}-${count}-${source}-v1`;
  return <ScreenContainer>
    <PageHeader eyebrow="Offline practice" title="Practice & exams" subtitle="Use only installed, release-ready questions." />
    <SectionHeading title="Mock exam" />
    <Card><ThemedText type="heading">Full JLPT-style mock</ThemedText><ThemedText themeColor="textSecondary">40 balanced questions across vocabulary, grammar, kanji, reading, and listening. Your progress saves automatically.</ThemedText><View style={styles.row}><AppButton label="N5 full mock" loading={loading} onPress={() => void launch(defaultMockSelection('N5'))} /><AppButton label="N4 full mock" variant="secondary" loading={loading} onPress={() => void launch(defaultMockSelection('N4'))} /></View></Card>
    <SectionHeading title="Section practice" />
    <View style={styles.domainGrid}>{domains.map((domain) => <AppButton key={domain} label={`${domain[0].toUpperCase()}${domain.slice(1)}`} variant="secondary" loading={loading} onPress={() => void launch(defaultMockSelection(level, [domain]))} />)}</View>
    <SectionHeading title="Custom practice" detail={level} />
    <Card>
      <View style={styles.choiceRow}>{(['N5', 'N4'] as const).map((value) => <Pressable key={value} onPress={() => setLevel(value)} style={[styles.choice, { borderColor: level === value ? theme.primary : theme.border, backgroundColor: level === value ? theme.primarySoft : theme.surface }]}><ThemedText type="smallBold" style={level === value ? { color: theme.primary } : undefined}>{value}</ThemedText></Pressable>)}</View>
      <ThemedText type="smallBold">Question types</ThemedText><View style={styles.choiceRow}>{domains.map((domain) => <Pressable key={domain} onPress={() => toggleDomain(domain)} style={[styles.choice, { borderColor: selectedDomains.includes(domain) ? theme.primary : theme.border, backgroundColor: selectedDomains.includes(domain) ? theme.primarySoft : theme.surface }]}><ThemedText type="smallBold">{domain}</ThemedText></Pressable>)}</View>
      <ThemedText type="smallBold">Questions</ThemedText><View style={styles.choiceRow}>{questionCounts.map((value) => <Pressable key={value} onPress={() => setCount(value)} style={[styles.choice, { borderColor: count === value ? theme.primary : theme.border, backgroundColor: count === value ? theme.primarySoft : theme.surface }]}><ThemedText type="smallBold">{value}</ThemedText></Pressable>)}</View>
      <ThemedText type="smallBold">Focus</ThemedText><View style={styles.choiceRow}>{(['all', 'weak', 'bookmarked', 'incorrect', 'due', 'new', 'mastered'] as const).map((value) => <Pressable key={value} onPress={() => setSource(value)} style={[styles.choice, { borderColor: source === value ? theme.primary : theme.border, backgroundColor: source === value ? theme.primarySoft : theme.surface }]}><ThemedText type="smallBold">{value}</ThemedText></Pressable>)}</View>
      <TextInput value={targetInput} onChangeText={setTargetInput} placeholder="Optional grammar, kanji, or vocabulary item IDs (comma separated)" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
      <TextInput value={tag} onChangeText={setTag} placeholder="Optional vocabulary tag" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
      <AppButton label={timed ? 'Timed: 1 min/question' : 'Untimed'} variant="quiet" onPress={() => setTimed((value) => !value)} />
      <AppButton label="Start custom practice" loading={loading} onPress={() => void launch({ kind: 'practice', level, domains: selectedDomains, questionCount: count, timerMode: timed ? 'countdown' : 'none', timeLimitSeconds: timed ? count * 60 : undefined, source, seed, targetItemIds: targetInput.trim() ? targetInput.split(',').map((value) => value.trim()).filter(Boolean) : undefined, vocabularyTag: tag.trim() || undefined })} />
    </Card>
    {message ? <ThemedText themeColor="textSecondary">{message}</ThemedText> : null}
    <AppButton label="Exam history" variant="quiet" onPress={() => router.push('/exams/history' as Href)} /><AppButton label="Mistake notebook" variant="quiet" onPress={() => router.push('/exams/mistakes' as Href)} />
  </ScreenContainer>;
}
const styles = StyleSheet.create({ row: { gap: Spacing.two }, domainGrid: { gap: Spacing.two }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one }, choice: { minHeight: 42, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 10, justifyContent: 'center' }, input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: 12 } });
