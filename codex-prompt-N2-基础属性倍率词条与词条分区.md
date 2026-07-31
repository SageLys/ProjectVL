# Codex 任务 N2：基础属性词条分区（wave 独占平加 / 卡牌只给倍率）

> **本版基准**：本地 `main` = `e6b23fd`（`feat: formalize recipe products and hide recipe discovery`）。
> 上一版写于奖励蓄力条重构（`e8d839c`）之前，遗物系统与旧 `skills.json` 均已不存在，**行号、卡数、词条统计、遗物相关论述全部作废**。旧版可用 `git show HEAD:codex-prompt-N2-基础属性倍率词条与词条分区.md` 取回，仅作参考，**不要照它执行**。
>
> 一句话规则：**`waveRewards` 独占基础属性的永久平加；`affixPool` 对基础属性只能给倍率；11 个 `BuildScalingAxis` 继续只服务卡牌机制与限时奖励。**
> 行号仅供导航，以符号名为准。结束时 `npm run test` 与 `npm run build` 全绿。

---

## 〇、相对上一版的事实更新（必读）

| 变化 | 现状 |
|---|---|
| **遗物系统已删除** | `relics.json`、`progression.json`、`relicStacks` 全部不存在。`buildModifierSystem.aggregateBuildScaling()` 已退化为 `return EMPTY_TOTALS` 的桩函数 |
| **`BuildScalingAxis` 已无永久生产者** | 现仅三个瞬时/局部来源：① 装备卡自身的机制词条（`cardAffixScaling`，只作用于该卡产生的效果）② 限时 `statBuff` 原子 ③ 新奖励 `buildResonance`（`buildSurge`，按 `dominantBuildTag` 推 12 秒限时 modifier，见 `rewardExecutionSystem.ts:65` 的 `SURGE_AXES`） |
| **`skills.json` 已重写** | 60 张卡（原 41），180 条候选（原 123），**每张卡 `affixPool.count` 统一为 2** |
| **基础平加只剩 3 种、共 49 条** | `damageAdd` 24（1~3，step 1）／`maxHpAdd` 13（5~15，step 5）／`fireRateAdd` 12（0.1~0.25，step 0.05） |
| **`rangeAdd` / `multiAdd` / `quantityAdd` 已不在任何 `affixPool` 中** | 因此本次**没有** rangeAdd 或 multiAdd 需要迁移；§4 的 `rangeMul` 是纯新增能力 |
| `xpGainPct` 落点已改 | `applyRunBaseReward` 现写入 `state.rewardMeter.pointGainBonus`（`waveRewardSystem.ts:37`） |
| 新配置域 | `rewardMeter.json`、`settlement.json`、`designFingerprints.json` |
| 每波都是 Boss 波 | `waves.bossWaves = [1..10]` |
| 新增测试归属地 | `tests/vitalStatSystem.test.ts`（基础属性 + `AFFIX_SINKS` 穷尽性，:167 断言键集相等）、`tests/textCoverage.test.ts:32`（断言 `affixHelp` 覆盖 `AFFIX_SINKS` 全键）。**改 `AFFIX_SINKS` 的键必然打破这两处，必须同步** |

未变的部分（可放心复用）：`src/core/stats.ts` 四个 total 函数形状、`cardAffixSystem.ts` 全部逻辑、`affixSinks.ts` 的 17 个键、`types.ts` 的 `RunBaseStatKind` / `CardStatKind` / `WaveChoiceStatKind`、`waveRewards.json` 内容、`combat.defaults = {damage:18, fireRate:5, range:150}`、`combat.hp.max = 100`、`economy.equipSlots = 3` 且 `equipDistinctTypes = true`、`waves.totalWaves = 10`。

## 一、目标

