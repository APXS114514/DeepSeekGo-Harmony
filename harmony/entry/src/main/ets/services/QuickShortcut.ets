import { Want } from '@kit.AbilityKit';

/** 桌面长按快捷方式在 Want.parameters 中携带的动作参数名。 */
export const SHORTCUT_PARAM = 'pocketChatShortcut';
/** AppStorage 中待处理快捷方式的键，带递增序号确保连续点同一项也能触发监听。 */
export const SHORTCUT_KEY = 'pocketChatPendingShortcut';

const ALLOWED_SHORTCUTS: string[] = ['new-chat', 'voice', 'scan', 'incognito'];
let shortcutSequence: number = 0;

export function parseShortcutAction(want: Want): string {
  const raw = want.parameters?.[SHORTCUT_PARAM];
  return typeof raw === 'string' && ALLOWED_SHORTCUTS.includes(raw) ? raw : '';
}

export function recordShortcut(want: Want): boolean {
  const action = parseShortcutAction(want);
  if (!action) {
    return false;
  }
  shortcutSequence++;
  AppStorage.setOrCreate(SHORTCUT_KEY, `${action}:${shortcutSequence}`);
  return true;
}

export function extractShortcutAction(encoded: string): string {
  const separator = encoded.indexOf(':');
  const action = separator >= 0 ? encoded.substring(0, separator) : encoded;
  return ALLOWED_SHORTCUTS.includes(action) ? action : '';
}
