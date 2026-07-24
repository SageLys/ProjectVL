import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cfg, applyConfig, buildConfig } from '../src/config';
import { resolveCardBindings, resolveConsumableTier, registerSkillDefs } from '../src/core/effects/interpreter';
import type { BindingDef, CardDef } from '../src/core/effects/defs';
import { validateSkillsConfig } from '../src/config/skillValidator';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { autoMergeCards } from '../src/core/systems/cardSystem';
import { spawnGroundDrop } from '../src/core/systems/dropSystem';
import { card, constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.01);
const get = (id: string) => cfg.skills.cards.find(c => c.id === id)!;
const pathFor = (def: CardDef, star: number) => def.evolutionTree?.checkpoints
  .filter(checkpoint => checkpoint.star <= star)
  .map(checkpoint => `${checkpoint.star}:${checkpoint.options[0].id}`) ?? [];
const bindingsFor = (def: CardDef, star: number): BindingDef[] =>
  resolveCardBindings(def, pathFor(def, star), star);
const param = (bindings: BindingDef[], key: string) =>
  bindings.flatMap(b => b.effects).map(e => e.params?.[key]).find(v => typeof v === 'number') as number;

beforeEach(() => { resetTestEnv(); registerSkillDefs(cfg.skills.cards); });
afterEach(resetTestEnv);

describe('schema v0.4.0 · 进化树解释规则', () => {
  it('35 张正式卡都有 3/5 三分支与 4/6 公共节点', () => {
    const formal = cfg.skills.cards.filter(card => !card.recipeOnly);
    expect(formal).toHaveLength(35);
    for (const d of formal) {
      expect(d.evolutionTree?.checkpoints.map(checkpoint => [checkpoint.star, checkpoint.options.length]))
        .toEqual([[3, 3], [5, 3]]);
      expect(d.evolutionTree?.sharedNodes.map(node => node.star)).toEqual([4, 6]);
    }
  });

  it('3/5/6 累加分支与公共终态', () => {
    for (const id of ['pierce', 'frost']) {
      const d = get(id);
      expect(bindingsFor(d, 3).length).toBeGreaterThan(0);
      expect(bindingsFor(d, 5).length).toBeGreaterThan(bindingsFor(d, 3).length);
      expect(bindingsFor(d, 6).length).toBeGreaterThan(bindingsFor(d, 5).length);
    }
  });

  it('4★ amplify 持续放大 3★ 分支', () => {
    const pierce = get('pierce');
    expect(param(bindingsFor(pierce, 4), 'count')).toBe(param(bindingsFor(pierce, 3), 'count') + 1);
    expect(bindingsFor(pierce, 4).map(b => b.trigger)).toEqual(bindingsFor(pierce, 3).map(b => b.trigger));
    const harvest = get('harvest');
    expect(param(bindingsFor(harvest, 4), 'mul')).toBeCloseTo(param(bindingsFor(harvest, 3), 'mul') * 1.1);
  });

  it('消耗态内插：2★ 位于 1/3 中点，5★ 位于 3/6 的加权中点且不提前引入 6★-only 新原子', () => {
    const pierce = get('pierce');
    expect(resolveConsumableTier(pierce, 2).radius).toBeCloseTo((40 + 70) / 2);
    expect((resolveConsumableTier(pierce, 2).effects[0].params!.damageMul as number)).toBeCloseTo((3 + 5) / 2);
    const aegis = get('aegis');
    expect(resolveConsumableTier(aegis, 5).radius).toBeCloseTo(120 + (150 - 120) * 2 / 3);
    // 6★ anchor 比 3★ 多一个 burstDamage（第 3 个效果）；interpolate 按 3★（更短）的效果数展开，该原子不会提前出现在 5★。
    expect(resolveConsumableTier(aegis, 5).effects.map(e => e.atom)).not.toContain('burstDamage');
  });

  it('6 张 recipeOnly 产物无树且只声明 6★ 终态', () => {
    const recipes = cfg.skills.cards.filter(card => card.recipeOnly);
    expect(recipes).toHaveLength(6);
    for (const recipe of recipes) {
      expect(recipe.evolutionTree).toBeUndefined();
      expect(Object.keys(recipe.stars)).toEqual(['6']);
      expect(resolveCardBindings(recipe, [], 5)).toEqual([]);
      expect(resolveCardBindings(recipe, [], 6)).toEqual(recipe.stars['6'].equip);
    }
  });
});

