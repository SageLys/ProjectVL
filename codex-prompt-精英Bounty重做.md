# Codex 任务：重做精英 Bounty 机制（Offer → 敌群 → 确定奖励）

> 本文档为完整实施指令。所有文件路径、行为描述均已对照 `main` 分支实际代码核实。
> 按「十五、实施顺序」的 6 个阶段依次完成，每阶段结束保持 `npm test` 与 `npm run build`（含 `tsc --noEmit`）通过。

---

## 一、总目标

将现有的"随机给一只普通敌人挂金圈标记、点击后强化该敌人"的 Bounty 机制，重做为 Hades 式主动决策机制：

1. 游玩中在画面边缘生成**赏金报价标记（Offer）**，标记本身展示确定的奖励内容（指定类型卡牌 + 万能卡）。
2. 玩家点击接受后，从标记方向额外生成一组强化敌群（Encounter），敌群使用奖励卡牌的色系与图标标识。
3. 炮台优先攻击赏金敌群，但进入炮台紧急半径的敌人可覆盖该优先级。
4. **全部**赏金敌人被消灭后，统一在地面掉落确定的奖励；**任一成员突破炮台防线则整组任务失败，不发任何奖励**（已拍板）。
5. Offer 生成概率动态化：玩家顺风（长时间无伤、高血量）概率升高，逆风降低但有下限；每波有确定性的最低报价次数保底。保底保证的是"报价出现"，不强迫玩家接受。
6. 所有关键参数进入开发调参面板（含实时状态显示），遥测覆盖完整漏斗。

不接受 Offer 没有任何惩罚，Offer 倒计时结束自然过期。

---

## 二、现状：需要删除/替换的旧实现（已核实的精确位置）

| 位置 | 内容 | 处置 |
|---|---|---|
| `src/core/types.ts` L55-56 | `Enemy.bounty?: { accepted; markRemaining }` | 删除，换为 `bountyEncounterId?` / `bountyRewardType?` |
| `src/core/types.ts` L238-239 | `GameState.bountyPending: boolean` | 删除，换为新状态（见 §四） |
| `src/core/createInitialState.ts` L71 | `bountyPending: false` | 删除，初始化新状态 |
| `src/core/systems/waveSystem.ts` L26-27 | `startNextWave` 内每波一次掷骰置 `bountyPending` | 删除 |
| `src/core/systems/enemySystem.ts` L41-44 | `spawnEnemy` 内给下一只非 Boss 挂标记 | 删除 |
| `src/core/systems/enemySystem.ts` `tickBounty` / `acceptBountyTap` | 旧倒计时与点敌接单 | 删除 |
| `src/core/updateGame.ts` L22 | `tickBounty(state, dt)` 调用 | 替换为新 `tickBountySystem` |
| `src/core/systems/damageSystem.ts` L20-21 | `enemy.bounty?.accepted ? rollBountyDrops : rollDropOnKill` | 替换（见 §八） |
| `src/core/systems/dropSystem.ts` `rollBountyDrops` | 逐敌随机掉落 | 删除 |
| `src/core/systems/combatSystem.ts` L16-33 | `findTarget` 的 `focusFire` 分支 | 替换（见 §七） |
| `src/render/drawEnemies.ts` L65-81 | 金色倒计时环/描边 | 替换（见 §十） |
| `src/game.ts` L14, L124-130 | `acceptBountyTap` import、`bountyEnabled`、`onBountyTap` | 替换（见 §九） |
| `src/input/pointerRouter.ts` L46, L49, L111 | `bountyEnabled` / `onBountyTap` | 替换（见 §九） |
| `src/config/base/skills.json` `mechanisms` 域 | 旧 BountyConfig 数值 | 整个 `mechanisms` 域删除 |
| `src/config/types.ts` L62 `SkillsConfig.mechanisms` | 类型 | 删除 |
| `src/core/effects/defs.ts` L82-90 旧 `BountyConfig` | 类型 | 删除，新 `BountyConfig` 放 `src/config/types.ts` |
| `src/core/effects/statusSystem.ts` L7 / L14 | 索敌仲裁注释"bounty(P5) > 烙印 > 最近" | 更新注释为新优先级 |
| `src/telemetry/types.ts` L32 `'bountyAccept'` | 旧输入遥测 | 保留输入类型可不动，新增事件遥测见 §十一 |

注意：`economy.json` 的 `dropStarPolicy.bountyBossMax` 仍被 `src/core/effects/registry.ts` L342 的掉落原子使用，**保留不动**，只是新 Bounty 不再使用它。

