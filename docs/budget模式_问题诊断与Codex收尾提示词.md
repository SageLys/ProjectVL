# Budget 模式：问题诊断 + Codex 收尾提示词

> 诊断基于对 `src/core/systems/waveSystem.ts`、`budgetRules.ts`、`src/ui/derivedMetrics.ts`、`src/ui/tunerPanel.ts`、`tunerSchema.ts` 的通读，并用 happy-dom 驱动真实 `createTunerPanel` + `updateGame` 复现（复现脚本已删除，结论如下）。核心 budget 单测（`budgetRules`/`budgetDerivedMetrics`/`spawnModeLifecycle`/`tunerV2`）全部通过——**逻辑本身没崩，问题出在"配额 vs 目标"退化和"派生指标只在 budget 生效时才联动"两处。**

---

## 一、结论速览

| 现象 | 根因 | 证据 |
|---|---|---|
| 选了 budget，实际玩起来还是 interval | ①切换是 `waveDeferred`，只写 `pendingSpawnMode`，下一波边界才提交，当前波不变；②即便切到 budget，当前参数下**每波总配额 `enemyCountFor(wave)` 远小于 `targetOnScreen`**，budget 退化成"每 `checkInterval` 放 `batchMax` 个"的匀速滴漏，与 interval 视觉一致，`targetOnScreen`/`maxAlive` 从不生效 | 用你的 preset「budget模式未完成」跑：wave1 配额=8 但 targetOnScreen=30、batchMax=2 → 每 0.75s 恒放 2 个直到 8 个放完，就是慢速 interval |
| 调 budget 参数，H·派生指标「全局理论局长」等不变 | `derivedMetrics.ts` 的 `waveDurations`/`totalDuration` **只有 `spawnMode==='budget'` 才走 `simulateBudgetWave`（依赖 budget.*）**，否则走 interval 公式（完全忽略 budget.*）。而 `metricConfig()` 只有在下拉框已选/挂起 budget 时才把预览模式设为 budget | interval 生效下：改 `targetOnScreen.base`/`checkInterval`/`batchMax`，局长 1.91min→1.91min（不动）；一旦下拉框预览为 budget：1.91→1.93→11.02min（联动正常） |

两个问题同源：**"用户以为在 budget，其实生效模式仍是 interval / budget 已退化成 interval"**。

---

## 二、根因细节（给 Codex 定位用）

### 问题 1：budget 退化成 interval

`src/core/systems/budgetRules.ts` — `budgetAdmission`：
```
spawnCount = min(spawnLeft, batchMax, capacity, deficit)
deficit = max(0, effectiveTarget - alive)
```
`src/core/systems/waveSystem.ts` — `startNextWave` 里 `state.spawnLeft = enemyCountFor(wave)`，而
`enemyCountFor(wave) = enemyCountBase(5) + wave*enemyCountPerWave(3)` = 8/11/14。

当 `enemyCountFor(wave)`（本波总出怪配额）**远小于** `targetOnScreen`（30/40/50）时：`deficit` 恒 ≥ `batchMax`、`capacity` 充裕，于是 `spawnCount` 永远 = `batchMax`。budget 变成"每 `checkInterval` 放 `batchMax` 个直到配额耗尽"——**这就是一个匀速 interval**。`targetOnScreen`、`maxAlive`、`waveEndSprint` 全部不起作用。

> 设计文档 `docs/P6_R1_手动调参环_执行计划.md` L314 明确要求：budget 模式下 `enemyCountFor(wave)` 语义应变为"本波总出怪**上限**"，且 seed=42 波1 的 E1 P50 应落在目标同屏附近。当前 `waves.json` 的 `enemyCountBase/perWave` 仍是 interval 时代的小值，导致 budget 永远吃不到 target。

### 问题 2：budget 参数不驱动派生指标

`src/ui/derivedMetrics.ts`：
- L73–74：`projections` / `waveDurations` 仅当 `game.waves.spawnMode === 'budget'` 才用 `simulateBudgetWave`（唯一依赖 `budget.*` 的分支）；interval 分支用 `spawnInterval.*` 公式，**与 budget.* 完全无关**。
- `totalDuration`（全局理论局长）= `waveDurations` 求和 → interval 生效时对 budget.* 零响应。

`src/ui/tunerPanel.ts` — `metricConfig()`：只有 `pendingSpawnMode !== null`（即下拉框已切/挂起 budget）时才把 draft 设为 budget。所以用户若**没先把出怪模式切到 budget** 就去调 budget 滑杆，H 面板恒定不动。

补充：`BUDGET_TUNER_PARAMS`（`tunerSchema.ts`）7 个 budget 参数全部 `waveDeferred: true`，在对局中调整只进 `pendingWaves`，也强化了"改了没反应"的观感。

---

## 三、复制给 Codex 的提示词（从下方分隔线开始整段复制）

---

你在 `C:\ProjectVL`（Vite + TS + Canvas 2D 的塔防原型，`npm test` 用 vitest/node 环境）。请**完成并收尾 budget 出怪模式**。当前 budget 逻辑存在但未实装到位，表现为两个 bug，根因我已定位，按下述要求修复并补测试。**不要改动 interval 模式的任何既有行为与既有断言。**

