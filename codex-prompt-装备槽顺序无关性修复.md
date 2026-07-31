# Codex Prompt — 装备槽顺序无关性修复（novaOnBreak / expiryConvert / taunt + 召唤物顺序依赖）

## 0. 任务性质

这是一次**引擎正确性修复 + 融合语义定版**。目标是让下面这条契约真正成立：

> 在相同卡实例、相同初始状态、相同 RNG 输入下，**交换任意两个装备槽的位置，聚合结果、事件序列、RNG 消耗顺序与最终战斗状态必须完全一致。**

该契约已经写在 `src/core/effects/interpreter.ts:5`（文件头注释）和 `docs/装备被动融合契约.md`，但当前实现有多处违反。本次要把违反点全部修掉，并把新的融合规则写回契约文档与原子契约表。

**这不是重构任务，不要顺手改架构。** 改动范围严格限制在下面第 3 节列出的文件与函数。

---

## 1. 已核实的事实（不需要重新调查，可直接采信；如与代码不符以代码为准并报告）

### 1.1 遍历顺序

- `equippedBindings()`（`src/core/effects/interpreter.ts:214`）直接遍历 `effectiveEquipment(state)`，而后者（`interpreter.ts:155`）只是 `state.equipment.filter(...)`，**保留物理槽位顺序**。
- 项目里已经有正确的排序遍历 `orderedEquippedBindings()`（`interpreter.ts:229`），按 `card.type → card.id → bindingIndex` 排序。
- 但它**只被 `fireTriggerBindings()`（`interpreter.ts:333`）使用**。以下三处仍在用未排序的 `equippedBindings()`：
  - `tickIntervalBindings()` — `interpreter.ts:354`
  - `getModifiers()` — `interpreter.ts:427`
  - `reconcileEquipmentPassives()` — `interpreter.ts:519`

`tickIntervalBindings` 的顺序会决定同一帧内 interval 效果的执行顺序，进而决定 **RNG 消耗顺序**；`reconcileEquipmentPassives` 的顺序会决定 `state.summons` 的**创建顺序**。两者都会让换槽产生真实的模拟差异。

### 1.2 后写覆盖的两个修饰原子

- `novaOnBreak`：`interpreter.ts:441-446` 直接 `m.novaOnBreak = {...}`，最后遍历到的那张卡赢。
- `expiryConvert`：`interpreter.ts:453-454` 直接 `m.expiryConvert = {...}`，同上。

这两处在正式配置中**确实可以同时来自多张卡**（见 1.5），不是理论风险。

### 1.3 taunt

- `applyTaunt()`（`src/core/effects/statusSystem.ts:174-176`）无条件替换目标、来源与剩余时间：`e.status.taunt = { x, y, remaining: duration, summonId }`。
- `ATOMS.taunt`（`src/core/effects/registry.ts:386-390`）**根本没有读取 `priorityWeight`**。
- `atomContract.ts:239-242` 里 `taunt.priorityWeight` 的 note 已经自陈「当前实现未消费（applyTaunt 不读取），故意不给默认值」。
- `EnemyStatus.taunt`（`src/core/types.ts:195`）是单槽结构，没有权重、没有来源标识。
- `tickStatusTimers()`（`statusSystem.ts:203-207`）在超时或召唤物消失时把整个 taunt 置 null，没有回退候选的概念。
- `enemySystem.ts:329`（Boss 撞毁召唤物）直接 `boss.status.taunt = null`，同样是整体清空。
- 显式 `taunt` 与召唤物 `tauntRadius` 是**两套独立系统**：`moveTargetFor()`（`enemySystem.ts:134-152`）先看 `e.status.taunt`，没有才去扫 `state.summons` 的 `tauntRadius`。

### 1.4 另外两处槽位依赖（原始问题表遗漏，本次一并修）

- **无敌人时召唤物放置角度**：`threatDirectionSummonPosition()`（`registry.ts:200-226`）在威胁方向向量为零时，用 `state.equipment.findIndex(card => card?.id === sourceCardId)` 得到的**槽号**计算方位角。换槽 = 召唤物位置改变 = 战斗结果改变。
- **环境召唤物平权决胜**：`moveTargetFor()`（`enemySystem.ts:143`）用严格 `>` 比较 `priorityWeight`，同权重时保留 `state.summons` 中先出现的那个；而召唤物创建顺序来自 1.1 里未排序的 `reconcileEquipmentPassives`。

### 1.5 正式配置的实际数据（`src/config/base/skills.json`，41 张卡）

