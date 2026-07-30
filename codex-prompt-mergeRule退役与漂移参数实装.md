# Codex 任务：`mergeRule` 退役 + 两个专用原子实装 + 参数漂移消费端补齐

> 背景见 `docs/效果原子参数契约_落地记录.md` §4「核对中暴露的既有漂移」。
> 本任务分三阶段，**阶段 1 零行为变化，阶段 2/3 有明确行为变化并需重录黄金回放**。
> 行号仅供导航，以符号名为准。每阶段结束时 `npm run test` 与 `npm run build` 必须全绿。
> **阶段之间请分别提交（3 个 commit），不要合并成一个大 diff。**

---

## 零、已核实的现状（不要重新调查，直接用）

### `mergeRule` 是一条断路桩

| 段 | 状态 | 位置 |
|---|---|---|
| 类型 | ✅ `AtomName` 含 `mergeRule`；`EffectParamsMap.mergeRule = { rule?: 'wildcardDrop'\|'refundChance'; value?: number; chance?: number }` | `src/core/effects/defs.ts:40,90` |
| 契约 | ✅ `rule` enum 默认 `''`（**枚举外的值**）、`value` 默认 0、含 `...CHANCE`、`allowedTriggers: 'any'`、`modifierOnly: true` | `src/core/effects/atomContract.ts:412` |
| 执行器 | ⚪ `noopModifier`；在 `NOOP_MODIFIER_ATOMS` 中 | `src/core/effects/registry.ts:519,189` |
| 聚合 | ✅ `getModifiers()` push 进 `m.mergeRules[]`；在 `MODIFIER_ATOMS_HANDLED` 中 | `src/core/effects/interpreter.ts:480,41,399` |
| **消费** | ❌ **不存在**。`mergeRules` 全项目仅 3 处：类型定义、初始化、push | — |

补充事实：

1. `src/config/base/skills.json` 当前 41 张卡，**0 张使用 `mergeRule`**。
2. `allowedTriggers: 'any'` + `getModifiers()` 不检查 `binding.trigger === 'passive'` ⇒ 把它挂在 `onHit`/`interval` 下也会被永久聚合，触发时又是 noop。这是契约漏洞，新原子不得复制。
3. `rule` 是 enum 但默认值是枚举外的 `''`：漏写 `rule` 合法（校验器只拦 `required`），显式写 `''` 反而报错。这也是契约漏洞。
4. `chance` 在 passive 聚合路径**根本不掷骰**——`runEffects()` 的通用概率闸门只作用于触发式执行。
5. 唯一活体是 `tests/effectInterpreter.test.ts:188`（注释「P5 万能卡建模前置」），只断言"能被聚合出来"。
6. `docs/S0_差距盘点报告.md:59` 把它归在 S5，但 S5 内容（五神 35 卡 + 6 张配方卡）已落地，`resonance` 已删除，万能卡改为独立资源。**该归属已是历史信息，不得再以"未来 S5 会完成"解释。**

### `commitMerge()` 混合了四种结算域

`commitMerge(state, config, rng, cardType, resultStar)`（`src/core/systems/cardSystem.ts:12`）当前只做三件事：计数、写 `CardTypeRunStats`、`fireTrigger('onMerge')`。四个调用点语义完全不同：

| 调用点 | 语义 |
|---|---|
| `cardSystem.ts:57` `autoMergeCards()` | 手牌内同型同星自动合并 |
| `equipmentSystem.ts:18` `feed()` | 装备喂养升星 |
| `wildcardSystem.ts:54` `useWildcardOnSlot()` | **万能卡升星** |
| `recipeEvolutionSystem.ts:123` `commitRecipe()` | 两种不同材料的配方进化 |

**任何"合成时给奖励"的机制都必须按调用点白名单控制，否则万能升星会自返还、配方进化会意外拿奖励。**

### 万能卡现有基建

