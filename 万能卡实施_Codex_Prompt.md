# 任务：把「万能卡」实装为独立机制（ProjectVL）

你在 ProjectVL 仓库工作（主分支最新提交 `f2c0685`）。本任务把「万能卡」做成一个**边界清晰的独立资源机制**，为下一步接入稀有奖励做准备。本轮**不做**任何掉落来源（Boss/Bounty/普通掉落一律不碰），只提供一个 DEV「生成万能卡」测试功能。

下面所有文件路径、类型名、函数签名都已对照当前真实代码核实，请严格按现状改，不要引入本文件未提到的抽象。

---

## 0. 已定机制（不要改动这些决策）

1. 万能卡是**独立资源**，不是 `Card`，不进 `state.cards`，不参与自动合成。
2. 按星级分别计数储存，合法星级 `1..maxStar-1`（当前 `maxStar=6`，即 1★–5★）。
3. 万能卡槽**没有「当前选中星级」**。拖到目标卡时，读取**目标卡当前星级**，自动消耗对应星级的万能卡：目标 1★→消耗 1★ 万能卡，目标 4★→消耗 4★ 万能卡。对应星级库存为 0 则失败。
4. 操作统一为**拖曳**（与手牌拖到装备升星一致），不做「点选再点目标」。整个万能卡槽是一个统一拖拽源。
5. 万能卡固定占据手牌区**第 8 个视觉位**（`.cards` 是 4 列网格，`handSlots=7`，右下角第 8 格当前是空白）。`handSlots` 保持 7，不要改成 8。
6. 万能卡能升级**手牌卡和装备卡**；目标原地 `star++`，保留卡 `id`。
7. 万能合成**算作一次正常合成**：`state.merges++` 且触发一次 `onMerge`。
8. 目标在手牌时，升星后**继续执行普通自动连锁合成**（`autoMergeCards`）；目标在装备时**只升一级**，不跨栏触发手牌自动合成。
9. 拖到战场 / 拖到万能卡槽自身 / 空槽 / 满星 / 无对应库存：全部安全失败，绝不消耗错误的万能卡。
10. `resonance`（同调卡）本轮忽略：不入卡池、不建卡实例；只清理遗留文档/注释（见 §12）。

---

## 1. 关键代码现状（务必按此改，勿臆造）

- **拖拽源类型是 `SlotSource`**，定义在 `src/ui/slotFactory.ts`：`export type SlotSource = 'cards' | 'equipment';`。它被 `src/input/pointerRouter.ts` 和 `src/game.ts` 使用。**要新增的是它**，不是在 core 里新建 `DragSource`。
- **`SlotKind`**（`src/core/types.ts`）= `'cards' | 'equipment'`，是「可放置槽位归属」。**不要**给它加 `wildcard`。
- **没有 `commitMerge()` 这个函数。** 当前「正常合成」的写法是内联的两步：`state.merges++;` 加 `fireTrigger(state, config, rng, 'onMerge', { merge: { cardType, resultStar } })`。它出现在两处：
  - `src/core/systems/cardSystem.ts` 的 `autoMergeCards()`
  - `src/core/systems/equipmentSystem.ts` 的 `feed()`（另外还 `state.equipOps++`）
- `autoMergeCards(state, config, rng)` 返回 `{ merged: number; events: GameEvent[] }`。
- `feed()` 里装备升星是 `target.star++`（原地、保留 id），并 push `{ type: 'fed', ..., slotIndex, targetCardId }`。万能卡升级装备用同样语义。
- `PreviewSpec`（`src/input/pointerRouter.ts`）当前只有 `{ placement:'point'; radius } | { placement:'screen' }`。
- `targetAt()`（`pointerRouter.ts`）只把 `data-testid="card-slot"` 和 `="equipment-slot"` 识别为落点。万能卡槽必须用**别的** testid（如 `wildcard-slot`），才不会被当成落点。
- `formatToast()`（`src/ui/eventText.ts`）是对 `GameEvent['type']` 的 switch，且返回类型是 `string | null`、无 default。**新增事件类型后必须补 case**，否则 TS 报「并非所有路径都有返回值」。
- `SLOT_CHANGING`（`eventText.ts`）是触发槽位重绘的事件集合。
- DEV 测试按钮现状：`index.html` 里 `<button id="testCardBtn" hidden>`；`src/game.ts` 用 `refs.testCardBtn.removeAttribute('hidden')` 解除隐藏并绑定点击。DEV 调试接口是 `window.__game`，接口定义在 `src/debug/exposeDebugApi.ts` 的 `DebugApi`。