1. 新增基础属性倍率词条 `damageMul / fireRateMul / rangeMul / maxHpMul`，作为卡牌词条影响炮台基础属性的**唯一**方式。
2. 把 `RunBaseStatKind`（6 项平加）**移出**卡牌词条值域，校验器硬禁止 `affixPool` 再出现基础平加。
3. 等价迁移 `skills.json` 中现存的 **49 条基础平加候选**。
4. 修复**射程封顶口径 bug**：波末 `rangeAdd` 的触顶判定当前包含装备态与限时倍率，会让永久成长被静默跳过且不可补回。这是 `rangeMul` 落地的前置条件。
5. 拆开 `RuntimeStatKind` 与 `CardStatKind` 的自动超集关系，避免收窄卡牌词条值域时连带削掉 `statBuff` 的能力。

## 二、硬性不变量 / 明确不做

1. **两套永久成长的获得入口、存储与生命周期保持独立**，不合并：`waveRewards` → `runBaseStats`/`baseMaxHp`/`rewardMeter.pointGainBonus`；`affixPool` → `runBuild.cardAffixRolls`。
2. **保留现存 131 条机制类词条**（180 − 49），11 个 `BuildScalingAxis` 语义、落点、`(1+Σ)` 叠加公式一律不改。
3. **不复活遗物**，不给 `aggregateBuildScaling` 加回生产者，不动 `SURGE_AXES`。
4. **不做实例级词条**。维持"每局每卡型一份随机模板"，`CardFusionPolicyDef` 继续保持惰性占位。
5. **不做 `multiMul`**：同发数是离散量，`combatSystem.ts` 弹道路径按 `for (i < multi)` 截断、迫击炮路径又把 `totalMulti` 当连续伤害倍率，两处语义不一致。
6. **不做 `healMul`**：`heal` 是一次性结算（`settlement:'instant'`、`equipment:'unsupported'`），不是常驻基础属性。
7. **`rangeMul` 本期只开放类型 + 公式 + 校验 + 封顶修复，不往 60 张卡的池子里铺候选。** 铺设留给内容设计单独 PR——见 §七 的 RNG 中立性约束。
8. **不趁机加强数值。** 本期严格等价换算，标定留到固定 seed 回放对照之后的独立 PR。
9. 不改 `AtomName` / `Trigger` / `BuildTag` / `BuildScalingAxis` 枚举，不改 `rewardMeter` 与 `settlement` 任何行为。
10. 波末奖励"触顶则跳过 / 禁选"的语义不变，只改**判定口径**；不实现"只结算剩余差值"。

## 三、现状（已逐条核实，含对旧文档的更正）

