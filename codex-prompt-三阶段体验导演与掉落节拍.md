# Codex 任务：三阶段体验导演 + 普通掉落时间节拍（StageDirector & OrdinaryDropBudget）

> 本文档为完整实施指令。所有文件路径、行为描述均已对照当前 `main` 分支实际代码核实（2026-07-21）。
> 按「十、实施顺序」的 6 个 Step 依次完成，每个 Step 结束时保持 `npm test` 与 `npm run build`（含 `tsc --noEmit`）通过。
> 设计已拍板，不要用其他方案替代（见「二、已拍板的设计决策」）。

---

## 一、总目标

把整局资源供给、敌人压力和玩家操作负担统一到一条三阶段体验曲线上：

| 阶段 | 波次（8 波基线） | 敌人压力 | 普通掉落节拍 | 玩家状态 |
|---|---|---|---|---|
| 选择期 selection | 1–2 | 低配额、低同屏 | 35/min | 看懂卡池、开始选择 |
| 构筑期 build | 3–6 | 全局最高 | 20 秒内平滑升至 40/min 并保持 | 唯一允许"稍累"的阶段 |
| 验证期 validation | 7–8 | 极少数强敌 + Boss | **关闭**普通掉落 | 基本挂机，验证构筑 |

验证期两波共产生 **5 次**安全强奖励拾取物（高星万能卡），不会过期。

职责分层（三层各司其职，不互相越权）：

```text
外层：三阶段体验导演（本任务新增）   → 决定当前阶段、敌人压力曲线、是否产生普通掉落
中层：普通掉落时间令牌桶（本任务新增）→ 决定每分钟产生多少次普通掉落
内层：现有 normalDropTypePolicy      → 决定这次普通掉落是哪张卡（保持不动）
```

---

## 二、已拍板的设计决策

1. **废弃"每次击杀 rng() < 固定概率"的普通掉落总量模型**。当前 `rollDropOnKill`（`src/core/systems/dropSystem.ts` L61-66）使用 `rng() < totalDropChance(state, config)`，基础值 `economy.defaults.dropChance = 0.27`。该模型使掉落/min 与击杀速度耦合：实测复算（与 `simulateBudgetWave` 同口径、Standard 难度、基础炮台）当前 8 波的常规阶段掉落/min 为 30 → 51 → 64 → 75 → 75 → 76 → 78 → 79，中后期接近目标 40 的两倍。
2. **不采用"每波一个不同概率"**——仍随击杀速度漂移。改用**时间令牌桶**：常规战斗时间内按目标速率积累掉落额度，击杀时消费额度。
3. **废弃全局线性出怪曲线**。当前 `waveQuota = 51 + wave×52`（103→467）、`targetOnScreen = 5 + wave×10`（15→85）、sprint ×3 封顶 maxAlive=100（`src/config/base/waves.json`）。改为选择期/构筑期各自独立的阶段曲线 + 验证期固定遭遇表。注意：实测第 1 波因 waveEndSprint ×3 峰值同屏可达 **43**，远超名义 target 15，所以选择期必须同时关闭 sprint。
4. **`normalDropTypePolicy` 卡型导演完整保留**（`src/core/systems/dropTypePolicy.ts`），不用波数覆盖成熟度。
5. **正式基线 8 波**（1–2 / 3–6 / 7–8），同时新增 **10 波实验 variant**（阶段解析自动得到 1–2 / 3–8 / 9–10）。只有实测证明第 6 波结束时构筑普遍不完整，才把 10 波升级为正式候选。
6. **验证期不屏蔽升级三选一（Perk）弹窗**（用户已确认）：XP 与升级弹窗照常，本任务不改 progression。
7. Harvest 的 `dropRateMul` 改为乘在**每分钟目标速率**上（40 × 1.25 = 50/min），不再乘在单次概率上；验证期该乘数无效（普通掉落渠道已关闭）。Harvest 6★ `onWaveStart extraDrop` 保留原样，来源仍为 `skillExtra`，不计入验证期 5 次强奖励。

---

## 三、当前代码事实（已核实，作为改动基础）

