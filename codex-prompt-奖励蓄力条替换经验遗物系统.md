# Codex 实施 Prompt：奖励蓄力条替换经验/等级/遗物系统

## 角色与目标

你是本仓库的实施工程师。本次任务把「击杀得经验 → 升级 → 遗物三选一」整套系统**从主分支移除**，替换为一个**自动抽奖、自动执行、玩家只点一次确认**的奖励蓄力条。

**Git 结果也是需求的一部分**：先把开始施工时 `main` 的完整现状（包含经验/等级/遗物系统以及当前尚未提交的新版内容）固化为一个额外的本地归档分支；随后仍在**当前 `main` 分支**完成全部实现。归档分支只保存改动前快照，不在其上开发；**不得创建或切换到任何 `refactor/reward-meter*` 工作分支**。

**体验目标（唯一判据）**：简化游戏，提供更简单直接的正反馈。玩家在整个奖励流程中**不做任何选择**，确认按钮的语义是「我看到了，继续」，不是「是否接受」。

### 本次删除

- 角色等级（`state.level` / `xp` / `xpNeed`）
- 遗物系统（配置、状态、决策、UI、编辑器、设计工作台、xlsx 同步）
- `levelUp` / `relicOffered` / `relicSelected` 事件

### 本次保留（不要误删）

- **卡牌合成升星**、**卡牌分支进化**（`evolutionBranch`）、**卡间配方进化**（`recipePin` / `recipeEvolutionSystem`）
- **波末自动基础属性成长 + 波末五选一永久升级**（`waveRewardSystem.ts` / `waveRewards.json` / `waveBaseReward` 决策）—— 本次**不动**，只需把 `xpGainPct` 的落点改指向奖励条
- 神池决策（`godDraft` / `godFocus`）
- `upgradeFeedback.ts` 的卡牌升星庆祝横幅（只摘掉它对 `levelUp` 事件的依赖）
- `scripts/computeExperienceMetrics.ts` —— 这里的 "Experience" 指**游戏体验指标**（掉落节奏/操作密度/危险区），与经验值无关，**不得删除**

---

## 阶段 P0：先读这一节（我已核实的代码事实）

写代码前必须知道下面这些，否则会踩坑或漏改。

> **基准不得写死为某个旧 SHA。** 本 prompt 修订时，`main` 的已提交 HEAD 是 `571fab0`，但工作树已经有一轮新的、真实的内容/效果原子更新；施工基准必须是按 P1 把这些既有更新先固化后的 `BASE_COMMIT`。
> 下文的行号只是在 `571fab0` 上核实过的定位提示；实施时一律以当前 `main` 的符号、调用关系和 `rg` 结果为准，不得按旧行号机械修改。

### P0.0 v4 内容系统及随后一轮效果原子更新已经落地，先保护它们

`571fab0` 比当前陈旧的 `origin/main` 多 8 个提交，即「35 卡全字段重写 + 25 配方进化系统」那一批。此后当前工作树又新增了目标定位/效果原子能力（如 `at`、`forEach`、`scaleBy`、区域半径随时间、弹道线方向、`effectRuntime`、`designFingerprints.json` 及相应测试）。这些都属于**本任务开始前已经存在的 main 更新**，必须进入 P1 的基线快照并完整保留。

与本次任务相关的既有事实：

- `RunDecision` 的 `recipeEvolution` **已被 `recipePin` 取代**。按旧文档去找 `recipeEvolution` 会找不到。
- `state.completedRecipes` **已删除**，改为 `state.recipes.completedRecipeIds`（`RecipeRunState`）。
- `WavePhase` 新增 `'validationRewardSettle'`；`index.html` 里已有一个 `#validationSettleBtn`（「奖励结算 12s · 继续」）。
  **这是一个已存在的「确认继续」按钮。** 新的奖励回执弹窗必须与它互不遮挡、互不抢焦点。
  好消息：`validationRewardSettle` **不**硬暂停战斗（`updateGame` 的早退条件里没有它），所以它只是软覆盖层，不会和奖励回执的硬暂停打架 —— 但两者同时出现时的视觉层级要显式处理。
- `Card` 新增 `primaryGod` / `sourceGods` / `recipeLineage`。`types.ts` 里那句注释写着「不参与**遗物**或双神加成结算」—— 删遗物后这句注释要改词。
- 卡池已扩到 **60 张**（`tests/buildTags.test.ts` 断言 `toHaveLength(60)`），其中含 `recipeOnly` 配方产物卡。`calculateBuildProfile()`（P3.6）遍历 `synergyTags` 时必须把产物卡一并算进去。
- 经验/等级/遗物系统仍然存在；但 `dropSystem.ts`、`createInitialState.ts`、`types.ts`、效果解释器/注册表等文件已经被后一轮更新触及。修改这些重叠文件时必须做**语义级合并**，保留新原子、新状态与新测试，不得用 `571fab0` 的旧文件整段覆盖当前版本。
- `src/config/base/designFingerprints.json` 是当前技能校验器直接读取的设计指纹输入，刻意不属于可写配置域；新增 `rewardMeter` / `settlement` 域时不得误删它，也不得把它自动纳入 xlsx/编辑器写回。

### P0.1 经验有**两个**入口，不是一个

1. `src/core/systems/damageSystem.ts:30`（`killEnemy`）
   ```ts
   const xpGain = enemy.xp * cfg.progression.killXpMul * (1 + state.xpGainBonus) * getModifiers(state).xpMul;
   events.push(...addXp(state, xpGain, rng));
   ```
2. `src/core/systems/dropSystem.ts:122`（`tickDrops`）—— 丰收 5★「落穗」`expiryConvert` 把过期掉落折算经验：
   ```ts
   const EXPIRY_CONVERT_XP_PER_STAR = 4;                    // :19
   events.push(...addXp(state, drop.star * EXPIRY_CONVERT_XP_PER_STAR, rng));
   ```
   **这条极易漏掉。** 它必须同样迁移到 `addRewardPoints`，否则丰收流派的落穗词条会静默失效。

### P0.2 `addXp` 是累计阈值 + while 循环，会一帧内连开多个决策

`progressionSystem.ts:116-126`：`state.xp` 累计，`while` 循环跨越多个阈值。
现有测试 `tests/progressionSystem.test.ts:35-58` **专门断言**「一次给 40 点经验产生 3 个遗物决策并排队」。
新系统必须**反过来**：一次满条只产生**一个**待确认回执，溢出积分留着，确认后才检查下一次。

### P0.3 `buildModifierSystem.ts` 有天然干净的拆除路径 —— 不要整文件删

- `currentTotals(state)` 在 `state.buildState.scalingVersion === 0` 时**直接返回 `EMPTY_TOTALS`**。遗物是 `scalingVersion` 的唯一写入者。
- 所以：清空 `aggregateBuildScaling()` 的遗物循环 + 不再有人 `scalingVersion++` = 遗物缩放自动归零，**卡牌词条缩放与运行期修饰器一行不动**。
- `runtimeScalingFor()` + `RuntimeStatModifier { remaining }` **已经是一条完整的、带时限的、可作用于全部 `BUILD_SCALING_RULES` 轴的临时构筑强化通道**。

  → **「构筑共鸣」不需要任何新机制**，直接往 `state.statModifiers` 推带 `remaining` 的修饰器即可，`tickEffects` 已负责到期清理。

### P0.4 `state.buildState.affinity` 是**死字段**（既有 bug）