`novaOnBreak` 的来源卡：`galvanicWard`、`frozenBulwark`、`cinderheart`、`aegis`、`sentinel`、`crownOfThorns`（后者 `recipeOnly=true`，走 `stars['6'].equip`）。典型冲突：

| 来源 | damage | knockbackDistance |
|---|---|---|
| `cinderheart` 5★ 分支 | 40 | 70 |
| `aegis` 5★ 分支 option2 | 30 | 135 |

当前结果取决于槽位，可能是 `{40,70}` 也可能是 `{30,135}`。

`expiryConvert` 的来源卡与 ratio：`harvest` 0.5（5★分支）/ 1.0（6★ shared）、`ashHarvest` 0.65、`ironvine` 0.45、`luckyStar` 0.7。当前 `harvest` 6★ 的 `ratio=1` 可能被后槽的 0.45 覆盖回非必定转化。

`taunt` 目前只有一个正式来源：`frozenBulwark` 6★ shared 节点的 `aura` 内嵌效果（`{ radius:170, duration:0.9, priorityWeight:2 }`）。因此 taunt 当前**是已经存在的引擎缺陷，但还不是正式内容里的双卡冲突** —— 不过 `taunt` 的 `supports.consume = true`，消耗态释放同样可以和它撞车。

### 1.6 卡内累积语义（关键前提，别改坏）

`resolveCardBindings()`（`interpreter.ts:187-211`）按「3★分支 → 4★shared（含 amplify）→ 5★分支 → 6★shared」**累积**绑定，因此**同一张卡可以多次声明同一个原子**。实例：

- `aegis` 走 3:option2 → 5:option2 → 6★shared 时，会依次得到 `novaOnBreak` 的 `{28,70}`、`{30,135}`、`{50,130}`。当前后写覆盖 → `{50,130}`。
- `galvanicWard` 3★ `{24,60}` → 6★shared `{55,90}`，当前 → `{55,90}`。

从数值看，**卡内多次声明的设计意图就是「升星覆盖」**。所以卡内必须保持后写覆盖，否则会无意改变进化树数值（例如 aegis 会变成 `{50,135}`）。

### 1.7 其它必须知道的约束

- `src/config/base/economy.json:12` 的 `equipDistinctTypes: true`，且 `equipmentSystem.ts:62` 会拒绝重复类型入装。所以**「每卡实例一个来源」当前等价于「每卡类型一个来源」**，但实现仍应按卡实例 id 建键，不要依赖这条配置。
- `novaOnBreak` / `expiryConvert` 契约里都带 `chance` 参数（`atomContract.ts` 的 `CHANCE`），但 `runEffects` 的概率闸门在 `registry.ts:588`，而 passive 绑定的修饰原子**从来不进 `runEffects`** —— 这两个 `chance` 是死参数。**本次不要给它加语义**，只在 note 里注明。
- `tickAuras()` 构造的 ctx（`runtime.ts:59-68`）**只带 `sourceCardType`，没有 `sourceCardId` / `sourceBindingIndex`**；`Zone`（`types.ts:390-405`）**完全没有来源字段**；`tickZones()` 的 ctx 也没有。这是 taunt 来源键必须先补的链路。
- `src/core/replay/record.ts` 不序列化 `enemy.status`，所以改 taunt 的数据结构不会改变 golden fixture 的 schema，但**行为变化仍可能改变 fixture 内容**。
- `tests/bossBehavior.test.ts:155,172` 使用 `novaOnBreak` 且 `damage: 0` / `knockbackDistance: 0`。**「是否存在贡献」必须单独记录，不能用数值 > 0 判断。** 同理 `dropSystem.ts:120` 里 `if (convert && rng() < convert.ratio)` —— 即使 `ratio = 0` 也会消费一次 RNG，这个语义必须保持。

---

## 2. 已拍板的融合规则（不要再讨论替代方案，按此实现）

### 2.1 来源粒度

**来源 = 卡实例**，不是每一条原子声明。

1. 同一张卡内部的多次声明：**保持现有的「后声明覆盖」**（先按 `bindingIndex` → 卡内 `effects` 原始顺序折叠出该卡的唯一贡献）。
2. 不同卡实例之间：再按下表执行满足交换律、结合律的融合。

### 2.2 三个原子的规则

| 原子 | 卡内 | 跨卡 |
|---|---|---|
| `novaOnBreak` | 后声明覆盖 | `damage` 取 max、`knockbackDistance` 取 max（**两个轴独立**） |
| `expiryConvert` | 后声明覆盖 | `1 - ∏(1 - ratioᵢ)`（失败概率连乘），按规范来源顺序连乘 |
| `taunt` | 同来源 upsert | 按 `priorityWeight` 取最高者，赢家参数**整包**采用 |

