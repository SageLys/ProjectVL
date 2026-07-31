# Codex Prompt · 主界面卡面文案重排（缩小标题/星级 → 让位 overview → 词条压到底边）

> 可整体粘贴给 Codex。本文件基于 2026-07-31 对 `main` 分支的真实静态审查 + 尺寸核算写成。
> 语言约定：中文游戏，玩家可见文案一律客观机制描述。
> **只改表现层**：`src/ui/**` 与 `src/styles/app.css`。不碰 `src/core/**` 结算、不碰 `src/config/**` 数值、不新增文案内容（overview 已经全量存在）。

---

## 0. 目标

主界面（Dock）卡面当前只有三层：**图标+技能名 / 星级 / 两条数值词条**。技能名和星级占了过多纵向空间，而最能帮玩家快速识别一张卡的一句话 `overview` 完全没有出现在卡面上。

本次要做三件事：

1. **缩小技能名与星星图标**，并把星级从"独占一行"改为"与标题同排右对齐"，腾出一整行。
2. **所有主界面卡牌（手牌 + 装备）新增 `overview` 一句话描述**，作为卡面的主体信息区。
3. **数值词条压缩后贴到卡面底边**：手牌用 2 字缩写标签挤进一行；装备卡（更宽）在标准布局下保留全称。

---

## 1. 现状事实（已核对代码，实现时以这些为准）

### 1.1 卡面 DOM（`src/ui/slotFactory.ts` → `createCardElement`）

当前产物：

```html
<button class="card">
  <span class="card-head">
    <svg class="card-icon">…</svg>
    <strong class="card-name">连锁闪电</strong>
  </span>
  <span class="card-stars">★★★★★</span>
  <span class="card-affix-compact">
    <span class="card-affix"><i>◆</i>效果伤害 +10%</span>
    <span class="card-affix"><i>◆</i>受控增伤 +15%</span>
  </span>
  <!-- provisional 时追加 <span class="card-status-badge">!</span> -->
</button>
```

`aria-label` 已包含 名称/星级/待选/路线/`meta.desc`/词条。`renderEquipment.ts` 在融合时额外 append 一个 `.card-fusion-badge`（绝对定位，尺寸中性）。

### 1.2 文案数据源（`src/data/texts.json`）

- `texts.cards.<id>.overview` —— **已全量存在**：`cfg.skills.cards` 有 60 张卡，texts 里 60/60 都有 overview（texts 里第 61 个 key `fusion` 不是可玩卡，无 overview，需兜底）。
- **实测长度：最长 20 个汉字，无一超过。** 例：
  - `chainLightning` → 「链走到哪，感电铺到哪。」（11 字）
  - `crystalRelay` → 「连锁加冰：中继晶柱把链电和冻结焊在一起。」（20 字）
  - `voltBastion` → 「挨的每一下都在充电，充满就释放放电风暴。」（20 字）
- `texts.cards.<id>.name` 实测长度：2 字 ×19、3 字 ×6、4 字 ×35、5 字 ×1（`emberMoat` = 燃烧护城河）。
- `texts.affixes.stats` —— 17 个 stat 的中文全称标签，**本次要新增一份 2 字缩写表**（见 §3.2）。
- `texts.cards.<id>.hand/equip.shortByTier` —— 现在只进 `aria-label`（`meta.desc`），**本次保持不变**，`tests/renderSmoke.test.ts` 有断言依赖它，不要删。

### 1.3 词条事实（`src/core/systems/cardAffixSystem.ts` + `src/config/base/skills.json`）

- **每张卡恒定 2 条词条**：60 张卡的 `affixPool.count` 全部 = 2。所以 `.card-affix-compact` 永远是 2 条，可以按固定 2 列排版，不需要考虑 0/1/3 条。
- 词条按**卡类型**在开局 roll 一次并锁定整局（`state.runBuild.cardAffixRolls[type]`），同型卡词条完全相同。
- `AFFIX_SINKS` 实际使用的 stat 只有 15 个 Mul/Add 类；`damage`/`fireRate` 两个裸标签是遗留，不出现在任何 affixPool。

### 1.4 布局尺寸（`src/styles/app.css` + `src/platform/stageMetrics.ts`）

舞台是**固定逻辑像素 540 宽**，由 `viewportManager` 整体 scale 到设备上。两套变体都是活的，`calculateStageMetrics()` 按可用高度自动选：

