# Codex 任务：验证波重做 —— 终局敌潮 + 基础掉落隔离

> 本文档为完整实施指令。所有文件路径、行号、行为描述均已对照当前 `main` 分支实际代码核实（2026-07-30，HEAD = `0a5c06c`）。
> 按「九、实施顺序」的 7 个 Step 依次完成，每个 Step 结束时保持 `npm test` 与 `npm run build`（含 `tsc --noEmit`）通过。
> 设计已拍板，见「二、已拍板的设计决策」。**不要用其他方案替代，不要自行加码「二」里没写的机制。**

---

## 一、总目标

把验证期（第 9、10 波）从「零星几个大血包 + Boss」改成**终局敌潮**：

| 维度 | 现状 | 目标 |
|---|---|---|
| 敌人来源 | 开波一次性塞入 1–2 个固定精英，`spawnLeft = 0` | 走 Budget 出怪规则的持续敌潮 + 进度里程碑精英 + Boss 持续召唤护卫 |
| 敌人强度 | 单体 14–20 倍血、2–2.5 倍伤害 | 压力来自**数量、接近速度与漏怪惩罚**，杂兵属性倍率 ≥ 1，精英血量下调到 4–6 倍 |
| 同屏敌人 | 1–2 | 第 9 波 P50 ≈ 32–40、第 10 波 P50 ≈ 42–50 |
| 基础掉落 | 已关闭（阶段门控） | 继续严格为 0，且改为按敌人来源硬门控（不依赖阶段判断） |
| 手动拾取 | 第 9 波 2 个 / 第 10 波 3 个安全奖励 | 保持「少量高星」：数量不变，最低星级从 3★ 提到 4★，且 `reward` 改为可选以便调参 |
| 波间静默 | 验证期波间自由时间 17 秒 | 6 秒 |

体验判据：**构筑成型 → 持续割草；构筑失败 → 被淹死。** 验证波保留完整致死能力。

---

## 二、已拍板的设计决策

1. **验证波内部结构 = 敌潮 + 进度里程碑精英 + Boss（Boss 阶段持续召唤护卫）**。三者都要做。
2. **敌潮复用现有 Budget 规则**（`budgetAdmission` / `budgetSpawnStrategy`），不写第二套刷怪算法。做法是让 `resolveWavePlan` 在验证阶段也返回 `regular`，把验证敌潮参数投射成 `ResolvedRegularStageConfig`。
3. **验证波必须有独立敌人构成表**，不再走全局 `typeRoll`。原因：`typeRoll` 是 `tankBase 0.2 + wave × 0.025`，第 9 波坦克概率 42.5%、第 10 波 45%，第 10 波高速怪只剩约 2%。直接恢复出怪会得到「一堆肉盾缓慢挤向中心」，不是割草。
4. **杂兵属性倍率不做削弱**。`hpMul` / `damageMul` / `speedMul` 一律 ≥ 1。漏怪按全额扣血、可以打死玩家——验证波本质与前面的波一致，只是敌人更多更难。**不要引入「验证波不致死」「验证波降低伤害」之类的保护。**
5. **精英血量必须从 14/20 倍下调到 4–6 倍**。理由：敌潮同时在消耗玩家火力，20 倍血的精英会重新制造长时间停滞，把刚做出来的割草节奏又切断。精英的定位改为「敌潮中的硬点」，不是「整波的唯一内容」。
6. **基础掉落逻辑独立**：验证波杂兵不产生任何普通掉落、不产生任何 Bounty。整波只有少量高星安全奖励（卡牌 / 万能卡），沿用现有 `secure` 机制（不过期、等玩家拾取后波次才真正结束）。
7. **技能自带的掉落/收益效果一律不屏蔽**。`extraDrop` 等原子是玩家自己的构筑选择，本次不管它对验证波掉落数量的影响。**不要给 `extraDrop` 加阶段门控、上限或折算。**
8. **不加「验证波关闭经验」开关**。已核实：`progression.xpThresholds` 只有 8 档、最高累计 280；第 1–3 波配额合计约 202 个击杀（`tank.xp = 2`，其余 1），第 4 波内 8 个遗物就全部发完，之后 `addXp` 恒返回空事件。第 9、10 波不可能因为经验弹出遗物三选一，所以这不是问题，也不需要新配置字段。
9. **不改验证奖励的生成坐标**。已核实拾取是 `onArenaTap → collectNearest(state, …, x, y, pickupRadius)`（`src/game.ts` L193-197），玩家没有位移，点哪儿都能拾取。「奖励掉在屏幕角落要跑过去」的问题在本项目不存在。
10. **`dev-short` variant 必须同步覆写验证敌潮**。`dev-short` 是 `totalWaves 3 / selectionWaves 1 / validationWaves 1`，第 3 波就是验证波，而黄金 fixture `04-run-victory` 与 `05-run-defeat` 都用它。若不覆写，第 3 波会变成 240 只敌潮，`04-run-victory` 的 `win: true` 语义会崩。注意 `deepMerge` 对数组是**整体替换**，所以 variant 必须提供完整的 `validation` 数组。

---

## 三、当前代码事实（已核实，作为改动基础）

### 阻断验证波变成敌潮的直接原因

`src/core/runStage.ts` L38-44，验证阶段固定返回 `quota: 0` 且不返回 `regular`：

```ts
if (stage === 'validation') {
  const validationIndex = wave - (totalWaves - plan.validationWaves + 1);
  return { stage, quota: 0, validation: plan.validation[validationIndex] };
}
```

`src/core/systems/waveSystem.ts` L48-62，开波时清零配额并一次性塞入全部精英：

