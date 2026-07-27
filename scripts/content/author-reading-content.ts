import path from "node:path";

import {
  learningContentCollectionsSchema,
  readingPassageSchema,
  type LearningContentCollections,
  type Question,
  type QuestionOption,
  type QuestionTargetRelationship,
  type ReadingPassage,
} from "../../src/features/learning-content/schemas";
import { OUTPUT_ROOT, SOURCE_PATHS } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson, writeJson } from "./lib/fs-utils";
import type {
  CurriculumUnit,
  GrammarRecord,
  KanjiRecord,
  VocabularyRecord,
} from "./schemas/content-schemas";

type Level = "N5" | "N4";
type PassageType = "short" | "medium" | "practical";
type Line = { japanese: string; reading: string; english: string };
type Scenario = { topic: string; title: string; summary: string; lines: Line[] };

const SOURCE_BY_LEVEL = {
  N5: "japango-reading-passage-corpus-n5",
  N4: "japango-reading-passage-corpus-n4",
} as const;
const QUESTION_SOURCE = "japango-reading-question-corpus";
const ATTRIBUTION = ["Original JapanGo editorial content; JLPT-aligned, not official JLPT material."];
const NAMES = ["あき", "えみ", "かい", "さき", "たく", "なお", "はる", "まい", "ゆう", "りん"];
const TIMES = ["八時", "九時", "十時", "十一時", "一時", "二時", "三時", "四時", "五時", "六時"];
const TIME_READINGS = ["はちじ", "くじ", "じゅうじ", "じゅういちじ", "いちじ", "にじ", "さんじ", "よじ", "ごじ", "ろくじ"];

function line(japanese: string, reading: string, english: string): Line {
  return { japanese, reading, english };
}