| 位置 | 事实 |
|---|---|
| `cardAffixSystem.ts` `ensureAffixTemplate` | 词条是**每局每卡型一份模板**，不是实例级。首次遇到某卡型时掷点写入 `state.runBuild.cardAffixRolls[type]`，之后所有同型卡复制该模板 |
| `Card.affixes` | 仅为显示副本。结算路径 `equipmentAffixAdd` / `cardAffixScaling` 一律读卡型模板 |
| 合成 / 喂养 / 配方进化 | **不会重掷或覆盖词条**。全仓库只有 `ensureAffixTemplate` 写 `cardAffixRolls` |
| `src/design/cardView.ts` | 文案"每次实例随机抽 N 条"**是错的**，需更正为"每局每卡型随机抽 N 条" |
| `types.ts` `CardStatKind` | `= RunBaseStatKind \| BuildScalingAxis`——卡牌是唯一横跨两套词汇表的系统 |
| `buildModifierSystem.ts` `scaleEffects` | 卡牌机制词条 + 限时 `statBuff` 在此**相加后共同改写同一原子参数**；同名轴不只是词汇复用 |
| `waveRewardSystem.ts` `rangeIsCapped` | 调用 `totalRange()`，其中含 `equipmentAffixAdd.rangeAdd` 与 `modifierTotal('rangeAdd').mul`。**装备/限时效果把有效射程顶到上限 → 波末永久 `rangeAdd` 被跳过 → 效果消失后成长永久丢失** |
| `waveSystem.ts` `finishWave` | 最后一波直接 `endGame`，不进 `beginIntermission`，终局波无 waveRewards |
| `cardAffixSystem.ts` `activateConsumableAffixes` | **消耗态已原生支持乘法**：`value: contract.operation === 'mul' ? 1 + roll.value : roll.value` |
| `runtimeStatModifierSystem.ts` `modifierTotal` | 已返回 `{add, mul}`，其中 `mul *= value`（连乘） |
| `stats.ts` | 四个 total 已是 `(Σ加法) × modifier.mul` 形状，插入新乘区改动极小 |
| `cardAffixSystem.ts` `equipmentAffixAdd` | **装备态只有加法出口**，`Modifiers.equipmentAffixAdd: Record<RunBaseStatKind, number>`。这是本任务唯一真正缺失的一环 |
| `skillValidator.ts` `CARD_STATS` | `= new Set(Object.keys(AFFIX_SINKS))`，已是单一来源；收紧 `AFFIX_SINKS` 键即自动收紧校验 |
| `cardAffixSystem.ts` `rollValue` / `weightedCandidate` | 各消耗恰好一次 `rng()`，**与 `min/max/step` 无关**；桶数 = `floor((max-min)/step)+1` 决定 `rollIndex` 的取值分布 |
| `ui/cardDetailModel.ts` `affixAmount` | 已按 `stat.endsWith('Mul')` 渲染百分比，新命名可零改动复用 |
| `effects/runtime.ts` `tickStatModifiers` | 限时 modifier 到期时对 `maxHpAdd` 调 `reconcileMaxHp` |
| `equipmentSystem.ts`（三处）、`evolutionTreeSystem`、`recipeEvolutionSystem`、`wildcardSystem` | 均已调 `reconcileMaxHp`，`maxHpMul` 可安全接入 |

## 四、类型契约

`src/config/types.ts`：

```ts
/** waveRewards 独占：基础属性的永久平加。卡牌词条不得使用。 */
export type RunBaseStatKind = 'damageAdd' | 'fireRateAdd' | 'rangeAdd' | 'multiAdd' | 'maxHpAdd' | 'heal';

/** 卡牌词条独占：基础属性的倍率。波末奖励与 SURGE_AXES 不得使用。 */
export type CardBaseStatMulKind = 'damageMul' | 'fireRateMul' | 'rangeMul' | 'maxHpMul';

/** 卡牌词条的完整值域：4 个基础倍率 + 11 个构筑机制轴。 */
export type CardAffixStatKind = CardBaseStatMulKind | BuildScalingAxis;

/** @deprecated 过渡别名；迁移完成后逐个替换引用并删除 */
export type CardStatKind = CardAffixStatKind;
```

`src/core/effects/defs.ts` —— **不要**继续写成 `CardStatKind | 'damage' | 'fireRate'`，显式列全，否则收窄卡牌值域会连带削掉 `statBuff`：

```ts
export type RuntimeStatKind =
  | RunBaseStatKind          // statBuff 仍可临时给平加
  | CardBaseStatMulKind
  | BuildScalingAxis
  | 'damage' | 'fireRate';
```

`src/core/effects/atomContract.ts` 的 `RUNTIME_STAT_KINDS` 补 4 项（`RuntimeStatKindsExhaustive` 断言会主动报错提醒）。

`src/config/affixSinks.ts` 改为 `Record<CardAffixStatKind, AffixSinkContract>`，**删除** `damageAdd/fireRateAdd/rangeAdd/multiAdd/maxHpAdd/heal` 六条，新增四条：

```ts
damageMul:   { operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalDamage' },
fireRateMul: { operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalFireRate' },
rangeMul:    { operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalRange' },
maxHpMul:    { operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalMaxHp' },
```

约束：

