# Codex 任务：修复主炮形态融合（weaponFusion）的 4 个遗留问题

## 0. 一句话结论

`composeWeaponForm()` 的 delivery 轴（beam）是**覆盖式**写入，却被施加了本该只属于**叠加轴**（mortar impact）的 `damping` 衰减。结果是：**同时装备两张 6★ 光束卡，主炮输出反而下降 25%~40%，且最终生效的是 cardType 字典序靠后的那张、而不是更强的那张。** 同时 `suppressedByFusion` 遥测归因反了，`radiusMul` 的实际强度是标称值的平方，融合后的 aoe impact 不继承 `fireRate`/`multi` 成长、导致混装 build 随成长自我贬值。请按本文四阶段修复并补测试。

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

`src/config/base/economy.json:7` → `equipSlots: 3`。所以**玩家最容易撞上的组合恰恰是 beam + beam**，而这正是当前实现出错的分支；而 mortar 之间的叠加（2 张以上 mortar 同装）**当前配置根本不可能出现**。

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

### P1-3（必须修）：`radiusMul` 的实际强度是标称值的平方

`cfg.combat.weaponFusion.radiusMul = 0.6` 作用于半径，但玩家感知的是**面积**：`0.6² = 0.36`。配置表上写着 0.6，实际效果是"砍到不到四成"。字段语义会持续误导数值校准。

且 `src/editor/labels.ts` 中 `weaponFusion` 只有顶层标签（`:155`），`damping` / `radiusMul` 两个叶子字段**没有中文标签也没有 help 文案**，编辑器里更看不出来。

### P1-4（必须修）：融合后的 aoe impact 不继承 `fireRate` / `multi`，导致混装 build 随成长自我贬值

`resolveAreaImpact()`（`combatSystem.ts:108-124`）：

```ts
const damage = attack.baseDamage * impact.damageRatio * (1 - impact.falloff * ...);
```

`attack.baseDamage` 在 `beginAttack()`（`:39`）中固定为 `totalDamage(state, config)` —— **只有伤害，没有射速、没有多弹丸**。

四种形态的成长继承现状：

| 形态 | 伤害 | 射速 | 多弹丸 |
|---|---|---|---|
| 普通子弹 projectile | ✓ | ✓ | ✓（`shoot()` 有 `for i < totalMulti` 循环，`:219`） |
| 光束 line | ✓ | ✓ | ✓（上一轮已修为继承 `baselineDps`） |
| 榴弹单装 lob | ✓ | ✓（靠 `shotCd = 1/totalFireRate`） | **✗**（lob 分支 `:188-217` 只发 1 发，无 multi 循环） |
| **融合后的爆炸** | ✓ | **✗** | **✗** |

最后一行的机制：爆炸频率被 `resolveImpact` 的 `hitIds` 去重锁死为"每个敌人每道光束一次"，即 `1 / interval ≈ 1.11 次/秒`，与 `fireRate` 完全脱钩；伤害基数又只吃 `totalDamage`。

**精确后果**（不含任何估算）：开局 `damage 18 / fireRate 5 / multi 1` → `baselineDps = 90`；升满到 `fireRate 10 / multi 2` → `baselineDps = 360`。**光束部分翻 4 倍，爆炸部分绝对值一动不动。** 混装相对单装的收益比值因此从开局的约 1.38 单调衰减至趋近 1.0 —— 玩家越强，那张 6★ `splitBlast` 越接近白装。

这与 `docs/装备被动融合契约.md` 的「方向 A」不冲突：方向 A 约束的是**触发式效果**（连锁 / 灼烧 / 冻结）不因 tick 增多而刷次数；而 aoe impact 是**形态本体的伤害轴**，理应和 beam 本体同源继承每秒输出预算。

---

## 3. 不要改动的正确行为（勿动其语义）

