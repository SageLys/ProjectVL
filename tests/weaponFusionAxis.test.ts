import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { BindingDef, CardDef, EffectDef } from '../src/core/effects/defs';
import { composeWeaponForm, getModifiers, registerSkillDefs } from '../src/core/effects/interpreter';
import type { CardType, GameState } from '../src/core/types';
import { card, fixtureEvolutionTree, freshState, resetTestEnv } from './helpers';

const beamCardTypes = [
  'glacialSpike',
  'goldenVolley',
  'pierce',
  'sentinel',
  'solarLance',
] as const satisfies readonly CardType[];

beforeEach(() => {
  resetTestEnv();
  registerSkillDefs(cfg.skills.cards);
});

function equip(state: GameState, ...types: CardType[]): void {
  types.forEach((type, index) => {
    state.equipment[index] = card(type, 6);
  });
}

function formFor(...types: CardType[]) {
  const state = freshState();
  equip(state, ...types);
  return composeWeaponForm(getModifiers(state).weaponForms);
}

function mortarFixtureSkill(id: CardType, damageRatio: number, radius: number): CardDef {
  const bindings: BindingDef[] = [{ trigger: 'passive', effects: [{
    atom: 'mortarMorph', params: { damageRatio, radius, falloff: 0.5 },
  }] }];
  const consume: EffectDef[] = [{ atom: 'burstDamage', params: { damageMul: 1, radius: 10 } }];
  return {
    id, category: 'projectile', synergyTags: ['projectile'], textKey: `test.${id}`, teaching: false,
    stars: {
      '3': { tier: 'core', equip: structuredClone(bindings) },
      '5': { tier: 'dual', equip: structuredClone(bindings) },
      '6': { tier: 'transform', equip: structuredClone(bindings) },
    },
    amplifyAxis: { params: { damageRatio: '+0' } },
    evolutionTree: fixtureEvolutionTree(id, bindings),
    consumable: { placement: 'point', anchors: {
      '1': { effects: consume }, '3': { effects: consume }, '6': { effects: consume },
    } },
  };
}

describe('weaponFusion delivery 覆盖轴', () => {
  it('beam 取 damageRatio 最强者，且全部参数成套来自胜者', () => {
    const form = formFor('pierce', 'sentinel');

    expect(form.deliveryDamageRatio).toBe(1);
    expect(form.width).toBe(32);
    expect(form.sourceCardType).toBe('pierce');
  });

  it('beam 胜者不衰减，cadence 参数也来自同一张卡', () => {
    const form = formFor('glacialSpike', 'solarLance');

    expect(form.deliveryDamageRatio).toBe(1.15);
    expect(form.interval).toBe(0.85);
    expect(form.sourceCardType).toBe('solarLance');
  });

  it('全部正式 beam 两两叠装均不会劣于其中任一张单装', () => {
    for (let left = 0; left < beamCardTypes.length; left++) {
      for (let right = left + 1; right < beamCardTypes.length; right++) {
        const a = formFor(beamCardTypes[left]);
        const b = formFor(beamCardTypes[right]);
        const fused = formFor(beamCardTypes[left], beamCardTypes[right]);

        expect(fused.deliveryDamageRatio).toBeGreaterThanOrEqual(
          Math.max(a.deliveryDamageRatio, b.deliveryDamageRatio),
        );
      }
    }
  });

  it('交换装备槽位得到完全相同的 spec', () => {
    expect(formFor('pierce', 'sentinel')).toEqual(formFor('sentinel', 'pierce'));
  });
});

describe('weaponFusion suppression 归因', () => {
  it('只记录完全落败的 beam，不把胜者或有效 mortar 记为 suppressed', () => {
    const competingBeams = formFor('pierce', 'sentinel');
    expect(competingBeams.suppressedSourceCardTypes).toEqual(['sentinel']);
    expect(competingBeams.suppressedSourceCardTypes).not.toContain('pierce');

    const orthogonalAxes = formFor('pierce', 'splitBlast');
    expect(orthogonalAxes.suppressedSourceCardTypes).toEqual([]);
  });
});

describe('weaponFusion impact 叠加轴', () => {
  it('mortar 只按组内下标固定衰减，且面积比例开方后作用于半径', () => {
    registerSkillDefs([
      mortarFixtureSkill('mortarA', 1, 100),
      mortarFixtureSkill('mortarB', 2, 80),
      mortarFixtureSkill('mortarC', 3, 60),
    ]);
    const state = freshState();
    equip(state, 'mortarA', 'mortarB', 'mortarC');
    const form = composeWeaponForm(getModifiers(state).weaponForms);

    expect(form.impacts).toHaveLength(3);
    expect(form.impacts[0]).toMatchObject({ damageRatio: 1, radius: 100 });
    expect(form.impacts[1].damageRatio).toBe(2 * cfg.combat.weaponFusion.damping);
    expect(form.impacts[1].radius).toBe(80 * Math.sqrt(cfg.combat.weaponFusion.areaMul));
    expect(form.impacts[2].damageRatio).toBe(3 * cfg.combat.weaponFusion.damping);
    expect(form.impacts[2].radius).toBe(60 * Math.sqrt(cfg.combat.weaponFusion.areaMul));
  });

  it('单张 mortar 不因 beam 存在而衰减', () => {
    const form = formFor('pierce', 'splitBlast');

    expect(form.impacts[0].damageRatio).toBe(1.3);
    expect(form.impacts[0].radius).toBe(90);
  });
});
