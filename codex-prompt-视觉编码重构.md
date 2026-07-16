# Codex 任务 Prompt：技能掉落物 & 敌人视觉编码重构

> 直接把下面「===== PROMPT 开始 =====」到「===== PROMPT 结束 =====」之间的全部内容复制给 Codex。
> 本文档中的所有文件路径、函数签名、颜色值、卡牌 ID 均已对照 `main` 分支真实代码核实。

---

===== PROMPT 开始 =====

## 角色与背景

你在改一个基于 **Vite + TypeScript + Vitest** 的塔防原型 `ProjectVL`。战斗、技能解释器、掉落/合成经济已被大量单测固化，**本任务只动表现层，禁止改变任何战斗规则、掉落生成、合成、点击判定**。

技术栈事实：
- 构建：`npm run build`（先 `tsc` 类型检查，再 `vite build`）。
- 测试：`npm test`（Vitest）。
- 渲染是纯 Canvas 2D；手牌/装备是 DOM。

## 要解决的两个现存问题

1. **敌人颜色造成大面积视觉干扰**：普通/高速/重装/Boss 各占一套高饱和色，且颜色同时用于「主体填充 + 18px 发光 + 血条 + 死亡粒子」，彩色光晕面积远大于敌人本体，和地面掉落物抢注意力。
2. **技能掉落物无法区分具体技能**：掉落物只按「大类」取颜色和图标，导致同一图标对应多张卡（例如 3 张 projectile 卡完全相同）。

## 目标视觉语法（必须遵守）

- **敌人类型**：只靠体型 + 轮廓（边数）区分，普通三类用同一中性灰主体色。
- **敌人状态**：冻结/减速/烙印/Bounty 的状态环颜色**保持不变**（它们表达临时状态，不是类型）。
- **技能身份**：每张卡用「专属颜色 + 专属外轮廓形状 + 专属内部几何符号」三通道冗余编码，转灰度后仍可区分。
- **技能大类**：同大类用相近色相，但**任意两张卡颜色都不完全相同**。
- **掉落倒计时**：继续用独立圆环表达，形状固定为圆，不参与技能身份编码。
- **星级**：不要用改变技能颜色来表达星级（本任务不新增星级角标，保持现状即可）。
- 核心原则：**高饱和色优先留给需要玩家立即识别并点击的掉落物，而不是持续移动的敌人。**

## 当前代码事实（务必据此改，不要臆测）

### 敌人配置 `src/config/base/enemies.json`
四种类型当前值：
- `normal`: `color:"#f3b95f"`, `r:16`, `sides:4`
- `fast`: `color:"#62d8ff"`, `r:12`, `sides:3`
- `tank`: `color:"#ff7b86"`, `r:22`, `sides:6`
- `boss`: `color:"#c58aff"`, `r:35`, `sides:8`

### 敌人绘制 `src/render/drawEnemies.ts`
- `ctx.shadowBlur = 18; ctx.shadowColor = e.color; ctx.fillStyle = e.color;`
- 多边形顶点半径为 `const r = e.r * (i % 2 ? 0.82 : 1);` —— 这会让顶点长短交替，普通敌人不是规则多边形，三角形还会不对称。
- 血条填充用 `e.color`。
- 状态环（frozen 实线蓝 / slow 虚线蓝 / brand 金圈）和 Bounty 环（金色倒计时/接单描边）**已经画在敌人外围**，颜色写死，保持不动。

### 敌人颜色还流入粒子（共两处，都要处理）
- `src/core/systems/damageSystem.ts:19` 击杀粒子：`spawnParticle(..., enemy.color, 150)`
- `src/core/systems/enemySystem.ts:117` 敌人事件粒子：`spawnParticle(..., e.color, 120)`
把这两处的颜色改为中性灰（如 `#8793a3`）或从敌人配置读一个专门的中性粒子色，**不要继续用高饱和 `e.color`**。（`enemySystem.ts:132` 的突破粒子用的是写死的 `#ff6677`，属于警示反馈，保持不动。）

### 技能掉落物绘制 `src/render/drawDrops.ts`
- 从 `../ui/cardMeta` 的 `resolveCardMeta(drop.type, drop.star)` 取 `meta.color` / `meta.icon`。
- 主体是 `arc(0,0,20,...)` 黑色圆牌 + 类别色描边 + `ctx.fillText(meta.icon, ...)`（`bold 17px Microsoft YaHei`）。
- `shadowBlur = 18`。
- 倒计时环 `arc(0,0,27,...)`。
- ⚠ 这是 `render/` 反向依赖 `ui/`，重构时应改为依赖新的表现层模块（见下）。