---

## 2. 数据结构（`src/core/types.ts`）

新增独立库存类型，并加到 `GameState`：

```ts
export type WildcardInventory = Record<number, number>;
```

在 `GameState` 里 `equipment` 字段附近加：

```ts
  /** 按目标当前星级储存的万能卡数量；合法键 1..maxStar-1（当前 1..5）。独立于 cards/equipment。 */
  wildcards: WildcardInventory;
```

`GameEvent` 联合类型新增三个成员：

```ts
  | { type: 'wildcardsGranted'; grants: Array<{ star: number; count: number }> }
  | {
      type: 'wildcardMerged';
      cardType: CardType;
      consumedStar: number;
      resultStar: number;
      targetKind: SlotKind;
      targetIndex: number;
      targetCardId: number;
    }
  | { type: 'wildcardMergeRejected'; reason: 'emptyTarget' | 'maxStar' | 'missingWildcard'; requiredStar?: number }
```

**不要**伪造 `merged` / `fed` 事件来复用表现——万能合成是第三种明确玩家操作，遥测/调试需能区分。它只是在底层同样计入 `merges` 并触发 `onMerge`。

`src/core/createInitialState.ts` 的 `createInitialState()` 返回对象里加：

```ts
    wildcards: createEmptyWildcardInventory(cfg.economy.maxStar),
```

并在该文件加一个纯函数：

```ts
function createEmptyWildcardInventory(maxStar: number): WildcardInventory {
  const inv: WildcardInventory = {};
  for (let star = 1; star < maxStar; star++) inv[star] = 0;
  return inv;
}
```

（记得 import `WildcardInventory`。）

---

## 3.（推荐）抽出 `commitMerge()`，统一「正常合成」

为保证万能合成与既有两种合成走同一结算点，在 `src/core/systems/cardSystem.ts` 抽出：

```ts
export function commitMerge(state: GameState, config: Config, rng: Rng, cardType: CardType, resultStar: number): GameEvent[] {
  state.merges++;
  return fireTrigger(state, config, rng, 'onMerge', { merge: { cardType, resultStar } });
}
```

然后把 `autoMergeCards()` 和 `equipmentSystem.ts` 的 `feed()` 里那两行内联替换为调用 `commitMerge(...)`（`feed()` 的 `state.equipOps++` 保留）。这样三种合成不会漏掉任何 `onMerge` 机制。

> 若你判断改动既有两处风险偏高，可退而在 §4 的 `useWildcardOnSlot` 里**原样内联**同样两行（`state.merges++` + `fireTrigger(...,'onMerge',...)`），但仍必须与 `feed()` 的写法逐字一致。优先做抽取版。

---

## 4. 新增纯规则系统 `src/core/systems/wildcardSystem.ts`

三个公开函数，全部纯规则（core/ 内禁止 DOM）。用 `import { cfg } from '../../config'` 读 `maxStar`，`config`/`rng` 走参数（对照 `cardSystem.ts`）。

### 4.1 合法性检查（唯一判定源）

```ts
export type WildcardUseFailure = 'emptyTarget' | 'maxStar' | 'missingWildcard';
export type WildcardUseCheck =
  | { ok: true; requiredStar: number; target: Card }
  | { ok: false; reason: WildcardUseFailure; requiredStar?: number };

export function checkWildcardTarget(state: GameState, targetKind: SlotKind, targetIndex: number): WildcardUseCheck {
  const target = targetKind === 'cards' ? state.cards[targetIndex] : state.equipment[targetIndex];
  if (!target) return { ok: false, reason: 'emptyTarget' };
  if (target.star >= cfg.economy.maxStar) return { ok: false, reason: 'maxStar', requiredStar: target.star };
  if ((state.wildcards[target.star] ?? 0) <= 0) return { ok: false, reason: 'missingWildcard', requiredStar: target.star };
  return { ok: true, requiredStar: target.star, target };
}
```