const SCENARIOS: Scenario[] = [
  { topic: "home", title: "家の仕事", summary: "sharing household tasks", lines: [line("朝、まどを開けて部屋をそうじします。", "あさ、まどをあけてへやをそうじします。", "In the morning, the room is aired and cleaned."), line("父はごみを出し、母は朝ご飯を作ります。", "ちちはごみをだし、はははあさごはんをつくります。", "Father takes out the rubbish while Mother makes breakfast."), line("終わった仕事は白い紙に書きます。", "おわったしごとはしろいかみにかきます。", "Finished chores are written on a white sheet."), line("みんなでするので、早く終わります。", "みんなでするので、はやくおわります。", "Because everyone helps, the work finishes early.")] },
  { topic: "family", title: "祖母への手紙", summary: "keeping in touch with a grandmother", lines: [line("日曜日に家族で祖母へ手紙を書きます。", "にちようびにかぞくでそぼへてがみをかきます。", "On Sunday the family writes to Grandmother."), line("弟は学校の絵を一まい入れます。", "おとうとはがっこうのえをいちまいいれます。", "The younger brother includes one school drawing."), line("姉は来月の旅行について知らせます。", "あねはらいげつのりょこうについてしらせます。", "The older sister tells her about next month's trip."), line("手紙は月曜日の朝に出します。", "てがみはげつようびのあさにだします。", "The letter is mailed Monday morning.")] },
  { topic: "friends", title: "公園の約束", summary: "friends arranging a park meeting", lines: [line("友だちと公園の入口で会う約束です。", "ともだちとこうえんのいりぐちであうやくそくです。", "Friends plan to meet at the park entrance."), line("赤い時計の前で待つことにしました。", "あかいとけいのまえでまつことにしました。", "They decided to wait by the red clock."), line("一人が少しおくれると連絡しました。", "ひとりがすこしおくれるとれんらくしました。", "One friend said they would be a little late."), line("先に来た二人は木の下で本を読みます。", "さきにきたふたりはきのしたでほんをよみます。", "The first two read under a tree.")] },
  { topic: "school", title: "教室の係", summary: "organizing classroom duties", lines: [line("教室では毎週、係がかわります。", "きょうしつではまいしゅう、かかりがかわります。", "Classroom duties change every week."), line("今週は黒板と花の水がわたしの仕事です。", "こんしゅうはこくばんとはなのみずがわたしのしごとです。", "This week the board and watering flowers are my jobs."), line("授業の前に黒板をきれいにします。", "じゅぎょうのまえにこくばんをきれいにします。", "The board is cleaned before class."), line("花の水は昼休みに少しだけあげます。", "はなのみずはひるやすみにすこしだけあげます。", "The flowers get a little water at lunch.")] },
  { topic: "work", title: "小さな会議", summary: "preparing for a short workplace meeting", lines: [line("午後に短い会議がある予定です。", "ごごにみじかいかいぎがあるよていです。", "A short meeting is planned for the afternoon."), line("資料は朝のうちに三部作ります。", "しりょうはあさのうちにさんぶつくります。", "Three copies of the material are made in the morning."), line("話す順番を紙に書いておきます。", "はなすじゅんばんをかみにかいておきます。", "The speaking order is written down in advance."), line("会議の後で、決まったことをメールします。", "かいぎのあとで、きまったことをめーるします。", "After the meeting, the decisions are emailed.")] },
  { topic: "shopping", title: "買い物のメモ", summary: "using a list to buy only needed items", lines: [line("店へ行く前に買い物のメモを作ります。", "みせへいくまえにかいもののめもをつくります。", "A shopping list is made before going to the store."), line("牛乳は一本、卵は六つ必要です。", "ぎゅうにゅうはいっぽん、たまごはむっつひつようです。", "One bottle of milk and six eggs are needed."), line("野菜は家にあるので買いません。", "やさいはいえにあるのでかいません。", "Vegetables are not bought because there are some at home."), line("会計の前にメモをもう一度見ます。", "かいけいのまえにめもをもういちどみます。", "The list is checked again before paying.")] },
  { topic: "food", title: "昼のおべんとう", summary: "choosing a balanced lunch", lines: [line("今日のおべんとうには魚とご飯があります。", "きょうのおべんとうにはさかなとごはんがあります。", "Today's lunch contains fish and rice."), line("赤いトマトと小さいりんごも入れました。", "あかいとまととちいさいりんごもいれました。", "A red tomato and a small apple were added."), line("スープは重いので家で飲みます。", "すーぷはおもいのでいえでのみます。", "The soup is left at home because it is heavy."), line("昼にはお茶を買うつもりです。", "ひるにはおちゃをかうつもりです。", "The plan is to buy tea at lunchtime.")] },
  { topic: "restaurants", title: "静かな席", summary: "requesting a suitable restaurant seat", lines: [line("昼の店はこんでいます。", "ひるのみせはこんでいます。", "The restaurant is crowded at noon."), line("小さい子どもがいるので広い席をたのみます。", "ちいさいこどもがいるのでひろいせきをたのみます。", "A wide table is requested because there is a small child."), line("入口の近くは寒いと聞きました。", "いりぐちのちかくはさむいとききました。", "They heard that seats near the entrance are cold."), line("店の奥の静かな席を選びます。", "みせのおくのしずかなせきをえらびます。", "They choose a quiet table at the back.")] },
  { topic: "cooking", title: "野菜のスープ", summary: "making vegetable soup in a safe order", lines: [line("まず野菜をよく洗って小さく切ります。", "まずやさいをよくあらってちいさくきります。", "First the vegetables are washed and cut small."), line("なべに水を入れてから火をつけます。", "なべにみずをいれてからひをつけます。", "The heat is turned on after water goes in the pot."), line("十五分たったら塩を少し入れます。", "じゅうごふんたったらしおをすこしいれます。", "A little salt is added after fifteen minutes."), line("火を止めて、二分待ってから食べます。", "ひをとめて、にふんまってからたべます。", "The soup is eaten after turning off the heat and waiting two minutes.")] },
  { topic: "transport", title: "朝のバス", summary: "taking an earlier bus to arrive on time", lines: [line("朝のバスは駅の北口から出ます。", "あさのばすはえきのきたぐちからでます。", "The morning bus leaves from the station's north exit."), line("いつものバスでは約束におくれそうです。", "いつものばすではやくそくにおくれそうです。", "The usual bus may be too late for the appointment."), line("今日は一本早いバスに乗ります。", "きょうはいっぽんはやいばすにのります。", "Today an earlier bus is taken."), line("駅に着いたら友だちへ知らせます。", "えきについたらともだちへしらせます。", "A friend will be notified upon arrival.")] },
  { topic: "travel", title: "海辺の一日", summary: "planning a simple day by the sea", lines: [line("旅行の二日目は海の近くを歩きます。", "りょこうのふつかめはうみのちかくをあるきます。", "On the second day, they walk near the sea."), line("午前は古い橋を見て、写真をとります。", "ごぜんはふるいはしをみて、しゃしんをとります。", "In the morning they see an old bridge and take photos."), line("昼は港の公園でおべんとうを食べます。", "ひるはみなとのこうえんでおべんとうをたべます。", "Lunch is eaten in the harbour park."), line("雨なら小さな博物館へ行きます。", "あめならちいさなはくぶつかんへいきます。", "If it rains, they go to a small museum.")] },
  { topic: "directions", title: "市役所への道", summary: "following landmarks to reach city hall", lines: [line("駅の南口を出て、まっすぐ歩きます。", "えきのみなみぐちをでて、まっすぐあるきます。", "Leave the south exit and walk straight."), line("二つ目の信号を右へ曲がります。", "ふたつめのしんごうをみぎへまがります。", "Turn right at the second traffic light."), line("青い本屋のとなりに銀行があります。", "あおいほんやのとなりにぎんこうがあります。", "There is a bank beside the blue bookstore."), line("市役所はその銀行の向かいです。", "しやくしょはそのぎんこうのむかいです。", "City hall is opposite that bank.")] },
  { topic: "appointments", title: "歯医者の時間", summary: "changing and confirming an appointment", lines: [line("歯医者の予約は木曜日の午後です。", "はいしゃのよやくはもくようびのごごです。", "The dentist appointment is Thursday afternoon."), line("仕事が長くなるので時間をかえました。", "しごとがながくなるのでじかんをかえました。", "The time was changed because work will run late."), line("新しい時間は金曜日の十時です。", "あたらしいじかんはきんようびのじゅうじです。", "The new time is Friday at ten."), line("前の日にもう一度予定を確認します。", "まえのひにもういちどよていをかくにんします。", "The appointment is checked again the day before.")] },
  { topic: "schedules", title: "一日の順番", summary: "organizing tasks by time", lines: [line("朝は銀行へ行く予定です。", "あさはぎんこうへいくよていです。", "The bank is planned for the morning."), line("昼までに図書館の本を返します。", "ひるまでにとしょかんのほんをかえします。", "Library books are returned by noon."), line("午後は家で仕事をします。", "ごごはいえでしごとをします。", "Work is done at home in the afternoon."), line("全部終わったら友だちに電話します。", "ぜんぶおわったらともだちにでんわします。", "A friend is called when everything is finished.")] },
  { topic: "health", title: "休む日の過ごし方", summary: "resting and monitoring a mild illness", lines: [line("朝から少し頭が痛いです。", "あさからすこしあたまがいたいです。", "There has been a mild headache since morning."), line("今日は運動をしないで家で休みます。", "きょうはうんどうをしないでいえでやすみます。", "Today exercise is skipped and rest is taken at home."), line("水を飲んで、温かい物を食べます。", "みずをのんで、あたたかいものをたべます。", "Water is drunk and warm food is eaten."), line("夕方も痛かったら病院へ連絡します。", "ゆうがたもいたかったらびょういんへれんらくします。", "If it still hurts in the evening, the hospital will be contacted.")] },
  { topic: "weather", title: "風の強い日", summary: "adjusting plans for strong wind", lines: [line("午後から風が強くなるそうです。", "ごごからかぜがつよくなるそうです。", "The wind is expected to strengthen this afternoon."), line("ベランダの軽い物を部屋へ入れます。", "べらんだのかるいものをへやへいれます。", "Light things on the balcony are brought inside."), line("自転車ではなくバスで出かけます。", "じてんしゃではなくばすででかけます。", "The bus is used instead of a bicycle."), line("夜には風が弱くなると聞きました。", "よるにはかぜがよわくなるとききました。", "They heard the wind will ease at night.")] },
  { topic: "hobbies", title: "写真の整理", summary: "selecting and organizing photographs", lines: [line("休みの日に古い写真を整理します。", "やすみのひにふるいしゃしんをせいりします。", "Old photographs are organized on a day off."), line("同じ場所の写真を一つの箱に入れます。", "おなじばしょのしゃしんをひとつのはこにいれます。", "Photos from the same place go in one box."), line("家族に見せたい写真を十まい選びます。", "かぞくにみせたいしゃしんをじゅうまいえらびます。", "Ten photos to show the family are selected."), line("名前と日を小さい紙に書いておきます。", "なまえとひをちいさいかみにかいておきます。", "Names and dates are written on small slips.")] },
  { topic: "exercise", title: "歩く目標", summary: "building a manageable walking habit", lines: [line("毎日少しずつ歩くことにしました。", "まいにちすこしずつあるくことにしました。", "A decision was made to walk a little every day."), line("朝は川まで十五分歩きます。", "あさはかわまでじゅうごふんあるきます。", "The morning walk to the river takes fifteen minutes."), line("雨の日は建物の中を歩きます。", "あめのひはたてもののなかをあるきます。", "On rainy days, the walking is indoors."), line("むりをしないで毎週時間をふやします。", "むりをしないでまいしゅうじかんをふやします。", "Time is increased weekly without overdoing it.")] },
  { topic: "plans", title: "午後の計画", summary: "reordering an afternoon plan", lines: [line("午後は店と図書館へ行く予定です。", "ごごはみせととしょかんへいくよていです。", "The afternoon plan includes a store and library."), line("図書館は早く閉まるので先に行きます。", "としょかんははやくしまるのでさきにいきます。", "The library comes first because it closes early."), line("本を返した後で店へ向かいます。", "ほんをかえしたあとでみせへむかいます。", "The store comes after returning books."), line("荷物が多ければバスで帰ります。", "にもつがおおければばすでかえります。", "If there are many bags, the return trip is by bus.")] },
  { topic: "messages", title: "帰宅の伝言", summary: "leaving clear information about coming home", lines: [line("母へ帰る時間の伝言をのこしました。", "ははへかえるじかんのでんごんをのこしました。", "A message about the return time was left for Mother."), line("今日は図書館で宿題をします。", "きょうはとしょかんでしゅくだいをします。", "Homework is done at the library today."), line("六時ごろ家に着く予定です。", "ろくじごろいえにつくよていです。", "Arrival home is planned for around six."), line("予定がかわったら電話をします。", "よていがかわったらでんわをします。", "A call will be made if the plan changes.")] },
  { topic: "email", title: "資料のお礼", summary: "thanking a colleague and confirming a deadline", lines: [line("仕事の資料を送ってくれた人へメールします。", "しごとのしりょうをおくってくれたひとへめーるします。", "An email is sent to the person who provided work materials."), line("まず、早く送ってくれたお礼を書きます。", "まず、はやくおくってくれたおれいをかきます。", "First, thanks are given for sending them early."), line("分からない所を一つ質問します。", "わからないところをひとつしつもんします。", "One unclear point is asked about."), line("金曜日までに返事がほしいと伝えます。", "きんようびまでにへんじがほしいとつたえます。", "The email says a reply is wanted by Friday.")] },
  { topic: "public-services", title: "区役所の手続き", summary: "preparing documents for a public-service visit", lines: [line("区役所へ行く前に必要な物を調べます。", "くやくしょへいくまえにひつようなものをしらべます。", "Required items are checked before visiting the ward office."), line("名前を書いた紙とカードを持って行きます。", "なまえをかいたかみとかーどをもっていきます。", "A named form and card are taken."), line("受付で番号を取って順番を待ちます。", "うけつけでばんごうをとってじゅんばんをまちます。", "A number is taken at reception before waiting."), line("分からない場合は案内の人に聞きます。", "わからないばあいはあんないのひとにききます。", "If anything is unclear, the information worker is asked.")] },
  { topic: "events", title: "町の音楽会", summary: "attending a small community concert", lines: [line("土曜日に町の音楽会があります。", "どようびにまちのおんがくかいがあります。", "There is a community concert on Saturday."), line("会場は川の近くの青空ホールです。", "かいじょうはかわのちかくのあおぞらほーるです。", "The venue is fictional Aozora Hall near the river."), line("席は少ないので早めに行きます。", "せきはすくないのではやめにいきます。", "They go early because seating is limited."), line("入口で白いカードを見せます。", "いりぐちでしろいかーどをみせます。", "A white card is shown at the entrance.")] },
  { topic: "libraries", title: "本の予約", summary: "reserving and collecting a library book", lines: [line("読みたい本が貸し出し中でした。", "よみたいほんがかしだしちゅうでした。", "The desired book was checked out."), line("図書館の機械でその本を予約しました。", "としょかんのきかいでそのほんをよやくしました。", "The book was reserved on the library machine."), line("用意できたらメールが来るそうです。", "よういできたらめーるがくるそうです。", "An email will arrive when it is ready."), line("メールの後、一週間以内に取りに行きます。", "めーるのあと、いっしゅうかんいないにとりにいきます。", "It must be collected within one week of the email.")] },
  { topic: "delivery", title: "荷物の受け取り", summary: "arranging a safe delivery time", lines: [line("きのう荷物を受け取れませんでした。", "きのうにもつをうけとれませんでした。", "A parcel could not be received yesterday."), line("紙に書かれた番号で時間をえらびます。", "かみにかかれたばんごうでじかんをえらびます。", "A new time is selected using the number on the slip."), line("明日の夜なら家にいる予定です。", "あしたのよるならいえにいるよていです。", "Someone plans to be home tomorrow evening."), line("荷物は玄関で名前を確認して受け取ります。", "にもつはげんかんでなまえをかくにんしてうけとります。", "The name is checked at the door before receiving it.")] },
  { topic: "accommodation", title: "宿の部屋", summary: "choosing a practical room at an inn", lines: [line("旅行の宿で二つの部屋を見ました。", "りょこうのやどでふたつのへやをみました。", "Two rooms were viewed at the inn."), line("広い部屋は階段の上にあります。", "ひろいへやはかいだんのうえにあります。", "The large room is upstairs."), line("小さい部屋は風呂に近くて静かです。", "ちいさいへやはふろにちかくてしずかです。", "The small room is quiet and near the bath."), line("荷物が重いので小さい部屋を選びます。", "にもつがおもいのでちいさいへやをえらびます。", "The small room is chosen because the luggage is heavy.")] },
  { topic: "neighbourhoods", title: "新しい広場", summary: "using a new neighbourhood square thoughtfully", lines: [line("近所に小さな広場ができました。", "きんじょにちいさいひろばができました。", "A small square opened in the neighbourhood."), line("朝は子どもが遊び、夕方は犬を連れた人が来ます。", "あさはこどもがあそび、ゆうがたはいぬをつれたひとがきます。", "Children visit in the morning and dog walkers in the evening."), line("自転車は入口の左に置く決まりです。", "じてんしゃはいりぐちのひだりにおくきまりです。", "Bicycles must be left to the left of the entrance."), line("夜は静かに使うことになっています。", "よるはしずかにつかうことになっています。", "At night, the square is to be used quietly.")] },
  { topic: "technology", title: "写真の送り方", summary: "sending selected photos efficiently", lines: [line("電話の写真が多くなりました。", "でんわのしゃしんがおおくなりました。", "There are now many photos on the phone."), line("同じ写真を消してから送りたい物を選びます。", "おなじしゃしんをけしてからおくりたいものをえらびます。", "Duplicates are deleted before choosing photos to send."), line("大きい写真は一度に二まいだけ送ります。", "おおきいしゃしんはいちどににまいだけおくります。", "Only two large photos are sent at once."), line("送った後で相手に見えたか確認します。", "おくったあとであいてにみえたかかくにんします。", "After sending, receipt is confirmed.")] },
  { topic: "study-habits", title: "短い復習", summary: "using brief repeated study sessions", lines: [line("長く勉強するより短い復習を続けます。", "ながくべんきょうするよりみじかいふくしゅうをつづけます。", "Short repeated review is preferred to one long study session."), line("朝は新しい言葉を五つ読みます。", "あさはあたらしいことばをいつつよみます。", "Five new words are read in the morning."), line("夜はまちがえた問題だけ見直します。", "よるはまちがえたもんだいだけみなおします。", "At night, only missed questions are reviewed."), line("毎週日曜日にできたことを確かめます。", "まいしゅうにちようびにできたことをたしかめます。", "Progress is checked every Sunday.")] },
  { topic: "mistakes-and-corrections", title: "名前の直し方", summary: "correcting a written name clearly", lines: [line("申込書に名前をまちがえて書きました。", "もうしこみしょになまえをまちがえてかきました。", "A name was written incorrectly on a form."), line("受付の人に直し方を聞きました。", "うけつけのひとになおしかたをききました。", "The receptionist was asked how to correct it."), line("まちがえた所に一本線を引きます。", "まちがえたところにいっぽんせんをひきます。", "One line is drawn through the error."), line("その横に正しい名前を書きます。", "そのよこにただしいなまえをかきます。", "The correct name is written beside it.")] },
  { topic: "lost-items", title: "青い手ぶくろ", summary: "retracing steps to find a lost glove", lines: [line("帰り道で青い手ぶくろがないと気づきました。", "かえりみちであおいてぶくろがないときづきました。", "A blue glove was noticed missing on the way home."), line("まず、店の前のいすを見に戻りました。", "まず、みせのまえのいすをみにもどりました。", "First, the bench outside the shop was checked."), line("そこにはなかったので店の人に聞きました。", "そこにはなかったのでみせのひとにききました。", "It was not there, so the shop worker was asked."), line("手ぶくろは店の入口に届いていました。", "てぶくろはみせのいりぐちにとどいていました。", "The glove had been handed in at the entrance.")] },
  { topic: "rules", title: "共同の台所", summary: "following shared-kitchen rules", lines: [line("共同の台所は朝六時から使えます。", "きょうどうのだいどころはあさろくじからつかえます。", "The shared kitchen can be used from six in the morning."), line("使った皿は自分で洗う決まりです。", "つかったさらはじぶんであらうきまりです。", "Users must wash their own dishes."), line("大きな音が出る機械は夜に使えません。", "おおきなおとがでるきかいはよるにつかえません。", "Noisy machines cannot be used at night."), line("最後に電気を消したか確かめます。", "さいごにでんきをけしたかたしかめます。", "Finally, users check that the light is off.")] },
  { topic: "invitations", title: "庭への招待", summary: "responding clearly to an invitation", lines: [line("友だちから庭でお茶を飲む招待が来ました。", "ともだちからにわでおちゃをのむしょうたいがきました。", "A friend invited the writer for tea in the garden."), line("土曜日は仕事なので日曜日を希望します。", "どようびはしごとなのでにちようびをきぼうします。", "Sunday is preferred because Saturday is a workday."), line("食べられない物が一つあると伝えます。", "たべられないものがひとつあるとつたえます。", "One food restriction is mentioned."), line("何時に行けばいいかも質問します。", "なんじにいけばいいかもしつもんします。", "The arrival time is also asked.")] },
  { topic: "daily-routines", title: "夜の準備", summary: "preparing at night for an easier morning", lines: [line("朝いそがないように夜に準備します。", "あさいそがないようによるにじゅんびします。", "Preparation is done at night to avoid a rushed morning."), line("着る物と持って行く本を出しておきます。", "きるものともっていくほんをだしておきます。", "Clothes and books are set out in advance."), line("目覚まし時計は七時に合わせます。", "めざましどけいはしちじにあわせます。", "The alarm is set for seven."), line("最後に明日の天気を見てから寝ます。", "さいごにあしたのてんきをみてからねます。", "Finally, tomorrow's weather is checked before bed.")] },
];