已核实：`tests/` 目录下没有任何测试引用旧 Bounty 逻辑（`bountyPending`/`acceptBountyTap`/`rollBountyDrops`/`mechanisms.bounty` 仅出现在 `src/`），删除旧实现不会破坏现有测试。

---

## 三、新机制生命周期与已拍板规则

```text
Director 周期检查（固定间隔，不是每帧，也不是每波一次）
  ↓ 命中概率 或 触发保底
Offer：画面边缘出现赏金标记（奖励类型/星级/万能卡在生成时即确定并展示）
  ├─ 倒计时结束未点击 → Expired（无惩罚，进入冷却）
  └─ 玩家点击 → Accepted → 创建 Encounter
        ↓ Spawning：从标记方向分批生成敌群
        ↓ Active：交战
        ├─ 全部消灭 → Completed → 统一掉落确定奖励
        └─ 任一成员突破炮台 → Failed → 不发奖励；剩余成员退化为普通敌人
```

已拍板的规则：

1. **失败判定**：任一 Encounter 成员触发突破（进入 `breakthroughDist`，无论是否被护盾吸收）→ 整组 `failed`，不发奖。剩余存活成员清除 `bountyEncounterId`/`bountyRewardType`，完全退化为普通敌人：失去赏金配色与索敌优先级，之后被击杀时走普通的 `rollDropOnKill`。
2. **索敌覆盖**：紧急距离阈值模式。只有与炮台距离 ≤ `emergencyOverrideDistance`（可调参，基线 95，比 `breakthroughDist`=48 更宽）的敌人才能覆盖赏金优先级。
3. 未接受的 Offer 不阻止波次结束；波清时未接受 Offer 直接过期移除。
4. 接受后生成的敌群是真实战场敌人（存在于 `state.enemies`），阻止波次结束。
5. 被诱饵、反伤、处决等任何击杀途径消灭的成员，都计入完成进度（撞嘲讽召唤物消散的成员见 §六.5）。
6. 保底只保证"每波至少出现 `minOffersPerWave` 次报价"，不保证接受次数。
7. 中途击杀成员不掉任何东西；只有 Completed 才统一发奖。

---

## 四、数据模型（`src/core/types.ts`）

```ts
export type BountySide = 'top' | 'right' | 'bottom' | 'left';

export interface BountyOffer {
  id: number;
  /** 生成时即确定：奖励卡牌类型（玩家接受前可见） */
  rewardCardType: CardType;
  rewardCardStar: number;
  rewardCardCount: number;
  wildcardStar: number;
  wildcardCount: number;
  /** 标记所在边 = 敌群出生方向 */
  side: BountySide;
  /** Canvas 上的锚点（可点击） */
  x: number;
  y: number;
  remaining: number;
  /** 是否由每波保底强制生成 */
  guaranteed: boolean;
  createdAt: number; // state.time，用于遥测 decisionSeconds
}

export interface BountyEncounter {
  id: number;
  offerId: number;
  rewardCardType: CardType;
  rewardCardStar: number;
  rewardCardCount: number;
  wildcardStar: number;
  wildcardCount: number;
  side: BountySide;
  status: 'spawning' | 'active' | 'completed' | 'failed';
  /** 已生成、尚未结算的成员 enemy id */
  memberIds: number[];
  pendingSpawnCount: number;
  spawnTimer: number;
  guaranteed: boolean;
  acceptedAt: number;
  hpAtAccept: number;
  /** 最后一名成员死亡位置（奖励掉落锚点） */
  lastKillX: number;
  lastKillY: number;
}

export interface BountyDirectorState {
  offersThisWave: number;
  acceptedThisWave: number;
  completedThisWave: number;
  checkTimer: number;      // 距下次概率检查的剩余秒数
  cooldownRemaining: number;
  /** 最近一次实际受到突破伤害的 state.time；开局为 0 */
  lastHpLossAt: number;
  /** 奖励类型洗牌袋（CardType 数组，抽空后重洗） */
  rewardBag: CardType[];
  lastRewardType: CardType | null;
}
```

`Enemy` 增加：

```ts
bountyEncounterId?: number;
bountyRewardType?: CardType; // 冗余存一份，渲染取色不用查 encounter
```

`GameState` 增加（并在 `createInitialState.ts` 初始化）：

```ts
bountyOffers: BountyOffer[];
bountyEncounters: BountyEncounter[];
bountyDirector: BountyDirectorState;
nextBountyOfferId: number;
nextBountyEncounterId: number;
/** 本波总出怪配额（startNextWave 时记录 spawnLeft 初值），用于计算波次进度 */
waveSpawnQuota: number;
```

初版限制 `maxConcurrentOffers = 1`、同时最多 1 个未结算 Encounter（配置项控制），但数据结构用数组，为后续扩展留余地。