- 按 `sourceCardType` → `sourceCardId` 排序以保证"装备槽顺序不影响结果"的确定性设计**正确**，保留。
- `beamMorph` / `mortarMorph` 只在 `trigger === 'passive'` 时进入 `weaponForms`（`interpreter.ts:424` / `:429`）；`onFire` / `interval` 触发的 mortarMorph 走 rider 路径、**不参与 weaponFusion**，这是对的。
- `tickBeam()` 的横扫 / 命中判定、`updateBeams()` 的 tick 推进、`resolveImpact()` 的 `hitIds` 去重（保证一道光束对每敌只触发一次 onHit）**均正确**，勿改。
- 上一轮修复的 `cycleDamage = baselineDps × interval × deliveryDamageRatio` 公式正确，勿回退。
- `projectile` delivery 及 `aoeOnHit` / `split` 等**触发式** rider 路径的伤害基数维持 `totalDamage` 不变，阶段四**不得**波及。

---

## 4. 修复方案（四阶段，按顺序做）

### 阶段一（P0-1）：把 delivery 轴改成「取最强」，衰减只作用于叠加轴

**核心原则**：衰减是**叠加税**，只应作用于会累加的轴。delivery 是覆盖轴，多张 beam 之间应当**竞争取最强、胜者全额生效**，与既有的「护盾 `absorbHits` 取最大」规则保持一致。

改 `src/core/effects/interpreter.ts` 的 `composeWeaponForm()`：

1. 先把排序后的贡献按 `kind` 分为 `beams` 与 `mortars` 两组。
2. **beam 组**：选出 `formParam(params,'beamMorph','damageRatio')` 最大的一张作为胜者（相等时取排序靠前者，保持确定性）。胜者的**全部参数成套采用** —— `damageRatio` / `interval` / `duration` / `tickInterval` / `width` / `star` / `sourceCardType` 必须来自**同一张卡**，禁止跨卡混取。胜者的 `deliveryDamageRatio` **不乘任何衰减**。落败的 beam 全部计入 `suppressedSourceCardTypes`。
3. **mortar 组**：维持叠加语义，但**衰减下标改为按 mortar 组内位置计算，不再用全局下标**。组内第一个不衰减；第二个起 `damageRatio × damping`、`radius × sqrt(areaMul)`（见阶段三）。
   > 这条的直接后果：`beam + splitBlast` 时 `splitBlast` 变为 mortar 组内 index 0，**不再吃 0.75 / 0.6**。爆炸的强度改由阶段四引入的 `impactShare` 统一控制。
4. `delivery` 判定不变：有 beam → `line`；否则有 mortar → `lob`；否则 `projectile`。

### 阶段二（P0-2）：修正 `suppressedByFusion` 归因

`suppressedSourceCardTypes` 只在贡献被**完全丢弃**时写入 —— 即阶段一中落败的 beam。**被衰减不算抑制**，mortar 组的第 2+ 项不得写入。

删除 `interpreter.ts:88` 处基于全局下标的无条件 push，改为在 beam 竞争判定结束后写入落败者。

### 阶段三（P1-3）：把 `radiusMul` 改为面积语义 `areaMul`（行为等价重构）

目标是让编辑器里的数字可直接推理，**不改变任何现有数值行为**：

1. `src/config/base/combat.json`：`weaponFusion.radiusMul: 0.6` → `areaMul: 0.36`（`0.36 = 0.6²`，等价替换）。
2. `src/config/types.ts:132`：类型与注释同步。
3. `interpreter.ts`：半径乘数改为 `Math.sqrt(cfg.combat.weaponFusion.areaMul)`，提取为模块级 helper 避免每帧重复开方。
4. `src/editor/labels.ts`：为 `damping` / `areaMul` 补中文标签与 help 文案，**必须写明这两项只在多张同类叠加时生效**（当前配置只有 1 张 mortar 卡，实际处于休眠状态）：
   - `damping` → 「同类叠加伤害衰减」，help：`同时装备 2 张以上范围形态卡时，第 2 个及之后的贡献伤害乘本值；固定值、不复利。当前配置仅 1 张范围形态卡，本值暂不生效`
   - `areaMul` → 「同类叠加范围面积比」，help：`同时装备 2 张以上范围形态卡时，第 2 个及之后的贡献所覆盖的面积占比；半径按本值开平方缩放。当前配置仅 1 张范围形态卡，本值暂不生效`