`settlement.ts:30` 和 `bountySystem.ts:110` 都**读**它，但全项目**没有任何写入点**。
后果：`runSummary.topLane` 恒为 `null`；bounty 的 lane 仲裁恒退化到第一个 lane。
本次新增的 `calculateBuildProfile()` 正好填这个坑 —— 但**处理方式见 P6.3，默认先不接线**，避免把 bounty 行为变更混进本次改动。

### P0.5 暂停与输入闸门共 4 处

| 位置 | 现有条件 |
|---|---|
| `updateGame.ts:17-22` | 早退条件现在有**四**项：`state.mode !== 'playing' \|\| state.paused \|\| state.decisions.current !== null \|\| state.decisions.pending.length > 0` |
| `game.ts:117-118` | `if (state.decisions.current) modals.showDecision(...) else modals.hideDecision()` |
| `game.ts:315` | `if (state.mode !== 'playing' \|\| state.intermission.active \|\| state.decisions.current) return;` |
| `recipeEvolutionSystem.ts:179` | `if (state.decisions.current \|\| state.decisions.pending.length) return 'decision';` |

四处全部需要覆盖「存在待确认奖励回执」（`state.rewardMeter.currentReceipt !== null`）。其中 `game.ts` 不是简单并排再开一个 modal，而要按 P6.2 实现“奖励回执优先、两个 modal 互斥”；其余三处把回执加入暂停/输入拒绝条件。

`game.ts:252` 另有 `refs.validationSettleBtn` 的点击接线，**不要**动它 —— 那是 P0.0 说的验证阶段结算按钮，与奖励回执是两个独立机制。

### P0.6 效果原子层的三个坑

1. `registry.ts:89 targets()` —— `ctx.enemy` 存在时**只打单体**。奖励执行**绝不能**设 `ctx.enemy`；半径走 `ctx.radius`，传一个大于场地对角线的值即为全屏。
2. `registry.ts:107 cappedDuration()` —— `ctx.consume ? Math.min(5, want) : want`。奖励执行**绝不能**设 `consume: true`，否则「构筑共鸣」12 秒会被砍成 5 秒。
3. `registry.ts:647 statBuff` 的 `sourceId = statBuff:${ctx.sourceCardId ?? ctx.sourceCardType ?? 'anonymous'}:...`。奖励必须使用**独立的 sourceId 前缀**（如 `reward:buildSurge:*`），否则会和卡牌 buff 抢同一个 `maxStacks` 槽位互相顶掉。

### P0.7 可直接复用的既有能力（不要重写战斗代码）

| 需求 | 现成函数 |
|---|---|
| 全场伤害 | `damageSystem.dealDamage()`；或 `burstDamage` 原子（`ctx.baseDamage * damageMul`，含 `retaliationNova` vfx） |
| 冻结 | `statusSystem.applyFreeze(e, duration, stacksToTrigger?)` |
| 易伤 | `statusSystem.applyVulnerable(e, ratio, duration, maxStacks)` |
| Boss 控制预算 | `statusSystem.controlBudgetDenies(state, e)` —— 全场控制**必须**先过这一关 |
| 治疗 | `restore` 原子逻辑：`state.hp = Math.min(state.maxHp, state.hp + amount + state.maxHp * amountRatio)` |
| 护盾 | `restore` 原子**不含护盾**；护盾走 `state.shield`（`ShieldState`），参考 `shield` 原子 |
| 万能卡 | `wildcardSystem.grantWildcards(state, grants)` |
| 血上限对账 | `stats.reconcileMaxHp(state)` |
| 临时属性 | `state.statModifiers.push({ sourceId, stat, operation, value, remaining })` |

### P0.8 黄金回放会**必然**漂移

- `replay/record.ts:147-154 choiceFor()` 的 switch 含 `relic`
- `record.ts:274` `for (let guard = 0; state.decisions.current && guard < 16; guard++)`
- `record.ts:314` `xp: state.xp, level: state.level`
- `record.ts:319` `relics: [...state.buildState.relicHistory]`
- `tests/golden/*.summary.json` 五份都含 `counters.xp` / `counters.level` / `relics[]`
  （注意：这些 summary 已被 v4 内容那批提交重录过一次，请以本地 `main` 上的当前值为对照基线，不要参照更早版本的数字）

回放循环必须**同时**能自动确认奖励回执，否则录制会卡死在 `currentReceipt` 上。

---

## 阶段 P1：先固化当前 main，再建立只读归档分支（先做，不写奖励系统代码）

### P1.0 最终分支拓扑（硬约束）

本任务需要得到下面的结果：

```
BASE_COMMIT ── reward-meter 实现提交… ── main（最终停留/开发分支）
     └── archive/pre-reward-meter-v4      （固定不动，保留旧经验/等级/遗物系统）
```

1. **开发始终发生在当前本地 `main`。** 不创建、不切换到 `refactor/reward-meter-v4` 或任何其他工作分支。
2. `archive/pre-reward-meter-v4` 是本次新增的本地归档分支，只指向施工前 `BASE_COMMIT`，创建后不得前移、不得在其上提交。
3. 本 prompt 修订时，已提交 HEAD 为 `571fab0`，但工作树不是纯 CRLF：至少 19 个文件存在约 2400 行真实更新，并有 `designFingerprints.json`、目标定位原语测试等未跟踪项目文件。**这些是当前 main 的既有更新，不得丢弃、覆盖或塞进 stash。**
4. 绝对禁止对现有工作树使用 `git checkout -- .`、`git restore .`、`git reset --hard`、`git clean`；禁止创建、应用或删除 stash（只允许 `git stash list` 做只读核对）。也不要用 `git add -A` 把 prompt、日志、构建产物一锅端进提交。
5. 本地 `main` 与陈旧的 `origin/main` 已分叉。不要 `pull`、`merge origin/main`、`rebase origin/main`；本次不做任何 `push`。
6. 既有 `archive/pre-reward-meter-2026-07-30`、`origin/refactor/reward-meter` 与 `stash@{0}` 全部保持原样；不要删除、改指、pop、drop、clear 或 force-push。

### P1.1 审计并固化“更新后的当前 main”

先只读检查（PowerShell）：

```powershell
git branch --show-current                 # 必须是 main；若不是，停下报告，不要带着脏工作树自动切分支
git status --short --branch
git diff --shortstat HEAD
git diff --ignore-all-space --shortstat HEAD
git diff --ignore-all-space --name-status HEAD
git diff --cached --stat
git stash list                            # 记录现状；不得操作
$PRE_TASK_HEAD = git rev-parse main
```

若工作树干净，直接以当前 `main` HEAD 作为 `BASE_COMMIT`。

若工作树存在本任务开始前的真实更新，则先把它们完成为一个**独立的基线提交**，再开始奖励系统改造：

- 逐个审阅现有 diff 与未跟踪文件；它们属于此前的“全卡正式实装/目标定位与效果原子”更新，不是本奖励系统改动。
- 当前已知应纳入基线的项目内容包括：目标定位/效果原子代码与测试、`src/config/base/designFingerprints.json`、相关生成器和设计规格。保留 `at` / `forEach` / `scaleBy` / `radiusOverTime` / `lineFrom` / `effectRuntime` 等能力。
- 本奖励 prompt、本地日志、`dist`、缓存和明显临时文件不得混入基线提交。其他无法判断归属的未跟踪文件先不提交，并在最终报告列明。
- 先运行 `npm run validate`、`npm run test`、`npm run build`，确保这轮既有更新自身可作为可归因基线；若失败，先判断是否属于既有更新，无法确认时停下报告，不要用奖励系统改动掩盖基线失败。
- 只用显式路径 `git add -- <paths...>` 暂存已审阅内容；检查 `git diff --cached --stat` 与 `git diff --cached` 后，提交为单独 checkpoint，例如：

