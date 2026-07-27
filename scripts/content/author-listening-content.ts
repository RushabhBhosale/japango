import path from "node:path";

import {
  learningContentCollectionsSchema,
  listeningActivitySchema,
  listeningSpeakerSchema,
  type LearningContentCollections,
  type ListeningActivity,
  type ListeningSpeaker,
  type Question,
  type QuestionOption,
  type QuestionTargetRelationship,
  type Sentence,
} from "../../src/features/learning-content/schemas";
import { OUTPUT_ROOT, SOURCE_PATHS } from "./config";
import { LISTENING_GRAMMAR_CANDIDATE_IDS } from "./listening-corpus";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson, writeJson } from "./lib/fs-utils";
import type { CurriculumUnit, GrammarRecord, KanjiRecord, VocabularyRecord } from "./schemas/content-schemas";

type Level = "N5" | "N4";
type ActivityType = ListeningActivity["activityType"];
type DraftTurn = { speakerId: string; displayText: string; reading: string; english: string; pauseAfterMs: number };
type Topic = { tag: string; japanese: string; reading: string; english: string };
type ResponseScenario = { grammarId: string; prompt: Omit<DraftTurn, "speakerId">; options: [string, string, string, string] };

const ATTRIBUTION = ["Original JapanGo editorial content; JLPT-aligned, not official JLPT material."];
const SOURCE_BY_LEVEL = { N5: "japango-listening-activity-corpus-n5", N4: "japango-listening-activity-corpus-n4" } as const;
const QUESTION_SOURCE = "japango-listening-question-corpus";
const NAMES = ["あき", "えみ", "かい", "さき", "たく", "なお", "はる", "まい"];
const TIMES = [
  { display: "午前8時", reading: "ごぜんはちじ", english: "8:00 a.m." },
  { display: "午前9時", reading: "ごぜんくじ", english: "9:00 a.m." },
  { display: "午前10時", reading: "ごぜんじゅうじ", english: "10:00 a.m." },
  { display: "午後1時", reading: "ごごいちじ", english: "1:00 p.m." },
  { display: "午後2時", reading: "ごごにじ", english: "2:00 p.m." },
  { display: "午後3時", reading: "ごごさんじ", english: "3:00 p.m." },
  { display: "午後4時", reading: "ごごよじ", english: "4:00 p.m." },
  { display: "午後5時", reading: "ごごごじ", english: "5:00 p.m." },
] as const;

const TOPICS: Topic[] = [
  ["family", "家族", "かぞく", "family"], ["home", "家", "いえ", "home"], ["school", "学校", "がっこう", "school"], ["work", "仕事", "しごと", "work"],
  ["shopping", "買い物", "かいもの", "shopping"], ["restaurants", "レストラン", "れすとらん", "restaurants"], ["cooking", "料理", "りょうり", "cooking"], ["transport", "交通", "こうつう", "transport"],
  ["travel", "旅行", "りょこう", "travel"], ["directions", "道案内", "みちあんない", "directions"], ["weather", "天気", "てんき", "weather"], ["appointments", "予約", "よやく", "appointments"],
  ["schedules", "予定", "よてい", "schedules"], ["invitations", "招待", "しょうたい", "invitations"], ["hobbies", "趣味", "しゅみ", "hobbies"], ["exercise", "運動", "うんどう", "exercise"],
  ["health", "健康", "けんこう", "health"], ["public-facilities", "公共施設", "こうきょうしせつ", "public facilities"], ["libraries", "図書館", "としょかん", "libraries"], ["events", "行事", "ぎょうじ", "events"],
  ["delivery", "配達", "はいたつ", "delivery"], ["accommodation", "宿", "やど", "accommodation"], ["neighbourhood", "近所", "きんじょ", "the neighbourhood"], ["technology", "機械", "きかい", "technology"],
  ["study", "勉強", "べんきょう", "study"], ["mistakes", "間違い", "まちがい", "mistakes"], ["lost-items", "落とし物", "おとしもの", "lost items"], ["rules", "決まり", "きまり", "rules"],
  ["requests", "お願い", "おねがい", "requests"], ["customer-service", "店の案内", "みせのあんない", "customer service"], ["phone-messages", "電話の伝言", "でんわのでんごん", "phone messages"], ["plans", "計画", "けいかく", "plans"],
  ["changes-of-plan", "予定の変更", "よていのへんこう", "changes of plan"], ["comparisons", "品物の比較", "しなもののひかく", "comparisons"], ["recommendations", "おすすめ", "おすすめ", "recommendations"], ["problems-and-solutions", "問題の解決", "もんだいのかいけつ", "problems and solutions"],
].map(([tag, japanese, reading, english]) => ({ tag, japanese, reading, english }));

