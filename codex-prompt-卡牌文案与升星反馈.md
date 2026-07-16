# Codex 任务 Prompt：卡牌效果文案 + 手牌/装备布局 + 升星反馈（魅魔题材）

> 使用方法：本文件分成 **四个独立阶段**，每个阶段都有自己的「===== PROMPT 开始 =====／===== PROMPT 结束 =====」块。
> **一次只把一个阶段的 PROMPT 块复制给 Codex，验收通过后再进行下一个阶段。** 推荐顺序即阶段 1→2→3→4。
> 本文档中的所有文件路径、函数签名、事件字段、tier 语义、颜色值、卡牌 ID 均已对照 `main` 分支真实代码核实（核实时间：2026-07-15，最新提交 `c2a129e`）。
> 注：本次未重新上传两张同类游戏参考截图，布局目标按「宁可拿出约三分之一屏幕做下方操作面板，也不要把信息压成看不清的小图标；参考游戏每排只放少量大按钮」这一原则落实，具体尺寸见阶段 2。

---

## 背景：当前代码的真实问题（四阶段共用）

以下均已核实，Codex 不要臆测：

1. **描述字段其实存在，但被 CSS 藏了。** `src/data/texts.json` 里每张卡有 `name` 和 `descByTier`（键为 `1/3/5/6`）。`src/ui/slotFactory.ts` 第 23 行确实把描述写进了 DOM：`...<small>${meta.desc}</small>`。但 `src/styles/app.css` 里写死了 `.card small { display:none; }`，且手牌卡高度只有 56px、`.card b` 字号 9px、`.card em`（星级）8px；`@media (max-height:720px)` 还会把卡牌压到 46px。**核心问题是布局没有为文字预留可读空间，不是缺字段。**

2. **手牌和装备错误共用同一套描述。** `createCardElement(card, source, ...)` 知道 `source` 是 `'cards'` 还是 `'equipment'`，但调用的 `resolveCardMeta(card.type, card.star)`（`src/ui/cardMeta.ts`）**没有上下文参数**，只按星级用 `nearestTier` 选 `1/3/5/6` 档。于是「拖到战场消耗的即时效果」和「装备后的常驻效果」被塞进同一个 `descByTier`，语义错误。

3. **七张手牌单排密度过高。** `index.html` 里 `#cards` 用 `grid-template-columns:repeat(var(--hand-slots,10),minmax(0,1fr))`（`--hand-slots` = `cfg.economy.handSlots`，当前为 7），七卡挤在一排。`#dock` 还塞了 `#dropTelemetry`（装备卡也可拖到战场释放）、`#startBtn`、`#testCardBtn`（生成测试掉落）。

4. **升星反馈所需事件已存在，只是被表现层忽略。** `src/core/types.ts` 第 246+ 行定义：
   - `{ type: 'merged'; cardType; resultStar }` —— 手牌自动合成升星（**无卡牌 id**）
   - `{ type: 'fed'; cardType; resultStar }` —— 喂装备升星（**无 slotIndex、无卡牌 id**）
   - `{ type: 'equipped'; cardType; star; slotIndex }` —— 首次装备（**已带 slotIndex**）
   - `{ type: 'skillConsumed'; cardType; star; x; y }` —— 消耗释放（带落点坐标）

   `src/ui/eventText.ts` 第 27 行 `case 'merged': return null;`，即合成的独立提示被主动忽略。`autoMergeCards`（`src/core/systems/cardSystem.ts`）在每次合成时逐次 push `merged`。

5. **技能 tier 语义已固化。** `src/config/base/skills.json` 中每张卡的装备档位固定为：`"3" → tier:"core"`、`"5" → tier:"dual"`、`"6" → tier:"transform"`。装备反馈可直接按此语义分级，不必逐卡硬编码。

6. **每张卡已有独立视觉注册表。** `src/presentation/cardVisuals.json` + `resolveCardVisual`（`src/presentation/cardVisual.ts`）提供 `accent/shape/glyph`，庆贺特效直接复用，不要维护第二套颜色。

7. **技术栈事实。** Vite + TypeScript + Vitest。`npm run build`（先 `tsc` 再 `vite build`）、`npm test`（Vitest）。渲染是纯 Canvas 2D；手牌/装备是 DOM。战斗、技能解释器、掉落/合成经济被大量单测固化——**四个阶段都禁止改动任何战斗规则、掉落生成、合成逻辑、点击判定、技能数值与效果解释器。**

---
---

# 阶段 1 · 拆分「手牌文案」与「装备文案」并引入档位回退

目标：把 `texts.json` 的 `descByTier` 拆成 `hand` / `equip` 两套，`resolveCardMeta` 增加上下文参数并按「不高于当前星级的最高已定义档位」回退。本阶段**不改布局、不加反馈**，只让「同一张卡在手牌与装备显示不同语义文案」这一条成立，且卡面照旧渲染（`<small>` 仍隐藏也没关系，阶段 2 才放开）。

===== PROMPT 开始 =====

## 角色与背景

你在改一个基于 Vite + TypeScript + Vitest 的塔防原型 `ProjectVL`（分支 `main`）。战斗、技能解释器、掉落/合成经济已被大量单测固化。**本任务只动文案数据与 UI 取文逻辑，禁止改动任何战斗规则、掉落、合成、点击判定、技能数值。** 构建 `npm run build`，测试 `npm test`。