- `src/core/systems/dropSystem.ts`：`rollDropOnKill`（L61）固定概率 → `selectNormalEnemyDropType`；`tickDrops`（L72）统一寿命倒计时，过期 `state.expired++`，无遥测事件；`collectDrop` 卡槽满返回 `{ type: 'cardsFull' }` 事件（L112）。
- `src/core/stats.ts` L39-44：`totalDropChance = min(chanceCap=0.95, dropChance × dropRateMul)`。
- `src/core/systems/budgetRules.ts`：`budgetWaveQuotaFor(wave, budget)` 与 `budgetAdmission(wave, spawnLeft, alive, budget)` 纯函数，被 `waveSystem.ts`、`ui/derivedMetrics.ts` 共用。
- `src/core/systems/waveSystem.ts`：`startNextWave` 设 `spawnLeft = budgetWaveQuotaFor(...)`；相位机 `regular → boss → between`（`WavePhase`，`src/core/types.ts` L10）；`advanceWavePhase` 中 regular 结束条件是无 `spawnKind === 'regular' | 'bounty'` 存活（L106）；boss 相位在 `bossRewardClaimedWave >= wave` 且 Boss 万能卡已拾取前**阻塞**波次结束（L117-121）；`jumpToWave`（L134）为调试清场入口，新增状态必须在此重置。
- `src/core/systems/enemySystem.ts`：`EnemySpawnKind = 'regular' | 'waveBoss' | 'bounty'`（`src/core/types.ts` L11）；`createEnemy` 已支持 `hpMul/speedMul/damageMul/spawnKind` modifiers（L31-68）；`killEnemy`（`damageSystem.ts` L19-31）按 spawnKind 分流：waveBoss → `grantWaveBossReward`，bounty → bounty 结算，其余 → `rollDropOnKill`。
- `src/core/systems/waveBossSystem.ts`：`computeWaveBossReward` 公式下第 7、8 波各产生 1 个拾取物（7 波 3★×1，8 波 3★×2 合并为一个拾取物），两波合计仅 **2** 个拾取物，达不到 5 次要求。奖励用 `spawnWildcardDrop` + `drop.bossRewardWave` 标记，寿命 `bounty.reward.dropLifetimeSeconds`，**会过期**（tickDrops 统一倒计时）。
- `src/core/difficulty.ts` L7：难度进度 `(wave-1)/(totalWaves-1)`——改 totalWaves 会重新解释整条难度曲线，这是 10 波只做 variant 的原因之一。
- `src/core/systems/bountySystem.ts`：offer 生成受 `bounty.offer.enabledFromWave` 等约束；`startNextWave` 已清空 offers；`advanceWavePhase` 已保证 bounty encounter 不跨波（regular 结束条件含 bountyActive 检查）。
- `src/ui/derivedMetrics.ts`：`expectedDrops = 总敌人数 × dropChance`、`dropsPerMinute` 用整局时间作分母（L97-102），不分波/阶段/来源，改造后不能再作主要验收指标；`simulateBudgetWave`（L45）是确定性投影，会被 Step 3 复用。
- `src/telemetry/types.ts`：已有 `dropLanded/pickup/...`，**没有** `dropExpired`，事件无 `source/stage/star/secure` 字段。`metrics.ts` 的 E3 机会事件集为 `dropLanded/perkPopup/mergeOpportunity`。
- `src/config/loader.ts`：variant 深覆盖基建已就绪（`VARIANTS` 注册表 + `?variant=` URL 参数，现有 `dev-short`）。
- `src/core/types.ts` L183-205：`GroundDropBase` 无 secure/stage 字段；`CardDropSource = 'normalKill' | 'bossKill' | 'bounty' | 'skillExtra' | 'debug'`。
- 遥测脚本：`npm run metrics` → `scripts/computeExperienceMetrics.ts`。

---

## 四、配置层改动

### 1. `src/config/types.ts` 新增类型

