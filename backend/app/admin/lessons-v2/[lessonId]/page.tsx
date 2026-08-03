import { LessonsV2EditorClient } from './lessons-v2-editor-client';

export default async function LessonsV2EditorPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  return <LessonsV2EditorClient lessonId={lessonId} />;
}