## 现状（已核实，据此改，勿臆测）

- `src/data/texts.json` 的 `cards.<id>` 结构为 `{ "name": string, "descByTier": { "1"|"3"|"5"|"6": string } }`。
- `src/ui/cardMeta.ts` 导出：
  ```ts
  export interface CardMeta { name: string; desc: string; accent: string; shape: SkillShape; glyph: SkillGlyph; }
  function nearestTier(star: number): '1'|'3'|'5'|'6'  // <=2→1, <=4→3, ===5→5, else→6
  export function cardDisplayName(cardType: CardType): string
  export function resolveCardMeta(cardType: CardType, star: number): CardMeta
  ```
  `resolveCardMeta` 内部：`entry.descByTier[nearestTier(star)] ?? ''`，并 `...resolveCardVisual(cardType)`。
- `src/ui/slotFactory.ts` 的 `createCardElement(card, source, index, handlers)` 里 `const meta = resolveCardMeta(card.type, card.star)`，`source: 'cards' | 'equipment'`。
- 装备门槛：`cfg.economy.equipThreshold`（3★ 起）。手牌卡星级可为 1~6。

## 要做的改动

### 1. `src/data/texts.json`：把每张卡的 `descByTier` 拆成两套

新结构（**替换** `cards.<id>` 下的 `descByTier`，保留 `name`；`name` 的文案改动放到阶段 4，本阶段先沿用现名）：
```jsonc
"pierce": {
  "name": "贯穿",                       // 阶段 4 再改名，本阶段不动
  "hand": {
    "shortByTier": { "1": "直线贯穿一整列", "6": "贯穿并击退整列" }
  },
  "equip": {
    "shortByTier": { "3": "子弹贯穿，越穿越痛", "5": "贯穿弹碰边折返", "6": "主炮化为持续光束" }
  }
}
```
规则：
- `hand.shortByTier` 至少要有 `"1"`；`equip.shortByTier` 至少要有 `"3"`（因为 3★ 起才可装备）。
- **不要求每个星级都写**。取文时选「不高于当前星级的最高已定义档位」。
- 本阶段先给全部 11 张卡填上占位短句即可（可直接用下方阶段 4 的短句表，也可先照抄旧 `descByTier` 精简版）；文案定稿在阶段 4。11 张卡 id：`pierce, chainLightning, frost, decoy, scorch, harvest, aegis, splitBlast, impact, sanctum, thorns`。

### 2. `src/ui/cardMeta.ts`：加上下文参数 + 档位回退

```ts
export type CardCopyContext = 'hand' | 'equipment';

// 在给定 shortByTier 对象里，选出 <= star 的最大已定义档位对应的文案；找不到则回退到最小已定义档位
function resolveTierCopy(shortByTier: Record<string, string>, star: number): string { ... }

export function resolveCardMeta(cardType: CardType, star: number, context: CardCopyContext): CardMeta
```
- `context === 'hand'` 读 `entry.hand.shortByTier`；`'equipment'` 读 `entry.equip.shortByTier`。
- `resolveTierCopy` 实现：把键转数字排序，取 `<= star` 的最大键；若不存在（例如装备文案最低是 3、但传进来 star 更小的边界情况），回退到最小键。**任何情况都不得返回空串**（验收要求「不能显示空描述」）。
- 保留旧的 `nearestTier` 仅当仍被别处引用；否则删掉，避免死代码。
- `cardDisplayName` 不变。

### 3. `src/ui/slotFactory.ts`：按 source 传上下文

```ts
const context: CardCopyContext = source === 'cards' ? 'hand' : 'equipment';
const meta = resolveCardMeta(card.type, card.star, context);
```
同时把 `aria-label` 改成带语义的形式，例如：
```ts
el.setAttribute('aria-label',
  `${source === 'equipment' ? '已装备' : ''}${card.star}星${meta.name}。${source === 'equipment' ? '常驻效果' : '手牌效果'}：${meta.desc}`);
```
本阶段 innerHTML 结构与 `<small>` 隐藏状态**保持不动**（阶段 2 再重构 DOM 与 CSS）。

### 4. 检查其它调用点

全仓库搜索 `resolveCardMeta(`，把所有调用补上第三个参数。已知调用点：`src/ui/slotFactory.ts`。若掉落物绘制/其它 UI 也调用了它，按其语义选 `'hand'`（掉落物是待拾取的手牌来源）。

## 禁止

- 不动 `skills.json`、效果解释器、任何 `src/core/**` 战斗逻辑。
- 不改 `app.css`、`index.html`、事件类型。

## 验收

1. `npm run build` 与 `npm test` 全绿（若有测试断言旧 `descByTier` 结构或 `resolveCardMeta` 两参签名，同步更新测试）。
2. 对同一张 3★ 卡，`resolveCardMeta(type, 3, 'hand')` 与 `resolveCardMeta(type, 3, 'equipment')` 返回的 `desc` 不同。
3. 任意 `type` × `star`(1~6) × `context` 组合下 `desc` 都非空。
4. 装备档位在 star=3/4 时都能取到（4★ 回退到 3 档），5★ 取 5 档，6★ 取 6 档。

===== PROMPT 结束 =====

---
---

