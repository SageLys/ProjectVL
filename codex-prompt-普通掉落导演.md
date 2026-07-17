# Codex 任务：普通敌人掉落导演（NormalDropDirector）

> 本文档为完整实施指令。所有文件路径、行号、行为描述均已对照当前 `main` 分支实际代码核实。
> 按「九、实施顺序」的 6 个阶段依次完成，每阶段结束保持 `npm test` 与 `npm run build`（含 `tsc --noEmit`）通过。
> 本次任务**不包含** Monte Carlo 仿真脚本（`scripts/simulateDropTypePolicy.ts` 留作后续独立任务）；「十一、验收指标」仅作为设计意图参考与后续仿真的验收依据。

---

## 一、总目标

把普通敌人掉落的**卡型选择**从"11 卡完全均匀随机"重做为一个随玩家构筑状态变化的**掉落导演**，实现如下体验：

1. **初期教学**：玩家在前 20 次普通掉落内必然接触到卡池全部 11 种技能，同时仍有足够重复牌可开始合成。
2. **构筑收敛**：随着玩家合成高星并装备，普通掉落逐渐偏向玩家实际投入最多的卡牌类型。
3. **持续调整机会**：中后期每 10 次普通掉落中固定安排 2 次"本局投入少的卡型"，且不会长期断档，供玩家转型。
4. **只改卡型，不改其他**：普通敌人的总掉落率、掉落星级、掉落时限、Boss 必掉、赏金承诺卡型、丰收额外掉落等全部保持现状。

核心概率分解（前一项不动，本任务只重做后一项）：

```text
P(卡型 i | 击杀) = P(产生掉落 | 状态) × P(i | 已产生普通掉落, 状态)
                    ↑ totalDropChance，不动      ↑ 新掉落导演
```

设计选型（已拍板，不要用其他方案替代）：

> **配置驱动卡池 + 按掉落来源分流 + 10 次掉落滚动角色袋 + 构筑成熟度 M + 各类型构筑投入分 S。**

不采用单一动态权重公式（如"拥有 N★ → 掉率 ×N"），因为它无法同时保证初期全池展示、初期可合成、后期收敛、调整牌不断档、其他掉落来源不被污染。三选一肉鸽的"页面槽位"概念在本项目迁移为"**连续 10 次成功掉落构成一个滚动奖励页面**"：独立骰子（如每次 20% 出调整牌）会出现长真空期，角色袋能对连续体验给出硬保证。

---

## 二、硬性不变量（回归保护，实现后必须逐条自查）

以下行为一个都不许变：

1. 普通敌人总掉落率：`rollDropOnKill` 中 `rng() < totalDropChance(state, config)` 的判定与调用次序。
2. `totalDropChance` / `totalDropLifetime`（`src/core/stats.ts` L39-49）：基础 0.27、封顶 0.95、丰收 `dropRateMul`/`dropLifetimeMul` 乘数。
3. 掉落星级：`normalDropStar`（`normalDropsOnlyOneStar=true` → 恒 1★）。
4. Boss 必掉规则（`rollDropOnKill` 的 `|| enemy.type === 'boss'` 分支），Boss 掉落卡型保持**均匀随机**。
5. 赏金奖励：承诺卡型强制指定（`bountySystem.ts` L228）、奖励洗牌袋 + `repeatProtection` 逻辑不变（仅卡池来源改为 `getCardPool()`，见 §八阶段 1）。
6. 丰收 `extraDrop` 原子：卡型保持**均匀随机**，数量/星级权重/落点逻辑不变。
7. 赏金敌群成员死亡**不走** `rollDropOnKill`（`damageSystem.ts` L21-22 的 if/else），因此导演天然只作用于非赏金击杀，这个隔离不许破坏。
8. 自动合成、满手牌立即合成拾取、装备喂养、万能卡规则全部不动。
9. 调试掉落（`game.ts` L325 debug API、`spawnTestDrops`）行为不变。
10. RNG 纪律：只使用注入的 `rng`，禁止 `Math.random`；固定 rng 序列下结果完全可复现。注意：本改动会改变同 seed 下的 rng 消耗序列，属预期；已核实现有测试不依赖普通掉落的具体卡型序列（`tests/dropSystem.test.ts` 全部传入显式卡型；`tests/headlessRun.test.ts` 是冒烟测试；`telemetry_session_seed42.json` 是静态 fixture）。

