import { describe, expect, it } from 'vitest';

import { parseGooglePracticeDocument, parsePracticeLogText } from './parser';

const entry = `# Session: 2026-08-16

ID: SESSION_20260816_001

USER:
昨日友達と映画を見ます。

ASSISTANT:
「見ます」より「見ました」が自然です。

USER:
そのあとレストランに行きました。

ASSISTANT:
いいですね。何を食べましたか？

\`\`\`json
{
  "mistakes": [{
    "original": "昨日友達と映画を見ます",
    "corrected": "昨日友達と映画を見ました",
    "type": "grammar",
    "point": "past tense"
  }],
  "newVocabulary": [],
  "kanjiUsed": [],
  "topics": ["movies"]
}
\`\`\``;

describe('ChatGPT practice log parser', () => {
  it('parses messages and optional structured metadata', () => {
    const [session] = parsePracticeLogText(entry, 20);

    expect(session).toMatchObject({
      id: 'SESSION_20260816_001',
      practicedAt: '2026-08-16',
      startIndex: 20,
    });
    expect(session?.messages).toHaveLength(4);
    expect(session?.metadata?.mistakes[0]?.point).toBe('past tense');
    expect(session?.metadata?.topics).toEqual(['movies']);
  });

  it('does not depend on JSON metadata', () => {
    const [session] = parsePracticeLogText(`# Session: 2026-08-17\nID: S2\nUSER:\n日本語を勉強します。\nASSISTANT:\nいいですね。`);

    expect(session?.id).toBe('S2');
    expect(session?.metadata).toBeUndefined();
    expect(session?.messages.map(({ role }) => role)).toEqual(['user', 'assistant']);
  });

  it('reads only structural content after the saved document position', () => {
    const old = '# Session: 2026-08-15\nID: S1\nUSER:\n古い\nASSISTANT:\nはい\n';
    const document = {
      documentId: 'doc-1',
      title: 'JapanGo Practice Log',
      body: { content: [
        { paragraph: { elements: [{ startIndex: 1, endIndex: old.length + 1, textRun: { content: old } }] } },
        { paragraph: { elements: [{ startIndex: old.length + 1, endIndex: old.length + entry.length + 1, textRun: { content: entry } }] } },
      ] },
    };

    expect(parseGooglePracticeDocument(document, old.length).map(({ id }) => id)).toEqual(['SESSION_20260816_001']);
  });

  it('rejects incomplete sessions instead of advancing them', () => {
    expect(parsePracticeLogText('# Session: 2026-08-18\nID: S3\nUSER:\nまだ書いています')).toEqual([]);
  });
});