`GameEvent` 联合类型新增（core 只产语义，不碰 DOM）：

```ts
| { type: 'bountyOfferSpawned'; offerId: number; rewardCardType: CardType; guaranteed: boolean }
| { type: 'bountyOfferExpired'; offerId: number }
| { type: 'bountyAccepted'; offerId: number; encounterId: number; rewardCardType: CardType; side: BountySide }
| { type: 'bountyMemberSpawned'; encounterId: number; enemyId: number }
| { type: 'bountyCompleted'; encounterId: number; rewardCardType: CardType; clearSeconds: number }
| { type: 'bountyFailed'; encounterId: number }
| { type: 'bountyRewardDropped'; encounterId: number; rewardCardType: CardType }
```

`src/ui/eventText.ts` 的 `formatToast` 必须覆盖新事件（接受/完成/失败给 toast，其余返回 `null`），文案加入 `src/data/texts.json` 的 `toast` 域。**注意：`texts.json` 修改时保持原有编码与格式，只做最小追加。**

---

## 五、新配置域 `src/config/base/bounty.json`

新建文件（数值为首轮可玩基线，全部进调参面板）：

```json
{
  "enabled": true,
  "offer": {
    "enabledFromWave": 1,
    "checkIntervalSeconds": 4.0,
    "baseChancePerCheck": 0.10,
    "minChancePerCheck": 0.02,
    "maxChancePerCheck": 0.42,
    "noDamageRampSeconds": 35,
    "noDamageBonusMax": 0.18,
    "healthyHpThreshold": 0.75,
    "healthyHpBonusMax": 0.10,
    "recentDamagePenalty": 0.12,
    "recentDamagePenaltySeconds": 10,
    "markWindowSeconds": 8,
    "cooldownSeconds": 12,
    "minOffersPerWave": 1,
    "maxOffersPerWave": 2,
    "guaranteeAtWaveProgress": 0.55,
    "maxConcurrentOffers": 1,
    "maxConcurrentEncounters": 1
  },
  "encounter": {
    "enemyCountBase": 3,
    "enemyCountPerWave": 0.5,
    "enemyCountMax": 7,
    "hpMul": 1.35,
    "speedMul": 1.10,
    "damageMul": 1.15,
    "spawnIntervalSeconds": 0.18,
    "spawnSpread": 110,
    "emergencyOverrideDistance": 95,
    "composition": { "normalWeight": 0.5, "fastWeight": 0.3, "tankWeight": 0.2 }
  },
  "reward": {
    "cardCount": 1,
    "cardStarBase": 1,
    "cardStarUpgradeEveryWaves": 4,
    "cardStarMax": 2,
    "wildcardCount": 1,
    "wildcardStarBase": 1,
    "wildcardStarUpgradeEveryWaves": 4,
    "wildcardStarMax": 2,
    "dropLifetimeSeconds": 12,
    "repeatProtection": 1
  },
  "visual": {
    "offerRadius": 30,
    "offerEdgeInset": 28,
    "enemyGlowRadius": 10,
    "enemyPulseSpeed": 3,
    "showRewardName": true
  }
}
```

接线（对照 `src/config/loader.ts` 现有模式）：

- `src/config/types.ts`：定义 `BountyConfig` 接口（上述形状），`GameConfig` 增加 `bounty: BountyConfig` 域。
- `src/config/loader.ts`：`import bounty from './base/bounty.json'`，`assembleBase()` 加入 `bounty`。variant 深覆盖机制（`DeepPartial`）自动兼容，无需改。
- `skillValidator.ts` 只校验 `version` + `cards`，删除 `skills.json` 的 `mechanisms` 后它不受影响，但 `SkillsConfig` 类型要同步删掉 `mechanisms` 字段。

奖励星级规则：`star = min(cardStarMax, cardStarBase + floor((wave - 1) / cardStarUpgradeEveryWaves))`，万能卡同理。即基线下第 1-4 波掉 1★ 指定卡 + 1★ 万能卡，第 5 波起 2★。奖励在 **Offer 生成时**结算并冻结，接受后不再掷骰。

奖励类型选择：洗牌袋。袋子内容 = `CARD_KEYS`（`src/core/systems/dropSystem.ts` L10-13 导出的 11 张正式卡，与 `cardVisuals.json` 一致）。抽空重洗；`repeatProtection = 1` 时禁止与上一次相同（重洗后若首个与上次相同则与后面一张交换）。

---

## 六、Bounty 系统实现（新建 `src/core/systems/bountySystem.ts`）

### 1. Director 周期检查

