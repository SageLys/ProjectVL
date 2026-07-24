# Codex 任务 C2R：波末基础奖励「保底 + 每波五选一」选择化改造

> 前置：C0、C1、C2、C3 已合并。本任务是对 C2（`codex-prompt-C2-波末基础奖励.md`）的定向改造，不推翻其 `RunBaseStats` 基数化重构，只把"全量自动发放"改为"保底自动 + 每波五选一"。
> 总纲见 `docs/神池构筑系统_总纲与阶段计划.md`。文件行号仅供导航，以符号名为准。结束时 `npm test` 与 `npm run build` 通过。

---

## 一、背景与动机

C2 现状把每波匹配的基础奖励在波间 `settle` 步**全部自动加算**，玩家无任何决策权（总纲 §5 原定"独立规则同时结算、不做互斥三选一"）。真机体验判定：基础奖励阶段太"被动分配"，缺少 agency。

本次拍板（用户逐项确认）：改为 **保底 + 每波五选一**，且 **合计成长做取舍**（不补偿数值、菜单属性互斥，总量低于全给）。**不设"点数"概念**：每波直接从固定菜单中选 1 个强化。

## 二、目标

1. 把波末基础奖励拆成两层：
   - **保底层（floor）**：每波自动结算、无选择、纯基数加法。
   - **选择层（choice）**：每波弹出一个**五选一**菜单，玩家选 **1 项**投下（当波结算，无跨波贮存、无点数累积）。
2. 选择层走 **C1 统一决策队列**（新增 `RunDecision` kind `waveBaseReward`），不新增任何 `pendingXxxChoice` 布尔值；UI 复用现有通用决策弹窗骨架。
3. 保留 C2 的 `RunBaseStats` 基数化语义、重复防护、读档非重复发放。

## 三、纳入可加强的基础属性（已调查定案）

调查结论：能纯基数加法、且直接落到炮台自身 `totalDamage/totalFireRate/totalMulti/totalRange` 或 `maxHp/hp` 的属性，仅 C2 现有 `RunBaseStatKind` 六种。弹道穿透/分裂、控制强度、领域半径、护盾耐久等均为 `buildScaling`（卡族 lane 依赖），属 perk/构筑领分，不纳入；弹速/扩散/掉落率为手感常量/经济，不纳入。**同发 `multiAdd` 本次不纳入**（过强、且原仅限里程碑波，删除后无里程碑波概念）。

| 属性 | stat | 保底层 | 选择菜单 | 备注 |
|---|---|---|---|---|
| 回血 | `heal` | ✅ 每波自动 | ✖ | 生存地板 |
| 基础伤害 | `damageAdd` | ✅ 每波自动(小额) | ✅ | 保底+可选（玻璃大炮路线） |
| 射程 | `rangeAdd` | ✅ 每波自动(小额) | ✅ | **达 `maxAttackRange`(=210) 后：菜单显示"已达到上限"并禁选**；保底也停止加算 |
| 射速 | `fireRateAdd` | ✖ | ✅ | |
| 心防上限 | `maxHpAdd` | ✖ | ✅ | 同步抬 hp |
| 经验取得 | `xpGainPct` | ✖ | ✅ | **不变量例外**（见 §四.2） |

选择菜单固定为上表 5 项（`damageAdd / fireRateAdd / maxHpAdd / rangeAdd / xpGainPct`），**每波全部列出**，玩家选 1。射程达上限时该项禁选但仍显示（见 §八）。数值全为占位，C9 标定。

## 四、硬性不变量

1. 装备态/遗物的乘法缩放（`buildModifierSystem`、buffs）语义不动。
2. **基数加法 + 禁止百分比永久成长**，**唯一例外**：选择菜单的 `xpGainPct`（经验取得本质为乘性，无法基数化）。需在总纲 §5、本文件与 `godValidator` 三处显式标注此例外；**保底层严禁任何 pct 类 stat**，选择层也仅 `xpGainPct` 一项允许 pct。
3. 保底层每波恰好结算一次；选择层每波恰好入队一次、resolve 恰好加算一次。重复 hook、`jumpToWave`、读档路径都不得重复发放或重复入队（沿用 `waveRewardsClaimedWave` 游标；选择层新增独立游标 `waveChoiceOfferedWave`）。
4. 队列非空时 `updateGame` 不推进战斗；升级三选一保有更高暂停优先级（沿用 C1 语义）。
5. RNG 纪律：菜单候选生成为确定性（固定 5 项 + 射程 cap 过滤），不消耗 rng；若未来加入随机候选须走注入 rng。

## 五、现状（已核实）