5. 全仓搜索 `radiusMul` 确保无残留（`tests/` 必须改；`docs/`、历史 `codex-prompt-*.md` 中的说明性引用可保留，但需在 `docs/装备被动融合契约.md` 中标注已改名）。

### 阶段四（P1-4）：融合爆炸改为从主炮周期预算中按固定比例分走一块

> **设计决策已拍板，按此执行，不要自行改变方向：**
> - 融合爆炸**全额继承** `damage` / `fireRate` / `multi` 三项成长，使混装收益比值在整局恒定。
> - 混装（最强 beam + `splitBlast`）相对单装最强 beam 的目标伤害比值 = **1.35**。

**注意：不要用 `baselineDps × interval` 作为爆炸的伤害基数。** 那是**整道光束一个周期的全部预算**，而爆炸是**每个敌人各炸一次**，直接套用会把预算重复发 N 遍（N = 命中敌人数），实测超发约 4.5 倍。正确做法是引入一个显式的**预算分配比例**。

#### 4.1 新增配置项 `impactShare`

`src/config/base/combat.json` 的 `weaponFusion` 增加：

```json
"weaponFusion": { "impactShare": 0.20, "damping": 0.75, "areaMul": 0.36 }
```

`0.20` 是**待校准的初值**，最终值由 4.4 节的测量决定。同步更新 `src/config/types.ts` 与 `src/editor/labels.ts`：

- `impactShare` → 「融合爆炸预算占比」，help：`范围形态融合到光束上时，每次爆炸从主炮单周期伤害预算中分走的比例。这是控制混装 build 强度的主要旋钮`

#### 4.2 提取 `baselineDps` helper

`src/core/stats.ts` 新增导出：

```ts
export function baselineDps(state: GameState, config: Config): number {
  return totalDamage(state, config) * totalFireRate(state, config) * totalMulti(state);
}
```

`updateTurret()` 的 line 分支（`combatSystem.ts:296-298`）当前是内联表达式，改为复用该 helper。

#### 4.3 `resolveAreaImpact` 改用按 delivery 计算的预算基数

伤害基数不再是裸 `attack.baseDamage`，而是按 delivery 取：

| delivery | 单次预算基数 | 说明 |
|---|---|---|
| `line` | `baselineDps × form.interval × impactShare` | 爆炸是**附加**在光束上的，只分走周期预算的一小块 |
| `lob` | `totalDamage × totalMulti` | 榴弹**本身就是整把武器**，拿满单发预算；射速已通过 `shotCd` 的发射频率继承，此处只补 `multi`。**不乘 `impactShare`** |
| 其他（`projectile` / rider 路径） | `totalDamage`（维持现状） | 不得改动 |

实现要求：在 `AttackInstance` 上新增字段 `impactBudget`，由 `beginAttack()` 的调用方按 delivery 传入，缺省回落到 `totalDamage(state, config)`；`resolveAreaImpact` 用它替代 `attack.baseDamage`。

> **不要**直接改 `attack.baseDamage` 的语义 —— 它还被 `explodeMortar` 的 legacy fallback（`combatSystem.ts:345-350`）用来反算 ratio。若发现该 fallback 与新预算冲突，在 PR 中标注，**不要**擅自删除。

**自检**：改完后单装 `splitBlast`（lob，`multi = 1`）的爆炸中心伤害应仍为 `18 × 1.3 = 23.4`，与改动前**逐位相同**；`multi = 2` 时应变为 `46.8`。若第一条不成立说明公式写错了。

#### 4.4 校准 `impactShare`（必须用测量，不要猜）

爆炸伤害对 `impactShare` 是**严格线性**的，且光束本体伤害与 `impactShare` **完全无关**。因此比值满足 `ratio(s) = 1 + c·s`，只需**一次测量 + 一次解析求解**，不需要二分搜索：

