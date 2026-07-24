# Codex Prompt · 固定卡面 + 点击二级详情菜单 + 配置驱动效果描述器

> 本文件是给 Codex 的实现指令，可整体粘贴。它由一次真实的 `main` 分支静态代码审查得出（未运行构建/浏览器）。
> 全文分 5 个阶段，每个阶段标注了 **可独立提交的 commit 边界**，你可以整段提交，也可以逐阶段提交。
> 语言约定：本项目为中文游戏。**本次所有玩家可见文案一律使用客观机制描述，暂不套用最终"魅魔/心防"世界观皮肤**（后续单独换皮）。

---

## 0. 背景与总目标

当前 UI 已导致游戏无法正常游玩，根因是**卡面把完整技能描述塞进主界面**，文本一多卡牌就自动变高、顶开上方战场（Arena）。同时游戏各处**信息严重不足**：技能效果、分支效果、词条作用大多是占位符或根本没有。

目标不是"继续压缩卡面文字"，而是重构信息层级：

1. **主卡面固定尺寸**，只负责快速识别和拖拽操作，任何技能复杂度都不改变卡牌/卡槽/战场尺寸。
2. **点击卡牌 → 打开二级详情菜单，此时整局暂停**（战斗、掉落寿命、敌人移动、波间倒计时全部停）。
3. 二级菜单承载：完整当前效果 + 当前精确数值 + 词条作用解释 + 关键词解释 + 完整技能树（点亮当前节点、高亮已选分支、灰显未选、锁定未来）。
4. 分支选择弹窗必须同时说明"具体发生什么、数值多少、适合什么构筑"。

**核心技术原则：数值与机制从 `src/config/base/skills.json` 自动生成，客观设计意图/新手解释由 `src/data/texts.json` 提供。** 绝不在核心逻辑里为每张卡加特殊判断——界面改动全部留在 `src/ui`，复用现有真实结算函数。

这项需求**不需要重写战斗系统**。现有工程已具备：可暂停状态、卡牌实例与星级、每卡独立进化路线、完整 JSON 技能树、当前星级装备/消耗效果解析、随机词条真实结算、通用决策弹窗。缺的只是三层"表现设施"：固定卡面、可暂停详情弹窗、把配置转译成玩家语言的统一描述器。

---

## 1. 现状事实（已核对代码，实现时以这些为准）

**卡片/卡槽当前没有固定高度：**
- `src/styles/app.css` 中 `.card-slot { min-height:72px }`、`.equip-slot { height:auto; min-height:88px }`、`.card { min-height:72px }`、`.card.equipped { min-height:84px }`——都是 `min-height`，文本一多就撑高。
- `src/ui/slotFactory.ts` 的 `createCardElement()` 把 **技能名/图标/星级/已选路线 `.card-evolution-route`/待选提示 `.card-evolution-pending`/技能描述 `.card-skill-section`+`.card-desc`/全部词条 `.card-affix-section`** 全塞进主卡面。
- `src/ui/renderEquipment.ts` 还会向装备卡内部 `append` 一条 `.card-fusion` 融合说明（行内样式），进一步撑高。

**外层布局假设固定 Dock：** `.game-shell` 宽度 `width:min(100vw, calc((100dvh - 345px) * 540 / 730 + 16px), 540px)` 直接减去 `345px`，且 `.game-shell` 与 `body` 都 `overflow:hidden`。Dock 一旦变高，Arena 被压缩/裁切。`.arena` 用 `aspect-ratio:540/730`。

**当前文案基本是占位符：**
- `src/data/texts.json` → `cards.chainLightning.hand.shortByTier` = "连环闪电的即时释放/强化释放/终极释放"；`equip.shortByTier` = "分支成形/第二分支叠加/公共终态"。
- `evolution.chainLightning.*.summary` = "长链分支。/高压分支。/感电分支。"——完全没告诉玩家机制。
- `src/ui/cardMeta.ts` 的 `resolveTierCopy()` 兜底返回字符串 `'效果说明'`。