- 独立库存：`state.wildcards[star]`，`grantWildcards(state, grants)`（`src/core/systems/wildcardSystem.ts:24`）**直接入库存**，且静默丢弃 `star < 1 || star >= maxStar || count <= 0` 的项。
- 地面掉落：`spawnWildcardDrop(state, x, y, star, count, lifetime)`（`src/core/systems/dropSystem.ts:45`），`drop.kind === 'wildcard'`。
- **Bounty 基线奖励**：`encounter.wildcardStar` / `encounter.wildcardCount` 在 `createOffer()` 时冻结（`bountySystem.ts:168-172`），完成时在 `notifyBountyMemberKilled()` 里 `spawnWildcardDrop`（`bountySystem.ts:317-321`），并参与 `visualDropCount` 的扇形布点。
- **波末 Boss 基线奖励**：`computeWaveBossReward(wave)` 返回 `WildcardGrant[]`，`grantWaveBossReward()` 逐条 `spawnWildcardDrop`（`waveBossSystem.ts:21,84-90`）。另有 `plan.validation.bossReward` 分支，可能是 `kind: 'card'`（不是万能卡）。
- `wildcardsGranted` 事件的 toast 当前固定返回 `T.testWildcards`（DEV 文案），**没有按实际 grants 格式化**（`src/ui/eventText.ts:73`）。
- 万能卡库存计入最终结算分：`settlement.ts` 的 `score.wildcards`。

### 参数漂移清单的当前真实状态（`落地记录.md` §4 部分已过期）

| 项 | 文档说法 | **实际核查结果** |
|---|---|---|
| `taunt.priorityWeight` | "`applyTaunt` 不读取" | ❌ **文档已过期**。已实装：`statusSystem.ts:181-183` 按 `priorityWeight > remaining > sourceKey` 仲裁，契约 note 也已更新。本次只需订正文档。 |
| `summon.priorityWeight` | — | ✅ 已消费（`enemySystem.ts:157`） |
| `summon.fireInterval` | "3 处声明，运行时从不消费" | ✅ 属实。3 处**全在 `sentinel` 卡的 `mirrorTurret`**：`skills.json:10676` = 0.35、`:10748` = 0.5、`:10866` = 0.35。运行时硬编码 `s.fireCd = 0.7`（`runtime.ts:117`）/ orbital `0.25`（`runtime.ts:141`）。契约**未声明 default**。`effectText.ts:224` 已经把 `fireInterval` 显示给玩家 ⇒ **UI 现在在说谎**。 |
| `groundZone.shape: 'line'` | "1 处声明，按 circle 结算" | ✅ 属实。唯一声明在 `flashfire` 卡（`skills.json:7821`），`Zone.shape` 只实现 `circle \| ring`。 |

### 会被打到的一致性测试（改动时必须同步）

- `tests/atomContract.test.ts:159` `expect(ATOM_NAMES).toHaveLength(33)`
- `tests/atomContract.test.ts:162` `modifierOnly` ⟷ `NOOP_MODIFIER_ATOMS` ⟷ `MODIFIER_ATOMS_HANDLED` 三方双向一致
- `tests/atomContract.test.ts:236` 「`stun` 之外的原子不声明 `chance` 默认值」
- `tests/atomContract.test.ts` 的 `PRE_MIGRATION_DEFAULTS` / `PRE_MIGRATION_RECORD_DEFAULTS` 冻结快照
- `tests/skillCompatibility.test.ts:86` 同上三方一致
- `tests/designDescribe.test.ts:57` 「每个原子都能被 `describeEffect` 翻成中文，label 不得等于原子名」
- `tests/editorLabels.test.ts:29` 「每个原子每个参数都有中文标签」
- `tests/editorContract.test.ts:32` 契约穷尽性
- `tests/textCoverage.test.ts` / `tests/textsCompleteness.test.ts`
- `tests/goldenReplay.test.ts` + `tests/golden/telemetry_session_seed42.json`

---

## 阶段 1：删除 `mergeRule`，新增两个专用原子（`mergeMaterialRefund` / `wildcardRewardBonus`）

### 1.1 硬性不变量