```ts
export type RunStage = 'selection' | 'build' | 'validation';

/** 阶段内归一化曲线：阶段首波 = start，阶段末波 = end（单波阶段取 end）。 */
export interface StageCurve { start: number; end: number; power: number; }

export interface RegularStageConfig {
  waveQuota: StageCurve;
  targetOnScreen: StageCurve;
  checkInterval: number;
  batchMax: number;
  maxAlive: number;
  waveEndSprint: { window: number; multiplier: number };
}

export interface ValidationEnemySpec {
  type: 'normal' | 'fast' | 'tank';       // 基底敌型，走 createEnemy
  hpMul: number; damageMul: number; speedMul: number;
  ccResistOverride?: number; knockbackResistOverride?: number;
  reward: { star: number; count: number }; // 该精英死亡掉的安全万能卡
}

export interface ValidationWaveConfig {
  enemies: ValidationEnemySpec[];
  bossReward: { star: number; count: number }; // 覆盖 computeWaveBossReward
}

export interface StagePlanConfig {
  selectionWaves: number;
  validationWaves: number;
  selection: RegularStageConfig;
  build: RegularStageConfig;
  /** 按验证期内相对波序索引（第 1 个验证波 = index 0）。 */
  validation: ValidationWaveConfig[];
}

export interface OrdinaryDropRateConfig {
  enabled: boolean;
  selectionPerMinute: number;
  buildPerMinute: number;
  buildTransitionSeconds: number;
  carryCap: number;                 // 额度积压上限（单位：次掉落）
  modifiersAffectTarget: boolean;   // dropRateMul 乘在目标速率上
}
```

`WavesConfig` 增加 `stagePlan: StagePlanConfig`；`EconomyConfig` 增加 `ordinaryDropRate: OrdinaryDropRateConfig`。旧的 `budget.waveQuota/targetOnScreen` 与 `economy.defaults.dropChance`、`economy.drops.chanceCap` **保留为 legacy 字段**（interval 模式与旧面板仍引用），但新路径全部不再读取。

### 2. `src/config/base/waves.json` 新增（第一版基线数值）

```json
"stagePlan": {
  "selectionWaves": 2,
  "validationWaves": 2,
  "selection": {
    "waveQuota":      { "start": 60, "end": 75, "power": 1 },
    "targetOnScreen": { "start": 7,  "end": 10, "power": 1 },
    "checkInterval": 1.95, "batchMax": 6, "maxAlive": 24,
    "waveEndSprint": { "window": 0, "multiplier": 1 }
  },
  "build": {
    "waveQuota":      { "start": 95, "end": 170, "power": 1 },
    "targetOnScreen": { "start": 14, "end": 28,  "power": 1 },
    "checkInterval": 1.95, "batchMax": 10, "maxAlive": 40,
    "waveEndSprint": { "window": 5, "multiplier": 1.5 }
  },
  "validation": [
    { "enemies": [ { "type": "tank",   "hpMul": 14, "damageMul": 2,   "speedMul": 0.75, "ccResistOverride": 0.7, "knockbackResistOverride": 0.8, "reward": { "star": 2, "count": 2 } } ],
      "bossReward": { "star": 3, "count": 1 } },
    { "enemies": [ { "type": "tank",   "hpMul": 20, "damageMul": 2.5, "speedMul": 0.7,  "ccResistOverride": 0.7, "knockbackResistOverride": 0.8, "reward": { "star": 2, "count": 2 } },
                   { "type": "fast",   "hpMul": 10, "damageMul": 2,   "speedMul": 1.1,  "ccResistOverride": 0.5, "knockbackResistOverride": 0.6, "reward": { "star": 3, "count": 1 } } ],
      "bossReward": { "star": 3, "count": 2 } }
  ]
}
```

拾取物计数核对：第 7 波 = 精英 1 + Boss 1 = 2 个；第 8 波 = 精英 2 + Boss 1 = 3 个；合计 **5 个**（"5 次"指拾取物个数，不是万能卡张数）。两个验证精英承担不同验证维度（高血抗控 vs 高速威胁），第一版只用倍率区分，不加新机制。

### 3. `src/config/base/economy.json` 新增

```json
"ordinaryDropRate": {
  "enabled": true,
  "selectionPerMinute": 35,
  "buildPerMinute": 40,
  "buildTransitionSeconds": 20,
  "carryCap": 1.5,
  "modifiersAffectTarget": true
}
```

### 4. `src/config/variants/validation-10.json` 新增并在 `loader.ts` 的 `VARIANTS` 注册

```json
{
  "$comment": "10 波对照实验：验证 8 波基线的构筑完成度是否足够。阶段解析自动得到 1–2 选择 / 3–8 构筑 / 9–10 验证。",
  "waves": { "totalWaves": 10, "bossWaves": [1,2,3,4,5,6,7,8,9,10] }
}
```