---

## 三、现状（已核实的精确位置）

| 位置 | 内容 | 处置 |
|---|---|---|
| `src/core/systems/dropSystem.ts` L11-14 | `CARD_KEYS` 硬编码 11 卡数组 | 删除，改为 `getCardPool()` 读 `cfg.skills.cards` |
| `dropSystem.ts` L19-31 `spawnGroundDrop` | `forcedType ?? 均匀随机` 既选卡型又建对象 | 改为 `type` 必填，删除隐式随机（§八阶段 3） |
| `dropSystem.ts` L54-58 `rollDropOnKill` | 命中或 Boss → 无类型调用 `spawnGroundDrop` | 拆分 Boss/普通两分支，接入导演（§八阶段 4） |
| `dropSystem.ts` L133-138 `spawnTestDrops` | 用 `CARD_KEYS[state.merges % n]` 轮换 | 改用 `getCardPool()`，行为不变 |
| `src/core/systems/damageSystem.ts` L21-22 | 赏金成员走 `notifyBountyMemberKilled`，否则 `rollDropOnKill` | 不动 |
| `src/core/systems/bountySystem.ts` L3, L31, L48 | import 并使用 `CARD_KEYS` 做奖励洗牌袋 | 改用 `getCardPool()`，其余不动 |
| `src/core/effects/registry.ts` L330-346 `extraDrop` | `spawnGroundDrop(..., null, star)` 均匀随机 | 改为显式传 `selectUniformCardType(rng)` |
| `src/game.ts` L325 | debug API `spawnGroundDrop(x, y, type=null, star)` | null 时映射为 `selectUniformCardType`，对外签名不变 |
| `src/core/types.ts` `GameState` | 只有全局 `merges`，无按卡型统计 | 新增 `normalDropDirector` 状态（§六） |
| `src/core/systems/cardSystem.ts` L9-12 `commitMerge` | 所有合成路径的唯一汇聚点 | 在此埋点按卡型统计（§八阶段 5） |
| `src/core/createInitialState.ts` | 无导演状态 | 初始化 `normalDropDirector`（按 `cfg.skills.cards` 动态建键，不写死 11 个） |
| `src/config/base/economy.json` + `src/config/types.ts` `EconomyConfig` | 无导演配置 | 新增 `normalDropTypePolicy`（§七） |
| `src/config/base/tuner.json` + `src/ui/tunerSchema.ts` | 无导演参数 | 关键参数进调参面板（§七.3） |

已核实的合成埋点汇聚事实：三条合成路径——手牌自动合成（`cardSystem.ts` `autoMergeCards` L41）、装备喂养（`equipmentSystem.ts` `feed` L15）、万能卡升星（`wildcardSystem.ts` L49）——**全部**调用 `commitMerge(state, config, rng, cardType, resultStar)`，因此按卡型的合成统计只需在 `commitMerge` 一处埋点。

当前均匀随机为什么完不成初期教学（动机数据，供理解，不需要写进代码）：第 1 波预算配额 `51 + 1×52 = 103` 只（`waves.json` + `budgetWaveQuotaFor`），全灭且不计加成约产生 `103×27% ≈ 27.8` 次掉落；但均匀抽取下 28 次掉落全覆盖 11 种的概率仅 41.6%（计入掉落次数波动后 40.2%）；前 10 次平均只见到 6.76 种。"前期掉得多"≠"玩家能接触完整卡池"。

---

## 四、掉落来源分流