1. **不复活 `rule`/`value` 枚举**。历史上 `wildcardDrop` 与 `refundChance` 本就不属于同一消费点（前者是 Boss/Bounty 击杀掉落，消费者在 `dropSystem`；后者是合成返还），把它们绑在一个含糊的 `value` 上是原始设计错误。
2. `skills.json` 本阶段**不新增任何使用新原子的卡**。新原子先只有契约 + 消费端 + 测试，**行为零变化、RNG 零变化、黄金回放零变化**。
3. 新原子必须 `allowedTriggers: ['passive']`（不得用 `'any'`），`supports: { equip: true, consume: false }`，`modifierOnly: true`。
4. 新原子的所有 enum 参数**默认值必须落在枚举内**。
5. 概率参数**不得叫 `chance`**——`chance` 是 `runEffects()` 的通用闸门语义，而这两个原子走 `getModifiers()` 聚合路径、由消费端自行掷骰。用独立名字避免语义混淆（见下）。
6. `getModifiers()` 内**绝不掷骰**——它被属性/战斗/运行时高频查询，掷骰会让结果随查询次数变化。掷骰一律在消费端。

### 1.2 删除 `mergeRule` 的全部触点

逐一删除（**不要留 deprecated 残骸**）：

- `src/core/effects/defs.ts`：`AtomName` 联合项、`EffectParamsMap.mergeRule`
- `src/core/effects/atomContract.ts`：`ATOM_CONTRACT.mergeRule`；文件头注释「33 个原子」→ 「34 个原子」
- `src/core/effects/registry.ts`：`ATOMS.mergeRule`、`NOOP_MODIFIER_ATOMS` 中的 `'mergeRule'`
- `src/core/effects/interpreter.ts`：`MODIFIER_ATOMS_HANDLED` 中的 `'mergeRule'`、`Modifiers.mergeRules` 字段、初始化处的 `mergeRules: []`、`getModifiers()` 的 `case 'mergeRule'`、局部 `str()` helper（若删后无其他调用方则一并删）
- `src/editor/labels.ts:110-111`：`'mergeRule.rule'` / `'mergeRule.value'`
- `src/data/texts.json:4185`（原子短名）与 `:4242`（原子说明）
- `src/ui/effectText.ts:249` `case 'mergeRule'`
- `src/ui/cardDetailModel.ts:158`
- `docs/skills-schema.json`：`:102` 原子清单、`:290` `atomCatalog.mergeRule`、`:74` passive 说明里的「mergeRule」措辞
- `tests/atomContract.test.ts:122-123` 的两条冻结默认值
- `tests/effectInterpreter.test.ts:188-196` 整个 `it(...)`（该测试锚定的是"未实现原子能被聚合"，与新方向相反，**删除而非改写**）

### 1.3 新原子 A：`mergeMaterialRefund`

**语义**：普通同型合并 / 装备喂养完成时，有概率补贴若干张同型低星素材卡。

```ts
mergeMaterialRefund: {
  category: 'economy',
  params: {
    refundChance: { type: 'number', default: 0.25, min: 0, max: 1,
      note: '由 commitMerge 消费端掷骰；不是 runEffects 的 chance 闸门' },
    count:  { type: 'integer', default: 1, min: 1, max: 4, note: '单次返还张数' },
    star:   { type: 'integer', default: 1, min: 1, note: '返还素材星级；运行时再按 maxStar 夹紧' },
    scope:  { type: 'enum', default: 'merge', enum: ['merge', 'feed', 'both'],
      note: '生效的合成来源；万能升星与配方进化恒不返还' },
  },
  allowedTriggers: ['passive'],
  supports: { equip: true, consume: false },
  emitsEvents: false,
  modifierOnly: true,
},
```

**聚合**（`interpreter.ts` `getModifiers()`）：

```ts
mergeMaterialRefunds: { refundChance: number; count: number; star: number; scope: 'merge'|'feed'|'both' }[];
```

按 `orderedEquippedBindings(state)` 顺序 push（该顺序已被 `tests/fusionOrderInvariance.test.ts` 锁住装备槽顺序无关性，**不要引入依赖槽位下标的排序**）。**只在 `binding.trigger === 'passive'` 时 push**（对齐 `beamMorph`/`aura` 的现有写法）。

**消费端改造**：

1. `commitMerge()` 增加第 6 个参数 `kind: MergeKind`：

