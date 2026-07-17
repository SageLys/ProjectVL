# Codex 任务 A2：普通掉落与 Bounty 奖励读取流派倾向

> 「构筑闭环」四连任务第二步。**前置：A1（流派标签与数据驱动 Perk）已合并**——本文假定 `CardDef.synergyTags`、`state.buildState.affinity`、`perkApplied` 事件的 `lane` 字段已存在；开工前先在代码中确认。
> 文件行号基于 A1 开工前的 `main`，A1 合并后可能偏移，以符号名为准。
> 每阶段结束保持 `npm test` 与 `npm run build` 通过。

---

## 一、本任务目标

玩家在升级三选一中选择流派后，后续卡牌供给立即、可感知地偏向该流派：

1. 普通掉落导演的 **build 主构筑位**在投入分之上叠加「流派倾向分」；discovery / pivot 位**不受污染**。
2. 选择流派 Perk 后：清空掉落角色袋与 Bounty 奖励袋（新倾向立即生效），并保证接下来 2 次 build 位掉落中至少 1 次命中所选流派（pity 保底）。
3. Bounty 报价的奖励卡型从均匀洗牌袋改为**流派加权分布**：约 70% 主流派 / 15% 次要流派或桥接 / 15% 探索。
4. 相关参数进配置与调参面板；遥测记录掉落与 Bounty 的流派匹配情况。

---

## 二、硬性不变量（实现后逐条自查）

1. 普通敌人总掉落率、掉落星级、掉落时限、Boss 必掉分支、丰收 extraDrop：全部不动（同「普通掉落导演」任务的不变量清单）。
2. 掉落导演框架不动：三角色袋结构、成熟度 M、`refillNormalDropRoleBag` 的配比与排布（`src/core/systems/dropTypePolicy.ts` L105-156）、`maxSameTypeStreak` 连发保护、`recordCardDropShown` 统计。
3. **discovery 与 pivot 的选卡逻辑完全不读 affinity**：`selectDiscoveryType`（L158-173）不动；`selectPivotType`（L214-234）继续用纯投入分排序。
4. 现有 build 位保护机制保留：`topK`、`scorePower`、`maxWeightRatio` 封顶、`mergeReadyMultiplier`、无投入时的回退链（L181-212）。
5. 前 20 次普通掉落覆盖全部 11 种卡的既有测试（`tests/dropTypePolicy.test.ts`）必须继续通过。
6. Bounty 报价「生成即冻结奖励」不变：`createOffer`（`src/core/systems/bountySystem.ts` L82-104）确定 `rewardCardType` 后，接受/结算路径（L265-304、L198-243）不得改写。之后玩家再选升级不影响已展示的报价。
7. **Bounty 万能卡奖励保持现状**（每次完成 1 张，`bounty.json` reward.wildcardCount=1）——这是已拍板的决策，不要顺手删。
8. Bounty 的 Offer 触发概率、敌群构成、失败降级逻辑全部不动；只改奖励**卡型的选择**。
9. RNG 纪律同前；rng 消耗序列变化属预期。

---

## 三、现状（已核实）

| 位置 | 内容 | 处置 |
|---|---|---|
| `dropTypePolicy.ts` L74-88 `calculateCommitmentScore` | 纯投入分（持有/星级/合成/装备） | 保留原样，另加 affinity 分叠加层 |
| `dropTypePolicy.ts` L175-179 `buildCandidates` | 全卡池按投入分降序 | build 位改用「投入分+倾向分」；pivot 仍用纯投入分（需要拆两个入口） |
| `dropTypePolicy.ts` L181-212 `selectBuildType` | topK→幂→封顶→合成就绪加成 | 在打分处叠加 affinity（§四） |
| `dropTypePolicy.ts` L247-267 `selectNormalEnemyDropType` | 角色袋消费入口 | 接入 pity 保底（§五） |
| `bountySystem.ts` L31-52 `shuffleRewardBag` / `drawRewardType` | 均匀洗牌袋 + repeatProtection | 替换为 `selectBountyRewardType`（§六） |
| `core/types.ts` `BountyDirectorState` L45-56 | `rewardBag` / `lastRewardType` | rewardBag 仅在 affinity 全 0 的回退路径继续使用 |
| `src/config/base/economy.json` L32-58 | `normalDropTypePolicy` 无 affinity 参数 | 新增 `affinity` 块（§四.2） |
| `src/config/base/bounty.json` L35-46 | reward 无分布参数 | 新增 `rewardBias` 块（§六.2） |
| `src/game.ts` dispatch（L71 附近） | 处理 GameEvent | 监听 `perkApplied` 清袋在 core 内做，不放 UI（§五） |
| `src/telemetry/devTelemetry.ts` + `types.ts` | 已记录 dropLanded/pickup/bounty* | 事件增加 lane 匹配字段（§七） |
| `src/ui/tunerSchema.ts` + `config/base/tuner.json` | 无相关参数 | 关键参数进面板（§四.2、§六.2） |