### 5. `src/config/base/tuner.json` 新增条目（旧 `economy.defaults.dropChance` 等 legacy 项保留但不再是主调参路径）

```json
"waves.stagePlan.selectionWaves": { "min": 1, "max": 4, "step": 1 },
"waves.stagePlan.validationWaves": { "min": 1, "max": 3, "step": 1 },
"waves.stagePlan.selection.waveQuota.start": { "min": 10, "max": 200, "step": 1 },
"waves.stagePlan.selection.waveQuota.end": { "min": 10, "max": 200, "step": 1 },
"waves.stagePlan.selection.targetOnScreen.start": { "min": 1, "max": 30, "step": 1 },
"waves.stagePlan.selection.targetOnScreen.end": { "min": 1, "max": 30, "step": 1 },
"waves.stagePlan.selection.maxAlive": { "min": 1, "max": 100, "step": 1 },
"waves.stagePlan.build.waveQuota.start": { "min": 10, "max": 400, "step": 1 },
"waves.stagePlan.build.waveQuota.end": { "min": 10, "max": 400, "step": 1 },
"waves.stagePlan.build.targetOnScreen.start": { "min": 1, "max": 60, "step": 1 },
"waves.stagePlan.build.targetOnScreen.end": { "min": 1, "max": 60, "step": 1 },
"waves.stagePlan.build.maxAlive": { "min": 1, "max": 100, "step": 1 },
"economy.ordinaryDropRate.selectionPerMinute": { "min": 5, "max": 90, "step": 1 },
"economy.ordinaryDropRate.buildPerMinute": { "min": 5, "max": 90, "step": 1 },
"economy.ordinaryDropRate.buildTransitionSeconds": { "min": 0, "max": 60, "step": 1 },
"economy.ordinaryDropRate.carryCap": { "min": 1, "max": 5, "step": 0.25 }
```

（验证遭遇表为数组，深合并对数组是整体替换，不进 tuner 滑条；由 variant/JSON 直接调。）

---

## 五、新增 `src/core/runStage.ts`（唯一阶段判定入口）

```ts
export function stageForWave(wave: number, totalWaves: number, plan: StagePlanConfig): RunStage;
// wave <= selectionWaves → 'selection'；wave > totalWaves - validationWaves → 'validation'；否则 'build'

export function stageProgress(wave: number, totalWaves: number, plan: StagePlanConfig): number;
// 阶段内 0..1（单波阶段返回 1），用于 StageCurve 插值

export function stageCurveValue(curve: StageCurve, progress: number): number;
// start + (end - start) * progress ** power

export interface ResolvedWavePlan {
  stage: RunStage;
  quota: number;              // validation 波恒为 0（不走 Budget）
  regular?: Required<Pick<RegularStageConfig, 'targetOnScreen'|'checkInterval'|'batchMax'|'maxAlive'|'waveEndSprint'>> 解析后的标量值;
  validation?: ValidationWaveConfig;
}
export function resolveWavePlan(wave: number, totalWaves: number, plan: StagePlanConfig): ResolvedWavePlan;
```

约束：出怪、掉落、Bounty、遥测、面板**只允许**通过本模块判断阶段，禁止各自再写 `wave <= 2` 之类的散装判断。`selectionWaves + validationWaves >= totalWaves` 时构筑期为空——在 config 校验器里报错（参照 `difficultyValidator.ts` 的做法加一个轻量校验）。

---

## 六、普通掉落时间令牌桶

### 状态（`src/core/types.ts`，挂在 GameState 上）

```ts
ordinaryDrop: {
  credit: number;                  // 当前额度
  activeRegularSeconds: number;    // 本波有效常规战斗秒数
  shownThisWave: number;           // 本波普通掉落展示数
  eligibleKillsThisWave: number;   // 本波普通掉落合格击杀数
}
```

`createInitialState.ts` 初始化；`startNextWave` 重置本波三个统计（credit 跨波保留但受 carryCap 封顶）；`jumpToWave` 完整重置。

### 计时规则（`dropSystem.ts` 新增 `tickOrdinaryDropBudget`，在 `updateGame.ts` 的 `tickDrops` 附近接入）