```ts
export type MergeKind = 'merge' | 'feed' | 'wildcard' | 'recipe';
```

四个调用点分别传 `'merge'`（`cardSystem.ts:57`）、`'feed'`（`equipmentSystem.ts:18`）、`'wildcard'`（`wildcardSystem.ts:54`）、`'recipe'`（`recipeEvolutionSystem.ts:123`）。

2. `commitMerge()` 末尾：
   - 若 `kind` 是 `'wildcard'` 或 `'recipe'` ⇒ **直接跳过，一次 rng 都不取**（保证零 RNG 漂移）。
   - 否则取 `getModifiers(state).mergeMaterialRefunds`，逐条按 `scope` 过滤（`'both'` 命中全部，`'merge'`/`'feed'` 精确匹配 `kind`），**过滤后为空则同样不取 rng**。
   - 每条命中的规则掷一次 `rng() < refundChance`，成功则把 `{ cardType, star: Math.min(star, resultStar - 1), count }` 推入 `state.pendingMergeRefunds`（新字段，`GameState` 上初始化为 `[]`）。
   - **不在此处发牌**。返还卡若立刻进手牌，会在 `autoMergeCards()` 的 `while` 循环中途重入合成循环。

3. 新增 `flushMergeRefunds(state, config, rng): GameEvent[]`（放在 `cardSystem.ts`）：把 `state.pendingMergeRefunds` 清空并逐条用 `createCardWithAffixes(state, rng, cardType, star)` 生成卡，填入 `state.cards` 的空槽。
   - **手牌无空槽** ⇒ 丢弃该张，累计到事件里。**不要生成地面掉落物**（会污染掉落导演的节拍与 `recordCardDropShown` 统计）。
   - 事件：`{ type: 'mergeRefunded', cardType, star, granted: number, lost: number }`，`granted === 0 && lost === 0` 时不发。

4. `autoMergeCards()`：在 `while (changed)` 循环**退出之后**调用 `flushMergeRefunds()`；若本次发出了新卡，再跑一轮合并循环，用 `const MAX_REFUND_ROUNDS = 4` 硬性封顶（超限则丢弃剩余待发并在 DEV 下 `console.warn`）。其余三个调用点（feed / wildcard / recipe）已各自在末尾调用 `autoMergeCards()` 或不需要发牌，无需额外接线——但请核对 `feed()` 路径：它**不调用** `autoMergeCards()`，需要在 `feed()` 末尾补一次 `flushMergeRefunds()` + `autoMergeCards()`。

5. `src/ui/eventText.ts` 增加 `mergeRefunded` 的动态文案（`granted`/`lost` 分支），文案键写进 `src/data/texts.json`。

### 1.4 新原子 B：`wildcardRewardBonus`

**语义**：在 Bounty / 波末 Boss 的**基线万能卡奖励之上额外增加 count 张**。**不进入 `commitMerge()`**。

```ts
wildcardRewardBonus: {
  category: 'economy',
  params: {
    bonusChance: { type: 'number', default: 1, min: 0, max: 1,
      note: '由奖励组装消费端掷骰；不是 runEffects 的 chance 闸门' },
    count: { type: 'integer', default: 1, min: 1, max: 3, note: '在基线奖励上额外增加的张数' },
    scope: { type: 'enum', default: 'both', enum: ['bounty', 'boss', 'both'] },
  },
  allowedTriggers: ['passive'],
  supports: { equip: true, consume: false },
  emitsEvents: false,
  modifierOnly: true,
},
```

聚合到 `Modifiers.wildcardRewardBonuses[]`，规则同 A（仅 `passive`，`orderedEquippedBindings` 顺序）。

**消费端**：

