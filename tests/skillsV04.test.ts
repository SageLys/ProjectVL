import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cfg, applyConfig, buildConfig } from '../src/config';
import { resolveConsumableTier, resolveEquipBindings, registerSkillDefs } from '../src/core/effects/interpreter';
import { validateSkillsConfig } from '../src/config/skillValidator';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { autoMergeCards } from '../src/core/systems/cardSystem';
import { spawnGroundDrop } from '../src/core/systems/dropSystem';
import { card, constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.01);
const get = (id: string) => cfg.skills.cards.find(c => c.id === id)!;
const param = (bindings: ReturnType<typeof resolveEquipBindings>, key: string) =>
  bindings.flatMap(b => b.effects).map(e => e.params?.[key]).find(v => typeof v === 'number') as number;

beforeEach(() => { resetTestEnv(); registerSkillDefs(cfg.skills.cards); });
afterEach(resetTestEnv);

describe('schema v0.4.0 · 解释器星级规则', () => {
  it('3/5/6 装备锚点：damage 与 rate 均按 core/dual/transform 取整组定义', () => {
    for (const id of ['damage', 'rate']) {
      const d = get(id);
      expect(resolveEquipBindings(d, 3)).toEqual(d.stars['3'].equip);
      expect(resolveEquipBindings(d, 5)).toEqual(d.stars['5'].equip);
      expect(resolveEquipBindings(d, 6)).toEqual(d.stars['6'].equip);
    }
  });

  it('4★ amplify：整数增量与百分比增量均只放大 3★ 参数且结构不变', () => {
    const damage = get('damage');
    expect(param(resolveEquipBindings(damage, 4), 'count')).toBe(param(resolveEquipBindings(damage, 3), 'count') + 1);
    expect(resolveEquipBindings(damage, 4).map(b => b.trigger)).toEqual(resolveEquipBindings(damage, 3).map(b => b.trigger));
    const rate = get('rate');
    expect(param(resolveEquipBindings(rate, 4), 'ratio')).toBeCloseTo(param(resolveEquipBindings(rate, 3), 'ratio') * 1.2);
  });

  it('消耗态内插：2★ 位于 1/3 中点，5★ 位于 3/6 的 2/3 且不提前引入 6★ 新原子', () => {
    const damage = get('damage');
    expect(resolveConsumableTier(damage, 2).radius).toBe(120);
    expect((resolveConsumableTier(damage, 2).effects[0].params!.damageMul as number)).toBeCloseTo(5.5);
    const rate = get('rate');
    expect(resolveConsumableTier(rate, 5).radius).toBeCloseTo(160 + (210 - 160) * 2 / 3);
    expect(resolveConsumableTier(rate, 5).effects.map(e => e.atom)).not.toContain('freeze');
  });

  it('6★ transform：damage 与 luck 可替换整个效果集，不继承 core 触发/原子', () => {
    expect(resolveEquipBindings(get('damage'), 6)[0]).toMatchObject({ trigger: 'passive', effects: [{ atom: 'beamMorph' }] });
    expect(resolveEquipBindings(get('damage'), 6)[0].effects.map(e => e.atom)).not.toContain('pierce');
    expect(resolveEquipBindings(get('luck'), 6)[0]).toMatchObject({ trigger: 'onWaveStart', effects: [{ atom: 'extraDrop' }] });
    expect(resolveEquipBindings(get('luck'), 6)[0].effects.map(e => e.atom)).not.toContain('dropRateMul');
  });
});

describe('五张占位卡 · 1–6★ 无头冒烟', () => {
  it('≥3★ 全可装备、1–6★ 全可消耗，并输出六档效果表', () => {
    const table: Record<string, string | number>[] = [];
    for (const def of cfg.skills.cards) for (let star = 1; star <= 6; star++) {
      const tier = resolveConsumableTier(def, star);
      const s = freshState(); s.cards[0] = card(def.id as never, star);
      expect(consumeCard(s, config, rng, 0, 300, 300)[0]).toMatchObject({ type: 'skillConsumed', star });
      if (star >= 3) {
        const e = freshState(); e.cards[0] = card(def.id as never, star);
        expect(moveOrSwap(e, config, rng, 'cards', 0, 'equipment', 0).some(v => v.type === 'equipped')).toBe(true);
      }
      table.push({ card: def.id, star, radius: tier.radius ?? 0, effects: tier.effects.map(e => e.atom).join('+') });
    }
    console.table(table);
    expect(table).toHaveLength(30);
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
    const s = freshState(); s.cards[0] = card('damage', 1); s.cards[1] = card('damage', 1);
    expect(autoMergeCards(s, config, rng).merged).toBe(0);
    s.cards[2] = card('damage', 1); expect(autoMergeCards(s, config, rng).merged).toBe(1);
  });

  it('普通掉落一律 1★ 开关关闭后启用 star2Share', () => {
    patchEconomy({ normalDropsOnlyOneStar: false });
    const s = freshState(); spawnGroundDrop(s, config, constRng(0), 0, 0, 'damage');
    expect(s.groundDrops[0].star).toBe(2);
  });

  it('喂养开关关闭后同型同星不再升级装备', () => {
    patchEconomy({ feedEquipped: false });
    const s = freshState(); s.equipment[0] = card('damage', 3); s.cards[0] = card('damage', 3);
    expect(moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0)).toEqual([{ type: 'equipFull' }]);
    expect(s.equipment[0]!.star).toBe(3);
  });

  it('同类型唯一开关关闭后允许装备第二张同型卡', () => {
    patchEconomy({ distinctEquippedTypes: false });
    const s = freshState(); s.equipment[0] = card('damage', 3); s.cards[0] = card('damage', 4);
    expect(moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 1)).toContainEqual({ type: 'equipped', cardType: 'damage', star: 4, slotIndex: 1 });
  });
});

describe('v0.4.0 加载校验', () => {
  it('故意缺少 5★ 锚点的坏 JSON 立即报错', () => {
    const bad = structuredClone(cfg.skills) as unknown as Record<string, unknown>;
    delete ((bad.cards as Record<string, unknown>[])[0].stars as Record<string, unknown>)['5'];
    expect(() => validateSkillsConfig(bad)).toThrow(/必须且只能定义 3\/5\/6 锚点/);
  });
});