### 卡面元信息 `src/ui/cardMeta.ts`（重复图标的根因）
```ts
const CATEGORY_META: Record<Category, { icon: string; color: string }> = {
  projectile: { icon: '◆', color: '#ff6577' },
  control:    { icon: '❄', color: '#4de2ff' },
  domain:     { icon: '☀', color: '#ff9d4d' },
  economy:    { icon: '♣', color: '#ffd166' },
  defense:    { icon: '⛨', color: '#5cffb1' },
};
```
`resolveCardMeta` 只按 `def.category` 取图标/颜色 → 同类卡视觉全相同。`CardMeta` 当前是 `{ name, desc, icon, color }`。

### 手牌/装备 `src/ui/slotFactory.ts`
直接插入 Unicode 字符：`el.innerHTML = \`<b>${meta.icon} ${meta.name}</b>...\`` 并设 `el.style.setProperty('--card', meta.color)`。

### 文案 `src/data/texts.json`
`cards[id] = { name, descByTier: { "1","3","5","6" } }`，键为卡 ID。`cardMeta.ts` 已有 `nearestTier(star)` 把星级映射到 1/3/5/6。**视觉数据不要塞进 texts.json。**

### 技能配置 `src/config/base/skills.json`（v0.4.0）—— 禁止在此加视觉字段
`src/config/skillValidator.ts` 用严格白名单校验，任何未登记字段直接抛错：
```ts
const CARD_KEYS = new Set(['id','category','textKey','teaching','stars','amplifyAxis','consumable','implementationBatch','designNotes']);
```
所以 `color/shape/glyph` **绝不能**加进 `skills.json`。视觉是表现数据，必须独立于技能规则 Schema。

### 正式卡池（11 张，ID 与大类已核实）
- projectile：`pierce`、`chainLightning`、`splitBlast`
- control：`frost`、`decoy`、`impact`
- domain：`scorch`、`sanctum`
- economy：`harvest`
- defense：`aegis`、`thorns`

### 数据模型与调试接口（不要改）
- `src/core/types.ts`：`GroundDrop` 已含 `type: CardType`、`star`、坐标、寿命；绘制时按 `type` 查视觉即可。
- 生成签名：`spawnGroundDrop(state, config, rng, x, y, forcedType, star?)`。
- DEV 调试接口：`window.__game.spawnGroundDrop(x, y, type, star)`（人工验收用）。

## 11 张卡的首版视觉分配（可直接落地，非最终美术稿）

| 大类 | 卡 ID | 颜色 | 外轮廓 shape | 内部符号 glyph |
|---|---|---|---|---|
| projectile | `pierce` | `#ED5C86` 玫红 | `diamond` 长菱形 | 贯穿上下边的竖线 |
| projectile | `chainLightning` | `#F06478` 红紫 | `hexagon` 六边形 | 折线闪电 |
| projectile | `splitBlast` | `#F47759` 珊瑚红 | `triangle` 正三角 | 中心分出的三条短线 |
| control | `frost` | `#58D8EA` 青蓝 | `circle` 圆 | 六向放射线 |
| control | `decoy` | `#6A9DE8` 天蓝 | `square` 正方 | 同心小方框+中心点 |
| control | `impact` | `#8C8FE3` 蓝紫 | `octagon` 八边 | 四向外推箭头 |
| domain | `scorch` | `#F28A47` 橙 | `pentagon` 五边 | 两层嵌套三角 |
| domain | `sanctum` | `#EFCB59` 金橙 | `ring` 圆环 | 十字准星+内圆 |
| economy | `harvest` | `#B4D75B` 黄绿 | `capsule` 胶囊 | 三个递增圆点 |
| defense | `aegis` | `#60D3A8` 薄荷绿 | `verticalHexagon` 纵向六边 | 两条水平防线 |
| defense | `thorns` | `#49B962` 深绿 | `star8` 八角星 | 中心菱形 |

要求：同类色相相近（红/玫红/珊瑚；青/蓝/蓝紫；橙/金橙；薄荷/深绿），但任意两卡颜色、shape+glyph 组合都唯一；转灰度后仍能靠 shape+glyph 区分。

## 实现步骤