const N4_EXTRA = [
  line("そのことを忘れないように、短いメモも残しておきます。", "そのことをわすれないように、みじかいめもものこしておきます。", "A short note is left so that the matter is not forgotten."),
  line("急いで決めるより、必要な情報を比べるほうが安心です。", "いそいできめるより、ひつようなじょうほうをくらべるほうがあんしんです。", "Comparing the necessary information is safer than deciding in a hurry."),
  line("予定どおりに進まない場合は、先に相手へ知らせるつもりです。", "よていどおりにすすまないばあいは、さきにあいてへしらせるつもりです。", "If things do not go to plan, the other person will be told first."),
  line("終わった後で一度確認すれば、同じまちがいを減らせます。", "おわったあとでいちどかくにんすれば、おなじまちがいをへらせます。", "Checking once afterward can reduce the same mistakes."),
  line("一人で考えながら、分からない所だけ周りの人に聞きます。", "ひとりでかんがえながら、わからないところだけまわりのひとにききます。", "While thinking independently, only unclear points are asked about."),
  line("まず自分で試してみれば、必要な変更が分かります。", "まずじぶんでためしてみれば、ひつようなへんこうがわかります。", "Trying it first reveals what needs to change."),
  line("必要な物は前の日に準備しておくことにしました。", "ひつようなものはまえのひにじゅんびしておくことにしました。", "A decision was made to prepare the necessary items the day before."),
  line("少し予定が変わっても、全部をやめなくてもいいです。", "すこしよていがかわっても、ぜんぶをやめなくてもいいです。", "Even if the plan changes slightly, everything need not be cancelled."),
  line("午後はこんでいるかもしれないので、午前に行きます。", "ごごはこんでいるかもしれないので、ごぜんにいきます。", "It may be crowded in the afternoon, so the visit is in the morning."),
  line("案内によると、来週から時間が変わるそうです。", "あんないによると、らいしゅうからじかんがかわるそうです。", "According to the notice, the time will change next week."),
  line("雨なら近い場所を選ぶと、歩きやすくなります。", "あめならちかいばしょをえらぶと、あるきやすくなります。", "If it rains, choosing a nearby place makes walking easier."),
  line("字が小さいと読みにくいので、大きく書き直します。", "じがちいさいとよみにくいので、おおきくかきなおします。", "Small writing is hard to read, so it is rewritten larger."),
];
const N5_EXTRA = [
  line("この予定は大切です。", "このよていはたいせつです。", "This plan is important."),
  line("終わってから、もう一度見ます。", "おわってから、もういちどみます。", "After finishing, it is checked once more."),
  line("分からないので、近くの人に聞きます。", "わからないので、ちかくのひとにききます。", "Because it is unclear, someone nearby is asked."),
];

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function codePoints(value: string): number { return [...value.replaceAll("\n", "")].length; }
function rotate<T>(values: readonly T[], offset: number): T[] {
  return values.map((_, index) => values[(index + offset) % values.length] as T);
}
function passageCounts(level: Level): Array<[PassageType, number]> {
  return level === "N5" ? [["short", 36], ["medium", 18], ["practical", 12]] : [["short", 40], ["medium", 24], ["practical", 16]];
}
function difficulty(level: Level, index: number): { jlptLevel: Level; rank: number } {
  if (level === "N5") return { jlptLevel: level, rank: index < 30 ? 1 : index < 60 ? 3 : 4 };
  return { jlptLevel: level, rank: index < 20 ? 2 : index < 64 ? 3 : 4 };
}
function grammarIdsFor(text: string, level: Level, grammarIds: ReadonlySet<string>): string[] {
  const candidates: Array<[string, string]> = [
    ["です", "grammar-desu"], ["ので", "grammar-node"], ["てから", "grammar-tekara"],
    ["こと", "grammar-n4-koto-nominalizer"], ["までに", "grammar-n4-made-ni"],
    ["ながら", "grammar-n4-nagara"], ["後で", "grammar-n4-ato-de"],
    ["場合", "grammar-n4-baai-wa"], ["ように", "grammar-n4-you-ni-suru"],
    ["てみれば", "grammar-n4-te-miru"], ["ば", "grammar-n4-ba"],
    ["ておく", "grammar-n4-te-oku"], ["ことにしました", "grammar-n4-koto-ni-suru"],
    ["なくてもいい", "grammar-n4-nakutemo-ii"], ["ても", "grammar-n4-temo-concession"],
    ["かもしれない", "grammar-n4-kamo-shirenai"], ["そうです", "grammar-n4-souda-hearsay"],
    ["なら", "grammar-n4-nara"], ["やすく", "grammar-n4-yasui"], ["にくい", "grammar-n4-nikui"],
  ];
  const found = candidates.filter(([surface, id]) => text.includes(surface) && grammarIds.has(id)).map(([, id]) => id);
  const fallback = grammarIds.has("grammar-desu") ? "grammar-desu" : [...grammarIds][0];
  const substantive = found.filter((id) => id !== "grammar-desu");
  return [...new Set((substantive.length > 0 ? substantive : found.length > 0 ? found : [fallback]).filter((id): id is string => Boolean(id)))]
    .slice(0, level === "N5" ? 2 : 3)
    .sort(compareStable);
}
function vocabularyIdsFor(text: string, vocabulary: readonly VocabularyRecord[]): string[] {
  return vocabulary.filter((record) => {
    const surfaces = [record.primaryForm, ...record.writtenForms.map(({ text: form }) => form)];
    return surfaces.some((surface) => [...surface].length >= 2 && text.includes(surface));
  }).map(({ id }) => id).sort(compareStable);
}
function kanjiIdsFor(text: string, kanji: readonly KanjiRecord[]): string[] {
  return kanji.filter(({ character }) => text.includes(character)).map(({ id }) => id).sort(compareStable);
}

