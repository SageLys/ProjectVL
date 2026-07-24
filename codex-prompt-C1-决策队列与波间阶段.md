# Codex 任务 C1：统一构筑决策队列 + 10 波 + 正式波间阶段

> 前置：C0 已合并。总纲见 `docs/神池构筑系统_总纲与阶段计划.md`。
> 文件行号仅供导航，以符号名为准。结束时 `npm test` 与 `npm run build` 通过。

---

## 一、目标

1. 新增**统一构筑决策队列**：所有"游戏暂停等玩家选择"的场景（后续的选神/选房/进化分支/配方/遗物）走同一状态机与同一 UI 骨架。
2. 主配置改 **10 波**（3 招募 + 5 收敛 + 2 兑现），第 10 波即终局，不加独立 Boss 段。
3. 把"波间 = 2.4s 倒计时"重做为**正式波间阶段**：结算 → 决策队列 → 自由整备 → 显式"准备完成"（带超时自动确认）。

## 二、硬性不变量

1. 战斗帧内逻辑（combat/enemy/damage/effects runtime）不动。
2. 现有升级三选一（`pendingLevelUps + offeredPerks`）**本阶段不迁移**，与决策队列并存（C4 收编）；两者同时激活时先清升级再开决策队列。
3. `advanceWavePhase` 的 regular → boss → between 阶段机语义保留；只重写 between 段。
4. `jumpToWave` / `restartWave` 调试入口继续可用，需清空波间与决策状态。
5. RNG 纪律：决策候选生成只用注入 rng。

## 三、现状（已核实）

| 位置 | 事实 | 处置 |
|---|---|---|
| `src/core/systems/waveSystem.ts` `finishWave` | `state.between = cfg.waves.betweenWaves`（2.4s）后 `tickBetween` 倒计时自动开波 | 重写为进入波间阶段 |
| `waveSystem.ts` `tickBetween` | 归零即 `startNextWave` | 改为只有"波间完成条件"满足才开波 |
| `src/core/updateGame.ts` | `paused` 时整帧 return | 保留；决策存在 ⇒ `paused=true` |
| `src/config/base/waves.json` | `totalWaves: 8`、`stagePlan.selectionWaves: 2`、`betweenWaves: 2.4`、`bossWaves: [1..8]`、`waveBoss.reward.schedule` = selection[1,1] / build[2,2,3,4,4,4] / validation[5,5] | 全部按 10 波重排（§六） |
| `src/config/variants/validation-10.json` | 仅改 `totalWaves=10` | 主配置吸收后删除或降级为空变体 |
| `src/ui/modals.ts` | 只有升级三选一与结算弹窗 | 新增通用决策弹窗骨架 |
| `src/core/runStage.ts` `resolveActiveWavePlan` | 按 selection/build/validation 解析波段 | 适配 selectionWaves=3 |

## 四、决策队列（新增 `src/core/systems/decisionQueueSystem.ts`）

```ts
// src/core/types.ts
export type RunDecision =
  | { kind: 'godDraft'; wave: number; candidates: GodId[]; role: 'main' | 'sub' }      // C3 入队
  | { kind: 'godFocus'; wave: number; candidates: GodId[] }                            // C3 入队
  | { kind: 'evolutionBranch'; cardType: CardType; checkpointStar: number; options: string[]; provisionalCardId: number } // C5 入队
  | { kind: 'recipeEvolution'; recipeId: string }                                      // C6 入队
  | { kind: 'relic'; options: string[] };                                              // C4 入队

export interface DecisionQueueState { current: RunDecision | null; pending: RunDecision[]; }
// GameState 增加：decisions: DecisionQueueState;
```

API（全部纯函数，返回 `GameEvent[]`）：

- `enqueueDecision(state, decision)`：入队；若 `current === null` 立即置为 current 并 `state.paused = true`。
- `resolveCurrentDecision(state, config, rng, choice)`：按 `current.kind` 分发到各系统的 apply 函数（本阶段只留注册表，具体 apply 由 C3–C6 填充）；完成后弹出下一项；队列空 ⇒ 恢复（波间阶段时不恢复战斗，只把控制权还给波间流程）。
- 处理原则：规则系统只入队；UI 只读 `current` 渲染、只调 resolve；禁止新增 `pendingXxxChoice` 布尔值。