| | standard | compact |
|---|---|---|
| 逻辑舞台 | 540 × 1140 | 540 × 1020 |
| `--dock-logical-height` | 392px | 350px |
| `.game-dock` padding / gap | 10px 12px / 8px | 6px 10px / 5px |
| `.card-slot` | 100px 高 | 118px 高 |
| `.equip-slot` | 100px 高 | 58px 高 |
| `.card` padding | 6px | 4px |

由此推出的**卡面内容区实测尺寸**（本次设计必须落在这些框里）：

| 卡 | 外框 | 内容区（去 padding） |
|---|---|---|
| standard 手牌 | 123 × 100 | **111 × 88** |
| standard 装备 | 166 × 100 | **154 × 88** |
| compact 手牌 | 105.75 × 118 | **97.75 × 110** |
| compact 装备 | 143 × 58 | **135 × 50** ← 现状已经溢出被 `overflow:hidden` 裁掉 |

**关键约束：standard 布局的 dock 已经占满。** 实测 `10×2 padding + 装备行 127 + gap 8 + 手牌行 235 = 390`，而 `--dock-logical-height:392px`，只剩 2px。→ **standard 的 `.card-slot`/`.equip-slot` 高度一律不许涨。**

**compact 布局的 dock 有余量。** 实测 `6×2 + 装备行 58 + gap 5 + 手牌行 244 = 319`，预算 350，**余 31px**。→ compact 的 `.equip-slot` 可以从 58px 提到 72px（319+14=333 ≤ 350），这是本次唯一允许的尺寸上调，用来救 compact 装备卡 50px 内容区放不下三行的问题。

手牌区是 `repeat(4,1fr)` 网格，`handSlots=7` + 1 张万能卡 = 8 格 = 2 行，所以手牌行高 = 2×卡高+gap。

### 1.5 现有测试硬约束（**不许破坏**）

`tests/cardTitleLayout.test.ts`：

```ts
expect(card.querySelector('.card-head .card-name')).not.toBeNull();
expect(card.querySelector('.card-head .card-stars')).toBeNull();   // 星级不许塞进 .card-head
expect(card.querySelector(':scope > .card-stars')?.textContent).toHaveLength(6);  // 必须是 .card 直接子元素，且是 N 个 ★ 字符
```

→ **星级必须保持是 `.card` 的直接子元素、内容必须是 `'★'.repeat(star)`。**
→ 所以"星级与标题同排"**只能用 CSS Grid 定位实现**（把 `.card-head` 放 row1/col1、`.card-stars` 放 row1/col2），**不许把 `.card-stars` 挪进 `.card-head`**，也不许改成 `★6` 这种数字徽章。

`tests/cardCompactLayout.test.ts`：断言 `.card-head > .card-name`、`:scope > .card-stars`、`.card-affix-compact` 存在且含 2 个 `.card-affix`、无词条时 `.card-affix-compact` 的 textContent 为 `'—'`、且不含 `.card-desc`/`.card-skill-section`/`.card-evolution-route`。→ 本次要**扩写**这个测试（加 `.card-overview` 断言），但上述已有断言全部保留。

`tests/renderSmoke.test.ts`：断言 `resolveCardMeta(...).desc` 对全部卡 × 全部星级 × hand/equipment 都非空，且 hand ≠ equipment、5★ 含「叠加」、6★ 含「终极形态」。→ **`CardMeta.desc` 字段必须保留原语义**，overview 是新增字段不是替换。

`tests/compactStageProportion.test.ts`：**逐字断言了 CSS 字符串**——

```ts
expect(css).toContain('.game-stage[data-layout="compact"] .card-slot { height:118px; min-height:118px; }');
expect(css).toContain('.game-stage[data-layout="compact"] .card-name { font-size:14px; }');
expect(css).toMatch(/\.game-stage\[data-layout="compact"\] \.card-affix-compact\s*\{[^}]*-webkit-line-clamp:3;[^}]*font-size:14px;/s);
```

→ 后两条会被本次改动打破，**必须同步更新该测试**（改成断言新的字号/新的 overview 行数规则）。第一条 `card-slot 118px` 不变，保留。

`tests/cardDetailLayout.test.ts` / `cardDetailModel.test.ts` / `effectText.test.ts` / `textCoverage.test.ts`：本次不应受影响，跑通即可。

---

## 2. 目标卡面（对照实现，别偏离）