---

## 四、build 位读取流派倾向

### 1. 打分公式

```ts
// dropTypePolicy.ts 新增
export function calculateAffinityScore(state: GameState, type: CardType): number {
  const def = getSkillDef(type);                    // 来自 effects/interpreter 的注册表
  if (!def) return 0;
  const a = cfg.economy.normalDropTypePolicy.affinity;
  const raw = def.synergyTags
    .filter(tag => tag !== 'utility')               // utility 不参与倾向导流
    .reduce((sum, tag) => sum + state.buildState.affinity[tag], 0);
  return Math.min(a.scoreCap, raw * a.scorePerStack);
}
```

- **仅 build 位**使用 `finalScore = calculateCommitmentScore + calculateAffinityScore`。实现方式：`buildCandidates` 增加参数或拆成 `buildCandidatesByCommitment`（pivot 用）与 `buildCandidatesForBuildRole`（build 用），保证 pivot 的 `excludeTopK` 排除的是**纯投入分**意义上的头部——不要让 affinity 影响 pivot 的排除集，否则转型位会被主流派挤占。
- `selectBuildType` 的「无投入回退链」条件（L183-186 `hasCommittedInvestment`）改为：投入与 affinity 均为 0 才走回退；仅有 affinity 时（比如玩家先升级后拾卡）直接按 finalScore 走正常加权。
- topK / scorePower / maxWeightRatio / mergeReadyMultiplier 逻辑保持，作用在 finalScore 上。

### 2. 配置（`economy.json` → `normalDropTypePolicy.affinity`，同步 `config/types.ts`）

```json
"affinity": { "scorePerStack": 2.5, "scoreCap": 6, "pityWindow": 2 }
```

调参面板（tuner.json + tunerSchema）暴露 `economy.normalDropTypePolicy.affinity.scorePerStack`（0~6, step 0.5）与 `scoreCap`（0~12, step 1）。

---

## 五、选择流派后的即时反馈

在 **core 层**实现（不要在 UI dispatch 里做）：`applyPerk` 中，当所选 perk 的 `affinityGain > 0` 时：

1. `state.normalDropDirector.roleBag.length = 0`（下次掉落触发重灌，新配比与新倾向立即生效）。
2. `state.bountyDirector.rewardBag.length = 0`（回退路径的旧袋作废）。
3. 设置 pity：`state.buildState.dropPity = { lane: perk.lane, remaining: cfg.economy.normalDropTypePolicy.affinity.pityWindow }`（`BuildState` 新增可选字段，types.ts + createInitialState 同步；再次选择流派 perk 时覆盖）。

pity 消费（`selectNormalEnemyDropType` / `selectBuildType`）：

- 仅对 **build 位**生效。每次 build 位选卡后：若选中卡的 `synergyTags` 含 pity.lane → 清除 pity；否则 `remaining--`；当 `remaining` 归 0 且本次仍未命中 → 本次强制改为「从 synergyTags 含 pity.lane 的卡中按 finalScore 加权取一」（仍受 `maxSameTypeStreak` 约束：若强制结果触发连发上限，用同流派次优卡替换；同流派仅一张可选时允许破例，注释说明）。
- discovery / pivot 位不消费、不减计 pity。

---

## 六、Bounty 奖励卡型分布

### 1. 选择函数（替换 `drawRewardType`）

```ts
function selectBountyRewardType(state: GameState, rng: Rng): CardType
```

- **回退**：`affinity` 战斗四 lane 全 0 → 沿用现有均匀洗牌袋逻辑（保留 `shuffleRewardBag` 与 `rewardBag`），行为与现状完全一致。
- 否则三段抽签（概率来自配置）：
  1. `primaryShare`（0.70）：候选 = synergyTags 含**主流派**（affinity 最大 lane，并列 rng 取一）的卡。
  2. `secondaryShare`(0.15)：候选 = synergyTags 含任一「affinity>0 的非主流派 lane」的卡（天然包含双标签桥接卡）；不存在这样的卡 → 并入探索段。
  3. 余下为探索段：候选 = 全卡池。