新增来源标签（放在 `dropTypePolicy.ts` 或 `types.ts`）：

```ts
export type CardDropSource = 'normalKill' | 'bossKill' | 'bounty' | 'skillExtra' | 'debug';
```

| 来源 | 卡型规则 | 星级/时限 |
|---|---|---|
| 普通/高速/重装击杀（非赏金） | **新掉落导演** | 不变 |
| Boss 击杀 | 均匀随机（`selectUniformCardType`） | 不变 |
| 赏金奖励 | 承诺卡型（`encounter.rewardCardType`），不变 | 不变 |
| 丰收等技能 `extraDrop` | 均匀随机 | 不变 |
| 调试 | 强制指定；缺省时均匀随机 | 不变 |

理由：Boss、赏金、丰收空投是独立的惊喜/承诺渠道，接入构筑偏向会放大丰收正反馈、掏空赏金的"指定卡型"价值。**只有 normalKill 计入导演的统计与角色袋消耗。**

---

## 五、机制设计：时间序列角色袋

### 5.1 角色袋

每消耗完一袋，重新生成一个长度 `roleBagSize=10` 的角色序列，元素为：

```ts
export type NormalDropRole = 'discovery' | 'build' | 'pivot';
```

每次普通掉落成功后从袋中弹出一个角色，按角色选卡型。袋跨波次持续，不随波次重置。

### 5.2 构筑成熟度 M（连续值，不按波次硬切）

```text
M = clamp( mergeWeight × min(总合成次数 / fullMergeOps, 1)
         + starWeight  × min((本局最高到达星级 − 1) / (fullHighestStar − 1), 1)
         + equipWeight × min(已装备类型数 / fullEquippedTypes, 1), 0, 1 )
```

基线参数：`mergeWeight=0.25, starWeight=0.35, equipWeight=0.40, fullMergeOps=10, fullHighestStar=4, fullEquippedTypes=2`。
- 总合成次数 = `state.merges`（现有字段）。
- 本局最高到达星级 = 导演统计的 `highestStarReached` 全类型最大值（**历史值**，不能实时读手牌——玩家消耗掉 4★ 后构筑不应退回早期）。
- 已装备类型数 = `state.equipment` 非空格数（`equipDistinctTypes=true` 保证类型互异）。

### 5.3 生成一袋角色的配比

```text
build     = round( earlyMix.build + (lateMix.build − earlyMix.build) × M )
pivot     = round( earlyMix.pivot + (lateMix.pivot − earlyMix.pivot) × M )
discovery = roleBagSize − build − pivot   （clamp ≥ 0；若 build+pivot 超袋长，先减 build 再减 pivot）
```

基线：`earlyMix = {discovery:6, build:3, pivot:1}`，`lateMix = {discovery:1, build:7, pivot:2}`。M 从 0→1 时配比自然从 6/3/1 过渡到 1/7/2。

**启动保护**：只要卡池中还有 `ordinaryShown === 0` 的类型，则 `discovery = max(discovery, bootstrapMinDiscovery)`（基线 `bootstrapMinDiscovery=6`；超袋长时先挤占 build 再挤占 pivot）。由于探索角色优先选未出现类型（§5.4），前两袋 ≥12 个探索位 ≥ 11 种卡，硬性保证前 20 次普通掉落覆盖全池，同时剩余位置仍提供重复牌供合成。

**排布**：角色在袋内打乱顺序，但约束 pivot 分散——把袋分为前后两半，pivot 角色轮流放入两半，再各自半内打乱。避免两张调整牌恰好挤在一起。

### 5.4 探索型（discovery）

不做均匀随机，而是动态洗牌袋：

```text
候选 = 本局普通掉落出现次数（ordinaryShown）最少的类型集合
     → 从并列最少者中用 rng 随机选一个
     → 若与上一次普通掉落同型且存在其他候选，则换一个（软性避免立即重复）
```