示例（必须能通过）：

- `{40,70}` ⊕ `{30,135}` = `{40,135}`
- `0.5` ⊕ `0.65` = `1 - 0.5 × 0.35` = **0.825**

### 2.3 taunt 的完整仲裁规则

`EnemyStatus.taunt` 从单槽改为**来源候选集**：

```ts
interface TauntCandidate {
  sourceKey: string;          // 稳定来源键，绝不含装备槽号
  priorityWeight: number;     // 默认 1
  x: number;
  y: number;
  summonId?: number;
  remaining: number;
}
```

1. `priorityWeight` 默认值定为 **1**（与 `summon.priorityWeight`、`focusPriority.priorityWeight` 的既有默认一致）。
2. 同一 `sourceKey` 重复施加时 **upsert**，不新增重复项；`remaining = max(旧剩余, 新 duration)`；坐标/summonId 用新值。
3. 不同来源**各自独立计时**。
4. 仲裁：`priorityWeight` 最高者胜；同权重取 `remaining` 更大者；再同则按 `sourceKey` 字典序决胜（保证确定性）。
5. 当前赢家过期、或其关联召唤物死亡时，**立即回退到下一候选**，而不是清空整个 taunt。
6. `moveTargetFor()`、`isControlled()`、`tauntPulse` VFX 必须读取**同一个仲裁函数**的结果，禁止表现层与模拟层各算一次。
7. `enemySystem.ts:329`（Boss 撞毁召唤物）改为**只移除指向该召唤物的候选**，其余候选保留并重新仲裁。
8. `isControlled()` 的语义保持不变：显式 taunt 计入受控，**环境召唤物的 `tauntRadius` 吸引仍不计入受控增伤**。本次不统一这一点，避免顺手加强所有诱饵流。

### 2.4 稳定来源键

格式：`` `${cardType}/${cardId}/${bindingIndex}/${effectIndex}` ``。**绝不能包含装备槽号。**

由于 1.7，需要先把来源信息补齐到两条链路上：

- `Modifiers.auras[]` 增加 `sourceCardId`、`sourceBindingIndex` 字段（`getModifiers` 里本来就有 `card.id` 和 `bindingIndex`，`aura.key` 已经是 `` `aura:${card.id}:${bindingIndex}` ``），`tickAuras()` 构造 ctx 时透传。
- `Zone` 增加可选 `sourceCardId?` / `sourceCardType?` / `sourceBindingIndex?`，`makeZone()` 从 ctx 填充，`tickZones()` 构造 ctx 时透传。
- 消耗态释放（`releaseConsumable`，无 cardId）使用 `` `consume/${cardType}` `` 作为来源键。

### 2.5 缩放次序

`retaliationMul` 等 build/词条缩放已经在 `applyBuildScalingToBindings()`（`buildModifierSystem.ts:118`）里、即绑定进入聚合**之前**完成，沿用现状即可。融合比较的必须是**缩放后的最终有效值**。

---

## 3. 实施步骤（按顺序）

### 步骤 1 — 建立统一的稳定来源比较器

在 `interpreter.ts` 中提取一个导出的比较器（如 `compareBindingSource`），语义 = `card.type.localeCompare` → `card.id` → `bindingIndex`。让 `orderedEquippedBindings()` 使用它。

### 步骤 2 — 三处未排序遍历改用 `orderedEquippedBindings()`

- `tickIntervalBindings()`（`interpreter.ts:354`）
- `getModifiers()`（`interpreter.ts:427`）
- `reconcileEquipmentPassives()`（`interpreter.ts:519`）

注意 `reconcileEquipmentPassives` 里 `replacesEarlier` 的语义是「删掉**同卡**更早的实例」，排序后同卡的 binding 仍然相邻且保持 `bindingIndex` 升序，语义不变，但要写测试确认。

**只做排序不算完成任务** —— 单纯排序只是把「槽位最后一张赢」变成「字典序最后一张赢」，止血但不是合理的融合规则。必须继续步骤 3。

### 步骤 3 — 在 `getModifiers()` 中引入纯函数聚合辅助

新增两个不依赖 state 的纯辅助函数（放在 `interpreter.ts`，导出以便单测）：

```ts
export function fuseNovaOnBreak(
  perCard: { damage: number; knockbackDistance: number }[],
): { damage: number; knockbackDistance: number } | null;

export function fuseExpiryConvert(perCard: number[]): { ratio: number } | null;
```

在 `getModifiers()` 里：

