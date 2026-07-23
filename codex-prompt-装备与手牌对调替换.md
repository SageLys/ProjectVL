# Codex 任务：装备可与手牌「直接对调替换」+ 左侧调试区加「对调开关」用于 A/B 对比

## 0. 背景与目标
当前版本里，**已装备的技能卡只能被一次性拖到战场消耗**来腾出装备槽（`unequipPolicy: 'consume'`）。
本次要新增一种取下方式：**装备卡可以直接与手牌对调替换**——把手牌拖到已占用的装备槽时，两张卡互换位置；把装备卡拖回手牌区时，装备卡回到手牌、原手牌位若有卡则换上装备槽。

同时我们要**对比新旧两种手感**，因此需要在**左侧调试区（开发调参面板 `src/ui/tunerPanel.ts` 的「调试模式」区块）新增一个开关**，运行时切换「对调是否可用」：
- 开关 **ON** = 新行为（可对调，本次默认值）
- 开关 **OFF** = 旧行为（装备只能拖到战场一次性消耗，无法与手牌对调）

**默认值 = ON（新行为作为新基准）。** 关掉开关即回到旧的纯消耗手感，方便直接对比。

---

## 1. 配置层（新增可运行时切换的开关）
文件：`src/config/base/economy.json`、`src/config/types.ts`

1. 在 `EconomyConfig`（`src/config/types.ts` 的 `interface EconomyConfig`）中新增字段：
   ```ts
   equipSwappable: boolean;
   ```
   放在 `unequipPolicy` / `feedEquipped` 附近即可。**不要**改动现有的 `equipIrreversible: false` 与 `unequipPolicy: 'consume'` 这两个字面量类型（保持原样）。
2. 在 `src/config/base/economy.json` 中新增默认值：
   ```json
   "equipSwappable": true,
   ```
3. 该字段需**可在运行时被调试面板直接改写**（参照现有 `cfg.bounty.enabled` 的运行时切换方式：直接改 `cfg.economy.equipSwappable = 布尔值` 即生效，不需要重开局）。

---

## 2. 核心逻辑（唯一改动点集中在 `moveOrSwap`）
文件：`src/core/systems/equipmentSystem.ts` → `moveOrSwap(...)`

当前有两处 guard 阻止对调，请把它们**改为受 `cfg.economy.equipSwappable` 控制**：

### 2.1 放开「装备 → 手牌」方向
现有：
```ts
if (sourceKind === 'equipment' && targetKind !== 'equipment') return [];
```
改为：**仅当 `equipSwappable` 为 false 时才拦截**。开关 ON 时允许装备卡移动/交换回手牌。

### 2.2 放开「手牌 → 已占用装备槽」的交换
现有：
```ts
if (sourceKind === 'cards' && replaced) return [{ type: 'equipFull' }];
```
改为：**开关 OFF 时保持返回 `equipFull`（旧行为）**；**开关 ON 时执行交换**（手牌卡进装备槽、原装备卡回到该手牌位）。

### 2.3 必须保持的既有语义（务必不要破坏）
以下是本次**不变**的规则，交换逻辑必须继续满足它们：

1. **喂养优先（feedEquipped）**：拖入的手牌与目标已装备卡「同型 + 同星 + 未满星」时，**仍然优先执行喂养升星**（现有 `feed(...)` 分支保留在最前，优先于对调）。这是产品明确要求。
2. **装备槽不变量**：任何一张卡**落入装备槽**（无论来自手牌方向、还是「装备→手牌」反向交换时被换进装备槽的那张手牌）都必须满足：
   - `moving.star >= cfg.economy.equipThreshold`（≥3★）；不满足 → 返回 `[{ type: 'equipRejected', reason: 'star' }]`，且**整个交换不发生**（两个槽都不动）。
   - 满足 `equipDistinctTypes` 唯一性：`duplicateEquippedType(state.equipment, 该卡, targetEquipIndex)` 为空；不满足 → 返回 `[{ type: 'equipRejected', reason: 'duplicate' }]`，交换不发生。
   > 换言之：`equipThreshold` 与 `equipDistinctTypes` 校验的对象，是「**最终会停在装备槽里的那张卡**」，而不是简单按方向判断。反向交换（装备→手牌，且目标手牌位有卡）会把手牌卡塞进装备槽，此时必须对那张手牌卡做同样校验，校验失败则**拒绝整次交换**，绝不允许非法卡停留在装备槽。
   - 落入**手牌**的卡无任何星级/唯一性限制。
