# Codex 实施 Prompt：奖励蓄力条替换经验/等级/遗物系统

## 角色与目标

你是本仓库的实施工程师。本次任务把「击杀得经验 → 升级 → 遗物三选一」整套系统**从主分支移除**，替换为一个**自动抽奖、自动执行、玩家只点一次确认**的奖励蓄力条。

**体验目标（唯一判据）**：简化游戏，提供更简单直接的正反馈。玩家在整个奖励流程中**不做任何选择**，确认按钮的语义是「我看到了，继续」，不是「是否接受」。

### 本次删除

- 角色等级（`state.level` / `xp` / `xpNeed`）
- 遗物系统（配置、状态、决策、UI、编辑器、设计工作台、xlsx 同步）
- `levelUp` / `relicOffered` / `relicSelected` 事件

### 本次保留（不要误删）

- **卡牌合成升星**、**卡牌分支进化**（`evolutionBranch`）、**卡间配方进化**（`recipePin` / `recipeEvolutionSystem`）
- **波末自动基础属性成长 + 波末五选一永久升级**（`waveRewardSystem.ts` / `waveRewards.json` / `waveBaseReward` 决策）—— 本次**不动**，只需把 `xpGainPct` 的落点改指向奖励条
- 神池决策（`godDraft` / `godFocus`）
- `upgradeFeedback.ts` 的卡牌升星庆祝横幅（只摘掉它对 `levelUp` 事件的依赖）
- `scripts/computeExperienceMetrics.ts` —— 这里的 "Experience" 指**游戏体验指标**（掉落节奏/操作密度/危险区），与经验值无关，**不得删除**

---

## 阶段 P0：先读这一节（我已核实的代码事实）

写代码前必须知道下面这些，否则会踩坑或漏改。行号基于 `main@0a5c06c`。

### P0.1 经验有**两个**入口，不是一个

1. `src/core/systems/damageSystem.ts:30`（`killEnemy`）
   ```ts
   const xpGain = enemy.xp * cfg.progression.killXpMul * (1 + state.xpGainBonus) * getModifiers(state).xpMul;
   events.push(...addXp(state, xpGain, rng));
   ```
2. `src/core/systems/dropSystem.ts:122`（`tickDrops`）—— 丰收 5★「落穗」`expiryConvert` 把过期掉落折算经验：
   ```ts
   const EXPIRY_CONVERT_XP_PER_STAR = 4;                    // :19
   events.push(...addXp(state, drop.star * EXPIRY_CONVERT_XP_PER_STAR, rng));
   ```
   **这条极易漏掉。** 它必须同样迁移到 `addRewardPoints`，否则丰收流派的落穗词条会静默失效。

### P0.2 `addXp` 是累计阈值 + while 循环，会一帧内连开多个决策

`progressionSystem.ts:116-126`：`state.xp` 累计，`while` 循环跨越多个阈值。
现有测试 `tests/progressionSystem.test.ts:35-58` **专门断言**「一次给 40 点经验产生 3 个遗物决策并排队」。
新系统必须**反过来**：一次满条只产生**一个**待确认回执，溢出积分留着，确认后才检查下一次。

### P0.3 `buildModifierSystem.ts` 有天然干净的拆除路径 —— 不要整文件删

- `currentTotals(state)` 在 `state.buildState.scalingVersion === 0` 时**直接返回 `EMPTY_TOTALS`**。遗物是 `scalingVersion` 的唯一写入者。
- 所以：清空 `aggregateBuildScaling()` 的遗物循环 + 不再有人 `scalingVersion++` = 遗物缩放自动归零，**卡牌词条缩放与运行期修饰器一行不动**。
- `runtimeScalingFor()` + `RuntimeStatModifier { remaining }` **已经是一条完整的、带时限的、可作用于全部 `BUILD_SCALING_RULES` 轴的临时构筑强化通道**。

  → **「构筑共鸣」不需要任何新机制**，直接往 `state.statModifiers` 推带 `remaining` 的修饰器即可，`tickEffects` 已负责到期清理。

### P0.4 `state.buildState.affinity` 是**死字段**（既有 bug）

`settlement.ts:30` 和 `bountySystem.ts:110` 都**读**它，但全项目**没有任何写入点**。
后果：`runSummary.topLane` 恒为 `null`；bounty 的 lane 仲裁恒退化到第一个 lane。
本次新增的 `calculateBuildProfile()` 正好填这个坑 —— 但**处理方式见 P6.3，默认先不接线**，避免把 bounty 行为变更混进本 PR。

### P0.5 暂停与输入闸门共 4 处

| 位置 | 现有条件 |
|---|---|
| `updateGame.ts:19-20` | `state.paused \|\| state.decisions.current !== null` |
| `game.ts:117-118` | `if (state.decisions.current) modals.showDecision(...) else hideDecision()` |
| `game.ts:315` | `if (state.mode !== 'playing' \|\| state.intermission.active \|\| state.decisions.current) return;` |
| `recipeEvolutionSystem` | 以 `reason: 'decision'` 拒绝进化 |

全部需要加上「或存在待确认奖励回执」。

### P0.6 效果原子层的三个坑

