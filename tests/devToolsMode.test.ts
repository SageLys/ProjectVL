import { describe, expect, it } from 'vitest';
import { combatFormLabel, devToolsEnabled } from '../src/debug/devToolsMode';

describe('dev tools mode', () => {
  it('keeps both debug panels enabled in built previews by default', () => {
    expect(devToolsEnabled('')).toBe(true);
    expect(devToolsEnabled('?variant=dev-short')).toBe(true);
  });

  it('supports an explicit clean player-facing view', () => {
    expect(devToolsEnabled('?devtools=0')).toBe(false);
    expect(devToolsEnabled('?devtools=false')).toBe(false);
  });

  it('labels ordinary, transformed and fused weapon forms', () => {
    expect(combatFormLabel({ delivery: 'projectile', impacts: [] })).toBe('普通弹');
    expect(combatFormLabel({ delivery: 'line', impacts: [] })).toBe('光束');
    expect(combatFormLabel({ delivery: 'line', impacts: [{}] })).toBe('融合:光束+榴弹');
  });
});