3. **纯移动到空位**：装备→空手牌位 = 干净卸下（装备槽置 null，手牌位填入原装备卡）；手牌→空装备槽 = 原有装备逻辑不变。
4. `equipOps` / `consumes` 等计数、以及现有 `equipped` / `swapped` / `moved` / `fed` 事件的语义保持一致：
   - 装备↔手牌成功对调，发出 `swapped` 事件（携带双方类型），使 `SLOT_CHANGING` 命中并触发两侧槽位重渲染。
   - 校验失败发出 `equipRejected`（沿用现有 reason）。

### 2.4 战场消耗不受影响
`consumeCard(...)`（装备卡拖到战场一次性释放）**无论开关如何都保持可用、语义不变**。开关只影响「装备↔手牌」这条对调链路，不影响「装备→战场消耗」。

---

## 3. 事件路由核对（`src/game.ts` → `onDrop`）
无需大改，但请核对以下三条链路在开关 ON 时都能正确走到 `moveOrSwap`：

1. **装备 → 战场**：`target.kind === 'arena'` → `consumeCard(...)`（不变）。
2. **手牌 → 装备槽（含已占用）**：现有分支
   ```ts
   else if (target.kind === 'slot' && target.slotKind === 'equipment' && source === 'cards')
   ```
   → `moveOrSwap(...)`；确认 `equipFull`（OFF 时）与 `swapped`（ON 时）都被 `state.equipTelemetry.rejects` / `SLOT_CHANGING` 正确区分处理。
3. **装备 → 手牌槽**：走末尾 `else if (target.kind === 'slot')` → `moveOrSwap(state, config, rng, 'equipment', index, 'cards', target.index)`。确认拖动已装备卡到手牌区时 `pointerRouter` / `slotFactory` 能把 `source='equipment'`、正确 `index` 透传到此处（参考 `codex-prompt-BUG-装备消耗后占位未释放.md` 里已梳理的来源链），且落点被判为 hand 的 `slot` 而非 `arena`。

若发现 `getDropValidity` / 拖拽预览（`previewFor`）对「装备→手牌」判定为非法而挡住手势，请一并放开（仅在 `equipSwappable` 为 true 时允许该拖放）。

---

## 4. 左侧调试区：新增「对调开关」
文件：`src/ui/tunerPanel.ts`（及必要时 `tunerPanel.css`）

在**「调试模式」区块**（含 `jumpWaveInput` / `seedInput` / `timeScaleInput` / `invincibleInput` 的那个 `<section class="tuner-group"><h3>调试模式</h3>` 内）新增一个 checkbox，**完全参照现有 `#bountyEnabledInput` 的实现方式**：

1. HTML：加一个
   ```html
   <label class="debug-check"><input id="equipSwappableInput" type="checkbox">装备可与手牌对调</label>
   ```
2. 初始化 `syncInputs()` 时：`equipSwappableInput.checked = cfg.economy.equipSwappable;`
3. `change` 事件：
   ```ts
   root.querySelector<HTMLInputElement>('#equipSwappableInput')!.addEventListener('change', event => {
     cfg.economy.equipSwappable = (event.currentTarget as HTMLInputElement).checked;
     syncInputs();
   });
   ```
   切换后**立即生效**（下一次拖放即按新开关判定），无需重开局。
