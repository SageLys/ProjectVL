# Codex 任务 A4：显式波末 Boss 阶段 + 万能卡里程碑奖励 + 最小通关结算

> 「构筑闭环」四连任务第四步。可独立于 A2/A3 实施，但假定 A1 已合并（结算要读 `state.buildState.affinity`；若 A1 未合并，结算的「主要流派」行降级为不显示——以代码实际为准）。
> 文件行号基于开工前 `main`，以符号名为准。每阶段结束保持 `npm test` 与 `npm run build` 通过。

---

## 一、本任务目标

1. 把「Boss = 指定波最后一个出怪名额」重做为**显式波末 Boss 阶段**：普通敌人清空、Bounty 结算完毕后，才生成本波 Boss；Boss 死亡才进入波间休息。默认每一波（1~8）都有波末 Boss。
2. Boss 死亡奖励从「随机普通卡」改为**万能卡直接进背包**，星级/数量随波数按配置曲线增长。
3. Boss 数值按「目标击杀时间」重标定（当前公式服务于 3/5/8 三个 Boss，直接沿用会拖垮全局节奏）。
4. 新增**最小可行通关结算系统**：胜利/失败后展示总分与分项，第 8 波（终波）Boss 的万能卡通过「剩余万能卡折分」自然转化为结算加分（已拍板的决策）。

---

## 二、硬性不变量（实现后逐条自查）

1. 普通敌人的生成策略（interval/budget 两模式、配额公式、准入规则 `budgetRules.ts`）不动；Boss **不占用**普通配额，是阶段推进时额外生成的实体。
2. Bounty 系统内部逻辑不动；只在**接口层**加两条约束：Boss 阶段不再产生新报价；进入 Boss 阶段时未接受的报价过期清除（复用现有 `bountyOfferExpired` 事件语义，`checkWaveClear` L93-94 已有同款清除代码可搬移）。**已接受**的 Bounty 敌群必须结算完（完成或失败）才进入 Boss 阶段。
3. Bounty 完成奖励（指定卡+1 张万能卡）不动。
4. `grantWildcards`（`src/core/systems/wildcardSystem.ts` L20-28）与万能卡使用/合成逻辑不动，直接复用。
5. `jumpToWave` / `restartWave` 调试入口继续可用（需重置新增的阶段字段）。
6. 失败路径不变：HP 归 0 任何时刻 `endGame(state, false)`；失败也走结算面板（分项照算，无 winBonus）。
7. RNG 纪律同前。
8. 调参面板的 Boss 波次控件保留，语义改为「哪些波有波末 Boss」；preset 迁移逻辑（`tunerSchema.ts` L187-190）不动。

---

## 三、现状（已核实）

| 位置 | 内容 | 处置 |
|---|---|---|
| `src/core/systems/enemySystem.ts` L15-20 `determineType` | `bossWaves.includes(wave) && spawnLeft===1 → boss` | **删除 boss 分支**；普通生成只出 normal/fast/tank |
| `enemySystem.ts` L31-60 `createEnemy` | 无来源标记 | `EnemyModifiers` 增加 `spawnKind`；`Enemy.spawnKind: 'regular'|'waveBoss'|'bounty'`（bounty 路径在 `bountySystem.ts` L152-164 传入） |
| `src/core/systems/waveSystem.ts` L89-100 `checkWaveClear` | 清场→betweenWaves→最终波 endGame | 重写为 `advanceWavePhase(state, config, rng)`（§四） |
| `waveSystem.ts` L17-36 `startNextWave` | 重置波次状态 | 增加阶段字段重置 |
| `waveSystem.ts` L112-138 `jumpToWave` | 清场重开 | 重置阶段字段 |
| `src/core/updateGame.ts` L27 | 调 `checkWaveClear` | 换 `advanceWavePhase` |
| `src/core/systems/bountySystem.ts` L71-80 `canCreateOffer` | 不知道阶段 | 增加 `state.wavePhase === 'regular'` 条件 |
| `src/core/systems/dropSystem.ts` L53-61 `rollDropOnKill` | `enemy.type==='boss'` 必掉均匀随机普通卡 | 删除该分支（波末 Boss 不掉普通卡；`spawnKind==='waveBoss'` 不进此函数） |
| `src/core/systems/damageSystem.ts` L17-27 `killEnemy` | 击杀结算唯一入口 | waveBoss 死亡走奖励结算（§五），不 rollDropOnKill |
| `src/config/base/enemies.json` L45-57 | boss `hpBase:420, hpPerWave:500` | 重标定（§六） |
| `src/config/base/waves.json` L36-40 | `bossWaves:[3,5,8]` | 改 `[1,2,3,4,5,6,7,8]`，语义=有波末 Boss 的波次 |
| `src/config/variants/dev-short.json` | `totalWaves:3, bossWaves:[3]` | 改 `bossWaves:[1,2,3]` |
| `src/core/endGame.ts` | 8 行：置 ended+事件 | 计算并挂 `state.runSummary`（§七） |
| `src/ui/modals.ts` L36-43 `showResult` + `index.html` L52-53 | 结算只有击杀/合成/消耗 | 增加分数分解（§七.3） |
| `src/ui/derivedMetrics.ts` L54, L81, L91 | 按旧语义预估 Boss 占配额 | 按新语义修正（Boss 为额外实体，不占配额） |
| `tests/bossWaves.test.ts` | 断言旧「最后名额」语义 | 大部分重写（§八） |
| `src/telemetry/types.ts` | 无 boss 事件 | 增加（§五.4） |