function glossaryFor(text: string, level: Level): ReadingPassage["glossary"] {
  const candidates = [
    { term: "受付", reading: "うけつけ", meaning: "reception desk", n5Outside: true, n4Outside: false },
    { term: "申込書", reading: "もうしこみしょ", meaning: "application form", n5Outside: true, n4Outside: true },
    { term: "貸し出し中", reading: "かしだしちゅう", meaning: "currently checked out", n5Outside: true, n4Outside: false },
    { term: "共同", reading: "きょうどう", meaning: "shared; communal", n5Outside: true, n4Outside: false },
    { term: "変更", reading: "へんこう", meaning: "change; alteration", n5Outside: true, n4Outside: false },
    { term: "区役所", reading: "くやくしょ", meaning: "ward office", n5Outside: true, n4Outside: true },
  ];
  return candidates.filter(({ term }) => text.includes(term)).map(({ term, reading, meaning, n5Outside, n4Outside }) => ({
    term, reading, meaning, outOfLevel: level === "N5" ? n5Outside : n4Outside,
  }));
}

function practicalLines(level: Level, scenario: Scenario, index: number): Line[] {
  const time = TIMES[index % TIMES.length] as string;
  const timeReading = TIME_READINGS[index % TIME_READINGS.length] as string;
  return [
    line("青空センターからのお知らせ", "あおぞらせんたーからのおしらせ", `Aozora Center notice about ${scenario.summary}`),
    scenario.lines[0] as Line,
    line(`日にち：来週の土曜日`, "ひにち：らいしゅうのどようび", "Date: next Saturday"),
    line(`時間：${time}から二時間`, `じかん：${timeReading}からにじかん`, `Time: two hours from ${time}`),
    line(`場所：二階の青い部屋`, "ばしょ：にかいのあおいへや", "Place: the blue room on the second floor"),
    line(`雨の場合も行います。受付Aへ知らせてください。`, "あめのばあいもおこないます。うけつけえーへしらせてください。", "It will also take place if it rains. Contact Reception A."),
    level === "N5"
      ? line("初めての人も参加できます。", "はじめてのひともさんかできます。", "First-time participants may also join.")
      : line("参加する人は開始十分前までに受付を済ませてください。", "さんかするひとはかいしじゅっぷんまえまでにうけつけをすませてください。", "Participants must finish reception ten minutes before the start."),
  ];
}