导出 `tickBountySystem(state, config, rng, dt): GameEvent[]`，在 `src/core/updateGame.ts` 中替换原 `tickBounty` 调用位置（保持在 `checkWaveClear` **之前**，否则高速清场时保底没机会触发）。

每次 `checkTimer` 归零执行一次检查（`checkIntervalSeconds`），满足全部前置才掷骰：

- `cfg.bounty.enabled && state.wave >= offer.enabledFromWave`
- `state.mode === 'playing'` 且非波间隔
- `offersThisWave < maxOffersPerWave`
- 当前 Offer 数 < `maxConcurrentOffers`，未结算 Encounter 数 < `maxConcurrentEncounters`
- `cooldownRemaining <= 0`

动态概率：

```ts
function calculateOfferChance(state: GameState): number {
  const o = cfg.bounty.offer;
  const hpRatio = state.hp / state.maxHp;
  const healthyScore = clamp01((hpRatio - o.healthyHpThreshold) / (1 - o.healthyHpThreshold));
  const noDamageSeconds = Math.max(0, state.time - state.bountyDirector.lastHpLossAt);
  const noDamageScore = clamp01(noDamageSeconds / o.noDamageRampSeconds);
  const recentDamageScore = clamp01(1 - noDamageSeconds / o.recentDamagePenaltySeconds);
  return clamp(
    o.baseChancePerCheck
      + healthyScore * o.healthyHpBonusMax
      + noDamageScore * o.noDamageBonusMax
      - recentDamageScore * o.recentDamagePenalty,
    o.minChancePerCheck, o.maxChancePerCheck);
}
```

把 `calculateOfferChance` 导出（调参面板实时状态 & 测试要用）。

保底：波次进度不用时间（每波时长随 DPS 变化），用配额：

```ts
const waveProgress = state.waveSpawnQuota > 0 ? 1 - state.spawnLeft / state.waveSpawnQuota : 1;
if (offersThisWave < minOffersPerWave && waveProgress >= guaranteeAtWaveProgress) 强制生成（guaranteed: true，无视冷却与概率，但仍受并发上限约束）;
```

`state.waveSpawnQuota` 在 `startNextWave` 里记录 `state.spawnLeft` 的初值；同时把 director 的每波计数（`offersThisWave/acceptedThisWave/completedThisWave`）清零、清空残留 Offers。

`lastHpLossAt` 更新点：`src/core/systems/enemySystem.ts` `moveEnemies` 中 `state.hp -= damage` 处（L133-136），同步 `state.bountyDirector.lastHpLossAt = state.time`。DEV 锁血模式在 `game.ts` 循环里事后回填 hp，不影响该时间戳，可接受。

### 2. Offer 生成

- `side`：四边等概率随机。
- 锚点：在该边内缩 `offerEdgeInset` 的线段上随机取点（参照 `spawnEnemy` L29-34 的四边取点方式，但在画布**内**而非外）。
- 奖励：从洗牌袋取类型，按 §五规则算星级/数量，全部写入 Offer。
- `remaining = markWindowSeconds`；产出 `bountyOfferSpawned` 事件；`offersThisWave++`；设置 `cooldownRemaining = cooldownSeconds`。

### 3. Offer 倒计时与过期

每帧递减 `remaining`；归零移除并产出 `bountyOfferExpired`。波清（`waveCleared`）时残留 Offer 直接过期。

### 4. 接受（由输入层调用）

导出 `acceptBountyOfferAt(state, x, y): GameEvent[]`：命中判定半径 `visual.offerRadius + 16`；命中则删除 Offer、创建 Encounter（`status: 'spawning'`，`pendingSpawnCount` 按下式），产出 `bountyAccepted`。

```ts
const count = Math.min(enemyCountMax, enemyCountBase + Math.floor((state.wave - 1) * enemyCountPerWave));
```

### 5. 敌群生成与成员结算

先重构 `src/core/systems/enemySystem.ts`：从 `spawnEnemy` 中抽出通用构造：

```ts
export function createEnemy(state, type, wave, position, modifiers?): Enemy
// modifiers: { hpMul?, speedMul?, damageMul?, bountyEncounterId?, bountyRewardType? }
```

`spawnEnemy`（普通路径）行为保持逐字节等价（现有 `waveSystem.test.ts`、`spawnModeLifecycle.test.ts` 等依赖它）。

Bounty 生成（在 `tickBountySystem` 内推进 `spawning` 状态的 Encounter）：