const RESPONSE_SCENARIOS: ResponseScenario[] = [
  { grammarId: "grammar-masenka", prompt: { displayText: "明日、一緒に図書館へ行きませんか。", reading: "あした、いっしょにとしょかんへいきませんか。", english: "Would you like to go to the library together tomorrow?", pauseAfterMs: 450 }, options: ["はい、ぜひ一緒に行きましょう。", "図書館は駅の右にあります。", "昨日、本を三冊読みました。", "明日は月曜日です。"] },
  { grammarId: "grammar-mashouka", prompt: { displayText: "その荷物を持ちましょうか。", reading: "そのにもつをもちましょうか。", english: "Shall I carry that luggage?", pauseAfterMs: 450 }, options: ["ありがとうございます。お願いします。", "荷物は机の下にありました。", "いいえ、電車で行きます。", "昨日、新しい鞄を買いました。"] },
  { grammarId: "grammar-tekudasai", prompt: { displayText: "寒いので、窓を閉めてください。", reading: "さむいので、まどをしめてください。", english: "It is cold, so please close the window.", pauseAfterMs: 450 }, options: ["はい、すぐ閉めます。", "窓の外に鳥がいます。", "昨日は暖かかったです。", "このドアは新しいです。"] },
  { grammarId: "grammar-temoii", prompt: { displayText: "ここに座ってもいいですか。", reading: "ここにすわってもいいですか。", english: "May I sit here?", pauseAfterMs: 450 }, options: ["はい、どうぞ。", "椅子を二つ買いました。", "駅まで歩きました。", "いいえ、コーヒーです。"] },
  { grammarId: "grammar-takotogaaru", prompt: { displayText: "京都へ行ったことがありますか。", reading: "きょうとへいったことがありますか。", english: "Have you ever been to Kyoto?", pauseAfterMs: 450 }, options: ["はい、一度あります。", "京都へは新幹線で行きます。", "来週は大阪へ行きます。", "京都の本を読んでいます。"] },
  { grammarId: "grammar-nogasuki", prompt: { displayText: "どんな料理が好きですか。", reading: "どんなりょうりがすきですか。", english: "What kind of food do you like?", pauseAfterMs: 450 }, options: ["野菜の料理が好きです。", "七時に夕飯を食べます。", "台所は二階にあります。", "昨日、皿を洗いました。"] },
  { grammarId: "grammar-tai", prompt: { displayText: "週末は何をしたいですか。", reading: "しゅうまつはなにをしたいですか。", english: "What do you want to do this weekend?", pauseAfterMs: 450 }, options: ["家で映画を見たいです。", "週末は二日あります。", "映画館は駅の前です。", "先週は忙しかったです。"] },
  { grammarId: "grammar-mashou", prompt: { displayText: "午後三時に駅で会いましょう。", reading: "ごごさんじにえきであいましょう。", english: "Let us meet at the station at 3 p.m.", pauseAfterMs: 450 }, options: ["分かりました。三時に行きます。", "駅には店が三つあります。", "午後は雨が降りました。", "電車の切符を買いました。"] },
  { grammarId: "grammar-kedo", prompt: { displayText: "予約を午後に変えたいんですが、空いている時間はありますか。", reading: "よやくをごごにかえたいんですが、あいているじかんはありますか。", english: "I would like to move my appointment to the afternoon; is there an opening?", pauseAfterMs: 450 }, options: ["はい、三時なら空いております。", "予約票は白い紙でございます。", "昨日の午前は混んでいました。", "入口は建物の東側にあります。"] },
  { grammarId: "grammar-tara", prompt: { displayText: "駅に着いたら、電話で知らせていただけますか。", reading: "えきについたら、でんわでしらせていただけますか。", english: "Could you call me when you arrive at the station?", pauseAfterMs: 450 }, options: ["はい、着いたらすぐ連絡します。", "駅前の店は七時に閉まります。", "電話は机の上に置いてあります。", "昨日はバスで帰りました。"] },
  { grammarId: "grammar-nara", prompt: { displayText: "明日が雨なら、外のイベントはどうなりますか。", reading: "あしたがあめなら、そとのいべんとはどうなりますか。", english: "What will happen to the outdoor event if it rains tomorrow?", pauseAfterMs: 450 }, options: ["雨なら、体育館で行います。", "明日は午後から晴れるそうです。", "イベントの券を二枚買いました。", "体育館は駅から十分です。"] },
  { grammarId: "grammar-te-oku", prompt: { displayText: "会議の前に、この資料をコピーしておいてもらえますか。", reading: "かいぎのまえに、このしりょうをこぴーしておいてもらえますか。", english: "Could you make copies of these materials before the meeting?", pauseAfterMs: 450 }, options: ["承知しました。先に十部コピーしておきます。", "会議室には大きな窓があります。", "資料は昨日メールで届きました。", "コピー機は新しい会社の物です。"] },
  { grammarId: "grammar-hazu", prompt: { displayText: "荷物は今日の午後に届くはずですよね。", reading: "にもつはきょうのごごにとどくはずですよね。", english: "The package should arrive this afternoon, right?", pauseAfterMs: 450 }, options: ["はい、配達予定は午後四時です。", "荷物は青い箱に入っています。", "昨日、受付で名前を書きました。", "午後は会議室を使います。"] },
  { grammarId: "grammar-kamo", prompt: { displayText: "明日は雪になるかもしれないそうですが、出発しますか。", reading: "あしたはゆきになるかもしれないそうですが、しゅっぱつしますか。", english: "They say it may snow tomorrow; will you still leave?", pauseAfterMs: 450 }, options: ["天気を確認してから決めます。", "雪の写真を去年撮りました。", "出発口は二階にあります。", "明日の会議は三人です。"] },
  { grammarId: "grammar-nagara", prompt: { displayText: "音楽を聞きながら勉強しても、集中できますか。", reading: "おんがくをききながらべんきょうしても、しゅうちゅうできますか。", english: "Can you concentrate while studying with music playing?", pauseAfterMs: 450 }, options: ["はい、小さい音なら集中できます。", "音楽室は校舎の一階です。", "昨日は二時間勉強しました。", "この曲は友達に教わりました。"] },
  { grammarId: "grammar-te-morau", prompt: { displayText: "提出する前に、この書類を確認してもらえませんか。", reading: "ていしゅつするまえに、このしょるいをかくにんしてもらえませんか。", english: "Could you check this document before I submit it?", pauseAfterMs: 450 }, options: ["もちろんです。今日中に確認します。", "書類は受付の箱に入れます。", "提出日は来週の月曜日です。", "昨日、同じ紙を印刷しました。"] },
  { grammarId: "grammar-baai-wa", prompt: { displayText: "電車が止まった場合は、会社へどう連絡すればいいですか。", reading: "でんしゃがとまったばあいは、かいしゃへどうれんらくすればいいですか。", english: "If the train stops, how should I contact the office?", pauseAfterMs: 450 }, options: ["遅れる時は、担当者に電話してください。", "会社は駅から歩いて五分です。", "電車の中で本を読みました。", "担当者は今日、青い服を着ています。"] },
  { grammarId: "grammar-yotei", prompt: { displayText: "来週は大阪へ出張する予定ですか。", reading: "らいしゅうはおおさかへしゅっちょうするよていですか。", english: "Are you scheduled to travel to Osaka for work next week?", pauseAfterMs: 450 }, options: ["はい、火曜日から二日間行く予定です。", "大阪では有名な料理を食べました。", "来週の会議室は三階です。", "出張の鞄を昨日買いました。"] },
  { grammarId: "grammar-to-omou", prompt: { displayText: "二つの案では、こちらの方法が一番いいと思いますか。", reading: "ふたつのあんでは、こちらのほうほうがいちばんいいとおもいますか。", english: "Of the two proposals, do you think this approach is best?", pauseAfterMs: 450 }, options: ["はい、時間も費用も少なくて済むと思います。", "案内は入口の机に置いてあります。", "昨日は別の方法を使いました。", "二つの会議は同じ部屋であります。"] },
  { grammarId: "grammar-you-ni-naru", prompt: { displayText: "練習して、毎朝早く起きられるようになりましたか。", reading: "れんしゅうして、まいあさはやくおきられるようになりましたか。", english: "After practicing, have you become able to wake up early every morning?", pauseAfterMs: 450 }, options: ["はい、今は六時に起きられるようになりました。", "朝ご飯はパンと果物を食べます。", "練習は先月から始めました。", "昨日は夜まで仕事をしていました。"] },
];