```ts
if (wavePlan.validation) {
  state.spawnLeft = 0;
  state.waveSpawnQuota = 0;
  for (const spec of wavePlan.validation.enemies) {
    state.enemies.push(createEnemy(state, spec.type, state.wave, randomEdgeSpawnPosition(rng), { … spawnKind: 'validationElite', … }));
  }
}
```

`src/core/systems/budgetRules.ts` L25-37：`budgetAdmission` 在 `!plan.regular` 时全额返回 0。所以只要让验证 plan 带上 `regular`，出怪、批次、硬上限、波末冲刺全部自动复用。

### 已经做对、需要保留的部分

- **普通掉落已在验证阶段关闭**：`dropSystem.ts` L75（击杀路径）与 L90（时间额度积累）都对 `stage === 'validation'` 提前 return。
- **Bounty 已在验证阶段关闭**：`bountySystem.ts` L161。
- **验证奖励已是安全掉落**：`waveBossSystem.ts` L82-83、L143-144 打 `secure = true` + `validationRewardWave`；`dropSystem.ts` L111 `if (drop.secure) continue` 跳过寿命倒计时；`waveSystem.ts` L169 让安全奖励未拾取时阻塞波次结束。
- **相位机已有奖励结算窗**：`advanceWavePhase` 在验证波清场后进 `validationRewardSettle`（`intermissionSystem.ts` L15-25，12 秒，可由玩家提前确认），再出 Boss。这正好是「割草结束 → 安静收奖 → Boss」的节拍，保留不动。

### 恢复敌潮后必须一并处理的点

- `dropSystem.ts` L65-73：`ordinaryDropRate.enabled === false` 时走的**旧概率分支在阶段判断之前**，会给验证杂兵掷普通掉落。必须在函数最前面按来源硬门控。
- `waveSystem.ts` L141：`blockingEnemy` 只认 `regular | bounty | validationElite`，新的杂兵来源必须加入，否则杂兵还活着就提前进 Boss。
- `enemySystem.ts` L113-118：`spawnEnemy` 无条件调 `determineType`（全局 `typeRoll`），验证波必须换成独立构成表。
- `enemySystem.ts` L44-46：`createEnemy` 里 `difficultyMultipliersFor` 的难度倍率**乘在配置倍率之外**（standard 难度第 10 波敌人 hp 约 ×0.95）。配置里的 `hpMul` 是难度之上的额外倍率。
- Boss 阶段结束判定（`waveSystem.ts` L164-169）**不检查场上是否还有敌人**，而 `beginIntermission` / `startNextWave` 都不清空 `state.enemies`。所以 Boss 召唤的护卫如果不显式清理，会泄漏到下一波。
- `src/ui/derivedMetrics.ts` L109-120：`simulateBudgetWave` 用 `if (!plan.regular)` 判断验证波并读 `plan.validation.enemies`。验证 plan 带上 `regular` 后这个分支永远不会命中，投影里的 `validationEncounter` 会消失，必须改写。
- `src/config/stagePlanValidator.ts` L75-82：当前**强制每个验证精英都必须有 `reward`**，`reward` 改可选后要解除。
- `src/config/loader.ts` L41-50 `normalizeValidationRewards`：遍历 `wave.enemies` 补 `kind`，字段改名后要跟着迁移。
- `src/config/validateAll.ts` L256-260：`semantic:validationRewardKinds` 同样遍历 `wave.enemies`。

### 其他相关常量（供数值判断，不要在本次改）

- 画布 540×730，炮台 (270, 365)，`breakthroughDist = 48`，玩家 `hp.max = 100`。
- 基础炮台 `damage 18 / fireRate 5 / range 150`。
- 第 10 波敌人基础血量：normal 158、fast 123、tank 540（再乘难度倍率）。
- normal 撞击伤害 8 → 满血约 13 次漏怪即死。这是刻意保留的失败惩罚。
- `combat.controlBudget = { maxControlledRatio: 0.6, minFreeAdvancers: 2 }`，按场上敌人数动态计算，敌潮下控制流派会自然放大（同屏 44 时最多可控约 26 只）。
- `combat.vfx.killParticles = 12`，粒子无数量上限；12 击杀/秒 → 约 90 个存活粒子，实测量级可接受，本次不加粒子池。

---

## 四、配置层改动

### 4.1 `src/config/types.ts`

替换 `ValidationEnemySpec` / `ValidationWaveConfig`，新增两个类型。**保留 `ValidationRewardSpec` 与 `ValidationRewardTypePolicy` 不动。**

```ts
/** 验证波杂兵构成权重。三项 >= 0 且总和 > 0；按 normal → fast → tank 固定顺序做累积抽取。 */
export interface ValidationCompositionConfig {
  normal: number;
  fast: number;
  tank: number;
}

/** 验证波敌潮：投射成 ResolvedRegularStageConfig 后复用 budgetAdmission。 */
export interface ValidationSwarmConfig {
  quota: number;
  targetOnScreen: number;
  checkInterval: number;
  batchMax: number;
  maxAlive: number;
  waveEndSprint: { window: number; multiplier: number };
  /** 难度倍率之上的额外倍率，一律 >= 1（拍板决策 4）。 */
  hpMul: number;
  damageMul: number;
  speedMul: number;
  composition: ValidationCompositionConfig;
}

export interface ValidationEnemySpec {
  type: 'normal' | 'fast' | 'tank';
  hpMul: number;
  damageMul: number;
  speedMul: number;
  ccResistOverride?: number;
  knockbackResistOverride?: number;
  /** 可选：省略表示这个精英是纯压力点，不掉奖励。 */
  reward?: ValidationRewardSpec;
}

/** 里程碑精英：敌潮进度越过 spawnAtProgress 时生成一次。 */
export interface ValidationEliteSpawnSpec extends ValidationEnemySpec {
  /** [0, 1)，同一波内不得重复。progress = 1 - spawnLeft / waveSpawnQuota。 */
  spawnAtProgress: number;
}

/** Boss 阶段的持续护卫召唤；护卫是 validationMinion，不掉奖励、不计入敌潮配额。 */
export interface ValidationBossEscortConfig {
  intervalSeconds: number;
  count: number;
  /** 同时存活的护卫上限。 */
  maxAlive: number;
  hpMul: number;
  damageMul: number;
  speedMul: number;
  composition: ValidationCompositionConfig;
}

export interface ValidationWaveConfig {
  swarm: ValidationSwarmConfig;
  elites: ValidationEliteSpawnSpec[];
  /** 省略 = Boss 阶段不召唤护卫。 */
  bossEscort?: ValidationBossEscortConfig;
  bossReward: ValidationRewardSpec;
}
```

