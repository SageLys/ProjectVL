# Codex 任务：修复主炮形态融合（weaponFusion）的 4 个遗留问题

## 0. 一句话结论

`composeWeaponForm()` 的 delivery 轴（beam）是**覆盖式**写入，却被施加了本该只属于**叠加轴**（mortar impact）的 `damping` 衰减。结果是：**同时装备两张 6★ 光束卡，主炮输出反而下降 25%~40%，且最终生效的是 cardType 字典序靠后的那张、而不是更强的那张。** 同时 `suppressedByFusion` 遥测归因反了，`radiusMul` 的实际强度是标称值的平方，融合后的 aoe impact 不继承 `fireRate`/`multi` 成长。请按本文四阶段修复并补测试。

---

## 1. 背景：当前融合规则与真实配置分布

`src/core/effects/interpreter.ts:72` `composeWeaponForm()` 把所有 `trigger==='passive'` 的 `beamMorph` / `mortarMorph` 贡献按 `sourceCardType` 字典序（再按 `sourceCardId`）排序，然后：

```ts
const damping = index === 0 ? 1 : cfg.combat.weaponFusion.damping;   // :87
if (index > 0) suppressedSourceCardTypes.push(form.sourceCardType);  // :88
```

- `beam` 分支（`:89-99`）：**整体覆盖** `delivery` / `deliveryDamageRatio` / `interval` / `duration` / `tickInterval` / `width` / `sourceStar` / `sourceCardType`，并把 `damping` 乘进 `deliveryDamageRatio`。
- `mortar` 分支（`:99-114`）：向 `impacts[]` **追加**一项，`damageRatio × damping`、`radius × radiusMul`。

配置侧（`src/config/base/skills.json`，`stars.6` + `evolutionTree.sharedNodes`）目前共 **6 张**卡带 passive 换形，其中 **5 张是 beam、只有 1 张是 mortar**：

| 卡 id | 类型 | damageRatio | 其他 |
|---|---|---|---|
| `glacialSpike` | beam | 0.95 | interval 0.9 / width 28 |
| `goldenVolley` | beam | 1.0 | interval 0.9 / width 30 |
| `pierce` | beam | 1.0 | interval 0.9 / width 32 |
| `sentinel` | beam | 0.8 | interval 0.9 / width 22 |
| `solarLance` | beam | 1.15 | interval 0.85 / width 34 |
| `splitBlast` | mortar | 1.3 | radius 90 / falloff 0.5 |

`src/config/base/economy.json:7` → `equipSlots: 3`。所以**玩家最容易撞上的组合恰恰是 beam + beam**，而这正是当前实现出错的分支。

---

## 2. 四个遗留问题（均已通读代码确认，非猜测）

### P0-1（必须修）：beam + beam 叠装反而变弱，且胜出者由字典序随机决定

beam 分支是覆盖语义 —— 排序靠后的那张会把前一张的全部参数冲掉 —— 但它同时又吃了 `damping = 0.75`。于是"第一张 beam 白装、第二张 beam 打七五折"。

排序结果固定为 `glacialSpike < goldenVolley < pierce < sentinel < solarLance < splitBlast`，实测组合：

| 组合 | 单卡各自 ratio | 融合后实际 ratio | 后果 |
|---|---|---|---|
| `glacialSpike` + `solarLance` | 0.95 / 1.15 | 1.15 × 0.75 = **0.8625** | 比只装 solarLance 弱 25% |
| `goldenVolley` + `glacialSpike` | 1.0 / 0.95 | 1.0 × 0.75 = **0.75** | 比装任意一张都弱 |
| `pierce` + `sentinel` | 1.0 / 0.8 | 0.8 × 0.75 = **0.6** | 比只装 pierce 弱 **40%** |

注意第三行：胜出的是**更弱**的 `sentinel`（0.8），只因为 `'sentinel' > 'pierce'`。玩家多装一张 6★ 传说卡，输出直接掉四成。这是确定性行为错误，不是数值偏差。

### P0-2（必须修）：`suppressedByFusion` 遥测归因反了