function selectedLines(level: Level, type: PassageType, scenario: Scenario, variant: number): Line[] {
  if (type === "practical") return practicalLines(level, scenario, variant);
  const rotated = rotate(scenario.lines, variant % scenario.lines.length);
  if (type === "short") {
    return level === "N5" ? [...rotated.slice(0, 2), N5_EXTRA[variant % N5_EXTRA.length] as Line] : [...rotated.slice(0, 3), N4_EXTRA[variant % N4_EXTRA.length] as Line];
  }
  return level === "N5"
    ? [...rotated, N5_EXTRA[variant % N5_EXTRA.length] as Line, N5_EXTRA[(variant + 1) % N5_EXTRA.length] as Line]
    : [...rotated, ...rotate(N4_EXTRA, variant % N4_EXTRA.length).slice(0, 5)];
}

function questionTypes(level: Level, type: PassageType, index: number): string[] {
  if (type === "practical") return ["specific-detail", "time-date-location", "condition-rule", "practical-action"];
  if (type === "medium") {
    const final = level === "N5"
      ? ["true-statement", "vocabulary-context", "appropriate-summary"][index % 3]
      : ["reference-resolution", "simple-inference", "grammar-context", "writer-intention", "best-title"][index % 5];
    return ["main-idea", "specific-detail", "sequence-order", final as string];
  }
  const contextual = level === "N5"
    ? ["true-statement", "false-statement", "vocabulary-context", "practical-action"][index % 4]
    : ["reference-resolution", "simple-inference", "writer-intention", "best-title", "appropriate-summary", "grammar-context"][index % 6];
  return ["specific-detail", index % 2 === 0 ? "main-idea" : "sequence-order", contextual as string];
}