此函数同时服务：规则结算、拖拽高亮、单测——避免「UI 说能合、规则层拒绝」的分叉。

### 4.2 发放（只改库存，不涉及任何来源）

```ts
export interface WildcardGrant { star: number; count: number; }

export function grantWildcards(state: GameState, grants: WildcardGrant[]): GameEvent[] {
  const applied: WildcardGrant[] = [];
  for (const g of grants) {
    if (g.star < 1 || g.star >= cfg.economy.maxStar || g.count <= 0) continue;
    state.wildcards[g.star] = (state.wildcards[g.star] ?? 0) + g.count;
    applied.push(g);
  }
  return applied.length ? [{ type: 'wildcardsGranted', grants: applied }] : [];
}
```

### 4.3 对目标槽使用万能卡

```ts
export function useWildcardOnSlot(state: GameState, config: Config, rng: Rng, targetKind: SlotKind, targetIndex: number): GameEvent[] {
  const check = checkWildcardTarget(state, targetKind, targetIndex);
  if (!check.ok) return [{ type: 'wildcardMergeRejected', reason: check.reason, requiredStar: check.requiredStar }];

  const target = check.target;
  const consumedStar = check.requiredStar;
  state.wildcards[consumedStar]--;
  target.star++;
  if (targetKind === 'equipment') state.equipOps++;

  const events: GameEvent[] = [{
    type: 'wildcardMerged',
    cardType: target.type,
    consumedStar,
    resultStar: target.star,
    targetKind,
    targetIndex,
    targetCardId: target.id,
  }];
  events.push(...commitMerge(state, config, rng, target.type, target.star)); // 或内联等价两行
  if (targetKind === 'cards') events.push(...autoMergeCards(state, config, rng).events);
  return events;
}
```

**结算顺序**（务必）：先 `wildcardMerged` → 再该次合成的 `onMerge` 效果事件 → 再（仅手牌）自动连锁合成的 `merged` 及其 `onMerge`。即每次合成保持独立的正常结算时点。

---

## 5. 事件表现接入

### 5.1 `src/ui/eventText.ts`
- `SLOT_CHANGING` 集合加入 `'wildcardsGranted'` 和 `'wildcardMerged'`（`wildcardMergeRejected` 不需重绘）。
- `formatToast()` 补三个 case：
  - `wildcardsGranted` → `T.testWildcards`
  - `wildcardMerged` → `fmt(T.wildcardMerged, { name: name(ev.cardType), star: ev.resultStar })`
  - `wildcardMergeRejected` → `ev.reason === 'missingWildcard' ? fmt(T.wildcardMissing, { star: ev.requiredStar }) : ev.reason === 'maxStar' ? T.wildcardMaxStar : null`（`emptyTarget` 返回 `null`）

### 5.2 `src/data/texts.json`
- `buttons` 加：`"testWildcard": "生成万能卡"`
- `toast` 加：
  ```json
  "testWildcards": "获得 1–5★ 万能卡各 1 张",
  "wildcardMerged": "万能合成：{name} 升至 {star}★",
  "wildcardMissing": "没有 {star}★ 万能卡",
  "wildcardMaxStar": "目标已是最高星级"
  ```
- 另加万能卡槽文案（供 §7 UI）：
  ```json
  "wildcard": { "name": "万能", "hint": "拖到同星卡/装备升星" }
  ```
  放在 texts.json 顶层（与 `toast`/`buttons` 同级），UI 从 `texts.wildcard` 读取。

### 5.3 升级反馈 `src/ui/upgradeFeedback.ts`
在 `resolveUpgradeCandidates()` 里增加对 `wildcardMerged` 的处理。注意现有那行 `const copy = cardCopy[event.type === 'merged' || event.type === 'fed' || event.type === 'equipped' ? event.cardType : ''];` 需把 `wildcardMerged` 纳入取 `cardType` 的条件；然后追加分支：