**点击卡牌当前无行为：** `src/input/pointerRouter.ts` 已可靠区分点击/拖拽（`isTap()` 用 `input.tapMaxPx`/`tapMaxMs`；拖拽结束 `suppressClick=true` 会拦截随后浏览器 `click`）。但卡牌 DOM 只注册了 `pointerdown → handlers.dragStart`，纯点击（未拖拽）在 `finish()` 里因为 `current.source` 为真且未 `dragging` 直接 return，**什么都不做**。所以：现有输入设施已足够，只需给卡牌加一个 `click` 监听接入详情，不需要改 `pointerRouter`。

**旧版本确实是固定卡面**（`legacy/`）：卡槽/卡牌固定 58px，主界面只显示名称+星级+一句极短说明。方向正确：恢复固定卡面，并新增二级详情菜单。

**已有测试约束（不得破坏）：** `tests/cardTitleLayout.test.ts` 断言 `.card-head .card-name` 存在、`.card-head .card-stars` 为 `null`、`:scope > .card-stars` 直接子元素文本长度 = 星级数。→ **新卡面必须保留 `.card-head > .card-name`，星级仍是 `.card` 的直接子 `.card-stars`，star 数 = `★` 数量。**

---

## 2. 复用的真实数据与结算入口（不要另造一套数字）

**技能定义与结算（`src/core/effects/interpreter.ts`）：**
- `getSkillDef(type): CardDef | undefined`
- `resolveConsumableTier(def, star)`：返回当前星级消耗态（1/3/6 锚点，2/4/5 线性插值），字段 `{ radius?, duration?, effects: EffectDef[] }`。
- `resolveCardBindings(def, evolutionPath, star): BindingDef[]`：当前星级装备态绑定。规则（已核对）：`star<3` 返回 `[]`；无 `evolutionTree` 且 `recipeOnly && star>=6` 返回 `stars['6'].equip`；有树但 `evolutionPath` 为空返回 `[]`；否则取 3★所选 option（`star>=4` 时叠加 sharedNode[4].amplify）→ `star>=4` 叠 sharedNode[4].equip → `star>=5` 叠 5★所选 option → `star>=6` 叠 sharedNode[6].equip。
- `getModifiers(state)`：含 `weaponForms`（用于装备融合判定）。

**数据模型（`src/core/effects/defs.ts`）：**
- `Trigger`（9 个）：`onFire | onHit | onKill | onWaveStart | onBreach | onPickup | interval | onMerge | passive`
- `AtomName`（33 个）：
  - 弹道：`pierce chain split ricochet aoeOnHit beamMorph mortarMorph`
  - 控制：`slow freeze stun knockback taunt vulnerable`
  - 领域：`aura groundZone dot summon`
  - 经济：`dropRateMul dropLifetimeMul xpMul extraDrop expiryConvert mergeRule mergePulse`
  - 防御：`shield thorns breachReduction novaOnBreak execute`
  - 共用：`burstDamage focusPriority restore statBuff`
- `EffectDef { atom, params?: Record<string, unknown> }`；`BindingDef { trigger, triggerParams?: { seconds?, requiresSource?, requiresStatus?, cooldownSeconds? }, effects }`
- `CardDef.consumable.anchors['1'|'3'|'6']`、`CardDef.stars['3'?|'5'?|'6']`、`CardDef.evolutionTree.{checkpoints[star=3|5].options[], sharedNodes[star=4|6]}`、`CardDef.recipeOnly`、`CardDef.amplifyAxis`。

**卡牌实例（`src/core/types.ts`）：** `Card { id, type, star, evolutionPath?: string[], provisional?, affixes?: CardAffixRoll[], ... }`。`evolutionPath` 元素格式为 `"<star>:<optionId>"`，例如 `"3:chainLightningA"`、`"5:chainLightningB2"`（用第一个 `:` 分隔）。

