import { useState } from 'react';
import { TextInput } from 'react-native';

import { AiTeacherCard } from '@/components/lesson/ai-teacher-card';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { useTheme } from '@/hooks/use-theme';

export default function AiTeacherScreen() { const theme = useTheme(); const [text, setText] = useState(''); return <ScreenContainer><PageHeader eyebrow="Optional teacher" title="JapanGo AI" subtitle="Focused help using your current learning level." /><SectionHeading title="Guided tools" /><AiTeacherCard feature="conversation" label="Start a guided conversation" context={{ learnerLevel: 'N5', item: { id: 'restaurant-roleplay', type: 'conversation', title: 'Restaurant roleplay', details: ['You are the customer. Order a simple meal in up to six turns.'] } }} /><AiTeacherCard feature="study_plan" label="Make my study plan" context={{ learnerLevel: 'N5', item: { id: 'study-plan', type: 'plan', title: 'Today’s study plan' }, deterministicPlan: ['Complete due FSRS reviews first.', 'Then complete one short practice session.'] }} /><SectionHeading title="Check your Japanese" /><TextInput value={text} onChangeText={setText} multiline maxLength={1200} placeholder="Write Japanese here for a focused check" placeholderTextColor={theme.textSecondary} style={{ minHeight: 100, borderWidth: 1, borderColor: theme.border, color: theme.text, padding: 12, borderRadius: 12 }} /><AiTeacherCard feature="writing_check" label="Check my writing" userInput={text} context={{ learnerLevel: 'N5', item: { id: 'writing-check', type: 'writing', title: 'Writing check' } }} /></ScreenContainer>; }
