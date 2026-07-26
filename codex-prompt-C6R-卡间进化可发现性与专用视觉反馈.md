# Codex 任务 C6R：卡间进化「可发现性 + 专用视觉反馈」（表现/引导层）

> 前置：C6 已合并，卡间进化核心逻辑已上线。总纲见 `docs/神池构筑系统_总纲与阶段计划.md`。
> **本任务只改表现与引导层，不动核心规则、配方判定与数值。** 文件行号仅供导航，以符号名为准。结束时 `npm test` 与 `npm run build` 通过。

---

## 一、背景与目标

卡间进化的核心已完整实现并接入主流程（材料检测、波间确认、精确消耗、产物生成、遥测），但玩家在试玩中几乎看不到它。已核实的可发现性缺口：

| 位置 | 现状 | 问题 |
|---|---|---|
| `src/ui/renderMergeHints.ts` L79–85 | 战斗中只显示一行 `存在可进化配方：N` 的胶囊文字 | 无连线、不指明是哪两张卡、不指明产物 |
| `src/styles/app.css` L30 | `.recipe-evolution-hint` 为 10px 小胶囊 | 提醒力度极弱 |
| `src/ui/eventText.ts` L39–41 | `recipeAvailable` 事件被翻译为 `null` | 首次凑齐材料无任何 Toast/Banner |
| `src/ui/cardDetailModel.ts` L255–268 | 仅在 `def.recipeOnly` 的**产物卡**上显示配方 | 信息倒置：材料卡不告诉玩家自己能进化成什么 |
| 两张材料卡之间 | 完全没有连线 | 无法与普通合成区分，玩家无从发现 |

**目标**：让玩家在凑齐 / 接近凑齐配方时，一眼看清「哪两张卡、能进化成什么、何时能做」，且进化提示在视觉上与普通合成明显区分。

---

## 二、硬性不变量（必须遵守）

1. **不改核心规则**：`availableRecipes` / `confirmRecipe` / `evolutionRecipes.json` 的判定、材料消耗、产物生成、遥测事件全部保持不变。本任务不新增/修改任何配方。
2. **进化视觉必须与普通合成明显区分**：禁止复用 `.merge-hint-line` / `.merge-hint-glow` / `.merge-hint-dot` 的 class 与配色。进化连线必须使用全新独立 class 和不同的颜色 / 线宽 / 线型 / 动画。
3. **波间「准备完成」按钮行为保持现状**：**不新增**跳过拦截或二次确认（已确认的产品决策）。仅可优化配方面板标题 / 产物预览的清晰度。
4. **战斗中不新增可拖拽 / 可点击目标**：进化连线是 `pointer-events:none` 的纯提示层，不改变任何卡牌交互。
5. **6 条配方全覆盖**：连线、文字、详情预告都必须对全部 6 条配方（frozenThunder / solarLance / avalanche / pyrestorm / crownOfThorns / goldenIdol）生效，不能只对 frozenThunder 有效。

---

## 三、具体改动（按文件）

### 1) `src/ui/renderMergeHints.ts` —— 战斗中专用进化连线 + 完整文字

- 新增 `findRecipeHintPairs(state)`：基于 `availableRecipes(state)` 返回的每条配方的两张材料实例（`recipe.a.cardId` / `recipe.b.cardId`），产出
  `{ recipeId, aCardId, bCardId, outputCardId, outputStar }[]`。
- 在 `renderMergeHints` 中，在现有 merge 线之外**额外绘制一层独立 SVG `.recipe-hints`**：
  - 对每条配方，在两张材料卡 `.card[data-id]` 之间画一条**专用连线**（青蓝→紫渐变、实线或双线、线宽明显更粗）。
  - 连线中央放一个 `.recipe-hint-core`（菱形 / 星核 / “进化”图标）。
  - 可选：`.recipe-hint-glow` 让粒子 / 光晕从两端向中央汇聚。
  - 给两张材料卡加 `.recipe-ready` 外框脉冲（在 `.card` 元素上 toggle，或在 hint 层单独描边——择一，注意勿与拖拽 / 合成线冲突）。
- **文字提示**：把现有 `存在可进化配方：N` 换成逐条完整信息，用 `cardDisplayName` 取中文名，例如：
  > 卡间进化就绪：连锁闪电 5★ ＋ 冰霜 5★ → 冻雷 6★（波间可确认）
  多条配方**逐组显示**，不要只写数量。
