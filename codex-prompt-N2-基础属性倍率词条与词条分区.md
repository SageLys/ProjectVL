# Codex 任务 N2：基础属性词条分区（wave 独占平加 / 卡牌只给倍率）

> 一句话规则：**`waveRewards` 独占基础属性的永久平加；`affixPool` 对基础属性只能给倍率；`relics` 继续只用 11 个 `BuildScalingAxis`。**
> 本任务是一次**明确的规则升级 + 数据迁移**，不是补字段。现有测试全绿说明旧行为已被契约锁定，因此必须同步改类型、公式、校验器、41 张卡配置与回放基线。
> 行号仅供导航，以符号名为准。结束时 `npm run test` 与 `npm run build` 全绿。

---

## 一、目标

1. 新增基础属性倍率词条类型 `damageMul / fireRateMul / rangeMul / maxHpMul`，作为卡牌词条对炮台基础属性的**唯一**作用方式。
2. 把 `RunBaseStatKind`（6 项平加）**移出**卡牌词条值域，校验器硬禁止 `affixPool` 再出现基础平加。
3. 迁移 `skills.json` 中现存的 **44 条基础 Add 候选**（`damageAdd` 22 / `fireRateAdd` 9 / `maxHpAdd` 8 / `rangeAdd` 4 / `multiAdd` 1）。
4. 顺带修复**射程封顶口径 bug**：当前波末 `rangeAdd` 的触顶判定包含装备态与限时倍率，会造成永久成长被静默跳过且不可补回。
5. 拆开 `RuntimeStatKind` 与 `CardStatKind` 的自动超集关系，避免新增卡牌专用词条时被无意开放给所有 `statBuff`。

## 二、硬性不变量 / 明确不做

1. **三套成长的获得入口、存储与生命周期保持独立**，不合并。`waveRewards` → `runBaseStats`；`affixPool` → `runBuild.cardAffixRolls`；`relics` → `relicStacks`。
2. **保留现有 79 条机制类词条**（`effectDamageMul` / `controlPotencyMul` 等 11 个 `BuildScalingAxis`）。卡牌与遗物在机制轴上共享落点与叠加公式，这是**刻意设计**，不改。
3. **不做实例级词条**。维持"每局每卡型一份随机模板"，`CardFusionPolicyDef` 继续保持惰性占位。
4. **不做 `multiMul`**：同发数是离散量，`combatSystem.ts:224` 的弹道循环按 `for (i < multi)` 截断、而 :211 迫击炮把 `totalMulti` 当连续伤害倍率，两处语义不一致。
5. **不做 `healMul`**：`heal` 是一次性结算（`settlement: 'instant'`、`equipment: 'unsupported'`），不是常驻基础属性。
6. **不趁机加强数值**。本次按等价换算落地，标定留到回放对照之后的独立 PR。
7. 不改 `AtomName` / `Trigger` / `BuildTag` 枚举，不改遗物配置结构。
8. 波末奖励"触顶则跳过/禁选"的语义保持不变，只改**判定口径**；不实现"只结算剩余差值"。

## 三、现状（已逐条核实，含对旧文档的更正）