```ts
} else if (event.type === 'wildcardMerged') {
  const section = event.targetKind === 'equipment' ? copy.equip : copy.hand;
  const milestone = exactMilestone(section, event.resultStar);
  if (milestone) candidates.push({
    ...milestone,
    cardType: event.cardType,
    source: event.targetKind === 'equipment' ? 'equipment' : 'hand',
    targetCardId: event.targetCardId,
    slotIndex: event.targetKind === 'equipment' ? event.targetIndex : undefined,
  });
}
```

这样目标卡按其升到的星级复用现有 `upgrade-pulse` / 里程碑 / 6★ 变形庆祝，无需新动画系统。

---

## 6. 拖拽层改造

### 6.1 `src/ui/slotFactory.ts`
把拖拽源类型扩为：

```ts
export type SlotSource = 'cards' | 'equipment' | 'wildcard';
```

`SlotHandlers.dragStart` 签名不变（`source` 类型随之变宽即可）。

### 6.2 `src/input/pointerRouter.ts`
- `PreviewSpec` 增加 `| { placement: 'none' }`。
- `showPreview()`：在计算落点预览前，若 `active.source === 'wildcard'` 则不显示战场/全屏预览（`preview.placement === 'none'` 时两个 preview 都不 `add('show')` 并 `return`）。同时保留对 `card-slot`/`equipment-slot` 的 `.hot` 高亮逻辑（万能卡拖到这些槽时也应有 hot 反馈，见 §8）。
- `targetAt()` **不改选择器**——保持只认 `card-slot`/`equipment-slot`，从而万能卡槽自身、战场以外都走 cancel/arena；万能卡拖到战场会得到 `{kind:'arena'}`，由 game.ts 分流时忽略。

### 6.3 `src/game.ts`
- `previewFor(source, index)` 目前形参是字面量联合 `'cards' | 'equipment'`。改为接受 `SlotSource`，并在最前面加：
  ```ts
  if (source === 'wildcard') return { placement: 'none' };
  ```
  其余逻辑只对 cards/equipment 取卡。
- `onDrop` 分流：**万能卡分支必须排在战场消耗分支之前**，防止 `'wildcard'` 被错误传给 `consumeCard()`：
  ```ts
  onDrop: (source, index, target) => {
    let events: GameEvent[] = [];
    if (source === 'wildcard') {
      if (target.kind === 'slot') events = useWildcardOnSlot(state, config, rng, target.slotKind, target.index);
      // 拖到 arena / 其他：不做任何事
    } else if (target.kind === 'arena') {
      events = consumeCard(state, config, rng, index, target.x, target.y, source);
    } else if (target.kind === 'slot' && target.slotKind === 'equipment' && source === 'cards') {
      events = moveOrSwap(state, config, rng, source, index, 'equipment', target.index);
      if (events.some(e => e.type === 'equipRejected' || e.type === 'equipFull')) state.equipTelemetry.rejects++;
    } else if (target.kind === 'slot') {
      events = moveOrSwap(state, config, rng, source, index, target.slotKind, target.index);
    }
    dispatch(events);
    // 保留现有 telemetry 记录逻辑
  }
  ```
  记得 `import { useWildcardOnSlot } from './core/systems/wildcardSystem'`（发放函数见 §9）。

---

## 7. 固定万能卡槽 UI

新建 `src/ui/wildcardSlot.ts`：

```ts
export function makeWildcardSlot(inventory: WildcardInventory, handlers: SlotHandlers): HTMLDivElement
```

要点：
- 外层 `<div class="card-slot wildcard-slot" data-testid="wildcard-slot">`——**testid 必须是 `wildcard-slot`，绝不能是 `card-slot`**（否则会被 `targetAt` 当落点）。
- 内部一个统一按钮（整槽单一拖拽源，不要让 5 个数字各自可拖）：`pointerdown` 调 `handlers.dragStart(e, 'wildcard', 0, el)`（`0` 只是固定占位索引，与星级无关）。
- 显示各星级数量（1★–5★，即 `1..maxStar-1`）。两列布局适配约 72px 高度。数量为 0 的星级降透明度，>0 用金色。
- 空库存（全 0）时：槽位仍固定显示、数字全 0、`aria-disabled="true"`、样式变暗、**不开始拖拽**（`dragStart` 前判断总数为 0 则不 begin）。不要隐藏整槽。
- 文案取 `texts.wildcard.name` / `texts.wildcard.hint`。

