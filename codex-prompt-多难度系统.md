# Codex 任务：多难度系统（地狱=当前版本原封不动，前期宽松、后期更陡）

> 本文档为完整实施指令。所有文件路径与行为描述均已对照当前 `main`（HEAD `673afff`）实际代码核实。
> 分两个阶段完成，**阶段 1 全部验收通过前禁止开始阶段 2**。每阶段结束保持 `npm test` 与 `npm run build`（含 `tsc --noEmit`）通过。

---

## 一、总目标

在不改出怪节奏、波结构、掉落规则、拾取手感、XP 与升级概率、炮台与弹道手感的前提下，新增按「难度档 × 波次进度」计算的敌人 HP / 伤害 / 速度倍率曲线，提供四档难度：

| 难度 id | 中文名 | 定位 |
|---|---|---|
| `relaxed` | 轻松 | 第一波明显碾压，适合熟悉规则与体验构筑 |
| `standard` | 标准 | 前期宽松，后期形成接近完整的压力（最终作为 UI 默认档） |
| `hard` | 困难 | 仅缓和开局，后期基本等于当前版本 |
| `hell` | 地狱 | 当前版本原封不动，全部倍率恒为 1，作为回归对照 |

核心原则：**当前 `enemies.json` 基础值继续代表地狱难度，其余难度只在其之上乘倍率**。不复制任何配置文件。

允许的副作用（已知并接受）：低难度下敌人 HP 更低 → 击杀更快 → 掉落与升级在现实时间轴上适度提前。掉落概率、星级规则、每怪 XP、每波敌人总量均严格不变，因此每波期望经济总量不变。

---

## 二、已核实的现状（接入点与既有问题）

1. **敌人构造唯一入口** `src/core/systems/enemySystem.ts` `createEnemy()`（L30-60）：
   ```ts
   const hp = (def.hpBase + wave * def.hpPerWave) * (modifiers.hpMul ?? 1);
   const speed = (def.speedBase + wave * def.speedPerWave) * (modifiers.speedMul ?? 1);
   damage: def.damage * (modifiers.damageMul ?? 1),
   ```
   注意公式用的是 `wave`（首波 wave=1），**不是** `wave - 1`。难度系统不得趁机修改该语义。
   已有 `EnemyModifiers`（hpMul/speedMul/damageMul）机制，被 Bounty 敌群使用（`bountySystem.ts` L211-224 传入 `cfg.bounty.encounter.hpMul` 等）。难度倍率必须乘在括号内的基础公式上（即 modifiers 之前），这样 Bounty/波末 Boss 倍率天然叠加在难度之后，结算顺序自动正确。
2. **波末 Boss** 经 `spawnWaveBoss()`（同文件 L81-86）→ `createEnemy(state, 'boss', ...)`。Bounty 敌群构成只有 normal/fast/tank（`bounty.json` composition），因此 **按 `type === 'boss'` 区分 Boss 覆盖曲线是安全的**。
3. **既有 bug，必须一并修复**：`src/game.ts` `syncEnemyConfig()`（L240-255）在调参面板即时修改敌人参数时，用裸公式 `def.hpBase + state.wave * def.hpPerWave` 重算场上敌人，**会把 Bounty 敌群的强化倍率抹掉**。引入难度后该问题会扩大为「抹掉难度倍率」。修复方式见 §六.3。
4. **DEV 派生指标也用裸公式**：`src/ui/derivedMetrics.ts` L31-32 直接算 `hpBase + wave*hpPerWave`，TTK 投影在非地狱档会失真，需接入同一解析器。
5. **全局敌速已有独立通道**：运行期 `Config.enemySpeed`（`enemies.json` defaults，`moveEnemies` L122 每帧相乘）。难度的速度倍率**不要**动这个字段，应像 Bounty 一样在生成时乘进 `enemy.speed`。
6. **配置装配**：`src/config/loader.ts` `assembleBase()`（L67-82）从 base JSON 组装六域 + input/tuner；`GameConfig` 定义在 `src/config/types.ts` L261-271。新增 `difficulty` 域（生产包也要有，不能像 tuner 那样 DEV-only）。
7. **状态**：`GameState` 在 `src/core/types.ts` L278 起；`createInitialState()` 在 `src/core/createInitialState.ts` L31。`state.wave` 初始为 0，`startNextWave` 先 `state.wave++`。
8. **开始界面**：`index.html` L26 `#startOverlay`（内含 `#startBtn`）；`game.ts` `start()` L192、`reset()` L168。结果弹窗 `#resultModal` 由 `src/ui/modals.ts` 渲染。
9. **遥测**：`src/telemetry/devTelemetry.ts` 导出会话 meta 含 `presetName`/`seed`（L145-148），`recordGameEvents` 记录 `waveStart`（L238 附近）。
10. **RNG**：难度选择必须是纯配置操作，不得消耗任何随机数，否则固定 seed 的回归对照失效。本方案中选择难度只写 `state.difficultyId`，满足要求。
11. **测试环境**：vitest；`tests/helpers.ts` 的 `freshState()`/`resetTestEnv()`；`headlessRun.test.ts` 用真实配置跑整局 bot。**所有现有测试必须不改断言而通过**，因此 `createInitialState()` 的难度默认值必须硬编码为 `'hell'`（见 §五.1），配置里的 `defaultDifficulty` 只控制 UI 初始选中项。