4. 「恢复默认参数」(`#resetTunerBtn`) 逻辑里，把 `cfg.economy.equipSwappable` 一并复位到基线值（在面板初始化时用 `baselineEquipSwappable = cfg.economy.equipSwappable` 记录，reset 时还原，参照现有 `baselineBountyEnabled` 的做法）。
5. 若面板有 `diff` 高亮/`snapshot()` 机制，此开关可**不纳入** preset 快照（它是调试对比开关，不属于数值调参），保持最小改动即可。

> 遥测**不需要**记录该开关状态（本次明确不做 telemetry 打标）。

---

## 5. 回归测试
文件：`tests/equipmentSystem.test.ts`（沿用现有测试风格）

新增覆盖两种开关状态的用例：

**开关 ON（`cfg.economy.equipSwappable = true`）：**
1. 手牌 3★ 卡拖到**已占用**装备槽（异型）→ 两卡对调：装备槽变为新卡、原装备卡回到该手牌位；发出 `swapped`。
2. 已装备卡拖到**空手牌位** → 干净卸下：`state.equipment[i] === null`，手牌位得到该卡。
3. 已装备卡拖到**已占用手牌位**，且该手牌卡满足 ≥3★ 且不与其它装备槽同型 → 成功对调，装备槽换上手牌卡。
4. 反向交换会把**不满足 equipThreshold（<3★）** 的手牌卡塞进装备槽 → 返回 `equipRejected(reason:'star')`，**两个槽均不变**。
5. 反向交换会导致装备槽出现**重复类型**（违反 `equipDistinctTypes`）→ 返回 `equipRejected(reason:'duplicate')`，两个槽均不变。
6. **喂养优先**：手牌「同型同星未满星」卡拖到已装备卡 → 仍执行 `feed`（升星），**不**触发对调。

**开关 OFF（`cfg.economy.equipSwappable = false`）：**
7. 手牌拖到已占用装备槽 → 返回 `equipFull`，不发生对调（旧行为）。
8. 已装备卡拖到手牌区 → 返回 `[]`，装备槽不动（旧行为，装备仍只能拖战场消耗）。
9. 装备卡拖到战场消耗（`consumeCard`）→ 无论开关如何都正常释放并清空该装备槽。

要求 `npx vitest run` **全绿**。

---

## 6. 交付要求
1. 最小改动实现上述行为，改动集中在 `moveOrSwap`、`economy.json`/`types.ts`、`tunerPanel.ts`。
2. **不得破坏**既有正确行为：同型喂养、异型装备、`equipDistinctTypes` 唯一性、`equipFull` 提示（OFF 时）、装备→战场消耗后占位正确释放（见 `codex-prompt-BUG-装备消耗后占位未释放.md`）。
3. 装备↔手牌对调后，两侧槽位 DOM **立即刷新**（复用现有 `SLOT_CHANGING` → `refreshSlots()` 通路，必要时确认 `swapped` 已在 `SLOT_CHANGING` 集合中）。
4. 附**新增回归测试**并 `npx vitest run` 全绿。
5. 交付时用一句话说明：改了哪几处、开关默认值、以及如何在页面上切换验证（左侧调参面板 →「调试模式」→「装备可与手牌对调」勾选/取消）。

## 7. 关键文件
- `src/core/systems/equipmentSystem.ts`（`moveOrSwap` 核心改动；`consumeCard` 仅参照勿改语义）
- `src/config/base/economy.json`、`src/config/types.ts`（新增 `equipSwappable`）
- `src/ui/tunerPanel.ts`（+ `tunerPanel.css` 如需）（调试区开关）
- `src/game.ts`（`onDrop` 路由核对，一般无需改）
- `src/ui/eventText.ts`（确认 `swapped` ∈ `SLOT_CHANGING`）
- `tests/equipmentSystem.test.ts`（回归测试）