```
standard 手牌 111×88                     standard 装备 154×88
┌───────────────────────────┐           ┌──────────────────────────────────┐
│ ⬡ 连锁闪电         ★★★★★ │  row1     │ ⬡ 连锁闪电                ★★★★★★ │
│ 链走到哪，感电铺到哪。      │  row2     │ 链走到哪，感电铺到哪。             │
│                           │  (1fr)    │                                  │
│ ◆效伤+10% ◆增伤+15%       │  row3     │ ◆效果伤害+10%  ◆受控增伤+15%      │
└───────────────────────────┘  底边     └──────────────────────────────────┘
```

三行制：**标题行（图标+名+星级同排）/ overview（弹性主体）/ 词条条（贴底边）**。

- 星级右对齐进标题行 → 相比现状省掉一整行。
- overview 是 `minmax(0,1fr)` 行，吃掉所有剩余空间，多余部分 line-clamp 裁切。
- 词条条固定贴在最底部，上方一条 `1px` 分隔线，是"卡面边缘"的视觉语义。

---

## 3. 实现

### 3.1 `src/ui/cardMeta.ts`

**(a) `CardMeta` 增加 `overview` 字段（不动 `desc`）：**

```ts
export interface CardMeta {
  name: string;
  desc: string;        // 保持原义：hand/equip 的 shortByTier，只进 aria-label；renderSmoke 依赖
  overview: string;    // 新增：texts.cards.<id>.overview，卡面主体
  accent: string;
  shape: SkillShape;
  glyph: SkillGlyph;
}
```

`resolveCardMeta()` 里读 `entry.overview`，兜底顺序：`entry.overview` → `resolveTierCopy(shortByTier, star)` → `''`。（`fusion` 之类无 overview 的 key 走兜底，不许崩。）
`CardCopyEntry` 类型补上 `overview?: string`。

**(b) 新增缩写标签函数：**

```ts
/** 卡面用 2 字缩写标签；全称留给详情弹窗。 */
export function affixShortLabel(stat: string): string
/** 卡面词条串：缩写 / 全称两种形态，去掉 '+' 前空格省宽。 */
export function formatAffixRollShort(roll: CardAffixRoll): string   // "效伤+10%"
```

`formatAffixRoll()`（全称、带空格）**保持不变**——`cardDetailModel.ts` 在用，详情弹窗文案不能变。

缩写表放 `texts.json` 的 `texts.affixes.shortStats`（文案单源、可换皮），代码里读不到时回退到 `texts.affixes.stats` 的全称。**需要新增的 `texts.affixes.shortStats` 内容：**

```json
"shortStats": {
  "damageMul": "伤害",
  "fireRateMul": "射速",
  "rangeMul": "射程",
  "maxHpMul": "生命",
  "effectDamageMul": "效伤",
  "quantityAdd": "数量",
  "controlPotencyMul": "控制",
  "controlledDamageTakenMul": "增伤",
  "areaScaleMul": "范围",
  "dotDamageMul": "续伤",
  "defenseDurabilityMul": "耐久",
  "retaliationMul": "反击",
  "dropRateMul": "掉率",
  "dropLifetimeMul": "时限",
  "xpMul": "积分"
}
```

（覆盖 `AFFIX_SINKS` 的全部 15 个 key，两两不重复，全部恰好 2 字。遗留的 `damage`/`fireRate` 不在表里，走全称回退即可。）

### 3.2 `src/ui/slotFactory.ts` → `createCardElement()`

新 DOM（**顺序即 grid 顺序，星级仍是 `.card` 直接子元素**）：

```html
<button class="card">
  <span class="card-head">
    <svg class="card-icon" viewBox="0 0 16 16" aria-hidden="true">…</svg>
    <strong class="card-name">连锁闪电</strong>
  </span>
  <span class="card-stars" aria-hidden="true">★★★★★</span>
  <span class="card-overview">链走到哪，感电铺到哪。</span>
  <span class="card-affix-compact">
    <span class="card-affix" title="效果伤害 +10%">
      <i aria-hidden="true">◆</i><b class="affix-short">效伤</b><b class="affix-full">效果伤害</b>+10%
    </span>
    <span class="card-affix" title="受控增伤 +15%">
      <i aria-hidden="true">◆</i><b class="affix-short">增伤</b><b class="affix-full">受控增伤</b>+15%
    </span>
  </span>
</button>
```

要点：