# 阶段 2 · 下方操作面板重排 + 卡牌 DOM/CSS 重构（放开描述）

目标：装备一排、手牌四列两排，放开 `<small>` 描述（最多两行），字号达到可读下限；矮屏改为缩小整体比例而非压扁卡牌；把测试按钮与开始按钮移出正式战斗底栏。依赖阶段 1。

===== PROMPT 开始 =====

## 角色与背景

同前：`ProjectVL`（`main`），Vite + TS + Vitest。**只动表现层（`index.html`、`src/styles/app.css`、`src/ui/slotFactory.ts`、`src/ui/renderCards.ts`、`src/ui/domRefs.ts`、`src/game.ts` 中与按钮显隐相关的最小改动）。禁止改战斗/合成/点击判定。** 阶段 1 已把手牌/装备文案拆开并让 `resolveCardMeta` 返回正确 `desc`。

## 现状（已核实）

- `index.html` 的 `#dock` 结构：`.equipment-row#equipmentBar`（含 `.dock-label` + `#equipmentSlots` + `#dropTelemetry`）、`.hand-row`（`.dock-label` + `#cards`）、`.dock-actions`（`#startBtn` + `#testCardBtn`）。战场在 `.arena#arena`（内含 `#game` canvas 540×730、`#centerMsg`、`#toast`、`#aimPreview`、`#screenPreview`）。
- `src/styles/app.css` 是**单文件 25 行密排**，关键规则：
  - `.game-shell { width:min(100vw, calc((100dvh - 220px) * .74 + 20px), 540px); ... grid-template-rows:auto auto auto; }`
  - `.cards { grid-template-columns:repeat(var(--hand-slots,10),minmax(0,1fr)); gap:5px; }`
  - `.card-slot { height:56px; }` `.card { height:56px; ... }` `.card b{font-size:9px}` `.card em{font-size:8px}` `.card small{display:none}` `.card.equipped{height:58px}`
  - `.equip-slot{height:62px}` `.equipment-slots{grid-template-columns:repeat(3,1fr);gap:7px}`
  - `.equipment-row{grid-template-columns:1fr minmax(116px,34%)}`（右列放 `#dropTelemetry`）
  - `@media (max-height:720px){ .equip-slot,.card-slot,.card{height:46px} .dock-actions{position:absolute;right:10px;top:7px} .equipment-row{padding-top:28px} }` ← **这条把卡牌压到 46px，要改掉**
- `slotFactory.createCardElement` 当前 innerHTML：
  ```
  `<b><svg class="card-icon" ...>${glyphToSvg(meta.shape, meta.glyph)}</svg><span>${meta.name}</span></b><em>${'★'.repeat(card.star)}</em><small>${meta.desc}</small>`
  ```
- `renderCards`（`src/ui/renderCards.ts`）用 `cfg.economy.handSlots` 决定格数并设 `--hand-slots`；`renderEquipment` 用 `cfg.economy.equipSlots`。
- `domRefs.ts` 中 `testCardBtn: el<HTMLButtonElement>('#testCardBtn')` 是**必需元素**（`el<>` 找不到会抛错）。

## 要做的改动

### 1. 卡牌 DOM 重构（`slotFactory.ts`）

改成职责清晰的结构（整张按钮仍是拖拽热区，不新增操作步骤）：
```ts
el.innerHTML =
  `<span class="card-head">` +
    `<svg class="card-icon" viewBox="0 0 16 16" aria-hidden="true">${glyphToSvg(meta.shape, meta.glyph)}</svg>` +
    `<strong class="card-name">${meta.name}</strong>` +
    `<span class="card-stars">${'★'.repeat(card.star)}</span>` +
  `</span>` +
  `<span class="card-desc">${meta.desc}</span>`;
```
保留 `el.className`、`dataset.id`、`dataset.testid`（`upgrade-card` / `equipped-card`）、`--card` 变量、`pointerdown` 绑定、阶段 1 的 `aria-label`。**不要改 `data-testid`、`dataset.id` 与拖拽绑定**（浏览器测试与拖拽落点依赖它们）。

### 2. 手牌四列两排（`renderCards.ts` + CSS）

- `renderCards` 继续用 `cfg.economy.handSlots` 生成槽位，不改格数逻辑；**改由 CSS 固定四列**。
- CSS：`.cards { grid-template-columns:repeat(4, minmax(0,1fr)); gap:6px; }`（7 个槽自然排成 4+3，第 8 位留空）。不使用横向滚动。

### 3. 卡牌尺寸与文字（CSS，360×800 视口为基准）

- `.card { min-height:72px; ... }`，`.card.equipped { min-height:auto; }`（装备卡由装备排容器给更高高度，见下）。
- 装备卡高度 82–92px：`.equip-slot{height:auto;min-height:88px}`，装备内的 `.card` `min-height:84px`。
- 字号下限：`.card-name{font-size:12px}`（不低于 11px）、`.card-desc{font-size:11px}`（不低于 10px）、`.card-stars{font-size:10px;color:var(--gold)}`。
- 描述最多两行并省略：
  ```css
  .card-desc { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.25; color:#d7def0; }
  ```
