import type { GameEvent, GameState } from './types';

/** 结束对局：置为 ended 并暂停。胜负由 win 决定，表现层据 gameEnd 事件弹结算。 */
export function endGame(state: GameState, win: boolean): GameEvent[] {
  state.mode = 'ended';
  state.paused = true;
  return [{ type: 'gameEnd', win }];
}