**词条契约（`src/config/affixSinks.ts` → `AFFIX_SINKS: Record<CardStatKind, AffixSinkContract>`）：**
- `operation: 'add'|'mul'`、`settlement: 'instant'|'timed'`、`equipment: 'global'|'scoped'|'unsupported'`、可选 `globalConsumer`、`scalingTargets`。
- 例：`damageAdd` = add/timed/global(totalDamage)；`heal` = add/instant/**unsupported**(装备时不生效，消耗即时回复)；`effectDamageMul` = mul/timed/**scoped**（只强化本卡产生的 aoeOnHit/split/beam/mortar/summon/pierce/chain 等效果伤害）；`quantityAdd` = scoped，加 pierce.count/chain.bounces/split.count/ricochet.bounces（整数）。
- 每个词条候选在 `skills.json` 的 `affixPool.candidates[]` 里带 `consumableDuration`（消耗后限时秒数），且 `CardAffixRoll` 保存了 roll 后的 `stat/value/consumableDuration`。
- 现有 `src/ui/cardMeta.ts` 的 `formatAffixRoll(roll)` 只输出"效果伤害 +10%"这类裸标签；`texts.affixes.stats` 有中文标签表。

**41 张卡 = 35 张正式 + 6 张配方终态。** `recipeOnly` 且无 `evolutionTree` 的 6 张：`frozenThunder, solarLance, avalanche, pyrestorm, crownOfThorns, goldenIdol`（配方见 `src/config/base/evolutionRecipes.json`，如 `frozenThunder = chainLightning(≥5) + frost(≥5) → 6★`）。

---

## 3. 阶段实现方案

> 每阶段末尾给出**验收**与 **commit 边界**。阶段一必须能独立验收，保证后续开发期间游戏可玩。

### 阶段一 · 恢复可玩性：固定卡面 + 固定尺寸　【commit 1】

**目标：** 只做"止血"——主卡面删长文、固定手牌/装备卡尺寸、移除融合长文字，确保战场尺寸不随卡牌内容变化。**本阶段不新增详情菜单**。

**1.1 改 `src/ui/slotFactory.ts`：**
- `createCardElement()` 生成的 DOM 精简为三层，**且保留 `cardTitleLayout` 测试要求的结构**：
  ```html
  <button class="card">
    <span class="card-head">
      <svg class="card-icon">…</svg>
      <strong class="card-name">技能名</strong>
    </span>
    <span class="card-stars">★★★★</span>       <!-- 必须是 .card 的直接子元素 -->
    <span class="card-affix-compact">…最多两行词条…</span>
  </button>
  ```
- 删除主卡面上的：`.card-evolution-route`、`.card-evolution-pending` 长文字、`.card-skill-section`、`.card-desc`。
- `.card-affix-compact` 每条只显示 `formatAffixRoll()` 的裸标签（如 `◆ 伤害 +3`），无词条时显示 `—`。CSS 保证最多两行、超出裁切。
- `aria-label` 仍保留较完整信息（名称/星级/待选/路线/词条），供无障碍读取——`aria-label` 不影响布局。
- 保留 `provisional`（虚线边框/警告角标）、`equipped`（边框变色）、可合成提示等**纯状态类**，但它们**不得改变尺寸**。

**1.2 改 `src/styles/app.css`：** 建立强约束（数值可微调，关键是同时满足 固定 `height` + 固定 `min-height` + `overflow:hidden` + 子元素行数固定）：
```css
.card-slot { height:72px; min-height:72px; overflow:hidden; }
.equip-slot { height:88px; min-height:88px; overflow:hidden; }   /* 去掉 height:auto */
.card { height:100%; min-height:0; overflow:hidden;
        grid-template-rows:auto auto minmax(0,1fr); }
