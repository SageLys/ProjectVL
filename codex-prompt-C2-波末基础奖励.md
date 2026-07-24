# Codex 任务 C2：波末基础奖励 + 基础属性基数化重构

> 前置：C0、C1 已合并。总纲见 `docs/神池构筑系统_总纲与阶段计划.md`。
> 文件行号仅供导航，以符号名为准。结束时 `npm test` 与 `npm run build` 通过。

---

## 一、目标

1. 新增 `waveRewardSystem`：每波结束在波间 `settle` 步**同时结算多项**基础奖励（回血、血上限、基础伤害、射程、同发数等），全部**基数加法**，不做互斥三选一。
2. 统一基础属性语义：新增 `RunBaseStats`，消除"damageBonus 是加法、rangeBonus 是百分比"的混乱。
3. 本阶段**不删**经验升级里的基础 stat perk（C4 删），但两套来源写入同一 `RunBaseStats`，保证只迁移一次。

## 二、硬性不变量

1. 装备态/遗物的乘法缩放（`buildModifierSystem`、buffs）语义不动。
2. 波末奖励不进决策队列（无需选择），只产出汇总事件供波间面板展示。
3. 同一波的奖励恰好结算一次：重复调用、jumpToWave、读档路径都不得重复发放。

## 三、现状（已核实）

| 位置 | 事实 | 处置 |
|---|---|---|
| `src/core/types.ts` `GameState` | `damageBonus`（加法）、`fireRateBonus`（加法）、`rangeBonus`（**百分比**）、`multi`、`maxHp/hp`、`xpGainBonus` | 引入 `runBaseStats`，旧字段保留但冻结为"legacy 升级来源"（C4 删除） |
| `src/core/stats.ts` `totalDamage` | `(config.damage + state.damageBonus) * buffMul` | 改为 `(config.damage + state.damageBonus + state.runBaseStats.damageAdd) * buffMul` |
| `stats.ts` `totalRange` | `min(config.range + config.range * state.rangeBonus, maxAttackRange())` | 改为 `min(config.range + config.range * state.rangeBonus + state.runBaseStats.rangeAdd, maxAttackRange())` |
| `stats.ts` `totalFireRate` / `totalMulti` | 同构 | 加上 `fireRateAdd` / `multiAdd` |
| `src/core/systems/progressionSystem.ts` `applyStatEffect` | heal/maxHp/damagePct/fireRatePct/rangePct/xpGainPct 写旧字段 | 不动（C4 整体删除） |
| C0 已建 | `waveRewards.json` 空骨架、`WaveRewardDef/RunBaseStatKind` 类型 | 本阶段填充与消费 |
| C1 已建 | 波间 `settle` 步钩子 | 在此调用结算 |

## 四、状态与系统

```ts
// src/core/types.ts
export interface RunBaseStats { damageAdd: number; fireRateAdd: number; rangeAdd: number; multiAdd: number; }
// GameState 增加：
//   runBaseStats: RunBaseStats;
//   waveRewardsClaimedWave: number;   // 已结算到的波号，防重复
```

新增 `src/core/systems/waveRewardSystem.ts`：

```ts
export function grantWaveRewards(state: GameState, wave: number): GameEvent[] {
  if (state.waveRewardsClaimedWave >= wave) return [];
  state.waveRewardsClaimedWave = wave;
  const granted: Array<{ id: string; stat: RunBaseStatKind; add: number }> = [];
  for (const def of cfg.waveRewards.rewards) {
    if (def.waves !== 'all' && !def.waves.includes(wave)) continue;
    applyRunBaseReward(state, def.effect);   // heal→hp(封顶 maxHp)；maxHpAdd→maxHp 与 hp 同加；其余写 runBaseStats
    granted.push({ id: def.id, stat: def.effect.stat, add: def.effect.add });
  }
  return granted.length ? [{ type: 'waveRewardsGranted', wave, granted }] : [];
}
```

`GameEvent` 增加 `{ type: 'waveRewardsGranted'; wave: number; granted: ... }`；波间面板（C1 的 `intermissionPanel`）在 settle 步展示逐项汇总。

## 五、首版配置（`src/config/base/waveRewards.json`，数值占位、C9 标定）

```json
{
  "version": "0.1.0",
  "rewards": [
    { "id": "waveDamage",     "waves": "all",       "effect": { "stat": "damageAdd",   "add": 2 } },
    { "id": "waveHeal",       "waves": "all",       "effect": { "stat": "heal",        "add": 8 } },
    { "id": "maxHpMilestone", "waves": [2, 5, 8],   "effect": { "stat": "maxHpAdd",    "add": 10 } },
    { "id": "rangeMilestone", "waves": [3, 6],      "effect": { "stat": "rangeAdd",    "add": 8 } },
    { "id": "multiMilestone", "waves": [5, 9],      "effect": { "stat": "multiAdd",    "add": 1 } },
    { "id": "fireRateMilestone", "waves": [4, 7],   "effect": { "stat": "fireRateAdd", "add": 0.15 } }
  ]
}
```

要求结构保证：同一波可同时回血与加血上限；全部为基础加法；**不允许**任何 `当前总值 × 百分比` 的永久成长条目（校验器拒绝新增 pct 类 stat）。

## 六、测试与验收

新增 `tests/waveRewardSystem.test.ts`：

1. 第 2 波结束同时获得 waveDamage + waveHeal + maxHpMilestone；hp/maxHp/damage 断言精确。
2. 对同一波重复调用 `grantWaveRewards` 不重复发放；`jumpToWave(5)` 后打完第 5 波只结算第 5 波。
3. `totalDamage/totalRange/totalMulti/totalFireRate` 读到 runBaseStats 增量；rangeAdd 是像素基数而非百分比。
4. heal 不溢出 maxHp；maxHpAdd 同步抬 hp。
5. 波间面板显示逐项汇总（DOM 测试跟随 `tests/zzdom.test.ts` 惯例）。
6. 遥测：`wave_rewards_granted`。