### 第 1 步：新增独立的卡牌视觉注册表（不碰 skills.json）
新增 `src/presentation/cardVisuals.json`，用「类别基础色相 + 每卡色相偏移」结构，便于换肤时只调类别基色：
```json
{
  "version": "1.0.0",
  "families": {
    "projectile": { "hue": 350, "saturation": 82, "lightness": 64 },
    "control":    { "hue": 210, "saturation": 78, "lightness": 66 },
    "domain":     { "hue": 36,  "saturation": 86, "lightness": 63 },
    "economy":    { "hue": 82,  "saturation": 65, "lightness": 60 },
    "defense":    { "hue": 148, "saturation": 60, "lightness": 58 }
  },
  "cards": {
    "pierce":         { "hueOffset": -12, "shape": "diamond",         "glyph": "pierce" },
    "chainLightning": { "hueOffset": 6,   "shape": "hexagon",         "glyph": "zigzag" },
    "splitBlast":     { "hueOffset": 18,  "shape": "triangle",        "glyph": "split" },
    "frost":          { "hueOffset": -8,  "shape": "circle",          "glyph": "snow" },
    "decoy":          { "hueOffset": 10,  "shape": "square",          "glyph": "target" },
    "impact":         { "hueOffset": 24,  "shape": "octagon",         "glyph": "impact" },
    "scorch":         { "hueOffset": -6,  "shape": "pentagon",        "glyph": "ember" },
    "sanctum":        { "hueOffset": 14,  "shape": "ring",            "glyph": "crosshair" },
    "harvest":        { "hueOffset": 0,   "shape": "capsule",         "glyph": "harvest" },
    "aegis":          { "hueOffset": -10, "shape": "verticalHexagon", "glyph": "barrier" },
    "thorns":         { "hueOffset": 12,  "shape": "star8",           "glyph": "thorn" }
  }
}
```
> 上表颜色列是最终期望效果，请用 families+hueOffset 计算得到接近的色值；如为省事也可直接把上表 HEX 写进配置，但仍需保留 shape/glyph 字段与「类别基色可换肤」的结构。

新增 `src/presentation/cardVisual.ts`：
```ts
export interface CardVisual {
  accent: string;      // 最终 HEX/HSL 颜色
  shape: SkillShape;
  glyph: SkillGlyph;
}
export function resolveCardVisual(cardType: CardType): CardVisual;
```
- 未知卡必须返回明确的灰色问号后备视觉（`accent:'#8793a3', shape:'circle', glyph` 为一个通用 fallback），**绝不返回 undefined**。

### 第 2 步：共享几何定义 `src/presentation/skillGeometry.ts`
不要在 `drawDrops.ts` 里写 `if(type==='pierce')…` 分支。建立通用枚举 + 数据化几何：
```ts
type SkillShape =
  | 'circle' | 'triangle' | 'square' | 'diamond' | 'pentagon'
  | 'hexagon' | 'octagon' | 'ring' | 'capsule' | 'verticalHexagon' | 'star8';
type SkillGlyph =
  | 'pierce' | 'zigzag' | 'split' | 'snow' | 'target'
  | 'impact' | 'ember' | 'crosshair' | 'harvest' | 'barrier' | 'thorn';

type GeometryCommand =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'line'; x: number; y: number }
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'close' };
```
提供两个出口，保证 Canvas 掉落与 DOM 卡牌用**同一套**几何（避免战场图标≠卡槽图标）：
```ts
traceGeometryToCanvas(ctx, geometry, size);  // 描到 Canvas 路径
geometryToSvgPath(geometry): string;         // 生成 SVG path d
```

### 第 3 步：重写 `src/render/drawDrops.ts`
改为依赖 `presentation/cardVisual` + `presentation/skillGeometry`（消除 render→ui 反向依赖）：
1. `const visual = resolveCardVisual(drop.type);`
2. 用 `visual.shape` 画深色主体（保留原深色底 `rgba(5,13,24,.9x)`）。
3. 用 `visual.accent` 画描边和**适度**发光：`shadowBlur` 从 18 降到 **10–12**。
4. 用 `visual.glyph` 画内部线性符号（用 `visual.accent`）。
5. 倒计时环继续用固定圆形（半径 27），逻辑不变。
6. 点击判定半径不变（仍用现有 20/命中半径），不随轮廓改变。

### 第 4 步：同步手牌 / 装备卡面
改 `src/ui/cardMeta.ts`：删掉 `CATEGORY_META`，`CardMeta` 改为组合文案(texts) + 视觉(cardVisual)：
```ts
export interface CardMeta {
  name: string;
  desc: string;
  accent: string;
  shape: SkillShape;
  glyph: SkillGlyph;
}
```
（保留 `cardDisplayName`、`nearestTier`、descByTier 取文案逻辑；颜色/形状/图标改为来自 `resolveCardVisual`。）

改 `src/ui/slotFactory.ts`：不再插 Unicode 字符，改用内联 SVG：
```ts
el.style.setProperty('--card', meta.accent);
el.innerHTML =
  `<b><svg class="card-icon" viewBox="0 0 16 16">${glyphToSvg(meta.shape, meta.glyph)}</svg>` +
  `<span>${meta.name}</span></b>` +
  `<em>${'★'.repeat(card.star)}</em><small>${meta.desc}</small>`;
```
改 `src/styles/app.css`，新增：
```css
.card-icon { width: 14px; height: 14px; color: var(--card); flex: none; }
```
（用 `currentColor` 让 SVG 描边跟随 `--card`，规避中文字体/Unicode 差异导致的图标变形。）

