# Codex Prompt：HUD 重排 + 竖屏弹窗规范 + 波末顺序重构

> 目标平台是**竖屏手机 + 触控**。本次改动分四块：HUD 布局、波间状态机顺序、统一弹窗外壳、卡牌详情信息分层。
> 除第二块外**不允许改动任何战斗数值与规则**；第二块只改**阶段顺序与状态字段**，不改奖励内容本身。

---

## 0. 现状事实（已核对代码，勿重复调查）

- HUD 静态结构写死在 `index.html` 的 `<header class="game-hud">`，三列 `1fr 1fr auto`（`.hud-vital` / `.hud-progress` / `.hud-controls`），CSS 在 `src/styles/app.css`（单文件、压缩成长行）。
- `#evolutionHudText`（"进化 0/2"）只在 `src/ui/renderHud.ts:18-20` 写入，`src/ui/domRefs.ts:27` 缓存，无其他引用。
- `#godPoolText` 只在 `renderHud.ts:29-35` 写入；`tests/vitalStatSystem.test.ts:63` 的 `hudRefs()` 桩里有该字段。
- `#statModifierText` 当前拼接 `${texts.affixes.activeTitle}：` 前缀，CSS 里 `.stat-modifier-hud { grid-column:1/-1 }` 使它落在 `.hud-progress` 内、奖励条上方。
- `.hud-speed { height:32px; min-width:38px }`、`.hud-pause { width:32px; height:32px }` —— 尺寸不统一。
- `.game-shell` 宽度 `min(100vw, (100dvh - 345px)*540/730 + 16px, 540px)`；`345px` 是 HUD+dock 的高度预算常量，**HUD 行数变化后必须同步复核这个常量**。
- 波间状态机 `src/core/systems/intermissionSystem.ts`：`IntermissionStep = 'settle' | 'decide' | 'free'`（`src/core/types.ts:188`）。
  - `beginIntermission()` 直接 `step:'settle'` 并发 `waveCleared`。
  - `tickIntermission()` 的 `decide` 分支**先** `enqueueGodPoolDecisionForIntermission()`，**后** `enqueueWaveBaseRewardDecision()` —— 这就是"强化炮台排在神池之后"的直接原因。
  - `src/ui/intermissionPanel.ts` 的显示条件只有 `intermission.active && afterWave !== 0`，所以结算面板在 `settle` 帧就已经出现，早于任何选择。
- `updateGame()`（`src/core/updateGame.ts:18-23`）在 `decisions.current !== null || pending.length > 0` 时直接 `return []`，**决策期间天然阻塞推进**，新顺序不需要额外暂停机制。
- 所有决策弹窗共用 `src/ui/modals.ts` 里动态创建的 `#decisionModal`（`.modal > .modal-card > .choices > .choice`），四种 `decision.kind` 共用同一套 DOM 与样式；`.choice { min-height:132px }`，`.choices` 桌面三列、`@media (max-width:560px)` 变一列。该弹窗**没有** `role="dialog"` / `aria-modal` / 焦点管理。
- 卡牌详情 `src/ui/cardDetailModal.ts` 已有 `role="dialog"`、`aria-modal`、Esc 关闭、焦点归还，以及 `uiPauseReasons.add('cardDetail')` 暂停（`src/game.ts:147-156`）—— **暂停与可访问性逻辑不要重做**，只重构展示 DOM 与 CSS。
- 详情内容全部平铺进单个 `.card-detail-scroll`：intro / 当前效果 / 数值词条 / 关键词解释 / 完整技能树，技能树每个节点的三个分支都以完整大卡片展开。
- 测试环境：`happy-dom` + vitest，现有布局测试（`tests/cardCompactLayout.test.ts`、`tests/bottomNoticeLayout.test.ts`、`tests/decisionModal.test.ts`）断言的是 **DOM 结构与属性**，不是计算样式。新增测试沿用这个风格。

---

## 1. 顶部状态栏重排

### 1.1 新结构（`index.html`）

把 `.game-hud` 从三列改为**两行**：