`src/ui/renderCards.ts`：在现有 7 格循环之后，追加第 8 个视觉槽：

```ts
refs.cards.append(makeWildcardSlot(state.wildcards, handlers));
```

保持 `for (let i = 0; i < cfg.economy.handSlots; i++)` 不变（仍 7 格）。

`src/styles/app.css`（`.cards` 是 `repeat(4,...)`，第 8 格自然落到右下角）新增：

```css
.wildcard-slot { /* 复用 .card-slot 尺寸；金紫色调区分 */ }
.card-slot.wildcard-valid, .equip-slot.wildcard-valid { border-color: var(--gold); background:#ffcf5c20; box-shadow:0 0 16px #ffcf5c55; }
.card-slot.wildcard-invalid, .equip-slot.wildcard-invalid { border-color:#d85c6a; background:#d85c6a14; }
```

---

## 8.（推荐）目标合法性高亮

拖动万能卡时，给指针下方的手牌/装备槽显示可否升级。可在 pointerRouter 的 `showPreview` 中，当 `active.source === 'wildcard'` 且悬停在 `card-slot`/`equipment-slot` 上时，调用一个注入的 `getDropValidity?(source, index, target)` 回调决定加 `wildcard-valid` 还是 `wildcard-invalid`（清除时连同 `.hot` 一起移除）。`game.ts` 提供实现，内部调用 `checkWildcardTarget(state, target.slotKind, target.index)`。

**即便有高亮，`useWildcardOnSlot` 释放时仍必须重新 `checkWildcardTarget`**，不得信任拖拽开始时的旧状态。

若时间紧，本节可后置，但 §1–§7、§9、§10 必须完成。

---

## 9. DEV 测试功能

### 9.1 按钮
- `index.html`：在 `.dock-actions` 内、`testCardBtn` 旁加
  `<button class="btn" id="testWildcardBtn" hidden>生成万能卡</button>`
- `src/ui/domRefs.ts`：`getDomRefs()` 加 `testWildcardBtn: el<HTMLButtonElement>('#testWildcardBtn'),`
- `src/game.ts`：DEV 块里 `refs.testWildcardBtn.removeAttribute('hidden');`（与 `testCardBtn` 同处）；并绑定：
  ```ts
  refs.testWildcardBtn.addEventListener('click', () => {
    const grants: WildcardGrant[] = [];
    for (let star = 1; star < cfg.economy.maxStar; star++) grants.push({ star, count: 1 });
    dispatch(grantWildcards(state, grants));
  });
  ```
  （import `grantWildcards` / `WildcardGrant`。）每点一次：1★–5★ 各 +1。

### 9.2 调试接口
`src/debug/exposeDebugApi.ts` 的 `DebugApi` 接口加 `grantWildcard(star: number, count?: number): void;`；`game.ts` 里 `exposeDebugApi({...})` 实现：

```ts
grantWildcard: (star, count = 1) => dispatch(grantWildcards(state, [{ star, count }])),
```

**不新增**：地面万能卡、拾取半径、掉落动画、Boss/Bounty 奖励、掉率配置。

---

## 10. 必须新增的自动化测试 `tests/wildcardSystem.test.ts`

沿用现有 vitest 风格（见 `tests/cardSystem.test.ts`、`equipmentSystem.test.ts`）。至少覆盖：

