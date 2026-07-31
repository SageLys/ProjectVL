# Codex 任务：掉落导演相关配置的遗留清理（开关拆分 / 派生指标校正 / 编辑器可读性）

> 本文档为完整实施指令。所有文件路径、行号、字段名均已对照当前工作区实际代码核实（核实日期 2026-07-28）。
> 按「七、实施顺序」的 4 个阶段依次完成，**每阶段结束都要保持 `npx vitest run` 与 `npm run build`（含 `tsc --noEmit`）通过**。
> 这是一次**清理任务**，不是玩法改动。除非本文档明确写出，任何一局游戏的实际数值表现都不许改变。

---

## 一、背景

`economy.ordinaryDropRate`（按分钟锚定的掉落节奏）与 `economy.normalDropTypePolicy`（discovery/build/pivot 三角色）两套系统都在正常运行，逻辑本身没有 bug。问题全部出在**配置层与编辑器层**：开关语义被复用、派生指标停留在旧模型、失效字段仍以可调姿态暴露、部分调参入口被硬编码。这些不影响运行，但会持续误导在编辑器里做数值决策的人。

本任务处理 4 项，优先级 P0 → P1：

| # | 问题 | 优先级 |
|---|---|---|
| A | `ordinaryDropRate.enabled` 一个开关控制两套无关系统 | P0 |
| B | 派生指标 `expectedDrops` / `dropsPerMinute` 仍按已失效的 `dropChance` 模型计算 | P0 |
| C | 失效字段仍可调 + `ordinaryDropRate` 中文标签写错 + 嵌套字段无标签 | P1 |
| D | `bootstrapDropsRemaining = 9` 硬编码，且与 `bootstrapMinDiscovery` 语义重叠 | P1 |

---

## 二、硬性不变量（实现后必须逐条自查）

以下行为**一个都不许变**：

1. 默认配置（`src/config/base/*.json` 原样）下，同一 seed 的一局游戏行为完全一致：掉落时机、掉落卡型序列、刷怪配额、同屏曲线全部不变。
2. `tickOrdinaryDropBudget` 的额度累积公式、门槛条件（`mode==='playing'` / `!paused` / `wavePhase==='regular'` / 非 validation 阶段）与 `carryCap` 裁剪时机不变。
3. `rollDropOnKill` 的两条分支语义不变：新路径按额度池兑现、旧路径按 `totalDropChance` 掷骰。只有**进入哪条分支的判断依据**允许按任务 A 调整。
4. `refillNormalDropRoleBag` / `selectDiscoveryType` / `selectBuildType` / `selectPivotType` / `calculateBuildMaturity` / `calculateCommitmentScore` 的全部算式**一个字都不许改**。承诺分里的 `2 ** (card.star - 1)` **保持硬编码，本次不配置化**（见「六、明确不做的事」）。
5. `resolveWavePlan` / `stageForWave` / `stageProgress` / `stageCurveValue` 的算式不变。
6. RNG 纪律：只使用注入的 `rng`，禁止 `Math.random`；本次改动**不允许**改变默认配置下的 rng 消耗序列。任务 D 若引入新配置项，其默认值必须让消耗序列与现状完全一致。
7. `presets/*.tuner.json` 与 `src/config/variants/dev-short.json` 均未引用 `ordinaryDropRate`（已核实），因此不需要预设迁移；但新增配置字段必须走 loader 兼容层给默认值，保证旧预设仍可加载。

---

## 三、任务 A（P0）：拆分 `ordinaryDropRate.enabled` 的双重身份

### A.1 现状（已核实）

`economy.ordinaryDropRate.enabled` 目前被两处读取，控制两套**互不相关**的系统：

| 位置 | 读取用途 |
|---|---|
| `src/core/systems/dropSystem.ts` L66-73、L88 | 掉落节奏：true = 按分钟额度池；false = 旧的 `totalDropChance` 逐杀掷骰 |
| `src/core/runStage.ts` L61 | **三阶段波次导演**：true = `resolveWavePlan(stagePlan)`；false = 退回 `waves.budget` 旧线性预算 |