- **新的基础倍率不得加入 `BuildScalingAxis`**，否则会被 `BUILD_SCALING_RULES`、`scaleEffects`、`SURGE_AXES` 与标签缩放系统错误开放。
- `SURGE_AXES` 保持现有 10 个机制轴不变。
- 语义边界：`effectDamageMul` 只放大本卡的连锁/分裂/领域等衍生效果，**不能**代替 `damageMul`（后者提高炮台基础伤害）。

## 五、结算公式

装备态多条同名倍率**在一个乘区内相加**（`1 + Σ`），不逐条连乘。理由：与机制轴的 `(1 + total)` 语义一致；3 个装备位 × 每卡 2 条词条 = 最多 6 条，若伤害与射速双乘区各自连乘，DPS 极易指数化。

```
最终基础伤害 = ( config.damage + state.damageBonus + runBaseStats.damageAdd + statBuff加法 )
              × ( 1 + Σ 已装备 damageMul )
              × statBuff乘法

最终射速   = ( config.fireRate + state.fireRateBonus + runBaseStats.fireRateAdd + statBuff加法 )
              × ( 1 + Σ 已装备 fireRateMul ) × statBuff乘法

永久射程基数 = config.range + config.range × state.rangeBonus + runBaseStats.rangeAdd
有效战斗射程 = min( maxAttackRange(),
                    ( 永久射程基数 + statBuff加法 ) × ( 1 + Σ 已装备 rangeMul ) × statBuff乘法 )

最终最大生命 = state.baseMaxHp × ( 1 + Σ 已装备 maxHpMul ) + statBuff的 maxHpAdd
```

`totalMulti` 保持原样（本期不做 `multiMul`），但需去掉已恒为 0 的 `equipmentAffixAdd.multiAdd` 项。

数值示例（写进测试）：`config.damage 18` + `runBaseStats.damageAdd 4`，两件装备 `+10%` / `+5%` → `(18 + 4) × 1.15 = 25.3`。**不是** `18 × 1.10 × 1.05 + 4`，也**不是** `(18+4) × 1.10 × 1.05 = 25.41`。

### 实现要点

- `src/core/systems/cardAffixSystem.ts`
  - 新增 `equipmentAffixMul(state, stat: CardBaseStatMulKind): number`，返回 `1 + Σ`；遍历方式沿用 `equipmentAffixAdd`（跳过 `provisional`，读 `runBuild.cardAffixRolls[card.type]`）。
  - **删除** `equipmentAffixAdd`、`RUN_BASE_STATS`、`isRunBaseAffix`。迁移完成后卡牌不可能再产出基础平加，该函数恒为 0。
  - `cardAffixScaling` 的过滤条件从 `isRunBaseAffix(roll.stat)` 改为**正向判定** `isBuildScalingAxis(roll.stat)`，只把 11 个机制轴喂给 `BuildScalingAxis` 通道；基础倍率必须被显式排除。
  - `affixOperation(stat: CardAffixStatKind)` 收窄签名。
- `src/core/effects/interpreter.ts`：`Modifiers.equipmentAffixAdd` 整体替换为 `equipmentAffixMul: Record<CardBaseStatMulKind, number>`。
- `src/core/stats.ts`：新增导出 `permanentRange(state, config)`；四个 total 按上表插入乘区，移除全部 `equipmentAffixAdd.*` 引用。
- `reconcileMaxHp` 必须在**装备 / 卸下 / 替换 / 消耗激活 / Buff 刷新 / Buff 到期**六个时机全部触发。沿用现有"保持绝对已损生命值"规则（上限 100 当前 70 → 装备后上限 110 当前 80 → 卸下回到 100/70），保证装备切换可逆、不凭空刷血。

## 六、射程封顶口径修复

`src/core/systems/waveRewardSystem.ts` 的 `rangeIsCapped` 改为只看**永久射程基数**：

```ts
function rangeIsCapped(state: GameState): boolean {
  return permanentRange(state, defaultRuntimeConfig()) >= maxAttackRange();
}
```