```powershell
git commit -m "chore: checkpoint current main before reward meter refactor"
```

若 checkpoint 后仍有 tracked 修改，只能对**逐文件验证为纯空白/行尾差异**的文件做定点清理：

```powershell
git diff --ignore-all-space --quiet -- <单个文件>
if ($LASTEXITCODE -eq 0) { git restore --worktree -- <同一个文件> } else { throw "存在实质改动，禁止清理" }
```

禁止把这段改回对整个仓库的批量恢复。允许无关 prompt/说明文件继续保持未跟踪；后续提交也不要带入它们。

完成后记录动态基准：

```powershell
$BASE_COMMIT = git rev-parse main
git show --no-patch --oneline $BASE_COMMIT
```

`BASE_COMMIT` 可能是新 checkpoint，不要求仍等于 `571fab0`。最终报告必须写完整 SHA。

### P1.2 从 BASE_COMMIT 创建归档，但继续留在 main

```powershell
$ARCHIVE_BRANCH = 'archive/pre-reward-meter-v4'
$BASE_COMMIT = git rev-parse main          # shell 会话可能已更换，重新赋值
git show-ref --verify --quiet "refs/heads/$ARCHIVE_BRANCH"
if ($LASTEXITCODE -eq 0) { throw "$ARCHIVE_BRANCH 已存在；停止并报告，禁止覆盖" }

git branch $ARCHIVE_BRANCH $BASE_COMMIT

git rev-parse main
git rev-parse $ARCHIVE_BRANCH             # 两者此刻必须都等于 BASE_COMMIT
git branch --show-current                  # 必须仍为 main
git cat-file -e "${ARCHIVE_BRANCH}:src/core/systems/progressionSystem.ts"
git grep -n "relicOffered\|relicSelected\|xpNeed" $ARCHIVE_BRANCH -- src
git stash list                             # 原 stash 必须仍在
```

这里**只创建分支指针，不执行 `git switch`**。从下一阶段起，所有奖励系统改动与提交都直接落在 `main`；归档分支保持冻结。

### P1.3 完工交付方式

完工后**停在 `main`，不 push、不合并、不切到归档分支**，并输出：

提交报告前，把本任务所有已审阅的代码、配置、测试与黄金回放变更提交到 `main`；`git status --short` 不得再有本任务的 tracked 修改，只允许 P1 明确排除的既有未跟踪文件。

- `BASE_COMMIT`、`archive/pre-reward-meter-v4` 的最终 SHA，以及 `git branch --show-current`
- `git log --oneline "$BASE_COMMIT..main"` 的本次提交列表
- `git diff --stat "$BASE_COMMIT..main"` 摘要
- `git diff --check "$BASE_COMMIT..main"` 结果，并说明是否存在行尾噪音
- 黄金回放每一处漂移的解释（见 P7.2）
- P6.3 与 P7.4 两处「刻意未做」的遗留项
- 证明归档分支仍等于 `BASE_COMMIT`，且旧经验/等级/遗物文件可从该分支读取

---

## 阶段 P2：配置契约

### P2.1 拆分 `progression.json`

现有 `src/config/base/progression.json` 混装了两类完全无关的东西：经验/遗物调度 + **对局结算计分**。直接删整个文件会连带删掉结算分数。

拆成两个文件：

**`src/config/base/settlement.json`**（原样搬运 `progression.settlement`）
```json
{
  "version": "0.1.0",
  "winBonus": 500,
  "perWaveCleared": 40,
  "perKill": 2,
  "hpRatioBonusMax": 200,
  "perEquippedStarSquared": 10,
  "wildcardStarValue": { "1": 15, "2": 40, "3": 100, "4": 250, "5": 600 }
}
```

**`src/config/base/rewardMeter.json`**
```json
{
  "version": "0.1.0",
  "pointMul": 1,
  "expiryConvertPointsPerStar": 4,
  "thresholds": [10, 12, 16, 24, 33, 45, 60, 80],
  "afterSchedule": "repeatLast",
  "rewardKillsGrantPoints": false,
  "preventImmediateRepeat": true,
  "lowHpWeightBoost": { "hpRatioBelow": 0.4, "rewardId": "clarityReflux", "weightMul": 3 },
  "rewards": [
    {
      "id": "heartbreakNova",
      "textKey": "rewards.heartbreakNova",
      "weight": 1,
      "action": { "kind": "globalDamage", "damageMul": 8, "bossMaxHpRatioCap": 0.1 }
    },
    {
      "id": "absoluteStillness",
      "textKey": "rewards.absoluteStillness",
      "weight": 1,
      "action": { "kind": "globalControl", "freezeSeconds": 2.5, "vulnerableRatio": 0.3, "vulnerableSeconds": 5 }
    },
    {
      "id": "clarityReflux",
      "textKey": "rewards.clarityReflux",
      "weight": 1,
      "action": { "kind": "restoreAndShield", "healRatio": 0.25, "shieldHits": 1 }
    },
    {
      "id": "wildHeart",
      "textKey": "rewards.wildHeart",
      "weight": 1,
      "action": { "kind": "grantWildcards", "count": 1, "starSchedule": [1, 1, 2, 2, 3, 3, 4, 5] }
    },
    {
      "id": "buildResonance",
      "textKey": "rewards.buildResonance",
      "weight": 1,
      "action": { "kind": "buildSurge", "duration": 12, "value": 0.25 }
    }
  ]
}
```

**阈值换算说明**：原累计阈值 `[10,22,38,62,95,140,200,280]` 目标一局 5–8 件遗物。上表是它的**逐段差值**，即每次重新蓄力所需积分。首版**刻意保持原触发节奏不变**，让本次只验证「体验形式变化」这一个变量。试玩后再单独调频率。

### P2.2 类型（`src/config/types.ts`）

删除：`RelicDef` / `RelicsConfig` / `ProgressionConfig`；`GameConfig` 删 `relics` 与 `progression`。
新增：`RewardMeterConfig` / `RewardDef` / `RewardAction` / `SettlementConfig`；`GameConfig` 加 `rewardMeter` 与 `settlement`。

```ts
export type RewardAction =
  | { kind: 'globalDamage'; damageMul: number; bossMaxHpRatioCap: number }
  | { kind: 'globalControl'; freezeSeconds: number; vulnerableRatio: number; vulnerableSeconds: number }
  | { kind: 'restoreAndShield'; healRatio: number; shieldHits: number }
  | { kind: 'grantWildcards'; count: number; starSchedule: number[] }
  | { kind: 'buildSurge'; duration: number; value: number };
```

`BuildScalingAxis` **保留**（卡牌词条仍在用），只是不再有遗物往里写。
`WaveChoiceStatKind` 保留 `'xpGainPct'` 这个**配置键名不变**（避免波末奖励配置/文案/tuner 连锁改动），但落点改指奖励条 —— 见 P5.2。

### P2.3 `src/config/index.ts`

导出名单删 `RelicDef` / `RelicsConfig`，加 `RewardDef` / `RewardMeterConfig` / `RewardAction` / `SettlementConfig`。

### P2.4 `src/config/loader.ts`