| 位置 | 事实 |
|---|---|
| `src/core/systems/cardAffixSystem.ts:47` `ensureAffixTemplate` | 词条是**每局每卡型一份模板**，不是实例级。首次遇到某卡型时掷点写入 `state.runBuild.cardAffixRolls[type]`，之后所有同型卡复制该模板 |
| `Card.affixes` | 仅为显示副本。结算路径 `equipmentAffixAdd` / `cardAffixScaling` 一律读卡型模板 |
| 合成 / 喂养 / 配方进化 | **不会重掷或覆盖词条**。全仓库只有 `ensureAffixTemplate` 写 `cardAffixRolls` |
| `src/design/cardView.ts:179` | 文案"每次实例随机抽 N 条"**是错的**，需一并更正为"每局每卡型随机抽 N 条" |
| `src/config/types.ts:255` `BuildScalingAxis` | 11 项；`RelicBuildEffect.axis` 只接受这 11 项，**遗物无法配置 `damageAdd`** |
| `src/config/types.ts:356` | `CardStatKind = RunBaseStatKind \| BuildScalingAxis`——卡牌是唯一横跨两套词汇表的系统 |
| `src/core/systems/buildModifierSystem.ts:91` | 遗物 + 卡牌机制词条 + 限时 `statBuff` 三者在此**相加后共同改写同一原子参数**——同名轴不只是词汇复用 |
| `src/core/systems/waveRewardSystem.ts:51` `rangeIsCapped` | 调用 `totalRange()`，其中含 `equipmentAffixAdd.rangeAdd` 与 `modifierTotal.mul`。**装备把有效射程顶到上限 → 波末永久 `rangeAdd` 被跳过 → 卸下装备后成长永久丢失** |
| `src/core/systems/waveSystem.ts:127` `finishWave` | 最后一波直接 `endGame`，不进 `beginIntermission`，终局波无 waveRewards |
| `src/core/systems/cardAffixSystem.ts:143` `activateConsumableAffixes` | **消耗态已原生支持乘法**：`value: contract.operation === 'mul' ? 1 + roll.value : roll.value` |
| `src/core/systems/runtimeStatModifierSystem.ts` | `modifierTotal` 已返回 `{add, mul}`，`mul *= value`（连乘） |
| `src/core/stats.ts:14-95` | `totalDamage/FireRate/Multi/Range` 已是 `(Σ加法) × modifier.mul` 形状 |
| `src/core/systems/cardAffixSystem.ts:105` `equipmentAffixAdd` | **装备态只有加法出口**，`Modifiers.equipmentAffixAdd: Record<RunBaseStatKind, number>`。这是本任务唯一真正缺失的一环 |
| `src/config/skillValidator.ts:12` | `CARD_STATS = new Set(Object.keys(AFFIX_SINKS))`——已是单一来源，收紧 `AFFIX_SINKS` 的键即自动收紧校验 |
| `src/ui/cardDetailModel.ts:204` `affixAmount` | 已按 `stat.endsWith('Mul')` 渲染百分比，新命名可零改动复用 |
| `src/core/effects/runtime.ts:206` `tickStatModifiers` | 限时 modifier 到期时对 `maxHpAdd` 调 `reconcileMaxHp` |
| `src/core/systems/equipmentSystem.ts:22/84/100` | 装备 / 卸下 / 替换路径均已调 `reconcileMaxHp`，`maxHpMul` 可安全接入 |

## 四、类型契约

`src/config/types.ts`：

```ts
/** waveRewards 独占：基础属性的永久平加。卡牌词条不得使用。 */
export type RunBaseStatKind = 'damageAdd' | 'fireRateAdd' | 'rangeAdd' | 'multiAdd' | 'maxHpAdd' | 'heal';

/** 卡牌词条独占：基础属性的倍率。遗物与波末奖励不得使用。 */
export type CardBaseStatMulKind = 'damageMul' | 'fireRateMul' | 'rangeMul' | 'maxHpMul';

/** 卡牌词条的完整值域：基础倍率 + 11 个构筑机制轴。 */
export type CardAffixStatKind = CardBaseStatMulKind | BuildScalingAxis;

/** @deprecated 过渡别名，迁移完成后删除所有引用 */
export type CardStatKind = CardAffixStatKind;
```

`src/core/effects/defs.ts` —— **不要**继续写成 `CardStatKind | 'damage' | 'fireRate'`，显式列全：

```ts
export type RuntimeStatKind =
  | RunBaseStatKind          // statBuff 仍可临时给平加
  | CardBaseStatMulKind
  | BuildScalingAxis
  | 'damage' | 'fireRate';
```

`src/core/effects/atomContract.ts` 的 `RUNTIME_STAT_KINDS` 同步补 4 项（`RuntimeStatKindsExhaustive` 断言会主动报错提醒）。