- 每 `spawnIntervalSeconds` 生成 1 只，出生点在 Offer 的 `side` 对应画布边缘外（复用 `cfg.waves.spawnMargin`），沿该边在 `±spawnSpread/2` 内散布。
- 类型按 `composition` 权重在 normal/fast/tank 中抽取（与奖励类型无关）。
- 属性乘 `hpMul/speedMul/damageMul`；写入 `bountyEncounterId`、`bountyRewardType`。
- **不消耗 `state.spawnLeft`**、不经过 `budgetAdmission`、不受 `maxAlive` 约束、不改普通概率池。
- 每只产出 `bountyMemberSpawned`；`pendingSpawnCount` 归零后 `status = 'active'`。

成员结算，导出两个通知函数：

- `notifyBountyMemberKilled(state, enemy): GameEvent[]` — 从 `memberIds` 移除；记录 `lastKillX/Y`；若 `memberIds` 空且 `pendingSpawnCount === 0` → `completed`，统一发奖（§八），产出 `bountyCompleted` + `bountyRewardDropped`，`completedThisWave++`。
- `notifyBountyMemberBreached(state, enemy): GameEvent[]` — Encounter → `failed`，产出 `bountyFailed`；遍历 `state.enemies` 清除同 `encounterId` 成员的 `bountyEncounterId/bountyRewardType`（退化为普通敌人）。

调用点（`enemySystem.moveEnemies` 与 `damageSystem.killEnemy`）：

- `killEnemy`（damageSystem.ts L16-21）：`if (enemy.bountyEncounterId !== undefined) { events.push(...notifyBountyMemberKilled(state, enemy)); /* 不 roll 任何掉落 */ } else { rollDropOnKill(...); }`。反伤致死路径走 `killEnemy`，天然计入。
- `moveEnemies` 突破分支（L122 起）：敌人进入 `breakthroughDist` 且带 `bountyEncounterId` → 在移除敌人后调用 `notifyBountyMemberBreached`（护盾吸收与否都算失败）。
- 撞嘲讽召唤物消散分支（L115-120）：成员被移除但**不算击杀也不算突破**——这会造成任务永远无法完成的软锁。处置：该分支中若是 Bounty 成员，按"计入完成进度"处理（调 `notifyBountyMemberKilled`，但不给击杀奖励，维持现分支语义）。

### 6. 波次与清场交互（关键守卫）

- `checkWaveClear`（waveSystem.ts L84-92）增加条件：存在 `status === 'spawning' || 'active'` 的 Encounter 时不判清场（防止分批生成间隙 `enemies.length === 0` 误判）。
- `jumpToWave` / `restartWave`（waveSystem.ts L104-127）：清场列表加入 `state.bountyOffers.length = 0`、清空未结算 `bountyEncounters`、重置 director 每波计数与 `checkTimer/cooldownRemaining`。
- `createInitialState` 全新初始化，`reset()` 天然覆盖。

---

## 七、索敌（`src/core/systems/combatSystem.ts` `findTarget`）

新优先级（并同步更新 `statusSystem.ts` 顶部注释与 `CONFLICT_RULES` 第 5 条）：

```text
1. 紧急威胁：与炮台距离 ≤ bounty.encounter.emergencyOverrideDistance 的最近敌人（任何敌人）
2. 活跃 Bounty 成员（enemy.bountyEncounterId 对应 encounter 状态为 spawning/active）中最近者
3. 烙印 brand 权重降序
4. 射程内最近
```

实现要点：所有候选仍须在射程内（保持现有 `dist > range` continue 的结构）；failed Encounter 的成员已被清除标记，自然失去优先级。`emergencyOverrideDistance` 必须走配置（可调参），不硬编码。

---

## 八、奖励结算与万能卡地面掉落

### GroundDrop 改判别联合（`src/core/types.ts`）

```ts
interface GroundDropBase { id: number; x: number; y: number; life: number; maxLife: number; pulse: number; }
export interface GroundCardDrop extends GroundDropBase { kind: 'card'; type: CardType; star: number; }
export interface GroundWildcardDrop extends GroundDropBase { kind: 'wildcard'; star: number; count: number; }
export type GroundDrop = GroundCardDrop | GroundWildcardDrop;
```

必须同步的既有代码（已核实的使用点）：

- `dropSystem.ts`：`spawnGroundDrop` 产 `kind: 'card'`；新增 `spawnWildcardDrop(state, x, y, star, count, lifetime)`。
- `collectDrop` / `collectNearest`：按 `kind` 分派。`kind === 'wildcard'` → 调 `grantWildcards(state, [{ star, count }])`（`src/core/systems/wildcardSystem.ts` L20-28），**不占手牌、手牌满也可拾取、不触发 `onPickup` 效果触发器**；`kind === 'card'` 走原逻辑。
- `tickDrops` 的丰收 expiryConvert 读 `drop.star`，两种 kind 都有 `star`，无需改。
- `src/telemetry/devTelemetry.ts` L104-107 `syncAdditions` 读 `drop.type` → 改为 `drop.kind === 'card' ? drop.type : 'wildcard'` 之类的安全取值。
- `src/render/drawDrops.ts`：card 分支保持现状；wildcard 分支新画法（见 §十）。
- `src/core/effects/registry.ts` 掉落原子调 `spawnGroundDrop`，签名不变即无需改。
- `game.ts` debug API `spawnGroundDrop` 透传，签名不变即无需改。