未出现类型的 `ordinaryShown=0` 天然最少，所以启动阶段探索位自动优先未见类型；全部见过后，探索位持续补最少见的类型，但不阻止重复（区别于"前 11 张完全不重复"——那会让 7 格手牌装不下且迟迟无法开始合成）。

### 5.5 主线强化型（build）

不能只看"当前拥有几张"（最初随机拿到的 1★ 会自我强化，把偶然开局误认为玩家选择）。为每类型计算**构筑投入分**：

```text
S_i = Σ_{手牌+装备中该类型的每张卡} 2^(star−1)          ← 当前持有折算量（1★=1, 2★=2, 3★=4, 4★=8…）
    + historicalMergeWeight × min(该类型合成次数, historicalMergeCap)   ← 0.5 × min(mergeOps_i, 8)
    + 装备加成：该类型已装备 → equippedBaseBonus + equippedStarBonus × (装备星级 − equipThreshold)
                                （基线 6 + 2 × (star − 3)）
```

装备（明确的玩家选择）显著高于零散 1★（3★ 装备卡 = 4+6+历史分 vs 普通 1★ = 1），历史合成只是次要信号，不永久锁死早期构筑。

选择流程：

```text
1. 取 S_i 最高的前 topK=3 种为候选；
2. 权重 w_i = (S_i + 0.5)^scorePower（scorePower=1.25）；
3. 最高/最低权重比封顶 maxWeightRatio=6（超出时把高者压到低者×6）；
4. 手牌中存在该类型 1★（即本次 1★ 掉落可立即促成合成）→ w_i × mergeReadyMultiplier(1.5)；
5. 加权抽取。
```

退化规则：所有类型 S_i 均为 0（开局无投入）→ 主线角色改为"优先匹配当前手牌中已有 1★ 的类型"（多个候选时 rng 随机；帮助凑出第一批 2★/3★）；手牌也为空 → 退化为探索型。

### 5.6 调整型（pivot）

```text
1. 按 S_i 升序排序；
2. 排除 S_i 最高的前 excludeTopK=2 种；
3. 取其余类型中投入最低的 candidateFraction=0.5（向上取整）为候选；
4. 权重 w_i = 1 / (1 + S_i)；
5. 并列时优先 lastOrdinaryShownAt 更早（最久没出现）的类型。
```

卡池扣除排除项后候选不足 1 个时退化为探索型。

### 5.7 反连抽保护

普通掉落同类型最多连续出现 `maxSameTypeStreak=2` 次。第三次选中同型时：从当前角色的其余合法候选中重选；无其他合法候选才允许继续重复。目的不是分布平均，而是避免地面连续刷出相同视觉结果。

### 5.8 主流程

```text
selectNormalEnemyDropType(state, rng):
  enabled=false → 直接 selectUniformCardType(rng)（回退开关）
  袋空 → refillNormalDropRoleBag(state, rng)
  role = 袋.pop()
  type = 按 role 调 selectDiscoveryType / selectBuildType / selectPivotType
  反连抽检查（§5.7），必要时重选
  recordCardDropShown(state, type, 'normalKill')   ← ordinaryShown++/totalShown++/lastOrdinaryShownAt/recentTypes
  ordinaryDropCount++
  return type
```

---

## 六、数据模型（`src/core/types.ts`）

```ts
export type NormalDropRole = 'discovery' | 'build' | 'pivot';

export interface CardTypeRunStats {
  /** 普通掉落（normalKill 来源）出现次数 */
  ordinaryShown: number;
  /** 各来源合计出现次数（含 boss/bounty/skillExtra，仅遥测参考） */
  totalShown: number;
  /** 拾取次数 */
  collected: number;
  /** 该类型合成/喂养/万能卡升星次数（commitMerge 埋点） */
  mergeOps: number;
  /** 本局该类型历史达到的最高星级（含拾取高星赏金卡） */
  highestStarReached: number;
  /** 最近一次作为普通掉落出现时的 ordinaryDropCount 序号 */
  lastOrdinaryShownAt: number;
}

export interface NormalDropDirectorState {
  roleBag: NormalDropRole[];
  /** 最近若干次普通掉落卡型（反连抽用，保留最后 maxSameTypeStreak 个即可） */
  recentTypes: CardType[];
  /** 累计成功普通掉落次数 */
  ordinaryDropCount: number;
  typeStats: Record<CardType, CardTypeRunStats>;
}
```