`runStage.ts` L61 的写法：

```ts
export function resolveActiveWavePlan(game: GameConfig, wave: number): ResolvedWavePlan {
  if (game.economy.ordinaryDropRate.enabled) return resolveWavePlan(wave, game.waves.totalWaves, game.waves.stagePlan);
  const legacy = game.waves.budget;
  ...
}
```

后果：想单独回滚掉落节奏，会连带把整个波次导演（stagePlan 的配额曲线 / 同屏曲线 / 验证期遭遇）一起关掉；反之亦然。现有 8 处测试里有 7 处其实是想关掉**波次导演**，却只能借掉落开关达成，测试意图被掩盖。

### A.2 目标

新增 `waves.stagePlan.enabled` 作为**波次导演的独立回滚开关**；`economy.ordinaryDropRate.enabled` 从此**只管掉落节奏**。两者默认都是 `true`，默认行为与现状逐帧一致。

### A.3 实施步骤

1. **`src/config/types.ts`**：在 `StagePlanConfig`（L41-47）顶部新增 `enabled: boolean;`。`OrdinaryDropRateConfig`（L49-56）的 `enabled` 保留，但补一行注释说明它现在**只**控制掉落节奏。

2. **`src/config/base/waves.json`**：在 `stagePlan` 对象里新增 `"enabled": true`，放在 `selectionWaves` 之前。

3. **`src/config/loader.ts`**：在深合并之后、校验之前，加一条兼容层归一化（参照现有 `normalizeValidationRewards` 的位置与风格）：若 `config.waves.stagePlan.enabled === undefined` 则置为 `true`。加注释说明这是为「新字段落地前保存的旧 variant / 旧 preset」兜底。

4. **`src/config/stagePlanValidator.ts`**：在 `validateStagePlanConfig` 里加一条 `typeof plan.enabled === 'boolean'` 的校验，失败信息沿用现有 `fail()` 的 `[stage-plan-config]` 前缀格式。

5. **`src/core/runStage.ts` L61**：把判断改为读 `game.waves.stagePlan.enabled`。**不要**再引用 `game.economy`——改完后 `runStage.ts` 应当完全不依赖 economy 域，请顺手检查并清理相关 import。

6. **`src/core/systems/dropSystem.ts`**：L66-73 与 L88 的 `rate.enabled` 判断保持不动（它现在语义正确了）。

7. **`src/config/base/tuner.json`**：`economy.ordinaryDropRate.*` 的 4 个既有条目（L899-938）不动。**不需要**把两个 `enabled` 暴露进调参面板（面板只放 number 型连续量，布尔回滚开关留在编辑器结构树里即可）。

8. **测试迁移（关键，逐个按下表处理，不要一刀切）**：

   | 位置 | 当前写法 | 改成 | 判断依据 |
   |---|---|---|---|
   | `tests/dropSystem.test.ts:154` | `cfg.economy.ordinaryDropRate.enabled = false` | **保持不变** | 用例名 `preserves normal chance gating...`，测的是旧概率掉落门控 |
   | `tests/waveBudgetSystem.test.ts:17` | 同上 | `cfg.waves.stagePlan.enabled = false` | beforeEach 里配的全是 `waves.budget.*` |
   | `tests/spawnModeLifecycle.test.ts:12` | 同上 | `cfg.waves.stagePlan.enabled = false` | 测 interval/budget 刷怪模式切换 |
   | `tests/spawnModeLifecycle.test.ts:33` | 同上 | `cfg.waves.stagePlan.enabled = false` | 同上 |
   | `tests/validationStage.test.ts:62` | 同上 | `cfg.waves.stagePlan.enabled = false` | 用例名直接写着 `restores the legacy linear Budget ... when the rollback switch is off` |
   | `tests/tunerV2.test.ts:82` | 同上 | `cfg.waves.stagePlan.enabled = false` | 测 TTK / 同屏派生指标 |
   | `tests/tunerV2.test.ts:114` | 同上 | `cfg.waves.stagePlan.enabled = false` | 用例名 `projects every Budget control...` |
   | `tests/budgetDerivedMetrics.test.ts:9` | `game.economy.ordinaryDropRate.enabled = false` | `game.waves.stagePlan.enabled = false` | 构造 legacy budget 派生指标 |

   `tests/validationStage.test.ts:62` 所在用例的名字里有 "rollback switch"，改完后请把用例名改得更准确（例如把 "rollback switch" 换成 "stage-plan switch"）。

