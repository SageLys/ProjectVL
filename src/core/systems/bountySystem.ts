import type { Config, GameEvent, GameState, Rng } from '../types';

/** New Bounty lifecycle hook. Director and encounter behavior are implemented in later phases. */
export function tickBountySystem(_state: GameState, _config: Config, _rng: Rng, _dt: number): GameEvent[] {
  return [];
}