只有同时满足以下条件才积累额度：`mode === 'playing'`、未暂停、`wavePhase === 'regular'`、阶段为 selection 或 build。Boss 相位、波间休息、验证期、结算一律不积累。

```ts
const base = stage === 'selection'
  ? rate.selectionPerMinute
  : lerp(rate.selectionPerMinute, rate.buildPerMinute,
         clamp01(buildStageSeconds / rate.buildTransitionSeconds)); // 构筑期前 N 秒平滑过渡
const target = base * (rate.modifiersAffectTarget ? getModifiers(state).dropRateMul : 1);
state.ordinaryDrop.credit = Math.min(rate.carryCap, state.ordinaryDrop.credit + target / 60 * dt);
state.ordinaryDrop.activeRegularSeconds += dt;
```

`buildStageSeconds` 指进入构筑期后的累计有效常规秒数（跨波累计，即只在第 3 波开头过渡一次；不要每波重置过渡）。

### 消费规则（改写 `rollDropOnKill`）

```ts
export function rollDropOnKill(state, config, rng, enemy): void {
  if (!cfg.economy.ordinaryDropRate.enabled) { /* legacy 固定概率路径，保留原样 */ }
  if (enemy.spawnKind !== 'regular') return;                    // 精英/Boss/Bounty 不走普通掉落
  if (stageForWave(state.wave, ...) === 'validation') return;   // 验证期关闭
  state.ordinaryDrop.eligibleKillsThisWave++;
  if (state.ordinaryDrop.credit < 1) return;
  state.ordinaryDrop.credit -= 1;
  const type = selectNormalEnemyDropType(state, rng);           // 内层卡型导演，保持不动
  spawnGroundDrop(state, config, rng, enemy.x, enemy.y, type, undefined, 'normalKill');
  state.ordinaryDrop.shownThisWave++;
}
```

`totalDropChance`（stats.ts）在 enabled=true 时不再被调用，标记 `@deprecated legacy`，函数本体保留供 legacy 路径使用。carryCap=1.5 的意义：短暂击杀空窗不损失产出，但 Boss/波间/暂停不会储存出掉落瀑布。

---

## 七、阶段化出怪与验证期固定遭遇

### `budgetRules.ts` 签名改造

```ts
budgetWaveQuotaFor(plan: ResolvedWavePlan): number
budgetAdmission(plan: ResolvedWavePlan, spawnLeft: number, alive: number): BudgetAdmission
```

不让 Budget 系统自行猜阶段。同步更新全部调用点：`waveSystem.ts`（`startNextWave`、`budgetSpawnStrategy`、`budgetTargetFor`）、`ui/derivedMetrics.ts`、涉及 E7 的遥测路径。interval 模式（`intervalSpawnStrategy`）不动。

### `waveSystem.ts`

**采用最小侵入方案：不新增 WavePhase**，沿用 `regular → boss → between`：

- `startNextWave`：通过 `resolveWavePlan` 取本波计划。selection/build 波照旧设 `spawnLeft = quota`；validation 波设 `spawnLeft = 0`，并按遭遇表用 `createEnemy(state, spec.type, wave, randomEdgeSpawnPosition(rng), { hpMul, damageMul, speedMul, spawnKind: 'validationElite', validationReward: spec.reward })` 逐个生成精英（可带 0.8s 左右错峰，复用 spawnTimer 或直接一次性生成，一次性生成更简单且敌人只有 1–2 个，选一次性生成）。
- `advanceWavePhase` regular 结束条件的 blockingEnemy 判断加入 `'validationElite'`（L106）。精英清完 → 照常进入 boss 相位。
- boss 相位阻塞逻辑（L117-121）扩展：除 Boss 奖励外，本波所有 `secure` 验证奖励掉落未拾取时同样阻塞波次结束（复用现有 `groundDrops.some(...)` 模式，按新增的 `validationRewardWave` 标记过滤）。

### `enemySystem.ts` / `types.ts`

- `EnemySpawnKind` 增加 `'validationElite'`；`EnemyModifiers` 增加 `ccResistOverride/knockbackResistOverride/validationReward`；`Enemy` 增加可选 `validationReward?: { star: number; count: number }`。
- ccResist/knockbackResist 目前来自 `cfg.enemies.types[type]` 的 def——override 存到 enemy 实例上，状态系统读取时优先取实例值（找到 `knockbackResist/ccResist` 的消费点做一处 fallback 即可）。