`GameState` 增加 `normalDropDirector: NormalDropDirectorState;`。
`createInitialState.ts` 按 `cfg.skills.cards` 动态建 `typeStats` 键（**不写死 11 个键**——新增第 12 张卡不改 core）。注意 `typeStats` 的键在 variant 切换卡池时可能缺失：`recordCardDropShown` 等入口对未知类型做懒初始化。

---

## 七、配置

### 7.1 `src/config/base/economy.json` 新增域

```json
"normalDropTypePolicy": {
  "enabled": true,
  "roleBagSize": 10,
  "earlyMix": { "discovery": 6, "build": 3, "pivot": 1 },
  "lateMix": { "discovery": 1, "build": 7, "pivot": 2 },
  "bootstrapMinDiscovery": 6,
  "maturity": {
    "fullMergeOps": 10, "fullHighestStar": 4, "fullEquippedTypes": 2,
    "mergeWeight": 0.25, "starWeight": 0.35, "equipWeight": 0.40
  },
  "build": {
    "topK": 3, "scorePower": 1.25, "mergeReadyMultiplier": 1.5,
    "equippedBaseBonus": 6, "equippedStarBonus": 2,
    "historicalMergeWeight": 0.5, "historicalMergeCap": 8, "maxWeightRatio": 6
  },
  "pivot": { "excludeTopK": 2, "candidateFraction": 0.5 },
  "maxSameTypeStreak": 2
}
```

这些是仿真起点值，不是最终数值。`src/config/types.ts` 的 `EconomyConfig` 同步补类型。

### 7.2 读取纪律

遵守 `src/config/index.ts` 头注释：所有函数**在函数体内**读 `cfg.economy.normalDropTypePolicy` 与 `cfg.skills.cards`，**禁止模块顶层解构/缓存**（否则 variant 切换与测试注入失效）。`getCardPool()` 每次调用都从 `cfg.skills.cards.map(c => c.id)` 现算。

### 7.3 调参面板（已拍板：关键参数进面板）

仿照 `BOUNTY_TUNER_PARAMS` 的做法：

1. `src/ui/tunerSchema.ts` 新增 `DROP_DIRECTOR_TUNER_PARAMS: TunerParam[]`（`group: 'drops'`，复用现有分组），并入 `ALL_TUNER_PARAMS`。收录以下数值路径（`enabled` 是布尔，面板只支持数值，不进面板）：
   - `economy.normalDropTypePolicy.roleBagSize`（min 4, max 20, step 1）
   - `earlyMix.discovery / build / pivot`、`lateMix.discovery / build / pivot`（min 0, max 10, step 1）
   - `bootstrapMinDiscovery`（min 0, max 10, step 1）
   - `maturity.fullMergeOps`（1–40, 1）、`maturity.fullHighestStar`（2–6, 1）、`maturity.fullEquippedTypes`（1–3, 1）
   - `maturity.mergeWeight / starWeight / equipWeight`（0–1, 0.05）
   - `build.topK`（1–6, 1）、`build.scorePower`（0.5–3, 0.05）、`build.mergeReadyMultiplier`（1–4, 0.1）
   - `build.equippedBaseBonus`（0–20, 1）、`build.equippedStarBonus`（0–10, 1）
   - `build.historicalMergeWeight`（0–2, 0.1）、`build.historicalMergeCap`（0–30, 1）、`build.maxWeightRatio`（1–20, 1）
   - `pivot.excludeTopK`（0–5, 1）、`pivot.candidateFraction`（0.1–1, 0.05）
   - `maxSameTypeStreak`（1–5, 1）