- **缩写/全称两套标签同时进 DOM，由 CSS 决定显示哪套**（见 §3.3）。这样 `createCardElement` 不需要知道当前是 standard 还是 compact 布局——布局变体是 `#gameStage` 上的 `data-layout` 属性，运行时才确定。
- `.card-affix` 的 `title` 属性放**全称 + 带空格的原格式**（`formatAffixRoll(roll)`），供 hover / 无障碍。
- **无词条兜底不变**：`(card.affixes ?? []).length === 0` 时仍输出 `<span class="card-affix empty">—</span>`，保证 `cardCompactLayout` 的 `textContent === '—'` 断言通过。
- `overview` 为空串时 `.card-overview` 仍要渲染（空节点），不许让行塌陷改变布局。
- `aria-label` 改为包含 overview（替换掉原来拼的 `meta.desc`？**不**——两者都拼上，格式：`${已装备}${star}星${name}。${pending} ${routeBadges} ${overview} ${desc}。${全称词条}`）。
- `provisional` / `equipped` / `recipe-ready` 等状态类与 `.card-status-badge` 逻辑**完全不动**。

### 3.3 `src/styles/app.css`

**(a) `.card` 改成 2 列 3 行网格，把星级用 grid 定位拉到标题行右侧：**

```css
.card {
  position:relative; width:100%; height:100%; min-height:0; overflow:hidden;
  padding:6px;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  grid-template-rows:auto minmax(0,1fr) auto;   /* 标题 / overview / 词条 */
  gap:2px 4px;
  /* border / background / cursor / user-select / touch-action 等保持原样 */
}
.card-head          { grid-column:1; grid-row:1; display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:4px; min-width:0; }
.card-stars         { grid-column:2; grid-row:1; align-self:center; justify-self:end; color:var(--gold); line-height:1; }
.card-overview      { grid-column:1 / -1; grid-row:2; min-height:0; overflow:hidden;
                      display:-webkit-box; -webkit-box-orient:vertical; align-content:start;
                      color:#cfe0f2; }
.card-affix-compact { grid-column:1 / -1; grid-row:3; min-width:0; overflow:hidden;
                      display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 3px;
                      padding-top:2px; border-top:1px solid #ffffff13; color:#bfe8ff; }
.card-affix         { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
                      display:flex; align-items:center; gap:2px; }
.card-affix b       { font-weight:600; }
.card-affix.empty   { grid-column:1 / -1; color:#52667b; }
/* 默认全局用缩写；只有「非 compact 布局下的装备卡」才换成全称 */
.affix-full { display:none; }
.game-stage:not([data-layout="compact"]) .card.equipped .affix-short { display:none; }
.game-stage:not([data-layout="compact"]) .card.equipped .affix-full  { display:inline; }
/* provisional 角标占 top-right，给星级让位 */
.card.provisional .card-stars { padding-right:15px; }
```

**(b) standard 布局字号（`.game-stage …`），把现有这几条替换成：**

```css
.game-stage .card-icon           { width:16px; height:16px; }
.game-stage .card-name           { font-size:12px; line-height:1.2; }
.game-stage .card-stars          { font-size:8px; letter-spacing:-1.5px; }
.game-stage .card-overview       { font-size:11px; line-height:1.3; -webkit-line-clamp:3; }
.game-stage .card-affix-compact  { font-size:9px; line-height:1.15; }
/* 装备卡更宽，overview 两行就够，词条给到两行放全称 */
.game-stage .card.equipped .card-overview      { -webkit-line-clamp:2; }
.game-stage .card.equipped .card-affix-compact { grid-template-columns:minmax(0,1fr); }
.game-stage .card.equipped .card-affix         { }
```

> 注：装备卡改成单列 2 行，是因为「◆基础生命上限+12%」这种最长全称在 9px 下约 84px，两条并排 168px > 内容区 154px 会被 ellipsis 吃掉。单列两行安全。

**核算（必须成立，实现后用 §5 的浏览器验收复核）：**

- standard 手牌 88px 预算：标题 16 + overview 3×11×1.3=42.9 + 词条 9×1.15+3=13.4 + gap 2×2=4 → **76.3 ≤ 88** ✅
- standard 装备 88px 预算：标题 16 + overview 2×11×1.3=28.6 + 词条 2×9×1.15+3=23.7 + 4 → **72.3 ≤ 88** ✅
- standard 手牌标题行宽 111px：图标 16 + gap 4 + 名 4字×12=48 + gap 4 + 星 6×(8-1.5)=39 → **111 ≈ 111** ✅（唯一 5 字名 `燃烧护城河` 走 ellipsis，可接受）
- standard 手牌词条条宽 111px：每格「◆效伤+10%」9px 下约 46px，2 格 + gap 3 = **95 ≤ 111** ✅

