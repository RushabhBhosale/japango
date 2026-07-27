import { useRef, useState } from 'react';
import { View } from 'react-native';

import { askAiTeacher } from '@/features/ai/teacher-service';
import type { AiFeature, AiLessonContext, AiRequestState, AiTeacherResult } from '@/types/ai';

import { AppButton } from '../common/app-button';
import { Card } from '../common/card';
import { ThemedText } from '../themed-text';

interface Props { feature: AiFeature; context: AiLessonContext; label?: string; moreExamples?: boolean; userInput?: string; }
export function AiTeacherCard({ feature, context, label = 'Explain with AI', moreExamples = false, userInput }: Props) {
  const [state, setState] = useState<AiRequestState>('idle'); const [result, setResult] = useState<AiTeacherResult>(); const controller = useRef<AbortController | undefined>(undefined);
  const request = async (requestedFeature = feature) => { controller.current?.abort(); const next = new AbortController(); controller.current = next; setState('generating'); try { const response = await askAiTeacher(requestedFeature, context, userInput, next.signal); setResult(response); setState(response.source === 'fallback' ? 'offline_fallback' : 'completed'); } catch { setState(next.signal.aborted ? 'cancelled' : 'failed'); } };
  return <Card><ThemedText type="smallBold" themeColor="primary">JAPANGO AI TEACHER</ThemedText><ThemedText themeColor="textSecondary">AI adds clarification; your installed lesson remains the source of truth.</ThemedText>{result ? <View><ThemedText>{result.response.answer}</ThemedText>{result.response.japaneseExamples?.map((example) => <View key={`${example.japanese}-${example.translation}`}><ThemedText type="japanese">{example.japanese}</ThemedText>{example.reading ? <ThemedText themeColor="textSecondary">{example.reading}</ThemedText> : null}<ThemedText>{example.translation}</ThemedText></View>)}{result.source === 'fallback' ? <ThemedText type="small" themeColor="textSecondary">Built-in lesson fallback</ThemedText> : null}</View> : null}{state === 'generating' ? <><ThemedText accessibilityLiveRegion="polite">Preparing a concise explanation…</ThemedText><AppButton label="Cancel" variant="quiet" onPress={() => controller.current?.abort()} /></> : <><AppButton label={state === 'failed' ? 'Try AI again' : label} variant="secondary" onPress={() => void request()} />{moreExamples ? <AppButton label="More examples" variant="quiet" onPress={() => void request('generate_examples')} /> : null}</>}</Card>;
}