describe('全部正式卡 · 1–6★ 无头冒烟', () => {
  it('≥3★ 全可装备、1–6★ 全可消耗，并输出六档效果表', () => {
    const table: Record<string, string | number>[] = [];
    for (const def of cfg.skills.cards) for (let star = 1; star <= 6; star++) {
      const tier = resolveConsumableTier(def, star);
      const s = freshState(); s.cards[0] = card(def.id as never, star);
      expect(consumeCard(s, config, rng, 0, 300, 300)[0]).toMatchObject({ type: 'skillConsumed', star });
      if (star >= 3 && !def.recipeOnly || star === 6) {
        const e = freshState(); e.cards[0] = card(def.id as never, star);
        expect(moveOrSwap(e, config, rng, 'cards', 0, 'equipment', 0).some(v => v.type === 'equipped')).toBe(true);
      }
      table.push({ card: def.id, star, radius: tier.radius ?? 0, effects: tier.effects.map(e => e.atom).join('+') });
    }
    console.table(table);
    expect(table).toHaveLength(cfg.skills.cards.length * 6);
  });
});

describe('四项占位假设 · 开关可翻转', () => {
  function patchEconomy(patch: Partial<typeof cfg.economy.placeholderAssumptions>): void {
    const next = buildConfig();
    next.economy.placeholderAssumptions = { ...next.economy.placeholderAssumptions, ...patch };
    applyConfig(next);
  }

  it('二合开关关闭后改用备选三合规则', () => {
    patchEconomy({ twoCopyMerge: false });
    const s = freshState(); s.cards[0] = card('pierce', 1); s.cards[1] = card('pierce', 1);
    expect(autoMergeCards(s, config, rng).merged).toBe(0);
    s.cards[2] = card('pierce', 1); expect(autoMergeCards(s, config, rng).merged).toBe(1);
  });

  it('普通掉落一律 1★ 开关关闭后启用 star2Share', () => {
    patchEconomy({ normalDropsOnlyOneStar: false });
    const s = freshState(); spawnGroundDrop(s, config, constRng(0), 0, 0, 'pierce');
    expect(s.groundDrops[0].star).toBe(2);
  });

  it('喂养开关关闭后同型同星不再升级装备', () => {
    patchEconomy({ feedEquipped: false });
    cfg.economy.equipSwappable = false;
    const s = freshState(); s.equipment[0] = card('pierce', 3); s.cards[0] = card('pierce', 3);
    expect(moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0)).toEqual([{ type: 'equipFull' }]);
    expect(s.equipment[0]!.star).toBe(3);
  });

  it('同类型唯一开关关闭后允许装备第二张同型卡', () => {
    patchEconomy({ distinctEquippedTypes: false });
    const s = freshState(); s.equipment[0] = card('pierce', 3); s.cards[0] = card('pierce', 4);
    expect(moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 1)).toContainEqual({ type: 'equipped', cardType: 'pierce', star: 4, slotIndex: 1 });
  });
});

describe('v0.4.0 加载校验', () => {
  it('故意缺少 5★ 锚点的坏 JSON 立即报错', () => {
    const bad = structuredClone(cfg.skills) as unknown as Record<string, unknown>;
    delete ((bad.cards as Record<string, unknown>[])[0].stars as Record<string, unknown>)['5'];
    expect(() => validateSkillsConfig(bad)).toThrow(/正式卡必须且只能定义 3\/5\/6 迁移锚点/);
  });
});