9. **新增测试**：在 `tests/` 下补一个用例，断言两个开关互相独立——
   - `stagePlan.enabled = false` + `ordinaryDropRate.enabled = true` 时：`resolveActiveWavePlan` 返回 legacy budget 配额，而 `tickOrdinaryDropBudget` 仍在累积 `state.ordinaryDrop.credit`；
   - `stagePlan.enabled = true` + `ordinaryDropRate.enabled = false` 时：`resolveActiveWavePlan` 走 stagePlan 曲线，而 `rollDropOnKill` 走 `totalDropChance` 掷骰路径、`state.ordinaryDrop.credit` 保持 0。

---

## 四、任务 B（P0）：修正派生指标的掉落预估

### B.1 现状（已核实）

`src/ui/derivedMetrics.ts` L149：

```ts
const expectedDrops = totalEnemies * runtime.dropChance;
```

L161 据此算出 `dropsPerMinute`，最终在 `src/ui/tunerPanel.ts` L191 显示为「**每分钟掉落期望（普通·波1）**」。

两个错误叠在一起：

1. **模型过时**。`ordinaryDropRate.enabled = true` 时，`runtime.dropChance` 在实际掉落里根本不参与计算（只在 `dropSystem.ts` L67-73 的回退分支用）。面板上这个数字与真实掉落率无关，拖动 `economy.defaults.dropChance` 滑杆时它还会跟着动，形成"参数有效"的假象。
2. **文案错误**。它算的是全局（总掉落 ÷ 全局理论局长），不是"波 1"。

同一面板里 `metrics.waves[].ordinaryDropsTargetPerMinute`（L154-156）才是真值，但目前没有渲染出来。

### B.2 目标

`deriveMetrics` 按**当前生效的模型**计算掉落预估，并让面板文案与实际含义一致。

### B.3 实施步骤

1. **`src/ui/derivedMetrics.ts`**：把 `expectedDrops` / `dropsPerMinute` 改为分支计算。

   - 当 `game.economy.ordinaryDropRate.enabled === false`：保持现有公式（`totalEnemies * runtime.dropChance`），行为不变。
   - 当为 `true`：按**时间模型**积分。对每一波 `i`，取该波的 `waveDurations[i]` 与该波 stage：
     - `validation` 阶段：贡献 0（`dropSystem.ts` L90 明确 return）；
     - `selection` 阶段：速率 = `ordinaryDropRate.selectionPerMinute`；
     - `build` 阶段：速率需要体现 `buildTransitionSeconds` 的线性爬坡。用**构筑期累计有效秒数**（跨波累加，与 `state.ordinaryDrop.buildStageSeconds` 的语义一致）对 `selectionPerMinute → buildPerMinute` 做线性插值后按时长积分。
     - 波间歇不计入（`wavePhase !== 'regular'` 时不累积额度）。
   - `expectedDrops` = 各波贡献之和；`dropsPerMinute` 沿用 `expectedDrops / totalDuration * 60`。
   - **不要**把 `carryCap` 和 `dropRateMul` 建模进去：前者只影响瞬时抖动不影响长期总量，后者是局内动态词条、静态预估无从得知。在函数上方加注释写明这两条简化假设。

2. **`src/ui/derivedMetrics.ts`**：`ordinaryDropsTargetPerMinute`（L154-156）的计算保持不变。

3. **`src/ui/tunerPanel.ts` L191**：把文案 `每分钟掉落期望（普通·波1）` 改成准确的说法（例如 `每分钟普通掉落期望（全局均值）`），并在其后**新增一个指标格**显示前 3 波的 `metrics.waves[i].ordinaryDropsTargetPerMinute`（格式参照相邻的 `waveDurations.slice(0, 3)` 那一行），标注为「阶段目标速率（前 3 波）」，让"目标值"与"全局均值"能被并排对照。