### 4.2 `src/config/base/waves.json`

把 `stagePlan.validation` 整段替换为下列**初值**（不是最终值，见 Step 7 的校准流程）：

```json
"validation": [
  {
    "swarm": {
      "quota": 240,
      "targetOnScreen": 36,
      "checkInterval": 0.6,
      "batchMax": 12,
      "maxAlive": 56,
      "waveEndSprint": { "window": 6, "multiplier": 1.5 },
      "hpMul": 1,
      "damageMul": 1,
      "speedMul": 1.05,
      "composition": { "normal": 0.6, "fast": 0.3, "tank": 0.1 }
    },
    "elites": [
      {
        "spawnAtProgress": 0.5,
        "type": "tank",
        "hpMul": 5,
        "damageMul": 2,
        "speedMul": 0.8,
        "ccResistOverride": 0.7,
        "knockbackResistOverride": 0.8,
        "reward": { "kind": "card", "star": 4, "count": 1, "typePolicy": "focusGod" }
      }
    ],
    "bossEscort": {
      "intervalSeconds": 4.5,
      "count": 3,
      "maxAlive": 16,
      "hpMul": 0.9,
      "damageMul": 1,
      "speedMul": 1.1,
      "composition": { "normal": 0.5, "fast": 0.5, "tank": 0 }
    },
    "bossReward": { "kind": "wildcard", "star": 5, "count": 1 }
  },
  {
    "swarm": {
      "quota": 320,
      "targetOnScreen": 46,
      "checkInterval": 0.5,
      "batchMax": 16,
      "maxAlive": 72,
      "waveEndSprint": { "window": 6, "multiplier": 1.5 },
      "hpMul": 1.1,
      "damageMul": 1,
      "speedMul": 1.1,
      "composition": { "normal": 0.55, "fast": 0.33, "tank": 0.12 }
    },
    "elites": [
      {
        "spawnAtProgress": 0.35,
        "type": "tank",
        "hpMul": 6,
        "damageMul": 2.5,
        "speedMul": 0.8,
        "ccResistOverride": 0.7,
        "knockbackResistOverride": 0.8,
        "reward": { "kind": "wildcard", "star": 4, "count": 1 }
      },
      {
        "spawnAtProgress": 0.7,
        "type": "fast",
        "hpMul": 4,
        "damageMul": 2,
        "speedMul": 1.15,
        "ccResistOverride": 0.5,
        "knockbackResistOverride": 0.6,
        "reward": { "kind": "card", "star": 5, "count": 1, "typePolicy": "focusGod" }
      }
    ],
    "bossEscort": {
      "intervalSeconds": 3.5,
      "count": 4,
      "maxAlive": 22,
      "hpMul": 0.9,
      "damageMul": 1,
      "speedMul": 1.15,
      "composition": { "normal": 0.45, "fast": 0.55, "tank": 0 }
    },
    "bossReward": { "kind": "wildcard", "star": 5, "count": 1 }
  }
]
```

同时把波间自由时间改短：

```json
"intermission": { "freeSeconds": { …, "validation": 6 }, … }
```

数值意图（写进 `$comment` 或提交说明，便于后续校准时理解）：

- 手动拾取物数量：第 9 波 2 个（精英 4★ 卡 + Boss 5★ 万能卡），第 10 波 3 个（精英 4★ 万能卡 + 精英 5★ 卡 + Boss 5★ 万能卡）。全部 ≥ 4★。若实测仍觉得拾取偏多，删掉第 10 波第一个精英的 `reward` 即可降到 2 个，不需要改代码。
- `targetOnScreen` 明显高于构筑期末值 28；`maxAlive` 留出 `sprint = ceil(target × 1.5)` 的余量（36→54 ≤ 56；46→69 ≤ 72）。
- `checkInterval` 从构筑期 1.95 缩到 0.6 / 0.5，`batchMax` 提到 12 / 16。这是维持高同屏的关键：以构筑期的 1.95s × 10 只补怪速率（约 5 只/秒），跟不上 8–12 击杀/秒的清场速度，同屏会持续塌陷。

### 4.3 `src/config/variants/dev-short.json`

必须新增完整的 `validation` 数组（数组整体替换语义），把验证波压到黄金回放能承受的规模：