| 位置 | 事实 | 处置 |
|---|---|---|
| `src/core/systems/waveRewardSystem.ts` `grantWaveRewards` | settle 步一次性发放所有匹配 `cfg.waveRewards.rewards` | 拆为 `grantFloorRewards`（保底自动）+ `buildWaveChoiceCandidates`（生成菜单候选）+ `applyWaveChoice`（resolve 时加算） |
| `src/core/systems/intermissionSystem.ts` `tickIntermission` | `settle` 调 `grantWaveRewards`；`decide` 调 `enqueueGodPoolDecisionForIntermission` | `settle` 改调 `grantFloorRewards`；`decide` 在选神入队之后追加 `enqueueWaveBaseRewardDecision` |
| `src/core/systems/decisionQueueSystem.ts` `validChoices` | 覆盖 godDraft/godFocus/evolutionBranch/recipeEvolution/relic | 增 `waveBaseReward` 分支，返回非 capped 候选 option id 列表 |
| `src/core/types.ts` `RunDecision` | 5 个 kind | 新增 `waveBaseReward` |
| `src/core/types.ts` `IntermissionState.rewardsGranted` | 存自动奖励汇总 | 语义收敛为"保底汇总"；选择结果另发事件 |
| `src/config/base/waveRewards.json` | 扁平 `rewards[]` 全自动 | 改为 `floor[]` + `choice[]`（§七） |
| `src/config/godValidator.ts` 校验块 | 遍历 `rewards[]`，`stat ∈ RUN_BASE_STATS` | 改为分别校验 `floor[]`（禁 pct）与 `choice[]`（允许 `xpGainPct`）；不再需要 `waves` 校验 |
| `src/config/types.ts` `WaveRewardsConfig` / `RunBaseStatKind` | 见 C2 | 重构类型（§六） |
| `src/ui/modals.ts` `showDecision` | 按 kind 渲染，godDraft/godFocus 特化 | 增 `waveBaseReward` 渲染：列 5 属性按钮，cap 项禁用+"已达到上限" |
| `src/data/texts.json` `decisions.*` | 5 个 kind 文案 | 新增 `decisions.waveBaseReward` + 各属性标签键 |
| `src/telemetry/*` | `wave_rewards_granted` | 保底沿用；新增 `wave_base_reward_offered/resolved` |

## 六、类型与系统

```ts
// src/config/types.ts —— 选择层允许的 stat 超集（保底层仍限 RunBaseStatKind）
export type WaveChoiceStatKind = RunBaseStatKind | 'xpGainPct';

export interface WaveFloorRewardDef { id: string; stat: RunBaseStatKind; add: number; }   // 禁 pct
export interface WaveChoiceOptionDef { id: string; stat: WaveChoiceStatKind; add: number; } // 每波全列
export interface WaveRewardsConfig {
  version: string;
  floor: WaveFloorRewardDef[];
  choice: WaveChoiceOptionDef[];   // 固定 5 项，每波全部呈现
}
```

```ts
// src/core/types.ts
export type RunDecision =
  | ...既有 5 项...
  | { kind: 'waveBaseReward'; wave: number; candidates: string[]; capped: string[] };
//   candidates = 可选 option id（不含 capped）；capped = 因射程触顶而禁选、但仍显示的 option id
// GameState 增加：waveChoiceOfferedWave: number;  // 防选择层重复入队
```

```ts
// src/core/systems/waveRewardSystem.ts
export function grantFloorRewards(state, wave): GameEvent[];
// 语义 = 现 grantWaveRewards，但只遍历 cfg.waveRewards.floor；rangeAdd 命中 cap 时跳过；沿用 waveRewardsClaimedWave 防重复。

export function buildWaveChoiceMenu(state): { candidates: string[]; capped: string[] };
// candidates = cfg.waveRewards.choice 全 id，减去 capped；
// capped = choice 中 stat==='rangeAdd' 且 totalRange(state)>=maxAttackRange() 的 id。

export function enqueueWaveBaseRewardDecision(state, wave): GameEvent[];
// if (state.waveChoiceOfferedWave >= wave) return []; 置游标；
// 组 {candidates,capped}；candidates 为空则不入队；否则 enqueueDecision({kind:'waveBaseReward',wave,candidates,capped}).

export function applyWaveChoice(state, config, optionId): GameEvent[];
// 找到 option → applyRunBaseReward（含新增 'xpGainPct'→state.xpGainBonus += add）；发 waveBaseRewardChosen 事件。
// 经 registerDecisionResolver('waveBaseReward', (s,c,_rng,d,choice)=>applyWaveChoice(s,c,choice)) 注册。
```

`applyRunBaseReward` 增 `case 'xpGainPct': state.xpGainBonus += effect.add;`。
`validChoices('waveBaseReward')` 返回 `decision.candidates`（已排除 capped）。