1. 遍历时**先按卡实例分组折叠**（卡内后写覆盖），用一个 `Map<cardId, contribution>`，Map 的插入顺序天然就是排序后的规范顺序。
2. 遍历结束后调用上面两个函数产出最终值。
3. **有无贡献用 Map 是否为空判断，不能用数值是否大于零。** 没有任何来源时返回 `null`（保持 `damage: 0` 的 Nova 仍然存在、`ratio: 0` 仍消费一次 RNG 的现有语义）。
4. `Modifiers.novaOnBreak` 与 `Modifiers.expiryConvert` 的**数据形状保持不变**（`{damage, knockbackDistance} | null` 和 `{ratio} | null`），消费端 `runtime.ts:239` 与 `dropSystem.ts:120` **一行都不用改**。

浮点：连乘按规范来源顺序进行，保证三张以上卡时结果逐位可复现。

### 步骤 4 — taunt 重构为来源候选集

1. `types.ts`：`EnemyStatus.taunt` 改为 `TauntCandidate[]`（空数组 = 无嘲讽）。同步改 `emptyStatus()`（`statusSystem.ts:35`）。
2. `statusSystem.ts`：
   - `applyTaunt()` 签名改为接收 `sourceKey` 与 `priorityWeight`，执行 upsert。
   - 新增导出 `activeTaunt(e: Enemy): TauntCandidate | null` —— 这是**唯一**的仲裁入口。
   - `isControlled()` 改为读 `activeTaunt(e) !== null`。
   - `tickStatusTimers()` 逐候选扣时间、逐候选检查关联召唤物存活，过期/失源的候选单独移除。
3. `registry.ts:386` 的 `ATOMS.taunt`：读取 `priorityWeight`（默认 1），从 ctx 拼出 `sourceKey`，传给 `applyTaunt`。
4. `atomContract.ts:239-242`：给 `taunt.priorityWeight` 补上 `default: 1`，并把 note 从「当前实现未消费」改为描述仲裁规则。**同步在 `tests/atomContract.test.ts` 的默认值快照表里加上 `'taunt.priorityWeight': 1`**（该表是穷尽断言）。
5. `enemySystem.ts`：`moveTargetFor()`（134-152）、290、313 三处 `boss.status.taunt` 判断、以及 377-379 的 VFX 目标比较，全部改走 `activeTaunt()`。
6. `enemySystem.ts:329`：改为只移除指向被撞毁召唤物的候选。

### 步骤 5 — 修召唤物的两处顺序依赖

1. `threatDirectionSummonPosition()`（`registry.ts:200-226`）：零威胁向量时，改用**规范来源排名**（在排序后的装备来源列表中的名次）或对 `sourceKey` 做稳定哈希来算方位角，**不再读 `state.equipment.findIndex`**。要求同一套卡在任意槽位排列下角度完全一致。
2. `moveTargetFor()`（`enemySystem.ts:143`）：`priorityWeight` 相等时用稳定决胜键（如 `sourceCardType/sourceCardId/sourceBindingIndex`，缺失来源的临时召唤物退化到 `summon.id`），不再依赖 `state.summons` 的数组位置。

### 步骤 6 — 更新契约与文档（不可省略）

- `interpreter.ts:5-9` 文件头注释、`FUSION_RULES`（`interpreter.ts:23-33`）：加入 nova 分轴取最大、expiry 失败概率连乘、taunt 权重仲裁三条。
- `statusSystem.ts` 的 `CONFLICT_RULES`（15-29）：把「移动: taunt > 炮台；嘲讽源死亡即失效」扩写为权重仲裁 + 候选回退。
- `docs/装备被动融合契约.md`：更新总表，并把「顺序依赖：目前真实存在的三处」这类断言改为**「已知顺序依赖（清单）」**，因为本次修复前实际有五处（三个原子 + 两处召唤物），今后仍可能新增。
- `docs/manual-src/content_atoms.py:228,235`：那两段文案明确写着 `priorityWeight` 是死参数，必须改。改完按 `docs/manual-src/build.py` 的既有流程重生成手册 PDF（生成器已入库）。

### 步骤 7 — 跑全量校验

```
npm run validate
npm run test
npm run build
```

golden replay 若出现差异，**逐项人工审查每一条差异并在提交说明中解释来源**，确认全部可归因于本次融合语义变更后，再用 `npm run replay:record` 重录基线。**禁止不看差异直接重录。**

---

## 4. 验收测试矩阵（新增测试，建议放 `tests/skillCompatibility.test.ts` 与新建 `tests/fusionOrderInvariance.test.ts`）