```html
<header class="game-hud" aria-label="战斗状态">
  <div class="hud-status-row">
    <strong class="hud-wave">波次 <span id="waveText">0</span>/<span id="totalWavesText">5</span></strong>
    <small id="statModifierText" class="stat-modifier-hud" hidden></small>
  </div>
  <div class="hud-meter-row">
    <div class="hud-meter hud-meter-hp">
      <span class="hud-meter-label">HP <b id="hpText">100</b>/<b id="maxHpText">100</b></span>
      <div class="bar"><i id="hpBar"></i></div>
    </div>
    <div class="hud-meter hud-meter-reward">
      <span class="hud-meter-label" id="rewardMeterLabel">心防共鸣 <b id="rewardPointsText">0</b>/<b id="rewardThresholdText">10</b></span>
      <div class="bar reward"><i id="rewardBar" style="width:0%"></i></div>
    </div>
    <div class="hud-controls">
      <button class="validation-settle" id="validationSettleBtn" type="button" hidden>奖励结算 12s · 继续</button>
      <button class="hud-speed" id="speedBtn" type="button" aria-label="游戏速度：1倍" title="切换游戏速度">1×</button>
      <button class="hud-pause" id="pauseBtn" type="button" aria-label="暂停">Ⅱ</button>
    </div>
  </div>
</header>
```

**删除**：`#evolutionHudText` 节点、`#godPoolText` 节点（`.god-pool-hud` 神池信息整体从 HUD 移除；波间面板和神池弹窗里已能看到，战斗中不需要常驻）。

### 1.2 CSS（`src/styles/app.css`）

- `.game-hud { display:grid; grid-template-rows:auto auto; gap:4px; }`，删除原三列规则。
- `.hud-status-row { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:8px; align-items:baseline; }`
  - `.hud-wave` 固定不压缩。
  - `.stat-modifier-hud` 改为该行第二列：`min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;`，删除原 `grid-column:1/-1`。**溢出时省略，不允许换行把 HUD 撑高。**
- `.hud-meter-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto; gap:8px; align-items:center; }`
- `.hud-meter { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:6px; align-items:center; }` —— 文字在条**旁边**，不在条下方。删除 `.hud-vital span { display:block; margin-top:3px }`。
- 删除 `.hud-progress` 相关规则。
- 按钮统一：`.hud-speed, .hud-pause { width:30px; height:30px; min-width:0; padding:0; display:grid; place-items:center; position:relative; }`
  - **视觉 30×30，但触控热区不得缩小**：用伪元素扩到 44×44
    `.hud-speed::after, .hud-pause::after { content:""; position:absolute; inset:-7px; }`
  - `.hud-speed` 字号降到 10px 以容纳 `1×`/`2×`/`3×`。
- 极窄屏（`@media (max-width:400px)`）：`.hud-meter-row` 允许 `column-gap:6px`，`.hud-meter-label` 字号降到 9px；仍保持单行不重叠。
- 复核 `.game-shell` 的 `345px` 常量：若新 HUD 实测高度变化，同步调整该数字并在注释里写明它由 HUD + dock 高度构成。

### 1.3 TS

- `src/ui/domRefs.ts`：删除 `evolutionHudText`、`godPoolText` 两个 `el<>` 引用。
- `src/ui/renderHud.ts`：
  - 删除 `evolutionHudText` 整段（连带不再需要的 `cfg` 导入，如果没有其它用途）。
  - 删除 `godPoolText` 整段（连带 `texts.gods` 相关局部变量）。
  - `statModifierText` **去掉 `${texts.affixes.activeTitle}：` 前缀**，只输出效果内容：
    ```ts
    const content = timed.map(m => `${formatRuntimeModifier(m)} ${Math.max(0, m.remaining ?? 0).toFixed(1)}s`).join(' · ');
    refs.statModifierText.hidden = timed.length === 0;
    refs.statModifierText.textContent = content;
    refs.statModifierText.title = content; // 截断时可查看完整内容
    ```
  - 注意 `texts.affixes.activeTitle` 若在别处（词条面板/编辑器）仍被使用则保留 JSON 键，不要删 `texts.json`。
- `tests/vitalStatSystem.test.ts` 的 `hudRefs()` 桩：删除 `godPoolText` 字段。

---

## 2. 波末顺序重构（唯一涉及 core 的改动）

### 2.1 目标顺序（已拍板）

```
波次清空
→ 强化炮台选择（waveBaseReward）
→ 波末结算面板（含自动保底奖励 + 刚选的强化）
→ 下一波神池选择（godDraft / godFocus）
→ 自由整备
→ 下一波
```

### 2.2 状态机改造

`src/core/types.ts`：