1. **Bounty**：在 `createOffer()` 组装 offer 时（`bountySystem.ts:168-172` 附近，`wildcardStar`/`wildcardCount` 计算处）就把 bonus 掷完并**冻结进 offer**，让 `bountyOffered` 的展示奖励与 `notifyBountyMemberKilled()` 的实际掉落完全一致。星级沿用已算出的 `wildcardStar`，**不引入新的星级参数**。
2. **Boss**：在 `grantWaveBossReward()` 的**非 validation 分支**（`waveBossSystem.ts:84-90`）里，对 `computeWaveBossReward()` 返回的 grants 追加 count。
   - `plan.validation` 分支：**仅当 `spec.kind !== 'card'`（即确实是万能卡奖励）时才加成**；`kind === 'card'` 时跳过，一次 rng 都不取。
   - `computeWaveBossReward()` 是纯函数（被 `tests/waveBossRewards.test.ts` 直接调用），**不要把 state 依赖塞进它**——加成写在 `grantWaveBossReward()` 里。
3. 发放形式沿用现有基线：**`spawnWildcardDrop()` 地面掉落，不是 `grantWildcards()` 入库存**。Bounty 侧注意 `visualDropCount` 的扇形布点：bonus 只增加同一堆的 `count`，不新增布点。
4. 若某来源基线 `count === 0` 且 bonus 命中 ⇒ 允许凭空产生一堆万能卡掉落（此时需要为 Bounty 的 `visualDropCount` 补上那一位）。请在实现里显式处理这个边界并写测试。
5. **无任何规则时不得读取 rng**（先判空列表再掷骰）。

### 1.5 顺带修掉的两个契约漏洞（对现有数据零影响）

- `getModifiers()` 的 `case 'beamMorph' / 'mortarMorph' / 'aura'` 已有 `binding.trigger === 'passive'` 检查，但 `dropRateMul`/`xpMul`/`thorns`/`expiryConvert` 等分支**没有**。本次**不要**顺手改这些（会改变现有卡行为），只需在 `MODIFIER_ATOMS_HANDLED` 上方补一条注释说明现状差异，并把结论记进 `docs/效果原子参数契约_落地记录.md`。
- 新原子的 enum 默认值必须在枚举内——在 `tests/atomContract.test.ts` 的「契约自洽」用例里**新增一条断言**：`若 spec.type 含 'enum' 且声明了 default，则 default 必须 ∈ spec.enum`。这条断言会同时防止 `mergeRule` 式的漏洞复发。

### 1.6 阶段 1 需要同步的测试与元数据

- `ATOM_NAMES` 长度 `33 → 34`
- `NOOP_MODIFIER_ATOMS` / `MODIFIER_ATOMS_HANDLED` 各减 `mergeRule`、各加两个新原子
- `tests/atomContract.test.ts` 的 `chance` 断言：新原子用的是 `refundChance`/`bonusChance`，**不会**触发那条规则——请确认无需放宽；若实现时误用了 `chance`，回头改名而不是放宽断言
- `PRE_MIGRATION_DEFAULTS`：删 `mergeRule.*` 两条，加新原子的数值/字符串默认值
- `src/editor/labels.ts`：新原子及其每个参数的中文标签（否则 `editorLabels.test.ts` / `designDescribe.test.ts` 会红）
- `src/data/texts.json`：新原子短名 + 说明；`mergeRefunded` 文案
- `src/ui/effectText.ts` / `src/ui/cardDetailModel.ts`：新原子的玩家可读描述
- `docs/skills-schema.json`：原子清单 + `atomCatalog` 条目；`SKILLS_SCHEMA_VERSION` 从 `0.4.1` 升到 `0.5.0`（`skillValidator.ts:22`），并同步 schema 文件里的版本号
- 重新生成配置手册：`node docs/manual-src/dumpContract.js > docs/manual-src/contract.json`，再按 `docs/manual-src/build.py` 的既有流程重跑「触发器与效果原子手册」

### 1.7 阶段 1 验收测试（新建 `tests/mergeEconomyAtoms.test.ts`）

必须覆盖：