- 卡内布局：`.card{display:grid;grid-template-rows:auto 1fr;gap:2px;padding:6px 6px;place-items:stretch}` `.card-head{display:flex;align-items:center;gap:4px}` `.card-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}` `.card-icon{width:15px;height:15px;flex:none}`。**删除 `.card small{display:none}`。**
- 下方面板占屏约 32%–36%，战场占屏 ≥ 60%。

### 4. 矮屏策略反转（CSS）

删除 `@media (max-height:720px)` 里把 `.card/.card-slot/.equip-slot` 压到 46px 的规则。改为让 `.game-shell` 根据可用高度整体缩放（缩小的是整个界面比例，不是单独压文字）：
```css
.game-shell { width:min(100vw, calc((100dvh - 300px) * 540 / 730 + 16px), 540px); }
```
（270→300 是因为下方面板变高；以实际两排手牌 + 装备排高度为准，Codex 可微调常数，保证 360×800 下三个装备槽 + 七个手牌槽无需滚动全部可见。）矮屏若仍溢出，可再按可用高度小幅下调 `.card min-height` / `.card-desc` 行高，但 `.card-name` 不得低于 11px、`.card-desc` 不得低于 10px。

### 5. 移出正式战斗界面的元素

- **`#testCardBtn`（生成测试掉落）只在 DEV 显示。** 做法二选一：(a) 保留在 `index.html` 但用 `.dock-actions` 内 `hidden` 属性，`src/game.ts` 里 `if (import.meta.env.DEV) refs.testCardBtn?.removeAttribute('hidden')`；(b) 从 `index.html` 移除，改 `domRefs.ts` 的 `testCardBtn` 为 `maybeEl<HTMLButtonElement>('#testCardBtn')` 并在 `game.ts` 用 `refs.testCardBtn?.addEventListener(...)` 可选链保护。**推荐 (b)**。无论哪种，都要保证生产构建里正式底栏不出现该按钮。
- **`#startBtn`（开始游戏）放进开局中央遮罩。** 把开始按钮移入 `.arena` 内的 `#centerMsg` 区域（或新增一个开局遮罩层），进入战斗后隐藏、不占底栏。保留其 `id="startBtn"` 与现有点击逻辑。
- **`#dropTelemetry`** 不再长期挤占装备排右列：`.equipment-row` 改为单列 `grid-template-columns:1fr`，`#dropTelemetry` 仅 DEV 显示（同 testCardBtn 处理），或降级为装备排 `.dock-label` 里的一条短说明。
- 装备排/手牌排各保留一条短标题即可（`#equipmentHint`、`#cardsHint` 保留，但不要每帧重复刷新长说明）。

### 6. `domRefs.ts`

- 若采用 (b)：`testCardBtn`、`dropTelemetry` 改 `maybeEl`。其余引用保持。
- 不要在本阶段新增 `upgradeBanner`/`celebrationFx`（阶段 3 再加）。

## 禁止

- 不改 `cfg.economy.handSlots/equipSlots` 的值或 `renderCards/renderEquipment` 的格数来源。
- 不改事件、`texts.json` 结构、战斗逻辑。
- 不动 `data-testid`、`dataset.id`、拖拽 `pointerdown` 绑定。

## 验收（务必截图三档）

1. `npm run build`、`npm test` 全绿。
2. **360×800** CSS 视口下：3 个装备槽 + 7 个手牌槽无需滚动全部可见；手牌为四列两排。
3. 卡牌名称 ≥ 11px、效果描述 ≥ 10px；描述最多两行，超出省略。
4. 所有非空手牌显示手牌短句，所有非空装备显示装备短句，二者对同一张卡不同；无空描述。
5. 正式战斗底栏不出现「生成测试掉落」；「开始游戏」在开局遮罩、战斗中不占底栏。
6. 追加 **360×800 / 390×844 / 412×915** 三档界面截图。

===== PROMPT 结束 =====

---
---

# 阶段 3 · 升星质变反馈（底部提示条 + 卡牌脉冲 + 6★ 全屏特效）

目标：装备/手牌发生**质变**时给正反馈——战场底部临时小字（标题戏谑 + 正文说清机制），目标卡牌脉冲，6★ 变形额外全屏透明庆贺特效；且不与普通 toast、升级 Modal、落点预览冲突，支持 `prefers-reduced-motion`。依赖阶段 1、2。

===== PROMPT 开始 =====

## 角色与背景

同前：`ProjectVL`（`main`），Vite + TS + Vitest。**表现层新增一个反馈子系统 + 少量事件字段补充；禁止改动战斗规则、掉落、合成算法、点击判定、技能数值。** 允许给已存在的事件**补充可选标识字段**（仅用于表现层定位卡牌，不影响任何战斗计算）。

## 现状（已核实）

- 事件（`src/core/types.ts`）：
  - `{ type: 'merged'; cardType; resultStar }` —— **无卡牌 id**
  - `{ type: 'fed'; cardType; resultStar }` —— **无 slotIndex / 无卡牌 id**
  - `{ type: 'equipped'; cardType; star; slotIndex }` —— **已带 slotIndex**
  - `{ type: 'skillConsumed'; cardType; star; x; y }`