```ts
export type IntermissionStep = 'rewardChoice' | 'settle' | 'godDecision' | 'free';

export interface IntermissionState {
  active: boolean;
  afterWave: number;
  step: IntermissionStep;
  settleRemaining: number;
  freeRemaining: number;
  readyConfirmed: boolean;
  rewardsGranted: WaveRewardGrant[];
  /** 本波玩家在「强化炮台」中选中的项；开局波与无可选项时为 null。 */
  selectedReward: { id: string; stat: WaveChoiceStatKind; add: number } | null;
}
```

> `selectedReward` **不要**塞进 `rewardsGranted`：后者语义是"自动保底奖励"，且类型是 `RunBaseStatKind`，而选择奖励可能是 `xpGainPct`（`WaveChoiceStatKind`），语义与类型都不同。

同步补 `selectedReward: null` 的位置：`src/core/createInitialState.ts:76-84`、`intermissionSystem.ts` 的 `beginIntermission` / `beginOpeningIntermission` / `endIntermission`。

`src/core/systems/intermissionSystem.ts`：

- `beginIntermission()`：`step: 'rewardChoice'`（`settleRemaining` 仍按 `cfg.waves.intermission.settleSeconds` 预置，供后续 settle 使用）。
- `beginOpeningIntermission()`：`step: 'godDecision'`（开局跳过强化与结算）。
- `endIntermission()` 复位为 `step: 'godDecision'`；`createInitialState` 同上（只是初始占位值，`active:false`）。
- `tickIntermission()` 重写为：

```ts
if (intermission.step === 'rewardChoice') {
  const events = enqueueWaveBaseRewardDecision(state, intermission.afterWave);
  if (events.length) return { events, complete: false };
  if (state.decisions.current || state.decisions.pending.length) return { events: [], complete: false };
  intermission.step = 'settle';
  return { events: [], complete: false };
}

if (intermission.step === 'settle') {
  // 原逻辑不变：grantFloorRewards + rewardsGranted 快照 + settleRemaining 倒计时
  ...
  if (intermission.settleRemaining <= 0) intermission.step = 'godDecision';
  return { events, complete: false };
}

if (intermission.step === 'godDecision') {
  const godEvents = enqueueGodPoolDecisionForIntermission(state, rng);
  if (godEvents.length) return { events: godEvents, complete: false };
  if (state.decisions.current || state.decisions.pending.length) return { events: [], complete: false };
  if (intermission.afterWave === 0) return { events: [], complete: true }; // 开局只到这里
  intermission.step = 'free';
  intermission.freeRemaining = Math.max(0, freeSecondsFor(intermission.afterWave));
  return { events: recomputeRecipeReadiness(state), complete: false };
}

// free 分支保持原样
```

`src/core/systems/waveRewardSystem.ts`：在 `waveBaseRewardResolver` 里，选择被解析后写入快照：

```ts
function waveBaseRewardResolver(state, config, _rng, decision, choice) {
  if (decision.kind !== 'waveBaseReward') return [];
  const events = applyWaveChoice(state, config, choice, decision.wave);
  const option = cfg.waveRewards.choice.find(def => def.id === choice);
  if (option && state.intermission.active && state.intermission.afterWave === decision.wave) {
    state.intermission.selectedReward = { id: option.id, stat: option.stat, add: option.add };
  }
  return events;
}
```

`waveBaseRewardChosen` 事件保持不变。`enqueueWaveBaseRewardDecision` 的 `waveChoiceOfferedWave` 幂等守卫保持不变。

### 2.3 结算面板（`src/ui/intermissionPanel.ts`）

- 显示条件改为：
  ```ts
  root.hidden = !intermission.active
    || intermission.afterWave === 0
    || intermission.step === 'rewardChoice'
    || intermission.step === 'godDecision';
  ```
  （`godDecision` 时隐藏，避免结算面板与神池弹窗叠在一起。）
- 倒计时文案：`settle` 用 `countdown` + `settleRemaining`；`free` 用 `countdown` + `freeRemaining`；其余用 `waiting`。
- 新增一行展示 `selectedReward`：复用 `texts.waveRewardStats` 标签，`xpGainPct` 显示 `+{add*100}%`，其余显示 `+{add}`。放在"本波基础奖励"列表之后，标题用新增文案键 `texts.intermission.selectedRewardTitle = "本波强化选择"`。
- `src/data/texts.json` 的 `intermission.steps` 键改为 `rewardChoice` / `settle` / `godDecision` / `free`：
  - `rewardChoice`: "选择本波强化"
  - `settle`: "正在结算本波成果"
  - `godDecision`: "等待神池决策完成"
  - `free`: "自由整备：可整理手牌与装备"
  - 删除旧 `decide` 键。