1. `registry.ts:89 targets()` —— `ctx.enemy` 存在时**只打单体**。奖励执行**绝不能**设 `ctx.enemy`；半径走 `ctx.radius`，传一个大于场地对角线的值即为全屏。
2. `registry.ts:107 cappedDuration()` —— `ctx.consume ? Math.min(5, want) : want`。奖励执行**绝不能**设 `consume: true`，否则「构筑共鸣」12 秒会被砍成 5 秒。
3. `registry.ts:647 statBuff` 的 `sourceId = statBuff:${ctx.sourceCardId ?? ctx.sourceCardType ?? 'anonymous'}:...`。奖励必须使用**独立的 sourceId 前缀**（如 `reward:buildSurge:*`），否则会和卡牌 buff 抢同一个 `maxStacks` 槽位互相顶掉。

### P0.7 可直接复用的既有能力（不要重写战斗代码）

| 需求 | 现成函数 |
|---|---|
| 全场伤害 | `damageSystem.dealDamage()`；或 `burstDamage` 原子（`ctx.baseDamage * damageMul`，含 `retaliationNova` vfx） |
| 冻结 | `statusSystem.applyFreeze(e, duration, stacksToTrigger?)` |
| 易伤 | `statusSystem.applyVulnerable(e, ratio, duration, maxStacks)` |
| Boss 控制预算 | `statusSystem.controlBudgetDenies(state, e)` —— 全场控制**必须**先过这一关 |
| 治疗 | `restore` 原子逻辑：`state.hp = Math.min(state.maxHp, state.hp + amount + state.maxHp * amountRatio)` |
| 护盾 | `restore` 原子**不含护盾**；护盾走 `state.shield`（`ShieldState`），参考 `shield` 原子 |
| 万能卡 | `wildcardSystem.grantWildcards(state, grants)` |
| 血上限对账 | `stats.reconcileMaxHp(state)` |
| 临时属性 | `state.statModifiers.push({ sourceId, stat, operation, value, remaining })` |

### P0.8 黄金回放会**必然**漂移

- `replay/record.ts:147-154 choiceFor()` 的 switch 含 `relic`
- `record.ts:274` `for (let guard = 0; state.decisions.current && guard < 16; guard++)`
- `record.ts:314` `xp: state.xp, level: state.level`
- `record.ts:319` `relics: [...state.buildState.relicHistory]`
- `tests/golden/*.summary.json` 五份都含 `counters.xp` / `counters.level` / `relics[]`；`04-run-victory` 录到 `level: 9`（8 件遗物全出）

回放循环必须**同时**能自动确认奖励回执，否则录制会卡死在 `currentReceipt` 上。

---

## 阶段 P1：Git 分支（先做，不写任何代码）

「转移到另一个分支」在 Git 里不需要复制文件 —— 让一个新分支指针指向改动前的同一提交即可。

```bash
git fetch origin
git switch main
git pull --ff-only origin main

BASE_COMMIT="$(git rev-parse origin/main)"
echo "$BASE_COMMIT"   # 记录下来写进 PR 描述

git branch archive/pre-reward-meter-2026-07-30 "$BASE_COMMIT"
git push origin archive/pre-reward-meter-2026-07-30

git switch -c refactor/reward-meter "$BASE_COMMIT"
git push -u origin refactor/reward-meter
```

验收：
```bash
git rev-parse origin/archive/pre-reward-meter-2026-07-30
git rev-parse origin/refactor/reward-meter
# 此刻两者必须相同
```

之后**所有**改动在 `refactor/reward-meter` 上进行，完成后开 PR 合入 `main`。
**不要**直接在 `main` 上逐个删文件。归档分支创建后不再前移，也不在其上继续开发。

---

## 阶段 P2：配置契约

### P2.1 拆分 `progression.json`

现有 `src/config/base/progression.json` 混装了两类完全无关的东西：经验/遗物调度 + **对局结算计分**。直接删整个文件会连带删掉结算分数。

拆成两个文件：

**`src/config/base/settlement.json`**（原样搬运 `progression.settlement`）
```json
{
  "version": "0.1.0",
  "winBonus": 500,
  "perWaveCleared": 40,
  "perKill": 2,
  "hpRatioBonusMax": 200,
  "perEquippedStarSquared": 10,
  "wildcardStarValue": { "1": 15, "2": 40, "3": 100, "4": 250, "5": 600 }
}
```

**`src/config/base/rewardMeter.json`**
```json
{
  "version": "0.1.0",
  "pointMul": 1,
  "expiryConvertPointsPerStar": 4,
  "thresholds": [10, 12, 16, 24, 33, 45, 60, 80],
  "afterSchedule": "repeatLast",
  "rewardKillsGrantPoints": false,
  "preventImmediateRepeat": true,
  "lowHpWeightBoost": { "hpRatioBelow": 0.4, "rewardId": "clarityReflux", "weightMul": 3 },
  "rewards": [
    {
      "id": "heartbreakNova",
      "textKey": "rewards.heartbreakNova",
      "weight": 1,
      "action": { "kind": "globalDamage", "damageMul": 8, "bossMaxHpRatioCap": 0.1 }
    },
    {
      "id": "absoluteStillness",
      "textKey": "rewards.absoluteStillness",
      "weight": 1,
      "action": { "kind": "globalControl", "freezeSeconds": 2.5, "vulnerableRatio": 0.3, "vulnerableSeconds": 5 }
    },
    {
      "id": "clarityReflux",
      "textKey": "rewards.clarityReflux",
      "weight": 1,
      "action": { "kind": "restoreAndShield", "healRatio": 0.25, "shieldHits": 1 }
    },
    {
      "id": "wildHeart",
      "textKey": "rewards.wildHeart",
      "weight": 1,
      "action": { "kind": "grantWildcards", "count": 1, "starSchedule": [1, 1, 2, 2, 3, 3, 4, 5] }
    },
    {
      "id": "buildResonance",
      "textKey": "rewards.buildResonance",
      "weight": 1,
      "action": { "kind": "buildSurge", "duration": 12, "value": 0.25 }
    }
  ]
}
```