2. `src/config/base/tuner.json` 补对应 range 条目（key = 完整路径 `economy.normalDropTypePolicy.…`）。
3. 面板改动只到"能改数值"为止，不做专属状态显示。**健壮性要求**：`refillNormalDropRoleBag` 内对面板可能调出的病态组合做防御——`earlyMix/lateMix` 之和超过 `roleBagSize` 时按 §5.3 的挤占规则收敛，任何配比下 discovery ≥ 0、袋长恒等于 `roleBagSize`。

---

## 八、实施步骤

### 阶段 1：卡池配置化

- `src/core/systems/dropTypePolicy.ts`（新文件）导出 `getCardPool(): CardType[]`。
- 删除 `dropSystem.ts` 的 `CARD_KEYS`；`spawnTestDrops`、`bountySystem.ts`（L3/L31/L48）改用 `getCardPool()`。避免以后加第 12 张卡时普通掉落和赏金卡池不同步。
- 跑测试：现有 `dropSystem.test.ts`、`bountyRewards.test.ts` 应全绿。

### 阶段 2：导演状态与配置

- `types.ts` 加 §六类型；`createInitialState.ts` 初始化；`economy.json`/`EconomyConfig` 加 §7.1 配置。
- 此阶段不接线，纯增量，全测试绿。

### 阶段 3：底层生成函数去隐式随机

- `spawnGroundDrop` 的 `forcedType: CardType | null = null` 改为必填 `type: CardType`，删除函数内 `?? 均匀随机`。
- 调用方逐一补显式类型：
  - `registry.ts` `extraDrop`：`selectUniformCardType(rng)`；
  - `game.ts` L325 debug：`type ?? selectUniformCardType(rng)`（对外 debug API 签名不变）；
  - `bountySystem.ts` L228 已传承诺类型，不动；
  - 测试全部已传显式类型，不动。
- `dropTypePolicy.ts` 导出 `selectUniformCardType(rng)`。

### 阶段 4：规则模块 + 接入普通击杀

- `dropTypePolicy.ts` 实现纯函数（不生成地面对象、不碰 DOM，便于独立仿真）：
  `calculateBuildMaturity(state)`、`calculateCommitmentScore(state, type)`、`refillNormalDropRoleBag(state, rng)`、`selectDiscoveryType(state, rng)`、`selectBuildType(state, rng)`、`selectPivotType(state, rng)`、`selectNormalEnemyDropType(state, rng)`、`recordCardDropShown(state, type, source)`。
- `rollDropOnKill` 改为（**外壳判定原样保留**，只在命中后按敌人类型分流选型，掉落判定的 rng 消耗顺序与现状完全一致）：

```ts
export function rollDropOnKill(state: GameState, config: Config, rng: Rng, enemy: Enemy): void {
  if (rng() < totalDropChance(state, config) || enemy.type === 'boss') {
    const type = enemy.type === 'boss'
      ? selectUniformCardType(rng)              // Boss 必掉：均匀，不进导演统计
      : selectNormalEnemyDropType(state, rng);  // 普通/高速/重装：掉落导演
    spawnGroundDrop(state, config, rng, enemy.x, enemy.y, type);
  }
}
```

### 阶段 5：玩家行为埋点

- `commitMerge`（唯一汇聚点）：`typeStats[cardType].mergeOps++`；`highestStarReached = max(…, resultStar)`。覆盖自动合成、装备喂养、万能卡三条路径，**不要**在三处分别埋点。
- `collectDrop`（卡牌分支）：`typeStats[drop.type].collected++`；`highestStarReached = max(…, drop.star)`（覆盖拾取 2★ 赏金卡的情形）。
- 当前装备状态与当前持有折算量**不冗余存储**，`calculateCommitmentScore` 实时扫 `state.cards`/`state.equipment`。