- `optionalBaseModules` 的 glob `'./base/{gods,relics,evolutionRecipes,waveRewards}.json'` → 去掉 `relics`
- `optionalBaseConfig` 的泛型键联合去掉 `'relics'`
- 顶层 `import progression from './base/progression.json'` → 换成 `rewardMeter` + `settlement` 两个 import
- `assembleBase()` 与 `buildConfig()` 里的 `validateProgressionConfig(...)` → `validateRewardMeterConfig(...)` + `validateSettlementConfig(...)`
- `structuredClone({...})` 的域清单同步
- 保留当前 `skillValidator.ts` 对 `base/designFingerprints.json` 的直接读取方式；该文件不是 `GameConfig` 顶层域，也不加入 `optionalBaseModules` / `WRITABLE_DOMAINS`

### P2.5 校验器

- 删 `src/config/progressionValidator.ts`
- 新增 `src/config/rewardMeterValidator.ts`：
  - `thresholds` 非空、全为正数、**允许非递增**（它是逐段差值不是累计值）
  - `rewards` 非空、id 唯一、`weight >= 0` 且总和 > 0
  - `textKey === 'rewards.' + id`
  - `action.kind` 在五种之内，各自参数范围合法
  - `lowHpWeightBoost.rewardId` 必须命中 `rewards[].id`
  - `afterSchedule` ∈ `'repeatLast' | 'stop'`
- 新增 `src/config/settlementValidator.ts`（把原 `progressionValidator` 里 settlement 那段搬过来）
- `src/config/godValidator.ts`：删 `RELIC_RARITIES`（:7）、函数签名 `Pick<GameConfig, ...>` 里的 `'relics'`（:42）、整个遗物交叉校验段（**:286-331**，它是该函数的最后一段；保留 :332 的函数收尾 `}`）。删完后检查 `versionedArray` 等辅助函数是否还有其它调用者，无人使用则一并删除以免 `tsc --noEmit` 报未使用
- `src/config/validateAll.ts`：`ValidationDomain` 删 `'relics'` / `'progression'`，加 `'rewardMeter'` / `'settlement'`；删 `:40` 的 `relics?` 文案类型、`:115-116` 的 id 唯一性块、`:171-196` 的 textKey/孤儿文案块；`:90` 换成新校验器；`:96` 的 check 名去掉 relics
- `validateAll.ts` 不能只删旧引用：`TextsLike` 增加 `rewards?: Record<string, { name?: string; desc?: string }>`；把 `rewardMeter.rewards` 纳入命名空间内 id 唯一检查；逐条验证 `textKey === rewards.<id>` 且 `name` / `desc` 非空，并报告 `texts.rewards` 的孤儿项
- `src/config/pipeline.ts`：`WRITABLE_DOMAINS` 删 `relics` / `progression`，加 `rewardMeter` / `settlement`

### P2.6 调参面板

- `src/config/base/tuner.json:590` `progression.killXpMul` → `rewardMeter.pointMul`（labelKey 同步）
- `:600` `progression.relicChoices` → **删除**；首版不要顺手发明 `thresholdMul`，直接把 `tests/tunerV2.test.ts` 的 `progression` 组数量从 2 改成 1，并把 roundtrip 路径改为仅覆盖 `rewardMeter.pointMul`
- `economy.normalDropTypePolicy.godAffinity.scorePerStack` / `scoreCap` 两条 tuner 项随遗物神倾向一起删除；同步删除 `texts.json` 的两个 label，并调整 `tests/tunerV2.test.ts` 中 `drops` 组数量断言
- `TunerGroup` 的 `'progression'` **组 id 保持不变**（只是个 id），只改它的中文标签文案。改组 id 会连锁 `TUNER_GROUP_ORDER` + texts + 测试，不值得
- `src/ui/tunerSchema.ts:52 migratePresetValues()` 增加迁移：
  ```ts
  if (migrated['rewardMeter.pointMul'] === undefined && migrated['progression.killXpMul'] !== undefined) {
    migrated['rewardMeter.pointMul'] = migrated['progression.killXpMul'];
  }
  delete migrated['progression.killXpMul'];
  delete migrated['progression.relicChoices'];
  ```
  （`presets/` 下有 4 个 tuner preset 含旧路径）

---

## 阶段 P3：新奖励条系统（先建立新路径，再按可编译切片迁移旧路径）

当前 main 已有一轮新的效果原子/目标定位实现。新奖励系统与它共享 `types.ts`、`createInitialState.ts`、`registry.ts`、`runtime.ts`、`dropSystem.ts` 等文件时，必须在当前内容上增量编辑；不得回退 `at` / `forEach` / `scaleBy` / `radiusOverTime` / `lineFrom` / `effectRuntime`，现有 `targetingPrimitives`、原子契约和配置管线测试必须持续通过。

“先建立新路径”是依赖顺序，不代表删掉 `GameState` 旧字段后旧 `progressionSystem` 还能继续编译。请用小步提交保证每一步类型闭合：先加新配置/类型/系统与测试，再一次性切换调用者并删除旧类型/旧实现，随后清理 UI/工具链引用。

### P3.1 状态（`src/core/types.ts`）

`GameState` 删：`xp` / `xpNeed` / `level` / `relicStacks` / `xpGainBonus`
`BuildState` 删：`godAffinity` / `relicHistory` / `scalingVersion` / `dropPity`（`affinity` 字段**保留**，见 P0.4 / P6.3）

新增：
```ts
export interface RewardExecutionResult {
  damageDealt?: number;
  enemiesKilled?: number;
  healingGranted?: number;
  shieldHitsGranted?: number;
  frozenCount?: number;
  wildcardGrants?: Array<{ star: number; count: number }>;
  surgeTag?: BuildTag;
  surgeDuration?: number;
}

export interface RewardReceipt {
  rewardId: string;
  activationIndex: number;
  result: RewardExecutionResult;
}

export interface RewardMeterState {
  points: number;
  thresholdIndex: number;
  threshold: number;
  currentReceipt: RewardReceipt | null;
  lastRewardId: string | null;
  activationCount: number;
  pointGainBonus: number;
  /** 重入护栏：> 0 时击杀不充能。见 P4.2。 */
  suppressDepth: number;
}
```

`GameState` 加 `rewardMeter: RewardMeterState;`

`RunDecision` 删 `{ kind: 'relic'; ... }`（`waveBaseReward` **保留**）。
`decisionQueueSystem.ts:23 validChoices()` 的 switch 同步删 `relic` 分支。

`GameEvent` 删 `levelUp` / `relicOffered` / `relicSelected`，加：
```ts
| { type: 'rewardPointsGained'; amount: number; total: number }
| { type: 'rewardTriggered'; rewardId: string; activationIndex: number; result: RewardExecutionResult }
| { type: 'rewardConfirmed'; rewardId: string }
```

`createInitialState.ts:132-143` 同步：删 5 个旧字段与 4 个 buildState 字段，加 `rewardMeter` 初值（`threshold = cfg.rewardMeter.thresholds[0]`）。

`types.ts` 里 `Card.primaryGod` / `sourceGods` 上方那句注释「不参与**遗物**或双神加成结算」需改词（遗物已不存在）。

### P3.2 **不要**把奖励确认伪装成 `RunDecision`

`decisionQueueSystem` 的语义是「从多个合法候选中选一个」。自动抽奖的结果只有一个选项，它不是决策。
**不要**加 `{ kind: 'reward'; options: [唯一结果] }`。
正确做法：单独走 `state.rewardMeter.currentReceipt`，暂停条件变成
```ts
state.decisions.current !== null || state.rewardMeter.currentReceipt !== null
```
这样神池/进化仍走决策队列，自动奖励走奖励条，两个概念不混。

### P3.3 `src/core/systems/rewardMeterSystem.ts`

```ts
export function addRewardPoints(state, config, rng, amount): GameEvent[];
export function confirmRewardReceipt(state, config, rng): GameEvent[];
export function hasPendingReward(state): boolean;
```