---

## 三、新增配置：`src/config/base/difficulty.json`

```json
{
  "defaultDifficulty": "hell",
  "profiles": {
    "relaxed": {
      "label": "轻松",
      "description": "前期敌人明显较弱，后期仍有压力",
      "enemy": {
        "hp":     { "start": 0.45, "end": 0.85, "power": 1.65 },
        "damage": { "start": 0.35, "end": 0.75, "power": 1.5 },
        "speed":  { "start": 0.95, "end": 1.0,  "power": 1.2 }
      },
      "boss": {
        "hp":     { "start": 0.6,  "end": 0.9,  "power": 1.5 },
        "damage": { "start": 0.45, "end": 0.8,  "power": 1.4 }
      }
    },
    "standard": {
      "label": "标准",
      "description": "前期宽松，后期接近完整压力",
      "enemy": {
        "hp":     { "start": 0.65, "end": 0.95, "power": 1.55 },
        "damage": { "start": 0.55, "end": 0.9,  "power": 1.45 },
        "speed":  { "start": 0.98, "end": 1.0,  "power": 1.2 }
      },
      "boss": {
        "hp":     { "start": 0.75, "end": 1.0,  "power": 1.45 },
        "damage": { "start": 0.65, "end": 0.95, "power": 1.4 }
      }
    },
    "hard": {
      "label": "困难",
      "description": "仅缓和开局，后期接近当前版本",
      "enemy": {
        "hp":     { "start": 0.82, "end": 1.0, "power": 1.35 },
        "damage": { "start": 0.75, "end": 1.0, "power": 1.3 },
        "speed":  { "start": 1.0,  "end": 1.0, "power": 1.0 }
      },
      "boss": {
        "hp":     { "start": 0.9,  "end": 1.0, "power": 1.3 },
        "damage": { "start": 0.85, "end": 1.0, "power": 1.3 }
      }
    },
    "hell": {
      "label": "地狱",
      "description": "当前版本原始难度",
      "enemy": {
        "hp":     { "start": 1.0, "end": 1.0, "power": 1.0 },
        "damage": { "start": 1.0, "end": 1.0, "power": 1.0 },
        "speed":  { "start": 1.0, "end": 1.0, "power": 1.0 }
      }
    }
  }
}
```

**阶段 1 时上述非地狱三档的数值先全部填 1.0**（结构齐全、数值恒等），阶段 2 再换成上表数值。

类型（加入 `src/config/types.ts`，并在 `GameConfig` 增加 `difficulty: DifficultyConfig`）：

```ts
export type DifficultyId = 'relaxed' | 'standard' | 'hard' | 'hell';

export interface DifficultyCurve { start: number; end: number; power: number; }

export interface DifficultyProfile {
  label: string;
  description: string;
  enemy: { hp: DifficultyCurve; damage: DifficultyCurve; speed: DifficultyCurve };
  /** 可选覆盖：只作用于 type === 'boss'；缺省字段回落到 enemy 对应曲线。 */
  boss?: Partial<{ hp: DifficultyCurve; damage: DifficultyCurve; speed: DifficultyCurve }>;
}

export interface DifficultyConfig {
  defaultDifficulty: DifficultyId;
  profiles: Record<DifficultyId, DifficultyProfile>;
}
```