### `damageSystem.ts` `killEnemy` 分流扩展

```ts
if (enemy.spawnKind === 'waveBoss') { ...现有 grantWaveBossReward... }
else if (enemy.spawnKind === 'validationElite') events.push(...grantValidationEliteReward(state, enemy));
else if (enemy.bountyEncounterId !== undefined) { ...现有... }
else rollDropOnKill(...);
```

### `waveBossSystem.ts`

- 新增 `grantValidationEliteReward`：按 `enemy.validationReward` 调 `spawnWildcardDrop`，打 `secure` + `validationRewardWave` 标记。
- `grantWaveBossReward`：波处于 validation 阶段时改用遭遇表的 `bossReward` 覆盖 `computeWaveBossReward`，同样打 secure 标记；普通阶段 Boss 完全走现有公式，不动。

### 安全掉落（`dropSystem.ts` / `types.ts`）

`GroundDropBase` 增加 `secure?: boolean`。`tickDrops` 对 `secure` 掉落**跳过寿命倒计时**（永久保留直到拾取，仍需手动点击）。现有 Boss 奖励（普通阶段）与 Bounty 奖励维持现状（会过期），只有验证期奖励标 secure。

### `bountySystem.ts`

offer 生成入口加一条：`if (stageForWave(...) === 'validation') return;`。offer 清理与 encounter 不跨波已有保障（见「三」），无需额外清理逻辑。

---

## 八、遥测与面板

### `src/telemetry/types.ts`

- `TelemetryEventType` 增加：`'dropExpired' | 'dropRejectedFullHand' | 'validationRewardLanded' | 'validationRewardPickup'`。
- `TelemetryEvent` 增加可选字段：`source?: string`（CardDropSource）、`stage?: RunStage`、`star?: number`、`secure?: boolean`。
- 接线：`tickDrops` 过期时返回事件供 `devTelemetry` 记录 `dropExpired`（带 source/stage）；`collectDrop` 的 `cardsFull` 事件映射为 `dropRejectedFullHand`；验证奖励落地/拾取分别发 `validationRewardLanded/Pickup`；现有 `dropLanded/pickup` 补 `source/stage/star` 字段。

### `src/telemetry/metrics.ts` + `scripts/computeExperienceMetrics.ts` 每波新增列

| 指标 | 验收用途 |
|---|---|
| stage | 阶段标注 |
| activeRegularSeconds | 分母口径 |
| ordinaryDropsShown/min（= shown ÷ activeRegularSeconds × 60） | 验收 35/40 |
| eligibleKills/min | 检查目标掉率是否可实现（必须 > 掉落目标） |
| 普通拾取率 / 普通过期率 | 验收 20–30% 放弃 |
| dropRejectedFullHand 次数 | 区分"没点"与"不能点" |
| validationRewardDrops | 验收 2/3/合计 5 |
| 验证期普通掉落数 | 必须为 0 |

放弃率口径：`普通过期 ÷ (普通拾取 + 普通过期)`，只统计 `source === 'normalKill'`，严禁混入 Boss/Bounty/skillExtra/验证奖励/debug。

### `src/ui/derivedMetrics.ts`

- 顶层 `expectedDrops/dropsPerMinute` 标记 legacy（保留给 interval 模式面板）。
- `simulateBudgetWave` 改为接收 `ResolvedWavePlan`；validation 波不跑 Budget 投影，输出遭遇摘要（敌人数、预计 TTK）。
- 新增逐波输出：`stage`、`ordinaryDropsTargetPerMinute`（selection/build 按配置，validation 为 0）、`projectedOnScreenP50/P95`（用现有 area/peak 即可近似）。

---

## 九、硬性不变量（实现后逐条自查）