```json
"stagePlan": {
  "selectionWaves": 1,
  "validationWaves": 1,
  "validation": [
    {
      "swarm": {
        "quota": 24,
        "targetOnScreen": 8,
        "checkInterval": 1.2,
        "batchMax": 4,
        "maxAlive": 16,
        "waveEndSprint": { "window": 0, "multiplier": 1 },
        "hpMul": 1,
        "damageMul": 1,
        "speedMul": 1,
        "composition": { "normal": 0.6, "fast": 0.3, "tank": 0.1 }
      },
      "elites": [
        {
          "spawnAtProgress": 0.5,
          "type": "tank",
          "hpMul": 3,
          "damageMul": 1.5,
          "speedMul": 0.85,
          "reward": { "kind": "card", "star": 4, "count": 1, "typePolicy": "focusGod" }
        }
      ],
      "bossReward": { "kind": "wildcard", "star": 5, "count": 1 }
    }
  ]
}
```

`dev-short` 刻意**不配 `bossEscort`**，让短局 fixture 只覆盖「敌潮 + 里程碑精英 + Boss」，护卫机制由专项单测覆盖。

### 4.4 `src/config/stagePlanValidator.ts`

新增校验（全部走既有 `fail()` 风格，报错路径写全）：

- `swarm` 必须存在。`quota` 为 `>= 0` 的整数（允许 0，用于回退到「无敌潮」）；`batchMax`、`maxAlive` 为正整数；`checkInterval > 0`；`targetOnScreen >= 0` 且 `targetOnScreen <= maxAlive`。
- `waveEndSprint.window >= 0`、`multiplier >= 1`（复用现有 `regular()` 里的同名校验逻辑，抽成小函数共用）。
- `hpMul`、`damageMul`、`speedMul` 有限且 `> 0`；并对 `< 1` 的值报错，因为拍板决策 4 明确不削弱杂兵（错误信息写明「验证波杂兵倍率不得低于 1，压力应来自数量而非削弱」）。
- `composition` 三项都是 `>= 0` 的有限数，且总和 `> 0`。
- `elites` 必须是数组（可为空）。每项 `spawnAtProgress` 有限且 `0 <= v < 1`，同一波内不得重复；`hpMul` / `damageMul` / `speedMul` `> 0`；`ccResistOverride` / `knockbackResistOverride` 若存在须在 `[0, 1]`。
- `reward` **改为可选**：只在存在时调 `reward(...)` 校验（这条是解除 L79 的现有强制）。
- `bossEscort` 若存在：`intervalSeconds > 0`、`count` 正整数、`maxAlive` 正整数、三个倍率 `> 0`、`composition` 同上。
- `bossReward` 仍必填，规则不变。

### 4.5 `src/config/validateAll.ts`

`semantic:validationRewardKinds`（L256-260）改为遍历 `wave.elites`，且 `reward === undefined` 时跳过（不报 warning）。

### 4.6 `src/config/loader.ts` 兼容层

`normalizeValidationRewards`（L41-50）改造为 `normalizeValidationStage`，承担字段迁移：

1. 若某个验证波条目有 `enemies` 而没有 `elites`：把 `enemies` 搬到 `elites`，并按数组下标均匀分配 `spawnAtProgress`（第 i 项 = `i / (n + 1)`，保证落在 `[0, 1)` 且互不相同）。
2. 若没有 `swarm`：补一个 `quota: 0` 的最小 swarm（`targetOnScreen: 0`、`checkInterval: 1`、`batchMax: 1`、`maxAlive: 1`、`waveEndSprint {0, 1}`、三个倍率 1、`composition { normal: 1, fast: 0, tank: 0 }`）。这样旧配置行为回落成「只有固定精英」，与今天完全一致。
3. `bossEscort` 缺失时保持 `undefined`（不补默认值）。
4. `kind` 缺失仍静默补 `wildcard`（现有行为保留），遍历对象换成 `elites` 且跳过 `undefined` 的 `reward`。

`presets/*.tuner.json` 已核实均不含 `stagePlan`，无需迁移。

---

## 五、核心层改动

### 5.1 `src/core/types.ts`

```ts
export type EnemySpawnKind =
  | 'regular'
  | 'waveBoss'
  | 'bounty'
  | 'validationElite'
  | 'validationMinion';
```

`GameState` 新增验证阶段运行态：

```ts
validationRuntime: {
  /** 已触发的 elites 下标。 */
  spawnedEliteIndexes: number[];
  /** Boss 护卫召唤倒计时。 */
  bossEscortTimer: number;
  /** Boss 死亡后是否已清场护卫（幂等标记）。 */
  bossEscortsCleared: boolean;
};
```

`src/core/createInitialState.ts` 在 `validationRewardSettleRemaining`（L113）附近补上初值 `{ spawnedEliteIndexes: [], bossEscortTimer: 0, bossEscortsCleared: false }`。

**为什么用独立的 `validationMinion` 而不是复用 `regular`**：`regular` 是「参与普通经济循环的敌人」的语义标记，`dropSystem` 与遥测都靠它区分。独立来源让掉落门控变成一行来源判断，不再依赖「当前波恰好是验证阶段」这种间接推理，也让 `ordinaryDropRate.enabled` 的两条分支都被同一个门控覆盖。全项目 `spawnKind` 判断点只有 6 处，改动面很小。

### 5.2 `src/core/runStage.ts`

`resolveWavePlan` 的验证分支改为把 swarm 投射成 `regular`：

```ts
if (stage === 'validation') {
  const validationIndex = wave - (totalWaves - plan.validationWaves + 1);
  const validation = plan.validation[validationIndex];
  return {
    stage,
    quota: Math.max(0, Math.trunc(validation.swarm.quota)),
    regular: {
      targetOnScreen: validation.swarm.targetOnScreen,
      checkInterval: validation.swarm.checkInterval,
      batchMax: validation.swarm.batchMax,
      maxAlive: validation.swarm.maxAlive,
      waveEndSprint: { ...validation.swarm.waveEndSprint },
    },
    validation,
  };
}
```