---

## 四、波次阶段机

### 1. 状态（`core/types.ts` + `createInitialState.ts`）

```ts
export type WavePhase = 'regular' | 'boss' | 'between';
// GameState 增加：
wavePhase: WavePhase;            // 初始 'regular'；startNextWave 置 'regular'
waveBossId: number | null;       // 本波 Boss 的敌人 id；未生成为 null
bossRewardClaimedWave: number;   // 已发放奖励的最大波数，防重复结算；初始 0
```

`Enemy` 增加 `spawnKind: 'regular' | 'waveBoss' | 'bounty'`（必填，`createEnemy` 默认 'regular'，bounty 生成点传 'bounty'）。

### 2. `advanceWavePhase(state, config, rng): GameEvent[]`（替换 `checkWaveClear`）

```text
phase = regular:
  条件：spawnLeft===0 && 场上无 spawnKind∈{regular,bounty} 的敌人
        && 无 spawning/active 的 bountyEncounter && mode==='playing'
  动作：清除未接受报价（发 bountyOfferExpired）；
        若 bossWaves 含本波 → 生成 waveBoss（额外实体，出生逻辑复用 spawnEnemy 的四边随机位，
        类型 'boss'，spawnKind:'waveBoss'，记 waveBossId），发 waveBossSpawned 事件，phase='boss'；
        若 bossWaves 不含本波 → 直接走原 waveCleared/endGame 分支（保留无 Boss 波的可配置性）。
phase = boss:
  由 killEnemy 侧检测 Boss 死亡（§五），不在此轮询；本函数在 boss 阶段仅防御性检查：
  若 waveBossId 对应敌人已不存在且奖励已发 → 走 waveCleared/endGame 分支，phase='between'。
phase = between:
  沿用 tickBetween 倒计时；startNextWave 时 phase='regular'、waveBossId=null。
```

- 原 `waveClearPending` 标志由 phase 取代，删除或保留其一，不要两套并存（全仓 grep 消费方）。
- 最终波：Boss 死亡 → 发奖励 → `endGame(state, true)`（先发奖励再结算，保证终波万能卡计入结算折分）。

### 3. Boss 击杀与奖励（`killEnemy` 内，`damageSystem.ts`）

`enemy.spawnKind === 'waveBoss'` 时：

- 不调 `rollDropOnKill`（普通卡分支已删，双保险）。
- 防重复：`state.bossRewardClaimedWave >= state.wave` 则跳过奖励（理论不可达，防御性）。
- `grantWildcards(state, computeWaveBossReward(state.wave, cfg))` **直接进背包**，不落地、不受时限与手牌容量影响；随后发事件 `{ type: 'bossRewardGranted', wave, grants }`（`GameEvent` 新增），`bossRewardClaimedWave = wave`。
- 视觉：在 Boss 位置生成一圈粒子爆发（复用 `spawnParticle`，量级参照 `killParticles` ×3）。
- XP 照常（boss xp:5 不动）。

### 4. 事件与表现层