1. 设 `impactShare = 0.20`，在下述 **S1 场景**测出比值 `r₀`。
2. 求 `c = (r₀ − 1) / 0.20`。
3. 定稿 `impactShare = 0.35 / c`，写回 `combat.json`。
4. 用定稿值复测 S1，确认比值落在 `1.33 ~ 1.37`。

**S1（校准基准场景）**：默认数值 `damage 18 / fireRate 5 / multi 1`。5 个不移动、不死亡的高血量敌人沿炮台正上方射线排开，距炮台 `40 / 65 / 90 / 115 / 140`（全部在 `range 150` 内）。固定时长模拟，分别记录：

- A = 单装 `solarLance`（最强 beam）的总伤害
- B = 单装 `splitBlast` 的总伤害
- C = 混装二者的总伤害
- 比值 = C / A

**S2（对照场景，只报告不设目标）**：3 个敌人在光束射线上（距炮台 40 / 85 / 130），另 2 个偏离射线轴 70px。用于观察"爆炸打到光束扫不到的敌人"这一核心价值。

**PR 中必须给出的表格**：S1 与 S2 各自的 A / B / C / 比值，且每个场景都要跑三组成长档位 —— `(fireRate 5, multi 1)`、`(fireRate 10, multi 1)`、`(fireRate 5, multi 2)`。

**停止条件**：
- 若定稿的 `impactShare` 需要低于 `0.05` 或高于 `0.60` 才能落进目标区间，说明公式或场景设定仍有问题，**停下来在 PR 中标注，不要强行压数值**。
- 若 S2 的比值低于 `1.10`，说明爆炸在分散场景几乎没价值，**在 PR 中标注**，等 Sage 决定是否需要为分散场景单独加权。

---

## 5. 必须新增 / 更新的测试

### 5.1 更新 `tests/weaponFusionPipeline.test.ts`

现有断言会随各阶段失效，需重算：

- `:62-66`「正式两张 6★ 形态卡融合」：`impacts[0].damageRatio` 期望从 `1.3 × damping` 改为 `1.3`（mortar 组内 index 0，不再衰减）；`radius` 从 `90 × radiusMul` 改为 `90`（同理不再衰减）。
- `:82-85`「交换装备槽得到相同 spec」：同上调整，但**必须保留 `expect(a).toEqual(b)` 这条确定性断言**，它是整套设计的核心契约。
- `:88-103`「光束直伤与爆炸同时入账」：随阶段四的预算公式重算期望，保留"直伤敌人掉血 > 仅溅射敌人"的语义。

### 5.2 新增 `tests/weaponFusionAxis.test.ts`

1. **beam 取最强**：装 `pierce`(1.0) + `sentinel`(0.8) → `deliveryDamageRatio === 1.0`，且 `width === 32`（验证参数成套来自胜者，不是 22）。
2. **beam 不衰减且参数成套**：装 `glacialSpike`(0.95) + `solarLance`(1.15) → `deliveryDamageRatio === 1.15` 且 `interval === 0.85`。
3. **叠装不劣化（最重要的回归护栏）**：遍历 5 张 beam 卡的**全部两两组合**，断言融合后 `deliveryDamageRatio >= max(两张单装各自的 ratio)`。
4. **确定性**：任取一组组合交换装备槽位，`composeWeaponForm` 结果 `toEqual`。
5. **suppressed 归因**：`pierce` + `sentinel` → `suppressedSourceCardTypes` 只含 `'sentinel'`，不含 `'pierce'`；`pierce` + `splitBlast` → `suppressedSourceCardTypes` 为**空数组**。
6. **mortar 组内衰减下标**：用测试内自建 skillDef 构造 3 张 mortar 的 fixture（**不改正式配置**），断言第 1 张不衰减、第 2 张 `× damping` 且半径 `× sqrt(areaMul)`、第 3 张仍是 `× damping`（**不复利**，不是 `damping²`）。
7. **单张 mortar 不因 beam 存在而衰减**：`pierce` + `splitBlast` → `impacts[0].damageRatio === 1.3` 且 `radius === 90`。

### 5.3 扩展 `tests/weaponDpsParity.test.ts`（上一轮已建）