- 保留普通合成线（`.merge-hint-*`）现有表现不变。

### 2) `src/styles/app.css` —— 独立样式（禁止复用 merge-hint 系列）

- 新增 `.recipe-hints` / `.recipe-hint-line` / `.recipe-hint-glow` / `.recipe-hint-core` / `.card.recipe-ready` / 进化文字容器等 class。
- 与 `.merge-hint-*` 在**颜色（青蓝紫 vs 白）、线宽、线型（实线 / 双线 vs 虚线 dasharray）、动画**上都要能一眼区分。
- 补 `@media (prefers-reduced-motion:reduce)` 降级（关闭进化连线动画）。

### 3) `src/ui/eventText.ts` —— 首次就绪 Banner / Toast

- 让 `recipeAvailable` **不再返回 `null`**：首次进入波间且存在配方时返回一句明确提示，例如：
  > 已凑齐卡间进化材料，本波结束后可在波间完成进化。
- `src/game.ts` L93–94 已经会把 `formatToast` 的非 null 文案交给 `toast()`，**无需改 game.ts 管线**。
- **去重**：避免每次波间 / 每帧重复弹。建议在 `state` 上记一个「已提示过的配方签名」或首次标记，或仅在 `recipeAvailable` 事件（decide→free 一次性发出）时弹。由 Codex 落地具体实现。

### 4) `src/ui/cardDetailModel.ts` —— 材料卡反向配方预告（修复信息倒置）

- 现状 `buildSkillTreeViewModel` 只在 `def.recipeOnly` 产物卡上给 `recipe` 视图。
- 新增：对任意卡，反查 `cfg.evolutionRecipes.recipes` 中该 `card.type` 是否为某配方的 `ingredientA` 或 `ingredientB`；若是，附加一段「进化配方（作为材料）」信息：搭档卡名 + 最低星、产物卡名 + 星级，文案如：
  > 进化配方：本卡达到 5★ 后，可在波间与「冰霜 5★」进化为「冻雷 6★」。
- 该信息**从 1★ 起就可见**（不依赖当前是否已达 5★，只在文案里写「达到 5★ 后可…」）。
- 扩展 `RecipeViewModel` / `SkillTreeViewModel` 类型以承载「作为材料」的条目，与现有「作为产物」的 `recipe` 字段共存（建议用数组或独立字段 `asIngredient`）。
- `src/ui/cardDetailModal.ts` 相应新增区块渲染这段。

### 5) `src/data/texts.json` —— 文案

- 在 `toast` / `evolution` 节点新增：首次就绪提示、战斗连线文案模板、材料卡详情「作为配方材料」文案模板。
- 用占位符（如 `{a}` `{b}` `{output}` `{star}`）配合现有 `fmt`。

---

## 四、测试与验收（`tests/`）

1. **更新** `tests/recipeEvolution.test.ts` L221 的 `'emits recipe availability … shows only a silent combat hint'`：现在应断言存在专用进化连线（`.recipe-hints` / `.recipe-hint-line`）与完整文字（含材料名 + 产物名），并移除 / 改写 “silent” 语义。
2. `tests/mergeHints.test.ts` 或新增用例：
   - 存在配方时 dock 内出现 `.recipe-hints`，且**不复用** `.merge-hint-line` class。
   - 进化连线连接的正是两张配方材料卡（`data-id` 对应 `availableRecipes` 的 `a`/`b`）。
   - 文字包含材料名与产物名。
3. 新增：`recipeAvailable` 事件经 `formatToast` 返回非 null（首次就绪有提示）；重复触发不重复弹（去重断言）。
4. 新增：`cardDetailModel` 对材料卡返回「作为配方材料」预告，指向正确的搭档与产物；对 **6 条配方各校验一次**（含材料在 1★ 时也可见）。
5. **回归**：`confirmRecipe` / `availableRecipes` 行为与既有断言不变；「准备完成」无新增拦截。
6. `npm test` 与 `npm run build` 通过。

---

## 五、不做（避免范围蔓延）

- 不加波间「准备完成」跳过拦截 / 二次确认。
- 不改配方数值、材料、产物效果、掉落规则。
- 不实现任意组合「融合」。