`src/config/affixSinks.ts` 改为 `Record<CardAffixStatKind, AffixSinkContract>`，**删除** `damageAdd/fireRateAdd/rangeAdd/multiAdd/maxHpAdd/heal` 六条，新增：

```ts
damageMul:   { operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalDamage' },
fireRateMul: { operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalFireRate' },
rangeMul:    { operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalRange' },
maxHpMul:    { operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalMaxHp' },
```

约束：**新的基础倍率不得加入 `BuildScalingAxis`**，否则会被 `RelicBuildEffect.axis`、`BUILD_SCALING_RULES` 与标签缩放系统错误开放。
另注意语义边界：`effectDamageMul` 只放大本卡的连锁/分裂/领域等衍生效果，**不能**代替 `damageMul`（后者提高炮台基础伤害）。

## 五、结算公式

装备态多条同名倍率**在一个乘区内相加**（`1 + Σ`），不逐条连乘。理由：与遗物 `BuildScaling` 的 `(1 + total)` 语义一致；3 个装备位最多带来 6 条词条，若伤害与射速双乘区各自连乘，DPS 极易指数化。

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

技能伤害链路保持不变：`最终技能伤害 = 最终基础伤害 × 技能 damageRatio × (1 + 遗物机制轴 + 本卡机制词条 + 限时机制增量)`。

数值示例（写进测试）：`config.damage 18` + `runBaseStats.damageAdd 4`，两件装备 `+10%` / `+5%` → `(18 + 4) × 1.15 = 25.3`。**不是** `18 × 1.10 × 1.05 + 4`。

### 实现要点

- `src/core/systems/cardAffixSystem.ts`
  - 新增 `equipmentAffixMul(state, stat: CardBaseStatMulKind): number`，返回 `1 + Σ`；遍历方式沿用 `equipmentAffixAdd`（跳过 `provisional` 卡，读 `runBuild.cardAffixRolls[card.type]`）。
  - **删除** `equipmentAffixAdd` 与 `RUN_BASE_STATS` / `isRunBaseAffix`。迁移完成后卡牌不可能再产出基础平加，该函数恒为 0。
  - `cardAffixScaling` 的过滤条件从 `isRunBaseAffix(roll.stat)` 改为**正向判定** `isBuildScalingAxis(roll.stat)`，只把 11 个机制轴喂给 `BuildScalingAxis` 通道。
- `src/core/effects/interpreter.ts`：`Modifiers.equipmentAffixAdd` 整体替换为 `equipmentAffixMul: Record<CardBaseStatMulKind, number>`。
- `src/core/stats.ts`：新增导出 `permanentRange(state, config)`；四个 total 函数按上表插入乘区。
- `reconcileMaxHp` 必须在**装备 / 卸下 / 替换 / 消耗激活 / Buff 刷新 / Buff 到期**六个时机全部触发。沿用现有"保持绝对已损生命值"规则（上限 100 当前 70 → 装备后上限 110 当前 80 → 卸下回到 100/70），保证装备切换可逆、不凭空刷血。

## 六、射程封顶口径修复

`src/core/systems/waveRewardSystem.ts` 的 `rangeIsCapped` 改为只看**永久射程基数**：

```ts
function rangeIsCapped(state: GameState): boolean {
  return permanentRange(state, defaultRuntimeConfig()) >= maxAttackRange();
}
```

`grantFloorRewards`（floor 跳过）与 `buildWaveChoiceMenu`（choice 禁选）共用该判定。修复后：临时装备把有效射程顶到上限**不再**导致永久 `rangeAdd` 被吞掉。

## 七、数据迁移（`src/config/base/skills.json`，41 张卡 / 123 条候选）

### 换算规则

以**第 5 波中位永久基数**为参考时点换算，`新 min/max = 旧 min/max ÷ 参考基数`，向 `step` 就近取整：