`GameEvent` 增：`| { type: 'waveBaseRewardOffered'; wave; candidates: string[] } | { type: 'waveBaseRewardChosen'; wave; stat; add }`。

## 七、首版配置（`src/config/base/waveRewards.json`，数值占位、C9 标定）

```json
{
  "version": "0.2.0",
  "floor": [
    { "id": "floorHeal",   "stat": "heal",      "add": 8 },
    { "id": "floorDamage", "stat": "damageAdd", "add": 1 },
    { "id": "floorRange",  "stat": "rangeAdd",  "add": 4 }
  ],
  "choice": [
    { "id": "optDamage",   "stat": "damageAdd",  "add": 2 },
    { "id": "optFireRate", "stat": "fireRateAdd", "add": 0.15 },
    { "id": "optMaxHp",    "stat": "maxHpAdd",    "add": 10 },
    { "id": "optRange",    "stat": "rangeAdd",    "add": 8 },
    { "id": "optXpGain",   "stat": "xpGainPct",   "add": 0.08 }
  ]
}
```

结构保证：保底 `floor[]` 全为基数（校验器拒绝 pct）；`choice[]` 恰 5 项、仅 `xpGainPct` 允许 pct；无点数/波次字段。`dev-short.json` 等变体如覆盖需同构。

## 八、UI 与文案

- `src/ui/modals.ts` `showDecision` 增 `waveBaseReward` 分支：读 `decision.candidates + decision.capped`，按 `cfg.waveRewards.choice` 顺序渲染 5 个按钮（标题+数值）。`capped` 内的项（触顶射程）渲染为**禁用态 + "已达到上限"** 文案；点击 candidates 项调 `resolveCurrentDecision`。
- `src/ui/intermissionPanel.ts`：`settle` 后展示保底逐项汇总（沿用 `rewardsGranted`）；`decide` 出现五选一弹窗；选择结果 toast。
- `src/data/texts.json` 新增 `decisions.waveBaseReward = { title:"强化炮台", body:"从下列 5 项中选择 1 项强化。" }`、属性标签 `waveRewardStats.{damageAdd,fireRateAdd,rangeAdd,maxHpAdd,xpGainPct}` 与 cap 文案 `waveRewardCapped`。

## 九、测试与验收

改 `tests/waveRewardSystem.test.ts` + 新增 `tests/waveBaseRewardChoice.test.ts`：

1. **保底**：任意波结束自动获得 floor（heal+damage+range）；hp/damage/range 断言精确；heal 不溢出 maxHp；rangeAdd 命中 cap(210) 后保底不再加 range。
2. **选择入队**：`decide` 步为每波入队恰好一个 `waveBaseReward`，`candidates` 含全部未触顶的 choice 项（默认 5 项）。
3. **五选一**：菜单恒为固定 5 项集合（不随波变化，除射程 cap 外）。
4. **cap 显示**：`totalRange>=maxAttackRange()` 时 `optRange` 落入 `capped`、不在 `candidates`/`validChoices`；UI 渲染禁用+"已达到上限"；`resolveCurrentDecision` 拒绝选 capped 项。
5. **resolve 语义**：选 `optFireRate`→`totalFireRate` 增；选 `optMaxHp`→`maxHp/hp` 增；选 `optXpGain`→`xpGainBonus` 增（唯一 pct 例外）。
6. **取舍/不补偿**：一波只加算被选的 1 项，未选 4 项**不发放**（对比 C2 全给）。
7. **重复防护**：同波重复 `enqueueWaveBaseRewardDecision` 不重复入队；`jumpToWave(5)` 后打完第 5 波只结算/入队第 5 波；读档 settle 帧不重复。
8. **队列与暂停**：五选一弹窗存在时 `updateGame` 不推进战斗；与选神/升级三选一并存不死锁、不互相覆盖（沿用 C1 规则测试）。
9. **校验器**：`floor[]` 出现 pct stat → 校验失败；`choice[]` 出现非 `xpGainPct` 的 pct → 失败；`xpGainPct` 通过；`choice` 项数非 5 时给出可读报错或断言（可选硬约束）。
10. **DOM**：`tests/zzdom.test.ts` 惯例下渲染 `waveBaseReward` 弹窗，capped 项禁用+"已达到上限"。
11. **遥测**：`wave_base_reward_offered/resolved`（`src/telemetry/types.ts` 增事件）。

## 十、非目标（本任务不做）

- 数值标定（放 C9；本任务全占位）。
- 同发 `multiAdd` 的任何入口、里程碑波概念、点数累积/跨波贮存、随机候选。
- C4 经验升级并入决策队列（`xpGainPct` 例外与 C4 遗物导流的关系留 C4 复审）。