1. **零漂移**：`skills.json` 全量加载 + 现有 41 卡全部通过校验；`goldenReplay.test.ts` **不需要重录**（若红了说明实现动了 RNG 顺序，回去修）。
2. `mergeRule` 已彻底消失：`ATOM_NAMES` 不含它；配置里写 `mergeRule` 会被 `validateSkillsConfig` 以「非法效果原子」拒绝。
3. 新原子绑到非 `passive` 触发器（如 `onHit`）⇒ 校验器报错。
4. 新原子出现在消耗态 ⇒ 校验器报错。
5. 参数越界（`count: 0`、`refundChance: 1.5`、`scope: 'wildcard'`）⇒ 校验器报错。
6. **无规则时不读 rng**：用计数 rng 包装器断言 `commitMerge('merge')` 在无 `mergeMaterialRefund` 装备时调用次数为 0。
7. `refundChance = 0` / `= 1` / 中间值（固定 rng 序列）三档。
8. **四种来源白名单**：`'wildcard'` 与 `'recipe'` 恒不返还，且不取 rng。
9. **万能升星绝不自返还**（这是最重要的一条：否则 6★ 之下的万能卡近乎无限复用）。
10. **返还星级夹紧**：`star` 参数大于 `resultStar - 1` 时被夹紧；夹紧后 < 1 则不发。
11. **连锁有界**：构造一个 `refundChance = 1` 的极端配置，断言 `autoMergeCards()` 在 `MAX_REFUND_ROUNDS` 内终止且不抛栈溢出。
12. **手牌满**：无空槽时 `lost > 0`、`granted === 0`、不产生地面掉落物、`state.groundDrops` 长度不变。
13. **槽位顺序无关性**：交换两个装备槽位置，返还结果与 rng 消耗序列完全一致（对齐 `fusionOrderInvariance.test.ts` 的写法）。
14. **Bounty 展示 == 实际掉落**：带 `wildcardRewardBonus` 时，`bountyOffered` 事件里承诺的张数与 `notifyBountyMemberKilled()` 实际 `spawnWildcardDrop` 的 `count` 相等。
15. **Boss validation `kind === 'card'` 分支不加成、不取 rng**。
16. **结算分**：万能卡加成走地面掉落，未拾取时 `settlement` 的 `score.wildcards` 不变。
17. 事件文案：`mergeRefunded` 的 toast 按实际数量格式化（不得像 `wildcardsGranted` 那样返回固定 DEV 文案）。

### 1.8 阶段 1 顺带清理

`src/ui/eventText.ts:73` 的 `wildcardsGranted` 目前固定返回 `T.testWildcards`。既然本阶段在动同一片文案，**顺手改成按 `ev.grants` 动态格式化**（如「获得 2 张 3★ 万能卡」），并补测试。这是纯 UI 改动，不影响 RNG。

---

## 阶段 2：实装 `summon.fireInterval`（**有行为变化**）

### 2.1 现状

- 契约声明了 `fireInterval`（`atomContract.ts:344`）但**无 default**，运行时从不读。
- `runtime.ts:117` `mirrorTurret` 硬编码 `s.fireCd = 0.7`；`runtime.ts:141` `orbital` 硬编码 `s.fireCd = 0.25`。
- `effectText.ts:224` **已经把 `fireInterval` 显示给玩家**——UI 在说谎。
- 数据里 3 处声明全在 `sentinel` 卡的 `mirrorTurret`：`0.35` / `0.5` / `0.35`。

### 2.2 做法

1. 契约补 `variantDefaults`，让**未声明该参数的卡行为完全不变**：

```ts
fireInterval: {
  type: 'number', default: 0.7, min: 0.05,
  variantDefaults: { on: 'kind', cases: { orbital: 0.25, decoy: 0 } },
  note: '召唤物开火冷却；decoy 不开火',
},
```

2. `Summon` 类型（`src/core/types.ts`）加 `fireInterval: number`；`registry.ts:273` 附近创建召唤物时用 `cNum('summon', p, 'fireInterval')` 写入。
3. `runtime.ts` 的两处硬编码改成 `s.fireCd = s.fireInterval`。
4. `interpreter.ts:542` 的装备态召唤物"参数相同则不重建"比较（`equipmentSummonMatches`）要**把 `fireInterval` 纳入比较**，否则改配置后不会重建实例。
5. `min: 0.05` 是防御性下限——避免配 0 造成每帧开火。请在契约上加注说明。

### 2.3 行为变化与验收