新增校验器 `src/config/difficultyValidator.ts`（在 `loader.ts` `assembleBase()` 里与 skills/progression 校验并列调用）：

- 每条曲线 `start > 0`、`end > 0`、`power > 0`、`start <= end`；
- `hell` 档所有曲线必须恒为 `{ start: 1, end: 1, power: 1 }` 且不得有 `boss` 覆盖（或覆盖也全为 1）；
- `defaultDifficulty` 必须是 profiles 的键；
- profile 中只允许 `label/description/enemy/boss` 键——难度配置禁止出现掉落、波次、XP、技能或弹道字段。

---

## 四、新增解析器：`src/core/difficulty.ts`

```ts
import { cfg } from '../config';
import type { DifficultyCurve, DifficultyId } from '../config/types';
import type { EnemyType } from './types';

/** 归一化曲线：首波 = start，最终波 = end；power>1 → 前缓后陡。wave 越界时 progress 钳制在 [0,1]。 */
export function difficultyMultiplierAtWave(curve: DifficultyCurve, wave: number, totalWaves: number): number {
  const progress = totalWaves <= 1 ? 1 : Math.min(1, Math.max(0, (wave - 1) / (totalWaves - 1)));
  return curve.start + (curve.end - curve.start) * Math.pow(progress, curve.power);
}

export interface DifficultyMultipliers { hp: number; damage: number; speed: number; }

/** 取某难度某波对某敌人类型生效的三项倍率（boss 覆盖仅当 type==='boss'）。 */
export function difficultyMultipliersFor(difficultyId: DifficultyId, type: EnemyType, wave: number): DifficultyMultipliers;
```

实现要点：

- `totalWaves` 每次调用时从 `cfg.waves.totalWaves` 读取（调参面板可改总波数，曲线终点须跟随）；
- `type === 'boss'` 时优先取 `profile.boss` 的对应曲线，缺省回落 `profile.enemy`；
- 纯函数，不消耗 RNG，不缓存到模块顶层（遵守 `src/config/index.ts` 头部注释的「禁止顶层解构缓存」约定）。

---

## 五、状态与生成接入

### 1. `GameState.difficultyId`

- `src/core/types.ts`：`GameState` 增加 `difficultyId: DifficultyId;`
- `src/core/createInitialState.ts`：签名改为 `createInitialState(difficultyId: DifficultyId = 'hell')`，写入 state。
  **默认值硬编码 `'hell'`**：现有全部测试经 `freshState()` 走无参调用，必须保持地狱基准；`difficulty.json` 的 `defaultDifficulty` 只供 UI 用。

### 2. `createEnemy` 接入（`src/core/systems/enemySystem.ts`）

L38-39、L52 改为：

```ts
const dm = difficultyMultipliersFor(state.difficultyId, type, wave);
const hp = (def.hpBase + wave * def.hpPerWave) * dm.hp * (modifiers.hpMul ?? 1);
const speed = (def.speedBase + wave * def.speedPerWave) * dm.speed * (modifiers.speedMul ?? 1);
// damage:
damage: def.damage * dm.damage * (modifiers.damageMul ?? 1),
```

同时在 `Enemy` 上保存非难度外部倍率，供调参同步重算（见 §六.3）：

- `src/core/types.ts` `Enemy` 增加可选字段 `statMods?: { hpMul: number; speedMul: number; damageMul: number };`
- `createEnemy` 内当任一 modifier ≠ 1 时写入该字段（恒为 1 时不写，`tests/helpers.ts` 的 `enemy()` 工厂无需改动）。

严格不变项：`xp`、`r`、敌人类型判定、掉落来源、Bounty 资格、Boss 身份、出怪时刻与数量——`createEnemy` 中除上述三行外不得改任何东西。

### 3. 结算顺序（已由上式保证，写测试锁定）

```text
基础值 → 波次成长 → 难度倍率 → Bounty/Boss 外部倍率 → 局内临时状态（speedMultiplier 等，运行期不变）
```

---

## 六、UI、调参与遥测

### 1. 开局难度选择