### 统一发奖（Encounter completed 时）

在 `lastKillX/Y` 附近以小扇形散开（避免重叠）生成：

- 指定类型卡牌 × `rewardCardCount`（类型/星级严格等于 Offer 展示值，用 `spawnGroundDrop` 的 `forcedType` + `star` 参数）
- 万能卡 × `wildcardCount`（`wildcardStar`）

全部掉落使用独立寿命 `reward.dropLifetimeSeconds`（生成后覆写 `life/maxLife`，参照旧 `rollBountyDrops` L55-57 的覆写手法），不受 `economy.defaults.dropLifetime` 与运行期加成影响。

---

## 九、输入（`src/input/pointerRouter.ts` + `src/game.ts`）

- pointerRouter：`bountyEnabled: boolean` 选项**删除**（当前它在创建时固化，运行时改配置不生效——这是要修的坑）。`onBountyTap` 改名 `onBountyOfferTap?: (x, y) => boolean`，L111 处保持"先 Offer 判定、未命中再 `onArenaTap` 拾取"的顺序，是否启用由回调内部判断。
- `game.ts`：

```ts
onBountyOfferTap: (x, y) => {
  if (!cfg.bounty.enabled) return false;
  const events = acceptBountyOfferAt(state, x, y);
  if (!events.length) return false;
  dispatch(events);
  if (import.meta.env.DEV) telemetry?.recordInput('bountyAccept');
  return true;
},
```

- `tests/pointerRouter.test.ts` 存在，改动选项后同步修测试。

---

## 十、渲染

新建 `src/render/drawBountyOffers.ts` 与 `src/render/drawBountyEffects.ts`。`canvasRenderer.ts`（L12-21）渲染顺序改为：

```text
drawArena → drawBountyOffers → drawZones → drawParticles → drawBullets
→ drawEnemies → drawBountyEffects → drawDrops → drawSummonsAndShield → drawTurret
```

**必须复用卡牌视觉注册表，禁止新建第二套颜色表**：`resolveCardVisual(cardType)`（`src/presentation/cardVisual.ts`）给 `accent/shape/glyph`；`shapeGeometry/glyphGeometry/traceGeometryToCanvas`（`src/presentation/skillGeometry.ts`）可直接把图标画上 Canvas（画法参照 `drawDrops.ts` L20-31）。

### Offer 标记（drawBountyOffers）

四层信息：奖励色（accent）、奖励 glyph、威胁语义（外围准星/向内尖角，表明这是会引入敌人的可点击对象）、外圈倒计时弧（`remaining / markWindowSeconds`，画法参照 `drawDrops.ts` L32-40）。`visual.showRewardName` 为真时标记下方小字显示卡名（`cardDisplayName`，`src/ui/cardMeta.ts` L29；若不愿让 render 依赖 ui 层，直接读 `texts.cards[type].name` 同样可行）+ `1★×1 + 万能×1` 简写。保底 Offer 可加细微差异（如双圈）。注意 `offerEdgeInset` 保证四角不被裁切。

### Bounty 敌人（drawEnemies 内改 + drawBountyEffects）

普通敌人现已统一灰色 `#8793a3`（`enemies.json`），赏金敌群是画面上唯一高饱和色对象：

- `drawEnemies.ts`：删除旧 L65-81 金圈逻辑；`e.bountyRewardType` 存在时主体填色改用 `resolveCardVisual(e.bountyRewardType).accent`（保留现有多边形边数逻辑，形状仍区分 fast/normal/tank，不以颜色为唯一识别手段）。
- `drawBountyEffects.ts`：成员外围脉冲光晕（`enemyGlowRadius/enemyPulseSpeed`）+ 头顶统一赏金准星小图标；Encounter 处于 `spawning` 时在对应屏幕边缘画入场警示线/光带。

---

## 十一、遥测（`src/telemetry/types.ts` + `devTelemetry.ts`）

`TelemetryEventType` 新增：`'bountyOffer' | 'bountyOfferExpired' | 'bountyAccepted' | 'bountyMemberSpawned' | 'bountyCompleted' | 'bountyFailed' | 'bountyRewardLanded' | 'bountyRewardPickup'`。