1. **发放不占手牌**：`grantWildcards` 后 `state.cards.length === 7` 且全 `null`，`state.wildcards[1] === 1`。
2. **升级手牌**：库存 2★×1，手牌一张 2★ → 结果 3★、库存 2★×0、`merges` +1。
3. **升级装备**：库存 3★×1，装备一张 3★ → 结果 4★、装备卡 `id` 不变、`equipOps` +1。
4. **缺对应库存**：库存 1★×1、目标 2★ → 返回 `wildcardMergeRejected` `missingWildcard`，库存/目标/`merges` 均不变。
5. **空槽**：拖到空手牌/空装备槽 → `emptyTarget`，无消耗、无合成。
6. **满星**：目标 6★ → `maxStar`，不消耗、不触发 `onMerge`。
7. **手牌连续合成**：手牌 1★A + 2★A，库存 1★×1，对 1★A 用万能 → 最终 3★A，`merges` +2，事件序列 `wildcardMerged(1→2)` 在前、`merged(→3)` 在后。
8. **装备不跨栏自动合成**：装备 2★A + 手牌 3★A，库存 2★×1，升级装备 → 装备 3★A，手牌 3★A 不变。
9. **真正走了 `onMerge` 总线**：注册一份监听 `onMerge` 的测试技能定义并装备，验证万能合成产生对应效果事件（不能只断言 `state.merges === 1`）。
10. **自动合成永不读万能库存**：手牌仅一张 1★A、库存 1★×100，单独调 `autoMergeCards` → 0 次合成。

可选（若改到）：`upgradeFeedback.test.ts` 增补 `wildcardMerged` 手牌/装备里程碑用例。

完成后运行 `npm test`（或仓库既有命令）确保全绿，并 `npm run build` / `tsc` 无类型错误（尤其 `formatToast` 的 switch 完整性、`SlotSource`/`previewFor` 变宽）。

---

## 11. 人工验收（DEV 构建）

- **位置**：手牌区仍 7 普通格，右下角出现固定万能卡槽；满手判断仍按 7 张。
- **生成**：点「生成万能卡」→ 1★–5★ 从 0→1；再点 →2；不产生普通手牌卡。
- **手牌升级**：造一张 2★ 手牌，从万能卡槽拖到它 → 消耗 2★ 万能卡、目标变 3★、`merges`+1、播放既有 3★ 升级反馈。
- **装备升级**：装备一张 3★，拖万能槽到它 → 3★ 万能 −1、装备原地 4★、不卸下/不替换。
- **非法目标**：空手牌槽 / 空装备槽 / 无对应库存的卡 / 6★ 卡 / 战场 / 万能槽自身——都不消耗错误万能卡。
- **连续合成**：手牌 1★A 与 2★A，生成 1★ 万能，拖到 1★A → 最终 3★A、`merges`+2。

---

## 12. `resonance` 遗留清理（只删说明，不删通用基建）

删除/修订以下遗留说明即可（**不动** `skills.json` 卡实例，本轮无 resonance 卡）：
- `src/core/systems/dropSystem.ts` 中「同调 resonance 待 S4b」注释。
- `src/core/types.ts` 中以「同调」举例的注释（`Buff` 上方那条）。
- `docs/P2_技能体系框架与首批卡牌设计表.md` 卡 10 · 同调条目及批次数量表（批次 2 由 5 张改述为 4 张）。
- `docs/P5_批次2_验收证据表.md`、`docs/可玩原型_重启开发总计划.md`、`docs/S4a_经济拍板_provisional.md` 等处「同调搁置/待 S4b」表述按「已删除」更新。

**保留**通用基建：`onMerge` 触发器、`mergePulse` 效果原子、通用 `mergeRule` 数据类型——它们不是 resonance 卡本体，且万能合成依赖 `onMerge`。

---

## 13. 实施顺序（风险最低）

1. `types.ts` 加 `WildcardInventory` + `GameState.wildcards` + 三事件；`createInitialState` 初始化。
2. （推荐）抽 `commitMerge()`，替换 `autoMergeCards`/`feed` 两处内联。
3. 新建 `wildcardSystem.ts` + 单测（纯规则，先跑绿）。
4. `eventText`（SLOT_CHANGING + formatToast）、`texts.json`、`upgradeFeedback` 接入。
5. 新建 `wildcardSlot.ts`；`renderCards` 末尾追加第 8 槽；CSS。
6. 扩 `SlotSource`；`pointerRouter`（PreviewSpec none + showPreview）。
7. `game.ts` onDrop/previewFor 分流（万能分支在最前）。
8. DEV 按钮 + `window.__game.grantWildcard`。
9. （推荐）目标高亮 §8。
10. 人工验收 §11；最后清理 §12。

交付后，任何奖励系统只需调用 `grantWildcards(state, grants)` 即可发放，无需再改合成/交互底层。
