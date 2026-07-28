// 渲染冒烟测试：canvas 2D 上下文用 Proxy 打桩（方法全部 no-op，属性可读写），
// 只验证"给定真实 state 数据，绘制函数不抛错"——这类 undefined 属性访问的崩溃
// (如 legacy.types[新卡id] 查表落空) 不会被任何逻辑单测捕获，必须单独守护。
import { describe, it, expect, beforeEach } from 'vitest';
import { cfg } from '../src/config';
import { drawDrops } from '../src/render/drawDrops';
import { drawEnemies } from '../src/render/drawEnemies';
import { drawBountyOffers } from '../src/render/drawBountyOffers';
import { drawBountyEffects } from '../src/render/drawBountyEffects';
import { drawBeams } from '../src/render/drawBeams';
import { drawBullets } from '../src/render/drawBullets';
import { drawSummonsAndShield, drawTauntRanges } from '../src/render/drawEffects';
import { drawVfx } from '../src/render/drawVfx';
import { spawnGroundDrop, spawnWildcardDrop } from '../src/core/systems/dropSystem';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { enemy, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

function fakeCtx(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop as string];
      return () => undefined; // 任意方法调用（arc/fill/stroke/...）都是 no-op
    },
    set(obj, prop, value) { obj[prop as string] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

beforeEach(() => { resetTestEnv(); registerSkillDefs(cfg.skills.cards); });

describe('渲染冒烟 · 地面掉落', () => {
  it('每张正式卡的地面掉落都能画出图标/配色，不因 legacy 查表落空崩溃', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const rng = constRng(0.5);
    for (const def of cfg.skills.cards) {
      spawnGroundDrop(s, config, rng, 100, 100, def.id, 3);
    }
    expect(s.groundDrops).toHaveLength(cfg.skills.cards.length);
    expect(() => drawDrops(fakeCtx(), s)).not.toThrow();
  });
});

describe('渲染冒烟 · 敌人', () => {
  it('普通敌人与新 Bounty 标记字段均不影响基础绘制', () => {
    const s = freshState();
    s.enemies = [
      enemy({ bountyEncounterId: 1, bountyRewardType: 'pierce' }),
      enemy({}),
    ];
    expect(() => drawEnemies(fakeCtx(), s)).not.toThrow();
  });
});

describe('渲染冒烟 · 战斗表现实体', () => {
  it('光束、榴弹弧线、落点/爆炸、嘲讽与召唤事件均可绘制', () => {
    const s = freshState();
    s.beams.push({
      attackId: 1, delivery: 'line', baseDamage: 10, impactBudget: 10,
      damage: 2, riders: [], hitIds: [], impacts: [], sourceStar: 6,
      angle: 0, width: 30, range: 250, remaining: 0.4, duration: 0.6, tickTimer: 0.1, tickInterval: 0.1, damagePerTick: 2,
    });
    s.bullets.push({ x: 100, y: 100, vx: 10, vy: 0, r: 8, life: 1, damage: 10, kind: 'mortar', flightProgress: 0.5 });
    const taunted = enemy({ id: 7, x: 150, y: 100 });
    s.enemies = [taunted];
    s.summons.push({ id: 8, kind: 'decoy', x: 210, y: 100, hp: 20, maxHp: 40, tauntRadius: 140 });
    s.vfx.push(
      { kind: 'mortarTarget', x: 100, y: 100, radius: 60, remaining: 0.4 },
      { kind: 'mortarImpact', x: 120, y: 100, radius: 60, remaining: 0.2 },
      { kind: 'tauntPulse', enemyId: 7, remaining: 0.5 },
      { kind: 'summonEvent', x: 210, y: 100, event: 'respawn', remaining: 0.4 },
      { kind: 'shieldAbsorb', x: 270, y: 365, remaining: 0.2 },
      { kind: 'shieldBreak', x: 270, y: 365, remaining: 0.3 },
      { kind: 'shieldRegen', x: 270, y: 365, remaining: 0.4 },
      { kind: 'thornsReflect', x: 270, y: 365, enemyId: 999, remaining: 0.25 },
      { kind: 'retaliationNova', x: 270, y: 365, radius: 220, remaining: 0.3 },
      { kind: 'breachMitigated', x: 270, y: 365, remaining: 0.2 },
    );
    s.shield = { hits: 2, maxHits: 3, regenRemaining: null, regenSeconds: 2 };
    const ctx = fakeCtx();
    expect(() => drawTauntRanges(ctx, s)).not.toThrow();
    expect(() => drawBullets(ctx, s)).not.toThrow();
    expect(() => drawBeams(ctx, s)).not.toThrow();
    expect(() => drawVfx(ctx, s)).not.toThrow();
    expect(() => drawSummonsAndShield(ctx, s)).not.toThrow();
  });
});