`addRewardPoints` 事务顺序（**严格照此实现**）：

1. 若 `state.rewardMeter.suppressDepth > 0` → 直接 return `[]`
2. `points += amount * cfg.rewardMeter.pointMul * (1 + pointGainBonus)`
3. 若已有 `currentReceipt` → 只累加，return（**溢出积分保留，不产生第二个回执**）
4. 若 `points < threshold` → return
5. `points -= threshold`；先令 `activationIndex = activationCount`，再 `activationCount++`。**`activationIndex` 明确定义为从 0 开始**，确保第一次万能卡奖励读取 `starSchedule[0]`
6. 推进 `thresholdIndex` 与 `threshold`（超出表尾按 `afterSchedule` 处理：`repeatLast` 重复最后一项 80）；`pickReward()` 抽取，并把抽中 id 写入 `lastRewardId`
7. **立即执行** `executeReward()`，全程包在 `suppressDepth` 护栏内
8. 写入 `currentReceipt`，发 `rewardTriggered`
9. **return** —— 即使 `points` 仍 ≥ 新 `threshold` 也**不再**继续循环

`confirmRewardReceipt`：清空 `currentReceipt` → 发 `rewardConfirmed` → **然后**才重新检查是否又满条（此时可以再触发一次，形成「确认 → 再确认」的链，但永远一次只有一个回执）。

### P3.4 `src/core/systems/rewardSelectionSystem.ts`

```ts
export function pickReward(state, config, rng): RewardDef;
```
- 基础权重来自配置
- `preventImmediateRepeat` 为 true 时排除 `lastRewardId`；若排除后候选为空，或剩余候选的有效权重总和为 0，则回退到完整候选集允许重复（配置允许单项 `weight = 0`，不能只判断数组非空）
- `hp / maxHp < lowHpWeightBoost.hpRatioBelow` 时把指定奖励权重 × `weightMul`
- 全程只用注入的 `rng`，保证同 seed 可复现
- **首版不做**：品质分级、叠层上限、永久历史、掉落导流。这些是原遗物系统复杂度的来源，一律不要复活。

### P3.5 `src/core/systems/rewardExecutionSystem.ts`

```ts
export function executeReward(state, config, rng, reward): { events: GameEvent[]; result: RewardExecutionResult };
```

五种 action 的实现要点：

- **globalDamage**：遍历 `state.enemies` 快照（先 `[...state.enemies]`，因为 `dealDamage` 会 splice）。基准伤害 = 炮台总伤（同 `ctx.baseDamage` 口径）× `damageMul`。Boss（`spawnKind === 'waveBoss'` 或 `type === 'boss'`）单次伤害上限 = `enemy.maxHp * bossMaxHpRatioCap`。累计 `damageDealt`，用击杀前后 `state.kills` 差值算 `enemiesKilled`。补 `retaliationNova` vfx + 粒子。
- **globalControl**：遍历全场，**先过 `controlBudgetDenies(state, e)`**，通过者 `applyFreeze` + `applyVulnerable`。统计 `frozenCount`。
- **restoreAndShield**：`state.hp = Math.min(state.maxHp, state.hp + state.maxHp * healRatio)`，记录实际回复量（不是名义量）；护盾按 `shield` 原子的既有仲裁规则（容量取最大）加 `shieldHits`。
- **grantWildcards**：`activationIndex` 为从 0 开始的触发序号；星级按 `starSchedule[Math.min(activationIndex, len-1)]`，调 `grantWildcards(state, grants)`。
- **buildSurge**：调 `calculateBuildProfile(state)` 取主方向 tag，按下表推 `RuntimeStatModifier`，`sourceId` 前缀固定为 `reward:buildSurge`，`remaining = duration`。

  | 主方向 | 写入的轴 |
  |---|---|
  | `projectile` | `effectDamageMul` + `quantityAdd`（整数轴按 `scaleNumber` 的 `integer` 规则自然生效） |
  | `control` | `controlPotencyMul` + `controlledDamageTakenMul` |
  | `domain` | `areaScaleMul` + `dotDamageMul` |
  | `defense` | `defenseDurabilityMul` + `retaliationMul` |
  | `utility` | `dropRateMul` + `dropLifetimeMul` |

  （轴名以 `src/config/affixSinks.ts` 的 `AFFIX_SINKS` 实际键为准，不要凭空造轴。）每个 modifier 的 `operation` 取 `AFFIX_SINKS[axis].operation`；本表当前各轴均为 `mul`，因此配置中的增幅 `value: 0.25` 写入 modifier 时应表示为乘数 `1.25`，不能把 `0.25` 当乘数导致属性缩到四分之一。`sourceId` 使用 `reward:buildSurge:<activationIndex>:<axis>`，保证与卡牌/词条来源隔离且便于到期审计。

**执行器不得设 `consume: true`，不得设 `ctx.enemy`。** 见 P0.6。

### P3.6 `src/core/systems/buildProfileSystem.ts`

```ts
export function calculateBuildProfile(state: GameState): Record<BuildTag, number>;
export function dominantBuildTag(state: GameState): BuildTag;
```

**不要**用 `relic godAffinity` —— 那正是本次要删的东西。改为根据玩家**实际持有与投入**计算：

```
装备卡星级        × 3
+ 手牌卡星级      × 1
+ 本局该卡型合成次数 × 0.5      // 来自 normalDropDirector.typeStats
```
按每张卡的 `def.synergyTags` 把分数摊到 `projectile / control / domain / defense / utility` 五个桶。
并列时按固定顺序取第一个，保证确定性。全空时返回 `'projectile'`。

### P3.7 事件文案（`src/data/texts.json`）

该文件被 v4 内容那批提交大改过，但**下列键均已核实仍然存在且形状不变**：
`relics`（22 条）、`levelup = { benefits }`、`decisions.relic = { title, body }`、`toast.perkApplied = "{title} 已生效"`、`waveRewardStats.xpGainPct = "经验取得"`；顶层**尚无** `rewards` 键。

- 删 `relics`（22 条）与 `levelup`
- `decisions` 删 `relic` 项
- `toast` 删 `perkApplied`
- `waveRewardStats.xpGainPct` 文案 `"经验取得"` → `"奖励积分取得"`
- 内部暂时保留 `xpMul` / `Enemy.xp` 标识符，但所有玩家或设计工具可见文案都改成“奖励积分/积分倍率”，不得继续显示“经验获取”
- 新增 `rewards` 段，5 条，每条 `{ name, desc }`：

  | id | 建议名 | desc 方向 |
  |---|---|---|
  | `heartbreakNova` | 心防震爆 | 对全场造成一次高额伤害 |
  | `absoluteStillness` | 绝对静止 | 全场冻结并短暂易伤 |
  | `clarityReflux` | 清醒回流 | 恢复心防并获得突破吸收 |
  | `wildHeart` | 万能心意 | 直接获得一张万能卡 |
  | `buildResonance` | 构筑共鸣 | 短时强化你当前的构筑方向 |

- 新增 `rewardReceipt` 段：标题、确认按钮文案、各类结果的格式串（`"造成 {damage} 伤害 · 消灭 {kills} 名敌人"` 等）

### P3.8 单元测试（**在核心迁移切片中同步写完，不要等删完再补**）

新增 `tests/rewardMeterSystem.test.ts`：
- 未满条不触发
- 恰好满条触发一次
- 超额积分正确保留在 `points` 上
- **一次给 100000 积分只产生 1 个回执**（对照旧行为的反向断言）
- 有回执时继续加分不产生第二个回执
- 确认后才检查下一次满条
- 阈值表耗尽后按 `repeatLast` 重复 80

