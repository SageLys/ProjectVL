// 效果解释器与运行时：触发器总线、装备态绑定、passive 修饰聚合、消耗释放、
// 区域/光环/召唤物/护盾 tick。技能全部以 fixture JSON 定义——验证「卡=数据+解释器」。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cfg } from '../src/config';
import type { CardDef, BindingDef } from '../src/core/effects/defs';
import {
  effectiveEquipment, fireTrigger, getModifiers, registerSkillDefs, tickIntervalBindings,
} from '../src/core/effects/interpreter';
import { tickEffects, absorbBreach } from '../src/core/effects/runtime';
import { ATOMS, type EffectCtx } from '../src/core/effects/registry';
import { shoot, updateBullets, updateTurret } from '../src/core/systems/combatSystem';
import { moveEnemies } from '../src/core/systems/enemySystem';
import { startNextWave } from '../src/core/systems/waveSystem';
import { autoMergeCards } from '../src/core/systems/cardSystem';
import { consumeCard } from '../src/core/systems/equipmentSystem';
import { dealDamage, killEnemy } from '../src/core/systems/damageSystem';
import { tickDrops, spawnGroundDrop } from '../src/core/systems/dropSystem';
import { totalDropChance, totalDropLifetime, totalFireRate } from '../src/core/stats';
import { speedMultiplier } from '../src/core/effects/statusSystem';
import type { CardType, GameState } from '../src/core/types';
import { card, enemy, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.99); // 高 roll：默认不掉落，便于断言

beforeEach(resetTestEnv);
afterEach(resetTestEnv);

/** v0.4 fixture 工厂：同一绑定放在 3/5/6 锚点。 */
function def(id: CardType, equip: BindingDef[], consumeEffects: BindingDef['effects'] = [{ atom: 'burstDamage', params: { damageMul: 2, radius: 100 } }]): CardDef {
  const tier = { radius: 100, effects: consumeEffects };
  return {
    id, category: 'projectile', textKey: `t.${id}`, teaching: false,
    stars: { '3': { tier: 'core', equip }, '5': { tier: 'dual', equip }, '6': { tier: 'transform', equip } },
    amplifyAxis: { params: { damageMul: '+1' } },
    consumable: { placement: 'point', anchors: { '1': tier, '3': tier, '6': tier } },
  };
}

/** 放入独立装备格。 */
function equipCard(s: GameState, type: CardType, star = 3): void {
  s.equipment[s.equipment.findIndex(c => c === null)] = card(type, star);
}

