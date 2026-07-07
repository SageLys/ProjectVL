/** 键盘：P 键切换暂停。 */
export function createKeyboard(onTogglePause: () => void): void {
  addEventListener('keydown', e => {
    if (e.code === 'KeyP') onTogglePause();
  });
}
