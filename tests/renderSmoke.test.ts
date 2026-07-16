// 渲染冒烟测试：canvas 2D 上下文用 Proxy 打桩（方法全部 no-op，属性可读写），
// 只验证"给定真实 state 数据，绘制函数不抛错"——这类 undefined 属性访问的崩溃
// (如 legacy.types[新卡id] 查表落空) 不会被任何逻辑单测捕获，必须单独守护。
import { describe, it, expect, beforeEach } from 'vitest';
import { cfg } from '../src/config';
import { drawDrops } from '../src/render/drawDrops';
import { drawEnemies } from '../src/render/drawEnemies';
import { spawnGroundDrop } from '../src/core/systems/dropSystem';
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
    expect(resolveCardMeta('pierce', 5, 'equipment').desc).toBe('贯穿弹碰边折返');
    expect(resolveCardMeta('pierce', 6, 'equipment').desc).toBe('主炮化为持续光束');
  });
});