`ResolvedWavePlan` 的类型不变（`regular` 与 `validation` 现在可以同时存在，注释里说明这一点）。

### 5.3 `src/core/systems/waveSystem.ts`

**删除** L48-62 整段验证特判（`spawnLeft = 0` / `waveSpawnQuota = 0` / 一次性塞精英）。`state.spawnLeft = budgetWaveQuotaFor(wavePlan)` 现在会自然拿到 swarm 的 quota。

在 `startNextWave` 里重置运行态：

```ts
state.validationRuntime = { spawnedEliteIndexes: [], bossEscortTimer: 0, bossEscortsCleared: false };
```

（`jumpToWave` 末尾调用 `startNextWave`，所以只在这一处重置即可；但 `jumpToWave` 里已有的一串瞬态清理保持不动。）

新增导出：

```ts
/** 验证阶段导演：里程碑精英 + Boss 护卫召唤 + Boss 死亡后清场护卫。 */
export function tickValidationDirector(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[]
```

行为：

1. `if (state.mode !== 'playing') return []`。取 `plan = resolveActiveWavePlan(cfg, state.wave)`，`if (!plan.validation) return []`。
2. **里程碑精英**（仅 `state.wavePhase === 'regular'`）：
   - `const quota = state.waveSpawnQuota; const progress = quota > 0 ? 1 - state.spawnLeft / quota : 1;`
   - 遍历 `plan.validation.elites`，对未在 `spawnedEliteIndexes` 中且 `spawnAtProgress <= progress` 的项，用 `createEnemy(state, spec.type, state.wave, randomEdgeSpawnPosition(rng), { hpMul, damageMul, speedMul, spawnKind: 'validationElite', ccResistOverride, knockbackResistOverride, validationReward: spec.reward })` 生成，push 进 `state.enemies`，记录下标，产出事件 `{ type: 'validationEliteSpawned', wave, eliteIndex, enemyId }`（新增事件类型，见 5.6）。
   - 遍历顺序按配置数组下标，保证同帧多个精英的 RNG 消耗顺序确定。
3. **Boss 护卫召唤**（仅 `state.wavePhase === 'boss'`，且 `plan.validation.bossEscort` 存在，且 `state.waveBossId !== null` 且该 Boss 仍在 `state.enemies` 中）：
   - `state.validationRuntime.bossEscortTimer -= dt`；`while (timer <= 0)` 时：统计现存 `spawnKind === 'validationMinion'` 数量，按 `maxAlive` 余量截断 `count`，逐只生成（类型走 `determineValidationType(escort.composition, rng())`，倍率取 escort 的三个 mul，`spawnKind: 'validationMinion'`，不带 `validationReward`），然后 `timer += intervalSeconds`。产出 `{ type: 'validationEscortSpawned', wave, count }`。
   - 进入 Boss 相位那一帧要把 `bossEscortTimer` 设为 `intervalSeconds`（在 `advanceWavePhase` 里两处 `state.wavePhase = 'boss'` 之后各设一次，或统一抽一个 `enterBossPhase()` 小函数），避免开场瞬间就刷一批。
4. **Boss 死亡清场**：若 `state.wavePhase === 'boss'` 且 `state.waveBossId !== null` 且 Boss 已不在 `state.enemies` 中且 `!bossEscortsCleared`：把所有 `spawnKind === 'validationMinion'` 从 `state.enemies` 移除（**直接移除，不走 `killEnemy`**，刻意不给击杀奖励与 `onKill`，与 `moveEnemies` 里撞嘲讽召唤物的既有处理一致），置 `bossEscortsCleared = true`，产出 `{ type: 'validationEscortsCleared', wave, removed }`。
   - 这一步是必需的：Boss 相位结束判定不检查场上敌人，而 `beginIntermission` / `startNextWave` 都不清空 `state.enemies`，护卫会泄漏到第 10 波。

`advanceWavePhase` L141 的 `blockingEnemy` 增加 `validationMinion`：

```ts
const blockingEnemy = state.enemies.some(enemy =>
  enemy.spawnKind === 'regular'
  || enemy.spawnKind === 'bounty'
  || enemy.spawnKind === 'validationElite'
  || enemy.spawnKind === 'validationMinion');
```

### 5.4 `src/core/updateGame.ts`

在 `tickSpawns(state, rng, dt);`（L36）之后插入：

```ts
events.push(...tickValidationDirector(state, config, rng, dt));
```

放在 `tickSpawns` 之后、`updateBullets` 之前：精英要在本帧的补怪之后按最新 `spawnLeft` 判进度，且生成的敌人当帧就参与移动与索敌。**不要**改 `tickSpawns` 的签名（它被 4 个测试文件直接调用）。

### 5.5 `src/core/systems/enemySystem.ts`

1. 新增纯函数（导出，供单测直接验证）：

```ts
/** 验证波独立敌人构成：按 normal → fast → tank 顺序累积抽取。总权重 <= 0 时回落为 normal。 */
export function determineValidationType(composition: ValidationCompositionConfig, roll: number): EnemyType {
  const total = composition.normal + composition.fast + composition.tank;
  if (!(total > 0)) return 'normal';
  const scaled = roll * total;
  if (scaled < composition.normal) return 'normal';
  if (scaled < composition.normal + composition.fast) return 'fast';
  return 'tank';
}
```

2. `spawnEnemy` 分流。**必须保持每只敌人的 RNG 抽取次数与顺序不变**（1 次类型 roll + `randomEdgeSpawnPosition` 的 2 次），否则黄金回放的 `rng.draws` 会漂移得难以解释：