**(c) compact 布局（`.game-stage[data-layout="compact"] …`）：**

```css
.game-stage[data-layout="compact"] .equip-slot        { height:72px; min-height:72px; }  /* 58 → 72，dock 有 31px 余量 */
.game-stage[data-layout="compact"] .card              { padding:4px; }                    /* 保持 */
.game-stage[data-layout="compact"] .card-icon         { width:15px; height:15px; }
.game-stage[data-layout="compact"] .card-name         { font-size:12px; }
.game-stage[data-layout="compact"] .card-stars        { font-size:8px; letter-spacing:-1.5px; }
.game-stage[data-layout="compact"] .card-overview     { font-size:13px; line-height:1.3; -webkit-line-clamp:3; }
.game-stage[data-layout="compact"] .card-affix-compact{ font-size:10px; line-height:1.15; }
.game-stage[data-layout="compact"] .card.equipped .card-icon      { width:13px; height:13px; }
.game-stage[data-layout="compact"] .card.equipped .card-name      { font-size:11px; }
.game-stage[data-layout="compact"] .card.equipped .card-overview  { font-size:10px; line-height:1.25; -webkit-line-clamp:2; }
.game-stage[data-layout="compact"] .card.equipped .card-affix-compact { font-size:8px; }
```

**核算：**

- compact 手牌 110px 预算：标题 16 + overview 3×13×1.3=50.7 + 词条 10×1.15+3=14.5 + 4 → **85.2 ≤ 110** ✅（compact 手牌纵向宽裕，字号反而应该比 standard 大，因为物理缩放比例两套是一样的）
- compact 手牌标题行宽 97.75px：15+3+4字×12=48+3+39 = **108 > 97.75** ⚠️ → 4 字名会轻微 ellipsis。若不接受，把 compact 的 `.card-name` 降到 11px（44px）→ 104，仍略超；**接受 ellipsis，或把 compact 星级 `letter-spacing` 收到 -2px**（6×6=36 → 105）。实现时以浏览器实测为准，优先保证名字完整可读。
- compact 装备（提到 72px 后内容区 135×64）：标题 14 + overview 2×10×1.25=25 + 词条 8×1.15+3=12.2 + 4 → **55.2 ≤ 64** ✅

**(d) 删除/合并旧规则：** 原来那条把 `.card-affix-compact` 定义成 `-webkit-line-clamp:2` 的 flex 列表规则要改写成上面的 grid 两列形态；`.card` 的 `grid-template-rows:auto auto minmax(0,1fr)` 要换掉。注意 `app.css` 是**多规则挤在一行**的紧凑写法，改的时候不要把同行其它选择器改坏。

### 3.4 `src/ui/renderEquipment.ts`

不需要改。`.card-fusion-badge` 是绝对定位 bottom-right 14×14，会压在词条条右下角——**给 `.card-affix-compact` 加 `padding-right`**：

```css
.card.equipped .card-fusion-badge ~ … /* 不可行，badge 在后面 */
```

改用：融合时 `renderEquipment` 给 `.card` 加一个 `has-fusion-badge` 类，CSS `.card.has-fusion-badge .card-affix-compact { padding-right:16px; }`。这是本文件唯一改动。

---

## 4. 测试

### 4.1 改写 `tests/cardCompactLayout.test.ts`

保留全部既有断言，追加：

```ts
expect(card.querySelector('.card-overview')?.textContent).toBe('链走到哪，感电铺到哪。');   // 用真实 texts 值
expect(card.querySelectorAll('.card-affix-compact .card-affix')).toHaveLength(2);
expect(card.querySelector('.card-affix .affix-short')?.textContent).toBe('效伤');
expect(card.querySelector('.card-affix .affix-full')?.textContent).toBe('效果伤害');
expect(card.querySelector('.card-affix')?.getAttribute('title')).toBe('效果伤害 +10%');
// 星级仍是 .card 直接子元素（不许因为视觉同排就挪 DOM）
expect(card.querySelector('.card-head .card-stars')).toBeNull();
```

装备卡也补一条同样的 overview 断言（`createCardElement(card, 'equipment', …)`）。

### 4.2 更新 `tests/compactStageProportion.test.ts`

`card-slot 118px` 那条保留。把 `card-name font-size:14px` 与 `card-affix-compact line-clamp:3 / font-size:14px` 两条改成断言新规则，并新增：