### 2.4 特殊情况（必须保持）

- `afterWave === 0`（开局）：不出强化炮台、不出结算面板，直接主神选择。
- 最终波胜利：`advanceWavePhase` 直接 `endGame`，不进入波间阶段 —— 现有行为不变。
- 射程封顶：`buildWaveChoiceMenu` 的 `capped` 机制不变，选项仍可见但禁用；若 `candidates` 全空则 `enqueueWaveBaseRewardDecision` 返回空、直接进入 `settle`。

### 2.5 测试（`tests/intermission.test.ts`）

- 改写 `enterFreeStep()` 辅助函数以匹配新顺序。
- **新增**一条端到端顺序断言：构造 `afterWave = 3`（此时既有 `godFocus` 决策又有 `waveBaseReward`），逐帧推进并记录 `state.decisions.current?.kind` 与 `state.intermission.step` 序列，断言为
  `rewardChoice(waveBaseReward) → settle → godDecision(godFocus) → free`，
  且 `waveBaseRewardOffered` 事件的帧**早于** `godOffer` 事件的帧。
- 新增：结算面板在 `rewardChoice` 与 `godDecision` 时 `hidden === true`，在 `settle` 与 `free` 时 `hidden === false`（happy-dom，直接调 `createIntermissionPanel`）。
- 新增：强化选择完成后 `state.intermission.selectedReward` 被正确写入。
- 保留原有：开局 mini 波间只走 godDraft；`jumpToWave` 清空波间；第 10 波直接胜利。
- 检查 `tests/golden/` 黄金回放是否因阶段顺序变化而失效；**若失效，需在 PR 说明中列出差异原因并重新生成基准**，不要静默改基准。

---

## 3. 统一弹窗外壳 + 竖屏适配

### 3.1 形态决策（已拍板）

- **选择类弹窗**（强化炮台 / 神池 / 进化分支）：**居中面板**，不是底部抽屉。窄屏下宽度 `calc(100vw - 20px)`、高度上限 `min(86dvh, 100dvh - 32px)`，垂直居中；标题区固定、**只有选项区滚动**。
- **卡牌详情**：窄屏下**全屏页**（见第 4 节）。
- **最终结算弹窗**：沿用选择类的居中面板规范。

### 3.2 新文件 `src/ui/modalShell.ts`

只负责外壳与交互规范，**不承载任何业务逻辑**。导出：

```ts
export type ModalShellMode = 'centered' | 'fullscreen';

export interface ModalShellOptions {
  mode: ModalShellMode;
  /** false = 强制选择，不可点遮罩/Esc 关闭 */
  dismissible: boolean;
  className?: string;   // 附加到 overlay
  labelledBy?: string;  // 标题元素 id
}

export interface ModalShell {
  overlay: HTMLElement;
  dialog: HTMLElement;
  header: HTMLElement;   // 固定
  body: HTMLElement;     // 独立滚动
  footer: HTMLElement;   // 可选，默认 hidden
  open(returnFocus?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}
```

统一提供：`role="dialog"` + `aria-modal="true"` + `aria-labelledby`、打开时把焦点移入对话框、关闭时归还焦点、Tab 焦点循环限制（仅在 `dialog` 内可见可聚焦元素之间）、`dismissible:false` 时忽略 Esc 与遮罩点击、`overscroll-behavior:contain` + `touch-action:pan-y` 防止背景滚动穿透、上下 `env(safe-area-inset-*)` 内边距。

### 3.3 迁移

- `src/ui/cardDetailModal.ts` → `modalShell({ mode:'fullscreen', dismissible:true })`。**保留现有的 `hooks.onOpen/onClose` 与 `uiPauseReasons` 契约不变**（`tests/cardDetailPause.test.ts` 必须继续通过）。
- `src/ui/modals.ts` 的 `#decisionModal` → `modalShell({ mode:'centered', dismissible:false })`。
- `#resultModal`（`index.html` 里的静态节点）→ 保留静态 DOM，但套用同一套居中面板 CSS 规范（`.modal-card` 的移动端规则）。