4. **测试**：
   - `tests/budgetDerivedMetrics.test.ts:34` 现有断言 `expectedDrops > 0` 在 legacy 分支下仍应通过（该用例已按任务 A 改用 `stagePlan.enabled = false`，同时它没关 `ordinaryDropRate.enabled`，请确认这两件事组合后走的是哪条分支，必要时在该用例里显式把 `ordinaryDropRate.enabled` 设为 `false` 以锁定 legacy 模型）。
   - 新增用例：默认配置（新模型）下，`expectedDrops` 应当**不随 `economy.defaults.dropChance` 变化**，且随 `selectionPerMinute` / `buildPerMinute` 单调递增；把 `stagePlan.validationWaves` 调大应当让 `expectedDrops` 下降。

---

## 五、任务 C（P1）：编辑器可读性与失效字段标注

### C.1 改正误导标签

`src/editor/labels.ts` L184：

```ts
defaults: '默认数值', ordinaryDropRate: '普通掉落概率', normalDropTypePolicy: '普通掉落类型策略',
```

`ordinaryDropRate` **不是概率**，它是"每分钟目标掉落数"。改成 `'普通掉落节奏（每分钟）'`。

### C.2 补齐嵌套字段中文标签

`labels.ts` 的 `COMMON_FIELD_LABELS`（L~211-235）是嵌套字段的兜底词典。`ordinaryDropRate` 与 `normalDropTypePolicy` 的子字段绝大多数**不在表里**，编辑器结构树目前直接回显英文 key。请按下表补齐（已存在的项如 `enabled` / `build` / `pivot` / `power` / `count` 不要重复添加，冲突时保留原值）：

| key | 中文标签 |
|---|---|
| `selectionPerMinute` | 选择期每分钟掉落 |
| `buildPerMinute` | 构筑期每分钟掉落 |
| `buildTransitionSeconds` | 构筑期速率过渡秒数 |
| `carryCap` | 掉落额度积压上限 |
| `modifiersAffectTarget` | 词条加成是否影响目标速率 |
| `roleBagSize` | 角色袋容量 |
| `earlyMix` | 局初角色配比 |
| `lateMix` | 局末角色配比 |
| `discovery` | 探索 |
| `bootstrapMinDiscovery` | 冷启动探索保底 |
| `godAffinity` | 神祇亲和 |
| `scorePerStack` | 每层加分 |
| `scoreCap` | 加分封顶 |
| `maturity` | 构筑成熟度 |
| `fullMergeOps` | 满值合成次数 |
| `fullHighestStar` | 满值最高星 |
| `fullEquippedTypes` | 满值装备类型数 |
| `mergeWeight` | 合成权重 |
| `starWeight` | 星级权重 |
| `equipWeight` | 装备权重 |
| `topK` | 候选前 N 名 |
| `scorePower` | 承诺分指数 |
| `mergeReadyMultiplier` | 可合成加权 |
| `equippedBaseBonus` | 装备基础加分 |
| `equippedStarBonus` | 装备每星加分 |
| `historicalMergeWeight` | 历史合成权重 |
| `historicalMergeCap` | 历史合成封顶 |
| `maxWeightRatio` | 权重比上限 |
| `excludeTopK` | 排除前 N 名 |
| `candidateFraction` | 候选比例 |
| `maxSameTypeStreak` | 同型连发上限 |

### C.3 为域字段补一句话解释

`domainFieldInfo`（`labels.ts` L297-301）目前只返回 `label`，从不返回 `help`，而 `HumanLabel` 已经预留了 `help` 字段。请做**最小扩展**：