| 属性 | 参考基数推导 | 参考基数 | 旧值域 | 目标百分比 | 建议 step |
|---|---|---|---|---|---|
| 伤害 | `18 + floor 1×5 + choice 2×1` | **25** | 1 ~ 4 | 4% ~ 16% | 0.02 |
| 射速 | `5 + choice 0.15×1` | **5.15** | 0.05 ~ 0.3 | 1% ~ 6% | 0.01 |
| 射程 | `150 + floor 4×5 + choice 8×1` | **178** | 4 ~ 15 | 2% ~ 8% | 0.01 |
| 最大生命 | `100 + choice 10×1` | **110** | 5 ~ 15 | 4% ~ 14% | 0.02 |

**不得**直接改后缀：旧 `damageAdd: 2` 写成 `damageMul: 2` 会变成 +200%。

同时明确记录在 PR 说明里：倍率会持续放大后续 wave 平加，因此中后期一定强于"波 0 等价换算"。这是**有意的协同**（wave 扩大基数、卡牌放大基数），也是本次改动的目的；具体强度以固定 seed 回放对照后单独标定。

### 迁移约束

- **保持每张卡的 `candidates` 数组顺序、`weight`、`count` 不变。** `weightedCandidate` 与 `rollIndex` 各消耗一次 `rng()`，**与 `min/max/step` 无关**，因此保持顺序与权重即可保证 RNG 调用序列不变，回放差异被隔离在词条数值本身、不会污染敌人生成等下游随机。
- `consumableDuration` 原样保留。
- **`multiAdd` 单独处理**：仅 `arcSplitter` 一条（`weight 0.25, min/max 1`）。该卡含 `split` 与 `ricochet` 原子，替换为 `quantityAdd`（`min 0.05, max 0.1, step 0.05`，与仓库既有 `quantityAdd` 候选一致），**不要**机械改成 `multiMul`。
- `heal` 未在任何 `affixPool` 中出现，无需迁移，但 `applyRunBaseReward` 与 `godValidator` 的波末白名单继续保留 `heal`。
- 迁移后自检：`affixPool` 中 `CardBaseStatMulKind` 候选数应为 **43**（22+9+8+4），`quantityAdd` 从 1 增至 2，总候选数仍为 **123**，含 `affixPool` 的卡仍为 **41**。
- `skills.json` 版本从 `0.5.0` 升至 `0.6.0`，`skillValidator` 同步。

## 八、校验器硬禁令

`src/config/skillValidator.ts`：

- `CARD_STATS` 继续派生自 `Object.keys(AFFIX_SINKS)`——收紧 `AFFIX_SINKS` 键后自动生效。
- 额外加一条**显式且带解释的**拒绝分支，让未来误写基础平加时报错可读：
  ```
  `${path}.stat`: 基础属性平加由 waveRewards 独占，卡牌词条请使用 damageMul/fireRateMul/rangeMul/maxHpMul
  ```
- `validateAffixSink` 的 `equipment === 'global'` 分支已要求 `min > 0`，倍率天然满足，无需改动。
- `src/config/godValidator.ts` 的 `BUILD_SCALING_AXES` 保持 11 项不变（遗物不得使用基础倍率）；`WAVE_CHOICE_STATS` / `REQUIRED_WAVE_CHOICE_STATS` 保持不变。

## 九、文案与 UI

`src/data/texts.json` 的 `affixes.stats` 与 `affixHelp`、`src/editor/labels.ts`：删除 6 条基础平加、新增 4 条基础倍率。措辞必须能与机制轴区分：

- `damageMul` → "基础伤害 +10%"，**不能**简称"伤害 +10%"
- `fireRateMul` → "基础射速 +6%"
- `rangeMul` → "基础射程 +5%"
- `maxHpMul` → "基础生命上限 +8%"
- `effectDamageMul` → 保持"本卡效果伤害 +10%"

其他：