- 段内加权（在候选集上乘算，权重因子进配置）：
  - `nearMergeBonus`：手牌+装备中该型 1★ 数量 == mergeCopies-1（差一张可合成）→ ×2。
  - `investedBonus`：`calculateCommitmentScore > 0` → ×1.5。
  - `droughtBonus`：`getOrCreateCardTypeRunStats(state, type).totalShown === 0` → ×1.5。
  - 重复保护：`type === state.bountyDirector.lastRewardType` 且 `repeatProtection > 0` → 权重 ×0（候选仅剩它时豁免）。
- 选中后照旧写 `state.bountyDirector.lastRewardType`。
- `createOffer` 调用点换成新函数；**其后一切不动**（冻结语义、结算、万能卡）。

### 2. 配置（`bounty.json` 新增 `rewardBias`，同步 `config/types.ts` BountyConfig）

```json
"rewardBias": {
  "enabled": true,
  "primaryShare": 0.70,
  "secondaryShare": 0.15,
  "nearMergeBonus": 2.0,
  "investedBonus": 1.5,
  "droughtBonus": 1.5
}
```

`enabled=false` 时走均匀袋回退。调参面板暴露 `bounty.rewardBias.primaryShare`（0~1, step 0.05）与 `secondaryShare`（0~0.3, step 0.05）。

---

## 七、遥测（DEV only，沿用现有管线）

`src/telemetry/types.ts` / `devTelemetry.ts`：

- `TelemetryEvent` 增加可选字段 `lane?: string; laneMatch?: boolean;`。
- `dropLanded`（普通击杀来源）记录：当时主流派 lane 与该卡是否命中（synergyTags 含主流派）。主流派不存在记 `laneMatch: undefined`。
- `bountyOffer` 记录同上两个字段。
- `perkPopup`/`perkSelect` 输入已存在（`game.ts` L105 `recordInput('perkSelect', id)`），在 detail 里追加 lane（如 `"proj_damage:projectile"`），格式改动要同步 `tests/telemetryBaseline.test.ts` 若有断言。

---

## 八、测试（扩展 `tests/dropTypePolicy.test.ts`、`tests/bountyRewards.test.ts`）

1. **build 位导流**：构造 `affinity.projectile=3` 且各卡投入分相同的状态，采样 ≥200 次 build 位选卡：projectile 标签卡（pierce/chainLightning/splitBlast）占比显著高于无 affinity 基线；`scoreCap` 生效（affinity=99 与 affinity=cap/scorePerStack 结果分布一致）。
2. **不污染**：同一状态下 `selectDiscoveryType` / `selectPivotType` 的行为与 affinity 全 0 时一致（固定 rng 序列逐次断言相等）。
3. **既有保护回归**：前 20 次普通掉落覆盖 11 种卡；`maxSameTypeStreak` 上限仍生效（现有用例不许删改断言，只许扩参）。
4. **清袋即时性**：预灌 roleBag 后应用一个 `affinityGain>0` 的 perk → roleBag 与 bounty rewardBag 均为空；下一次掉落触发重灌。
5. **pity**：选择 projectile 后构造连续 2 次 build 位都未命中的 rng → 第 2 次被强制为 projectile 标签卡；命中过一次后 pity 清除；discovery/pivot 不减计。
6. **Bounty 分布**：`affinity.control=3` 时采样 ≥400 次 `selectBountyRewardType`：control 标签卡占比落在 primaryShare±10pt；`lastRewardType` 重复保护仍生效；affinity 全 0 时与旧均匀袋逐次等价（固定 rng）。
7. **冻结回归**：报价生成后修改 affinity，再结算 → 掉落的仍是报价时的卡型（现有 bountyRewards 用例扩一条）。
8. **万能卡回归**：Bounty 完成仍产出 1 张万能卡（防止顺手删除）。

---

## 九、实施顺序

1. economy.json/bounty.json/config types 配置块 + tuner 参数（空实现，先让配置可读）。
2. `calculateAffinityScore` + build 位接入 + pivot 隔离（跑 dropTypePolicy 测试）。
3. `applyPerk` 清袋 + pity 状态与消费。
4. `selectBountyRewardType` + createOffer 接入 + 回退路径。
5. 遥测字段。
6. 测试补齐与全量回归。