**阈值换算说明**：原累计阈值 `[10,22,38,62,95,140,200,280]` 目标一局 5–8 件遗物。上表是它的**逐段差值**，即每次重新蓄力所需积分。首版**刻意保持原触发节奏不变**，让本次只验证「体验形式变化」这一个变量。试玩后再单独调频率。

### P2.2 类型（`src/config/types.ts`）

删除：`RelicDef` / `RelicsConfig` / `ProgressionConfig`；`GameConfig` 删 `relics` 与 `progression`。
新增：`RewardMeterConfig` / `RewardDef` / `RewardAction` / `SettlementConfig`；`GameConfig` 加 `rewardMeter` 与 `settlement`。

```ts
export type RewardAction =
  | { kind: 'globalDamage'; damageMul: number; bossMaxHpRatioCap: number }
  | { kind: 'globalControl'; freezeSeconds: number; vulnerableRatio: number; vulnerableSeconds: number }
  | { kind: 'restoreAndShield'; healRatio: number; shieldHits: number }
  | { kind: 'grantWildcards'; count: number; starSchedule: number[] }
  | { kind: 'buildSurge'; duration: number; value: number };
```

`BuildScalingAxis` **保留**（卡牌词条仍在用），只是不再有遗物往里写。
`WaveChoiceStatKind` 保留 `'xpGainPct'` 这个**配置键名不变**（避免波末奖励配置/文案/tuner 连锁改动），但落点改指奖励条 —— 见 P5.2。

### P2.3 `src/config/index.ts`

导出名单删 `RelicDef` / `RelicsConfig`，加 `RewardDef` / `RewardMeterConfig` / `RewardAction` / `SettlementConfig`。

### P2.4 `src/config/loader.ts`

- `optionalBaseModules` 的 glob `'./base/{gods,relics,evolutionRecipes,waveRewards}.json'` → 去掉 `relics`
- `optionalBaseConfig` 的泛型键联合去掉 `'relics'`
- 顶层 `import progression from './base/progression.json'` → 换成 `rewardMeter` + `settlement` 两个 import
- `assembleBase()` 与 `buildConfig()` 里的 `validateProgressionConfig(...)` → `validateRewardMeterConfig(...)` + `validateSettlementConfig(...)`
- `structuredClone({...})` 的域清单同步

### P2.5 校验器

- 删 `src/config/progressionValidator.ts`
- 新增 `src/config/rewardMeterValidator.ts`：
  - `thresholds` 非空、全为正数、**允许非递增**（它是逐段差值不是累计值）
  - `rewards` 非空、id 唯一、`weight >= 0` 且总和 > 0
  - `textKey === 'rewards.' + id`
  - `action.kind` 在五种之内，各自参数范围合法
  - `lowHpWeightBoost.rewardId` 必须命中 `rewards[].id`
  - `afterSchedule` ∈ `'repeatLast' | 'stop'`
- 新增 `src/config/settlementValidator.ts`（把原 `progressionValidator` 里 settlement 那段搬过来）
- `src/config/godValidator.ts`：删 `RELIC_RARITIES`（:7）、函数签名的 `'relics'`（:42）、整个遗物交叉校验段（:286-330）
- `src/config/validateAll.ts`：`ValidationDomain` 删 `'relics'` / `'progression'`，加 `'rewardMeter'` / `'settlement'`；删 `:40` 的 `relics?` 文案类型、`:115-116` 的 id 唯一性块、`:171-196` 的 textKey/孤儿文案块；`:90` 换成新校验器；`:96` 的 check 名去掉 relics
- `src/config/pipeline.ts`：`WRITABLE_DOMAINS` 删 `relics` / `progression`，加 `rewardMeter` / `settlement`

### P2.6 调参面板

- `src/config/base/tuner.json:590` `progression.killXpMul` → `rewardMeter.pointMul`（labelKey 同步）
- `:600` `progression.relicChoices` → **删除**，另加一条 `rewardMeter.pointMul` 之外的第二个参数以保持 `progression` 组仍为 2 项（建议 `rewardMeter.thresholdMul`，在 `addRewardPoints` 里作为阈值整体倍率），或直接把 `tests/tunerV2.test.ts:19` 的 `progression: 2` 改成 `1`
- `TunerGroup` 的 `'progression'` **组 id 保持不变**（只是个 id），只改它的中文标签文案。改组 id 会连锁 `TUNER_GROUP_ORDER` + texts + 测试，不值得
- `src/ui/tunerSchema.ts:52 migratePresetValues()` 增加迁移：
  ```ts
  if (migrated['rewardMeter.pointMul'] === undefined && migrated['progression.killXpMul'] !== undefined) {
    migrated['rewardMeter.pointMul'] = migrated['progression.killXpMul'];
  }
  delete migrated['progression.killXpMul'];
  delete migrated['progression.relicChoices'];
  ```
  （`presets/` 下有 4 个 tuner preset 含旧路径）