- `src/design/cardView.ts:179` 文案改为"每局每卡型随机抽 N 条"（现状描述错误，见 §三）。
- `src/ui/cardDetailModel.ts` 的 `GLOBAL_CONSUMERS` 补 `totalRange` / `totalMaxHp` 键；`affixAmount` 按 `endsWith('Mul')` 的百分比逻辑已可复用，无需改。
- `src/design/crossViews/affixCoverage.ts` 自动跟随 `AFFIX_SINKS`，只需确认新的 4 轴出现在表中且"遗物效果数"列为 0（预期行为，非缺陷）——若该视图会对 `relicCount === 0` 报警，需为基础倍率轴豁免。

## 十、测试

新增 / 改写：

1. **结算顺序**：`(18 + 4) × 1.15 = 25.3`，断言不等于 `18 × 1.10 × 1.05 + 4`。
2. **同乘区相加**：三条 `damageMul` `0.1/0.15/0.2` → 乘区 `1.45`，断言不是 `1.518`。
3. **装备/卸下对称性**：装备再卸下后乘区精确回到 `1`（防浮点累减残留）。
4. **装备态与消耗态互不污染**：装备 `Σ` 与 `statBuff` 的 `Π` 并存时结果符合公式。
5. **`maxHpMul` 对账**：装备→上限升高且已损生命值绝对量不变；卸下→精确回到原值；限时 buff 到期同理。
6. **射程封顶口径**：装备一张把有效射程顶到 `maxAttackRange()` 的卡后，波末 `rangeAdd` **仍然结算 / 仍可选**；只有永久基数触顶时才跳过。这是本次修复的核心回归用例。
7. **校验器拒绝**：`affixPool` 写入 `damageAdd` 必须抛出上述中文错误。
8. **`RuntimeStatKind` 边界**：`statBuff` 仍可使用 `damageAdd`，且不因 `CardStatKind` 收窄而失效。
9. 更新 `tests/cardAffixSystem.test.ts`（`run-scoped card affix templates`）、`buildModifierSystem.test.ts`、`configXlsxRoundtrip.test.ts`、`editorLabels.test.ts`、`cardDetailModel.test.ts`、`godConfig.test.ts` 中受影响的断言。
10. **黄金回放基线必须重录**（`scripts/recordGoldenReplay.ts`）。重录前先确认差异只出现在词条数值与其下游属性上；若敌人生成序列也漂移，说明 §七 的"顺序/权重不变"约束被破坏，需回查。

## 十一、提交顺序

按此顺序分步提交，每步保持 `npm run test` 绿：

1. 类型与契约：`types.ts` / `defs.ts` / `atomContract.ts` / `affixSinks.ts`（此时 `skills.json` 会校验失败，可暂用临时兼容开关或与第 3 步合并提交）。
2. 结算实现：`cardAffixSystem.ts` / `interpreter.ts` / `stats.ts`（含 `permanentRange`）。
3. 数据迁移：`skills.json` 44 条候选 + 版本号。
4. 射程封顶口径修复：`waveRewardSystem.ts`。
5. 校验器硬禁令 + 文案 / 标签 / 设计工作台文案更正。
6. 测试补全。
7. 回放基线重录 + `docs/` 中相关说明更新（尤其把"实例级随机""合成会覆盖词条"这类错误表述改掉）。

## 十二、验收

- [ ] `npm run test`、`npm run build` 全绿
- [ ] `grep -c '"damageAdd"\|"fireRateAdd"\|"rangeAdd"\|"multiAdd"\|"maxHpAdd"' src/config/base/skills.json` 结果为 0
- [ ] `affixPool` 中基础倍率候选 43 条、`quantityAdd` 2 条、总候选 123 条
- [ ] 遗物配置无任何基础倍率轴；波末五选一仍为 `damageAdd/fireRateAdd/maxHpAdd/rangeAdd/xpGainPct`
- [ ] 装备一张射程卡后走完一局，波末射程成长不再被吞
- [ ] PR 说明附：44 条候选的新旧对照表 + 固定 seed 回放的关键指标（第 5 / 10 波的 `totalDamage`、`baselineDps`、`totalRange`）新旧对照