`TelemetryEvent` 增加可选字段：`offerId? encounterId? rewardCardType? rewardCardStar? wildcardStar? guaranteed? memberCount? decisionSeconds? clearSeconds? hpAtAccept? hpAtComplete?`。

接线走既有模式：core 产出 `GameEvent` → `game.ts dispatch` → `telemetry.recordGameEvents`（devTelemetry.ts L205-224 的 switch 中增加分支映射；`decisionSeconds = acceptedAt - offer.createdAt`、`clearSeconds` 从 `bountyCompleted` 事件取）。`bountyRewardLanded/Pickup` 可在 `syncAdditions`/`collected` 路径按 drop 来源标记，若难以区分来源，允许给 Bounty 生成的 drop 附带一个可选标记字段。

会话导出（`fullConfig`）已自动包含整个 `cfg`，新 `bounty` 域无需额外接线即进入导出 JSON。

---

## 十二、调参面板

### 分组与参数

- `src/ui/tunerSchema.ts`：`TunerGroup` 加 `'bounty'`；`tunerPanel.ts` `GROUPS` 加 `{ key: 'bounty', title: 'E · 精英 Bounty' }`。
- 新增 `BOUNTY_TUNER_PARAMS`（并入 `ALL_TUNER_PARAMS`），暴露 §五 中所有数值参数：offer 域 16 项、encounter 域 9 项（含 `emergencyOverrideDistance` 与三个 composition 权重）、reward 域 9 项、visual 域 4 项。路径形如 `bounty.offer.baseChancePerCheck`。
- **`src/config/base/tuner.json` 必须为每个新参数补 `{min,max,step}` 范围**——`controlHtml`（tunerPanel.ts L73-77）对缺范围的参数直接 throw。概率类 0–1 step 0.005；秒数类按现有同类参数风格。
- 全部即时生效（不加 `waveDeferred`），Director 每次检查现读 `cfg`。

### 布尔开关

`bounty.enabled` 不能用数值滑条。参照 `spawnMode` select 的实现模式（tunerPanel.ts L96、L269-279）做一个 checkbox：即时写 `cfg.bounty.enabled`；显式加入 `snapshot()`（L181-187）、Preset 加载（L347-372）、重置（L309-320）与 diff 高亮。关闭时：不再生成新 Offer，已存在的 Offer/Encounter 继续走完（不强杀，避免状态残留）。

### 实时状态

Bounty 分组顶部加只读状态块（参照 `spawnModeStatus` 的做法，但它只在 `syncInputs` 时更新——状态块需要 `setInterval` 250–500ms 主动刷新）。通过 `hooks.debug` 新增 `getBountyTelemetry()`（模式参照 `getSpawnTelemetry`，game.ts L277）返回并显示：

```text
当前有效概率 xx%（calculateOfferChance 实时值）· 距上次受伤 xx.xs · 本波报价 n/max
下一次检查 x.xs · 冷却 x.xs · 当前 Offer 奖励类型 · 当前敌群存活 a/b · 本波保底已触发: 是/否
```

---

## 十三、边界情况清单（实现时逐条自检）

1. 波清瞬间残留 Offer → 过期移除，不跨波。
2. Encounter 进行中玩家死亡（`gameEnd`）→ 无需特殊处理（mode 变更后不再 tick），但 `reset()` 后必须无残留（走 `createInitialState`）。
3. `jumpToWave`/`restartWave` → §六.6 的清理。
4. Boss 波允许出 Offer；敌群构成永不含 boss。
5. `maxConcurrentEncounters=1` 时，上一组未结算前 Director 不再生成 Offer（保底同样受此约束，顺延到满足条件时补发）。
6. 同一帧多个成员死亡 → `notifyBountyMemberKilled` 幂等（成员 id 不在 `memberIds` 中时直接返回空）。
7. `enabledFromWave` 与保底：`wave < enabledFromWave` 时保底也不触发。
8. RNG 只用注入的单流 `rng`（同 seed 确定性，测试依赖）。

---

## 十四、测试（vitest，参照 `tests/helpers.ts` 的 `freshState/seqRng/constRng/enemy` 工厂）

新增：