```ts
export function spawnEnemy(state: GameState, rng: Rng): void {
  const roll = rng();
  const plan = resolveActiveWavePlan(cfg, state.wave);
  const swarm = plan.validation?.swarm;
  const type = swarm
    ? determineValidationType(swarm.composition, roll)
    : determineType(state.wave, roll, state.spawnLeft);
  const spawn = randomEdgeSpawnPosition(rng);
  state.enemies.push(createEnemy(state, type, state.wave, spawn, swarm
    ? {
        spawnKind: 'validationMinion',
        hpMul: swarm.hpMul,
        damageMul: swarm.damageMul,
        speedMul: swarm.speedMul,
      }
    : undefined));
}
```

`determineType` 保持导出与现有行为不变（选择/构筑期与 legacy 线性 Budget 仍在用）。

### 5.6 `src/core/systems/dropSystem.ts`

`rollDropOnKill`（L65）**最前面**加来源硬门控，覆盖 `ordinaryDropRate.enabled` 的两条分支：

```ts
export function rollDropOnKill(state: GameState, config: Config, rng: Rng, enemy: Enemy): void {
  // 验证波杂兵与 Boss 护卫走独立的基础掉落逻辑：零普通掉落。
  // 必须先于 ordinaryDropRate.enabled 分支判断——旧概率分支在阶段判断之前 return。
  if (enemy.spawnKind === 'validationMinion') return;
  const rate = cfg.economy.ordinaryDropRate;
  …
}
```

L74-75 的两行现有门控**保留**（`spawnKind !== 'regular'` 与阶段判断），作为第二道防线。

### 5.7 事件类型

`src/core/types.ts` 的 `GameEvent` 联合新增三项：

```ts
| { type: 'validationEliteSpawned'; wave: number; eliteIndex: number; enemyId: number }
| { type: 'validationEscortSpawned'; wave: number; count: number }
| { type: 'validationEscortsCleared'; wave: number; removed: number }
```

`src/ui/eventText.ts` 若对事件类型做穷尽映射，补上对应文案（精英入场值得给玩家一条提示；护卫生成/清场不必给文案，静默即可）。

### 5.8 `src/core/systems/damageSystem.ts`

**不改。** `killEnemy` L26 的 `validationElite → grantValidationEliteReward` 分流已经正确；`grantValidationEliteReward`（`waveBossSystem.ts` L197-205）在 `!enemy.validationReward` 时返回 `[]`，天然支持「无奖励精英」。`validationMinion` 落到 `else` 分支进 `rollDropOnKill`，被 5.6 的门控拦住。经验结算（L30-31）保持无条件执行——见拍板决策 8。

---

## 六、投影与遥测

### 6.1 `src/ui/derivedMetrics.ts`

`simulateBudgetWave`（L109）改造：删掉 `if (!plan.regular)` 的验证特判分支，改为在正常敌潮模拟结束后叠加精英估算。

```ts
// 敌潮模拟（原有循环，不变）
…
let duration = Math.max(now - checkInterval, ...leaveAt);
let validationEncounter: BudgetProjection['validationEncounter'];
if (plan.validation) {
  const elites = plan.validation.elites;
  const estimatedTtk = elites.reduce(
    (sum, elite) => sum + cell(game, runtime, elite.type, wave, distance, difficultyId).ttk * elite.hpMul, 0);
  duration += estimatedTtk;
  validationEncounter = { enemyCount: elites.length, estimatedTtk };
}
```

`BudgetProjection` / `DerivedWaveProjection` 的 `validationEncounter` 字段签名不变，只是数据来源换成 `elites`。Boss 护卫在静态投影里**刻意忽略**（它是 Boss 相位的动态机制，无法在无玩家输入的确定性投影里估算），在函数注释里写明这一点。

`spawnEnemy` 的杂兵倍率也应体现在投影里：`simulateBudgetWave` 里 `lifetime('normal')` 改为按 `plan.validation?.swarm` 存在时乘 `hpMul`（TTK 正比于血量）、除 `speedMul`（行走时间反比于速度）。若这会让改动过大，退一步：只乘 `hpMul`，并在注释里注明投影不考虑 `speedMul`。

### 6.2 `src/telemetry/metrics.ts`

`WaveMetrics` 新增三个字段（都从**现有**遥测事件计算，不新增遥测事件类型）：

```ts
/** 本波击杀速度，用于验收「割草感」。 */
killsPerSecond: number | null;   // kills.length / (end - start)，分母 <= 0 时 null
/** 本波玩家主动拾取次数（pickup + validationRewardPickup）。 */
manualPickups: number;
/** 本波战斗中被迫弹出的决策次数（decision_offered + perkPopup）。 */
decisionPopups: number;
```

`tests/experienceMetrics.test.ts` 的期望对象要跟着补齐；`scripts/computeExperienceMetrics.ts` 的输出表加上这三列。

已有的 `validationRewardDrops`、`validationOrdinaryDrops`、`e1.p50/p95`（同屏敌人分位）、`e2`（最大事件空窗）足以覆盖其余 KPI，不要重复造字段。

---

## 七、测试

`tests/validationStage.test.ts` 现有 6 个用例中有 4 个绑定了「固定 1 个 / 固定 2 个精英、`spawnLeft === 0`」的旧行为，必须重写。**不要保留 `expect(state.spawnLeft).toBe(0)` 这类断言。**

### 7.1 结构与出怪