describe('解释器 · 装备态触发绑定', () => {
  it('effectiveEquipment：只读取独立装备格；未注册定义的卡走 legacy 不炸', () => {
    const s = freshState();
    s.equipment[0] = card('damage', 2);
    s.cards[1] = card('rate', 2);
    expect(effectiveEquipment(s).map(c => c.type)).toEqual(['damage']);
    expect(fireTrigger(s, config, rng, 'onWaveStart', { wave: 1 })).toEqual([]);
  });

  it('onFire：装备 pierce 卡后子弹带穿透参数', () => {
    registerSkillDefs([def('damage', [{ trigger: 'onFire', effects: [{ atom: 'pierce', params: { count: 2, damageRetention: 0.8 } }] }])]);
    const s = freshState();
    equipCard(s, 'damage', 3);
    shoot(s, config, rng, enemy({ x: 600, y: 300 }));
    expect(s.bullets[0].pierceLeft).toBe(2);
  });

  it('onHit：装备连锁卡后命中弹跳到第二个敌人', () => {
    registerSkillDefs([def('rate', [{ trigger: 'onHit', effects: [{ atom: 'chain', params: { bounces: 1, damageRetention: 0.5, searchRange: 150 } }] }])]);
    const s = freshState();
    equipCard(s, 'rate', 3);
    const a = enemy({ x: 500, y: 300, hp: 100, maxHp: 100 });
    const b = enemy({ x: 560, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [a, b];
    s.bullets = [{ x: 500, y: 300, vx: 0, vy: 0, r: 4, life: 1, damage: 20 }];
    updateBullets(s, config, rng, 0.016);
    expect(a.hp).toBe(80);
    expect(b.hp).toBe(90); // 20 × 0.5
  });

  it('onKill：击杀触发 extraDrop', () => {
    registerSkillDefs([def('range', [{ trigger: 'onKill', effects: [{ atom: 'extraDrop', params: { count: 1, at: 'point' } }] }])]);
    const s = freshState();
    equipCard(s, 'range', 3);
    const e = enemy({ x: 300, y: 300, hp: 5, maxHp: 5 });
    s.enemies = [e];
    dealDamage(s, config, rng, e, 10);
    expect(s.groundDrops).toHaveLength(1); // rng=0.99 不触发常规掉落 → 必为 extraDrop
  });

  it('onWaveStart：护盾回填', () => {
    registerSkillDefs([def('luck', [{ trigger: 'onWaveStart', effects: [{ atom: 'shield', params: { absorbHits: 2, regenSeconds: 10 } }] }])]);
    const s = freshState();
    equipCard(s, 'luck', 3);
    startNextWave(s, config, rng);
    expect(s.shield).toMatchObject({ hits: 2 });
  });

  it('onMerge：合成脉冲对全场造成 结果星级×N 伤害', () => {
    registerSkillDefs([def('luck', [{ trigger: 'onMerge', effects: [{ atom: 'mergePulse', params: { damagePerMergeCount: 5, radius: 'all' } }] }])]);
    const s = freshState();
    equipCard(s, 'luck', 3);
    const e = enemy({ x: 100, y: 100, hp: 100, maxHp: 100 });
    s.enemies = [e];
    s.cards[1] = card('damage', 1);
    s.cards[2] = card('damage', 1);
    autoMergeCards(s, config, rng);
    expect(e.hp).toBe(90); // resultStar 2 × 5
  });

  it('interval：独立时钟按 triggerParams.seconds 周期触发', () => {
    registerSkillDefs([def('multi', [{ trigger: 'interval', triggerParams: { seconds: 1 }, effects: [{ atom: 'burstDamage', params: { damageMul: 1, radius: 300 } }] }])]);
    const s = freshState();
    equipCard(s, 'multi', 3);
    const e = enemy({ x: 270, y: 365, hp: 1000, maxHp: 1000 });
    s.enemies = [e];
    tickIntervalBindings(s, config, rng, 0.5);
    expect(e.hp).toBe(1000);              // 未到期
    tickIntervalBindings(s, config, rng, 0.6);
    expect(e.hp).toBeLessThan(1000);      // 到期触发一次
    const after = e.hp;
    tickIntervalBindings(s, config, rng, 0.2);
    expect(e.hp).toBe(after);             // 时钟已重置
  });

  it('星级分层：同一卡 2★/3★ 取不同绑定（入装门槛 2★）', () => {
    registerSkillDefs([{
      id: 'damage', category: 'projectile', textKey: 't', teaching: false,
      stars: {
        '3': { tier: 'core', equip: [{ trigger: 'onFire', effects: [{ atom: 'pierce', params: { count: 1 } }] }] },
        '5': { tier: 'dual', equip: [{ trigger: 'onFire', effects: [{ atom: 'pierce', params: { count: 2 } }] }] },
        '6': { tier: 'transform', equip: [{ trigger: 'passive', effects: [{ atom: 'beamMorph', params: { interval: 0.9 } }] }] },
      },
      amplifyAxis: { params: { count: '+1' } },
      consumable: { placement: 'point', anchors: { '1': { effects: [{ atom: 'burstDamage' }] }, '3': { effects: [{ atom: 'burstDamage' }] }, '6': { effects: [{ atom: 'burstDamage' }] } } },
    }]);
    const s = freshState();
    equipCard(s, 'damage', 3);
    expect(getModifiers(s).morph).toBe('none');
    s.cards = s.cards.map(() => null);
    equipCard(s, 'damage', 6);
    expect(getModifiers(s).morph).toBe('beam');
  });
});

describe('解释器 · passive 修饰聚合', () => {
  function passive(effects: BindingDef['effects']): BindingDef[] {
    return [{ trigger: 'passive', effects }];
  }

  it('经济乘数：dropRateMul / dropLifetimeMul / xpMul', () => {
    // 用无旧数值掉率加成的类型（range）承载 fixture，隔离乘数断言
    registerSkillDefs([def('range', passive([
      { atom: 'dropRateMul', params: { mul: 1.5 } },
      { atom: 'dropLifetimeMul', params: { mul: 1.25 } },
      { atom: 'xpMul', params: { mul: 2 } },
    ]))]);
    const s = freshState();
    cfg.progression.killXpMul = 1.5;
    s.xpGainBonus = 0.25;
    equipCard(s, 'range', 3);
    expect(totalDropChance(s, config)).toBeCloseTo(Math.min(0.95, config.dropChance * 1.5));
    expect(totalDropLifetime(s, config)).toBeCloseTo(config.dropLifetime * 1.25);
    const e = enemy({ x: 300, y: 300, hp: 1, maxHp: 1, xp: 2 });
    s.enemies = [e];
    dealDamage(s, config, rng, e, 10);
    expect(s.xp).toBe(7.5); // 2 × killXpMul 1.5 × personal 1.25 × effect xpMul 2
  });

  it('防御修饰：breachReduction 减伤 / thorns 反噬击杀 / novaOnBreak', () => {
    registerSkillDefs([def('range', passive([{ atom: 'breachReduction', params: { ratio: 0.5 } }]))]);
    const s = freshState();
    equipCard(s, 'range', 3);
    s.enemies = [enemy({ x: 271, y: 365, hp: 999, maxHp: 999, damage: 28 })];
    moveEnemies(s, config, rng, 0.016);
    expect(s.hp).toBe(100 - 14); // 28 × (1-0.5)

    registerSkillDefs([def('range', passive([{ atom: 'thorns', params: { ratio: 2 } }]))]);
    const s2 = freshState();
    equipCard(s2, 'range', 3);
    s2.enemies = [enemy({ x: 271, y: 365, hp: 10, maxHp: 10, damage: 8, xp: 1 })];
    moveEnemies(s2, config, rng, 0.016);
    expect(s2.hp).toBe(100);  // 反噬致死 → 无突破伤害
    expect(s2.kills).toBe(1); // 按击杀结算
  });

  it('mergeRule 暴露给上层（P5 万能卡建模前置）；execute 取最高阈值', () => {
    registerSkillDefs([def('luck', passive([
      { atom: 'mergeRule', params: { rule: 'wildcardDrop', value: 1 } },
      { atom: 'execute', params: { hpThresholdRatio: 0.2 } },
    ]))]);
    const s = freshState();
    equipCard(s, 'luck', 3);
    const mods = getModifiers(s);
    expect(mods.mergeRules).toEqual([{ rule: 'wildcardDrop', value: 1 }]);
    expect(mods.executeThreshold).toBe(0.2);
  });

  it('mortarMorph passive：主炮改射榴弹并在落点爆炸', () => {
    registerSkillDefs([def('damage', passive([{ atom: 'mortarMorph', params: { radius: 90, damageRatio: 1, falloff: 0.5 } }]))]);
    const s = freshState();
    equipCard(s, 'damage', 3);
    expect(getModifiers(s).morph).toBe('mortar');
    shoot(s, config, rng, enemy({ x: 350, y: 365 }));
    expect(s.bullets[0].kind).toBe('mortar');
    const e = enemy({ x: 350, y: 365, hp: 1000, maxHp: 1000 });
    s.enemies = [e];
    for (let i = 0; i < 30 && s.bullets.length; i++) updateBullets(s, config, rng, 0.033);
    expect(e.hp).toBeLessThan(1000);
  });

  it('beamMorph passive：updateTurret 以 interval 发射贯穿光束（不出普通弹）', () => {
    registerSkillDefs([def('damage', passive([{ atom: 'beamMorph', params: { interval: 0.5, width: 30, damageRatio: 1 } }]))]);
    const s = freshState();
    equipCard(s, 'damage', 3);
    const e = enemy({ x: 390, y: 365, hp: 1000, maxHp: 1000 });
    s.enemies = [e];
    updateTurret(s, config, rng, 0.3);
    expect(s.bullets).toHaveLength(0);
    expect(e.hp).toBe(1000);
    updateTurret(s, config, rng, 0.3);
    expect(s.bullets).toHaveLength(0);
    expect(e.hp).toBeLessThan(1000);
  });
});

describe('解释器 · 消耗释放（一卡两用）', () => {
  it('拖入主画面：按星级档位在落点结算效果并失去该卡', () => {
    registerSkillDefs([def('damage', [], [{ atom: 'burstDamage', params: { damageMul: 2, radius: 100 } }])]);
    const s = freshState();
    s.cards[0] = card('damage', 1);
    const e = enemy({ x: 200, y: 200, hp: 1000, maxHp: 1000 });
    const far = enemy({ x: 700, y: 500, hp: 1000, maxHp: 1000 });
    s.enemies = [e, far];
    const ev = consumeCard(s, config, rng, 0, 200, 200);
    expect(s.cards[0]).toBeNull();
    expect(e.hp).toBeLessThan(1000);   // 落点半径内
    expect(far.hp).toBe(1000);         // 半径外
    expect(ev[0]).toMatchObject({ type: 'skillConsumed', x: 200, y: 200 });
  });
});

describe('运行时 · 区域/光环/召唤物/护盾', () => {
  it('groundZone tick：区域内敌人周期掉血，到期区域消失', () => {
    const s = freshState();
    const ctx: EffectCtx = { state: s, config, rng, events: [], origin: { x: 100, y: 100 }, star: 2, baseDamage: 10 };
    ATOMS.groundZone(ctx, { radius: 90, duration: 1, tickInterval: 0.5, effects: [{ atom: 'dot', params: { damagePerTick: 5, tickInterval: 0.5 } }] });
    const e = enemy({ x: 100, y: 100, hp: 100, maxHp: 100 });
    s.enemies = [e];
    tickEffects(s, config, rng, 0.01);   // tickTimer 初始 0 → 立即第一跳
    expect(e.hp).toBe(95);
    tickEffects(s, config, rng, 1.2);    // 到期
    expect(s.zones).toHaveLength(0);
  });

  it('aura passive：光环周期对射程比例半径内敌人施加内嵌效果', () => {
    registerSkillDefs([def('rate', [{ trigger: 'passive', effects: [{ atom: 'aura', params: { radiusRatioOfRange: 0.6, tickInterval: 0.4, effects: [{ atom: 'slow', params: { ratio: 0.35, duration: 0.9 } }] } }] }])]);
    const s = freshState();
    equipCard(s, 'rate', 3);
    const near = enemy({ x: 350, y: 365, hp: 100, maxHp: 100 });
    const far = enemy({ x: 270 + 900, y: 365, hp: 100, maxHp: 100 });
    s.enemies = [near, far];
    tickEffects(s, config, rng, 0.2);
    tickEffects(s, config, rng, 0.3); // 累计超过 tickInterval → 脉冲
    expect(speedMultiplier(near)).toBeCloseTo(0.65);
    expect(speedMultiplier(far)).toBe(1);
  });

  it('诱饵：敌人被拉向图腾并自爆伤图腾；到期爆炸击退', () => {
    const s = freshState();
    const ctx: EffectCtx = { state: s, config, rng, events: [], origin: { x: 700, y: 300 }, star: 2, baseDamage: 10 };
    ATOMS.summon(ctx, { kind: 'decoy', hp: 40, duration: 4, tauntRadius: 200 });
    const e = enemy({ x: 760, y: 300, hp: 100, maxHp: 100, damage: 8, speed: 40 });
    s.enemies = [e];
    moveEnemies(s, config, rng, 0.1);
    expect(e.x).toBeLessThan(760); // 朝图腾（远离炮台方向）移动
    e.x = 705; e.y = 300;
    moveEnemies(s, config, rng, 0.016);
    expect(s.enemies).toHaveLength(0);       // 自爆消散
    expect(s.summons[0].hp).toBe(32);        // 图腾掉血
    expect(s.kills).toBe(0);                 // 不给击杀奖励

    // 到期爆炸（explodeOnDeath）
    const s2 = freshState();
    const ctx2: EffectCtx = { state: s2, config, rng, events: [], origin: { x: 200, y: 200 }, star: 2, baseDamage: 10 };
    ATOMS.summon(ctx2, { kind: 'decoy', hp: 40, duration: 0.1, tauntRadius: 100, explode: true, explodeDamageMul: 1, knockbackDistance: 50 });
    const v = enemy({ x: 230, y: 200, hp: 100, maxHp: 100 });
    s2.enemies = [v];
    tickEffects(s2, config, rng, 0.2);
    expect(s2.summons).toHaveLength(0);
    expect(v.hp).toBe(90);
    expect(v.x).toBeGreaterThan(230); // 被击退
  });

  it('镜像炮台：按冷却向最近敌人开火', () => {
    const s = freshState();
    const ctx: EffectCtx = { state: s, config, rng, events: [], origin: { x: 300, y: 300 }, star: 3, baseDamage: 10 };
    ATOMS.summon(ctx, { kind: 'mirrorTurret', hp: 60, duration: 5, damageRatio: 0.3, tauntRadius: 0 });
    s.enemies = [enemy({ x: 400, y: 300, hp: 100, maxHp: 100 })];
    tickEffects(s, config, rng, 0.05);
    expect(s.bullets).toHaveLength(1);
  });

  it('护盾：吸收突破（不扣血）、破裂事件、novaOnBreak、再生', () => {
    registerSkillDefs([def('range', [{ trigger: 'passive', effects: [{ atom: 'novaOnBreak', params: { damage: 10, knockbackDistance: 50 } }] }])]);
    const s = freshState();
    equipCard(s, 'range', 3);
    s.shield = { hits: 1, maxHits: 1, regenRemaining: null, regenSeconds: 2 };
    const bystander = enemy({ x: 350, y: 365, hp: 100, maxHp: 100 });
    s.enemies = [bystander];
    const events: ReturnType<typeof fireTrigger> = [];
    const dmg = absorbBreach(s, config, rng, 28, events);
    expect(dmg).toBeNull();                                    // 吸收，不扣血
    expect(events).toContainEqual({ type: 'shieldBroken' });
    expect(bystander.hp).toBe(90);                             // 破盾新星
    expect(bystander.x).toBeGreaterThan(350);                  // 新星击退
    expect(s.shield!.regenRemaining).toBe(2);
    tickEffects(s, config, rng, 2.1);
    expect(s.shield!.hits).toBe(1);                            // 再生完成
  });

  it('buff：限时射速增益经 stats 生效并随 tick 过期', () => {
    const s = freshState();
    s.buffs.push({ kind: 'fireRateMul', mul: 1.3, remaining: 1 });
    expect(totalFireRate(s, config)).toBeCloseTo(config.fireRate * 1.3);
    tickEffects(s, config, rng, 1.1);
    expect(s.buffs).toHaveLength(0);
    expect(totalFireRate(s, config)).toBeCloseTo(config.fireRate);
  });

  it('敌身 dot：按 dps×dt 掉血并可致死', () => {
    const s = freshState();
    const e = enemy({ x: 300, y: 300, hp: 6, maxHp: 100, xp: 1 });
    e.status.dots.push({ dps: 10, remaining: 2 });
    s.enemies = [e];
    tickEffects(s, config, rng, 0.5);
    expect(e.hp).toBeCloseTo(1);
    tickEffects(s, config, rng, 0.5);
    expect(s.enemies).toHaveLength(0);
    expect(s.kills).toBe(1);
  });
});

describe('解释器 · onKill 条件过滤（requiresSource / requiresStatus，批次1新增，通用机制非卡专属）', () => {
  it('requiresSource：只有匹配来源的击杀才触发绑定', () => {
    // aoeOnHit：命中点用 ctx.enemy 的坐标定圆心，但影响目标走半径搜索（enemiesInRadius），
    // 不像 burstDamage 那样把 ctx.enemy 本身当唯一目标——适合验证"死亡点范围效果是否触发"。
    registerSkillDefs([def('range', [
      { trigger: 'onKill', triggerParams: { requiresSource: 'chain' }, effects: [{ atom: 'aoeOnHit', params: { radius: 50, damageRatio: 1 } }] },
    ])]);
    const s = freshState();
    equipCard(s, 'range', 3);
    const bystander = enemy({ x: 10, y: 0, hp: 100, maxHp: 100 });
    s.enemies = [bystander];
    const victimNoSource = enemy({ x: 0, y: 0, hp: 5, maxHp: 5 });
    killEnemy(s, config, rng, victimNoSource); // 无 source：不应触发
    expect(bystander.hp).toBe(100);
    const victimChain = enemy({ x: 0, y: 0, hp: 5, maxHp: 5 });
    killEnemy(s, config, rng, victimChain, 'chain'); // source='chain'：应触发
    expect(bystander.hp).toBeLessThan(100);
  });

  it('requiresStatus：只有死亡时刻处于该状态的敌人才触发绑定', () => {
    registerSkillDefs([def('range', [
      { trigger: 'onKill', triggerParams: { requiresStatus: 'frozen' }, effects: [{ atom: 'aoeOnHit', params: { radius: 50, damageRatio: 1 } }] },
    ])]);
    const s = freshState();
    equipCard(s, 'range', 3);
    const bystander = enemy({ x: 10, y: 0, hp: 100, maxHp: 100 });
    s.enemies = [bystander];
    const warm = enemy({ x: 0, y: 0, hp: 5, maxHp: 5 });
    killEnemy(s, config, rng, warm); // 未冻结：不应触发
    expect(bystander.hp).toBe(100);
    const frozen = enemy({ x: 0, y: 0, hp: 5, maxHp: 5 });
    frozen.status.frozen = 1.5;
    killEnemy(s, config, rng, frozen); // 冻结中：应触发
    expect(bystander.hp).toBeLessThan(100);
  });
});

describe('解释器 · expiryConvert 落地（丰收 5★ 落穗，批次1修复的死修饰）', () => {
  it('过期掉落按 ratio 折算经验，而非纯计入 expired', () => {
    registerSkillDefs([def('luck', [{ trigger: 'passive', effects: [{ atom: 'expiryConvert', params: { ratio: 1 } }] }])]);
    const s = freshState();
    equipCard(s, 'luck', 3);
    spawnGroundDrop(s, config, constRng(0), 100, 100, 'pierce', 2);
    expect(s.xp).toBe(0);
    tickDrops(s, config, constRng(0), config.dropLifetime + 0.01);
    expect(s.groundDrops).toHaveLength(0);
    expect(s.expired).toBe(1);
    expect(s.xp).toBeCloseTo(2 * 4); // drop.star(2) × EXPIRY_CONVERT_XP_PER_STAR(4)
  });

  it('无 expiryConvert 装备时过期纯损失，经验不变', () => {
    const s = freshState();
    spawnGroundDrop(s, config, constRng(0), 100, 100, 'pierce', 2);
    tickDrops(s, config, constRng(0), config.dropLifetime + 0.01);
    expect(s.expired).toBe(1);
    expect(s.xp).toBe(0);
  });
});

describe('解释器 · onKill 递归深度守卫（P2 §11 开放问题，批次1修复）', () => {
  it('每次击杀都通过 chain+requiresSource 同步再触发下一次 onKill：深度上限截断，不会打穿整条连通链', () => {
    registerSkillDefs([def('range', [
      { trigger: 'onKill', triggerParams: { requiresSource: 'chain' }, effects: [{ atom: 'chain', params: { bounces: 1, damageRetention: 1, searchRange: 60 } }] },
    ])]);
    const s = freshState();
    equipCard(s, 'range', 3);
    const N = 20;
    const line = Array.from({ length: N }, (_, i) => enemy({ x: i * 25, y: 0, hp: 1, maxHp: 1 }));
    s.enemies = line;
    s.enemies.shift(); // 播种敌人先移出数组（与 dealDamage 的击杀约定一致），避免自我重选
    killEnemy(s, config, rng, line[0], 'chain'); // 播种：source='chain' 的击杀会同步引发下一环
    expect(s.kills).toBeGreaterThan(0);
    expect(s.kills).toBeLessThan(N); // 深度上限截断，未能沿整条连通链打穿全部 20 个
  });
});

describe('解释器 · 召唤物 respawnOnce（诱饵 5★ 重生，批次1新增运行时语义）', () => {
  it('被摧毁时在新位置重生一次；重生后再次摧毁则正常移除', () => {
    const s = freshState();
    const ctx: EffectCtx = { state: s, config, rng, events: [], origin: { x: 300, y: 300 }, star: 5, baseDamage: 10 };
    ATOMS.summon(ctx, { kind: 'decoy', hp: 10, duration: 999, respawnOnce: true });
    expect(s.summons).toHaveLength(1);
    const summon = s.summons[0];
    summon.hp = 0;
    tickEffects(s, config, rng, 0.05);
    expect(s.summons).toHaveLength(1); // 重生，未移除
    expect(s.summons[0].hp).toBe(s.summons[0].maxHp);
    expect(s.summons[0].respawned).toBe(true);
    s.summons[0].hp = 0;
    tickEffects(s, config, rng, 0.05);
    expect(s.summons).toHaveLength(0); // 第二次摧毁：重生已用掉，正常移除
  });
});