新增 `tests/rewardSelection.test.ts`：
- 固定 seed 可复现
- 不连续抽中同一奖励
- 排除上次奖励后其余候选总权重为 0 时能安全回退，不产生 `undefined`
- 低血量时 `clarityReflux` 权重提升
- 无玩家选择步骤（`resolveCurrentDecision` 对回执无效）

新增 `tests/rewardExecution.test.ts`：
- 全场伤害命中所有敌人
- Boss 伤害遵守 `bossMaxHpRatioCap`
- **奖励击杀不产生奖励积分**（核心回归）
- 全场控制遵守 `controlBudgetDenies`
- 治疗不超过 `maxHp`
- 万能卡星级遵守 `starSchedule` 与上限
- `buildSurge` 选中正确主方向；到期后 `statModifiers` 完全清空；**不修改原始配置对象**；不形成永久堆叠

---

## 阶段 P4：接管击杀积分

### P4.1 两个入口切换

- `damageSystem.ts:30-31`：
  ```ts
  const points = enemy.xp * getModifiers(state).xpMul;   // xpMul 原子保留，语义改为"奖励积分倍率"
  events.push(...addRewardPoints(state, config, rng, points));
  ```
  （`cfg.progression.killXpMul` → `cfg.rewardMeter.pointMul`，已在 `addRewardPoints` 内部乘；`state.xpGainBonus` → `state.rewardMeter.pointGainBonus`，同样在内部乘。不要在调用点重复乘。）
- `dropSystem.ts:122`：`addXp(...)` → `addRewardPoints(state, config, rng, drop.star * cfg.rewardMeter.expiryConvertPointsPerStar)`；删掉模块内的 `EXPIRY_CONVERT_XP_PER_STAR` 常量改读配置。

### P4.2 防止奖励击杀无限充能（**必须**）

若「心防震爆」清屏，这些击杀又给奖励条充能，会形成
`满条 → 清屏 → 再满条 → 再清屏` 的死循环。

**实现方式**：在 `rewardMeterSystem` 导出一个重入护栏，**不要**去改 `dealDamage` / `killEnemy` 的签名（`dealDamage` 在 `registry.ts` 里有约 20 个调用点，穿参数代价过大）：

```ts
export function withRewardPointsSuppressed<T>(state: GameState, fn: () => T): T {
  state.rewardMeter.suppressDepth++;
  try { return fn(); } finally { state.rewardMeter.suppressDepth--; }
}
```

`executeReward()` 全程包在这个护栏里。`addRewardPoints` 第一步就检查 `suppressDepth`。

**首版约束（写进 `rewardExecutionSystem.ts` 顶部注释）**：五种奖励全部是**同步一次性结算**，没有 DOT、召唤物或延迟区域，因此同步护栏是完备的。
**将来**若新增持续型奖励，必须改为把来源标记挂到 attack / zone / summon 实体上，护栏不再够用。

### P4.3 删除 `progressionSystem` 的运行时入口

删 `addXp` / `levelUp` 的调用。此阶段结束后应满足：
- 不再产生任何遗物决策
- 一次巨量积分只产生一个当前回执
- `npm run test` 除了预期失败的旧测试外全绿

---

## 阶段 P5：删除遗物

### P5.1 删除文件

```
src/core/systems/progressionSystem.ts
src/config/base/relics.json
src/config/base/progression.json          # 已拆为 settlement.json + rewardMeter.json
src/config/progressionValidator.ts
src/ui/relicMeta.ts
src/design/relicView.ts                   # 43 行
src/editor/relicsEditor.ts                # 191 行
tests/progressionSystem.test.ts           # 由 P3.8 的新测试替代
```

### P5.2 逐文件修改清单

| 文件 | 改动 |
|---|---|
| `src/core/systems/buildModifierSystem.ts` | 删 `aggregateBuildScaling()` 的遗物循环（改为直接返回空 totals，或整体删除该函数并让 `currentTotals` 恒返回 `EMPTY_TOTALS`）；删 `controlledDamageTakenBonus()` 里的 `relic` 项。**保留**：`BUILD_SCALING_RULES`、`scaleEffects`、`cardAffixScaling`、`runtimeScalingFor`、`applyBuildScalingToBindings`、`applyBuildScalingToTier` |
| `src/core/systems/dropTypePolicy.ts` | 删 `calculateAffinityScore()`（定义在 :57，**调用点有两处**：:174 与 :208 的 `hasAffinity`）；删 `applyGodPity()`（:242-268，**调用点有两处**：:271 与 :348）；`src/config/base/economy.json:75` 的 `normalDropTypePolicy.godAffinity` 块同步删除 |
| `src/core/settlement.ts` | 删 `RelicDef` import、`RunSummary.relics` 字段、rarity 统计循环与返回值里的 `relics`；把 `cfg.progression.settlement` 改为 `cfg.settlement`。**保留** `completedRecipes: [...state.recipes.completedRecipeIds]`；相应更新 `settlement.test.ts` 与所有 `RunSummary` 消费者 |
| `src/core/systems/decisionQueueSystem.ts:23` | `validChoices()` switch 删 `relic`；删后 options 组只剩 `evolutionBranch`（`recipePin` 在 candidates 组，不要动） |
| `src/core/updateGame.ts:17-22` | 现有**四**项早退条件加第五项 `state.rewardMeter.currentReceipt !== null` |
| `src/core/replay/record.ts` | `choiceFor()` 删 `relic`；`ReplaySummary` 的 `xp/level` → `rewardPoints/rewardActivations`，`relics: string[]` → `rewards: string[]`（按 activation 顺序记 rewardId）；主循环先用最多 16 次的 guard 自动确认奖励回执，再处理普通决策 guard，使 headless 顺序与 UI 的“回执优先”一致，否则录制会卡死或与玩家路径不同 |
| `src/telemetry/types.ts` / `src/telemetry/devTelemetry.ts` | 删除 `relic_offered` / `relic_selected` 类型、字段与事件记录；新增 `reward_triggered` / `reward_confirmed`（至少记录 `rewardId`、`activationIndex` 与可序列化结果摘要）。删除读取 `buildState.godAffinity` 的 `affinityMatch()` 及两个展开调用，不要擅自把它改接 `buildState.affinity` 或改变 bounty 行为 |
| `src/core/systems/waveRewardSystem.ts` | `applyRunBaseReward` 的 `case 'xpGainPct'`：`state.xpGainBonus += add` → `state.rewardMeter.pointGainBonus += add`。**其余一行不动** |
| `src/ui/modals.ts` | 删 `relicCopy` import（:6）、`decision.kind === 'relic'` 的整个分支（:121-148）、`showDecision` 里 options 计算式中的 `relic`（:50）、`showResult` 里的遗物统计行（:223-225）。**保留** `waveBaseReward`（:46, :149）与 `recipePin` 两个分支 |
| `src/ui/eventText.ts` | 删 `relicDisplayName` import（:6）、`relicOffered`（:44）、`relicSelected`（:94）、`levelUp`（:121）三处 case；加 `rewardTriggered` 的 toast 文案 |
| `src/ui/upgradeFeedback.ts:150` | `const suppressCelebration = events.some(e => e.type === 'levelUp')` → 改判 `e.type === 'rewardTriggered'`（奖励弹窗期间不叠加升星庆祝） |
| `src/ui/renderHud.ts:13-16` | 见 P6.1。**不要动**紧随其后的 `evolutionHudText`（读 `state.recipes.completedRecipeIds`） |
| `src/ui/domRefs.ts:23-26` | 见 P6.1 |
| `index.html:18,21` | 见 P6.1 |
| `src/design/app.ts` | 删 `RelicsConfig` import、`renderRelicView` import、`ContentDomain` 与 `CONTENT_DOMAINS` 的 `'relics'`、`data.relics` 字段、`:120` 传参 |
| `src/design/navTree.ts` | 删 `RelicDef` import、`describeRelic` import、`NavSelection` 的 `relic` 分支、`options.relics`、:99 的 tag 合并、:126-129 过滤、:142-170 两段渲染 |
| `src/design/describe.ts` | 删 `describeRelic` |
| `src/design/contentSave.ts` / `contextPanel.ts` / `crossViews/affixCoverage.ts` | 删各自的 relics 分支 |
| `src/design/mechanismEditor.ts` | `EditableContentDomain` 与所有保存/编辑分支删除 `'relics'`；不要保留一个已无法加载数据的遗物编辑入口 |
| `src/design/styles.css` | 删遗物相关选择器 |
| `src/editor/app.ts` | 删 `RelicsConfig` / `renderRelicsEditor` import、`DOMAIN_LABELS.relics`、`FORM_DOMAINS` / `TREE_TOGGLE_DOMAINS` 的 `'relics'`、:161-167 分支、:274 条件 |
| `src/editor/contracts.ts:3` | 域清单删 `'relics'` / `'progression'`，加入 `'rewardMeter'` / `'settlement'`；`src/editor/app.ts` 的 `DOMAIN_LABELS`、表单域与树形域同步，确保两个新域可通过通用编辑器访问 |
| `src/editor/references.ts:39-40` | 删遗物 targetTags 收集 |
| `src/editor/labels.ts` | 删 `:180` 的 `relics: {...}`、`:184-185` 的 `progression` 整块（`killXpMul` / `relicChoices` / `targetRelics` / `xpThresholds` / `rarityByRelicIndex` / `settlement`）、`:210` 的 `relics: '遗物文案'`；新增 `rewardMeter` 与 `settlement` 两域的标签 |
| `src/editor/saveFlow.ts:14` | `SaveCandidate` 的 domain 联合删 `'relics'` |
| `src/editor/entityTextEditor.ts:5` | `EntityTextDomain` 删 `'relics'` |
| `src/editor/textsEditor.ts:11,23` | `ENTITY_SECTIONS` 删 `'relics'`，提示文案同步 |
| `src/editor/validationPanel.ts` | 删遗物域展示 |
| `src/editor/styles.css` | 删遗物相关选择器 |
| `scripts/configXlsx.ts` | `RecordDomainSpec.textRoot` 从 `'gods' \| 'relics'` 改为 `'gods' \| 'rewards'`；删 relics 域，新增 `rewardMeter: { arrays: ['rewards'], textRoot: 'rewards' }`，waveRewards **保留**；长域清单把 `progression` 换为 `settlement`（rewardMeter 已走 record domain）；`ENTITY_TEXT_ROOTS` 删 `'relics'`、加 `'rewards'`；导入/导出/空 texts 初始化清单同步。更新 `tests/configXlsxRoundtrip.test.ts`，覆盖 rewards 文案与 rewardMeter roundtrip |

