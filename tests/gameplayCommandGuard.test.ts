import { afterEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { acceptBountyAt } from '../src/core/systems/bountySystem';
import { collectDrop, spawnGroundDrop } from '../src/core/systems/dropSystem';
import { consumeCard, moveOrSwap, toggleLock } from '../src/core/systems/equipmentSystem';
import { card, constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

afterEach(resetTestEnv);

describe('玩家主动指令 · 统一暂停守卫', () => {
  it('strictPause=true 时拾取、锁定、移动、消耗与接赏金全部拒绝且不改状态', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const rng = constRng(0.5);
    s.cards[0] = card('damage', 2);
    s.cards[1] = card('rate', 1);
    spawnGroundDrop(s, config, rng, 100, 100, 'luck');
    const bounty = enemy({ x: 200, y: 200, bounty: { phase: 'offered', remaining: 8 } });
    s.enemies.push(bounty);
    const before = structuredClone(s);
    s.paused = true;
    s.pauseReason = 'manual';

    expect(collectDrop(s, config, rng, s.groundDrops[0])).toEqual([]);
    expect(toggleLock(s, 0)).toEqual([]);
    expect(moveOrSwap(s, config, rng, 'cards', 1, 'cards', 2)).toEqual([]);
    expect(consumeCard(s, config, rng, 1, 300, 300)).toEqual([]);
    expect(acceptBountyAt(s, config, 200, 200)).toEqual([]);
    expect({ ...s, paused: false, pauseReason: null }).toEqual(before);
  });

  it('strictPause=false 时所有系统使用同一口径，暂停中仍可执行明确配置允许的动作', () => {
    cfg.input.strictPause = false;
    const s = freshState();
    s.paused = true;
    s.pauseReason = 'manual';
    s.cards[0] = card('damage', 2);
    expect(toggleLock(s, 0)).toEqual([{ type: 'locked', cardType: 'damage' }]);
  });

  it('ready/ended 状态无论 strictPause 均拒绝玩家指令', () => {
    const s = freshState();
    s.mode = 'ended';
    s.cards[0] = card('damage', 2);
    expect(toggleLock(s, 0)).toEqual([]);
  });
});