- **`sentinel` 的 `mirrorTurret` 开火冷却 0.7s → 0.35s / 0.5s，DPS 约翻倍（最高档）。这是真实的强度提升，不是修 bug。**
- 必须产出一张**变更前后对照表**（3 个声明点各自的星级/绑定、旧 0.7s vs 新值、镜像炮台单体 DPS 估算），写进 `docs/效果原子参数契约_落地记录.md` 的新增小节。
- `tests/summonLifecycle.test.ts` / `tests/skillsGods.test.ts` 可能需要更新期望值。
- **黄金回放会变**：重录 `tests/golden/telemetry_session_seed42.json`（`scripts/recordGoldenReplay.ts`），并在提交信息里写明"因 `summon.fireInterval` 实装而重录"。
- 新增断言：`fireInterval` 未声明时，`mirrorTurret` 冷却仍为 0.7、`orbital` 仍为 0.25（回归保护）。

> ⚠️ 如果你判断这个强度变化超出可接受范围（比如 `sentinel` 因此明显超模），**不要自作主张调数值**——把对照表交出来并停在这里，等确认后再决定是"实装并同时把 3 处数据回调到 0.7"还是"实装并接受新强度"。

---

## 阶段 3：实装 `groundZone.shape: 'line'`（**有行为变化，可中止**）

### 3.1 现状

- 契约枚举含 `'line'`（`atomContract.ts:296`），`Zone.shape` 只实现 `circle | ring`，`'line'` 当前按 circle 几何结算。
- 唯一声明点在 `flashfire` 卡（`skills.json:7821`），该 `groundZone` 内嵌 `dot` 原子。

### 3.2 做法

1. `Zone` 类型加线形所需字段（起点/朝向/长度/宽度）。方向来源：优先用触发时的 `payload.point` 与炮台连线方向；无 payload 时用 `ctx.origin` 朝最近敌人方向；都没有时退化为 `+x` 轴（必须是确定性的，不得取 rng）。
2. 命中判定：点到线段距离 ≤ 半宽。
3. 渲染：`src/render/` 的区域绘制补线形分支；`src/presentation/skillGeometry.ts` 的卡面图标若按 shape 分支绘制，也要补。
4. `effectText.ts` / `cardDetailModel.ts` 的 `groundZone` 描述补 `'line'` 措辞。

### 3.3 中止条件（重要）

如果实现过程中发现需要**改动区域系统的核心数据结构、或波及命中判定以外的第三个子系统**（例如 zone 与 aura/status 的共享几何被迫重构），**停下来**，改为执行降级方案：

> 从 `groundZone.shape` 枚举中移除 `'line'`，把 `flashfire` 的那一处数据改成 `'circle'`（这与当前实际结算行为完全一致，属零行为变化），并在 `落地记录.md` 里记录"线形区域待未来专门排期"。

无论走哪条路，都要在交付说明里明确写清选了哪条及理由。

---

## 交付要求

1. **三个独立 commit**，信息分别体现"零行为变化 / 有行为变化并重录黄金回放 / 线形区域（实装或降级）"。
2. 每阶段结束 `npm run test` + `npm run build` 全绿。
3. 更新 `docs/效果原子参数契约_落地记录.md` §4：
   - `taunt.priorityWeight` 标为**已实装**（订正过期记录，注明消费点 `statusSystem.ts:181`）
   - `summon.fireInterval` 标为已实装 + 前后对照表
   - `groundZone.shape: 'line'` 标为已实装或已降级
   - `mergeRule` 条目改为「已退役，由 `mergeMaterialRefund` / `wildcardRewardBonus` 取代」
4. 更新 `docs/S0_差距盘点报告.md:59` 中关于 `mergeRule` 的 S5 归属描述。
5. 重新生成配置手册 PDF 相关的 `docs/manual-src/contract.json` 与 `atomIndex.json`。
6. 交付说明里给出一份**「契约声明 vs 实际消费」全量核查表**：遍历 `ATOM_CONTRACT` 的每个参数，标注它在 `registry.ts` / `interpreter.ts` / 各 system 中的消费位置，缺口单列。这是本次的附加产出，用于确认没有第四、第五个漂移参数漏网。