`interpreter.ts:88` 在**尚未判定该贡献是否生效**之前，就按下标把 `index > 0` 的全部标为 suppressed。消费点在 `src/core/systems/combatSystem.ts:216` / `:317` → `recordFusionSuppression()`（`src/telemetry/combatCounters.ts:19`）。

两种错误：

- **beam + beam**：被标记的是 index 1，而 index 1 恰恰是实际**胜出**的那张；真正被丢弃的 index 0 反而没被标记。**完全颠倒。**
- **beam + mortar**：`splitBlast`（index 1）被标为 suppressed，但它其实**全程生效**，只是伤害/半径被衰减。"被融合抑制"应当只表示"贡献被完全丢弃"，衰减不属于抑制。

后果：调参时看遥测判断"哪张卡被吃掉了"会得到相反的结论。

### P1-3（建议修）：`radiusMul` 的实际强度是标称值的平方

`cfg.combat.weaponFusion.radiusMul = 0.6` 作用于半径，但玩家感知的是**面积**：`0.6² = 0.36`。配置表上写着 0.6，实际效果是"砍到不到四成"。叠加 `damping = 0.75` 后，融合 mortar 的实际贡献只剩 `0.75 × 0.36 ≈ 27%`。

这不是 bug，但字段语义会持续误导数值校准。而且 `src/editor/labels.ts` 中 `weaponFusion` 只有顶层标签（`:155`），`damping` / `radiusMul` 两个叶子字段**没有中文标签也没有 help 文案**，编辑器里更看不出来。

### P1-4（建议修）：融合后的 aoe impact 不继承 `fireRate` / `multi` 成长

`resolveAreaImpact()`（`combatSystem.ts:108-124`）：

```ts
const damage = attack.baseDamage * impact.damageRatio * (1 - impact.falloff * ...);
```

`attack.baseDamage` 在 `beginAttack()`（`:39`）中固定为 `totalDamage(state, config)` —— **只有伤害，没有射速、没有多弹丸**。

- **line delivery（beam + mortar 融合）**：爆炸频率被锁死为"每个敌人每道光束一次"（`resolveImpact` 的 `hitIds` 去重），即 `1 / interval ≈ 1.11 次/秒`，与 `fireRate` 完全脱钩。射速从 5 涨到 10 时，光束本体伤害翻倍（上一轮 BUG 任务已修复为继承 `baselineDps`），而爆炸部分**纹丝不动**。混装 build 的 aoe 价值随成长持续贬值。
- **lob delivery（mortar 单独装）**：`shoot()` 的 lob 分支（`:188-217`）只发射 **1 发**弹，而 projectile 分支（`:218-234`）有 `for (let i = 0; i < totalMulti(state); i++)` 循环。lob 通过 `shotCd = 1 / totalFireRate` 继承了射速，但**完全不继承 `multi`**。

这与上一轮在 `docs/装备被动融合契约.md` 确立的「方向 A」不一致：方向 A 约束的是**触发式效果**（连锁 / 灼烧 / 冻结）不因 tick 增多而刷次数；而 aoe impact 是**形态本体的伤害轴**，理应和 beam 本体同源继承每秒输出预算。

---

## 3. 不要改动的正确行为（勿动其语义）

- 按 `sourceCardType` → `sourceCardId` 排序以保证"装备槽顺序不影响结果"的确定性设计**正确**，保留。
- `beamMorph` / `mortarMorph` 只在 `trigger === 'passive'` 时进入 `weaponForms`（`interpreter.ts:424` / `:429`）；`onFire` / `interval` 触发的 mortarMorph 走 rider 路径、**不参与 weaponFusion**，这是对的。
- mortar impact 之间的**叠加**语义正确（多个 mortar 各自在 `impacts[]` 占一项，第二个起衰减且**不复利**）。
- `tickBeam()` 的横扫 / 命中判定、`updateBeams()` 的 tick 推进、`resolveImpact()` 的 `hitIds` 去重（保证一道光束对每敌只触发一次 onHit）**均正确**，勿改。
- 上一轮修复的 `cycleDamage = baselineDps × interval × deliveryDamageRatio` 公式正确，勿回退。