- `GameEvent` 新增：`waveBossSpawned { wave }`、`bossRewardGranted { wave; grants }`。
- `eventText.ts`：`waveBossSpawned` → `texts.toast.waveBoss`（如 `"命定追求者现身——击败它获取万能卡"`）；`bossRewardGranted` → `texts.toast.bossReward`（如 `"击败 Boss：获得 {desc}"`，desc 形如 `"2★万能卡×1"`，多组用顿号连接）；`wildcardsGranted` 的既有 toast `testWildcards` 文案是测试语气（"1–5★ 各 1 张"），当 grants 来自 boss 时用 bossReward 覆盖（`SLOT_CHANGING` 集合记得加 `bossRewardGranted`——它改变万能卡库存显示）。
- `renderHud` / `wildcardSlot`：万能卡数量显示已存在，无需新 UI；确认 `bossRewardGranted` 触发重绘。
- 遥测（`telemetry/types.ts` + `devTelemetry.ts`）：`TelemetryEventType` 增加 `'waveBossSpawned' | 'waveBossKilled' | 'bossRewardGranted'`，事件带 wave、（击杀带）击杀耗时 = Boss 生成到死亡的秒数（生成时间可记在 state 或经由事件时刻差算，选简单者）。

---

## 五、万能卡奖励曲线（配置驱动）

`waves.json` 新增块（`config/types.ts` WavesConfig 同步）：

```json
"waveBoss": {
  "reward": {
    "starTierEveryWaves": 3,
    "starMax": 3,
    "bonusCountEveryWaves": 3,
    "finalWaveBonusCount": 1
  }
}
```

```ts
export function computeWaveBossReward(wave: number, cfg): WildcardGrant[] {
  const r = cfg.waves.waveBoss.reward;
  const star = Math.min(r.starMax, 1 + Math.floor((wave - 1) / r.starTierEveryWaves));
  const count = 1
    + (wave % r.bonusCountEveryWaves === 0 ? 1 : 0)
    + (wave === cfg.waves.totalWaves ? r.finalWaveBonusCount : 0);
  return [{ star, count }];
}
```

默认 8 波曲线：W1 1★×1，W2 1★×1，W3 1★×2，W4 2★×1，W5 2★×1，W6 2★×2，W7 3★×1，W8 3★×2。starMax=3 是刻意的：4★/5★ 万能卡跨越合成成本过大，先不发。公式对 dev-short（3 波）自然退化为 1★×1 / 1★×1 / 1★×2(+终波1)。

调参面板暴露 `waves.waveBoss.reward.starMax`（1~5, step 1）与 `starTierEveryWaves`（1~8, step 1）。

---

## 六、Boss 数值重标定（`enemies.json`）

原公式 `420 + 500×wave` 服务于仅 3 个 Boss 的节奏；每波 Boss 需要压低并拉平。初版基线（进 tuner，靠遥测的击杀耗时再调）：

```json
"boss": { "hpBase": 300, "hpPerWave": 320, "speedBase": 18, ... 其余字段不动 }
```

→ W1 620 / W3 1260 / W5 1900 / W8 2860。设计意图（写进 designNotes/注释，不写死代码）：

| 波段 | 目标击杀时间 |
|---|---:|
| 1~2 | 8~12s |
| 3~5 | 12~16s |
| 6~8 | 15~20s |

普通配额不减（budget 模式单波配额 100+，减 1 无感知；interval 模式同理不动），Boss 作为纯增量出现在清场后的空场，实际压力可控。若遥测显示整局时长膨胀 >10%，后续再从 `budget.waveQuota` 上调整——本任务不动配额。

---

## 七、最小通关结算系统

### 1. 配置（`progression.json` 新增块 + `config/types.ts`）

```json
"settlement": {
  "winBonus": 500,
  "perWaveCleared": 40,
  "perKill": 2,
  "hpRatioBonusMax": 200,
  "perEquippedStarSquared": 10,
  "wildcardStarValue": { "1": 15, "2": 40, "3": 100, "4": 250, "5": 600 }
}
```

### 2. 新模块 `src/core/settlement.ts`（纯函数）

```ts
export interface RunSummary {
  win: boolean;
  score: { total: number; win: number; waves: number; kills: number; hp: number; build: number; wildcards: number };
  clearedWaves: number;            // win ? totalWaves : wave-1（当前波未守住不计）
  topLane: BuildTag | null;        // affinity 最大且>0 的 lane；并列取先到者；全 0 为 null
  highestCard: { type: CardType; star: number } | null;   // 手牌+装备中最高星（并列任取）
}
export function buildRunSummary(state: GameState, win: boolean): RunSummary
```