### 背景根因（已确认）
1. **budget 退化成 interval**：`src/core/systems/waveSystem.ts` 的 `startNextWave` 把 `state.spawnLeft = enemyCountFor(wave)`，而 `enemyCountFor = enemyCountBase + wave*enemyCountPerWave`（当前 5/3 → 波1=8）。`budgetRules.ts` 的 `spawnCount = min(spawnLeft, batchMax, capacity, deficit)`。当本波总配额（8/11/14）远小于 `targetOnScreen`（如 30/40/50）时，`deficit`/`capacity` 恒充裕，budget 每 `checkInterval` 只放 `batchMax` 个直到配额耗尽 = 匀速 interval，`targetOnScreen`/`maxAlive`/`waveEndSprint` 永不生效。设计意图（`docs/P6_R1_手动调参环_执行计划.md` L313–318）：budget 下 `enemyCountFor(wave)` 应是"本波总出怪**上限**"，同屏数由 `targetOnScreen` 主导，seed=42 波1 的 E1 P50 应 ≈ `targetOnScreen`（±1）。
2. **budget 参数不驱动 H·派生指标**：`src/ui/derivedMetrics.ts` L73–74 仅在 `spawnMode==='budget'` 时用 `simulateBudgetWave`（唯一依赖 `budget.*` 的分支），否则走 interval 公式忽略所有 `budget.*`。`src/ui/tunerPanel.ts` 的 `metricConfig()` 仅在 `pendingSpawnMode!==null` 时才把预览模式设为 budget。因此在 interval 生效下调 `budget.*` 滑杆，`totalDuration`（全局理论局长）恒定不变。

### 修复要求

**A. 让 budget 真正作为"并发预算"生效（修复退化，问题1核心）**
- 在 budget 模式下，本波"总出怪上限"必须与 `targetOnScreen` 相称，使 `targetOnScreen` 真正成为同屏主导量。推荐做法（择一并说明理由）：
  - (a) 为 budget 模式提供独立的总出怪配额（新增 `waves.budget.waveQuota`（base/perWave）或按 `targetOnScreen` 与波时长推导），不再复用 interval 调校的 `enemyCountBase/perWave`；或
  - (b) 在 budget 模式下将 `enemyCountFor` 语义改为一个足够大的上限（如 `maxAlive` 与波时长的乘积估计），确保配额不再成为瓶颈。
- 调整 `src/config/base/waves.json` 的 budget 默认值，使**默认 budget 参数下 seed=42 波1 的稳态同屏 P50 ≈ `targetOnScreen(1)`（±1）**，并明显区别于 interval（同屏数、节奏可观测不同）。
- `maxAlive` 必须为硬上限：任何参数下同屏敌人数不超过 `maxAlive`。
- `waveEndSprint`（window>0）必须能观测到波末密度上升。
- interval 模式行为逐字节不变（既有 `waveSystem`/`budgetRules` 单测不改而过）。

**B. H·派生指标对 budget 参数联动（问题2）**
- 目标：当 budget 模式为"生效或挂起"时，调整任一 `budget.*` 参数都会立刻改变 H 面板的 budget 相关派生值（尤其「全局理论局长」「每波理论时长」「理论同屏数」）。当前只有先手动把下拉框切到 budget 才联动——需消除这个隐性前提。二选一：
  - (b1) 当生效/挂起模式是 interval 时，把 budget 控件明确置灰 + 文案标注"仅 budget 模式生效"，避免用户以为"改了没反应"；同时保证切到/挂起 budget 后立即联动；或
  - (b2)（更佳）H 面板始终并列展示 interval 与 budget 两套投影，budget 那一栏恒依赖 `budget.*` 实时重算，与当前生效模式无关。
- 无论选哪个，验收：**在 budget 生效或挂起状态下，改变 `checkInterval`/`targetOnScreen.base`/`.perWave`/`batchMax`/`maxAlive`/`waveEndSprint.*` 任一，`#derivedMetrics` 文本中的 min 局长数值必须变化。**

**C. 切换反馈（问题1的观感部分，轻量）**
- 保留"下一波生效"的既有设计，但让开发调参能**立即看到** budget：切换出怪模式时，若在对局中，给出一键"重开本波以立即应用"（可复用现有 `restartWave`/`applyPendingWaveChanges`），或在 `#spawnModeStatus` 明确提示"budget 将于下一波生效，点[重开本波]立即应用"。不得静默让人以为没切成功。

### 测试要求（`npm test` 必须全绿）
- 新增 budget 生效性单测（node 环境即可，直接操作 `cfg` + `startNextWave`/`updateGame`/`budgetAdmission`）：
  1. 默认 budget 参数下，模拟波1至稳态，**同屏 P50 ≈ `targetOnScreen(1)`（±1）**；
  2. `maxAlive=10` 时同屏从不超过 10；
  3. budget 与 interval 在同 seed 下的同屏/节奏指标可量化区分（断言两者不同）；
  4. `waveEndSprint.window>0` 时波末目标同屏 = `ceil(target*multiplier)`。
- `derivedMetrics` 单测：在 budget 生效时，逐一改动 6 个 budget 参数，`totalDuration` 或对应 budget 投影字段发生变化（`budgetDerivedMetrics.test.ts`/`tunerV2.test.ts` 已有部分，按新语义补齐）。
- 若为 B 选了改 tuner 面板 DOM 行为，可在 `vitest.config.ts` 为该测试文件加 `// @vitest-environment happy-dom` 局部环境（happy-dom 若未装则 `npm i -D happy-dom`），或将可测逻辑抽到纯函数以 node 环境覆盖——优先后者。

### 交付
- 改动集中在 `src/core/systems/waveSystem.ts`、`budgetRules.ts`、`src/config/base/waves.json`、`src/config/types.ts`（如新增字段）、`src/ui/derivedMetrics.ts`、`src/ui/tunerPanel.ts`、`src/ui/tunerSchema.ts` 及对应测试。
- 保持 core 层纯函数风格，`startNextWave`/`checkWaveClear`/`tickBetween` 签名不变。
- 完成后运行 `npm test` 与 `npm run build`（`tsc --noEmit`）确保全绿，并在提交信息中列出：新增/调整了哪些 budget 字段、默认值依据、seed=42 波1 的实测 P50 同屏数。