---

## 阶段 P3：新奖励条系统（先建新的，暂不拆旧的）

### P3.1 状态（`src/core/types.ts`）

`GameState` 删：`xp` / `xpNeed` / `level` / `relicStacks` / `xpGainBonus`
`BuildState` 删：`godAffinity` / `relicHistory` / `scalingVersion` / `dropPity`（`affinity` 字段**保留**，见 P0.4 / P6.3）

新增：
```ts
export interface RewardExecutionResult {
  damageDealt?: number;
  enemiesKilled?: number;
  healingGranted?: number;
  shieldHitsGranted?: number;
  frozenCount?: number;
  wildcardGrants?: Array<{ star: number; count: number }>;
  surgeTag?: BuildTag;
  surgeDuration?: number;
}

export interface RewardReceipt {
  rewardId: string;
  activationIndex: number;
  result: RewardExecutionResult;
}

export interface RewardMeterState {
  points: number;
  thresholdIndex: number;
  threshold: number;
  currentReceipt: RewardReceipt | null;
  lastRewardId: string | null;
  activationCount: number;
  pointGainBonus: number;
  /** 重入护栏：> 0 时击杀不充能。见 P4.2。 */
  suppressDepth: number;
}
```

`GameState` 加 `rewardMeter: RewardMeterState;`

`RunDecision` 删 `{ kind: 'relic'; ... }`（`waveBaseReward` **保留**）。
`decisionQueueSystem.ts:23 validChoices()` 的 switch 同步删 `relic` 分支。

`GameEvent` 删 `levelUp` / `relicOffered` / `relicSelected`，加：
```ts
| { type: 'rewardPointsGained'; amount: number; total: number }
| { type: 'rewardTriggered'; rewardId: string; activationIndex: number; result: RewardExecutionResult }
| { type: 'rewardConfirmed'; rewardId: string }
```

`createInitialState.ts:131-142` 同步：删 5 个旧字段与 4 个 buildState 字段，加 `rewardMeter` 初值（`threshold = cfg.rewardMeter.thresholds[0]`）。

### P3.2 **不要**把奖励确认伪装成 `RunDecision`

`decisionQueueSystem` 的语义是「从多个合法候选中选一个」。自动抽奖的结果只有一个选项，它不是决策。
**不要**加 `{ kind: 'reward'; options: [唯一结果] }`。
正确做法：单独走 `state.rewardMeter.currentReceipt`，暂停条件变成
```ts
state.decisions.current !== null || state.rewardMeter.currentReceipt !== null
```
这样神池/进化仍走决策队列，自动奖励走奖励条，两个概念不混。

### P3.3 `src/core/systems/rewardMeterSystem.ts`

```ts
export function addRewardPoints(state, config, rng, amount): GameEvent[];
export function confirmRewardReceipt(state, config, rng): GameEvent[];
export function hasPendingReward(state): boolean;
```

`addRewardPoints` 事务顺序（**严格照此实现**）：

1. 若 `state.rewardMeter.suppressDepth > 0` → 直接 return `[]`
2. `points += amount * cfg.rewardMeter.pointMul * (1 + pointGainBonus)`
3. 若已有 `currentReceipt` → 只累加，return（**溢出积分保留，不产生第二个回执**）
4. 若 `points < threshold` → return
5. `points -= threshold`；`activationCount++`；推进 `thresholdIndex` 与 `threshold`（超出表尾按 `afterSchedule` 处理：`repeatLast` 重复最后一项 80）
6. `pickReward()` 抽取
7. **立即执行** `executeReward()`，全程包在 `suppressDepth` 护栏内
8. 写入 `currentReceipt`，发 `rewardTriggered`
9. **return** —— 即使 `points` 仍 ≥ 新 `threshold` 也**不再**继续循环

`confirmRewardReceipt`：清空 `currentReceipt` → 发 `rewardConfirmed` → **然后**才重新检查是否又满条（此时可以再触发一次，形成「确认 → 再确认」的链，但永远一次只有一个回执）。

### P3.4 `src/core/systems/rewardSelectionSystem.ts`

```ts
export function pickReward(state, config, rng): RewardDef;
```
- 基础权重来自配置
- `preventImmediateRepeat` 为 true 时排除 `lastRewardId`（若排除后候选为空则允许重复）
- `hp / maxHp < lowHpWeightBoost.hpRatioBelow` 时把指定奖励权重 × `weightMul`
- 全程只用注入的 `rng`，保证同 seed 可复现
- **首版不做**：品质分级、叠层上限、永久历史、掉落导流。这些是原遗物系统复杂度的来源，一律不要复活。

### P3.5 `src/core/systems/rewardExecutionSystem.ts`

```ts
export function executeReward(state, config, rng, reward): { events: GameEvent[]; result: RewardExecutionResult };
```

