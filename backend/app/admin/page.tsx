import Link from 'next/link';

export default function LessonsV2AdminIndex() {
  return <main>
    <h1>Lessons V2 management</h1>
    <p><strong>Local-development warning:</strong> authentication is disabled. Do not deploy this console publicly.</p>
    <ul>
      <li><Link href="/admin/lessons-v2">Lesson versions and publishing</Link></li>
      <li><Link href="/admin/jlpt-question-papers">JLPT question-paper analysis</Link></li>
    </ul>
  </main>;
}