1. `normalDropTypePolicy` / `dropTypePolicy.ts` 的选型行为与配置一字不改（角色袋、成熟度、pity、连发保护全保留）。
2. interval 出怪模式、`spawnInterval`、`enemyCountFor` 保持原样（legacy 路径）。
3. 普通阶段（1–6 波）Boss 奖励公式 `computeWaveBossReward`、Bounty 全流程行为不变。
4. `ordinaryDropRate.enabled = false` 时整体回退到当前固定概率 + 全局线性 Budget 行为（回归开关）。
5. 万能卡拾取绕过卡槽容量的现有行为不变（`collectDrop` wildcard 分支）——验证奖励因此不会被卡槽满阻止。
6. 难度曲线 `difficulty.ts` 公式不动；验证精英倍率乘在难度倍率之上。
7. `jumpToWave`/`restartWave` 调试入口对新增状态（ordinaryDrop、验证遭遇进度）完整重置。
8. 固定 seed 下整局可复现（所有新逻辑只用注入的 rng）。

---

## 十、实施顺序（6 个独立 Step，每步可单独提交）

### Step 1：阶段解析层
新增 `runStage.ts` + `StagePlanConfig` 类型 + waves.json 配置 + 校验器，**不改任何运行时行为**。
验收：单测覆盖 8 波与 10 波下 `stageForWave/stageProgress/resolveWavePlan` 的边界（第 2/3/6/7 波、9/10 波）；`npm test`、`npm run build` 通过。

### Step 2：普通掉落令牌桶
保留当前敌人曲线，只替换掉落总量模型（`ordinaryDropRate` 配置 + tick/consume + `rollDropOnKill` 改写 + `dropRateMul` 改口径 + jumpToWave 重置）。
验收：固定 seed 仿真/单测下，selection 波 shown/min ∈ [33,37]，build 波稳定 ∈ [38,42]，过渡 20 秒内完成；把击杀速度人为翻倍（测试里直接堆额度消费请求），shown/min 不变；credit 永不超过 carryCap；boss/between/paused 不积累。

### Step 3：阶段化敌人 Budget
`budgetRules` 签名改造 + selection/build 各自曲线生效 + 全部调用点（waveSystem、derivedMetrics、E7）更新。
验收：第 1–2 波峰值同屏（含 sprint=off）≤ 16；构筑期 target 14→28、maxAlive 40；掉落节拍不受本步影响；`simulateBudgetWave` 投影与新配置一致。

### Step 4：验证期固定遭遇
`validationElite` spawnKind + `startNextWave` 遭遇生成 + `advanceWavePhase` 阻塞扩展 + bounty 阶段闸门 + 抗性 override。
验收：第 7 波 = 1 精英 + Boss，第 8 波 = 2 精英 + Boss；验证期普通掉落 = 0、Bounty offer = 0；`spawnLeft` 恒 0；精英清完才出 Boss。

### Step 5：五次安全强奖励
`secure` 掉落 + `grantValidationEliteReward` + validation Boss 奖励覆盖 + 波次结束阻塞。
验收：两波拾取物 2 + 3 = 5，星级构成 2★×2 / 3★×1 / 2★×2 / 3★×1 / 3★×2；secure 掉落寿命不减；未拾取时波次不结束；不受卡槽容量阻止。

### Step 6：遥测、面板与 10 波 variant
新事件与字段 + metrics 新列 + derivedMetrics 阶段化 + tuner 新条目 + `validation-10` variant 注册。
验收：`npm run metrics` 输出含 stage 与普通/奖励分离指标；`?variant=validation-10` 下阶段解析为 1–2/3–8/9–10 且验证遭遇表照常生效；8 波与 10 波各跑一局固定 seed 遥测对比"进入验证期时构筑完成度"（成熟度 M、最高星、装备数）。

---

## 十一、最终验收（实机游玩，代码完成后另行执行）

- 选择期：掉落 33–37/min，eligibleKills/min > 掉落目标，同屏峰值 ≤16，不因低敌压导致资源断档失败。
- 构筑期：38–42/min；Harvest 3★ 时 47.5–52.5/min；强构筑不推高掉落/min；卡型仍按成熟度收敛。
- 验证期：普通掉落 0、offer 0、奖励 5 次不过期、同屏为个位数、玩家基本无操作可通过（构筑合格前提下）。
- 放弃率（仅 normalKill 口径）落在 20–30%，且 `dropRejectedFullHand` 占比低——大量卡槽满拒绝要判为问题，不是合理放弃。
- 8 波基线若"第 7 波构筑完成度"不达标，再评估把 validation-10 升为正式结构。