const RESPONSE_GRAMMAR_ALIASES: Record<string, string> = {
  "grammar-tara": "grammar-n4-tara", "grammar-nara": "grammar-n4-nara", "grammar-te-oku": "grammar-n4-te-oku",
  "grammar-hazu": "grammar-n4-hazu-da", "grammar-kamo": "grammar-n4-kamo-shirenai", "grammar-nagara": "grammar-n4-nagara",
  "grammar-te-morau": "grammar-n4-te-morau", "grammar-baai-wa": "grammar-n4-baai-wa", "grammar-yotei": "grammar-n4-yotei-da",
  "grammar-to-omou": "grammar-n4-to-omou", "grammar-you-ni-naru": "grammar-n4-you-ni-naru",
};

const SPEAKERS: ListeningSpeaker[] = [
  ["aki", "あき", "learner-peer", "neutral-polite"], ["emi", "えみ", "friend", "neutral-casual"],
  ["kai", "かい", "friend", "neutral-polite"], ["saki", "さき", "family", "family-casual"],
  ["teacher", "先生", "teacher", "teacher-to-student"], ["coworker", "同僚", "coworker", "coworker-neutral"],
  ["staff", "係員", "staff", "customer-service-polite"], ["announcer", "案内係", "announcer", "public-announcement"],
].map(([suffix, label, role, speechStyle]) => listeningSpeakerSchema.parse({ schemaVersion: 1, id: `listening-speaker-${suffix}`, label, role, ageCategory: role === "teacher" ? "adult" : null, speechStyle, voicePreference: { locale: "ja-JP", gender: "unspecified", voiceId: null }, confidence: 0.96, needsReview: false, releaseReady: false }));