---

## 4. 修复方案（四阶段，按顺序做）

### 阶段一（P0-1）：把 delivery 轴改成「取最强」，damping 只作用于叠加轴

**核心原则**：`damping` / `radiusMul` 是**叠加税**，只应作用于会累加的轴（mortar impact）。delivery 是覆盖轴，多张 beam 之间应当**竞争取最强、胜者全额生效**，与既有的「护盾 `absorbHits` 取最大」规则保持一致。

改 `src/core/effects/interpreter.ts` 的 `composeWeaponForm()`：

1. 先把排序后的贡献按 `kind` 分为 `beams` 与 `mortars` 两组。
2. **beam 组**：选出 `formParam(params,'beamMorph','damageRatio')` 最大的一张作为胜者（相等时取排序靠前者，保持确定性）。胜者的**全部参数成套采用** —— `damageRatio` / `interval` / `duration` / `tickInterval` / `width` / `star` / `sourceCardType` 必须来自**同一张卡**，禁止跨卡混取。胜者的 `deliveryDamageRatio` **不乘 damping**。落败的 beam 全部计入 `suppressedSourceCardTypes`。
3. **mortar 组**：维持现有叠加语义 —— 组内第一个（排序最靠前者）不衰减，第二个起 `damageRatio × damping`、`radius × radiusMul`（阶段三后改为面积语义）。**注意衰减下标要按 mortar 组内的位置算，不能再用全局下标** —— 现在 `splitBlast` 只要和任意 beam 同装就被判为 index 1 而吃衰减，改完后单张 mortar + 单张 beam 时 mortar 应为组内 index 0、**不衰减**。
4. `delivery` 判定不变：有 beam → `line`；否则有 mortar → `lob`；否则 `projectile`。

> 阶段一会让「beam + splitBlast」的爆炸从 `1.3 × 0.75 = 0.975` 回到 `1.3`，属于预期内的正向变化，由阶段四统一校准。

### 阶段二（P0-2）：修正 `suppressedByFusion` 归因

`suppressedSourceCardTypes` 只在贡献被**完全丢弃**时写入 —— 即阶段一中落败的 beam。**被衰减不算抑制**，mortar 组的第 2+ 项不得写入。

删除 `interpreter.ts:88` 处基于全局下标的无条件 push，改为在 beam 竞争判定结束后写入落败者。

### 阶段三（P1-3）：把 `radiusMul` 改为面积语义 `areaMul`（行为等价重构）

目标是让编辑器里的数字可直接推理，**不改变任何现有数值行为**：

1. `src/config/base/combat.json`：`weaponFusion` 改为 `{ "damping": 0.75, "areaMul": 0.36 }`（`0.36 = 0.6²`，等价替换）。
2. `src/config/types.ts:132`：`weaponFusion: { damping: number; areaMul: number }`，注释同步更新。
3. `interpreter.ts:111`：半径乘数改为 `Math.sqrt(cfg.combat.weaponFusion.areaMul)`。可提取为模块级 helper 避免每帧重复开方。
4. `src/editor/labels.ts`：为 `damping` / `areaMul` 补中文标签与 help 文案，明确写出语义：
   - `damping` → 「叠加伤害衰减」，help：`第 2 个及之后的叠加形态贡献，伤害乘本值；固定值不复利`
   - `areaMul` → 「叠加范围面积比」，help：`第 2 个及之后的范围贡献所覆盖的面积占比；半径按本值开平方缩放`
5. 全仓搜索 `radiusMul` 确保无残留（含 `tests/`、`docs/`、`codex-prompt-*.md` 中的说明性引用可保留但需标注已改名）。

### 阶段四（P1-4）：让形态伤害轴统一继承每秒输出预算 —— **需先出数据、再定数值**

**这一阶段会显著改变混装 build 强度，必须先测后调，禁止拍脑袋改 damping。**

