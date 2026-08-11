# JapanGo design system

JapanGo is a calm, story-led Japanese learning companion for adult learners studying in short daily sessions. The interface should feel like a contemporary Japanese study journal: precise, quiet, readable, and purposeful without decorative stereotypes.

## Design direction

- Style: contemporary study journal / editorial learning interface.
- Signature: a slim indigo learning ribbon or edge rule marks the current activity and its position.
- Hierarchy: one dominant action per screen; supporting actions use open rows and ruled sections instead of equal cards.
- Motion: restrained 150–250ms state feedback only. No ambient or decorative motion.
- Shape: mostly 8–20px radii. Reserve pills for statuses, filters, and compact controls.
- Surfaces: matte and low-elevation. Use borders and spacing before shadows.

## Color tokens

| Role | Light | Dark | Name |
|---|---:|---:|---|
| Background | `#F4F5F2` | `#161719` | Mineral paper |
| Surface | `#FCFDFB` | `#202124` | Reading sheet |
| Text | `#24252A` | `#F2F2EF` | Sumi ink |
| Secondary text | `#686A70` | `#B7B8B4` | Graphite |
| Primary | `#505777` | `#B8BDE0` | Aizome indigo |
| Primary soft | `#E7E9F0` | `#303344` | Indigo wash |
| Success | `#426C5A` | `#82B39C` | Moss |
| Error | `#B4555A` | `#E6A0A4` | Muted vermilion |
| Border | `#D9DCD6` | `#3B3D3F` | Pencil rule |

All body text must meet 4.5:1 contrast. Success/error states always include an icon or text label, never color alone.

## Typography

- Interface: native Japanese-capable sans (`Hiragino Sans`, system sans, Android Noto Sans fallback).
- Editorial/readings: native Japanese serif/Mincho (`Hiragino Mincho ProN`, `Yu Mincho`, Android serif fallback).
- Display/page title: 32/40, bold editorial.
- Section heading: 22/30, bold interface.
- Card title: 18/26, bold interface.
- Body: 16/25, regular interface.
- Japanese reading body: 28/47 with natural wrapping and a medium editorial face.
- Caption: 13/19, medium interface.
- Metadata: 12/17, bold with restrained tracking.
- Button: 16/22, bold interface.

Never reduce Japanese below readable size to solve overflow. Wrap and reflow instead.

## Spacing and layout

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 48, 64.
- Phone gutters: 16px; tablet gutters: 24–32px.
- General content max width: 760px.
- Long-form reading max width: 700px.
- Touch targets: 48px preferred, 44px absolute minimum.
- Rows containing text must give text containers `flex: 1`, `minWidth: 0`, and wrapping/shrinking behavior.
- No horizontal ScrollView may be introduced to hide a broken layout. Filter pills are the only intentional compact horizontal control.

## Core patterns

### Home

1. Greeting and current level.
2. Today progress rule.
3. Dominant current-lesson cover with learning ribbon and one CTA.
4. Daily activity rows: reading, vocabulary, exam practice.
5. N5/N4 progress sections with expandable course lists.

### Lessons

- Persistent, compact progress header.
- One scene per viewport with generous measure.
- Stable bottom action area with one primary action.
- Teaching moments use a ruled editorial block, not nested cards.

### Daily Reading

- Passage sits directly on the page, not inside a cramped card.
- Serif Japanese body with generous paragraph rhythm.
- Sticky-looking but normally scrolling reading controls and clear progress.
- Questions are separated by rules and use wrapping option rows.

### Vocabulary and exams

- Flashcard is the single elevated object on the vocabulary screen.
- Exam lists are open, ruled rows; exam questions use distraction-free reading measure.
- Results summarize first, then reveal review details with explicit correct/review labels.

## Avoid

- Generic analytics/dashboard grids.
- A wall of equal rounded cards.
- Decorative Japanese motifs, faux stamps, cherry blossoms, or flag colors.
- Emojis as structural icons.
- Hardcoded component colors outside semantic theme tokens.
- Fixed-width text rows, single-line truncation of learning content, or horizontal page scrolling.
- More than one dominant CTA per screen.
