import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { composeWeaponForm, getModifiers, registerSkillDefs } from '../src/core/effects/interpreter';
import type { CardType, GameState } from '../src/core/types';
import { card, freshState, resetTestEnv } from './helpers';

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
  it('单张 mortar 不因 beam 存在而衰减', () => {
    const form = formFor('pierce', 'splitBlast');

    expect(form.impacts[0].damageRatio).toBe(1.3);
    expect(form.impacts[0].radius).toBe(90);
  });
});
