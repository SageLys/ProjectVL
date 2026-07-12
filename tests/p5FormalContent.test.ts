import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs, fireTrigger, getModifiers, tickIntervalBindings } from '../src/core/effects/interpreter';
import { consumeCard } from '../src/core/systems/equipmentSystem';
import { autoMergeCards } from '../src/core/systems/cardSystem';
import { rollDropOnKill } from '../src/core/systems/dropSystem';
import { card, constRng, enemy, freshState, createDefaultConfig, resetTestEnv } from './helpers';

const IDS = ['pierce','chainLightning','splitBlast','frost','decoy','impact','scorch','sanctum','harvest','resonance','aegis','thorns'];
const config = createDefaultConfig();

beforeEach(() => { resetTestEnv(); registerSkillDefs(cfg.skills.cards); });

describe('P5 · 12 张正式技能卡 JSON 完整性', () => {
  it('全目录 12 张、五类覆盖、无占位卡，每张恰有 2★/3★装备态和三档消耗态', () => {
    expect(cfg.skills.cards.map(value => value.id)).toEqual(IDS);
    expect(new Set(cfg.skills.cards.map(value => value.category))).toEqual(new Set(['projectile','control','domain','economy','defense']));
    for (const def of cfg.skills.cards) {
      expect(def.legacyPlaceholder).not.toBe(true);
      expect(def.stars?.['2'].equip.length).toBeGreaterThan(0);
      expect(def.stars?.['3'].equip.length).toBeGreaterThan(0);
      expect(Object.keys(def.consumable.byStar)).toEqual(['1','2','3']);
    }
  });
});

describe.each(IDS)('P5 · %s 两种用法验收', id => {
  it('装备态：2★与3★均可锁定并由通用触发总线/修饰器读取', () => {
    for (const star of [2, 3]) {
      const s = freshState();
      s.cards[0] = card(id, star, true);
      s.enemies = [enemy({ x: 520, y: 300, hp: 10000, maxHp: 10000 })];
      expect(() => {
        fireTrigger(s, config, constRng(0.2), 'onWaveStart', { wave: 2 });
        fireTrigger(s, config, constRng(0.2), 'onFire', { bullet: { x:480,y:300,vx:1,vy:0,r:4,life:1,damage:10 } });
        fireTrigger(s, config, constRng(0.2), 'onHit', { enemy: s.enemies[0], point: { x:520,y:300 } });
        fireTrigger(s, config, constRng(0.2), 'onMerge', { merge: { cardType: 'pierce', resultStar: 2 } });
        tickIntervalBindings(s, config, constRng(0.2), 5);
        getModifiers(s);
      }).not.toThrow();
    }
  });

  it('消耗态：1★/2★/3★均在落点结算并移除卡牌', () => {
    for (const star of [1, 2, 3]) {
      const s = freshState();
      s.cards[0] = card(id, star);
      s.enemies = [enemy({ x: 240, y: 220, hp: 10000, maxHp: 10000 })];
      const events = consumeCard(s, config, constRng(0.2), 0, 240, 220);
      expect(s.cards[0]).toBeNull();
      expect(events).toContainEqual(expect.objectContaining({ type: 'skillConsumed', cardType: id, star, x: 240, y: 220 }));
    }
  });
});

describe('P5 · mergeRule 万能卡', () => {
  it('万能卡可与任意同星卡合成，结果继承非万能卡类型', () => {
    const s = freshState();
    s.cards[0] = card('wildcard', 1);
    s.cards[1] = card('frost', 1);
    autoMergeCards(s, config, constRng(0.5));
    expect(s.cards.filter(Boolean)).toContainEqual(expect.objectContaining({ type: 'frost', star: 2 }));
  });

  it('3★同调装备时，Bounty/Boss 击杀额外掉落万能卡', () => {
    const s = freshState();
    s.cards[0] = card('resonance', 3, true);
    rollDropOnKill(s, config, constRng(0.9), enemy({ type: 'boss' }));
    expect(s.groundDrops.some(drop => drop.type === 'wildcard')).toBe(true);
  });
});