1. `jumpToWave(…, 9)` 后 `state.spawnLeft === cfg.waves.stagePlan.validation[0].swarm.quota` 且 `state.enemies` 为空（不再开波即塞精英）。
2. 连续 `tickSpawns` 后场上出现 `spawnKind === 'validationMinion'` 的敌人，且数量受 `budgetAdmission` 约束：任意时刻 `state.enemies.length <= swarm.maxAlive`。
3. 杂兵类型分布只来自 `composition`：以 `composition { normal: 1, fast: 0, tank: 0 }` 的临时配置跑 200 次 `spawnEnemy`，全部为 `normal`（证明没有走全局 `typeRoll` —— 后者在第 9 波会给出约 42.5% 的 tank）。
4. `determineValidationType` 纯函数单测：边界 roll（0、恰好等于 normal 权重、恰好等于 normal+fast、接近 1）与总权重为 0 的回落。
5. 里程碑精英只在越过 `spawnAtProgress` 时触发**一次**：手工把 `state.spawnLeft` 设到 `quota × 0.51` 之上/之下，验证触发前后 `validationElite` 数量为 0 → 1，且多帧 tick 后仍为 1。
6. 杂兵未清空时 `advanceWavePhase` 返回 `[]`（不提前进 Boss）；杂兵与精英都清空且 `spawnLeft === 0` 后进入 `validationRewardSettle`。
7. `jumpToWave` 会清空 `validationRuntime.spawnedEliteIndexes`（跳走再跳回同一波，精英能重新触发）。

### 7.2 Boss 护卫

8. Boss 相位下经过 `intervalSeconds` 后生成 `count` 只 `validationMinion`；再经过若干周期，存活护卫数不超过 `bossEscort.maxAlive`。
9. 进入 Boss 相位那一帧不立即生成护卫（`bossEscortTimer` 被初始化为 `intervalSeconds`）。
10. Boss 死亡后护卫被清场（`state.enemies` 中无 `validationMinion`），且 `state.kills` **不因清场增加**、不触发 `onKill`。
11. 护卫不阻塞波次结束：Boss 死亡 + 奖励拾取后 `advanceWavePhase` 产出 `waveCleared`。
12. `bossEscort` 省略时（用 `dev-short`）Boss 相位不生成任何 `validationMinion`。

### 7.3 收益隔离

13. 杀死 100 只 `validationMinion` 后 `state.groundDrops` 中 `source === 'normalKill'` 的掉落数为 0，且 `state.ordinaryDrop.shownThisWave === 0`。
14. 同上，但把 `cfg.economy.ordinaryDropRate.enabled` 设为 `false`（走旧概率分支）并把 `dropChance` 拉到 1 —— 仍然为 0。**这条是回归 5.6 那道硬门控的关键用例。**
15. `validationMinion` 仍触发 `onKill`（挂一个 fixture 技能，断言触发计数等于击杀数）。
16. `validationMinion` 击杀仍计入 `state.kills`。
17. 验证波不产生 Bounty offer（保留现有用例）。
18. 每波手动拾取物数量等于配置里 `reward` 存在的精英数 + 1（Boss）：第 9 波 2 个、第 10 波 3 个，且全部 `secure === true`、`star >= 4`。
19. 精英 `reward` 省略时不产生任何掉落（新建一个只含无奖励精英的临时配置）。
20. 保留现有「安全奖励永不过期 / 万能卡绕过满手牌 / 实体卡等待空位」用例，只更新精英数量与星级期望。

### 7.4 回归

21. 选择期 / 构筑期的出怪类型、普通掉落、经验行为完全不变（`tests/dropSystem.test.ts`、`tests/waveBudgetSystem.test.ts`、`tests/bossWaves.test.ts` 应无需修改即通过；若需修改，说明改动越界了）。
22. `cfg.waves.stagePlan.enabled = false` 时仍走 legacy 线性 Budget，验证波无精英无护卫（保留现有用例）。
23. `tests/configLoader.test.ts` 新增：旧格式（只有 `enemies` + 无 `swarm`）能被 `normalizeValidationStage` 迁移成 `elites` + `quota: 0` 的 swarm，且 `spawnAtProgress` 互不相同、均在 `[0, 1)`。
24. `tests/runStage.test.ts` 新增：验证波的 `ResolvedWavePlan` 同时带 `regular` 与 `validation`，且 `regular` 各字段等于 `swarm` 对应字段。
25. `stagePlanValidator` 负例：`targetOnScreen > maxAlive`、`composition` 全 0、`spawnAtProgress` 重复、`spawnAtProgress === 1`、`hpMul < 1` 各自抛出对应错误。
26. `tests/budgetDerivedMetrics.test.ts`：验证波投影同时给出敌潮同屏估算与 `validationEncounter`。

---

## 八、黄金回放

`04-run-victory` 与 `05-run-defeat` 都用 `dev-short`，而 `dev-short` 的第 3 波就是验证波，所以两个 fixture 的 summary 必然变化。

流程：

1. 先完成 Step 1–6，`npm test` 除 `goldenReplay.test.ts` 外全绿。
2. `npm run replay:record` 重录全部 fixture。
3. **人工核对 diff 的语义合理性**，尤其是：
   - `04-run-victory` 的 `win` 必须仍为 `true`（若变成 `false`，说明 4.3 的 `dev-short` 敌潮压得不够小，调低 `quota` / `targetOnScreen` 后重录，不要改 fixture 的 spec）。
   - `05-run-defeat` 的 `win` 必须仍为 `false`。
   - `enemiesRemaining`、`kills`、`rngDraws` 的变化方向要能被「第 3 波多了 24 只敌潮」解释。