### P5.3 旧测试、telemetry 与 golden fixture

- `tests/golden/*.summary.json` 五份**不要手改**，走 P7 的重录流程。
- 不要只删除 `tests/progressionSystem.test.ts` 就结束。用 P7.3 的 `rg` 结果逐个迁移所有旧系统引用；当前已知至少包括 `buildModifierSystem.test.ts`、`configLoader.test.ts`、`decisionQueue.test.ts`、`difficulty.test.ts`、`dropTypePolicy.test.ts`、`effectInterpreter.test.ts`、`fusionOrderInvariance.test.ts`、`godPoolTelemetry.test.ts`、`headlessRun.test.ts`、`settlement.test.ts`、`skillsGods.test.ts`、`textsCompleteness.test.ts`、`tunerV2.test.ts`、`waveBaseRewardChoice.test.ts` 以及若干创建/断言 `GameState` 的测试。
- `headlessRun` 和其他自动整局循环必须在每帧**先**自动调用 `confirmRewardReceipt` 清空回执链，再处理普通 `RunDecision`，与 UI 的回执优先级一致；否则会因硬暂停卡死。将“5–8 个遗物”断言改为奖励触发次数/记录断言。
- `godPoolTelemetry.test.ts` 改为验证新奖励 telemetry，不再构造已删除的 relic 事件；当前神池、配方进化、验证阶段 telemetry 断言继续保留。
- 不得通过删除或放宽当前 main 新增的 `targetingPrimitives`、设计指纹、原子契约测试来换取通过。

---

## 阶段 P6：UI 与文案

### P6.1 HUD

`index.html:18`
```html
<span>Lv.<span id="levelText">1</span> · <span id="xpText">0</span>/<span id="xpNeed">8</span></span>
```
→
```html
<span id="rewardMeterLabel">心防共鸣 <span id="rewardPointsText">0</span>/<span id="rewardThresholdText">10</span></span>
```

`index.html:21` `<div class="bar xp"><i id="xpBar" ...>` → `<div class="bar reward"><i id="rewardBar" ...>`（`src/styles/app.css` 里的 `.bar.xp` 选择器同步改名）。

`domRefs.ts:23-26`：`xpText/xpNeed/xpBar/levelText` → `rewardPointsText/rewardThresholdText/rewardBar`（**删掉等级引用，不做替代**）。

`renderHud.ts:13-16`（紧接 hpBar 之后、`waveText` 之前那四行）：
```ts
const meter = state.rewardMeter;
refs.rewardPointsText.textContent = String(Math.floor(meter.points));
refs.rewardThresholdText.textContent = String(meter.threshold);
refs.rewardBar.style.width = `${Math.min(100, Math.max(0, (meter.points / meter.threshold) * 100))}%`;
```
**注意**：旧代码是 `state.xp / state.xpNeed`（累计÷累计），条宽随全局进度走。新代码必须是**分段进度**，否则第一次满条后视觉上不会真正从零重新蓄力。宽度必须 clamp 到 0–100%。

`#validationSettleBtn` 在 `currentReceipt` 存在时暂时隐藏或禁用，回执确认后按原 phase 恢复，避免两个“继续/确认”入口同时抢焦点；不要删除它，也不要改变其原有结算语义。

代码内部一律用中性的 `rewardMeter` 命名，世界观文案（「心防共鸣」）只出现在 `texts.json`，不得反向侵入规则层。

### P6.2 奖励结果确认弹窗（`src/ui/rewardReceiptModal.ts`）

照 `modals.ts` 的既有做法**动态构建**（`index.html` 里本来就没有 `decisionModal` 的 markup，全是 JS 创建的）。

内容：
- 标题 = 奖励名（`texts.rewards[id].name`）
- 副标题 = 奖励描述
- 结果区 = 由 `RewardReceipt.result` 渲染的**实际结算数据**（造成了多少伤害、消灭多少、恢复多少、拿到什么万能卡、强化了哪个方向）
- **一个**按钮：「确认」
- 不允许用 Esc、点击 backdrop 或右上角关闭绕过确认；弹窗出现时焦点落在确认按钮，确认后恢复正常输入

新增 `src/ui/rewardMeta.ts`，职责同原 `relicMeta.ts`：从 `texts.json` 解析 `rewards.<id>.name/desc`，缺文案时回退到 id 不留空白。