### 阶段 6：调参面板

- 按 §7.3 加 `DROP_DIRECTOR_TUNER_PARAMS` 与 `tuner.json` ranges。
- 全量测试 + `npm run build` 收尾。

---

## 九、测试（新增 `tests/dropTypePolicy.test.ts`，并按需扩展 `dropSystem.test.ts`）

使用 `tests/helpers.ts` 的 `freshState/card/seqRng/constRng/resetTestEnv` 惯例。至少覆盖：

1. `getCardPool()` 来自 `cfg.skills.cards`，返回 11 个 id；variant 注入第 12 张卡后无需改 core 数组即生效。
2. 启动阶段：探索角色优先选择 `ordinaryShown=0` 的类型。
3. **硬保证**：模拟前 20 次普通掉落（任意固定 rng），全部 11 种类型至少出现一次。
4. 初期（无任何投入）主线角色退化为"优先匹配手牌中已有 1★ 的类型"；手牌为空退化为探索。
5. `calculateCommitmentScore`：3★ 已装备类型（4+6=10+历史分）显著高于零散 1★（=1）。
6. `commitMerge` 按卡型正确累计 `mergeOps` 与 `highestStarReached`，装备喂养和万能卡路径也被计入。
7. M=1 时角色袋恰好 1 探索 + 7 主线 + 2 调整，且两个 pivot 分处袋前后半。
8. 调整型排除 S_i 最高的前 2 种。
9. 同类型普通掉落不连续超过 2 次（存在其他合法候选时）。
10. Boss 击杀掉落卡型均匀（固定 rng 验证不受 typeStats 偏向影响）。
11. 赏金奖励掉落仍为承诺卡型。
12. `extraDrop` 原子掉落卡型均匀。
13. `enabled=false` 时普通掉落卡型均匀（回退开关）。
14. 固定 rng 序列下 `selectNormalEnemyDropType` 结果完全可复现（同一状态深拷贝 + 同一 rng 序列跑两遍结果一致）。
15. 回归：普通掉落总掉率判定、星级（恒 1★）、掉落时限调用不变（可复用/扩展现有 `dropSystem.test.ts` 用例）。

---

## 十、明确不要做的事

1. 不要把逻辑堆进 `spawnGroundDrop`——它退化为纯生成函数，选型全部在调用方。
2. 不要按最高星级直接乘权重（正反馈锁死流派）、不要按波次硬切概率（不响应实际构筑进度）、不要"第一轮 11 张不重复"（7 格手牌装不下且无法开始合成）、不要独立骰子出调整牌（长真空期）。
3. 不要让 Boss / 赏金 / 丰收 extraDrop 继承构筑偏向。
4. 不要在模块顶层缓存卡池或配置。
5. 不要新增每帧开销：导演只在"成功掉落"时刻运行，`refill` 每 10 次掉落一次。
6. 不要动 `GroundDrop` 的数据结构、渲染层、拾取交互。
7. 不要引入 `Math.random`。

---

## 十一、验收指标（设计意图；由后续独立的仿真任务验证，本次不实现）

- **初期探索**：前 10 次普通掉落 ≥6 种不同技能；前 20 次 100% 覆盖 11 种；前 10 次中 ≥3 次可延续当前手牌类型；首次可合成重复的中位位置 ≤ 第 5 次。
- **中后期收敛**：M≥0.8 后，投入前 3 类型占随后 20 次的 65%~85%；第一主类型占比 30%~55%；已装备类型出现率显著高于零散 1★ 类型。
- **调整机会**：后期每 10 次固定 2 个调整位；连续无调整掉落最大间隔 ≤7；调整型不选投入前 2；新类型升 3★ 并装备后最迟下一袋进入主线候选。
- **回归**：§二全部不变量成立。

完成后请输出：改动文件清单、`npm test` 与 `npm run build` 结果、以及每个 §九测试用例的通过情况。
