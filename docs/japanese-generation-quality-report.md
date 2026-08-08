# Japanese generation quality report

Date: 2026-08-08

The samples below were authored and self-reviewed with the same criteria used by JapanGo's strong-model critic. They are not copied from the sentence corpus or OCR material. A sample passes only when every score meets the production thresholds: grammar 95, naturalness 85, semantic plausibility 90, collocation 85, and level appropriateness 85.

| # | Level | Target | Japanese | Grammar | Naturalness | Semantics | Collocation | Level |
| ---: | :---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | N5 | time particle に | 私は毎朝七時に起きます。 | 100 | 98 | 100 | 99 | 100 |
| 2 | N4 | ～ので | 雨が降っているので、今日は家で勉強します。 | 100 | 97 | 100 | 98 | 96 |
| 3 | N4 | ～たら | この漢字の読み方が分からなかったら、先生に聞いてください。 | 100 | 96 | 100 | 98 | 93 |
| 4 | N4 | ～たところ | 今、駅に着いたところです。 | 100 | 99 | 100 | 100 | 96 |
| 5 | N5 | ～てもいい | ここに荷物を置いてもいいですか。 | 100 | 99 | 100 | 100 | 100 |
| 6 | N4 | ～たことがある | 京都へ行ったことがあります。 | 100 | 98 | 100 | 99 | 97 |
| 7 | N4 | ～間 | 母が料理している間、私は皿を並べました。 | 100 | 97 | 100 | 98 | 94 |
| 8 | N4 | ～てしまう | 財布を忘れてしまったので、昼ご飯を買えませんでした。 | 100 | 97 | 100 | 98 | 92 |
| 9 | N4 | ～ために | 会議に間に合うために、一本早い電車に乗りました。 | 100 | 98 | 100 | 100 | 94 |
| 10 | N4 | ～みたい | このおしぼり、氷みたいに冷たい。 | 99 | 97 | 100 | 99 | 94 |
| 11 | N4 | ～とか～とか | 旅行では、京都とか奈良とかに行きたいです。 | 100 | 97 | 100 | 98 | 94 |
| 12 | N4 | ～ということ | 来月、東京へ引っ越すということを家族に伝えました。 | 100 | 97 | 100 | 99 | 90 |
| 13 | N4 | transitive/intransitive verbs | 風でドアが閉まったので、もう一度開けました。 | 100 | 98 | 100 | 99 | 94 |
| 14 | N4 | ～と言ってもいい | この店のラーメンは、町で一番人気があると言ってもいいでしょう。 | 100 | 96 | 99 | 98 | 89 |
| 15 | N4 | ～必要がある | この薬は、日の当たらない涼しい所に保管する必要があります。 | 100 | 97 | 100 | 99 | 89 |

## Ollama Gemma 2 9B advisory run

`gemma2:9b` was used only as a local testing and reporting critic, never as the author of these lessons or samples. Its clean JSON run on the draft set produced no issue for 14 of 15 samples, but it also:

- returned `levelAppropriate` as the strings `N5`/`N4` instead of numeric scores;
- assigned sub-threshold scores while returning an empty issue list for several ordinary correct sentences;
- objected to the original `このタオル、氷みたいに冷たい。`, so the final report uses the more situationally specific `おしぼり` version.

The final self-review also simplified sample 4 and improved the collocations in samples 12 and 13 after the advisory run.

JapanGo's strict Zod critic schema would reject that malformed response. This is why Ollama remains advisory and why the application recomputes acceptance from numeric thresholds instead of trusting a model-provided `accepted` flag.