- `merged` 由 `autoMergeCards`（`src/core/systems/cardSystem.ts`）逐次 push；push 处能拿到新合成卡对象 `state.cards[i] = { id: state.nextCardId++, type, star: resultStar }`，即 `resultCardId` 在 push 点可得。
- `fed` 由 `feedEquipment`（`src/core/systems/equipmentSystem.ts` 约第 15 行）push：`{ type:'fed', cardType: target.type, resultStar: target.star }`；该处能拿到装备槽下标 `targetIndex`。
- `game.ts` 的 `dispatch(events)`：`for (const ev of events){ const text=formatToast(ev); if(text) toast(text); ... if(SLOT_CHANGING.has(ev.type)) slotsChanged=true }`。`SLOT_CHANGING`（`eventText.ts`）含 `collected/moved/swapped/merged/fed/skillConsumed/equipped`。`formatToast` 里 `case 'merged': return null`。
- 普通 toast：`src/ui/toast.ts` 的 `createToast`，绝对定位在 `.arena` 内 `bottom:12px`，显示 1.5s。
- tier 语义（`skills.json`）：3★=`core`、5★=`dual`、6★=`transform`。
- 每卡视觉：`resolveCardVisual(cardType)` → `{ accent, shape, glyph, ... }`。
- 升级选择弹窗 `#levelModal`、结果弹窗 `#resultModal`（`.modal.show` 显示）。

## 要做的改动

### 1. 事件补充可选定位字段（仅表现用）

在 `src/core/types.ts` 给两个事件加**可选**字段，并在 push 点填上：
```ts
| { type: 'merged'; cardType: CardType; resultStar: number; resultCardId?: number }
| { type: 'fed'; cardType: CardType; resultStar: number; slotIndex?: number; targetCardId?: number }
```
- `cardSystem.ts` push `merged` 时带上刚生成卡的 `id` 作为 `resultCardId`。
- `equipmentSystem.ts` push `fed` 时带上 `targetIndex` 作为 `slotIndex`、`target.id` 作为 `targetCardId`。
- 这些字段仅供 UI 精确定位要脉冲的卡牌；**不得参与任何战斗计算**。若有单测快照断言事件结构，更新之。

### 2. 文案里新增里程碑（`texts.json`）

在每张卡的 `hand` / `equip` 下新增 `milestones`（键为星级），供反馈层取标题与正文（正文说清机制、不含数值）。结构：
```jsonc
"equip": {
  "shortByTier": { ... },
  "milestones": {
    "3": { "title": "常驻生效：贯穿", "detail": "子弹会贯穿一整列追求者，穿得越多越痛。", "fx": "core" },
    "5": { "title": "回头再拒绝一次", "detail": "贯穿弹碰到场边会折返，再清一遍整条路线。", "fx": "major" },
    "6": { "title": "拒绝方式全面升级", "detail": "主炮变成持续光束，自动横扫射程内的追求者。", "fx": "transform" }
  }
},
"hand": {
  "shortByTier": { ... },
  "milestones": {
    "6": { "title": "拒绝附带清场", "detail": "贯穿结束后，还会把整列追求者推远。", "fx": "transform" }
  }
}
```
- `fx` 取值：`"core"`（3★ 首装：底部提示条 + 轻微脉冲，无全屏）、`"major"`（5★ 新机制：底部提示条 + 明显脉冲，无全屏）、`"transform"`（6★ 变形：底部提示条 + 脉冲 + 全屏庆贺）。
- **只在真正新增机制处写 milestone。** 纯数值成长的 2★/4★ 不写 → 不触发提示。`sanctum`（禁入红线）手牌只有范围/强度成长、无新机制，其 `hand.milestones` 留空。
- 本阶段可先用**占位**里程碑文案（结构正确即可）；最终文案在阶段 4 一次性替换。完整文案表见本文件末「阶段 4 文案总表」。

### 3. 新增反馈子系统 `src/ui/upgradeFeedback.ts`

职责：消费 `merged` / `fed` / `equipped` 事件，按优先级弹「底部提示条」、脉冲目标卡、必要时放全屏特效。
```ts
export function createUpgradeFeedback(refs: DomRefs) {
  return {
    handle(events: GameEvent[]): void { /* 见下 */ }
  };
}
```
触发规则：
- `merged`（手牌）→ 查 `hand.milestones[resultStar]`；**仅当该 exact 星级有 milestone 才触发**（2★/4★ 无 → 不弹）。脉冲卡用 `resultCardId` 定位 `[data-id="…"]`。
- `fed`（装备升星）→ 查 `equip.milestones[resultStar]`，**exact 匹配**才触发（喂 3→4 不弹，4→5 弹 major，5→6 弹 transform）。脉冲用 `targetCardId`（回退 `slotIndex`）。
- `equipped`（首次装备）→ 查 `equip.milestones`，取 **≤ star 的最大已定义档位**（首装 3/4★ 都显示 core「常驻生效」介绍；直接装 5/6★ 显示对应质变文案）。脉冲用 `slotIndex` 对应装备槽内的卡。
- `fx === 'transform'` 时额外触发全屏庆贺特效（见 4）。

**优先级与队列**（同一帧多个事件）：
- 只展示最高优先级：`transform`(6★) > `major`(5★) > `core`(3★首装)；手牌 6★ 与装备 6★ 同为 transform，按装备优先（更稀有的常驻质变）。
- 同帧其余同类进入短队列，最多保留 2 个，依次播放，每条约 2.2–2.6s。
- **若同帧还弹出了 `#levelModal`（经验升级）→ Modal 优先**：延后庆贺特效到 Modal 关闭后，或本次只保留底部提示条、跳过全屏特效。