1. **`tests/bountyDirector.test.ts`**：第一波可出 Offer；按 `checkIntervalSeconds` 间隔检查而非每帧；无伤时长/高血量提升概率、刚受伤降低概率、始终被 min/max 夹住（直接单测 `calculateOfferChance`）；波次进度达阈值强制保底；每波不超过 `maxOffersPerWave`；冷却期不生成；同 seed 结果稳定；`enabled=false` 完全不生成。
2. **`tests/bountyEncounter.test.ts`**：接受后敌群数量/方向与 Offer 一致；不消耗 `spawnLeft`、不改 budget 配额；倍率正确；成员共享 encounterId；分批生成间隙不触发 `checkWaveClear`；最后一名成员解决才 completed；任一成员突破 → failed 且剩余成员退化；撞嘲讽召唤物计入完成进度；`jumpToWave/restartWave` 清理干净。
3. **`tests/bountyRewards.test.ts`**：成员死亡不走 `rollDropOnKill` 也不提前发奖；completed 后掉落的类型/星级/数量与 Offer 完全一致；万能卡地面掉落生成且寿命 = `dropLifetimeSeconds`；手牌满时万能卡仍可拾取（调 `grantWildcards`）、卡牌掉落仍受手牌约束；洗牌袋 `repeatProtection` 生效；failed 不发奖。
4. **索敌**：扩展 `tests/combatSystem.test.ts`——紧急半径内普通敌人 > Bounty 成员 > 烙印 > 最近；Bounty 成员在射程外不强行索敌；failed 后成员失去优先级；多成员取最近。
5. **渲染冒烟**：扩展 `tests/renderSmoke.test.ts`——四边 Offer、11 种奖励类型的标记与敌群、万能卡掉落、入场警示均不抛错。
6. **回归**：`pointerRouter.test.ts` 适配新选项名；`configLoader.test.ts` 若断言配置形状需加 `bounty` 域；其余现有测试必须全绿（普通敌人生成与掉落行为零变化）。

---

## 十五、实施顺序（每阶段结束 `npm test` + `npm run build` 全绿）

1. **模型与配置迁移**：`bounty.json`、`config/types.ts`、`loader.ts`、`core/types.ts`、`createInitialState.ts`；删除 `bountyPending`/`Enemy.bounty`/skills.json `mechanisms`/defs.ts 旧 `BountyConfig`；新增 GameEvent 与空实现的 `bountySystem.ts`。此阶段不追求可玩，旧机制下线、类型稳定即可。
2. **报价导演与边缘标记**：Director 动态概率 + 保底 + Offer 生命周期；`drawBountyOffers`；pointerRouter/game.ts 接线；`bountyDirector.test.ts`。
3. **独立敌群与索敌**：`createEnemy` 拆分、分批生成、`checkWaveClear` 守卫、突破失败/击杀完成结算、`findTarget` 重写；`bountyEncounter.test.ts` + 索敌测试。
4. **确定奖励与万能卡地面掉落**：GroundDrop 判别联合及全部使用点、统一发奖、拾取分派；`bountyRewards.test.ts`。至此规则闭环可玩。
5. **视觉强化**：`drawEnemies` 奖励色、`drawBountyEffects`、texts.json 文案、formatToast；渲染冒烟扩展。
6. **调参与遥测**：tunerSchema/tunerPanel/tuner.json、布尔开关、实时状态块、telemetry 事件全链路。

---

## 十六、最终验收清单

1. 第 1 波即可能出现 Offer；标记一眼可读奖励类型/星级/含万能卡。
2. 不接受无惩罚、无强化敌人；接受后从标记方向生成完整敌群，不占普通波次配额。
3. 赏金敌群用奖励色系 + 图标 + 光晕标识，形状仍可区分敌人类型（不依赖纯颜色）。
4. 炮台默认集火赏金敌群；进入紧急半径的敌人覆盖优先级。
5. 未清完整组不发奖；任一成员突破整组失败不发奖，余员退化。
6. 奖励 = Offer 展示的确定内容，不经过任何普通掉落概率池；万能卡可在手牌满时拾取。
7. 动态概率随无伤/高血量/近期受伤变化；每波最低报价次数有确定性保底。
8. 所有核心数值可在调参面板修改、进 Preset、进会话导出；`bounty.enabled` 开关可存取。
9. 遥测能回答"出现→接受→完成/失败→拾取"完整漏斗（含保底占比、决策时长、清除时长）。
10. 普通敌人的生成、索敌（无 Bounty 时）与掉落行为与改造前完全一致；全部既有测试通过。

---

## 十七、工程约束

- `core/` 内禁止 DOM/Canvas/浏览器 API（现有约定，types.ts 首行注释）。
- 不改 `economy.json` 的 `dropStarPolicy.bountyBossMax`（registry.ts 掉落原子仍在用）。
- 不动普通掉落概率池与 `rollDropOnKill`。
- `texts.json` 只做最小追加，保持原编码格式。
- 提交按上述 6 阶段拆分 commit，信息用中文，格式参照仓库既有风格。
