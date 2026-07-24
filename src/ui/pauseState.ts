/** 合成玩家手动暂停与临时 UI 暂停原因。 */
export function resolvePauseState(manualPaused: boolean, uiPauseReasons: ReadonlySet<string>): boolean {
  return manualPaused || uiPauseReasons.size > 0;
}