### 4. DOM 与 CSS

`index.html` 在 `.arena#arena` 内新增两层（都要 `pointer-events:none`，不得阻塞拖拽/拾取/落点预览）：
```html
<div id="upgradeBanner" class="upgrade-banner" aria-live="polite"><strong></strong><span></span></div>
<div id="celebrationFx" class="celebration-fx" aria-hidden="true"></div>
```
`domRefs.ts` 新增 `upgradeBanner: el<HTMLElement>('#upgradeBanner')`、`celebrationFx: el<HTMLElement>('#celebrationFx')`。
CSS（加到 `app.css`）：
- `.upgrade-banner`：固定在**战场底部**（`.arena` 内靠下，位于 dock 上沿之上），`pointer-events:none`；`strong` 为戏谑标题（可用卡 `accent` 上色）、`span` 为机制正文；进入/退出用透明度 + 轻微上移，显示约 2.2–2.6s。
- **与普通 toast 分流**：把普通操作 toast 移到**战场顶部**（改 `.toast` 定位为 `top:12px`），升星提示固定底部，两者不重叠。
- `.celebration-fx`：`position:absolute;inset:0;pointer-events:none;z-index`（低于 Modal 的 50、低于 aim-preview 的 30，建议 24）。6★ 特效：时长 650–850ms；技能主题色（用该卡 `accent`，通过内联变量传入）从屏幕边缘向内扫过 + 一圈透明扩散环 + 少量心形/星芒/技能图形碎片；**中央区域保持透明**，不遮敌人/掉落/落点预览；不暂停战斗；不再显示中央大标题（文字只在底部提示条）。
- 3★/5★ 卡牌脉冲：给目标 `.card` 加一个短动画类（scale/发光脉冲 ~600ms 后移除）。
- `@media (prefers-reduced-motion: reduce)`：关闭全屏扫光与卡牌脉冲的大幅动画，仅保留底部提示条淡入淡出。

### 5. 接线 `game.ts`

- 创建 `const upgradeFeedback = createUpgradeFeedback(refs);`。
- 在 `dispatch(events)` 里，普通 toast 逻辑之后调用 `upgradeFeedback.handle(events)`。**普通 toast 仍照常显示**（`fed`/`equipped` 的 toast 文案保留），升星提示是叠加的正反馈，不替换 toast。`merged` 仍在 `formatToast` 返回 `null`（合成不刷 toast），其正反馈完全由 `upgradeFeedback` 负责。
- 不改 `SLOT_CHANGING` 触发重绘的逻辑。

## 禁止

- 补充字段不得进入任何 `src/core/**` 的战斗/合成计算，只读用于 UI 定位。
- 特效层不得拦截指针事件（必须 `pointer-events:none`）。
- 不改技能数值、掉落、合成算法。

## 验收

1. `npm run build`、`npm test` 全绿。
2. 2★、4★ 成长**不**触发任何大型提示（无底部条、无全屏）。
3. 5★ 装备质变（`fed` 到 5）触发底部提示条 + 目标卡脉冲，无全屏。
4. 6★ 装备变形触发底部提示条 + 卡脉冲 + 全屏特效，且全屏特效**不阻塞**拖拽/拾取（特效播放期间仍能拖卡到战场）。
5. 一次拾取连续合成多级时，只优先展示最高质变（6>5>3）；多余进队列最多 2 条。
6. 普通 toast（顶部）、升级提示（底部）、`#levelModal`、落点预览互不覆盖；同帧有升级 Modal 时 Modal 优先。
7. `prefers-reduced-motion` 开启时关闭大幅动画。
8. 补 6★ 变形瞬间的截图/录屏各一。

===== PROMPT 结束 =====

---
---

# 阶段 4 · 魅魔题材全套文案定稿替换

目标：一次性把技能名、手牌/装备短句、里程碑提示替换为定稿的魅魔题材文案。依赖阶段 1、3 的数据结构。文案原则：技能名统一四字保证排版稳定；名称负责题材记忆点，正文负责机制（保留「冻结/击退/易伤/减速/掉落/贯穿/眩晕」等关键词，不用隐喻代替）；玩家侧统一称「追求者」；幽默/擦边只放在名称与提示标题，正文保持清楚。

===== PROMPT 开始 =====

## 任务

在 `ProjectVL`（`main`）里，把 `src/data/texts.json` 的 `cards.*` 文案**整体替换**为下方「阶段 4 文案总表」的定稿值：每张卡的 `name`、`hand.shortByTier`、`hand.milestones`、`equip.shortByTier`、`equip.milestones`。结构必须与阶段 1/3 已建立的 schema 一致（`shortByTier` 键为星级字符串，`milestones` 每项含 `title/detail/fx`，`fx∈{core,major,transform}`）。

**只改 `texts.json` 文案值，不改任何代码逻辑、不改 schema 结构、不改战斗。** 改完运行 `npm run build`、`npm test`；若有测试断言旧技能名（如「贯穿」），同步更新为新名。

## 约束复核