4. `npm run validate` 通过（`schema:stagePlan` 与 `semantic:validationRewardKinds` 两条检查项要覆盖新字段）。

`tests/headlessRun.test.ts` 的三个用例预期仍能通过（base 用例把 `hp` 设成 1,000,000、`damage` 设成 200；`dev-short` 用例只断言 `mode === 'ended'` 与 `wave <= 3`，死亡也满足）。若 `reproduces the 10-wave validation-entry snapshot` 用例的快照变了，按实际值更新——它断言的是 `wave: 9` 与自我一致性，不是具体数值。

---

## 九、实施顺序

每个 Step 结束时 `npm test` + `npm run build` 通过（Step 6 之前允许 `goldenReplay.test.ts` 失败）。

- **Step 1 · 配置契约**：4.1 类型 + 4.4 校验器 + 4.5 语义校验 + 4.6 兼容层。此时 `waves.json` 还没改，靠兼容层让旧格式继续跑，测试应全绿（含 7.3 的 #23、#25）。
- **Step 2 · 配置数值**：4.2 `waves.json` + 4.3 `dev-short.json` + 波间时长。此时行为已变，`validationStage.test.ts` 会红——正常。
- **Step 3 · 敌潮接通**：5.1 `core/types.ts` + `createInitialState` + 5.2 `runStage.ts` + 5.3 `waveSystem.ts` 的删除与 `blockingEnemy` + 5.5 `enemySystem.ts`。跑 7.1 的 #1–#4、#6、7.4 的 #24。
- **Step 4 · 掉落隔离**：5.6 `dropSystem.ts` 门控。跑 7.3 的 #13–#16。
- **Step 5 · 里程碑精英与 Boss 护卫**：5.3 的 `tickValidationDirector` + 5.4 `updateGame` 接线 + 5.7 事件类型。跑 7.1 的 #5、#7 与 7.2 全部。
- **Step 6 · 投影与遥测**：6.1 `derivedMetrics.ts` + 6.2 `metrics.ts` + 脚本输出列。跑 7.4 的 #26 与 `experienceMetrics.test.ts`。
- **Step 7 · 黄金回放与校准**：按「八」重录 fixture；然后按下面的校准流程给出一次实测读数。

### 数值校准（Step 7 的产出物，不要在代码里写死结论）

`waves.json` 里的 240/320、36/46 是**起点**，不是定稿。校准方式：

1. 用 `npm run metrics` 跑一局带遥测的实测，读第 9、10 波的 `e1.p50`（同屏敌人）、`killsPerSecond`、`e2`（最大事件空窗）、`manualPickups`、`decisionPopups`、`validationOrdinaryDrops`。
2. 目标区间（成型构筑）：

| 指标 | 第 9 波 | 第 10 波 |
|---|---|---|
| 同屏敌人 P50 | 32–40 | 42–50 |
| 击杀速度 | 4–8 /秒 | 6–12 /秒 |
| 最大事件空窗 | ≤ 1.5 秒 | ≤ 1.5 秒 |
| 普通地面掉落 | 严格 0 | 严格 0 |
| 主动拾取次数 | 2 | 3 |
| 战斗中决策弹窗 | 0 | 0 |

3. 偏离时的调节顺序：同屏不足 → 先降 `checkInterval` / 提 `batchMax`（补怪速率跟不上清场速率是最常见原因），再提 `targetOnScreen`；整波太长 → 降 `quota`；停滞感 → 降精英 `hpMul`。**不要**通过降低杂兵 `hpMul` 来提高割草感（违反拍板决策 4）。
4. 如需 A/B 对照，新增 `src/config/variants/legacy-validation.json`（把 `validation` 数组整体还原成今天的固定精英格式，靠 4.6 兼容层跑通），注册进 `VARIANTS`，用 `?variant=legacy-validation` 对比新旧验证波。

### 文档同步

- `docs/配置管线v1_说明.md`：`schema:stagePlan` 与 `semantic:validationRewardKinds` 两行的说明补上「验证敌潮 / 里程碑精英 / Boss 护卫」。
- 提交说明里写明：验证波语义从「用高血量精英检查玩家能否击杀」改为「用高密度压力检查玩家清场能力」。

---

## 十、明确不要做的事

1. **不要**为验证波写第二套刷怪算法。敌潮必须走 `budgetAdmission` + `budgetSpawnStrategy`。
2. **不要**新增 `xpRewards` / `ordinaryDrops` 之类的验证波布尔开关。经验路径不改（拍板 8），普通掉落靠 `spawnKind` 门控而不是配置开关。
3. **不要**给 `extraDrop` 或任何技能原子加阶段门控、数量上限或折算（拍板 7）。
4. **不要**降低验证波杂兵的 `hpMul` / `damageMul`，也不要加「验证波不致死」「HP 保底」之类的保护（拍板 4）。
5. **不要**改验证奖励的生成坐标或加自动拾取（拍板 9）。
6. **不要**改 `tickSpawns` 的签名（4 个测试文件直接调用它）。
7. **不要**手改 `tests/golden/*.summary.json`，只能通过 `npm run replay:record` 重生成。
8. **不要**改 `determineType`、`typeRoll` 配置、`budgetRules.ts` 的准入公式，以及选择期 / 构筑期的任何数值。
9. **不要**在本次加入击杀连击数、屏幕震动、精英入场特写、粒子批处理、验证期专属 HUD。这些属于第二阶段的终局演出，等敌潮版本试玩过再决定。
10. **不要**改 `VALIDATION_REWARD_SETTLE_SECONDS`（12 秒，玩家可提前确认）。割草结束后的这段安静收奖窗口是刻意保留的节拍。