function compareStable(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function codePoints(value: string): number { return [...value.replaceAll("\n", "")].length; }
function line(speakerId: string, displayText: string, reading: string, english: string, pauseAfterMs = 450): DraftTurn { return { speakerId, displayText, reading, english, pauseAfterMs }; }
function activityTargets(level: Level): Array<[ActivityType, number]> { return level === "N5" ? [["short-monologue", 24], ["dialogue", 24], ["practical-information", 12], ["appropriate-response", 8]] : [["short-monologue", 28], ["dialogue", 32], ["practical-information", 16], ["appropriate-response", 12]]; }
function difficulty(level: Level, index: number) { return level === "N5" ? { jlptLevel: level, rank: index < 31 ? 1 : index < 62 ? 3 : 4 } : { jlptLevel: level, rank: index < 22 ? 2 : index < 70 ? 3 : 4 }; }
function vocabularyIdsFor(text: string, records: readonly VocabularyRecord[]): string[] { return records.filter((record) => [record.primaryForm, ...record.writtenForms.map(({ text: value }) => value)].some((surface) => [...surface].length >= 2 && text.includes(surface))).map(({ id }) => id).sort(compareStable); }
function kanjiIdsFor(text: string, records: readonly KanjiRecord[]): string[] { return records.filter(({ character }) => text.includes(character)).map(({ id }) => id).sort(compareStable); }
function glossaryFor(text: string, level: Level): ListeningActivity["glossary"] { return [
  { term: "公共施設", reading: "こうきょうしせつ", meaning: "public facility", outOfLevel: true },
  { term: "配達", reading: "はいたつ", meaning: "delivery", outOfLevel: level === "N5" },
  { term: "変更", reading: "へんこう", meaning: "change; alteration", outOfLevel: level === "N5" },
  { term: "比較", reading: "ひかく", meaning: "comparison", outOfLevel: true },
].filter(({ term }) => text.includes(term)); }

function topicLead(topic: Topic, index: number): Omit<DraftTurn, "speakerId"> {
  const variants = [
    [`今日は${topic.japanese}について話します。`, `きょうは${topic.reading}についてはなします。`, `Today I will talk about ${topic.english}.`],
    [`${topic.japanese}の予定を確認します。`, `${topic.reading}のよていをかくにんします。`, `I will confirm the plan for ${topic.english}.`],
    [`${topic.japanese}で一つ困ったことがあります。`, `${topic.reading}でひとつこまったことがあります。`, `There is one problem involving ${topic.english}.`],
    [`${topic.japanese}の新しい方法を説明します。`, `${topic.reading}のあたらしいほうほうをせつめいします。`, `I will explain a new approach to ${topic.english}.`],
    [`${topic.japanese}について大切なお知らせです。`, `${topic.reading}についてたいせつなおしらせです。`, `This is an important update about ${topic.english}.`],
    [`${topic.japanese}のことで相談があります。`, `${topic.reading}のことでそうだんがあります。`, `I would like advice about ${topic.english}.`],
  ] as const;
  const [displayText, reading, english] = variants[index % variants.length] as readonly [string, string, string];
  return { displayText, reading, english, pauseAfterMs: 500 };
}

function grammarSentence(grammarId: string, content: LearningContentCollections): Sentence {
  const view = content.grammarExampleViews.find((candidate) => candidate.grammarId === grammarId && candidate.role === "focus");
  const sentence = content.sentences.find(({ id }) => id === view?.sentenceId);
  if (!sentence) throw new Error(`No canonical example sentence for listening grammar ${grammarId}`);
  return sentence;
}

function coreTurns(level: Level, type: ActivityType, topic: Topic, index: number, grammarLine: Sentence, responseScenario?: ResponseScenario): DraftTurn[] {
  const lead = topicLead(topic, index);
  const time = TIMES[index % TIMES.length] as typeof TIMES[number];
  const firstSpeakers = ["listening-speaker-aki", "listening-speaker-kai", "listening-speaker-saki", "listening-speaker-coworker", "listening-speaker-teacher", "listening-speaker-staff"];
  const secondSpeakers = ["listening-speaker-emi", "listening-speaker-saki", "listening-speaker-kai", "listening-speaker-staff", "listening-speaker-coworker", "listening-speaker-aki"];
  const a = firstSpeakers[index % firstSpeakers.length] as string; const b = secondSpeakers[index % secondSpeakers.length] as string; const announcer = ["listening-speaker-announcer", "listening-speaker-staff", "listening-speaker-teacher"][index % 3] as string;
  if (type === "appropriate-response") {
    if (!responseScenario) throw new Error("Appropriate-response activity requires a scenario.");
    const prompt = responseScenario.prompt;
    return level === "N4" && [...prompt.displayText].length < 20
      ? [line(a, `確認ですが、${prompt.displayText}`, `かくにんですが、${prompt.reading}`, `Just to confirm, ${prompt.english}`)]
      : [{ speakerId: a, ...prompt }];
  }
  if (type === "short-monologue") {
    const turns = [line(a, lead.displayText, lead.reading, lead.english), line(a, grammarLine.japanese, grammarLine.reading, grammarLine.english), line(a, `予定は${time.display}からです。`, `よていは${time.reading}からです。`, `The plan starts at ${time.english}.`), line(a, "終わったら、必要なことをもう一度確認します。", "おわったら、ひつようなことをもういちどかくにんします。", "Afterward, I will check the necessary details once more.")];
    const n5Closings = [line(a, "大切な所は紙にも書きます。", "たいせつなところはかみにもかきます。", "I will also write the important points on paper."), line(a, "必要な物は今夜用意します。", "ひつようなものはこんやよういします。", "I will prepare what I need tonight."), line(a, "分からない時は先生に聞きます。", "わからないときはせんせいにききます。", "I will ask the teacher if I do not understand."), line(a, "最後に家族にも知らせます。", "さいごにかぞくにもしらせます。", "Finally, I will also tell my family.")];
    const n4Closings = [line(a, "急な変更があれば、先に関係する人へ知らせるつもりです。", "きゅうなへんこうがあれば、さきにかんけいするひとへしらせるつもりです。", "If there is a sudden change, I intend to notify the people involved first."), line(a, "必要な準備を終えてから、担当者に確認の連絡をします。", "ひつようなじゅんびをおえてから、たんとうしゃにかくにんのれんらくをします。", "After finishing the preparations, I will contact the person in charge to confirm."), line(a, "前回との違いを整理して、分かりやすい順番で伝える予定です。", "ぜんかいとのちがいをせいりして、わかりやすいじゅんばんでつたえるよていです。", "I plan to organize the differences from last time and explain them clearly."), line(a, "問題が残った場合は、一人で決めずにもう一度相談します。", "もんだいがのこったばあいは、ひとりできめずにもういちどそうだんします。", "If a problem remains, I will discuss it again instead of deciding alone.")];
    turns.push((level === "N5" ? n5Closings : n4Closings)[index % 4] as DraftTurn);
    if (level === "N4") {
      const finalLines = [line(a, "聞いた内容と自分の予定を比べてから、最後の順番を決めます。", "きいたないようとじぶんのよていをくらべてから、さいごのじゅんばんをきめます。", "I will compare what I heard with my own schedule before deciding the final order."), line(a, "準備の進み方を見ながら、無理のない方法を選びます。", "じゅんびのすすみかたをみながら、むりのないほうほうをえらびます。", "I will choose a reasonable method while watching how preparations progress."), line(a, "必要なら予定を少し変えて、全員に新しい情報を送ります。", "ひつようならよていをすこしかえて、ぜんいんにあたらしいじょうほうをおくります。", "If necessary, I will adjust the schedule and send everyone the new information."), line(a, "終わった後で結果を短くまとめ、次の機会に役立てます。", "おわったあとでけっかをみじかくまとめ、つぎのきかいにやくだてます。", "Afterward, I will summarize the result and use it next time.")];
      turns.push(finalLines[index % 4] as DraftTurn);
    }
    return turns;
  }
  if (type === "dialogue") {
    const meetingPairs = [[line(a, "場所は入口の近くでいいですか。", "ばしょはいりぐちのちかくでいいですか。", "Is a place near the entrance all right?"), line(b, "はい。着いたら連絡してください。", "はい。ついたられんらくしてください。", "Yes. Please contact me when you arrive.")], [line(a, "図書館の前で待ち合わせませんか。", "としょかんのまえでまちあわせませんか。", "Shall we meet in front of the library?"), line(b, "いいですね。私は青い鞄を持って行きます。", "いいですね。わたしはあおいかばんをもっていきます。", "Sounds good. I will carry a blue bag.")], [line(a, "二階の休憩室で話してもいいですか。", "にかいのきゅうけいしつではなしてもいいですか。", "May we talk in the second-floor lounge?"), line(b, "はい。先に席を取っておきます。", "はい。さきにせきをとっておきます。", "Yes. I will save us seats in advance.")], [line(a, "受付の横に集まるのはどうですか。", "うけつけのよこにあつまるのはどうですか。", "How about gathering beside reception?"), line(b, "分かりました。遅れる時は電話します。", "わかりました。おくれるときはでんわします。", "Understood. I will call if I am late.")]] as const;
    const pair = meetingPairs[index % meetingPairs.length] as readonly [DraftTurn, DraftTurn];
    const turns = [line(a, lead.displayText, lead.reading, lead.english), line(b, grammarLine.japanese, grammarLine.reading, grammarLine.english), line(a, `では、${time.display}に始めますか。`, `では、${time.reading}にはじめますか。`, `Then, shall we start at ${time.english}?`), line(b, "はい。その時間なら大丈夫です。", "はい。そのじかんならだいじょうぶです。", "Yes, that time works."), ...pair];
    if (level === "N4") turns.push(line(a, "もし予定が変わっても、出発する前に相談しましょう。", "もしよていがかわっても、しゅっぱつするまえにそうだんしましょう。", "Even if plans change, let us discuss it before leaving."), line(b, "分かりました。必要な物も前の日に用意しておきます。", "わかりました。ひつようなものもまえのひによういしておきます。", "Understood. I will prepare what we need the day before."), line(a, "では、確認した内容を短いメモにして送ります。", "では、かくにんしたないようをみじかいめもにしておくります。", "Then I will send a short note with the confirmed details."), line(b, "助かります。届いたらすぐに読みます。", "たすかります。とどいたらすぐによみます。", "That helps. I will read it as soon as it arrives."));
    return turns;
  }
  const venues = [{ display: "青空センター", reading: "あおぞらせんたー", english: "Aozora Center" }, { display: "若葉会館", reading: "わかばかいかん", english: "Wakaba Hall" }, { display: "ひかり学校", reading: "ひかりがっこう", english: "Hikari School" }, { display: "みどり図書館", reading: "みどりとしょかん", english: "Midori Library" }] as const; const venue = venues[index % venues.length] as typeof venues[number];
  const turns = [line(announcer, `${venue.display}から、${topic.japanese}のお知らせです。`, `${venue.reading}から、${topic.reading}のおしらせです。`, `This is a ${venue.english} announcement about ${topic.english}.`), line(announcer, `土曜日の受付は${time.display}から始まります。`, `どようびのうけつけは${time.reading}からはじまります。`, `Saturday reception begins at ${time.english}.`), line(announcer, "料金は300円で、必要な物は2つです。", "りょうきんはさんびゃくえんで、ひつようなものはふたつです。", "The fee is 300 yen and two items are required."), line(announcer, grammarLine.japanese, grammarLine.reading, grammarLine.english), line(announcer, "雨の場合も二階の青い部屋で行います。", "あめのばあいもにかいのあおいへやでおこないます。", "Even if it rains, it will take place in the blue room on the second floor.")];
  if (level === "N4") turns.push(line(announcer, "参加する人は開始十分前までに受付を済ませてください。", "さんかするひとはかいしじゅっぷんまえまでにうけつけをすませてください。", "Participants must finish reception ten minutes before the start."), line(announcer, `予定が変わった場合は、${venue.display}の受付で確認できます。`, `よていがかわったばあいは、${venue.reading}のうけつけでかくにんできます。`, `If the schedule changes, it can be confirmed at ${venue.english} reception.`));
  turns.push(line(announcer, "聞き終わったら、時間と場所をもう一度確かめてください。", "ききおわったら、じかんとばしょをもういちどたしかめてください。", "After listening, please check the time and place once more."));
  return turns;
}

function questionTypes(type: ActivityType, index: number): string[] {
  if (type === "appropriate-response") return ["appropriate-response"];
  if (type === "short-monologue") return ["main-idea", "specific-detail", ["sequence", "true-statement", "false-statement", "best-summary", "vocabulary-context", "grammar-context", "reason-for-action"][index % 7] as string];
  if (type === "dialogue") return ["specific-detail", ["speaker-intention", "speaker-relationship", "reference-resolution", "simple-inference", "information-matching"][index % 5] as string, ["what-happens-next", "reason-for-action", "sequence"][index % 3] as string];
  return ["time-interpretation", ["date-interpretation", "price-quantity-interpretation", "location"][index % 3] as string, "condition-rule", "practical-action"];
}

function makeQuestions(activity: ListeningActivity, topic: Topic, targetLine: Sentence, index: number, responseScenario?: ResponseScenario) {
  const questions: Question[] = []; const options: QuestionOption[] = []; const targets: QuestionTargetRelationship[] = []; const metadata: LearningContentCollections["learningItemMetadata"] = [];
  for (const [position, type] of questionTypes(activity.activityType, index).entries()) {
    const suffix = `${activity.id.replace("listening-activity-", "")}-${type}-${position + 1}`;
    const id = `question-listening-${suffix}`;
    const time = TIMES[index % TIMES.length] as typeof TIMES[number];
    const meetingPlace = ["near the entrance", "in front of the library", "in the second-floor lounge", "beside reception"][index % 4] as string;
    const answerSets: Record<string, string[]> = {
      "main-idea": [`The speaker explains a plan involving ${topic.english}.`, `The speaker cancels all plans involving ${topic.english}.`, `The speaker reports a past sports result involving ${topic.english}.`, `The speaker asks for directions unrelated to ${topic.english}.`],
      "specific-detail": [targetLine.english, `The ${topic.english} plan is cancelled immediately.`, `Someone else reverses every ${topic.english} detail.`, `No information about ${topic.english} is given.`],
      "sequence": [`The ${topic.english} topic is introduced before the plan details are confirmed.`, `The plan ends before ${topic.english} is mentioned.`, `The time is rejected and never replaced.`, `The speakers leave before discussing ${topic.english}.`],
      "true-statement": [`The speaker will check the necessary ${topic.english} details again.`, `The speaker refuses to check any ${topic.english} details.`, `The ${topic.english} plan has no time.`, `The speaker says the ${topic.english} plan happened last year.`],
      "false-statement": [`The ${topic.english} plan is always cancelled if it rains.`, `The speaker confirms details about ${topic.english}.`, `A time is stated for the ${topic.english} plan.`, `The script gives a next step connected with ${topic.english}.`],
      "best-summary": [`The speaker introduces ${topic.english}, gives a plan, and explains a next step.`, `The speaker gives only a name and no ${topic.english} information.`, `The speaker argues that ${topic.english} should be prohibited.`, `The speaker describes an unrelated historical event.`],
      "vocabulary-context": [`The heard sentence is: “${targetLine.english}”`, `The target word means the ${topic.english} plan was erased.`, `The target word names a person who is not in the script.`, `No target expression is heard in the ${topic.english} item.`],
      "grammar-context": [`The target pattern conveys: “${targetLine.english}”`, `The target pattern cancels the entire ${topic.english} plan.`, `The target pattern gives an unrelated address.`, `No target grammar appears in the ${topic.english} item.`],
      "reason-for-action": [`To confirm the necessary ${topic.english} details before acting.`, `To avoid everyone involved in ${topic.english}.`, `To hide the stated time from the other speaker.`, `To replace ${topic.english} with an unrelated holiday.`],
      "speaker-intention": [`The speakers are trying to settle the time and place for ${topic.english}.`, `They are trying to cancel ${topic.english} without telling anyone.`, `They are debating a news story unrelated to ${topic.english}.`, `They are trying to buy an unnamed object.`],
      "speaker-relationship": [`They are two people cooperating to arrange a ${topic.english} plan.`, `They are strangers arguing in a courtroom about ${topic.english}.`, `They are a broadcaster and an unseen audience discussing ${topic.english}.`, `Only one person speaks about ${topic.english}.`],
      "reference-resolution": [`“That time” refers to ${time.english}.`, `“That time” refers to midnight after ${topic.english}.`, `“That time” refers to an unstated date last year.`, `“That time” refers to the blue room.`],
      "simple-inference": [`They expect to meet ${meetingPlace} for the ${topic.english} plan.`, `They expect to meet outside the city after midnight.`, `They have decided never to meet for ${topic.english}.`, `They do not know one another's plan.`],
      "information-matching": [`They agree on ${time.english} and a place ${meetingPlace} for ${topic.english}.`, `They agree on midnight and a red room for ${topic.english}.`, `They choose different days and never agree.`, `They agree to omit both time and place.`],
      "what-happens-next": [`They will go to the agreed place ${meetingPlace} for the ${topic.english} plan.`, `They will erase the ${topic.english} plan without a message.`, `They will wait at unrelated places.`, `They will ask a public figure to decide.`],
      "time-interpretation": [`Reception for ${topic.english} starts at ${time.english}.`, `Reception for ${topic.english} starts at midnight.`, `Reception for ${topic.english} starts one day later.`, `No reception time is given for ${topic.english}.`],
      "date-interpretation": [`The ${topic.english} activity is scheduled for Saturday.`, `The ${topic.english} activity is scheduled for Sunday.`, `It happened last year on a public holiday.`, `No day is given for the ${topic.english} activity.`],
      "price-quantity-interpretation": [`For ${topic.english} at ${time.english}, the fee is 300 yen and two items are needed.`, `For ${topic.english} at ${time.english}, the fee is 200 yen and three items are needed.`, `The ${topic.english} activity is free and nothing is needed.`, `The ${topic.english} fee is 3,000 yen for one item.`],
      "location": [`The ${topic.english} activity at ${time.english} is in the blue room on the second floor.`, `The ${topic.english} activity at ${time.english} is in the red room on the first floor.`, `The ${topic.english} activity uses a real private address.`, `The ${topic.english} activity is outside only.`],
      "condition-rule": [`The ${topic.english} activity at ${time.english} still takes place if it rains.`, `Rain always cancels the ${topic.english} activity at ${time.english}.`, `Only staff may attend the ${topic.english} activity.`, `Participants must arrive after the ${topic.english} activity ends.`],
      "practical-action": [`For ${topic.english} at ${time.english}, follow the stated reception instructions.`, `For ${topic.english} at ${time.english}, ignore the stated condition.`, `Wait for an unstated call about ${topic.english}.`, `Go to an unrelated real business instead of ${topic.english}.`],
    };
    const prompts: Record<string, string> = {
      "appropriate-response": `Which response is most natural after “${activity.title}”?`, "main-idea": "What is the speaker mainly discussing?", "specific-detail": "Which detail is stated in the script?", "sequence": "What is the order of information?", "true-statement": "Which statement is true?", "false-statement": "Which statement is false?", "best-summary": "Which option best summarizes the script?", "vocabulary-context": "Which meaning matches the expression heard in context?", "grammar-context": "What does the target grammatical expression convey here?", "reason-for-action": "Why will the speaker take the stated action?", "speaker-intention": "What are the speakers trying to do?", "speaker-relationship": "What is the relationship between the speakers?", "reference-resolution": "What does the referenced time mean?", "simple-inference": "What can be inferred from the agreement?", "information-matching": "Which information matches the final agreement?", "what-happens-next": "What will the speakers most likely do next?", "time-interpretation": "When does reception begin?", "date-interpretation": "On which day is the activity scheduled?", "price-quantity-interpretation": "Which fee and quantity are correct?", "location": "Where will the activity take place?", "condition-rule": "What happens if it rains?", "practical-action": "What should a participant do?",
    };
    const generic = [`The ${topic.english} script supports the stated ${type.replaceAll("-", " ")}.`, `A different person changes the ${topic.english} plan.`, `The order of the ${topic.english} details is reversed.`, `The script gives no support for this ${topic.english} choice.`];
    const raw = type === "appropriate-response" ? responseScenario?.options : answerSets[type] ?? generic;
    if (!raw) throw new Error(`Missing answer set for ${activity.id}`);
    const scoped = type === "appropriate-response" ? [...raw] : raw.map((value) => `At ${time.english}: ${value}`);
    const optionIds = scoped.map((_, optionIndex) => `question-option-listening-${suffix}-${optionIndex + 1}`);
    const targetTurn = activity.turns.find(({ displayText }) => displayText === targetLine.japanese)?.position ?? 1;
    const supportTurn = type === "appropriate-response" || type === "main-idea" ? 1 : type === "specific-detail" || type === "vocabulary-context" || type === "grammar-context" ? targetTurn : type === "time-interpretation" || type === "date-interpretation" ? 2 : type === "price-quantity-interpretation" ? 3 : type === "location" || type === "condition-rule" ? 5 : activity.turns.length;
    questions.push({ schemaVersion: 1, id, domain: "listening", presentation: "multiple-choice", responseType: "single-select", prompt: { text: `${prompts[type] ?? `Which answer matches the ${type.replaceAll("-", " ")}?`} [${activity.title}]`, language: type === "appropriate-response" ? "bilingual" : "en" }, stimulusReferences: [{ type: "listening-activity", id: activity.id }], correctOptionIds: [optionIds[0] as string], explanation: `Correct: “${scoped[0]}” is supported by turn ${supportTurn}. Each distractor changes the speaker, time, place, quantity, condition, intention, or conversational purpose. Strategy: listen for the final confirmed information.`, difficulty: activity.difficulty, examMetadata: { jlptLevel: activity.level, section: "listening", formatCode: type, recommendedSeconds: activity.activityType === "appropriate-response" ? 20 : 50 }, usageContexts: ["assessment", "lesson", "review"], tags: [`support-turn-${supportTurn}`, `type-${type}`].sort(compareStable), sourceIds: [QUESTION_SOURCE], attribution: ATTRIBUTION, confidence: 0.96, needsReview: false, releaseReady: false });
    options.push(...scoped.map((text, optionIndex) => ({ schemaVersion: 1 as const, id: optionIds[optionIndex] as string, questionId: id, position: optionIndex + 1, content: { type: "text" as const, text, language: type === "appropriate-response" ? "ja" as const : "en" as const }, feedback: optionIndex === 0 ? "This matches the final confirmed information." : "This is plausible language but does not match the script.", confidence: 0.96, needsReview: false, releaseReady: false })));
    targets.push({ schemaVersion: 1, id: `question-target-listening-${suffix}`, questionId: id, targetType: "listening-activity", targetId: activity.id, role: "primary", skill: "listening", confidence: 0.96, needsReview: false, releaseReady: false });
    metadata.push({ schemaVersion: 1, id: `learning-item-question-listening-${suffix}`, itemType: "question", itemId: id, reviewable: true, skills: ["listening-recognition", "meaning-recognition"], availableModes: ["assessment", "listening", "quiz"], estimatedReviewSeconds: activity.activityType === "appropriate-response" ? 20 : 50, tags: [`listening-${type}`], confidence: 0.96, needsReview: false, releaseReady: false });
  }
  return { questions, options, targets, metadata };
}

export async function authorListeningContent(): Promise<void> {
  const [base, grammarN5, grammarN4, vocabN5, vocabN4, kanjiN5, kanjiN4, unitsN5, unitsN4] = await Promise.all([
    readJson<LearningContentCollections>(path.join(OUTPUT_ROOT, "learning-content/index.json")), readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n5.json")), readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n4.json")),
    readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n5.json")), readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n4.json")), readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n5.json")), readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n4.json")),
    readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n5.json")), readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n4.json")),
  ]);
  const grammarById = new Map([...grammarN5, ...grammarN4].map((record) => [record.id, record]));
  const n5Grammar = LISTENING_GRAMMAR_CANDIDATE_IDS.filter((id) => grammarById.get(id)?.level === "N5");
  const n4Grammar = LISTENING_GRAMMAR_CANDIDATE_IDS.filter((id) => grammarById.get(id)?.level === "N4" && grammarById.get(id)?.releaseReady);
  const catalog = { N5: { vocabulary: vocabN5, kanji: kanjiN5, units: unitsN5 }, N4: { vocabulary: [...vocabN5, ...vocabN4], kanji: [...kanjiN5, ...kanjiN4], units: unitsN4 } };
  const activities: ListeningActivity[] = []; const questions: Question[] = []; const options: QuestionOption[] = []; const targets: QuestionTargetRelationship[] = []; const metadata: LearningContentCollections["learningItemMetadata"] = [];
  for (const level of ["N5", "N4"] as const) {
    let levelIndex = 0; let grammarIndex = 0;
    for (const [type, count] of activityTargets(level)) for (let typeIndex = 0; typeIndex < count; typeIndex += 1) {
      const topic = TOPICS[(levelIndex * 5 + (level === "N4" ? 3 : 0)) % TOPICS.length] as Topic;
      const grammarPool = level === "N5" ? n5Grammar : n4Grammar;
      const responseScenario = type === "appropriate-response" ? RESPONSE_SCENARIOS[(level === "N5" ? 0 : 8) + typeIndex] : undefined;
      const responseGrammarId = responseScenario ? RESPONSE_GRAMMAR_ALIASES[responseScenario.grammarId] ?? responseScenario.grammarId : undefined;
      const grammarId = responseGrammarId ?? grammarPool[grammarIndex++ % grammarPool.length] as string;
      const targetLine = grammarSentence(grammarId, base);
      const draftTurns = coreTurns(level, type, topic, levelIndex, targetLine, responseScenario);
      const serial = String(typeIndex + 1).padStart(3, "0"); const id = `listening-activity-${level.toLowerCase()}-${type}-${serial}`;
      const turns = draftTurns.map((turn, turnIndex) => ({ id: `listening-turn-${level.toLowerCase()}-${type}-${serial}-${turnIndex + 1}`, position: turnIndex + 1, speakerId: turn.speakerId, displayText: turn.displayText, speechNormalizedText: turn.reading, reading: turn.reading, english: turn.english, pauseAfterMs: turn.pauseAfterMs }));
      const questionIds = questionTypes(type, levelIndex).map((questionType, questionIndex) => `question-listening-${id.replace("listening-activity-", "")}-${questionType}-${questionIndex + 1}`).sort(compareStable);
      const transcript = turns.map(({ displayText }) => displayText).join("\n"); const speechNormalizedTranscript = turns.map(({ speechNormalizedText }) => speechNormalizedText).join("\n");
      const speakers = [...new Set(turns.map(({ speakerId }) => speakerId))].sort(compareStable); const levelCatalog = catalog[level];
      const activity = listeningActivitySchema.parse({ schemaVersion: 1, id, level, activityType: type, title: `${NAMES[levelIndex % NAMES.length]}の${topic.japanese}・${levelIndex + 1}`, speakerIds: speakers, turns, transcript, learnerTranscript: transcript, speechNormalizedTranscript, english: turns.map(({ english }) => english).join(" "), glossary: glossaryFor(transcript, level), difficulty: difficulty(level, levelIndex), topicTags: [topic.tag], grammarIds: [grammarId], vocabularyIds: vocabularyIdsFor(transcript, levelCatalog.vocabulary), kanjiIds: kanjiIdsFor(transcript, levelCatalog.kanji), curriculumUnitIds: [(levelCatalog.units[levelIndex % levelCatalog.units.length] as CurriculumUnit).id], questionIds, estimatedDurationSeconds: Math.max(8, Math.ceil(codePoints(speechNormalizedTranscript) / (level === "N5" ? 3.2 : 3.8) + turns.reduce((sum, turn) => sum + turn.pauseAfterMs, 0) / 1000)), playback: { locale: "ja-JP", learningRate: level === "N5" ? 0.85 : 0.9, challengeRate: level === "N5" ? 1 : 1.05, futureAudioKey: `audio-future-${id.replace("listening-activity-", "listening-")}` }, replay: { maxFirstAttemptReplays: level === "N5" ? 2 : 1, hintAvailable: true, transcriptUnlock: "after-answer", slowPlaybackAvailable: true, sentenceBySentenceReplay: true, speakerIsolation: type === "dialogue" }, sourceIds: [SOURCE_BY_LEVEL[level]], attribution: ATTRIBUTION, provenance: { sourceType: "original-japango", authoringMethod: "original-editorial-authoring" }, reviewStatus: "development-only", releaseBlockers: ["curriculum-parent-not-release-ready"], confidence: 0.96, needsReview: false, releaseReady: false });
      activities.push(activity); const built = makeQuestions(activity, topic, targetLine, levelIndex, responseScenario); questions.push(...built.questions); options.push(...built.options); targets.push(...built.targets); metadata.push(...built.metadata); levelIndex += 1;
    }
  }
  activities.sort((a, b) => compareStable(a.id, b.id)); questions.sort((a, b) => compareStable(a.id, b.id)); options.sort((a, b) => compareStable(a.questionId, b.questionId) || a.position - b.position); targets.sort((a, b) => compareStable(a.id, b.id)); metadata.sort((a, b) => compareStable(a.id, b.id)); SPEAKERS.sort((a, b) => compareStable(a.id, b.id));
  learningContentCollectionsSchema.parse({ schemaVersion: 1, sentences: [], readingPassages: [], listeningSpeakers: SPEAKERS, listeningActivities: activities, grammarExampleViews: [], vocabularyExampleViews: [], kanjiExampleViews: [], questions, questionOptions: options, learningItemMetadata: metadata, questionTargetRelationships: targets });
  const questionFile = { schemaVersion: 1, questions, questionOptions: options, learningItemMetadata: metadata, questionTargetRelationships: targets };
  await Promise.all([
    writeJson(SOURCE_PATHS.listeningActivityCorpusN5, activities.filter(({ level }) => level === "N5")), writeJson(SOURCE_PATHS.listeningActivityCorpusN4, activities.filter(({ level }) => level === "N4")), writeJson(SOURCE_PATHS.listeningQuestionCorpus, questionFile), writeJson(SOURCE_PATHS.listeningSpeakerCorpus, SPEAKERS),
    writeJson(SOURCE_PATHS.listeningEditorialDecisions, { schemaVersion: 1, corpusName: "JapanGo's original JLPT N5/N4-aligned listening script and listening-comprehension corpus", decisions: [{ id: "listening-no-audio", decision: "Generate audio-ready structured scripts and future audio keys, but no audio files because no deterministic TTS infrastructure exists." }, { id: "listening-lifecycle", decision: "Keep all 156 activities development-only while every curriculum parent remains non-release." }, { id: "listening-grammar", decision: `Naturally reinforce ${LISTENING_GRAMMAR_CANDIDATE_IDS.length} pre-audited canonical grammar records without inventory expansion.` }] }),
  ]);
  console.log(`Authored ${activities.length} listening activities, ${questions.length} questions, ${options.length} options, and ${SPEAKERS.length} speakers.`);
}

if (isDirectExecution(import.meta.url)) runCli(authorListeningContent);