function buildQuestionText(type: string, title: string): string {
  const prompts: Record<string, string> = {
    "main-idea": `What is the main idea of “${title}”?`,
    "specific-detail": `Which detail is stated in “${title}”?`,
    "sequence-order": `What happens first in “${title}”?`,
    "true-statement": `Which statement about “${title}” is true?`,
    "false-statement": `Which statement about “${title}” is false?`,
    "reference-resolution": `In “${title},” what does そのこと refer to?`,
    "vocabulary-context": `What does 予定 mean in the context of “${title}”?`,
    "grammar-context": `What relationship does ので express in “${title}”?`,
    "writer-intention": `Why did the writer provide the information in “${title}”?`,
    "practical-action": `What is the most appropriate action after reading “${title}”?`,
    "time-date-location": `Which time or place matches “${title}”?`,
    "condition-rule": `Which condition or rule applies in “${title}”?`,
    "simple-inference": `What can reasonably be inferred from “${title}”?`,
    "best-title": `Which is the best title for “${title}”?`,
    "appropriate-summary": `Which sentence best summarizes “${title}”?`,
  };
  return prompts[type] ?? `Which answer matches “${title}”?`;
}

function answerSet(type: string, passage: ReadingPassage, scenario: Scenario, scenarioIndex: number, lines: Line[]): string[] {
  const other = [1, 2, 3].map((offset) => SCENARIOS[(scenarioIndex + offset) % SCENARIOS.length] as Scenario);
  const summary = `The passage is about ${scenario.summary}.`;
  if (type === "main-idea") return [summary, ...other.map(({ summary: value }) => `The passage is about ${value}.`)];
  if (type === "appropriate-summary") return [`A suitable summary is ${scenario.summary}.`, ...other.map(({ summary: value }) => `A suitable summary is ${value}.`)];
  if (type === "writer-intention") return [`The writer intends to explain ${scenario.summary}.`, ...other.map(({ summary: value }) => `The writer intends to explain ${value}.`)];
  if (type === "simple-inference") return [`It is reasonable to infer a concern with ${scenario.summary}.`, ...other.map(({ summary: value }) => `It is reasonable to infer a concern with ${value}.`)];
  if (type === "reference-resolution") return [`It refers to the information about ${scenario.summary}.`, ...other.map(({ summary: value }) => `It refers to the information about ${value}.`)];
  if (type === "best-title") return [passage.title ?? scenario.title, ...other.map(({ title }) => title)];
  if (type === "sequence-order") return [lines[0]?.english ?? summary, ...(lines.slice(1, 4).map(({ english }) => english))].slice(0, 4);
  if (type === "false-statement") return [other[0]?.lines[0]?.english ?? "An unrelated event occurs.", ...lines.slice(0, 3).map(({ english }) => english)];
  if (type === "true-statement") return [`It is true that ${lines[1]?.english ?? summary}`, ...other.map(({ lines: otherLines }) => `It is true that ${otherLines[1]?.english ?? otherLines[0]?.english ?? "an unrelated event occurs"}`)];
  if (type === "vocabulary-context") return ["a plan or schedule", "a price reduction", "a lost object", "a personal name"];
  if (type === "grammar-context") return ["a reason or cause", "a direct quotation", "a comparison only", "an unrelated list"];
  if (type === "time-date-location") {
    const detail = passage.structuredContent?.lines.find(({ japanese }) => japanese.startsWith("時間"))?.english ?? "The stated time";
    return [detail, "Time: one hour from seven", "Place: the red room on the first floor", "Date: this Sunday"];
  }
  if (type === "condition-rule") return ["It still takes place if it rains.", "It is cancelled whenever it rains.", "Only staff may attend.", "No contact is permitted."];
  if (type === "practical-action") return passage.passageType === "practical"
    ? ["Follow the listed time and place, and contact Reception A if needed.", "Go to a real business with the same name.", "Wait for an unstated telephone call.", "Ignore the stated condition."]
    : [summary, ...other.map(({ summary: value }) => `Act as if the passage were about ${value}.`)];
  return [lines[1]?.english ?? summary, ...other.map(({ lines: otherLines }) => otherLines[1]?.english ?? otherLines[0]?.english ?? "An unrelated detail")];
}

