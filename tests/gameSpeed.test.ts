import { describe, expect, it } from 'vitest';
import { formatPlaySpeed, nextPlaySpeed, PLAY_SPEEDS } from '../src/ui/gameSpeed';

describe('game speed controls', () => {
  it('cycles through every supported play speed and returns to normal', () => {
    let speed = 1;
    const visited = [];
    for (let i = 0; i < PLAY_SPEEDS.length; i++) {
      speed = nextPlaySpeed(speed);
      visited.push(speed);
    }
    expect(visited).toEqual([1.5, 2, 3, 1]);
  });

  it('recovers from a custom debug speed by returning to normal speed', () => {
    expect(nextPlaySpeed(0.75)).toBe(1);
  });

  it('formats the compact HUD label', () => {
    expect(formatPlaySpeed(1.5)).toBe('1.5×');
  });
});