1. 新增 `const COMMON_FIELD_HELP: Record<string, string>`，风格对齐既有的 `ATOM_PARAM_HELP`。
2. `domainFieldInfo` 命中 label 后，用 `COMMON_FIELD_HELP[tailSegment(field)]` 附上 help（沿用现有 `withHelp` 辅助函数）。
3. 至少为下列**语义不能望文生义**的字段写解释：

   - `carryCap`：`额度池上限，防止长时间不杀敌后攒额度、再一口气爆出大量掉落`
   - `modifiersAffectTarget`：`关闭后，所有提升掉落率的遗物/词条对普通掉落完全失效`
   - `buildTransitionSeconds`：`进入构筑期后速率线性爬坡到位所需的有效战斗秒数，跨波累加`
   - `bootstrapMinDiscovery`：`只要活跃池里还有从未作为普通掉落出现过的卡，就把探索名额抬到这个下限`
   - `maxWeightRatio`：`最高权重不得超过最低权重的这个倍数，防止单一卡型垄断掉落`
   - `mergeReadyMultiplier`：`手上已有该型 1★（再来一张即可合成）时的权重倍率`
   - `scorePower`：`权重 =（承诺分 + 0.5）的本次方；大于 1 更偏向高分卡，小于 1 更平均`
   - `excludeTopK`：`转向角色会先排除承诺分最高的这几张，它们已是主力`
   - `candidateFraction`：`排除主力后，按承诺分从低到高取这个比例作为转向候选`

4. `tests/editorLabels.test.ts` 会守住覆盖度，改完确保它通过；若它断言了"每个域顶层字段必须齐全"之类的规则，新增项不要破坏。

### C.4 标注已失效字段

`economy.defaults.dropChance` 与 `economy.drops.chanceCap` 在 `ordinaryDropRate.enabled = true` 时**完全不参与实际掉落**，但仍作为可拖动滑杆暴露在调参面板（`tuner.json` L570-578 group `drops`、L670-678 group `p2`）。

**不要删除也不要改数值**（回退路径还需要它们）。做法：在 `src/data/texts.json` 的 `tuner.params` 里，把这两项的中文标签加上失效提示后缀，例如：

- `economy.defaults.dropChance` → `基础掉落概率（仅回退模式生效）`
- `economy.drops.chanceCap` → `掉落概率封顶（仅回退模式生效）`

（请先读出这两个 key 的现有值再改，保持其余文案风格一致。）同时在 `labels.ts` 的 `COMMON_FIELD_HELP` 里给 `dropChance` / `chanceCap` 写上 `仅在 ordinaryDropRate.enabled=false 的回退模式下生效`。

---

## 六、任务 D（P1）：`bootstrapDropsRemaining` 配置化

### D.1 现状（已核实）

`src/core/systems/godPoolSystem.ts` L168：

```ts
state.godPool.bootstrapQueue = [...state.godPool.rosterByGod[choice]];
state.godPool.bootstrapDropsRemaining = 9;
```

这个 `9` 决定"选副神后，前 9 次普通掉落直接按预排队列强制发牌"。它在 `dropTypePolicy.ts` L289-301 被消费，路径**完全绕过角色袋**，也绕过 `bootstrapMinDiscovery`。

问题在于：`bootstrapMinDiscovery`（配置里是 6）与这个硬编码 9 语义重叠，都在管"开局先见全"，但一个可调、一个不可调，且不可调的那个优先级更高。调 `bootstrapMinDiscovery` 时前 9 次掉落根本感觉不到变化。

### D.2 实施步骤