function explanation(type: string, correct: string, lines: Line[]): string {
  const support = type === "sequence-order" ? "the first passage section" : "the passage's explicit details and stated purpose";
  return `Correct: “${correct}” matches ${support}. Each other option either changes the person, time, place, condition, sequence, or topic and is not supported. Strategy: identify the requested detail, then eliminate choices that contradict the passage.`;
}

function makeQuestion(
  passage: ReadingPassage,
  scenario: Scenario,
  scenarioIndex: number,
  lines: Line[],
  type: string,
  position: number,
): { question: Question; options: QuestionOption[]; target: QuestionTargetRelationship; metadata: LearningContentCollections["learningItemMetadata"][number] } {
  const suffix = `${passage.id.replace("reading-passage-", "")}-${type}-${position}`;
  const questionId = `question-reading-${suffix}`;
  const rawAnswers = answerSet(type, passage, scenario, scenarioIndex, lines);
  const scopedAnswers = rawAnswers.map((answer) => `${answer} — for “${passage.title ?? passage.id}”`);
  const answers = scopedAnswers.length >= 4 ? scopedAnswers.slice(0, 4) : [...scopedAnswers, ...scopedAnswers].slice(0, 4);
  const optionIds = answers.map((_, index) => `question-option-reading-${suffix}-${index + 1}`);
  const question: Question = {
    schemaVersion: 1, id: questionId, domain: "reading", presentation: "multiple-choice",
    responseType: "single-select", prompt: { text: buildQuestionText(type, passage.title ?? passage.id), language: "en" },
    stimulusReferences: [{ type: "reading-passage", id: passage.id }], correctOptionIds: [optionIds[0] as string],
    explanation: explanation(type, answers[0] as string, lines), difficulty: passage.difficulty,
    examMetadata: { jlptLevel: passage.level, section: "reading", formatCode: type, recommendedSeconds: passage.passageType === "short" ? 45 : 70 },
    usageContexts: ["assessment", "lesson", "review"], tags: [`type-${type}`], sourceIds: [QUESTION_SOURCE], attribution: ATTRIBUTION,
    confidence: 0.96, needsReview: false, releaseReady: false,
  };
  const options: QuestionOption[] = answers.map((text, index) => ({
    schemaVersion: 1, id: optionIds[index] as string, questionId, position: index + 1,
    content: { type: "text", text, language: "en" },
    feedback: index === 0 ? "This matches the passage." : "This changes or adds information not supported by the passage.",
    confidence: 0.96, needsReview: false, releaseReady: false,
  }));
  return {
    question, options,
    target: { schemaVersion: 1, id: `question-target-reading-${suffix}`, questionId, targetType: "reading-passage", targetId: passage.id, role: "primary", skill: "comprehension", confidence: 0.96, needsReview: false, releaseReady: false },
    metadata: { schemaVersion: 1, id: `learning-item-question-reading-${suffix}`, itemType: "question", itemId: questionId, reviewable: true, skills: ["contextual-usage", "meaning-recognition"], availableModes: ["assessment", "quiz", "reading"], estimatedReviewSeconds: passage.passageType === "short" ? 45 : 70, tags: [`reading-${type}`], confidence: 0.96, needsReview: false, releaseReady: false },
  };
}

