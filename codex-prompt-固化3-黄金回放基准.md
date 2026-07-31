# Codex 任务 固化3：黄金回放基准（跨引擎一致性基线）

> Stage 0 契约固化第三步。总纲见 `docs/接下来任务计划_v1.md`；对照协议见 `docs/Unity移植_纵向切片交付说明.md` §六。
> 建议在 固化1 落地后做（fixture 应基于强类型化后的稳定参数契约）。结束时 `npm run test` 与 `npm run build` 全绿。

---

## 一、目标

利用 core 是"纯函数 + 注入 rng"的特性，建立**固定 seed 录制/重放**基线：给定 seed + 配置 + 脚本化输入，跑固定帧数，产出**结束态摘要 JSON**（fixture）。这既是 H5 自洽回归防线，又是 Unity 复刻的唯一客观验收基线。

## 二、硬性不变量

1. 基线是**纯确定性**的：同 seed + 同输入 + 同配置 → 逐次运行结果逐位相同（H5 内部）。
2. 不改任何玩法；只新增 harness、fixture 与测试。
3. rng 必须走注入的可播种实现（禁止 `Math.random()` 混入 core 路径）。

## 三、现状（已核实）

| 位置 | 事实 |
|---|---|
| `src/core/updateGame.ts` | 单帧纯推进，签名 `(state, config, rng, dt, beforeWaveStart?)` |
| `tests/headlessRun.test.ts` | 已有整局无头冒烟，可作为 harness 起点 |
| `scripts/computeExperienceMetrics.ts` | 已有脚本化跑局 + `npm run metrics` 惯例 |
| `src/core/createInitialState.ts` | 建初始状态入口 |
| rng | 已有注入式 `rng: () => number`；确认是否已有可播种实现，无则加一个（如 mulberry32/xoshiro） |

## 四、要建的东西

### 4.1 可播种 rng（若尚无）
`src/core/rng.ts`：`makeRng(seed: number): () => number`，确定性、跨平台一致（纯整数位运算，避免依赖 JS 引擎浮点细节）。**Unity 侧须实现同一算法**——在 fixture schema 文档里写清算法与常量。

### 4.2 录制 harness
`src/core/replay/record.ts`：
```ts
export interface ReplayInput { frame: number; kind: 'consumeAt' | 'lockSlot' | 'moveOrSwap' | ...; payload: unknown; }
export interface ReplaySpec { seed: number; variants: string[]; dt: number; frames: number; inputs: ReplayInput[]; }
export interface ReplaySummary {
  hp: number; enemiesRemaining: number; cumulativeDamage: number;
  dropSequence: Array<{ frame: number; type: string; star: number }>;
  cards: unknown; equipment: unknown; waveState: unknown;
  eventSequence: Array<{ frame: number; type: string }>;   // GameEvent 类型序列
}
export function runReplay(spec: ReplaySpec): ReplaySummary;
```
- 用 `makeRng(spec.seed)` + `buildConfig(spec.variants)` + `createInitialState`，逐帧 `updateGame`，在指定 `frame` 注入 `inputs`，累计 `GameEvent` 与掉落序列，末帧汇总。
- 汇总字段做**统计可比**：事件/掉落记类型与帧序，数值记标量。

### 4.3 fixture
- `tests/golden/` 下提交 3–5 个 `ReplaySpec` + 其 `ReplaySummary`：至少覆盖①一局通关、②一局失败、③含消耗态释放、④含合成升星、⑤含一个状态控制。
- 提供 `npm run replay:record`（重生成 summary）与只读回放测试分离，避免 fixture 被无意覆盖。

### 4.4 回放测试
`tests/goldenReplay.test.ts`：对每个 fixture 重跑 `runReplay`，断言与已提交 summary 相等（H5 内部逐位相等）。

## 五、交付物

- harness + rng + fixtures + 回放测试，全绿。
- `docs/黄金回放_fixture规格.md`：`ReplaySpec`/`ReplaySummary` 字段定义、rng 算法与常量、容差约定（**Unity 侧做统计一致，非逐位**）、如何新增 fixture。此文档直接供 Unity 开发者按 `docs/Unity移植_纵向切片交付说明.md` §六接入。