- `name` 必须四个汉字。
- `hand.shortByTier` 含 `"1"`；`equip.shortByTier` 含 `"3"`。短句尽量 ≤ 11 个汉字（两行可容纳）。
- `milestones` 只在真正新增机制的星级出现；纯数值成长星级不写。
- `sanctum`（禁入红线）`hand.milestones` 为空对象 `{}`。
- 全部正文用「追求者」，不用「敌人」。

## 阶段 4 文案总表

### 技能名对照（旧 id → 新名）
`pierce→直球拒绝`、`chainLightning→心跳连锁`、`frost→冷淡处理`、`decoy→暧昧诱饵`、`scorch→热情退烧`、`harvest→桃花丰收`、`aegis→私人领域`、`splitBlast→群发拒绝`、`impact→保持距离`、`sanctum→禁入红线`、`thorns→带刺玫瑰`。

### 手牌当前效果短句（`hand.shortByTier`）
| id | 1★ | 3★ | 6★ |
|---|---|---|---|
| pierce | 直线贯穿一整列 | —（沿用1档） | 贯穿并击退整列 |
| chainLightning | 连锁电击附近敌群 | 连锁电击并减速 | 连锁电击并眩晕 |
| frost | 冻结落点追求者 | 冻结后继续减速 | 冻结并使其易伤 |
| decoy | 放诱饵引走追求者 | 诱饵被毁时爆炸 | 召出会开火的分身 |
| scorch | 落点留持续火区 | 火区还叠加易伤 | —（沿用3档） |
| harvest | 落点掉出几张卡 | 有机会掉高星卡 | 必掉高星并空投 |
| aegis | 加盾并推开近敌 | —（沿用1档） | 加盾爆发并击退 |
| splitBlast | 落点爆炸清一片 | 爆炸飞出追击碎片 | 碎片命中再分裂 |
| impact | 推开一片追求者 | 推远并短暂眩晕 | 撞到同伴也受伤 |
| sanctum | 使一片追求者易伤 | —（沿用1档） | —（沿用1档） |
| thorns | 减速区持续掉血 | 伤害区并标记目标 | 伤害区处决残血 |

（“—”表示该档不单独写，取文时回退到低一档；即只写会变化的档位。）

### 装备当前常驻效果短句（`equip.shortByTier`，3★ 起）
| id | 3★ | 5★ | 6★ |
|---|---|---|---|
| pierce | 子弹贯穿，越穿越痛 | 贯穿弹碰边折返 | 主炮化为持续光束 |
| chainLightning | 命中连锁并减速 | 电死目标重新起链 | 定时雷暴多点连锁 |
| frost | 子弹减速叠满冻结 | 冻死碎裂波及周围 | 常驻极寒定时冻结 |
| decoy | 每波放爆炸诱饵 | 诱饵被毁重生一次 | 每波召会开火分身 |
| scorch | 命中留火烧死蔓延 | 火中目标更易受伤 | 身边常驻灼烧环 |
| harvest | 掉落更多停留更久 | 过期掉落折成经验 | 每波空投过期转经验 |
| aegis | 波初加盾降突破伤 | 碎盾时爆发击退 | 护盾快速再生更强 |
| splitBlast | 命中分裂小范围爆 | 碎片再裂一次 | 主炮改为范围榴弹 |
| impact | 每发子弹都击退 | 被突破自动全向震退 | 定时释放全向冲击 |
| sanctum | 红线内减速并易伤 | 残血目标优先补刀 | 定时全领域强易伤 |
| thorns | 减伤并反噬突破者 | 身边常驻荆棘 | 荆棘扩大处决残血 |

### 装备里程碑（`equip.milestones`）
3★ 首装统一用「常驻生效：<技能名>」+ 一句常驻介绍，`fx:"core"`。5★/6★ 用下表个性文案。

| id | 5★（fx:major） | 6★（fx:transform） |
|---|---|---|
| pierce | **回头再拒绝一次** / 贯穿弹碰到场边会折返，再清一遍整条路线。 | **拒绝方式全面升级** / 主炮变成持续光束，自动横扫射程内的追求者。 |
| chainLightning | **电完还能续上** / 被电倒的追求者会从原地重新放出连锁电弧。 | **全场心跳管理** / 炮台会周期性召来雷暴，同时电击多名追求者。 |
| frost | **冷场也会碎一地** / 冻结中的追求者被击倒时会碎裂，并波及周围。 | **这里常年零下** / 炮台周围形成极寒领域，并定时冻结一片追求者。 |
| decoy | **备胎还有备胎** / 诱饵被摧毁后，会换个位置再出现一次。 | **分身开始营业** / 每波召出会吸引火力、也会自动开火的分身。 |
| scorch | **越热情，越没防备** / 火区中的追求者会承受更多伤害。 | **拒绝靠近明火** / 炮台周围常驻灼烧环，靠近者持续受伤并减速。 |
| harvest | **过期心意也能变现** / 没捡到的掉落会转成经验，不再完全浪费。 | **桃花运自动送货** / 每波开局直接空投卡牌，过期掉落全部转经验。 |
| aegis | **碎盾也要体面退场** / 护盾破裂时爆发冲击，把附近追求者震开。 | **私人空间自动续费** / 护盾更快重生，每次碎裂释放更强反击。 |
| splitBlast | **拒绝开始二次传播** / 子弹片命中后还能再分裂一次，爆破更密集。 | **主炮改发榴弹** / 普通射击变为范围榴弹，落点炸开一大片。 |
| impact | **贴脸行为触发报警** / 有人突破时自动释放冲击波，震退并打断周围。 | **定期清理安全距离** / 炮台周期性释放全向冲击，把近处追求者推开。 |
| sanctum | **红线内优先清退** / 领域内的残血追求者会被炮台优先补刀。 | **审判改为定时群发** / 炮台周期性让整个领域内的追求者大幅易伤。 |
| thorns | **玫瑰开始主动扎人** / 炮台周围常驻荆棘，靠近者持续受伤。 | **纠缠过久，直接退场** / 荆棘范围扩大，低血量追求者被直接处决。 |