### 3.4 选择弹窗 CSS

- `.modal-card`：窄屏 `@media (max-width:560px)` 下 `width:calc(100vw - 20px); max-height:min(86dvh, calc(100dvh - 32px)); padding:14px 12px; display:grid; grid-template-rows:auto auto minmax(0,1fr);`，标题 `h2` 与说明 `p` 不滚动，`.choices` 独立滚动（`min-height:0; overflow-y:auto; overscroll-behavior:contain;`）。
- 按 `decision.kind` 分密度：在 `showDecision` 里设 `decisionCard.dataset.kind = decision.kind;`，CSS：
  - `[data-kind="waveBaseReward"] .choice { min-height:64px; padding:10px 12px; display:grid; grid-template-columns:minmax(0,1fr) max-content; align-items:center; }` —— 标签在左、数值在右，5 项在 360×800 下不滚动或仅微滚。
  - `[data-kind="godDraft"] .choice`、`[data-kind="godFocus"] .choice { min-height:92px; }`（需容纳 `.god-roster-preview`）。
  - `[data-kind="evolutionBranch"] .choice { min-height:0; }`，内容自然撑高，靠 `.choices` 滚动。
  - 删除 `.choice` 上无条件的 `min-height:132px`，改为仅桌面（`@media (min-width:561px)`）生效。
- 整张 `.choice` 都是点击区域（现状已是 `<button>`，保持）；禁用态 `.choice:disabled` 现有虚线 + 半透明样式保留，但补 `aria-disabled` 说明文本。
- 禁止横向滚动：`.modal-card { overflow-x:hidden; }`，长文本 `overflow-wrap:anywhere`。

### 3.5 一并纳入竖屏验收的界面

- **开局难度选择** `.difficulty-select`：现为固定 `repeat(4,auto)`，窄屏改 `repeat(2,minmax(0,1fr))`（2×2），每个 `span` 触控高度 ≥ 40px。
- **最终结算弹窗**：`.result-grid` 三列在 320px 下会挤，窄屏改 `repeat(3,minmax(0,1fr))` + 字号下调，或降为单列——以不溢出为准。
- **波末整备面板** `.intermission-panel`：现为 `grid-template-columns:1fr auto` 且"准备完成"按钮 `grid-row:1/4` 跨行占右侧。窄屏（`max-width:420px`）改为单列，按钮移到底部整宽、高度 ≥ 44px。
- **奖励蓄力条触发后的奖励展示**（`rewardCelebration`）属于非阻塞反馈，**不改造成弹窗**，只需确认它不与新 HUD 重叠。

---

## 4. 卡牌详情：全屏页 + 信息分层

### 4.1 布局

窄屏（`max-width:560px`）下 `.card-detail-card`：
`width:100vw; height:100dvh; max-height:none; border-radius:0; border:0;`
顶部 `.card-detail-header` 固定（`position:sticky; top:0`），`padding-top:max(14px, env(safe-area-inset-top))`；
`.card-detail-scroll` 独立滚动，`padding-bottom:max(16px, env(safe-area-inset-bottom))`，`touch-action:pan-y; overscroll-behavior:contain; overflow-x:hidden;`
`.card-detail-close` 视觉 34px，触控热区扩到 ≥44px（伪元素 `inset:-5px`）。

### 4.2 信息优先级（已拍板：折叠，当前分支默认展开）

`scroll` 内顺序与默认展开状态：

| 区块 | 默认 |
|---|---|
| 基础信息（icon / 神池 / 分类 / 概述 / **当前路线**） | 展开 |
| 当前效果（consume + equip） | 展开 |
| 数值词条 | 展开 |
| 完整技能树 | **折叠**（`<details>`） |
| 关键词解释 | **折叠**（`<details>`） |

技能树内部：每个 `.skill-tree-node` 的三个 `.skill-tree-option` 改为可展开条目，折叠态只显示 `名称` + `适合：{keywords}`，展开后才显示 `intent` 与 `exactEffects`。
**当前已选中的分支（`option.selected === true`）默认展开，其余默认折叠。**

实现用原生 `<details>/<summary>`（自带可访问性与键盘支持），`summary` 高度 ≥ 44px；`summary::marker` 自定义或隐藏后用 CSS 三角。