五种 action 的实现要点：

- **globalDamage**：遍历 `state.enemies` 快照（先 `[...state.enemies]`，因为 `dealDamage` 会 splice）。基准伤害 = 炮台总伤（同 `ctx.baseDamage` 口径）× `damageMul`。Boss（`spawnKind === 'waveBoss'` 或 `type === 'boss'`）单次伤害上限 = `enemy.maxHp * bossMaxHpRatioCap`。累计 `damageDealt`，用击杀前后 `state.kills` 差值算 `enemiesKilled`。补 `retaliationNova` vfx + 粒子。
- **globalControl**：遍历全场，**先过 `controlBudgetDenies(state, e)`**，通过者 `applyFreeze` + `applyVulnerable`。统计 `frozenCount`。
- **restoreAndShield**：`state.hp = Math.min(state.maxHp, state.hp + state.maxHp * healRatio)`，记录实际回复量（不是名义量）；护盾按 `shield` 原子的既有仲裁规则（容量取最大）加 `shieldHits`。
- **grantWildcards**：星级按 `starSchedule[Math.min(activationIndex, len-1)]`，调 `grantWildcards(state, grants)`。
- **buildSurge**：调 `calculateBuildProfile(state)` 取主方向 tag，按下表推 `RuntimeStatModifier`，`sourceId` 前缀固定为 `reward:buildSurge`，`remaining = duration`。

  | 主方向 | 写入的轴 |
  |---|---|
  | `projectile` | `effectDamageMul` + `quantityAdd`（整数轴按 `scaleNumber` 的 `integer` 规则自然生效） |
  | `control` | `controlPotencyMul` + `controlledDamageTakenMul` |
  | `domain` | `areaScaleMul` + `dotDamageMul` |
  | `defense` | `defenseDurabilityMul` + `retaliationMul` |
  | `utility` | 掉落效率轴；若无合适轴则退化为额外给 1 张万能卡 |

  （轴名以 `src/config/affixSinks.ts` 的 `AFFIX_SINKS` 实际键为准，不要凭空造轴。）

**执行器不得设 `consume: true`，不得设 `ctx.enemy`。** 见 P0.6。

### P3.6 `src/core/systems/buildProfileSystem.ts`

```ts
export function calculateBuildProfile(state: GameState): Record<BuildTag, number>;
export function dominantBuildTag(state: GameState): BuildTag;
```

**不要**用 `relic godAffinity` —— 那正是本次要删的东西。改为根据玩家**实际持有与投入**计算：

```
装备卡星级        × 3
+ 手牌卡星级      × 1
+ 本局该卡型合成次数 × 0.5      // 来自 normalDropDirector.typeStats
```
按每张卡的 `def.synergyTags` 把分数摊到 `projectile / control / domain / defense / utility` 五个桶。
并列时按固定顺序取第一个，保证确定性。全空时返回 `'projectile'`。

### P3.7 事件文案（`src/data/texts.json`）

- 删 `relics`（22 条）与 `levelup`
- `decisions` 删 `relic` 项
- `toast` 删 `perkApplied`
- `waveRewardStats.xpGainPct` 文案 `"经验取得"` → `"奖励积分取得"`
- 新增 `rewards` 段，5 条，每条 `{ name, desc }`：

  | id | 建议名 | desc 方向 |
  |---|---|---|
  | `heartbreakNova` | 心防震爆 | 对全场造成一次高额伤害 |
  | `absoluteStillness` | 绝对静止 | 全场冻结并短暂易伤 |
  | `clarityReflux` | 清醒回流 | 恢复心防并获得突破吸收 |
  | `wildHeart` | 万能心意 | 直接获得一张万能卡 |
  | `buildResonance` | 构筑共鸣 | 短时强化你当前的构筑方向 |

- 新增 `rewardReceipt` 段：标题、确认按钮文案、各类结果的格式串（`"造成 {damage} 伤害 · 消灭 {kills} 名敌人"` 等）

### P3.8 单元测试（**本阶段就要写完**，旧系统还在时新系统必须已可独立运转）

新增 `tests/rewardMeterSystem.test.ts`：
- 未满条不触发
- 恰好满条触发一次
- 超额积分正确保留在 `points` 上
- **一次给 100000 积分只产生 1 个回执**（对照旧行为的反向断言）
- 有回执时继续加分不产生第二个回执
- 确认后才检查下一次满条
- 阈值表耗尽后按 `repeatLast` 重复 80

新增 `tests/rewardSelection.test.ts`：
- 固定 seed 可复现
- 不连续抽中同一奖励
- 低血量时 `clarityReflux` 权重提升
- 无玩家选择步骤（`resolveCurrentDecision` 对回执无效）

新增 `tests/rewardExecution.test.ts`：
- 全场伤害命中所有敌人
- Boss 伤害遵守 `bossMaxHpRatioCap`
- **奖励击杀不产生奖励积分**（核心回归）
- 全场控制遵守 `controlBudgetDenies`
- 治疗不超过 `maxHp`
- 万能卡星级遵守 `starSchedule` 与上限
- `buildSurge` 选中正确主方向；到期后 `statModifiers` 完全清空；**不修改原始配置对象**；不形成永久堆叠

---

