import type { CurriculumItem } from '../../types/learning';
import { curriculumSeedSchema } from './schemas';

const rawCurriculum: CurriculumItem[] = [
  { id: 'n5-vocab-ohayou', type: 'vocabulary', level: 'N5', title: 'おはよう', meaning: 'good morning', reading: 'おはよう', explanation: 'A friendly morning greeting.', tags: ['greeting', 'daily-life'] },
  { id: 'n5-vocab-arigatou', type: 'vocabulary', level: 'N5', title: 'ありがとう', meaning: 'thank you', reading: 'ありがとう', explanation: 'A common casual expression of thanks.', tags: ['greeting', 'daily-life'] },
  { id: 'n5-vocab-gakkou', type: 'vocabulary', level: 'N5', title: '学校', meaning: 'school', reading: 'がっこう', explanation: 'A place for study; note the small っ.', tags: ['place', 'education'] },
  { id: 'n5-vocab-sensei', type: 'vocabulary', level: 'N5', title: '先生', meaning: 'teacher', reading: 'せんせい', explanation: 'Used for teachers and some respected professionals.', tags: ['people', 'education'] },
  { id: 'n5-vocab-tomodachi', type: 'vocabulary', level: 'N5', title: '友達', meaning: 'friend', reading: 'ともだち', explanation: 'A friend or companion.', tags: ['people', 'relationships'] },
  { id: 'n5-vocab-mizu', type: 'vocabulary', level: 'N5', title: '水', meaning: 'water', reading: 'みず', explanation: 'The everyday word for water.', tags: ['food', 'daily-life'] },
  { id: 'n5-vocab-gohan', type: 'vocabulary', level: 'N5', title: 'ご飯', meaning: 'rice; meal', reading: 'ごはん', explanation: 'Can mean cooked rice or a meal generally.', tags: ['food', 'daily-life'] },
  { id: 'n5-vocab-tabemasu', type: 'vocabulary', level: 'N5', title: '食べます', meaning: 'to eat', reading: 'たべます', explanation: 'Polite non-past form of 食べる.', tags: ['verb', 'food'] },
  { id: 'n5-vocab-nomimasu', type: 'vocabulary', level: 'N5', title: '飲みます', meaning: 'to drink', reading: 'のみます', explanation: 'Polite non-past form of 飲む.', tags: ['verb', 'food'] },
  { id: 'n5-vocab-ikimasu', type: 'vocabulary', level: 'N5', title: '行きます', meaning: 'to go', reading: 'いきます', explanation: 'Polite non-past form of 行く.', tags: ['verb', 'movement'] },
  { id: 'n5-vocab-kimasu', type: 'vocabulary', level: 'N5', title: '来ます', meaning: 'to come', reading: 'きます', explanation: 'Polite non-past form of 来る.', tags: ['verb', 'movement'] },
  { id: 'n5-vocab-mimasu', type: 'vocabulary', level: 'N5', title: '見ます', meaning: 'to see; watch', reading: 'みます', explanation: 'Used for seeing, looking, or watching.', tags: ['verb', 'daily-life'] },
  { id: 'n5-vocab-kikimasu', type: 'vocabulary', level: 'N5', title: '聞きます', meaning: 'to listen; ask', reading: 'ききます', explanation: 'Meaning depends on whether you listen to something or ask someone.', tags: ['verb', 'communication'] },
  { id: 'n5-vocab-hanashimasu', type: 'vocabulary', level: 'N5', title: '話します', meaning: 'to speak', reading: 'はなします', explanation: 'Polite non-past form of 話す.', tags: ['verb', 'communication'] },
  { id: 'n5-vocab-ookii', type: 'vocabulary', level: 'N5', title: '大きい', meaning: 'big', reading: 'おおきい', explanation: 'An い-adjective describing size.', tags: ['adjective', 'size'] },
  { id: 'n5-vocab-chiisai', type: 'vocabulary', level: 'N5', title: '小さい', meaning: 'small', reading: 'ちいさい', explanation: 'An い-adjective and the opposite of 大きい.', tags: ['adjective', 'size'] },
  { id: 'n5-vocab-atarashii', type: 'vocabulary', level: 'N5', title: '新しい', meaning: 'new', reading: 'あたらしい', explanation: 'An い-adjective for something new.', tags: ['adjective', 'description'] },
  { id: 'n5-vocab-furui', type: 'vocabulary', level: 'N5', title: '古い', meaning: 'old (thing)', reading: 'ふるい', explanation: 'Used for old objects, not a person’s age.', tags: ['adjective', 'description'] },
  { id: 'n5-vocab-kyou', type: 'vocabulary', level: 'N5', title: '今日', meaning: 'today', reading: 'きょう', explanation: 'The current day.', tags: ['time', 'daily-life'] },
  { id: 'n5-vocab-ashita', type: 'vocabulary', level: 'N5', title: '明日', meaning: 'tomorrow', reading: 'あした', explanation: 'The day after today.', tags: ['time', 'daily-life'] },

  { id: 'n5-kanji-hi', type: 'kanji', level: 'N5', title: '日', meaning: 'day; sun', reading: 'ひ・にち', explanation: 'Seen in words about days and the sun, such as 日本 and 日曜日.', tags: ['time', 'nature'] },
  { id: 'n5-kanji-tsuki', type: 'kanji', level: 'N5', title: '月', meaning: 'month; moon', reading: 'つき・げつ', explanation: 'Used for the moon, months, and Monday.', tags: ['time', 'nature'] },
  { id: 'n5-kanji-hi-fire', type: 'kanji', level: 'N5', title: '火', meaning: 'fire', reading: 'ひ・か', explanation: 'Used for fire and Tuesday.', tags: ['nature', 'weekday'] },
  { id: 'n5-kanji-mizu', type: 'kanji', level: 'N5', title: '水', meaning: 'water', reading: 'みず・すい', explanation: 'Used for water and Wednesday.', tags: ['nature', 'weekday'] },
  { id: 'n5-kanji-ki', type: 'kanji', level: 'N5', title: '木', meaning: 'tree; wood', reading: 'き・もく', explanation: 'Used for trees, wood, and Thursday.', tags: ['nature', 'weekday'] },
  { id: 'n5-kanji-kane', type: 'kanji', level: 'N5', title: '金', meaning: 'gold; money', reading: 'かね・きん', explanation: 'Used for money, gold, and Friday.', tags: ['money', 'weekday'] },
  { id: 'n5-kanji-tsuchi', type: 'kanji', level: 'N5', title: '土', meaning: 'earth; soil', reading: 'つち・ど', explanation: 'Used for soil and Saturday.', tags: ['nature', 'weekday'] },
  { id: 'n5-kanji-hito', type: 'kanji', level: 'N5', title: '人', meaning: 'person', reading: 'ひと・じん・にん', explanation: 'A person, also used as a counter or nationality suffix.', tags: ['people', 'counter'] },
  { id: 'n5-kanji-yama', type: 'kanji', level: 'N5', title: '山', meaning: 'mountain', reading: 'やま・さん', explanation: 'A mountain; appears in many place and family names.', tags: ['nature', 'place'] },
  { id: 'n5-kanji-kawa', type: 'kanji', level: 'N5', title: '川', meaning: 'river', reading: 'かわ・せん', explanation: 'A river; the three strokes suggest flowing water.', tags: ['nature', 'place'] },

  { id: 'n5-grammar-wa', type: 'grammar', level: 'N5', title: 'は (topic)', meaning: 'as for…', reading: 'は', explanation: 'Marks the topic. When it is a particle, は is pronounced わ.', tags: ['particle', 'topic'] },
  { id: 'n5-grammar-ga', type: 'grammar', level: 'N5', title: 'が (subject)', meaning: 'subject marker', reading: 'が', explanation: 'Marks the grammatical subject or highlights new information.', tags: ['particle', 'subject'] },
  { id: 'n5-grammar-wo', type: 'grammar', level: 'N5', title: 'を (object)', meaning: 'object marker', reading: 'を', explanation: 'Marks the direct object of an action and is usually pronounced お.', tags: ['particle', 'object'] },
  { id: 'n5-grammar-ni', type: 'grammar', level: 'N5', title: 'に (time/destination)', meaning: 'at; to', reading: 'に', explanation: 'Marks a specific time, destination, or location of existence.', tags: ['particle', 'time', 'movement'] },
  { id: 'n5-grammar-de', type: 'grammar', level: 'N5', title: 'で (action place)', meaning: 'at; by means of', reading: 'で', explanation: 'Marks where an action happens or the means used.', tags: ['particle', 'place', 'means'] },
  { id: 'n5-grammar-no', type: 'grammar', level: 'N5', title: 'の (possession)', meaning: 'of; possessive', reading: 'の', explanation: 'Connects nouns, often showing possession or description.', tags: ['particle', 'possession'] },
  { id: 'n5-grammar-mo', type: 'grammar', level: 'N5', title: 'も (also)', meaning: 'also; too', reading: 'も', explanation: 'Adds another item that shares the same information.', tags: ['particle', 'addition'] },
  { id: 'n5-grammar-desu', type: 'grammar', level: 'N5', title: 'です', meaning: 'is; am; are (polite)', reading: 'です', explanation: 'A polite copula used after nouns and な-adjectives.', tags: ['copula', 'polite'] },
  { id: 'n5-grammar-masu', type: 'grammar', level: 'N5', title: '〜ます', meaning: 'polite verb ending', reading: 'ます', explanation: 'Creates the polite non-past form of a verb.', tags: ['verb', 'polite'] },
  { id: 'n5-grammar-masen', type: 'grammar', level: 'N5', title: '〜ません', meaning: 'polite negative verb ending', reading: 'ません', explanation: 'Creates the polite non-past negative form of a verb.', tags: ['verb', 'negative', 'polite'] },

  { id: 'n5-reading-hiragana-a', type: 'reading', level: 'N5', title: 'あ', meaning: 'hiragana a', reading: 'a', explanation: 'The hiragana character for the vowel sound a.', tags: ['hiragana', 'kana'] },
  { id: 'n5-reading-hiragana-ki', type: 'reading', level: 'N5', title: 'き', meaning: 'hiragana ki', reading: 'ki', explanation: 'The hiragana character for the sound ki.', tags: ['hiragana', 'kana'] },
  { id: 'n5-reading-katakana-ko', type: 'reading', level: 'N5', title: 'コ', meaning: 'katakana ko', reading: 'ko', explanation: 'The katakana character for the sound ko.', tags: ['katakana', 'kana'] },
  { id: 'n5-reading-katakana-me', type: 'reading', level: 'N5', title: 'メ', meaning: 'katakana me', reading: 'me', explanation: 'The katakana character for the sound me.', tags: ['katakana', 'kana'] },
];

export const n5CurriculumSeed = curriculumSeedSchema.parse(rawCurriculum);