- `win`：胜利加 winBonus，失败 0。
- `waves`：clearedWaves × perWaveCleared。
- `kills`：kills × perKill。
- `hp`：`round(hp/maxHp × hpRatioBonusMax)`，失败为 0。
- `build`：Σ（手牌+装备中每张卡 star²）× perEquippedStarSquared。
- `wildcards`：Σ 各星级剩余数量 × wildcardStarValue[star]。**第 8 波 Boss 奖励在 endGame 前已进背包，天然计入此项——这就是终波奖励转结算加分的实现**，不需要单独通道。
- `endGame(state, win)` 改为计算并写 `state.runSummary`（GameState 增加 `runSummary: RunSummary | null`，初始 null；endGame 签名不需要 config——settlement 只读 cfg 与 state）。`gameEnd` 事件不携带 summary（表现层直接读 state）。

### 3. 结算 UI（`index.html` + `modals.ts` + `texts.json`）

- `resultModal` 的 `result-grid` 下方新增一个分数区块：总分大字 + 分项小行（通关 / 波数 / 击杀 / 心防 / 构筑 / 万能卡结余），值为 0 的分项隐藏；再加一行「主要流派：{lane 名}」（topLane 为 null 隐藏）与「最高成就：{star}★{卡名}」（用 `cardDisplayName`）。
- 文案键新增 `texts.result.score*` 系列；lane 名复用 A1 的 `texts.lanes.*`（若 A1 未合并则本任务补建该键组）。
- `showResult(win, state)` 读 `state.runSummary` 渲染；`runSummary` 为 null（异常路径）时隐藏分数区块。

---

## 八、测试

**重写 `tests/bossWaves.test.ts`**（旧「最后名额」语义作废）+ 扩展 `waveSystem.test.ts` / `wildcardSystem.test.ts` + 新增 `tests/settlement.test.ts`：

1. **阶段推进**：普通敌人未清空 → 不生成 Boss；清空且无 Bounty → 恰好生成 1 只 `spawnKind:'waveBoss'`；Boss 存活时 `between` 不开始、`startNextWave` 不发生。
2. **Bounty 交互**：regular 阶段接受的 Bounty 未结算完 → 不进 Boss 阶段；进入 Boss 阶段时未接受报价全部过期（事件数正确）；Boss 阶段 `canCreateOffer` 恒 false。
3. **奖励曲线**：W1/W3/W4/W6/W8 的 grants 与 §五表逐一相等；`bossRewardClaimedWave` 防重复（对同一 Boss 连续调用 killEnemy 路径只发一次）；奖励直接进 `state.wildcards`，不产生 groundDrop、手牌满不影响。
4. **不掉普通卡**：waveBoss 死亡不调 `rollDropOnKill`（groundDrops 无新增卡牌掉落）；普通波怪与 `determineType` 不再产出 'boss' 类型。
5. **终波**：最终波 Boss 死亡 → 先 `bossRewardGranted` 后 `gameEnd(win:true)`；`runSummary.score.wildcards` 已包含终波奖励。
6. **失败路径**：中途 HP 归 0 → `runSummary.win=false`、无 winBonus、clearedWaves=wave-1。
7. **结算计算**：构造已知状态（固定 kills/hp/卡/万能卡）断言各分项与 total 精确值；affinity 全 0 → topLane null。
8. **jumpToWave 回归**：跳波后阶段字段重置，能正常打完一波含 Boss 的完整循环。
9. **derivedMetrics**：更新后的预估不再把 Boss 算进配额名额。
10. `headlessRun.test.ts` 全局冒烟仍通过（整局可通关）；`npm run build` 通过。

---

## 九、实施顺序

1. types/createInitialState 阶段字段 + `Enemy.spawnKind`（含 bounty 生成点打标）。
2. `determineType` 删 boss 分支 + `advanceWavePhase` 重写 + updateGame/startNextWave/jumpToWave 接线。
3. `killEnemy` 的 waveBoss 奖励结算 + `computeWaveBossReward` + waves.json/enemies.json/dev-short 配置。
4. Bounty 阶段闸门 + 事件/文案/遥测/HUD 重绘。
5. settlement.ts + endGame + 结算 UI。
6. tuner 语义更新 + derivedMetrics 修正。
7. 测试重写与全量回归。
