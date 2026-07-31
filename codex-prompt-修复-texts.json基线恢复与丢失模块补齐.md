# Codex Prompt：恢复 texts.json 基线 + 补齐丢失模块（两处独立损坏）

## 背景：这不是「第 379 行 JSON 语法错误」

`main`（HEAD = `2afc292`）上同时存在**两处彼此独立的损坏**。只修其中一处，`npx tsc --noEmit` 仍然不会通过。

### 损坏 A：`src/data/texts.json` 被截断 + 写入垃圾字节

已用字节级比对确认，不是"乱码/二次编码"，而是**部分写入（partial write）**：

| 项 | main (`0d8eac32`) | `codex/mobile-stage-architecture` (`f9c0c347`) |
|---|---|---|
| 字节数 | 30013 | 149442 |
| UTF-8 | 第 14999 字节起非法 | 有效 |
| JSON | 无法解析 | 有效，20 个顶层键 |
| `evolution` 分支 | 无法核对 | 35 节点 / 210 分支 |
| 分支字段 | — | 恰好 `name` / `summary` / `intent` |
| `keywords` / `buildFit` | — | 无 |

**决定性证据**：两份文件的**前 15000 字节完全逐字节相同**，从第 15000 字节（第 379 行 `impact2x.summary` 中途）开始 main 变成位移过的垃圾字节，并在 30013 字节处截断。15000 是整数边界 —— 典型的写入中断。

因此 `f9c0c347` 就是这份文件的真身，不需要重新迁移、不需要从 Markdown 反解析、不需要手工修复。

**历史定位**：`2532aee`（main）与 `bdac58b`（mobile 分支）是同一份工作的孪生提交，都从 `9a482f0` 分叉。`bdac58b` 的产物完好，`2532aee` 的产物被写坏。`9a482f0` 上的 texts.json 有效但仍是旧五字段结构（210 分支 × `name/summary/intent/keywords/buildFit`），不能直接用。

**其他分支均不可用**（`codex/fix-weapon-fusion`、`refactor/affix-base-stat-mul`、两个 `archive/*` 全是五字段旧结构；`codex/publish-current-version` 只有 4 个顶层键的残片）。

**全仓扫描结论**：511 个跟踪文件中，除 `src/data/texts.json` 外没有第二个损坏的文本文件（`docs/经验升级模块_Codex提示词.md` 的非法字节是历史遗留，不在本次范围）。所谓「文件前半部分中文已二次编码」的说法不成立 —— 前 14999 字节解码正常。

### 损坏 B：五个模块文件从未被提交，且不存在于任何分支或 stash

`2afc292`（"upload current copy draft and worktree changes"）把手机适配的**调用方**代码合进了 main，但**被调用的新模块文件**没有一起进来：

```
src/platform/viewportManager.ts   ← src/game.ts:49
src/debug/layoutDebug.ts          ← src/game.ts:50
src/core/simulationClock.ts       ← src/game.ts:51
src/platform/stageMetrics.ts      ← src/input/pointerRouter.ts:4
src/render/renderMetrics.ts       ← canvasRenderer.ts:13 / drawBountyOffers.ts:6 / drawDrops.ts:4
```

已确认这五个文件**在所有本地与远端分支、所有 5 个 stash 中都不存在**，无法从 git 恢复，只能重新实现。

只恢复 texts.json 后，`tsc` 会剩下 7 条 `TS2307: Cannot find module`，`tests/renderSmoke.test.ts` 与 `tests/pointerRouter.test.ts` 整个 suite 加载失败。

---

## 阶段 0：状态分诊（必做，先看清楚再动手）

**工作区可能已经被上一轮修复动过。** 先执行：

```bash
git status --short
git hash-object src/data/texts.json
```

按结果分支：

| `git hash-object` 输出 | 含义 | 走哪条路 |
|---|---|---|
| `f9c0c3477e0611f3486d07da85cbadaabd605b67` | texts.json 已恢复 | 跳过阶段 1 |
| `0d8eac3201f840dbb968ddfd8831b40a296b6d7c` | 仍是损坏版 | 执行阶段 1 |
| 其他 | 有人改过 | **停下报告**，不要覆盖 |

再检查五个模块：

```bash
ls -1 src/platform/stageMetrics.ts src/platform/viewportManager.ts \
      src/debug/layoutDebug.ts src/core/simulationClock.ts \
      src/render/renderMetrics.ts 2>&1
```

全部存在 → 跳过阶段 2，直接进阶段 3 验证并把它们纳入提交。
缺失 → 执行阶段 2。

> 参考：截至撰写时，工作区已存在一版修复成果（texts.json 已 `git add`，五个模块以未跟踪文件形式存在），`npx tsc --noEmit` 退出码 0，`renderSmoke` / `pointerRouter` / `bottomNoticeLayout` / `textCoverage` / `designViews` / `decisionModal` 全绿。若与此一致，主要任务是验证 + 提交 + 加防复发校验，而不是重做。