1. **`src/config/types.ts`**：在 `NormalDropTypePolicyConfig`（L~400-420，含 `bootstrapMinDiscovery` 的那个接口）里新增 `bootstrapForcedDrops: number;`，紧邻 `bootstrapMinDiscovery`。
2. **`src/config/base/economy.json`**：在 `normalDropTypePolicy` 里 `bootstrapMinDiscovery` 之后新增 `"bootstrapForcedDrops": 9`。**默认值必须是 9**，以满足不变量 6。
3. **`src/config/loader.ts`**：兼容层补默认值 9（与任务 A 步骤 3 放在一起）。
4. **`src/core/systems/godPoolSystem.ts` L168**：改为读 `cfg.economy.normalDropTypePolicy.bootstrapForcedDrops`。注意该文件当前是否已 import `cfg`，没有则补。
5. **`src/config/base/tuner.json`**：新增一条调参项，`path` 为 `economy.normalDropTypePolicy.bootstrapForcedDrops`，`type: "number"`，`group: "drops"`，`min: 0`，`max: 20`，`step: 1`，`applyPolicy: "waveDeferred"`（局内改它没意义，必须等下一波/下一局）。同步在 `src/data/texts.json` 的 `tuner.params` 里加中文标签：`普通掉落 · 开局强制发牌次数`。
6. **`labels.ts`** 的 `COMMON_FIELD_LABELS` 加 `bootstrapForcedDrops: '开局强制发牌次数'`，`COMMON_FIELD_HELP` 加 `选副神后前 N 次普通掉落按预排队列强制发放，完全绕过角色袋与探索保底`。
7. **测试**：新增用例断言把 `bootstrapForcedDrops` 设为 `0` 时，选副神后的第一次普通掉落就走角色袋（可通过 `state.normalDropDirector.roleBag` 被填充、`ordinaryDropCount` 正常自增来断言）；设为默认 9 时行为与现状一致。

---

## 七、实施顺序

1. **阶段 1 — 任务 A**（开关拆分 + 8 处测试迁移 + 独立性新测试）。跑 `npx vitest run` 全绿、`npm run build` 通过后再进下一阶段。
2. **阶段 2 — 任务 B**（派生指标模型 + 面板文案 + 新测试）。
3. **阶段 3 — 任务 C**（编辑器标签 / help / 失效标注）。纯文案与词典改动，不碰运行逻辑。
4. **阶段 4 — 任务 D**（`bootstrapForcedDrops` 配置化）。

---

## 八、明确不做的事（不要顺手改）

1. **不要**把承诺分里的 `2 ** (card.star - 1)`（`dropCommitment.ts` L42）配置化。它与 `equippedBaseBonus` / `historicalMergeWeight` 等系数是同一套已调平衡的量纲，暴露出来会诱发无依据的乱调；目前也没有调它的需求。
2. **不要**删除 `waves.budget` 旧线性预算路径或 `dropSystem.ts` 的 `totalDropChance` 回退分支。任务 A 的目的正是让这两条回退路径**可以被单独启用**。
3. **不要**改动 `dropPity`（`progressionSystem.ts` L141 设置、`dropTypePolicy.ts` L217-243 消费）能突破 `topK` 与 `maxSameTypeStreak` 的行为。代码里已有中文注释说明这是有意为之。
4. **不要**改任何角色袋 / 成熟度 / 承诺分 / pivot 的算式与默认数值。
5. **不要**新增 Monte Carlo 仿真脚本。

---

## 九、验收清单

- [ ] `npx vitest run` 全绿；`npm run build`（含 `tsc --noEmit`）通过。
- [ ] 默认配置下跑一局无头回归（`tests/headlessRun.test.ts` 或等价冒烟），确认同 seed 行为与改动前**逐帧一致**。
- [ ] `waves.stagePlan.enabled = false` 且 `ordinaryDropRate.enabled = true`：波次走 legacy budget，掉落仍按分钟额度池。
- [ ] `waves.stagePlan.enabled = true` 且 `ordinaryDropRate.enabled = false`：波次走 stagePlan 曲线，掉落回到概率掷骰。
- [ ] 调参面板拖动 `economy.defaults.dropChance` 时，`每分钟普通掉落期望` **不再变化**（新模型下）；拖动 `selectionPerMinute` / `buildPerMinute` 时它随之变化。
- [ ] 调参面板能同时看到「全局均值」与「阶段目标速率（前 3 波）」两个掉落指标。
- [ ] 编辑器结构树里 `economy.ordinaryDropRate` 与 `economy.normalDropTypePolicy` 展开后**没有残留英文 key**，且 §C.3 列出的字段都能看到一句话解释。
- [ ] `economy.normalDropTypePolicy.bootstrapForcedDrops` 出现在调参面板 `drops` 分组，默认 9。
- [ ] 交付时附一段说明：拆分后两个开关各自的职责边界、派生指标新模型的两条简化假设（不建模 `carryCap` 与 `dropRateMul`）。