- `index.html` `#startOverlay` 内、开始按钮上方加一组四选一难度按钮（radio 语义即可），文案取 `cfg.difficulty.profiles[id].label`，初始选中 `cfg.difficulty.defaultDifficulty`；
- `game.ts` 模块级变量 `let selectedDifficulty: DifficultyId = cfg.difficulty.defaultDifficulty;`，选择器变更时更新；
- `reset()` 中 `createInitialState(selectedDifficulty)`；
- `start()` 后（`startOverlay` 本就隐藏）局内不可再改：一局开始后 `difficultyId` 只随整局重开变化，天然锁定，不需要额外 `difficultyLocked` 字段；
- 结果弹窗（`src/ui/modals.ts` showResult 渲染路径）显示本局难度 label（放入 `#resultDesc` 或 build-meta 区均可）。

### 2. DEV 调试

- `src/debug/exposeDebugApi.ts` 暴露 `setDifficulty(id)`：设置 `selectedDifficulty` 后调用 `reset()`（切难度必须整局重开，不得静默改正在进行的会话）；`getState()` 返回值中带 `difficultyId`；
- devTools/调参面板显示当前难度 id 及当前波实际 hp/damage/speed 倍率（调 `difficultyMultipliersFor`）。

### 3. 修复 `syncEnemyConfig()`（`src/game.ts` L240-255）

改为统一走解析器并保留外部倍率与生命比例：

```ts
const dm = difficultyMultipliersFor(state.difficultyId, enemy.type, state.wave);
const ext = enemy.statMods ?? { hpMul: 1, speedMul: 1, damageMul: 1 };
if (key === 'hpBase' || key === 'hpPerWave') {
  const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
  enemy.maxHp = (def.hpBase + state.wave * def.hpPerWave) * dm.hp * ext.hpMul;
  enemy.hp = enemy.maxHp * ratio;
} else if (key === 'speedBase' || key === 'speedPerWave')
  enemy.speed = (def.speedBase + state.wave * def.speedPerWave) * dm.speed * ext.speedMul;
else if (key === 'damage') enemy.damage = def.damage * dm.damage * ext.damageMul;
```

（此处顺带修复现状 bug：原实现会把 Bounty 敌群倍率抹掉。）

### 4. `derivedMetrics.ts` 接入

`cell()`（L30-37）的 hp/speed 乘上 `difficultyMultipliersFor` 结果。函数需能拿到 difficultyId：给 `computeDerivedMetrics`（及 `simulateBudgetWave`）加参数，由调用方（tunerPanel）传 `state.difficultyId`；无状态场景默认 `'hell'`。

### 5. 遥测（`src/telemetry/devTelemetry.ts`）

- 导出 meta（L145-148 处）增加 `difficulty: { id, hpMultiplierAtWave1, damageMultiplierAtWave1 }`；
- `recordGameEvents` 记录 `waveStart` 时（L238 附近）附带该波 `difficultyHpMultiplier` / `difficultyDamageMultiplier`（普通敌人曲线值，保留两位即可）。
- `Options` 增加 `getDifficultyId: () => DifficultyId`，由 `game.ts` 注入。

---

## 七、明确禁止修改的内容（静态保护清单）

以下文件/字段本任务一律不动：

- **A 出怪与波结构**：`waves.json` 全部字段（totalWaves、bossWaves、spawnMode、spawnInterval、budget、typeRoll、betweenWaves、firstSpawnDelay、waveEndSprint…）及 `waveSystem.ts`/`budgetRules.ts` 逻辑；
- **B 炮台与弹道**：`combat.json` 的 defaults（damage/fireRate/range）、bullet 全部字段、breakthroughDist；`combatSystem.ts` 索敌/发射/命中逻辑；
- **C 基础值**：`enemies.json` 的所有现有数值一个都不改（它们就是地狱档）；
- **D 掉落与拾取**：`economy.json` 全部字段、`dropSystem.ts`、`dropTypePolicy.ts`、星级规则、掉落导演、自动合成、槽位容量；
- **升级与技能**：每怪 `xp`、`progression.json`、Perk 权重与数值、`skills.json`、Bounty 奖励规则（`bounty.json` 数值不动，其 encounter 倍率继续作为外部倍率叠加）。

---

## 八、测试

### 新增 `tests/difficulty.test.ts`

