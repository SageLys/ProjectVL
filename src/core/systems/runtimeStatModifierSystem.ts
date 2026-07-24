import type { GameState, RuntimeStatModifier } from '../types';

export interface ModifierTotal {
  add: number;
  mul: number;
}

export function modifierTotal(
  state: GameState,
  stat: RuntimeStatModifier['stat'],
): ModifierTotal {
  let add = 0;
  let mul = 1;
  for (const modifier of state.statModifiers) {
    if (modifier.stat !== stat) continue;
    if (modifier.operation === 'add') add += modifier.value;
    else mul *= modifier.value;
  }
  return { add, mul };
}