`GameEvent` 增加：

```ts
| { type: 'decisionOffered'; kind: RunDecision['kind'] }
| { type: 'decisionResolved'; kind: RunDecision['kind']; choice: string }
```

## 五、波间阶段（新增 `src/core/systems/intermissionSystem.ts`）

```ts
export type IntermissionStep = 'settle' | 'decide' | 'free';
export interface IntermissionState {
  active: boolean;
  afterWave: number;          // 刚结束的波
  step: IntermissionStep;
  freeRemaining: number;      // free 步倒计时；<=0 且无决策 ⇒ 自动准备完成
  readyConfirmed: boolean;
}
// GameState 增加：intermission: IntermissionState;
```

流程（替换 `finishWave`/`tickBetween` 语义）：

1. 波清空 → `beginIntermission(state)`：清理战斗瞬态（子弹/光束/vfx/到期 zone），`step='settle'`，发 `waveCleared`。
2. `settle`：钩子点（C2 在此结算波末奖励并发汇总事件）；完成后 `step='decide'`。
3. `decide`：钩子点（C3 在此入队选神/选房，C6 在此汇总可用配方提示）；决策队列清空后 `step='free'`，`freeRemaining = cfg.waves.intermission.freeSeconds[阶段]`。
4. `free`：玩家整理手牌/装备/（C6 起）确认配方；点"准备完成"或倒计时归零 ⇒ `endIntermission` → `startNextWave`。
5. 第 1 波开始前的开局序列：`mode='ready'` → 开始游戏时先走一次仅含 `decide` 的 mini 波间（C3 在此入队主神 3 选 1），完成后才 `startNextWave`。
6. 第 10 波结束：不进波间，直接 `endGame(state, true)`（现有 `finishWave` 对 `wave >= totalWaves` 的分支保留）。

UI（`src/ui/modals.ts` + `src/ui/` 新文件 `intermissionPanel.ts`）：

- 通用决策弹窗：读 `state.decisions.current`，按 kind 渲染标题/选项（文案走 `src/data/texts.json` 新增 `decisions.*` 键）；本阶段先支持空队列与占位 kind 的渲染路径。
- 波间面板：显示"第 N 波结束"、（C2 起）奖励汇总、倒计时、"准备完成"按钮。

## 六、10 波配置（`src/config/base/waves.json`）

1. `totalWaves: 10`；`stagePlan.selectionWaves: 3`、`validationWaves: 2`（⇒ build 自动为 4–8 波）。
2. `bossWaves: [1,2,3,4,5,6,7,8,9,10]`。
3. `waveBoss.reward.schedule`：selection `[1,1,1]` / build `[2,2,3,4,4]` / validation `[5,5]`。
4. 删除 `betweenWaves` 标量，新增：

```json
"intermission": {
  "freeSeconds": { "selection": 23, "buildEarly": 20, "buildLate": 18, "validation": 17 },
  "settleSeconds": 2.5,
  "autoReadyHighlight": true
}
```

（buildEarly=4–6 波、buildLate=7–8 波；数值为占位，C9 标定。）

5. `stagePlan.selection/build` 的预算曲线端点按 3/5 个波重新插值（保持现有 start/end 数值不变，只是波段变长）；`validation` 两档沿用。
6. `src/config/variants/dev-short.json` 同步（3 波 = 1 招募 + 1 收敛 + 1 兑现，intermission freeSeconds 可全 5s）；`validation-10.json` 删除。

## 七、测试与验收

新增 `tests/decisionQueue.test.ts`、`tests/intermission.test.ts`；改 `tests/waveSystem.test.ts`：

1. 入队即暂停；resolve 后自动弹出下一项；多项决策不互相覆盖（对应旧 `pendingLevelUps` 覆盖问题的规则测试）。
2. 队列非空时 `updateGame` 不推进战斗。
3. 每波结束不再自动倒计时开波：不点"准备完成"且 freeRemaining>0 时永不开波；归零自动开波。
4. `jumpToWave` 清空 intermission 与 decisions。
5. 第 10 波结束直接结算，无第 11 段。
6. 升级三选一与决策队列并存互不死锁。
7. 遥测：`decision_offered/decision_resolved/intermission_ready`（`src/telemetry/types.ts` 增加事件）。