### 4.3 约束

- **不改 `src/ui/cardDetailModel.ts`**，`CardDetailViewModel` 结构保持不变，本次只改 `cardDetailModal.ts` 的渲染 DOM 与 CSS。
- 保留 `tests/cardDetailModel.test.ts`、`tests/cardDetailPause.test.ts` 全绿。
- 新增测试 `tests/cardDetailLayout.test.ts`（happy-dom）：断言技能树与关键词区是 `<details>` 且 `open === false`；断言选中分支的 `<details open>`；断言当前效果与数值词条节点在技能树节点**之前**（`compareDocumentPosition`）。

---

## 5. 实施顺序（建议按此提交，便于回滚）

1. **锁定波间行为契约**：先写/改 `tests/intermission.test.ts` 中的顺序断言，再改 `IntermissionStep` 与 `tickIntermission()`。
2. **HUD 重排**：只碰 `index.html` / `domRefs.ts` / `renderHud.ts` / `app.css` / `vitalStatSystem.test.ts` 桩。不碰任何战斗数值。
3. **`modalShell.ts` + 移动端 CSS**，然后依次迁移：决策弹窗 → 卡牌详情 → 结算弹窗 → 波末整备面板 → 难度选择。
4. **卡牌详情内容分层**（`<details>` 折叠 + 当前分支默认展开）。
5. **尺寸验收**：320×568 / 360×800 / 390×844 / 430×932 / 540 桌面原型宽度。

---

## 6. 验收标准

### HUD
- [ ] "进化 0/2" 与神池文字均已从 HUD 移除，且 `domRefs` / `renderHud` 无残留引用，`npm run build` 与 `tsc` 无报错。
- [ ] 第一行：`波次 N/M` + 限时词条效果；限时词条**不含**"限时词条："前缀，溢出省略且 `title` 有完整内容。
- [ ] 第二行：HP 条与奖励条，文字均在条**旁边**（同一行），右侧是控制按钮。
- [ ] 快进与暂停视觉尺寸一致（30×30），触控热区 ≥ 44×44。
- [ ] 360px 宽下 HUD 两行均不重叠、不换行、不把 `.game-shell` 撑破；`345px` 高度常量已复核。

### 波末顺序
- [ ] 实际事件顺序：`波次清空 → 强化炮台 → 波末结算面板 → 神池选择 → 自由整备 → 下一波`。
- [ ] 结算面板在 `rewardChoice` 与 `godDecision` 期间不可见，不与任何弹窗叠加。
- [ ] 结算面板同时展示自动保底奖励与玩家刚选的强化。
- [ ] 开局（`afterWave===0`）不触发强化炮台与结算面板；最终胜利波不产生多余波间阶段。
- [ ] `tests/intermission.test.ts` 新增顺序断言通过；黄金回放差异（若有）已说明并重新生成。

### 弹窗（竖屏）
- [ ] 5 项强化在 360×800 下可完整浏览与点击，标题滚动时保持可见。
- [ ] 神池 / 强化 / 进化三类选择通过 `data-kind` 有不同内容密度，`.choice` 的 132px 硬下限仅桌面生效。
- [ ] 所有弹窗具备 `role="dialog"` + `aria-modal="true"` + `aria-labelledby`，打开后焦点进入对话框、关闭后归还，Tab 被限制在对话框内。
- [ ] 决策弹窗（强制选择）忽略 Esc 与遮罩点击；卡牌详情两者均可关闭。
- [ ] 弹窗开启时底层战场与卡槽不可误触，无背景滚动穿透，无横向滚动。
- [ ] 难度选择在窄屏为 2×2；整备面板在窄屏为单列 + 底部整宽按钮；最终结算弹窗在 320px 下不溢出。

### 卡牌详情
- [ ] 窄屏覆盖整个可用视口，刘海与底部手势条不遮挡内容，关闭按钮常驻可见。
- [ ] 当前效果与数值词条位于技能树之前；技能树与关键词默认折叠；当前已选分支默认展开。
- [ ] 单手可纵向滚动到底，无横向滚动。
- [ ] `tests/cardDetailModel.test.ts`、`tests/cardDetailPause.test.ts` 保持通过。

### 全局
- [ ] `npm test` 全绿，`tsc --noEmit` 无错误。
- [ ] 未修改任何 `src/config/base/*.json` 中的战斗数值。