`grantFloorRewards`（floor 跳过 `floorRange`）与 `buildWaveChoiceMenu`（choice 禁选 `optRange`）共用该判定。修复后：临时装备或 `buildSurge` 把有效射程顶到上限**不再**吞掉永久 `rangeAdd`。

## 七、数据迁移（`src/config/base/skills.json`：60 卡 / 180 候选 / 每卡 count = 2）

### RNG 中立性约束（最重要，先读）

`weightedCandidate` 与 `rollIndex` 各消耗恰好一次 `rng()`，与 `min/max/step` **无关**。因此只要满足下面三条，整局 RNG 调用序列与抽取结果的**索引分布**完全不变，回放差异被严格隔离在词条数值本身，敌人生成、掉落、配方等下游随机不会漂移：

1. **不增删候选**，每张卡 `candidates` 数组长度、顺序、`weight`、`affixPool.count` 全部保持不变。
2. **桶数保持不变**：`floor((max-min)/step + 1e-9) + 1` 与迁移前逐条相等。
3. `consumableDuration` 原样保留。

这也是 §二.7 决定"`rangeMul` 本期不铺候选"的原因——新增候选会破坏第 1 条。

### 换算表

参考时点 = **第 5 波中位永久基数**（floor 已结算 5 次；choice 5 次按 5 个选项均分，每项期望命中 1 次）：

| 属性 | 参考基数推导 | 参考基数 |
|---|---|---|
| 伤害 | `18 + floor 1×5 + choice 2×1` | **25** |
| 射速 | `5 + choice 0.15×1` | **5.15** |
| 最大生命 | `100 + choice 10×1` | **110** |
| 射程（仅备查，本期不铺） | `150 + floor 4×5 + choice 8×1` | **178** |

逐条换算（`新值 = 旧值 ÷ 参考基数`，取整到保持桶数的 step）：

| 旧 | 旧值域 / 桶数 | 精确换算 | 新 | 新值域 / 桶数 | 条数 |
|---|---|---|---|---|---|
| `damageAdd` | 1~3 step 1 / 3 桶 | 4% / 8% / 12% | `damageMul` | **0.04~0.12 step 0.04** / 3 桶 | 24 |
| `fireRateAdd` | 0.1~0.25 step 0.05 / 4 桶 | 1.94% / 2.91% / 3.88% / 4.85% | `fireRateMul` | **0.02~0.05 step 0.01** / 4 桶 | 12 |
| `maxHpAdd` | 5~15 step 5 / 3 桶 | 4.5% / 9.1% / 13.6% | `maxHpMul` | **0.05~0.15 step 0.05** / 3 桶 | 13 |

`step 0.04` 的不美观是**有意的**——它是保持 3 桶且逐档等价的唯一选择，不要"顺手"改成 0.05。

**不得**直接改后缀：旧 `damageAdd: 2` 写成 `damageMul: 2` 会变成 +200%。

在 PR 说明里明确记录：倍率会持续放大后续 wave 平加，因此中后期一定强于"波 0 等价换算"。这是**有意的协同**（wave 扩大基数、卡牌放大基数），也是本次改动的目的；具体强度以固定 seed 回放对照后单独标定。

### 迁移后自检

- `affixPool` 中 `damageMul` 24 / `fireRateMul` 12 / `maxHpMul` 13 = **49**；`rangeMul` **0**
- 基础平加在 `affixPool` 中为 **0** 条
- 机制轴候选仍 **131** 条，总候选仍 **180** 条，含 `affixPool` 的卡仍 **60** 张，每卡 `count` 仍为 **2**
- `skills.json` 版本从 `0.5.0` 升至 `0.6.0`，`skillValidator` 同步

## 八、校验器硬禁令

- `skillValidator.ts` 的 `CARD_STATS` 继续派生自 `Object.keys(AFFIX_SINKS)`——收紧 `AFFIX_SINKS` 后自动生效。
- 额外加一条**显式且带解释的**拒绝分支，让未来误写基础平加时报错可读：
  ```
  `${path}.stat`: 基础属性平加由 waveRewards 独占，卡牌词条请使用 damageMul/fireRateMul/rangeMul/maxHpMul
  ```
