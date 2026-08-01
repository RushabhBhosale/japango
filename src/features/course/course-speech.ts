/**
 * The authored course keeps character names in their natural written form.
 * Some Japanese system voices resolve the name kanji 蓮 as はす (lotus), so
 * convert it to the authored name reading only for speech playback.
 */
export function courseSpeechText(text: string): string {
  return text.replaceAll('蓮', 'れん');
}