1. 在 `src/core/stats.ts` 提取共用 helper：
   ```ts
   export function baselineDps(state: GameState, config: Config): number {
     return totalDamage(state, config) * totalFireRate(state, config) * totalMulti(state);
   }
   ```
   并让 `updateTurret()` 的 line 分支复用它（当前是内联表达式，`combatSystem.ts:296-298`）。

2. `resolveAreaImpact()` 的伤害基数改为按 delivery 取对应的**单次预算**，而非裸 `totalDamage`：
   - `line`：单次预算 = `baselineDps × form.interval`（与 beam 本体同一周期预算）
   - `lob`：单次预算 = `baselineDps / totalFireRate` = `totalDamage × totalMulti`（射速已通过 `shotCd` 的发射频率继承，此处只补 `multi`）
   - `projectile` 及其他 rider 路径：**维持现状 `totalDamage`**，不要动，避免波及 `aoeOnHit` / `split` 等触发式原子。

   实现建议：在 `AttackInstance` 上新增一个 `impactBudget` 字段（由 `beginAttack` 的调用方按 delivery 传入，默认回落到 `totalDamage`），`resolveAreaImpact` 用它替代 `attack.baseDamage`。**不要**直接改 `attack.baseDamage` 的语义 —— 它还被 `explodeMortar` 的 legacy fallback（`combatSystem.ts:348`）用来反算 ratio。

3. **量化并报告**（在 PR 说明中给出表格，不要跳过）：以默认配置（`damage 18 / fireRate 5 / multi 1 / range 150`）与成长后配置（`fireRate 10`、`multi 2`）两组，分别测量：
   - 单装最强 beam（`solarLance`）的 5 敌人成线场景总输出
   - 单装 `splitBlast` 的同场景总输出
   - 混装二者的同场景总输出
   - 混装 / 单装最强者 的**比值**

4. **数值校准（需 Sage 确认后再定稿）**：目标是混装相对单装最强者有明确正收益但不失控。**提议目标区间：5 敌人成线场景下比值落在 1.3 ~ 1.5**。按阶段三的新语义反推 `damping` / `areaMul` 使其落入该区间，并把推导过程写进 PR。若按目标区间反推出的 `damping` 低于 0.4，说明公式本身仍有问题，**停下来在 PR 中标注，不要强行压数值**。

---

## 5. 必须新增 / 更新的测试

### 5.1 更新 `tests/weaponFusionPipeline.test.ts`

现有断言会随阶段一/三/四失效，需重算：

- `:62-66`「正式两张 6★ 形态卡融合」：`impacts[0].damageRatio` 期望值从 `1.3 × damping` 改为 `1.3`（mortar 组内 index 0，不再衰减），`radius` 从 `90 × radiusMul` 改为 `90 × Math.sqrt(areaMul)`。
- `:82-85`「交换装备槽得到相同 spec」：同上调整，但**必须保留 `expect(a).toEqual(b)` 这条确定性断言**，它是整套设计的核心契约。
- `:88-103`「光束直伤与爆炸同时入账」：随阶段四的预算公式重算期望，保留"直伤敌人掉血 > 仅溅射敌人"的语义。

### 5.2 新增 `tests/weaponFusionAxis.test.ts`

1. **beam 取最强**：装 `pierce`(1.0) + `sentinel`(0.8) → `deliveryDamageRatio === 1.0`，`width === 32`（验证参数成套来自胜者，不是 22）。
2. **beam 不衰减**：装 `glacialSpike`(0.95) + `solarLance`(1.15) → `deliveryDamageRatio === 1.15`，且 `interval === 0.85`（成套采用 solarLance）。
3. **叠装不劣化**（回归护栏，最重要的一条）：对**全部** 5 张 beam 卡的两两组合遍历，断言融合后 `deliveryDamageRatio >= max(单装各自 ratio)`。
4. **确定性**：任取一组组合交换装备槽位，`composeWeaponForm` 结果 `toEqual`。
5. **suppressed 归因**：`pierce` + `sentinel` → `suppressedSourceCardTypes` 只含 `'sentinel'`（落败者），不含 `'pierce'`；`pierce` + `splitBlast` → `suppressedSourceCardTypes` 为**空数组**（mortar 全程生效，不算抑制）。
6. **mortar 组内衰减下标**：构造两张 mortar 的 fixture（用测试内自建 skillDef，不改正式配置），断言第一张不衰减、第二张 `× damping` 且 `× sqrt(areaMul)`，第三张仍是 `× damping`（**不复利**，不是 `damping²`）。
7. **mortar 单张不因 beam 存在而衰减**：`pierce` + `splitBlast` → `impacts[0].damageRatio === 1.3`、`radius === 90 × sqrt(areaMul)`… 若阶段三决定半径也不该衰减，需在 PR 中说明并同步契约文档。