参考 `tests/skillCompatibility.test.ts:114-162` 已有的换槽不变性写法。

**槽位不变性**

1. 两张卡的全部 2 种排列、三张卡的全部 6 种排列，`getModifiers()` 结果严格 `toEqual`。
2. 换槽测试必须复用**同一批卡实例 id**，避免测试自身把 id 差异混进来。
3. passive aura 与 interval 同帧触发的集成测试：换槽后事件序列与 RNG 消耗次数一致。
4. 两个同 `priorityWeight` 的召唤物场景 + 无敌人时的放置场景，换槽后召唤物坐标一致。

**novaOnBreak**

5. `{40,70}` + `{30,135}` → `{40,135}`；且真实破盾后的敌人 HP、位移、`retaliationNova` VFX、事件序列在两种槽位下一致。
6. 同一张卡多次声明（构造 aegis 式 `{28,70}`→`{30,135}`→`{50,130}`）仍得到 `{50,130}`，**不是** `{50,135}`。
7. `damage: 0, knockbackDistance: 0` 的来源仍使 `mods.novaOnBreak !== null`（回归保护 `tests/bossBehavior.test.ts:155,172`）。
8. `retaliationMul` 先缩放、后比较：验证被缩放后才反超的卡能正确胜出。

**expiryConvert**

9. `0.5 + 0.65 = 0.825`（`toBeCloseTo`）；`0.5 + 0.65 + 0.45` 按连乘 = `1 - 0.5×0.35×0.55 = 0.90375`。
10. `ratio = 0` 单来源：`expiryConvert !== null` 且**仍消费一次 RNG**。
11. `ratio = 1` 任一来源存在 → 结果恒为 1。
12. 无来源 → `null` 且不消费 RNG。
13. 阈值两侧：构造 rng 返回值恰好落在 0.825 两侧，验证转化与否。

**taunt**

14. 施加顺序置换 → 仲裁结果一致。
15. 高 `priorityWeight` 来源覆盖低权重来源。
16. 同权重时按 `remaining` 决胜，再同按 `sourceKey` 决胜。
17. 同来源重复施加 → 候选数不增长，`remaining` 取 max。
18. 强来源过期 → 自动回退到仍存活的弱来源（而不是完全解除嘲讽）。
19. 关联召唤物死亡 → 只移除该候选，其余候选继续生效。
20. Boss 撞毁召唤物（`enemySystem.ts:329` 路径）→ 只移除指向该召唤物的候选。
21. `moveTargetFor` 与 `tauntPulse` VFX 指向同一个仲裁结果。

**最终验收断言**

> 固定卡实例、固定初始状态、固定 seed，跑一段完整战斗；交换任意两个装备槽后重跑，`getModifiers()` 输出、事件序列、RNG 抽取次数、以及结束时的完整战斗状态**逐位一致**。

---

## 5. 明确不要做的事

- **不要**让 Nova 伤害直接相加 —— 会显著抬高反击流强度，需重新校准防御向数值。
- **不要**让每张 Nova 卡独立执行一次范围反击 —— 会改变击退疲劳（`statusSystem.ts:158-162`）、击杀归因与事件顺序。
- **不要**让 `expiryConvert` 每来源独立掷骰 —— 会增加 RNG 消耗次数，导致后续回放随机流整体漂移，并可能对同一枚掉落重复发放 XP。
- **不要**只做排序就收工（见步骤 2 说明）。
- **不要**改变 `Modifiers` 中 `novaOnBreak` / `expiryConvert` 的数据形状，也不要改 `runtime.ts` / `dropSystem.ts` 两个消费端。
- **不要**给 `novaOnBreak` / `expiryConvert` 的 `chance` 参数补语义。
- **不要**把环境召唤物的 `tauntRadius` 吸引并入 `isControlled()` 的受控增伤判定。
- **不要**顺手统一显式 taunt 与召唤物 `tauntRadius` 的权重竞争（那是后续任务；本次只保证两者各自确定性）。
- **不要**在未审查差异的情况下重录 golden fixture。

---

## 6. 已知的、本次**不**处理但需要在提交说明中记一笔的问题

`aegis` 走 3:option2 → 5:option2 时，5★ 分支给的 `novaOnBreak = {30,135}`（击退特化）在 6★ shared 节点 `{50,130}` 处被覆盖，导致该分支的击退特化在满星时消失。这是**内容设计问题，不是引擎问题**，本次按现状保留（卡内后写覆盖），请在提交说明里单独提出，交给设计侧决定是否调整 6★ shared 的数值。