8. **lob 单装的 multi 继承**：单装 `splitBlast`，`multi = 1 / 2 / 3`，总伤害应近似等比增长。
9. **lob 单装数值不回归**：`multi = 1` 时爆炸中心伤害 `=== 23.4`（改动前后逐位相同）。
10. **融合爆炸继承射速**：混装 build，`fireRate = 5 / 10` 两组，**爆炸部分**的总伤害应近似等比增长（当前实现下必失败，即为 P1-4 的回归护栏）。
11. **混装收益比值恒定（拍板结论的护栏）**：S1 场景下，`(fireRate 5, multi 1)` / `(fireRate 10, multi 1)` / `(fireRate 5, multi 2)` 三档的 `C / A` 比值互相误差 **< 2%**，且均落在 `1.33 ~ 1.37`。

---

## 6. 改动清单

| 文件 | 改动 |
|---|---|
| `src/core/effects/interpreter.ts` | `composeWeaponForm()` 拆 beam/mortar 两组；beam 取最强不衰减、参数成套；mortar 按**组内**下标衰减；`suppressedSourceCardTypes` 只记落败 beam；半径改用 `sqrt(areaMul)` |
| `src/core/systems/combatSystem.ts` | `AttackInstance` 新增 `impactBudget`；`beginAttack()` 按 delivery 传入；`resolveAreaImpact()` 改用该字段；line 分支复用 `baselineDps()` |
| `src/core/stats.ts` | 新增导出 `baselineDps(state, config)` |
| `src/config/base/combat.json` | `weaponFusion` → `{ impactShare, damping, areaMul }`；`radiusMul 0.6` → `areaMul 0.36`（等价）；`impactShare` 初值 0.20，按 4.4 校准后定稿 |
| `src/config/types.ts` | `weaponFusion` 类型与注释同步 |
| `src/editor/labels.ts` | 补 `impactShare` / `damping` / `areaMul` 三项的中文标签与 help（后两项须注明当前休眠） |
| `tests/weaponFusionPipeline.test.ts` | 更新受影响断言，保留确定性与触发次数语义 |
| `tests/weaponFusionAxis.test.ts` | 新增（7 条，含叠装不劣化护栏） |
| `tests/weaponDpsParity.test.ts` | 新增 4 条（8~11） |
| `docs/装备被动融合契约.md` | 「主炮形态」一节重写：delivery = 覆盖轴取最强、impact = 叠加轴；`impactShare` 预算分配模型；`areaMul` 面积语义；`radiusMul` 已改名的说明 |

---

## 7. 交付要求

1. **严格按四阶段顺序提交**：阶段一 + 二合并为一个 commit；阶段三单独一个（行为等价重构，测试数值应可预测地变化）；阶段四单独一个（含 4.4 的完整数据表）。
2. 阶段四的 `impactShare` 定稿值**必须来自 4.4 节的测量与解析求解**，不得凭感觉填。PR 中要写出 `r₀`、`c`、`0.35 / c` 的完整推导。
3. 全量 `npm test` 通过；新增测试全绿。特别是 5.2 第 3 条「叠装不劣化」必须覆盖全部 5 张 beam 卡的两两组合，5.3 第 11 条「比值恒定」必须覆盖三档成长。
4. **不要**为了让旧测试通过而放宽断言 —— 期望值该重算就重算，但 `expect(a).toEqual(b)` 的槽位无关性契约不得删除或弱化。
5. **不要**顺手改动 `onFire` / `interval` 触发路径的 mortarMorph（rider 路径），也不要改 `projectile` delivery 的伤害基数。本次范围只限 passive 换形融合。
6. 触发 4.4 节任一「停止条件」时，**停下来在 PR 中标注并等确认**，不要自行调整目标区间或场景设定。
7. 完成后 `docs/装备被动融合契约.md` 需能独立解释清楚三件事，作为后续调参的唯一事实来源：为什么 beam 取最强而不收税、为什么爆炸走预算分配而不是独立叠加、`impactShare` / `damping` / `areaMul` 三个旋钮各自管什么。