**另外**：仓库可能残留一个失效的 worktree 记录 `/tmp/vlwt`（调查时创建，沙箱权限所限未能清除）。执行一次清理：

```bash
git worktree remove /tmp/vlwt -f -f || rm -rf .git/worktrees/vlwt
git worktree prune
git worktree list   # 应只剩主工作区
```

---

## 阶段 1：恢复 texts.json（仅当阶段 0 判定需要）

前置：`git status --short` 中 `src/data/texts.json` 不能有你不认识的改动。

```bash
git fetch origin codex/mobile-stage-architecture
git restore --source=origin/codex/mobile-stage-architecture -- src/data/texts.json
git hash-object src/data/texts.json
```

必须输出 `f9c0c3477e0611f3486d07da85cbadaabd605b67`。不是就停下报告 —— 说明远端分支已漂移。

**禁止**：merge `codex/mobile-stage-architecture`、cherry-pick 整个提交、恢复该分支的任何其他文件（UI / CSS / 游戏代码一律不要）。

立即做字节级校验（不要先跑 tsc）：

```bash
node --input-type=module -e "
import fs from 'node:fs';
const bytes = fs.readFileSync('src/data/texts.json');
const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
if (text.includes('�')) throw new Error('contains U+FFFD');
const data = JSON.parse(text);
console.log('UTF-8 OK / JSON OK / top-level keys:', Object.keys(data).length);
"
```

必须使用 `new TextDecoder('utf-8', { fatal: true })`。`readFileSync(path,'utf8')` 遇非法字节会静默替换，不构成严格校验。

---

## 阶段 2：补齐五个模块（仅当阶段 0 判定缺失）

从调用点反推最小契约，**不要**去 mobile 分支找（那里没有）。

### `src/platform/stageMetrics.ts`
舞台/竞技场逻辑坐标常量与自适应度量。至少导出：
- `ARENA_WIDTH`、`ARENA_HEIGHT`（`pointerRouter.ts` 用它把 clientX/Y 换算成逻辑坐标，并算 `arenaScale = rect.width / ARENA_WIDTH`）
- 建议一并提供 `STAGE_WIDTH`、`STANDARD_STAGE_HEIGHT`、`COMPACT_STAGE_HEIGHT`、`MIN_STAGE_SCALE`、`StageVariant`、`Insets`、`ViewportRect`、`StageMetrics`，供 `viewportManager` 复用

### `src/render/renderMetrics.ts`
```ts
applyLogicalCanvasTransform(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void
currentArenaCssScale(ctx: CanvasRenderingContext2D): number
logicalFontPx(targetScreenCssPx: number, arenaCssScale: number, min?: number, max?: number): number
```
- `applyLogicalCanvasTransform` 用 `ctx.setTransform(canvas.width/ARENA_WIDTH, 0, 0, canvas.height/ARENA_HEIGHT, 0, 0)`
- `currentArenaCssScale` 必须对无 `getBoundingClientRect` 的 canvas 返回 `1`（happy-dom 测试环境会命中）
- 建议一并提供 DPR 上限与 backing store 计算（`renderDpr`、`calculateCanvasBacking`、`resizeCanvasBackingStore`）

### `src/platform/viewportManager.ts`
```ts
createViewportManager(opts: {
  host: HTMLElement; stage: HTMLElement; canvas: HTMLCanvasElement;
  onChange: () => void;
}): { getSnapshot(): ViewportSnapshot | null }
```
`ViewportSnapshot` 需导出，含 `metrics`、`visualViewport`（`width/height/scale/offsetLeft/offsetTop`）、`arenaRect`、`canvas`、`safeArea`。`onChange` 在尺寸/朝向/visualViewport 变化时触发。

### `src/debug/layoutDebug.ts`
```ts
createLayoutDebug(getSnapshot: () => ViewportSnapshot | null): { update(): void }
```
仅在 URL 含 `?layoutDebug` 时挂载调试面板，否则返回 no-op。可用 `declare const __GIT_COMMIT__: string;`（`vite.config.ts:178` 已 define，不需要改配置）。

### `src/core/simulationClock.ts`
```ts
simulationSteps(elapsedSeconds: number, maxStepSeconds: number, maxCatchUpSeconds?: number): number[]
```
把墙钟时间切成稳定步长（`game.ts:396` 里 `for (const dt of simulationSteps(elapsed, cfg.combat.dtCap))`）。低帧率下保持实时速度，后台标签页的超长间隔要封顶（建议默认 0.5s）。非有限值或 ≤0 返回 `[]`。

**约束**：只新增这五个文件。不要为了让它们编译而改 `game.ts` / `pointerRouter.ts` / `canvasRenderer.ts` / `drawBountyOffers.ts` / `drawDrops.ts` 的调用方式 —— 调用点是既定契约。

---

## 阶段 3：验证

### 内容核对（四项）

