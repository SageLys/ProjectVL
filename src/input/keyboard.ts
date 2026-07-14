/** 键盘：P 键切换暂停。 */
export function createKeyboard(onTogglePause: () => void): void {
  addEventListener('keydown', e => {
    // Ignore key-repeat so holding P cannot immediately pause and resume again.
    if (e.code !== 'KeyP' || e.repeat) return;
    e.preventDefault();
    onTogglePause();
  });
}