.card.equipped { min-height:0; }   /* 只改颜色/边框，不改尺寸 */
.card-name { font-size:13px; }
.card-icon { width:18px; height:18px; }
.card-affix-compact { overflow:hidden; font-size:8px; line-height:1.15;
                      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
```
可选：给 `.game-shell` 显式固定 Dock 行高或校准 `345px` 常量，确保 `.arena` 高宽稳定。

**1.3 改 `src/ui/renderEquipment.ts`：** 不再向卡面 `append` 会撑高的 `.card-fusion` 文字。融合信息改为极小图标或状态角标（尺寸中性），完整融合说明移到阶段三的详情菜单。

**阶段一验收：**
- 单测 `tests/cardTitleLayout.test.ts` 仍通过（结构不变）。
- 手动/快照：对 1★/3★/5★/6★、无词条/两条最长词条、无路线/两条已选路线、普通卡/配方终态卡、装备融合态、待选分支态——**卡牌高度、Dock 高度、`arena.getBoundingClientRect()` 高宽完全不变，无横/纵向溢出**。
- 新增 `tests/cardCompactLayout.test.ts`（happy-dom）：断言 `createCardElement` 产物不含 `.card-desc`/`.card-skill-section`/`.card-evolution-route`；含 `.card-affix-compact`。

---

### 阶段二 · 详情弹窗骨架 + 可靠暂停　【commit 2】

**目标：** 点击卡牌打开一个（暂时内容为空/占位的）二级弹窗并暂停整局，关闭恢复原暂停状态。拖拽行为不受影响。

**2.1 扩展 `SlotHandlers`（`src/ui/slotFactory.ts`）：**
```ts
export interface SlotHandlers {
  dragStart(e: PointerEvent, source: SlotSource, index: number, el: HTMLElement): void;
  inspect(source: Exclude<SlotSource,'wildcard'>, index: number, el: HTMLElement): void;
}
```
在卡牌上追加：
```ts
el.addEventListener('click', () => {
  if (source !== 'wildcard') handlers.inspect(source, index, el);
});
```
**不改 `pointerRouter`**：拖拽后它已 `suppressClick`，纯点击才会触发这个 `click`。（`makeWildcardSlot` 不接 inspect。）

**2.2 新增 `src/ui/cardDetailModal.ts`：** 只负责 DOM 与交互，不解释技能数据。参考 `createModals()` 动态建节点的写法（`document.body.append`）。
```ts
export interface CardDetailModalHooks { onOpen(): void; onClose(): void; }
export interface CardDetailModal {
  open(card: Card, source: 'cards'|'equipment'): void;
  close(): void; isOpen(): boolean; destroy(): void;
}
export function createCardDetailModal(hooks: CardDetailModalHooks): CardDetailModal;
```
必须包含：`role="dialog"`、`aria-modal="true"`、显式关闭按钮、Escape 关闭、点击遮罩关闭、弹窗内部滚动、标题区固定、打开后焦点移到关闭按钮、关闭后焦点还给原卡牌元素。CSS：
```css
.card-detail-card { width:min(680px, calc(100vw - 24px)); max-height:min(88dvh,780px); overflow:hidden; }
.card-detail-scroll { overflow-y:auto; overscroll-behavior:contain; }
```

**2.3 在 `src/game.ts` 中分离手动暂停与详情暂停：** 现在 `togglePause()` 直接翻转 `state.paused`。改为：
```ts
let manualPaused = false;
const uiPauseReasons = new Set<'cardDetail'>();
function syncPauseState(): void { state.paused = manualPaused || uiPauseReasons.size > 0; }
function openCardDetail(card, source): void { uiPauseReasons.add('cardDetail'); syncPauseState(); cardDetail.open(card, source); }
function closeCardDetail(): void { uiPauseReasons.delete('cardDetail'); syncPauseState(); }
function togglePause(): void {
  if (state.mode !== 'playing' || state.intermission.active || state.decisions.current) return;
  manualPaused = !manualPaused; syncPauseState(); syncPauseButton();  // 抽出按钮同步
}
```
- `slotHandlers.inspect(source, index, el)` → 读 `state.cards[index]`/`state.equipment[index]`，非空则 `openCardDetail(card, source)`。
- `reset()`/`start()` 里统一清空 `uiPauseReasons` 和 `manualPaused`。
- 详情暂停不得影响决策弹窗自身的暂停（决策由 `state.decisions.current` 独立驱动）。
- 保证：战斗中打开→暂停；波间倒计时中打开→倒计时也停（核心循环在 `state.paused` 为真时不推进，已核对 `updateGame`/loop）；玩家本就手动暂停→关详情后仍暂停。

**阶段二验收（新增 `tests/pointerRouter.test.ts` 补充 + `tests/cardDetailPause.test.ts`）：**
- 短按卡牌打开详情；位移超过 `tapMaxPx` 的拖拽不打开详情；拖到战场仍能消耗释放；拖到卡槽仍能移动/合成。
- 打开详情后敌人/子弹/掉落寿命/波间计时不变化；原本手动暂停时打开并关闭详情仍保持暂停。
- Escape / 关闭按钮 / 点击遮罩都能关闭；关闭后焦点回到原卡牌。

---

### 阶段三 · 配置驱动效果描述器 + 详情内容　【commit 3】

**目标：** 把真实技能配置转译成玩家语言，填满详情菜单的"当前效果 / 词条 / 关键词"。

**3.1 新增 `src/ui/effectText.ts`（纯函数、无 DOM，核心可测）：** 不得把 JSON 技术字段直接显示给玩家。
```ts
formatTrigger(trigger: Trigger, params?: BindingDef['triggerParams']): string
formatEffect(effect: EffectDef): EffectTextLine[]       // 递归处理嵌套 effects[]
formatBinding(binding: BindingDef): EffectTextBlock      // 触发器 + 其下所有效果
```
- **触发器映射**（覆盖全部 9 个）：`onFire`→每次开火时；`onHit`→命中敌人时；`onKill`→击杀敌人时（若 `requiresSource`/`requiresStatus` 追加条件，如"击杀由连锁造成的敌人时"）；`onWaveStart`→每波开始时；`onBreach`→敌人突破防线时；`onPickup`→拾取掉落时；`interval`→每 `seconds` 秒；`onMerge`→完成合成时；`passive`→持续生效。`cooldownSeconds` 追加"（每 N 秒至多一次）"。
- **效果原子映射**（覆盖全部 33 个 `AtomName`，把参数翻成中文数值句）。示例：
  - `chain {bounces:2,damageRetention:0.7,searchRange:120}` → "命中后向附近敌人弹跳 2 次，每次保留 70% 伤害，搜索半径 120"。
  - `slow {ratio:0.2,duration:1.2}` → "命中目标减速 20%，持续 1.2 秒"。
  - `dot {damageRatio:0.08,tickInterval:0.5,duration:2}` → "使目标持续掉血，每 0.5 秒造成 8% 伤害，持续 2 秒"。
  - `aoeOnHit {radius:65,damageRatio:0.65,falloff:0.5}` → "命中处引发范围爆发，半径 65，中心 65% 伤害并向外衰减"。
- **嵌套必须递归**：`groundZone`/`aura`/`summon` 内含 `effects[]`（如领域内含 dot+slow、召唤物带爆炸/嘲讽），逐条展开而非只显示最外层原子。
- 参数键名、单位（百分比 vs 数值 vs 秒 vs 像素半径）建立一张集中表；未知原子/参数要有安全兜底（显示原子中文名而非崩溃），并被 `textCoverage` 测试捕获。
- 映射用到的中文词根尽量走 `texts.json`（见 3.4），保证可换皮。

**3.2 新增 `src/ui/cardDetailModel.ts`：** 把卡牌实例 + 技能配置转成纯展示模型（复用 §2 的结算函数，**不复制数字**）：
```ts
export interface CardDetailViewModel {
  id: number; name: string; star: number; iconSvg: string; accent: string;
  category: string; god: string; currentRoute: string;         // 当前已选路线摘要
  consume: EffectSection;   // resolveConsumableTier(def, star) → formatBinding/formatEffect
  equip: EffectSection;     // resolveCardBindings(def, path, star) → formatBinding
  affixes: AffixDetail[];   // 见 3.3
  glossary: GlossaryEntry[];// 仅本卡实际用到的关键词
  tree: SkillTreeViewModel; // 阶段四填充
}
export function buildCardDetailViewModel(card: Card, source: 'cards'|'equipment'): CardDetailViewModel;
```
`source==='cards'` 但卡未装备时，装备态仍可展示"若装备将生效"的绑定（用 `resolveCardBindings`）；消耗态永远可展示。

**3.3 词条必须解释"如何生效"（用 `AFFIX_SINKS` + `texts`）：** 现有 `formatAffixRoll` 只给"效果伤害 +10%"。详情里每条词条给出三行：数值、装备时如何生效、消耗时如何生效（含 `consumableDuration`）。规则从 `AFFIX_SINKS[stat]` 推导：
- `equipment:'global'` → "装备时：全局 <globalConsumer 对应中文> +X"；
- `equipment:'scoped'` → "装备时：只提高这张卡产生的 <scalingTargets 对应效果> ..."；
- `equipment:'unsupported'` → "装备时：不生效"；
- `settlement:'instant'`（如 heal）→ "消耗时：立即结算"；`'timed'` → "消耗时：全局生效 X，持续 `consumableDuration` 秒"。
- 示例：`effectDamageMul +10%` → 装备时只提高本卡的爆炸/分裂/光束/迫击炮/召唤等效果伤害；消耗时全局效果伤害 +10%，持续 5 秒。`heal +10` → 装备时不生效；消耗时立即回复 10 点。
- **只补展示层，不改数值结算。**

**3.4 详情菜单 DOM 顺序（在 `cardDetailModal` 里渲染 ViewModel）：**
1. 卡牌标题：图标 / 技能名 / 当前星级 / 所属神祇 / 技能类别 / 当前已选路线。
2. 当前效果：消耗释放效果 + 装备持续效果 + 当前星级精确数值 + 触发条件 + 作用对象/范围/持续时间。
3. 数值词条：数值 + 装备如何生效 + 消耗如何生效 + 生效时长 + 只强化本卡还是全局。
4. 关键词解释：只解释本卡实际使用的机制（如 连锁/易伤/领域/处决/反伤），文案来自 `texts.glossary`。
5. 完整技能树（阶段四）。

**阶段三验收（新增 `tests/effectText.test.ts` + `tests/cardDetailModel.test.ts`）：**
- `effectText`：对全部 33 个原子和 9 个触发器各至少一个用例，断言输出为中文机制句、无裸 JSON 字段名、嵌套原子被展开。
- `cardDetailModel`：对样例卡（如 chainLightning 3★选A、5★选B2、6★）断言消耗/装备效果、词条三行解释、关键词集合正确；对 `heal`/`effectDamageMul` 词条断言 equipment/settlement 文案分支。

---

### 阶段四 · 完整技能树 ViewModel + 分支选择弹窗改造　【commit 4】

**4.1 技能树 ViewModel（放在 `cardDetailModel.ts`）：**
```ts
interface SkillTreeViewModel { nodes: SkillTreeNode[]; }
interface SkillTreeNode {
  star: 1|2|3|4|5|6; kind: 'base'|'branch'|'shared'|'terminal';
  options?: SkillTreeOption[]; reached: boolean; current: boolean; locked: boolean;
}
interface SkillTreeOption {
  id: string; name: string; intent: string;         // 客观设计意图（texts）
  exactEffects: EffectTextBlock[];                   // 由 effectText 从配置生成
  selected: boolean; available: boolean;
}
```
节点生成规则：
- 1★：当前 1★ 消耗效果（`consumable.anchors['1']`）。
- 2★：1★↔3★ 插值得到的消耗强化（`resolveConsumableTier(def,2)`）。
- 3★：`evolutionTree.checkpoints[star=3].options`（三选一分支）。
- 4★：`evolutionTree.sharedNodes[star=4]`（公共强化：amplify 或 equip）。
- 5★：`evolutionTree.checkpoints[star=5].options`（三选一分支）。
- 6★：`evolutionTree.sharedNodes[star=6]`（公共终态）。
- 当前选择读 `card.evolutionPath`（格式 `"3:chainLightningA"`/`"5:chainLightningB2"`，按第一个 `:` 分隔）。
- `reached = card.star>=node.star`；`current` 高亮当前实际选中分支；未选分支 `selected=false` 仍可查看但灰显；`locked = card.star<node.star`。
- **`recipeOnly` 终态卡**（无 `evolutionTree`）：不显示普通 1–6★树，改为显示配方（`evolutionRecipes.json`：两张前置卡 + 最低星级 + 输出 6★ 效果）+ 说明"此卡不可通过普通合成获得"。

**4.2 详情菜单渲染技能树：** 1★基础 / 2★数值成长 / 3★三选一 / 4★公共 / 5★三选一 / 6★公共终态；已达节点点亮、当前分支高亮、未选灰显、未来锁定。样式新增 `.skill-tree-*`（尺寸自洽，弹窗内滚动）。

**4.3 分支选择弹窗改造（`src/ui/modals.ts`）：** 当前 `evolutionBranch` 分支只显示 `optionCopy.name` + `summary`（占位）。改为复用 `effectText.ts` + 技能树 ViewModel，每个分支选项呈现四类信息：
```
长链
群体清场                         ← intent（客观构筑意图）
· 命中后弹跳 2 次
· 每次保留 70% 伤害
· 使目标减速 20%，持续 1.2 秒      ← exactEffects（配置自动生成）
适合：密集敌群、稳定控场            ← keywords / build-fit
```
5★ 选择弹窗额外提示："该分支会叠加到当前 3★ 路线上，不会替换之前的选择"（已核对：3★与5★路线独立叠加，非覆盖——见 `resolveCardBindings` 与 `tests/evolutionTree.test.ts`）。保留现有 `texts.evolution.lockNotice` 逻辑。

**阶段四验收（扩展 `tests/cardDetailModel.test.ts` + `tests/decisionModal.test.ts`）：**
- 树节点 reached/current/locked/selected 对样例卡正确；配方终态卡走配方分支。
- 分支弹窗每个选项同时含 intent + 精确数值行 + keywords；5★ 弹窗含叠加提示。
- 现有 `evolutionTree.test.ts`/`recipeEvolution.test.ts` 不回归。

---

### 阶段五 · 35+6 卡客观文案落地 + 防占位回归　【commit 5】

**目标：** 用**客观机制描述**（不套用最终"魅魔"世界观）填满 `texts.json`，替换全部占位符，并加自动检查防止占位文案再次提交。

**5.1 `src/data/texts.json` 需要补的字段（客观、可换皮）：**
- `cards.<id>`：主卡面用的极短机制词（hand/equip 的 `shortByTier`，客观化，替换"即时释放/强化释放/终极释放"），以及详情用的一句客观 `overview`。
- `evolution.<id>.<optionId>`：每个分支的 `name`（客观机制名）、`intent`（一句客观设计意图/构筑定位）、`keywords`（构筑标签数组）。**不重复数值**——精确数值全部由 `effectText` 从 `skills.json` 自动生成。
- `glossary`：本项目实际用到的机制关键词解释（连锁/易伤/减速/冻结/眩晕/击退/嘲讽/领域/持续伤害/光环/召唤/护盾/反伤/突破减免/处决/范围爆发/索敌优先/掉率/掉落时限/经验 等）。
- `affixHelp`：每个 `CardStatKind` 的通用作用说明（配合 `AFFIX_SINKS` 生成三行解释时的词根）。
- `triggers` / `atoms`：`effectText` 映射用的中文词根表（便于统一改写、换皮）。
- 覆盖全部 41 张卡（35 正式 + 6 配方终态）及其所有分支。

**5.2 防占位回归（新增 `tests/textCoverage.test.ts`）：**
```ts
// 对每张卡、每个分支的可见文案做断言
expect(summary).not.toMatch(/分支。$|效果说明|即时释放|强化释放|终极释放/);
```
并断言：每张正式卡的 3★/5★ 各 option 都有 name/intent/keywords；每个 `AtomName` 在 `effectText` 有非兜底映射；每个 `CardStatKind` 有 `affixHelp`；6 张配方卡有配方文案。

**阶段五验收：** `textCoverage` 全绿；全量 `npm run test` 通过；`npm run build`（tsc + vite）通过。人工抽查任意卡详情能回答下列 9 问。

---

## 4. 需要新增/修改的文件清单

| 文件 | 改动 | 阶段 |
|---|---|---|
| `src/ui/slotFactory.ts` | 卡面精简为 名/图标/星级/紧凑词条；`SlotHandlers` 加 `inspect`；卡牌加 `click` | 一、二 |
| `src/styles/app.css` | 固定卡槽/卡牌/装备卡尺寸；`.equipped` 不改尺寸；详情弹窗与技能树样式 | 一、二、三、四 |
| `src/ui/renderEquipment.ts` | 移除撑高卡牌的融合长文字，改中性角标 | 一 |
| `src/game.ts` | 手动暂停 vs 详情暂停分离；`inspect`→打开详情；创建 `cardDetailModal` | 二 |
| `src/ui/cardDetailModal.ts` | 新增：详情弹窗 DOM + 可访问性交互 | 二 |
| `src/ui/effectText.ts` | 新增：触发器/原子/参数 → 玩家语言（递归） | 三 |
| `src/ui/cardDetailModel.ts` | 新增：卡牌详情 + 技能树 ViewModel（复用真实结算） | 三、四 |
| `src/ui/modals.ts` | 分支选项改用完整效果描述 + 构筑意图 | 四 |
| `src/data/texts.json` | 客观 overview/分支 intent/keywords/glossary/affixHelp/triggers/atoms | 五 |
| `tests/cardCompactLayout.test.ts` | 新增：卡面不含长描述、含紧凑词条 | 一 |
| `tests/pointerRouter.test.ts` | 补：点击 vs 拖拽不冲突 | 二 |
| `tests/cardDetailPause.test.ts` | 新增：暂停原因合成、焦点、关闭恢复 | 二 |
| `tests/effectText.test.ts` | 新增：全部原子/触发器描述 | 三 |
| `tests/cardDetailModel.test.ts` | 新增：当前效果/词条解释/技能树点亮 | 三、四 |
| `tests/textCoverage.test.ts` | 新增：35+6 卡与所有分支文案覆盖、防占位 | 五 |

（不改：`src/input/pointerRouter.ts` 逻辑、`src/core/**` 结算——除非发现真实 bug，否则只读复用。）

---

## 5. 目标信息架构（对照实现，别偏离）

**主卡面**严格三层：① 技能图标 + 大号技能名；② 星级；③ 最多两行小号数值词条。
主卡面**不再显示**：完整技能效果、完整分支名、进化路线文字、触发条件、范围/持续时间、融合说明、技能树。
可保留的**纯状态**（不换行、不改尺寸）：provisional 虚线/角标、已装备边框、可合成提示、极小融合图标。

**二级详情菜单**顺序：卡牌标题 → 当前效果 → 数值词条 → 关键词解释 → 完整技能树（见 3.4 / 4.2）。

---

## 6. 全局验收标准

**布局验收**（矩阵：1★/3★/5★/6★ × 无词条/两条最长词条 × 无路线/两条已选路线 × 普通卡/配方终态卡 × 装备融合态 × 待选分支态）：卡牌高度不变、Dock 高度不变、`arena.getBoundingClientRect()` 高宽不变、无横/纵溢出、不因文字增加缩小战场。

**交互验收：** 短按打开详情；超过拖拽阈值不打开；拖到战场可释放；拖到卡槽可移动/合成；打开详情后敌人/子弹/掉落寿命/波间计时不变；本就手动暂停时开关详情仍保持暂停；Escape/关闭按钮/遮罩均可关闭；关闭后焦点回原卡牌。

**信息验收：** 每张卡详情能回答——① 现在消耗后会发生什么？② 现在装备后会发生什么？③ 每个数值什么意思？④ 每个词条装备/消耗时分别如何生效？⑤ 下一星获得什么？⑥ 3★/5★ 有哪些分支？⑦ 当前选了哪条路线？⑧ 6★ 最终变成什么？⑨ 分支之间适合什么不同构筑？

**质量门：** `npm run test` 全绿、`npm run build`（`tsc --noEmit && vite build`）通过。

---

## 7. 硬性约束（务必遵守）

- 数值与机制**只从 `skills.json` 经现有结算函数生成**；`texts.json` 只放客观意图/新手解释/词根；**绝不手抄一套可能过期的数字**。
- 不在 `src/core` 为单卡加特殊判断；界面逻辑留在 `src/ui`。
- 保持 core 层无 DOM/Canvas；`effectText.ts`/`cardDetailModel.ts` 为可单测的纯函数（不碰 `document`）。
- 本次文案**客观化，暂不套用"魅魔/心防"世界观**；命名与措辞保持中性机制描述，方便后续单独换皮。
- 不破坏既有测试（尤其 `cardTitleLayout`、`evolutionTree`、`recipeEvolution`、`decisionModal`、`pointerRouter`）。