1. **进化分支字段**：`evolution` 下每个「节点对象」的每个分支恰好三键 `name` / `summary` / `intent`；总计 35 节点 / 210 分支；全文件不含 `keywords`、`buildFit`。
   ⚠️ `evolution` 顶层还有 `lockNotice`、`pending`、`nextCheckpoint`、`recipeCombatHint`、`recipeAsIngredient` 等字符串键，校验脚本不能把它们当成分支对象（正确做法：只有当某键的值是 dict 且其所有 value 都是 dict 时，才视为节点）。

2. **玩家界面无「适合：」**
   ```bash
   rg -n "适合：" src/
   ```
   预期无输出（当前已满足）。

3. **`optionCopy()` 玩家侧读 `summary`**：`src/ui/cardDetailModel.ts:216` 应为
   ```ts
   summary: copy?.summary ?? copy?.intent ?? `强化${effectKeywords.join('与') || '当前机制'}`,
   ```
   当前已满足，不要改动。
   （注意：`cardDetailModel.ts` 与 `effectText.ts` 里的 `.keywords` 是**效果文本关键词**，与已退役的 `evolution.*.keywords` 无关，不要误删。）

4. **TypeScript**
   ```bash
   npx tsc --noEmit
   ```
   `TS1490` 与 `TS2307` 都应消失。

### 回归

```bash
npx tsc --noEmit
npm test
npm run validate
npm run build
git diff --check
```

`npm test` 有 91 个测试文件、整轮较慢，请给足超时；不要用短超时反复中断重跑。

### 验收标准

1. `texts.json` 严格 UTF-8 解码通过（`fatal: true`）
2. `JSON.parse()` 通过，20 个顶层键
3. 35 个进化节点 / 210 个分支全部存在
4. 每个分支恰好 `name` / `summary` / `intent`
5. 全文件无 `keywords` / `buildFit`
6. `src/` 内无「适合：」
7. `optionCopy()` 玩家侧读 `summary`
8. 五个模块文件存在且被 git 跟踪
9. `npx tsc --noEmit` 通过
10. `npm test` 全绿
11. `npm run validate` 通过
12. `npm run build` 通过

---

## 阶段 4：防复发校验脚本

新增 `scripts/validateTextsFile.ts`。要求：**不 import `src/data/index.ts`**，直接读原始字节，否则文件损坏时报错依旧发生在模块加载层。

检查项：
- `new TextDecoder('utf-8', { fatal: true })` 严格解码
- `JSON.parse()` 通过
- 不含 `U+FFFD`
- `evolution` 节点数 / 分支数与配置一致（35 / 210）
- 每个分支恰好三字段，且不含 `keywords` / `buildFit`
- `cards`、`glossary`、`affixHelp`、`effectText` 必要节点存在

接入 `package.json`：

```json
{
  "scripts": {
    "validate:texts": "vite-node scripts/validateTextsFile.ts",
    "build": "npm run validate:texts && tsc --noEmit && vite build"
  }
}
```

推荐 CI 顺序：

```bash
npm run validate:texts
npx tsc --noEmit
npm test
npm run validate
npm run build
```

目的是把 `TS1490: File appears to be binary` 这种间接报错，前置成 `texts.json is not valid UTF-8 at byte 14999` 这种直接报错。

---

## 提交策略

拆成独立提交，任何一段出问题都能单独回退：

```
提交 A: fix(data): 从 codex/mobile-stage-architecture 恢复完整三字段 texts.json（f9c0c347）
提交 B: fix(platform): 补齐 2afc292 遗失的 viewportManager/stageMetrics/renderMetrics/layoutDebug/simulationClock
提交 C: chore(scripts): 新增 validateTextsFile 严格校验并接入 build
```

提交 A 与 B 都必须在本地通过 `tsc + test + validate + build` 之后才提交。

---

## 明确禁止

- ❌ 修「第 379 行」或对当前损坏文件做任何转码/修补 —— 后 15KB 是垃圾字节，无内容可救
- ❌ 回退整个 `2532aee`
- ❌ merge / cherry-pick `codex/mobile-stage-architecture` 或恢复它的其他文件
- ❌ 从 `9a482f0` 的五字段版本重新做数据迁移
- ❌ 从 `docs/文案工单*.md` 反向解析生成 JSON
- ❌ **把 `docs/文案稿_待审核.md` 的新文案写进 `texts.json`** —— 该文件自身标记为「待审核」，包含整套新卡名/神名。本次只恢复基线，新文案实装是**后续独立任务**，绝不与基线修复混在同一提交
- ❌ 改动 `optionCopy()`、`modals.ts`、`cardDetailModal.ts` 的现有三字段逻辑（已迁移完成）

---

## 完成后汇报

请给出：
1. 阶段 0 分诊结果（走了哪条路）
2. `git hash-object src/data/texts.json` 的实际输出
3. 进化节点数 / 分支数 / 字段集合的实测统计
4. `tsc` / `test` / `validate` / `build` 四项的实际输出尾部
5. 最终 `git log --oneline -3` 与 `git status --short`
