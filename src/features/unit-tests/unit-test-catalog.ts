import { z } from 'zod';

import { v3Episodes } from '../lesson-v3/episodes';
import type { UnitTest, UnitTestQuestion } from '../../types/unit-test';

const question = (id: string, domain: UnitTestQuestion['domain'], kind: UnitTestQuestion['kind'], prompt: string, choices: string[], correctIndex: number, explanation: string, linkedEpisodeItemIds: string[], extras: Pick<UnitTestQuestion, 'passage' | 'listeningSpeech'> = {}): UnitTestQuestion => ({ id, domain, kind, prompt, ...extras, choices: choices.map((text, index) => ({ id: `${id}-${index + 1}`, text })), correctChoiceId: `${id}-${correctIndex + 1}`, explanation, linkedEpisodeItemIds });

export const firstUnitTest: UnitTest = {
  id: 'unit-n5-01-episodes-1-3', title: 'ユニット 1・はじめての出会い', level: 'N5', episodeIds: ['episode-1', 'episode-2', 'episode-3'], estimatedMinutes: 5,
  questions: [
    question('unit-n5-01-vocab-01', 'vocabulary', 'vocabulary-meaning', '「連絡先」の意味は どれですか。', ['予定', '連絡するための情報', '駅の出口', '飲み物の注文'], 1, '連絡先（れんらくさき）は、電話番号やメールアドレスなど、連絡するための情報です。', ['v3-vocab-renrakusaki']),
    question('unit-n5-01-vocab-02', 'vocabulary', 'vocabulary-context', 'あしたは予定がありません。わたしは（　）です。', ['ひま', 'おそい', 'すくない', 'げんき'], 0, '予定がないときは「ひまです」と言います。', ['v3-vocab-hima', 'v3-vocab-yotei']),
    question('unit-n5-01-kanji-01', 'kanji', 'kanji-reading', '「明日」は どう 読みますか。', ['きのう', 'あした', 'いま', 'まいにち'], 1, '明日は「あした」と読みます。', ['v3-vocab-ashita']),
    question('unit-n5-01-kanji-02', 'kanji', 'choose-kanji', '駅の 東口で 会いましょう。 「ひがしぐち」は どれですか。', ['西口', '出口', '東口', '入口'], 2, '東は「ひがし」、口は「ぐち」です。東口は east exit です。', ['episode-2-vocab-deguchi']),
    question('unit-n5-01-grammar-01', 'grammar', 'grammar-selection', '日本（　）着きました。', ['を', 'に', 'で', 'と'], 1, '着くの到着する場所は「に」で示します。', ['v3-grammar-destination-ni', 'grammar-ni']),
    question('unit-n5-01-grammar-02', 'grammar', 'sentence-completion', 'カフェ（　）コーヒーを 飲みます。', ['に', 'で', 'を', 'が'], 1, '動作をする場所は「で」です。カフェで飲みます、が自然です。', ['grammar-de-action-location-marker']),
    question('unit-n5-01-grammar-03', 'grammar', 'sentence-completion', 'きのう 日本に 着きました。あしたは もう 新宿に（　）。', ['行きます', '行きました', '行きません', '行くで'], 0, 'あしたの予定には、丁寧な非過去形「行きます」を使います。', ['v3-expression-mou', 'v3-vocab-shinjuku']),
    question('unit-n5-01-order-01', 'grammar', 'sentence-ordering', '★ に 入る ものは どれですか。\nわたしは　★　を　注文します。', ['カウンターで', 'コーヒー', 'カウンター', 'コーヒーを'], 1, '「カウンターで コーヒーを 注文します」が自然な順序です。★には「コーヒー」が入ります。', ['episode-3-vocab-chuumon', 'grammar-o', 'grammar-de-action-location-marker']),
    question('unit-n5-01-reading-01', 'reading', 'reading-comprehension', 'しつもんに こたえてください。', ['新宿駅の西口', '新宿駅の東口', 'カフェの中', 'ミアの家'], 1, 'メッセージでは「東口の近くにいる」とあります。', ['episode-2-vocab-deguchi'], { passage: 'ゆき：新宿駅の東口の近くにいるよ。赤い時計の下で待ってるね。' }),
    question('unit-n5-01-reading-02', 'reading', 'reading-comprehension', 'ミナさんは どこで 飲み物を 買いますか。', ['駅で', '席で', 'カウンターで', '出口で'], 2, 'ミナさんはカウンターで飲み物を注文します。', ['episode-3-vocab-seki', 'episode-3-vocab-chuumon'], { passage: 'ミナ：わたしは席を取るね。\nケン：ありがとう。じゃあ、カウンターで飲み物を注文するよ。' }),
    question('unit-n5-01-listening-01', 'listening', 'listening-comprehension', '女の人は いつ 駅に 行きますか。', ['きのう', 'きょうの十時', 'あしたの十時', 'あしたの午後'], 2, '女の人は「あしたの十時に駅で会おう」と言っています。', ['v3-vocab-ashita', 'v3-vocab-juuji', 'v3-vocab-eki'], { listeningSpeech: '男：あした、ひまですか。\n女：はい。あしたの十時に駅で会おう。' }),
    question('unit-n5-01-listening-02', 'listening', 'listening-comprehension', '男の人は 何を 注文しますか。', ['お茶', 'コーヒー', '水', 'パン'], 1, '男の人は「コーヒーを一つお願いします」と言っています。', ['episode-3-vocab-chuumon', 'v3-vocab-ocha'], { listeningSpeech: '店員：ご注文は。\n男：コーヒーを一つお願いします。' }),
  ],
};

const unitSchema = z.object({ id: z.string(), level: z.enum(['N5', 'N4']), episodeIds: z.array(z.string()).length(3), questions: z.array(z.object({ id: z.string(), domain: z.enum(['vocabulary', 'kanji', 'grammar', 'reading', 'listening']), kind: z.string(), choices: z.array(z.object({ id: z.string(), text: z.string() })).length(4), correctChoiceId: z.string(), linkedEpisodeItemIds: z.array(z.string()).min(1) })).min(10).max(15) });

export function getUnitTest(id: string): UnitTest | undefined { return id === firstUnitTest.id ? firstUnitTest : undefined; }
export function validateUnitTest(test: UnitTest): void {
  unitSchema.parse(test);
  const taught = new Set(test.episodeIds.flatMap((id) => v3Episodes[id]?.learningObjectives.map((objective) => objective.id) ?? []).concat(test.episodeIds.flatMap((id) => v3Episodes[id]?.curriculumGrammarIds ?? [])));
  for (const item of test.questions) {
    if (item.choices.filter((choice) => choice.id === item.correctChoiceId).length !== 1) throw new Error(`${item.id} must have one valid answer.`);
    if (item.linkedEpisodeItemIds.some((id) => !taught.has(id))) throw new Error(`${item.id} refers to untaught material.`);
  }
}
validateUnitTest(firstUnitTest);