1. **地狱恒等**：对全部 4 种敌人类型 × wave 1..totalWaves，`hell` 下 `createEnemy` 产出的 maxHp/speed/damage 与裸公式 `(hpBase + wave*hpPerWave)` 等完全相等（`toBe`，不是近似）；
2. 曲线端点：任意曲线在 wave=1 等于 `start`，wave=totalWaves 等于 `end`；`totalWaves===1` 时恒为 `end`；
3. 曲线单调不减；`power > 1` 时后半程单波增量 > 前半程；
4. 四档在同波次满足 `relaxed ≤ standard ≤ hard ≤ hell`（hp 与 damage 严格递增至少在 wave=1 成立）；
5. `xp` 与 `r` 在四档下逐类型完全相同；
6. Boss 覆盖只作用于 `type==='boss'`，normal/fast/tank 不受 `boss` 节影响；
7. Bounty 倍率在难度之后叠乘：构造 relaxed 下带 `hpMul` 的 `createEnemy`，断言 `maxHp === base * dmHp * hpMul`；
8. `syncEnemyConfig` 路径与新生成使用同一解析：模拟场上一只 relaxed Bounty 敌人，改 `hpBase` 后断言保留难度倍率、外部倍率与生命比例（此测试可放 game 层可测的最小化重现，或将同步逻辑提炼成 `src/core/systems/enemySystem.ts` 内可测纯函数 `resyncEnemyStats(enemy, state)` 后直接测它——**推荐提炼**，game.ts 只调用）；
9. 校验器：`start<=0`、`end<start`、hell 非 1、出现非法键时抛错；
10. 难度选择不消耗 RNG：用计数 rng 跑 `createInitialState('relaxed')` + `startNextWave`，断言 rng 调用次数与 hell 下相同。

### 回归

- 现有全部测试**不改任何断言**通过（`freshState()` 默认 hell 保证）；
- `headlessRun.test.ts` 保持原样通过；
- 配置边界自检（加入 difficulty.test.ts）：构建任意难度不改变 `cfg.waves`/`cfg.economy`/`cfg.progression`/`cfg.skills`（与 base 深比较 `toEqual`）。

---

## 九、实施顺序（两阶段，硬性门禁）

### 阶段 1：难度框架 + 地狱回归（先独立提交）

1. `difficulty.json`（**四档全部填恒 1 数值**）+ 类型 + 校验器 + loader 接入；
2. `src/core/difficulty.ts` 解析器 + `GameState.difficultyId` + `createEnemy`/`resyncEnemyStats` 接入；
3. `syncEnemyConfig` 改造、`derivedMetrics` 接入、开局选择 UI、debug API、遥测字段；
4. 全部新测试 + 现有测试通过，`npm run build` 通过。

阶段 1 的验收标准只有一条：**引入难度系统后，任何一档的数值都与修改前版本完全一致**（因为全是 1）。

### 阶段 2：填入三档真实参数（第二个提交）

1. 把 §三 的 relaxed/standard/hard 数值填入 `difficulty.json`；
2. `defaultDifficulty` 改为 `"standard"`（仅影响 UI 初始选中；`createInitialState` 默认参数保持 `'hell'` 不变）;
3. 补充/更新档位强弱顺序测试的具体数值断言；
4. 固定 seed 分别在四档跑 DEV 会话导出遥测，确认：地狱与阶段 1 前完全一致；relaxed 首波普通怪 TTK 约为地狱 45%；最终波倍率回升至表定 end 值。

阶段 2 不做任何结构改动。参数是首轮试玩起点，不是定案，后续按试玩遥测（首波受伤比例、首个 Boss TTK、最终波受伤比例、每分钟掉落、首次升级时间）再调。

---

## 十、验收自查清单

- [ ] `git diff` 中 `enemies.json`、`waves.json`、`combat.json`、`economy.json`、`progression.json`、`skills.json`、`bounty.json` 零改动；
- [ ] `hell` 档固定 seed 整局：出怪时刻、类型序列、位置、初始三属性、掉落与升级全部与改动前一致；
- [ ] 难度选择与切换全程不调用 rng；
- [ ] 调参面板改 `enemies.types.*` 后，场上 Bounty 敌人仍保有 encounter 倍率与难度倍率；
- [ ] `npm test`、`npm run build` 通过。
