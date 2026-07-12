import { cfg } from '../config';
import type { GameState } from './types';

/**
 * 玩家主动指令的统一入口守卫。
 * ended/ready 永远拒绝；paused 是否可操作由 input.strictPause 统一决定，避免各系统口径漂移。
 */
export function canIssueGameplayCommand(state: GameState): boolean {
  return state.mode === 'playing' && (!cfg.input.strictPause || !state.paused);
}
