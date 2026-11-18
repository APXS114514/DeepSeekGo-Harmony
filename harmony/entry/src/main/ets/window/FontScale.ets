/** AppStorage 中保存系统字体缩放比例的键，EntryAbility 写入，Index 页面读取。 */
export const FONT_SCALE_KEY = 'pocketChatFontScale';

/** 与 AppScope 的 configuration.json 中 fontSizeMaxScale 一致，网页正文按同一上限缩放。 */
export const MAX_FONT_SCALE = 1.75;
const MIN_FONT_SCALE = 0.8;

export function clampFontScale(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value)) : 1;
}