## 阶段 P4：接管击杀积分

### P4.1 两个入口切换

- `damageSystem.ts:30-31`：
  ```ts
  const points = enemy.xp * getModifiers(state).xpMul;   // xpMul 原子保留，语义改为"奖励积分倍率"
  events.push(...addRewardPoints(state, config, rng, points));
  ```
  （`cfg.progression.killXpMul` → `cfg.rewardMeter.pointMul`，已在 `addRewardPoints` 内部乘；`state.xpGainBonus` → `state.rewardMeter.pointGainBonus`，同样在内部乘。不要在调用点重复乘。）
- `dropSystem.ts:122`：`addXp(...)` → `addRewardPoints(state, config, rng, drop.star * cfg.rewardMeter.expiryConvertPointsPerStar)`；删掉模块内的 `EXPIRY_CONVERT_XP_PER_STAR` 常量改读配置。

### P4.2 防止奖励击杀无限充能（**必须**）

若「心防震爆」清屏，这些击杀又给奖励条充能，会形成
`满条 → 清屏 → 再满条 → 再清屏` 的死循环。

**实现方式**：在 `rewardMeterSystem` 导出一个重入护栏，**不要**去改 `dealDamage` / `killEnemy` 的签名（`dealDamage` 在 `registry.ts` 里有约 20 个调用点，穿参数代价过大）：

```ts
export function withRewardPointsSuppressed<T>(state: GameState, fn: () => T): T {
  state.rewardMeter.suppressDepth++;
  try { return fn(); } finally { state.rewardMeter.suppressDepth--; }
}
```

`executeReward()` 全程包在这个护栏里。`addRewardPoints` 第一步就检查 `suppressDepth`。

**首版约束（写进 `rewardExecutionSystem.ts` 顶部注释）**：五种奖励全部是**同步一次性结算**，没有 DOT、召唤物或延迟区域，因此同步护栏是完备的。
**将来**若新增持续型奖励，必须改为把来源标记挂到 attack / zone / summon 实体上，护栏不再够用。

### P4.3 删除 `progressionSystem` 的运行时入口

删 `addXp` / `levelUp` 的调用。此阶段结束后应满足：
- 不再产生任何遗物决策
- 一次巨量积分只产生一个当前回执
- `npm run test` 除了预期失败的旧测试外全绿

---

## 阶段 P5：删除遗物

### P5.1 删除文件

```
src/core/systems/progressionSystem.ts
src/config/base/relics.json
src/config/base/progression.json          # 已拆为 settlement.json + rewardMeter.json
src/config/progressionValidator.ts
src/ui/relicMeta.ts
src/design/relicView.ts                   # 43 行
src/editor/relicsEditor.ts                # 191 行
tests/progressionSystem.test.ts           # 由 P3.8 的新测试替代
```

### P5.2 逐文件修改清单