export async function authorReadingContent(): Promise<void> {
  const [grammarN5, grammarN4, vocabularyN5, vocabularyN4, kanjiN5, kanjiN4, unitsN5, unitsN4] = await Promise.all([
    readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n5.json")), readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n4.json")),
    readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n5.json")), readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n4.json")),
    readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n5.json")), readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n4.json")),
    readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n5.json")), readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n4.json")),
  ]);
  const catalog = { N5: { grammar: grammarN5, vocabulary: vocabularyN5, kanji: kanjiN5, units: unitsN5 }, N4: { grammar: [...grammarN5, ...grammarN4], vocabulary: [...vocabularyN5, ...vocabularyN4], kanji: [...kanjiN5, ...kanjiN4], units: unitsN4 } };
  const passages: ReadingPassage[] = [];
  const questions: Question[] = [];
  const options: QuestionOption[] = [];
  const targets: QuestionTargetRelationship[] = [];
  const metadata: LearningContentCollections["learningItemMetadata"] = [];
  for (const level of ["N5", "N4"] as const) {
    let levelIndex = 0;
    for (const [type, count] of passageCounts(level)) {
      for (let typeIndex = 0; typeIndex < count; typeIndex += 1) {
        const scenarioIndex = (levelIndex * 7 + (level === "N4" ? 3 : 0)) % SCENARIOS.length;
        const scenario = SCENARIOS[scenarioIndex] as Scenario;
        const variant = Math.floor(levelIndex / SCENARIOS.length) + typeIndex;
        const bodyLines = selectedLines(level, type, scenario, variant);
        const uniqueLead = level === "N5"
          ? line(`今日は${NAMES[levelIndex % NAMES.length]}の予定です。`, `きょうは${NAMES[levelIndex % NAMES.length]}のよていです。`, `This is ${NAMES[levelIndex % NAMES.length]}'s plan for today.`)
          : line(`${NAMES[levelIndex % NAMES.length]}は予定を変える前に情報を確認しました。`, `${NAMES[levelIndex % NAMES.length]}はよていをかえるまえにじょうほうをかくにんしました。`, `${NAMES[levelIndex % NAMES.length]} checked the information before changing the plan.`);
        const lines = type === "practical" ? bodyLines : [uniqueLead, ...bodyLines];
        const japanese = lines.map((item) => item.japanese).join(type === "practical" ? "\n" : "");
        const reading = lines.map((item) => item.reading).join(type === "practical" ? "\n" : "");
        const english = lines.map((item) => item.english).join(" ");
        const serial = String(typeIndex + 1).padStart(3, "0");
        const passageId = `reading-passage-${level.toLowerCase()}-${type}-${serial}`;
        const title = `${NAMES[levelIndex % NAMES.length]}の${scenario.title}・${TIMES[levelIndex % TIMES.length]}の${level === "N5" ? "やさしい記録" : "くわしい記録"}`;
        const questionIds = questionTypes(level, type, levelIndex).map((questionType, index) =>
          `question-reading-${passageId.replace("reading-passage-", "")}-${questionType}-${index + 1}`,
        ).sort(compareStable);
        const levelCatalog = catalog[level];
        const passage = readingPassageSchema.parse({
          schemaVersion: 1, id: passageId, level, passageType: type, title, japanese, reading, english,
          structuredContent: type === "practical" ? { kind: ["notice", "schedule", "message", "event-information", "instructions", "delivery-note"][typeIndex % 6], lines: lines.map((item, index) => ({ position: index + 1, ...item })) } : null,
          glossary: glossaryFor(japanese, level), difficulty: difficulty(level, levelIndex), topicTags: [scenario.topic],
          grammarIds: grammarIdsFor(japanese, level, new Set(levelCatalog.grammar.map(({ id }) => id))),
          vocabularyIds: vocabularyIdsFor(japanese, levelCatalog.vocabulary), kanjiIds: kanjiIdsFor(japanese, levelCatalog.kanji),
          curriculumUnitIds: [(levelCatalog.units[levelIndex % levelCatalog.units.length] as CurriculumUnit).id], questionIds,
          estimatedReadingSeconds: Math.max(15, Math.ceil(codePoints(japanese) / (level === "N5" ? 2.4 : 3))),
          sourceIds: [SOURCE_BY_LEVEL[level]], attribution: ATTRIBUTION,
          provenance: { sourceType: "original-japango", authoringMethod: "original-editorial-authoring" },
          reviewStatus: "development-only", releaseBlockers: ["curriculum-parent-not-release-ready"], confidence: 0.96, needsReview: false, releaseReady: false,
        });
        passages.push(passage);
        for (const [questionIndex, typeName] of questionTypes(level, type, levelIndex).entries()) {
          const built = makeQuestion(passage, scenario, scenarioIndex, lines, typeName, questionIndex + 1);
          questions.push(built.question); options.push(...built.options); targets.push(built.target); metadata.push(built.metadata);
        }
        levelIndex += 1;
      }
    }
  }
  passages.sort((a, b) => compareStable(a.id, b.id)); questions.sort((a, b) => compareStable(a.id, b.id));
  options.sort((a, b) => compareStable(a.questionId, b.questionId) || a.position - b.position || compareStable(a.id, b.id));
  targets.sort((a, b) => compareStable(a.id, b.id)); metadata.sort((a, b) => compareStable(a.id, b.id));
  const n5 = passages.filter(({ level }) => level === "N5"); const n4 = passages.filter(({ level }) => level === "N4");
  const questionFile = { schemaVersion: 1, questions, questionOptions: options, learningItemMetadata: metadata, questionTargetRelationships: targets };
  const editorial = { schemaVersion: 1, corpusName: "JapanGo's original JLPT N5/N4-aligned reading passage and reading-comprehension corpus", decisions: [
    { id: "reading-decision-direct-passage-text", decision: "Store passage text once in the passage registry and reference passage IDs from questions." },
    { id: "reading-decision-no-sentence-duplication", decision: "Create zero passage Sentence records because the compatible model stores passage text directly." },
    { id: "reading-decision-lifecycle", decision: "Keep all 146 quality-valid passages development-only while every curriculum parent is non-release." },
    { id: "reading-decision-inventory", decision: "Use existing grammar, vocabulary, and kanji inventories without expansion." },
  ] };
  learningContentCollectionsSchema.parse({ schemaVersion: 1, sentences: [], readingPassages: passages, grammarExampleViews: [], vocabularyExampleViews: [], kanjiExampleViews: [], questions, questionOptions: options, learningItemMetadata: metadata, questionTargetRelationships: targets });
  await Promise.all([
    writeJson(SOURCE_PATHS.readingPassageCorpusN5, n5), writeJson(SOURCE_PATHS.readingPassageCorpusN4, n4),
    writeJson(SOURCE_PATHS.readingQuestionCorpus, questionFile), writeJson(SOURCE_PATHS.readingEditorialDecisions, editorial),
  ]);
  console.log(`Authored ${n5.length} N5 and ${n4.length} N4 passages with ${questions.length} questions and ${options.length} options.`);
}

if (isDirectExecution(import.meta.url)) runCli(authorReadingContent);
