# Codex 任务：修复「技能栏技能被消耗后，对应装备槽仍被占用、无法放入新装备」BUG

## 1. 现象（复现目标）
玩家把**已装备的技能**（`state.equipment` 里的卡）拖到战场一次性消耗后，该装备槽在界面上仍显示/仍被判定为「已占用」，导致无法把新卡放进这个槽位（拖入时被拒绝或表现为槽位还占着旧卡）。

## 2. 已排除的范围（**不要改这些，已用测试证明是正确的**）
我已对核心逻辑做了复现验证，以下全部**行为正确，请勿改动其语义**：

- `src/core/systems/equipmentSystem.ts` → `consumeCard(..., 'equipment')`：正确把 `state.equipment[index]` 置为 `null`，`state.equipment[1]` 消耗后为 `null`（已有单测 `tests/equipmentSystem.test.ts` 覆盖，且我另测了「消耗后再装同型/异型卡到同一槽」均成功返回 `equipped`）。
- `moveOrSwap(...)`：向已释放的空槽放入新卡（同型或异型）都能成功装备。
- `src/ui/eventText.ts` → `SLOT_CHANGING` 集合**已包含** `skillConsumed`。
- `src/game.ts` → `dispatch()`：当事件命中 `SLOT_CHANGING` 时会调用 `refreshSlots()`。
- `src/ui/renderEquipment.ts`：完全按 `state.equipment[i]` 重建 DOM；我用 happy-dom 复现「消耗事件 → 重渲染」后，槽位 DOM 正确变回空占位 `3★+`，`querySelector('[data-testid="equipped-card"]')` 为 `null`。

**结论：纯状态层 + 渲染层在隔离环境下都正确。** 因此 BUG 出在「真实指针手势 → 事件路由」这条链路上，而不在上面这些函数里。

## 3. 重点排查方向（按可能性排序）
请在**运行中的应用里**实拍复现（拖已装备卡到战场消耗，再尝试把新卡拖进该槽），并在 `src/game.ts` 的 `onDrop` 打日志（打印 `source`、`index`、`target`，以及 `consumeCard` 前后 `state.equipment` 的快照），定位真正断点。候选根因：

1. **`source` / `index` 路由错位（首要怀疑）**
   `src/game.ts` `onDrop` 中：
   ```ts
   } else if (target.kind === 'arena') events = consumeCard(state, config, rng, index, target.x, target.y, source);
   ```
   核对拖动「已装备卡」时到达这里的 `source` 是否真的是 `'equipment'`、`index` 是否是该装备槽的下标。若 `source` 误为 `'cards'`，`consumeCard` 会去清空 `state.cards[index]`，装备槽原封不动仍被占用——**这正好完美吻合现象**（技能效果照样释放，但装备没被移除）。
   一并核对来源链：`src/ui/slotFactory.ts`（`makeSlot('equipment', i, …)` → `createCardElement(card,'equipment',i,…)` → `dragStart(e,'equipment',i,el)`）与 `src/input/pointerRouter.ts` 的 `begin()` 是否把 `source/index` 原样透传到 `finish() → onDrop`。

2. **落点判定把「战场消耗」错判成「槽位交换」**
   `src/input/pointerRouter.ts` 的 `targetAt()` 用 `document.elementFromPoint()` + `closest('[data-testid="equipment-slot"]')`。确认从装备槽起手、抬指落在战场时，`target.kind` 确为 `'arena'`；若被判成 `slot`（例如残留的幽灵元素命中），会走 `moveOrSwap('equipment'→'equipment')` 交换而非消耗，槽位看似没释放。

3. **指针捕获 / 重渲染时序**
   `pointerRouter.begin` 对被拖的已装备卡 `el.setPointerCapture()`；而 `refreshSlots()` 会 `innerHTML=''` 销毁并重建所有卡元素。核查是否存在「手势中途元素被重建 → 捕获丢失 / 抬指事件落空 → `onDrop` 未触发 → `dispatch` 未跑 → 槽位不刷新」的竞态，留下仍显示旧卡的幽灵元素。

4. **幽灵元素拦截后续放置**
   若 #3 成立，旧卡 DOM 残留在槽内且带着 `pointerdown` 处理器；玩家想把新卡拖进去时，`elementFromPoint` 命中的是残留的 `equipped-card`，于是抓起的是幽灵卡而非空槽，表现为「占用、放不进」。

## 4. 交付要求
1. 用日志/断点定位到**唯一真实根因**（不要凭猜改多处）。
2. 做**最小改动**修复：确保「拖已装备卡到战场消耗」后，`state.equipment[该槽]` 被清空且装备栏 DOM 立即刷新为空占位，新卡可正常放入。
3. **不得破坏**第 2 节列出的既有正确行为（同型喂养、异型交换、`equipDistinctTypes` 唯一性、`equipFull` 提示等）。
4. **新增回归测试**覆盖本 BUG：优先写一个能跑通 `onDrop` 路由的指针级/手势级测试（happy-dom 下模拟 `pointerdown`(装备卡)→`pointermove`(进入 canvas 区)→`pointerup`，断言 `state.equipment[i]===null` 且装备槽 DOM 无 `[data-testid="equipped-card"]`）；若布局 API 在测试环境不可用，则至少直接断言 `onDrop('equipment', i, {kind:'arena',...})` 会清空对应槽并触发重渲染。
5. `npx vitest run` 全绿；附一句话说明根因与修复点。

## 5. 关键文件
- `src/game.ts`（`onDrop` 事件路由、`dispatch`、`refreshSlots`）
- `src/input/pointerRouter.ts`（`begin` / `finish` / `targetAt` / `resolveTarget`）
- `src/ui/slotFactory.ts`（`makeSlot` / `createCardElement` 的 `source/index` 透传）
- `src/core/systems/equipmentSystem.ts`（`consumeCard` / `moveOrSwap`，仅作参照，语义勿动）
- `src/ui/renderEquipment.ts`、`src/ui/eventText.ts`（渲染与 `SLOT_CHANGING`，参照）