- `validateAffixSink` 的 `equipment === 'global'` 分支已要求 `min > 0`，倍率天然满足，无需改动。
- `src/config/validateAll.ts` 遍历 `AFFIX_SINKS` 的那段（`AFFIX_SINKS.${stat}` 系列报错）需确认在键变化后仍成立。
- `src/config/godValidator.ts` 的 `WAVE_CHOICE_STATS` / `REQUIRED_WAVE_CHOICE_STATS` / `BUILD_SCALING_AXES` **全部保持不变**——波末仍是五选一平加 + `xpGainPct`，机制轴仍是 11 项。

## 九、文案与 UI

`src/data/texts.json` 的 `affixes.stats` 与 `affixHelp`、`src/editor/labels.ts`：删除 6 条基础平加、新增 4 条基础倍率。措辞必须能与机制轴区分：

- `damageMul` → "基础伤害 +8%"，**不能**简称"伤害 +8%"
- `fireRateMul` → "基础射速 +3%"
- `rangeMul` → "基础射程 +5%"
- `maxHpMul` → "基础生命上限 +10%"
- `effectDamageMul` → 保持"本卡效果伤害 +10%"

其他：

- `src/design/cardView.ts` 文案改为"每局每卡型随机抽 N 条"（现状描述错误，见 §三）。
- `src/ui/cardDetailModel.ts` 的 `GLOBAL_CONSUMERS` 补 `totalRange` / `totalMaxHp` 键；`affixAmount` 的 `endsWith('Mul')` 百分比逻辑可直接复用，不必改。
- `src/design/crossViews/affixCoverage.ts` 与 `src/design/mechanismEditor.ts` 自动跟随 `AFFIX_SINKS`；该视图原有"遗物效果数"列在遗物删除后已恒为 0，本次顺手把该列改为"限时来源"或直接移除，避免误导。
- `src/telemetry/types.ts`、`src/ui/intermissionPanel.ts` 仍按 `RunBaseStatKind` 渲染波末奖励，**不需要改**（波末仍是平加）。

## 十、测试

主战场是 `tests/vitalStatSystem.test.ts`（已 import `AFFIX_SINKS`、`reconcileMaxHp`、`totalMaxHp`、`applyRunBaseReward`、`applyBuildScalingToBindings`、`moveOrSwap`、`consumeCard`，是最合适的落点）。

新增 / 改写：

1. **结算顺序**：`(18 + 4) × 1.15 = 25.3`；断言不等于 `18 × 1.10 × 1.05 + 4`，也不等于 `(18+4) × 1.10 × 1.05`。
2. **同乘区相加**：三条 `damageMul` `0.1/0.15/0.2` → 乘区 `1.45`，断言不是 `1.518`。
3. **装备/卸下对称性**：装备再卸下后乘区精确回到 `1`（防浮点累减残留）。
4. **装备态与消耗态互不污染**：装备 `Σ` 与 `statBuff` / 消耗态的 `Π` 并存时结果符合 §五 公式。
5. **`maxHpMul` 对账**：装备 → 上限升高且已损生命绝对量不变；卸下 → 精确回到原值；限时 buff 到期同理（走 `tickStatModifiers`）。
6. **射程封顶口径**：装备一张把有效射程顶到 `maxAttackRange()` 的卡后，波末 `floorRange` **仍结算**、`optRange` **仍可选**；只有永久基数触顶时才跳过。这是本次修复的核心回归用例，应加在 `tests/waveRewardSystem.test.ts` 与 `tests/waveBaseRewardChoice.test.ts`。
7. **校验器拒绝**：`affixPool` 写入 `damageAdd` 必须抛出 §八 的中文错误。
8. **`RuntimeStatKind` 边界**：`statBuff` 仍可使用 `damageAdd`，且不因 `CardStatKind` 收窄而失效；`SURGE_AXES` 仍只推 10 个机制轴。
9. **必然连带失败、必须同步**：`tests/vitalStatSystem.test.ts:167`（`Object.keys(AFFIX_SINKS)` 键集断言）、`tests/textCoverage.test.ts:32`（`affixHelp` 覆盖 `AFFIX_SINKS` 全键）、`tests/cardAffixSystem.test.ts`、`tests/buildModifierSystem.test.ts`、`tests/configXlsxRoundtrip.test.ts`、`tests/editorLabels.test.ts`、`tests/cardDetailModel.test.ts`、`tests/designViews.test.ts`、`tests/godConfig.test.ts`。
10. **黄金回放基线重录**（`scripts/recordGoldenReplay.ts`）。重录前先确认差异只出现在词条数值与其下游属性上；**若敌人生成序列也漂移，说明 §七 的三条 RNG 中立性约束被破坏，必须回查而不是直接重录**。