### 第 5 步：敌人消色 + 轮廓清理
改 `src/config/base/enemies.json`：三种普通敌人同色中性灰：
```json
"normal": { ... "color": "#8793a3" },
"fast":   { ... "color": "#8793a3" },
"tank":   { ... "color": "#8793a3" }
```
Boss 也不再用大面积紫：改深灰主体 + 白/淡金双层描边（用尺寸和双层轮廓表达特殊性）。

改 `src/render/drawEnemies.ts`：
- `shadowBlur` 从 18 降到 **4–6**，普通敌人可完全不发光；`shadowColor` 用低透明中性灰而非 `e.color`。
- 主体 `fillStyle` 用中性灰；血条填充改统一浅灰，不再用 `e.color`。
- 顶点半径由 `e.r * (i % 2 ? 0.82 : 1)` 改为规则多边形 `const r = e.r;`（得到规则三角/菱形/六边/八边）。
- 可选：按类型只加描边粗细强化重量感（不引入颜色）：`tank=3, boss=4, 其他=2`。
- 状态环 / Bounty 环 / 突破粒子颜色**保持不变**。

改 `src/core/systems/damageSystem.ts:19` 与 `src/core/systems/enemySystem.ts:117`：粒子颜色从 `e.color`/`enemy.color` 改为中性灰。

### 不要改
`src/config/base/skills.json`、`src/config/skillValidator.ts`、`docs/skills-schema.json`、`src/core/types.ts`、`src/core/systems/dropSystem.ts`、`src/core/systems/cardSystem.ts`、`src/core/effects/*`、`src/input/*`。

## 测试要求

改现有 `tests/renderSmoke.test.ts`：把对 `meta.icon`/`meta.color` 的断言改为新字段：
```ts
expect(meta.accent).toBeTruthy();
expect(meta.shape).toBeTruthy();
expect(meta.glyph).toBeTruthy();
```

新增 `tests/cardVisuals.test.ts`，至少覆盖：
1. `cfg.skills.cards` 每个 `id` 有且仅有一个视觉定义。
2. 视觉配置里不存在已删除/不存在的技能 ID（无孤儿）。
3. 每张卡的 `shape + glyph` 组合唯一。
4. 同类别内任意两卡最终 `accent` 不完全相同。
5. 每张卡在 1–6 星时 accent/shape/glyph 不变（视觉是身份，不随星级变）。
6. 未知卡返回稳定后备视觉（不抛错、不 undefined）。
7. `normal/fast/tank` 主体色完全相同。
8. 11 种掉落物调用 `drawDrops` 不抛异常（沿用 renderSmoke 的 fakeCtx Proxy 打桩）。
9. 四种敌人调用 `drawEnemies` 不抛异常。

最后必须跑通：
```bash
npm test
npm run build
```

## 人工验收（可选，附给 PR 描述）
DEV 构建下在控制台一次生成全部 11 张：
```js
const ids = ['pierce','chainLightning','frost','decoy','scorch','harvest','aegis','splitBlast','impact','sanctum','thorns'];
ids.forEach((id, i) => window.__game.spawnGroundDrop(120 + (i%4)*100, 180 + Math.floor(i/4)*100, id, 1));
```
需覆盖：彩色下一眼可分 / 灰度截图靠轮廓+符号可分 / 掉落重叠可分 / 75% 缩放符号仍清晰 / 高速敌人经过掉落物不再混色 / 冻结·减速·Bounty 环比改前更醒目 / 手牌·装备·地面三处图标语言一致。

## 提交拆分（三个独立 commit，便于回滚与对比）
1. `feat: add per-skill visual identity registry` —— 新增 `cardVisuals.json` + `cardVisual.ts` + `skillGeometry.ts` + `cardVisuals.test.ts`。
2. `feat: render unique skill badges across drops and cards` —— 改 `drawDrops.ts`、`cardMeta.ts`、`slotFactory.ts`、`app.css`、`renderSmoke.test.ts`。
3. `refactor: make enemy hierarchy shape-first` —— 改 `enemies.json`、`drawEnemies.ts`、`damageSystem.ts`、`enemySystem.ts`（消色 + 规则多边形 + 中性粒子/血条）。

## 交付清单
- 新增：`src/presentation/cardVisuals.json`、`src/presentation/cardVisual.ts`、`src/presentation/skillGeometry.ts`、`tests/cardVisuals.test.ts`
- 修改：`src/config/base/enemies.json`、`src/render/drawEnemies.ts`、`src/render/drawDrops.ts`、`src/ui/cardMeta.ts`、`src/ui/slotFactory.ts`、`src/styles/app.css`、`src/core/systems/damageSystem.ts`、`src/core/systems/enemySystem.ts`、`tests/renderSmoke.test.ts`、`README.md`
- `npm test` 与 `npm run build` 均通过。

===== PROMPT 结束 =====