| 文件 | 改动 |
|---|---|
| `src/core/systems/buildModifierSystem.ts` | 删 `aggregateBuildScaling()` 的遗物循环（改为直接返回空 totals，或整体删除该函数并让 `currentTotals` 恒返回 `EMPTY_TOTALS`）；删 `controlledDamageTakenBonus()` 里的 `relic` 项。**保留**：`BUILD_SCALING_RULES`、`scaleEffects`、`cardAffixScaling`、`runtimeScalingFor`、`applyBuildScalingToBindings`、`applyBuildScalingToTier` |
| `src/core/systems/dropTypePolicy.ts` | 删 `calculateAffinityScore()`（:56-63）与全部调用点；删 `applyGodPity()`（:241-268）与 `selectBuildType` 里的包裹调用；`src/config/base/economy.json` 的 `normalDropTypePolicy.godAffinity` 块同步删除 |
| `src/core/settlement.ts` | 删 `RelicDef` import、`RunSummary.relics` 字段、rarity 统计循环（:49-53）与返回值里的 `relics` |
| `src/core/systems/decisionQueueSystem.ts` | `validChoices()` switch 删 `relic` |
| `src/core/updateGame.ts:19-20` | 暂停条件加 `|| state.rewardMeter.currentReceipt !== null` |
| `src/core/replay/record.ts` | `choiceFor()` 删 `relic`；`ReplaySummary` 的 `xp/level` → `rewardPoints/rewardActivations`，`relics: string[]` → `rewards: string[]`（按 activation 顺序记录 rewardId）；主循环在决策 guard 之后增加**自动确认奖励回执**的 guard（同样限 16 次） |
| `src/core/systems/waveRewardSystem.ts` | `applyRunBaseReward` 的 `case 'xpGainPct'`：`state.xpGainBonus += add` → `state.rewardMeter.pointGainBonus += add`。**其余一行不动** |
| `src/ui/modals.ts` | 删 `relicCopy` import、`decision.kind === 'relic'` 的整个分支（:110-137）、`showDecision` 里 options 计算的 `relic`、`showResult` 里的遗物统计行（:213-215） |
| `src/ui/eventText.ts` | 删 `relicDisplayName` import、`relicOffered`（:44）、`relicSelected`（:94）、`levelUp`（:121）三处 case；加 `rewardTriggered` 的 toast 文案 |
| `src/ui/upgradeFeedback.ts:140` | `const suppressCelebration = events.some(e => e.type === 'levelUp')` → 改判 `e.type === 'rewardTriggered'`（奖励弹窗期间不叠加升星庆祝） |
| `src/ui/renderHud.ts:12-15` | 见 P6.1 |
| `src/ui/domRefs.ts:23-26` | 见 P6.1 |
| `index.html:17,20` | 见 P6.1 |
| `src/design/app.ts` | 删 `RelicsConfig` import、`renderRelicView` import、`ContentDomain` 与 `CONTENT_DOMAINS` 的 `'relics'`、`data.relics` 字段、`:120` 传参 |
| `src/design/navTree.ts` | 删 `RelicDef` import、`describeRelic` import、`NavSelection` 的 `relic` 分支、`options.relics`、:99 的 tag 合并、:126-129 过滤、:142-170 两段渲染 |
| `src/design/describe.ts` | 删 `describeRelic` |
| `src/design/contentSave.ts` / `contextPanel.ts` / `crossViews/affixCoverage.ts` | 删各自的 relics 分支 |
| `src/design/styles.css` | 删遗物相关选择器 |
| `src/editor/app.ts` | 删 `RelicsConfig` / `renderRelicsEditor` import、`DOMAIN_LABELS.relics`、`FORM_DOMAINS` / `TREE_TOGGLE_DOMAINS` 的 `'relics'`、:161-167 分支、:274 条件 |
| `src/editor/contracts.ts:3` | 域清单删 `'relics'` |
| `src/editor/references.ts:39-40` | 删遗物 targetTags 收集 |
| `src/editor/labels.ts` | 删 `:178 relics`、`:182-183 progression` 整块、`:208` 的 `relics: '遗物文案'` |
| `src/editor/saveFlow.ts:14` | `SaveCandidate` 的 domain 联合删 `'relics'` |
| `src/editor/entityTextEditor.ts:5` | `EntityTextDomain` 删 `'relics'` |
| `src/editor/textsEditor.ts:11,23` | `ENTITY_SECTIONS` 删 `'relics'`，提示文案同步 |
| `src/editor/validationPanel.ts` | 删遗物域展示 |
| `src/editor/styles.css` | 删遗物相关选择器 |
| `scripts/configXlsx.ts` | `:73` 删 relics 域、`:75` waveRewards 保留、`:80` 域清单把 `progression` 换成 `rewardMeter`/`settlement`、`:83 ENTITY_TEXT_ROOTS` 删 `'relics'`、`:1055-1056` 域清单同步、`:1101` / `:1112` 的 relics 处理删除 |

### P5.3 golden summary 与 fixture

`tests/golden/*.summary.json` 五份**不要手改**，走 P7 的重录流程。

---

## 阶段 P6：UI 与文案

### P6.1 HUD

`index.html:17`
```html
<span>Lv.<span id="levelText">1</span> · <span id="xpText">0</span>/<span id="xpNeed">8</span></span>
```
→
```html
<span id="rewardMeterLabel">心防共鸣 <span id="rewardPointsText">0</span>/<span id="rewardThresholdText">10</span></span>
```

`index.html:20` `<div class="bar xp"><i id="xpBar" ...>` → `<div class="bar reward"><i id="rewardBar" ...>`（css class 同步改名）。

`domRefs.ts:23-26`：`xpText/xpNeed/xpBar/levelText` → `rewardPointsText/rewardThresholdText/rewardBar`（**删掉等级引用，不做替代**）。

`renderHud.ts:12-15`：
```ts
const meter = state.rewardMeter;
refs.rewardPointsText.textContent = String(Math.floor(meter.points));
refs.rewardThresholdText.textContent = String(meter.threshold);
refs.rewardBar.style.width = `${Math.min(100, Math.max(0, (meter.points / meter.threshold) * 100))}%`;
```
**注意**：旧代码是 `state.xp / state.xpNeed`（累计÷累计），条宽随全局进度走。新代码必须是**分段进度**，否则第一次满条后视觉上不会真正从零重新蓄力。宽度必须 clamp 到 0–100%。

代码内部一律用中性的 `rewardMeter` 命名，世界观文案（「心防共鸣」）只出现在 `texts.json`，不得反向侵入规则层。

### P6.2 奖励结果确认弹窗（`src/ui/rewardReceiptModal.ts`）

照 `modals.ts` 的既有做法**动态构建**（`index.html` 里本来就没有 `decisionModal` 的 markup，全是 JS 创建的）。

内容：
- 标题 = 奖励名（`texts.rewards[id].name`）
- 副标题 = 奖励描述
- 结果区 = 由 `RewardReceipt.result` 渲染的**实际结算数据**（造成了多少伤害、消灭多少、恢复多少、拿到什么万能卡、强化了哪个方向）
- **一个**按钮：「确认」

新增 `src/ui/rewardMeta.ts`，职责同原 `relicMeta.ts`：从 `texts.json` 解析 `rewards.<id>.name/desc`，缺文案时回退到 id 不留空白。