## 十一、提交顺序

按此顺序分步提交，每步保持 `npm run test` 绿（第 1~3 步类型与数据互相依赖，可合并为一次提交）：

1. 类型与契约：`types.ts` / `defs.ts` / `atomContract.ts` / `affixSinks.ts`。
2. 结算实现：`cardAffixSystem.ts` / `interpreter.ts` / `stats.ts`（含新增 `permanentRange`）。
3. 数据迁移：`skills.json` 的 49 条候选 + 版本号 `0.6.0`。
4. 射程封顶口径修复：`waveRewardSystem.ts`。
5. 校验器硬禁令 + 文案 / 标签 / 设计工作台文案更正。
6. 测试补全与连带修复。
7. 回放基线重录 + `docs/` 说明更新（把"实例级随机""合成会覆盖词条""遗物提供 damageAdd"这类错误表述一并改掉）。

## 十二、验收

- [ ] `npm run test`、`npm run build` 全绿
- [ ] `grep -c '"damageAdd"\|"fireRateAdd"\|"rangeAdd"\|"multiAdd"\|"maxHpAdd"' src/config/base/skills.json` 结果为 0
- [ ] `affixPool` 统计：基础倍率 49 条（24/12/13）、机制轴 131 条、总计 180 条、60 张卡、每卡 count = 2
- [ ] 每卡候选顺序与 weight 与迁移前逐条一致；每条候选桶数与迁移前逐条一致
- [ ] 波末五选一仍为 `damageAdd / fireRateAdd / maxHpAdd / rangeAdd / xpGainPct`；`SURGE_AXES` 仍为 10 个机制轴
- [ ] 装备射程卡后走完一局，波末射程成长不再被吞
- [ ] 黄金回放差异只落在词条数值及其下游属性，敌人生成序列零漂移
- [ ] PR 说明附：49 条候选的新旧对照表 + 固定 seed 回放在第 5 / 10 波的 `totalDamage`、`baselineDps`、`totalRange`、`totalMaxHp` 新旧对照

## 十三、git 雷区（动手前必读）

- 基准 = 本地 `main` `e6b23fd`。**本地 `main` 与 `origin/main` 已分叉**，禁止 `git pull` / `merge origin/main` / `rebase origin/main`。
- 工作树长期有 **CRLF 噪音**：`git diff --shortstat` 显示约 192 文件 / 8.2 万行，而 `--ignore-all-space` 只有 1 个文件是真实改动。**任何提交前先确认 `git diff --ignore-all-space --stat` 的范围**，否则 diff 与回放归因全废。建议顺手补 `.gitattributes`（`* text=auto eol=lf`）——仓库当前没有这个文件。
- 不要碰 `stash@{0..2}`，其中存着别的任务的 prompt 原件。
- 不要碰陈旧引用 `archive/pre-reward-meter-2026-07-30`、`archive/pre-reward-meter-v4`、`origin/refactor/reward-meter`。
- 建议在新分支 `refactor/affix-base-stat-mul` 上做，不 push、不合并，完工出报告。