```ts
expect(css).toContain('.game-stage[data-layout="compact"] .equip-slot { height:72px; min-height:72px; }');
expect(css).toMatch(/\.game-stage\[data-layout="compact"\] \.card-overview\s*\{[^}]*-webkit-line-clamp:3;/s);
```

### 4.3 新增 `tests/cardFaceCopy.test.ts`

```ts
// 1) 缩写表覆盖与唯一性
//    Object.keys(texts.affixes.shortStats) 覆盖 Object.keys(AFFIX_SINKS) 的全部 15 个 key
//    每个值长度 === 2，且 15 个值两两不重复
// 2) overview 全量存在且不超长（卡面排版回归护栏）
//    对 cfg.skills.cards 每张卡：texts.cards[id].overview 非空，且 [...overview].length <= 24
//    （当前实测最长 20，留 4 字缓冲；超过就说明文案改动会撑破卡面）
// 3) overview 不含英文配置标识符（复用 textCoverage 的 LEAKED_CONFIG 正则）
// 4) affixShortLabel() 对未知 stat 回退到全称而不是抛错
```

### 4.4 `tests/textCoverage.test.ts`

把 §4.3 第 2、3 条也加进去（它已经在遍历 `cfg.skills.cards` 并检查 `overview` 非空，只需补长度上限与泄漏正则）。二选一，别重复。

---

## 5. 验收

**质量门：** `npx tsc --noEmit` 通过；`npm run test` 全绿；`npm run build` 通过。

**布局验收矩阵**（两套 layout × 手牌/装备 × 1★/3★/5★/6★ × 最长名(`emberMoat` 燃烧护城河)/最短名(`solarPiercer` 贯日) × 最长 overview(`crystalRelay`/`voltBastion` 20 字)/最短 overview(`cinderheart` 6 字) × 无词条/两条最长词条(`maxHpMul`+`controlledDamageTakenMul`) × provisional/融合角标）：

- 卡牌高度、Dock 高度、`arena.getBoundingClientRect()` 高宽**完全不变**；无横向/纵向溢出。
- overview 在每张卡上**至少完整显示一行**，最长的 20 字卡在 standard 手牌上不被裁掉（3 行 clamp 够用）。
- 两条词条在同一行内可读，不出现 `…` 截断（除非是最长的 `基础生命上限`，此时装备卡应显示全称、手牌显示 `生命`）。
- 星级 ★ 数量正确，与技能名同一水平线，不与 `provisional` 角标重叠。
- 融合角标不压住词条文字。

**手工验证方式：** `npm run dev` 后用 DevTools 设备模拟依次跑 `390×844`（→ standard）、`390×744`（→ compact）、`375×667`（→ compact + contain 回退）、`430×932`（→ standard），每档截图对照。可复用 `src/debug/layoutDebug.ts`（URL 加 `?layoutDebug` 之类的现有开关）读取 `calculateStageMetrics()` 快照确认命中的 variant。

---

## 6. 硬性约束

- **只改** `src/ui/cardMeta.ts`、`src/ui/slotFactory.ts`、`src/ui/renderEquipment.ts`、`src/styles/app.css`、`src/data/texts.json`（仅新增 `affixes.shortStats`）、以及 §4 列出的测试文件。**不碰** `src/core/**`、`src/config/**`、`src/ui/cardDetailModal.ts`、`src/ui/cardDetailModel.ts`、`src/ui/effectText.ts`、`src/input/**`、`src/platform/**`。
- **不新增/不改写任何卡牌 overview 文案内容**——60 张卡的 overview 已经全量落地且质量达标，本次只是把它显示出来。
- 星级 DOM 位置与 `'★'.repeat(star)` 格式不许动（`cardTitleLayout` 测试是红线）。
- `CardMeta.desc` 语义不许动（`renderSmoke` 测试是红线）。
- `formatAffixRoll()` 输出不许动（详情弹窗与 `cardDetailModel` 依赖）。
- `src/data/texts.json` 必须保持 **UTF-8 无 BOM、合法 JSON**。改完后跑一次 `node -e "require('./src/data/texts.json')"` 确认可解析。（该文件在 commit 2afc292 曾被写坏成二进制乱码，属于本仓库已知事故点。）
- 舞台是固定逻辑像素后整体缩放的，**CSS 里的 px 是逻辑像素**，在 390 宽的手机上会再乘 ~0.72。所以任何低于 8px 的字号实际会小于 5.8px，不可读——**卡面字号下限 8px，且仅用于词条**。