describe('渲染冒烟 · Bounty 完整视觉', () => {
  it('四边 Offer、11 种奖励敌群、万能卡与入场警示均不抛错', () => {
    const s = freshState();
    const sides = ['top', 'right', 'bottom', 'left'] as const;
    s.bountyOffers = cfg.skills.cards.map((def, index) => ({
      id: index + 1,
      rewardCardType: def.id,
      rewardCardStar: 1 + index % 2,
      rewardCardCount: 1,
      wildcardStar: 1,
      wildcardCount: 1,
      side: sides[index % sides.length],
      x: index % 2 ? 508 : 32,
      y: 32 + index * 45,
      remaining: 4,
      guaranteed: index === 0,
      createdAt: 0,
    }));
    s.enemies = cfg.skills.cards.map((def, index) => enemy({
      id: index + 1,
      x: 70 + index * 35,
      y: 300,
      bountyEncounterId: 1,
      bountyRewardType: def.id,
    }));
    s.bountyEncounters = [{
      id: 1, offerId: 1, rewardCardType: 'frost', rewardCardStar: 1, rewardCardCount: 1,
      wildcardStar: 1, wildcardCount: 1, side: 'top', status: 'spawning',
      memberIds: s.enemies.map(member => member.id), pendingSpawnCount: 1, spawnTimer: 0,
      guaranteed: false, acceptedAt: 0, hpAtAccept: 100, lastKillX: 270, lastKillY: 32,
    }];
    spawnWildcardDrop(s, 270, 400, 2, 2, 12);
    expect(() => drawBountyOffers(fakeCtx(), s)).not.toThrow();
    expect(() => drawEnemies(fakeCtx(), s)).not.toThrow();
    expect(() => drawBountyEffects(fakeCtx(), s)).not.toThrow();
    expect(() => drawDrops(fakeCtx(), s)).not.toThrow();
  });
});

describe('渲染冒烟 · 手牌/装备卡面', () => {
  it('每张正式卡 1–6★ 的 cardMeta 解析都返回有效 name/icon/color，不返回 undefined 字段', async () => {
    const { resolveCardMeta } = await import('../src/ui/cardMeta');
    for (const def of cfg.skills.cards) {
      for (let star = 1; star <= 6; star++) {
        for (const context of ['hand', 'equipment'] as const) {
          const meta = resolveCardMeta(def.id, star, context);
          expect(meta.name, `${def.id}@${star}:${context}`).toBeTruthy();
          expect(meta.desc, `${def.id}@${star}:${context}`).toBeTruthy();
          expect(meta.accent, `${def.id}@${star}:${context}`).toBeTruthy();
          expect(meta.shape, `${def.id}@${star}:${context}`).toBeTruthy();
          expect(meta.glyph, `${def.id}@${star}:${context}`).toBeTruthy();
        }
      }
    }
  });

  it('按上下文读取不同文案，并按已定义档位回退', async () => {
    const { resolveCardMeta } = await import('../src/ui/cardMeta');
    expect(resolveCardMeta('pierce', 3, 'hand').desc).not.toBe(resolveCardMeta('pierce', 3, 'equipment').desc);
    expect(resolveCardMeta('pierce', 4, 'equipment').desc).toBe(resolveCardMeta('pierce', 3, 'equipment').desc);
    expect(resolveCardMeta('pierce', 5, 'equipment').desc).toContain('叠加');
    expect(resolveCardMeta('pierce', 6, 'equipment').desc).toContain('终态');
    expect(resolveCardMeta('pierce', 5, 'equipment').desc).not.toContain('第二分支');
  });
});