`game.ts` 接线：
- `:117-118` 附近把 UI 同步改成**互斥优先级**：若有 `currentReceipt`，隐藏普通 decision modal 并显示 receipt modal；否则隐藏 receipt modal，再按 `state.decisions.current` 显示/隐藏普通 decision modal。禁止两个 modal 同时可见
- `:134` 附近的 hooks 增加 `onRewardConfirm() { dispatch(confirmRewardReceipt(state, config, rng)); }`
- `:282` restart 路径增加 `receiptModal.hide()`
- `:315` 的指针输入闸门增加 `|| state.rewardMeter.currentReceipt`
- `recipeEvolutionSystem` 的 `reason: 'decision'` 拒绝条件同步覆盖回执

### P6.3 `buildState.affinity` 死字段 —— **本次先不接线**

`calculateBuildProfile()` 保持**纯函数**，只被 `rewardExecutionSystem` 调用。
**不要**在本次改动里把它写回 `state.buildState.affinity`。

理由：那个字段目前恒为全 0，`settlement.topLane` 恒 null、`bountySystem` 的 lane 仲裁恒退化。一旦开始写入，bounty 的奖励方向和结算显示会同时改变行为 —— 这是**独立的既有 bug 修复**，混进本次改动会让 diff 无法审查、黄金回放漂移来源无法归因。

在 `settlement.ts:30` 和 `bountySystem.ts:110` 各留一行 TODO 注释指向后续任务，完工报告里单独列出这个发现。

---

## 阶段 P7：验证、回放与清理

### P7.1 命令顺序

```bash
npm run validate
npm run test
npm run build
npm run replay:record
```

跑完 `replay:record` 后**立刻**确认相对动态基线没有混入行尾噪音：
```powershell
$BASE_COMMIT = git rev-parse archive/pre-reward-meter-v4
git diff --shortstat "$BASE_COMMIT..main"
git diff --ignore-all-space --shortstat "$BASE_COMMIT..main"    # 两者应当基本一致
git diff --check "$BASE_COMMIT..main"
```
若两者差距巨大，说明写盘时又混入了 CRLF —— 先解决再继续。

### P7.2 黄金回放重录纪律

回放**必然**漂移（状态结构、事件类型、RNG 消耗顺序全变了）。但**必须先人工确认差异全部来自预期的新奖励系统**再提交新的 summary。

逐份检查 `git diff "$BASE_COMMIT" -- tests/golden/*.summary.json`（若 shell 会话已更换，先从归档分支重新取得 `BASE_COMMIT`），确认：
- `counters` 里 `xp`/`level` 已换成 `rewardPoints`/`rewardActivations`
- `relics[]` 已换成 `rewards[]`，且长度落在 5–8（首版刻意保持原触发节奏）
- `kills` / `cumulativeDamageDealt` 的变化能被「全屏大招造成额外伤害与击杀」解释
- `cards` / `equipment` / `wildcards` 的结构没有意外变化
- **进化相关字段无漂移**：`evolutionPath`、`recipeLineage`、`completedRecipes` 应当与改动前一致。若它们也变了，说明误伤了 v4 配方系统 —— 停下来查

任何**无法用新系统解释**的漂移都要先查清楚再重录。

### P7.3 静态验收

```powershell
rg "relicOffered|relicSelected|relic_offered|relic_selected|levelUp|xpNeed|relicStacks|relicHistory|godAffinity|dropPity|scalingVersion|cfg\.relics|cfg\.progression|state\.xp\b|state\.level\b|xpGainBonus|normalDropTypePolicy\.godAffinity" src tests scripts presets index.html
```
应当**零命中**（`scripts/computeExperienceMetrics.ts` 与 `tests/experienceMetrics.test.ts` 里的 "Experience" 是体验指标，不在此列；`Enemy.xp` / `EnemyDef.xp` / `enemies.json` 的 `xp` 字段本次**刻意保留**，见下）。

### P7.4 本次**不做**的命名迁移（写进完工报告作为已知遗留）

以下只保留 `xp` **内部标识符/配置路径**，留待后续单独一次纯改名任务：
- `Enemy.xp` / `EnemyDef.xp` / `src/config/base/enemies.json` 的 `xp` 字段
- `tuner.json` 的 `enemies.types.*.xp` 四条参数路径
- `xpMul` 效果原子（`defs.ts:94`、`interpreter.ts` 的 `MODIFIER_ATOMS_HANDLED` 与 `FUSION_RULES`、`atomContract` 契约、相关卡牌配置与测试）

标识符保留不等于保留旧玩家语义：`texts.json`、调参面板、编辑器和卡牌描述中对应的可见文案仍须从“经验”改为“奖励积分”；`scripts/computeExperienceMetrics.ts` 的 “Experience” 例外，它指体验指标，不改。

理由：这三处一改会同时触发**配置迁移 + 黄金回放重录 + xlsx roundtrip 测试**三处连锁，与本次的行为变更混在一起会让回放漂移无法归因。

---

## 最终验收标准

全部满足才算完成：

1. 存在 `archive/pre-reward-meter-v4` 本地归档分支，且仍精确指向动态 `BASE_COMMIT`；该提交包含施工前更新后的完整 main 与旧经验/等级/遗物系统。所有 reward-meter 实现提交都在 `main`，最终当前分支也是 `main`；从未创建或切换到 `refactor/reward-meter-v4`，未做任何 `push`；既有陈旧引用与 `stash@{0}` 全部未动
2. `git diff --ignore-all-space --stat "$BASE_COMMIT..main"` 与不带该选项的结果**基本一致**，且 `git diff --check "$BASE_COMMIT..main"` 无新增空白错误
3. 运行代码不再加载 `relics.json`；该文件已从仓库删除
4. `RunDecision` 中不存在 `relic`（`waveBaseReward` 与 `recipePin` 仍在）
5. `GameState` 中不存在 `xp` / `xpNeed` / `level` / `relicStacks` / `xpGainBonus`
6. HUD 不再显示等级；奖励条显示**分段**进度且宽度 clamp 在 0–100%
7. 奖励条满后**自动**抽取，不要求玩家选择
8. 奖励**自动执行完毕后**才弹确认框，确认框显示**实际结算结果**，玩家只点一次
9. 一帧内获得巨量积分只产生**一个**待确认回执
10. 奖励产生的击杀**不**反向充能
11. 玩家可见奖励种类为 5 种
12. 「构筑共鸣」的方向依据当前卡牌构筑计算（含 `recipeOnly` 产物卡），不依赖任何遗物历史
13. 卡牌合成、升星、分支进化、**25 条配方进化**全部保留且可用；`state.recipes.*` 一字未动
14. 波末自动基础成长与五选一**保留且可用**；`xpGainPct` 现在正确加成奖励积分获取
15. 验证阶段结算按钮（`#validationSettleBtn`）仍可用，且与奖励回执弹窗不互相遮挡
16. 丰收落穗（`expiryConvert`）仍然生效，只是折算为奖励积分
17. `npm run validate` / `npm run test` / `npm run build` 全绿
18. 黄金回放已重录，且每一处漂移都在完工报告里有解释

---

## 一句话总结

不要把这次做成「遗物系统的自动选择版」。目标定位是：

> 一个独立的、节奏清晰的、每局触发约 5–8 次的**自动大招抽奖系统**。

原遗物里真正有价值的只有「按构筑方向给强化」这一个思想，把它折叠进单一的「构筑共鸣」即可。品质分级、三选一、永久堆叠、神池导流、掉落保底、22 条遗物文案，全部退出主分支。