### 5.3 扩展 `tests/weaponDpsParity.test.ts`（上一轮已建）

新增两条成长继承用例：

8. **融合 aoe 继承射速**：`fireRate = 5 / 10` 两组，混装 build 中**爆炸部分**的总伤害应近似等比增长（当前实现下这条会失败，即为 P1-4 的回归护栏）。
9. **lob 继承 multi**：单装 `splitBlast`，`multi = 1 / 2 / 3`，总伤害应近似等比增长。

---

## 6. 改动清单

| 文件 | 改动 |
|---|---|
| `src/core/effects/interpreter.ts` | `composeWeaponForm()` 拆 beam/mortar 两组；beam 取最强不衰减、参数成套；mortar 按组内下标衰减；`suppressedSourceCardTypes` 只记落败 beam；半径改用 `sqrt(areaMul)` |
| `src/core/systems/combatSystem.ts` | `resolveAreaImpact()` 改用按 delivery 传入的 `impactBudget`；`beginAttack()` 新增该字段；line 分支复用 `baselineDps()` helper |
| `src/core/stats.ts` | 新增导出 `baselineDps(state, config)` |
| `src/config/base/combat.json` | `weaponFusion.radiusMul` → `areaMul`，值 `0.6` → `0.36`（等价）；阶段四后按校准结果定稿 |
| `src/config/types.ts` | `weaponFusion` 类型与注释同步 |
| `src/editor/labels.ts` | 补 `damping` / `areaMul` 的中文标签与 help 文案 |
| `tests/weaponFusionPipeline.test.ts` | 更新受影响断言，保留确定性与触发次数语义 |
| `tests/weaponFusionAxis.test.ts` | 新增（7 条，含叠装不劣化护栏） |
| `tests/weaponDpsParity.test.ts` | 新增 2 条成长继承用例 |
| `docs/装备被动融合契约.md` | 「主炮形态」一节重写：明确 delivery = 覆盖轴取最强、impact = 叠加轴收税；补 `areaMul` 的面积语义与 aoe 预算继承规则 |

---

## 7. 交付要求

1. **严格按四阶段顺序提交**，阶段一/二可合并为一个 commit，阶段三单独一个（行为等价重构），阶段四单独一个（含数据表）。
2. 阶段四的数值定稿**必须先给出第 4.4 节要求的对照表**，等 Sage 确认目标区间后再改 `damping` / `areaMul` 的最终值。在此之前阶段四的代码改动可先合入、数值保持等价。
3. 全量 `npm test` 通过；新增测试全绿。特别是 5.2 第 3 条「叠装不劣化」必须覆盖全部 5 张 beam 卡的两两组合。
4. **不要**为了让旧测试通过而放宽断言 —— 期望值该重算就重算，但 `expect(a).toEqual(b)` 的槽位无关性契约不得删除或弱化。
5. **不要**顺手改动 `onFire` / `interval` 触发路径的 mortarMorph（rider 路径），本次范围只限 passive 换形融合。
6. 若阶段四实现后发现 `explodeMortar` 的 legacy fallback（`combatSystem.ts:345-350`）语义与新预算冲突，在 PR 中标注，**不要**擅自删除该 fallback。
7. 完成后 `docs/装备被动融合契约.md` 需能独立解释清楚"为什么 beam 不收税而 mortar 收税"，作为后续调参的唯一事实来源。