3★ 首装 `detail` 建议（各卡「常驻生效：<名>」标题 + 下句正文）：
- pierce：子弹会贯穿一整列追求者，穿得越多越痛。
- chainLightning：命中会在附近追求者间连锁跳电，并附带减速。
- frost：子弹持续减速追求者，叠满后将其冻结。
- decoy：每波放下一个诱饵，被摧毁时会炸开附近追求者。
- scorch：命中处留下火区，追求者死在其中会蔓延新火。
- harvest：提高掉落数量并延长地面停留时间。
- aegis：每波开局获得护盾，降低被突破时的伤害。
- splitBlast：命中会分裂出子弹片，并炸开一小片范围。
- impact：每发子弹都带击退，把追求者推离炮台。
- sanctum：以炮台为中心布下红线，圈内追求者减速并易伤。
- thorns：大幅减免突破伤害，并反噬突破点附近的追求者。

### 手牌里程碑（`hand.milestones`，只写真正质变的星级）
| id · 星级 | title / detail（fx） |
|---|---|
| pierce 6★ | **拒绝附带清场** / 贯穿结束后，还会把整列追求者推远。（transform） |
| chainLightning 3★ | **电得腿软了** / 连锁电击现在会附带减速。（major） |
| chainLightning 6★ | **心跳暂时失控** / 连锁电击现在会让目标短暂眩晕。（transform） |
| frost 3★ | **冷脸之后还有余寒** / 冻结结束后，追求者仍会持续减速。（major） |
| frost 6★ | **冷到开始反省** / 被冻结的目标现在会承受更多伤害。（transform） |
| decoy 3★ | **暧昧信号会爆炸** / 诱饵被摧毁时会炸开附近追求者。（major） |
| decoy 6★ | **分身亲自下场** / 诱饵升级为会自动开火的分身。（transform） |
| scorch 3★ | **热情使人失去防备** / 火区中的目标现在会承受更多伤害。（major） |
| harvest 3★ | **桃花里混进了优质货** / 空投现在可能出现高星卡。（major） |
| harvest 6★ | **桃花运开始包邮** / 空投必有高星卡，并额外掉落更多卡。（transform） |
| aegis 6★ | **私人空间带反击** / 获得护盾时还会爆发伤害并强力击退。（transform） |
| splitBlast 3★ | **拒绝开始群发** / 爆炸后会飞出子弹片继续追击。（major） |
| splitBlast 6★ | **群发还能转发** / 子弹片命中后还能再次分裂。（transform） |
| impact 3★ | **请退后，并冷静一下** / 冲击现在会附带短暂眩晕。（major） |
| impact 6★ | **挤作一团也会受伤** / 被推飞的追求者撞到同伴会造成额外伤害。（transform） |
| thorns 3★ | **刺里还带点眼神** / 荆棘中的目标会被炮台优先照顾。（major） |
| thorns 6★ | **越纠缠，退场越快** / 低血量目标会被直接处决。（transform） |
| sanctum | 无（只有范围/强度成长，`hand.milestones: {}`） |

## 验收

1. `npm run build`、`npm test` 全绿（更新任何断言旧技能名的测试）。
2. 11 张卡的 `name` 均为四字新名；手牌/装备短句、里程碑与上表一致。
3. 手牌与装备对同一张卡显示不同语义文案；无空描述。
4. `sanctum` 手牌不产生质变提示。
5. 抽查 6★：装备与手牌的 transform 提示文案正确、机制关键词完整。

===== PROMPT 结束 =====

---

## 附：与原 ChatGPT 参考稿的差异（已按真实代码修正）

- **`equipped` 事件已自带 `slotIndex`**，无需新增；脉冲装备卡可直接用它。参考稿把它列为「建议补充」，实为已有。
- **`merged` / `fed` 确实缺卡牌 id**（`merged` 无任何 id，`fed` 连 `slotIndex` 都没有），所以阶段 3 才要补 `resultCardId` / `slotIndex+targetCardId`，否则同型同星两张卡会高亮错。
- **tier 语义确认**：`skills.json` 中 3=core、5=dual、6=transform，装备反馈按此分级，无需逐卡硬编码。
- **`app.css` 是单文件 25 行密排**，`.card small{display:none}` 与 `@media(max-height:720px)` 压到 46px 均属实，阶段 2 明确删除/反转。
- **`testCardBtn` 在 `domRefs` 是必需元素**，移出 HTML 时必须同步改 `maybeEl` + 可选链，否则启动即抛错。
- 本次**未重新上传参考截图**，布局尺寸按你描述的原则给出可执行数值，Codex 以「360×800 无滚动、字号达下限」为硬验收。