`game.ts` 接线：
- `:117-118` 附近增加回执同步：`if (state.rewardMeter.currentReceipt) receiptModal.show(...) else receiptModal.hide()`
- `:134` 附近的 hooks 增加 `onRewardConfirm() { dispatch(confirmRewardReceipt(state, config, rng)); }`
- `:282` restart 路径增加 `receiptModal.hide()`
- `:315` 的指针输入闸门增加 `|| state.rewardMeter.currentReceipt`
- `recipeEvolutionSystem` 的 `reason: 'decision'` 拒绝条件同步覆盖回执

### P6.3 `buildState.affinity` 死字段 —— **本次先不接线**

`calculateBuildProfile()` 保持**纯函数**，只被 `rewardExecutionSystem` 调用。
**不要**在本 PR 里把它写回 `state.buildState.affinity`。

理由：那个字段目前恒为全 0，`settlement.topLane` 恒 null、`bountySystem` 的 lane 仲裁恒退化。一旦开始写入，bounty 的奖励方向和结算显示会同时改变行为 —— 这是**独立的既有 bug 修复**，混进本 PR 会让 diff 无法审查、黄金回放漂移来源无法归因。

在 `settlement.ts:30` 和 `bountySystem.ts:110` 各留一行 TODO 注释指向后续任务，PR 描述里单独列出这个发现。

---

## 阶段 P7：验证、回放与清理

### P7.1 命令顺序

```bash
npm run validate
npm run test
npm run build
npm run replay:record
```

### P7.2 黄金回放重录纪律

回放**必然**漂移（状态结构、事件类型、RNG 消耗顺序全变了）。但**必须先人工确认差异全部来自预期的新奖励系统**再提交新的 summary。

逐份检查 `git diff tests/golden/*.summary.json`，确认：
- `counters` 里 `xp`/`level` 已换成 `rewardPoints`/`rewardActivations`
- `relics[]` 已换成 `rewards[]`，且长度落在 5–8（首版刻意保持原触发节奏）
- `kills` / `cumulativeDamageDealt` 的变化能被「全屏大招造成额外伤害与击杀」解释
- `cards` / `equipment` / `wildcards` 的结构没有意外变化

任何**无法用新系统解释**的漂移都要先查清楚再重录。

### P7.3 静态验收

```bash
rg "relicOffered|relicSelected|levelUp|xpNeed|relicStacks|relicHistory|godAffinity|dropPity|scalingVersion|cfg\.relics|cfg\.progression|state\.xp\b|state\.level\b|xpGainBonus"
```
应当**零命中**（`scripts/computeExperienceMetrics.ts` 与 `tests/experienceMetrics.test.ts` 里的 "Experience" 是体验指标，不在此列；`Enemy.xp` / `EnemyDef.xp` / `enemies.json` 的 `xp` 字段本次**刻意保留**，见下）。

### P7.4 本次**不做**的命名迁移（写进 PR 描述作为已知遗留）

以下保留 `xp` 命名，留待后续单独一次纯改名 PR：
- `Enemy.xp` / `EnemyDef.xp` / `src/config/base/enemies.json` 的 `xp` 字段
- `tuner.json` 的 `enemies.types.*.xp` 四条参数路径与文案
- `xpMul` 效果原子（`defs.ts:94`、`interpreter.ts` 的 `MODIFIER_ATOMS_HANDLED` 与 `FUSION_RULES`、`atomContract` 契约、相关卡牌配置与测试）

理由：这三处一改会同时触发**配置迁移 + 黄金回放重录 + xlsx roundtrip 测试**三处连锁，与本次的行为变更混在一起会让回放漂移无法归因。

---

## 最终验收标准

全部满足才算完成：

1. `main` 之外存在完整的 `archive/pre-reward-meter-2026-07-30` 归档分支，且指向改动前的原始提交
2. 运行代码不再加载 `relics.json`；该文件已从仓库删除
3. `RunDecision` 中不存在 `relic`（`waveBaseReward` 仍在）
4. `GameState` 中不存在 `xp` / `xpNeed` / `level` / `relicStacks` / `xpGainBonus`
5. HUD 不再显示等级；奖励条显示**分段**进度且宽度 clamp 在 0–100%
6. 奖励条满后**自动**抽取，不要求玩家选择
7. 奖励**自动执行完毕后**才弹确认框，确认框显示**实际结算结果**，玩家只点一次
8. 一帧内获得巨量积分只产生**一个**待确认回执
9. 奖励产生的击杀**不**反向充能
10. 玩家可见奖励种类为 5 种
11. 「构筑共鸣」的方向依据当前卡牌构筑计算，不依赖任何遗物历史
12. 卡牌合成、升星、分支进化、配方进化**全部保留且可用**
13. 波末自动基础成长与五选一**保留且可用**；`xpGainPct` 现在正确加成奖励积分获取
14. 丰收落穗（`expiryConvert`）仍然生效，只是折算为奖励积分
15. `npm run validate` / `npm run test` / `npm run build` 全绿
16. 黄金回放已重录，且每一处漂移都在 PR 描述里有解释

---

## 一句话总结

不要把这次做成「遗物系统的自动选择版」。目标定位是：

> 一个独立的、节奏清晰的、每局触发约 5–8 次的**自动大招抽奖系统**。

原遗物里真正有价值的只有「按构筑方向给强化」这一个思想，把它折叠进单一的「构筑共鸣」即可。品质分级、三选一、永久堆叠、神池导流、掉落保底、22 条遗物文案，全部退出主分支。
