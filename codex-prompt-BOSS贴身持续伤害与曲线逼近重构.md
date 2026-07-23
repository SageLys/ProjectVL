# Codex Prompt：BOSS 贴身持续伤害 + 射程内曲线逼近（P0 + P1）

> 本文可直接复制给 Codex 执行。所有代码事实均已对照当前仓库核对，行为描述以代码为准，勿沿用旧估算。

---

## 0. 任务目标

重构「波次 BOSS（`spawnKind === 'waveBoss'`）」的移动与突破机制，把当前
「缓慢直线接近 → 撞到炮台瞬移回边缘 → 再缓慢接近」的空转循环，
改成：

> **正常速度进场 → 进入射程后曲线绕行逼近 → 突破防线后停在炮台旁持续侵蚀玩家血量；
> 期间炮台仍全力攻击 BOSS，形成「BOSS 血条 vs 玩家血条」的最后竞速。**

范围：**P0（核心闭环）+ P1（曲线逼近 / 击退解除 / 冻结眩晕暂停）**。
表现层（顶部 BOSS 血条、专属 VFX、遥测字段、调参面板）**不在本次范围**，但代码需为其预留（新增语义事件、可配置参数）。

**普通敌人 / bounty / validationElite 的突破逻辑必须保持完全不变。** 本次只改 `waveBoss`。

---

## 1. 当前实现（已核对，供你定位）

### 1.1 瞬移的元凶
`src/core/systems/enemySystem.ts` → `moveEnemies()`（约 146–205 行）。突破结算末尾：

```ts
if (Math.hypot(t.x - e.x, t.y - e.y) < cfg.combat.breakthroughDist) {
  // …bounty 通知 / thorns 反伤致死 / absorbBreach 护盾减免…
  const damage = absorbBreach(state, config, rng, e.damage, events);
  if (e.spawnKind !== 'waveBoss') state.enemies.splice(i, 1);   // 普通敌人移除
  // …粒子 / 扣血 / breakthrough 事件 / onBreach 触发 / 判负…
  if (state.hp <= 0) events.push(...endGame(state, false));
  else if (e.spawnKind === 'waveBoss' && state.enemies.includes(e))
    Object.assign(e, randomEdgeSpawnPosition(rng));            // ★ 就是这行瞬移
}
```

### 1.2 关键数值与坐标（对照修正，勿用旧文档估算）
- 画布 `cfg.combat.canvas` = **540 × 730**；炮台 `cfg.combat.turret` = **(270, 365)**。
- `cfg.combat.breakthroughDist` = **48**；默认射程 `cfg.combat.defaults.range` = **150**（实际用 `totalRange(state, config)`）。
- BOSS 出生：四边随机，`spawnMargin` = 25。到炮台平均直线距离 ≈ 340px，需移动 ≈ 290px。
- BOSS 基础数值 `src/config/base/enemies.json` → `types.boss`：
  `speedBase: 18, speedPerWave: 0, damage: 28, hpBase: 300, hpPerWave: 320, knockbackResist: 0.85, ccResist: 0.5, r: 35`。
  → 18px/s 走 290px ≈ **16 秒**空转，且不随波成长。
- `bossWaves` = `[1..8]`，**每波都有 BOSS**（本次不改）。
- 普通敌人参考速度：wave1 = 26，wave8 = 40（`speedBase 24 + wave*2`）。

### 1.3 难度倍率（`src/core/difficulty.ts` + `src/config/base/difficulty.json`）
`difficultyMultipliersFor(difficultyId, 'boss', wave)` 返回 `{hp, damage, speed}`。
BOSS 的 `damage` 倍率曲线（首波→末波）：
- relaxed 0.45→0.80，standard 0.65→0.95，hard 0.85→1.00。
- **hell 没有 `boss` 覆盖块**，回落到 `enemy` 曲线 = 恒定 **1.0**（这点与旧文档不同，勿写成 0.65→1.0）。

`createEnemy()` 已把 `dm.damage` 乘进 `enemy.damage`。**注意：本次新增的 `contactDps` 也必须乘同一 `dm.damage`**，否则难度对贴身伤害失效。

### 1.4 已有配套（勿重复造轮子）
- BOSS 击杀奖励在 `killEnemy()`（`src/core/systems/damageSystem.ts` ~19 行）里，当 `spawnKind === 'waveBoss'` 调 `grantWaveBossReward()`。
  → **只要 BOSS 经由 `killEnemy` 死亡（炮台击杀或反伤致死），奖励就会正常发放。持续伤害的反伤致死分支必须走 `killEnemy`，不要另写奖励逻辑。**
- 波次推进 `advanceWavePhase()`（`src/core/systems/waveSystem.ts` 140–145 行）：boss 阶段结束要求「BOSS 已移出数组 + 奖励已领取 + 无未领取 boss 掉落」。**新行为不得绕过该状态机**。
- 索敌 `findTarget()`（`src/core/systems/combatSystem.ts`）只挑「射程内」敌人。接触距离 48 < 射程 150，**炮台在接触阶段天然会继续攻击 BOSS**，无需额外改索敌。
- 击退 `applyKnockback()`（`src/core/effects/statusSystem.ts`）：冻结中无效；受 `knockbackResist`（boss 0.85）与 `controlCeiling.knockbackDistance`（120）与击退疲劳衰减；传 `clampToRange` 时不会把射程内敌人推出射程。返回是否实际位移。
- `isImmobile(e)` = `frozen>0 || stunned>0`；`speedMultiplier(e)` 对 immobile 返回 0。
- 帧循环顺序 `src/core/updateGame.ts`：`updateTurret → tickSpawns → updateBullets → moveEnemies → tickBountySystem → tickEffects(含状态计时/区域/nova/召唤物爆炸击退) → tickDrops`。
  → 子弹击退在 `moveEnemies` **之前**，区域/nova/召唤爆炸击退在 **之后**。接触-脱离判定允许有 1 帧延迟。

---

## 2. 配置改动

### 2.1 `src/config/base/enemies.json`
给 `types.boss` 增加 `contactDps`，并在 `enemies` 顶层新增 `bossBehavior`：

```jsonc
"boss": {
  "...": "现有字段保留",
  "speedBase": 28,       // 由 18 提升到接近普通敌人
  "speedPerWave": 1.5,   // 由 0 改为随波成长
  "contactDps": 14       // 新增：贴身持续伤害基准（未乘难度）
}
```

在 JSON 顶层（与 `defaults`/`types` 平级）新增：

```jsonc
"bossBehavior": {
  "orbitStartRangeRatio": 1.0,   // 曲线起点 = 射程 * 该比例
  "orbitStartMaxDistance": 180,  // 曲线起点上限（像素）
  "curveStrength": 0.65,         // 切向权重峰值
  "contactDistance": 48,         // 进入接触的距离（= breakthroughDist）
  "contactExitDistance": 60,     // 被推出该距离则脱离接触
  "contactWarmup": 0.4,          // 进入接触到首次伤害的延迟
  "contactTickInterval": 0.5,    // 伤害脉冲间隔
  "hardControlPausesDamage": true
}
```

### 2.2 `src/config/types.ts`
- `EnemyDef` 增加可选字段 `contactDps?: number;`（仅 boss 用，设为可选避免其它类型报错）。
- 新增接口并挂到 `EnemiesConfig`：

```ts
export interface BossBehaviorConfig {
  orbitStartRangeRatio: number;
  orbitStartMaxDistance: number;
  curveStrength: number;
  contactDistance: number;
  contactExitDistance: number;
  contactWarmup: number;
  contactTickInterval: number;
  hardControlPausesDamage: boolean;
}

export interface EnemiesConfig {
  defaults: { enemySpeed: number };
  types: Record<'normal' | 'fast' | 'tank' | 'boss', EnemyDef>;
  bossBehavior: BossBehaviorConfig;   // 新增
}
```

- 若 `variant`（如 `dev-short`/`validation-10`）或配置校验器对 enemies 结构做全量校验，请同步补齐，确保 `buildConfig`/loader 不报错。

### 2.3 调参面板（`src/ui/tunerSchema.ts` / `tuner.json`）
- 本次**不强制**把 `bossBehavior` 接进调参面板。
- 但注意 `tests/bossWaves.test.ts` 有断言 `expect(BUDGET_TUNER_PARAMS).toHaveLength(9)`。**若你改动了 tuner 参数组，必须同步更新该断言**；若不动 tuner，则保持不变。

---

## 3. 运行时状态（`src/core/types.ts`）

给 `Enemy` 增加可选运行时状态，仅 `waveBoss` 初始化：

```ts
export interface BossRuntimeState {
  phase: 'approach' | 'contact';
  orbitDirection: -1 | 1;        // 绕行方向，避免每帧抖动
  contactTickRemaining: number;  // 距下一次接触伤害的剩余秒数
  contactAngle: number;          // 进入接触时相对炮台的角度
}

export interface Enemy {
  // …现有字段…
  bossRuntime?: BossRuntimeState;
}
```

在 `spawnWaveBoss()`（`enemySystem.ts`）里初始化：

```ts
boss.bossRuntime = {
  phase: 'approach',
  orbitDirection: boss.id % 2 === 0 ? 1 : -1,  // 用 id 决定方向，不消耗 rng（保持随机序列不变）
  contactTickRemaining: cfg.enemies.bossBehavior.contactWarmup,
  contactAngle: 0,
};
```

> ⚠️ 不要用 `rng()` 决定 `orbitDirection`——否则会改变现有种子下的掉落 / 敌人类型 / 出生序列，破坏大量既有测试。

---

## 4. 移动与突破逻辑改造（`src/core/systems/enemySystem.ts`）

把 `moveEnemies()` 里对敌人的处理按类型分流。建议抽出内部函数，避免继续在大循环里堆特判：

```
moveEnemies()
├─ 普通/bounty/validationElite → 现有逻辑，原样保留（含突破后 splice 移除、单次 breakthrough、onBreach）
└─ waveBoss → moveWaveBoss()
     ├─ phase === 'approach' → moveBossApproach() （P1 曲线）
     │     └─ 到达 contactDistance 内 → enterBossContact()
     └─ phase === 'contact' → tickBossContact()
           ├─ 距离 > contactExitDistance → leaveBossContact()（回 approach）
           ├─ 否则重新贴合到 contactDistance
           └─ 累积计时，到点 → resolveBossContactPulse()
```

### 4.1 删除瞬移
删除 `Object.assign(e, randomEdgeSpawnPosition(rng))` 这一行及其分支。BOSS 不再回边缘。

### 4.2 approach 阶段（P1 曲线逼近）
- BOSS 在射程外：直线朝炮台（沿用现有 `dx/dy/len` 归一化推进，速度 `e.speed * speedMultiplier(e) * config.enemySpeed`）。
- 进入曲线区（到炮台距离 ≤ `orbitStart`）后，方向 = 径向 + 切向混合：

```ts
const orbitStart = Math.min(
  totalRange(state, config) * bb.orbitStartRangeRatio,
  bb.orbitStartMaxDistance,
);
const radial = normalize(turret - bossPos);            // 指向炮台
const tangent = perpendicular(radial) * boss.bossRuntime.orbitDirection;
const progress = clamp((dist - bb.contactDistance) / (orbitStart - bb.contactDistance), 0, 1);
const curveWeight = Math.sin(Math.PI * progress) * bb.curveStrength;
const dir = normalize(radial + tangent * curveWeight); // 用 dir 替代直线方向推进
```

要点：`sin(π·progress)` 保证进入/贴近两端切向权重→0（不突然转弯、稳定收口），中段最弯；到炮台距离整体单调下降，不无限绕圈。减速（slow）只降推进速度、不改路径形状。

### 4.3 进入接触 `enterBossContact()`
当 `dist < contactDistance` 且当前是 approach：
1. `boss.bossRuntime.phase = 'contact'`；
2. `contactAngle = atan2(boss.y - turret.y, boss.x - turret.x)`；
3. `contactTickRemaining = contactWarmup`；
4. **触发一次** `onBreach`（复用现有 `fireTrigger(..., 'onBreach', { enemy, damage: 0, point })`）——语义是「首次突破」；
5. push 语义事件 `{ type: 'bossContactStarted', enemyId: boss.id }`；
6. 不扣血、不发 `breakthrough` toast（贴身伤害走脉冲）。

> `onBreach` 只在**每次进入接触**触发一次；持续脉冲**不得**重复触发 `onBreach`（否则冲击卡 5★ 的击退+眩晕会每 0.5s 刷屏）。被击退脱离后重新接触，可再次触发（装备自身 6s 冷却仍然生效，天然限流）。

### 4.4 接触阶段 `tickBossContact()`（每帧）
1. 先算当前到炮台距离 `dist`。
2. 若 `dist > contactExitDistance` → `leaveBossContact()`：`phase='approach'`，push `{ type: 'bossContactEnded', enemyId }`，本帧不再结算伤害。
3. 否则重新贴合：`contactAngle = atan2(boss.y-turret.y, boss.x-turret.x)`，`boss.x = turret.x + cos*contactDistance`，`boss.y = turret.y + sin*contactDistance`。（允许小幅击退「滑动」，但不脱离。）
4. **硬控暂停**：若 `hardControlPausesDamage && isImmobile(boss)`（冻结/眩晕）→ **不推进 `contactTickRemaining`、不结算伤害**，直接 return。
5. 否则 `contactTickRemaining -= dt`，用 `while (contactTickRemaining <= 0)` 循环结算脉冲并 `contactTickRemaining += contactTickInterval`（**while 循环保证帧率无关**：dt=1/30 与 1/120 在相同真实时长内脉冲次数一致）。每个脉冲调 `resolveBossContactPulse()`。若 BOSS 在脉冲中死亡或玩家死亡，立即跳出。

### 4.5 单次脉冲 `resolveBossContactPulse()`
新建独立函数，**不要每帧复用整段现有突破逻辑**。结算顺序：

```
pulseDamage = boss.contactDps * contactTickInterval * dm.damage
              // dm.damage = difficultyMultipliersFor(state.difficultyId,'boss',state.wave).damage
```

1. **反伤（thorns）**：用 `mods.thornsRatio`。致死判定必须基于 **pulseDamage**（不是旧的 `e.damage=28`，也不是整段 DPS）。若 `thornsRatio>0 && pulseDamage*thornsRatio >= boss.hp`：把 boss `splice` 出数组并 `killEnemy(...)`（走既有奖励），结束。
2. 护盾/减免：调 `absorbBreach(state, config, rng, pulseDamage, events)`。返回 `null` = 本次脉冲被护盾吸收（不扣血，但护盾层-1、可能触发 shieldBroken + nova 击退）。
3. 若返回数值：`state.hp -= damage`；`state.bountyDirector.lastHpLossAt = state.time`；push `{ type: 'bossContactDamage', enemyId, damage }`（**不复用 `breakthrough` 事件**，避免每脉冲弹「受到 X 点伤害」toast）。
4. 若 `state.hp <= 0` → `events.push(...endGame(state, false))` 并结束。

> 护盾语义：每个 0.5s 脉冲 = 一次可吸收攻击。2 层护盾 ≈ 1s 无伤窗口；破盾 nova 击退若把 BOSS 推出 `contactExitDistance`，下一帧 `tickBossContact` 判定脱离、伤害停止。

### 4.6 e.damage 的保留
- BOSS 的 `e.damage`（28）仍用于**撞击嘲讽召唤物**（`moveEnemies` 里 `target.summon.hp -= e.damage`）——保留原样。
- 贴身对玩家的伤害改用 `contactDps`，**不要**把 28 当 DPS（hell 满血只能撑 ~3.6s，过严）。

---

## 5. 语义事件与文案

### 5.1 `src/core/types.ts` → `GameEvent` 联合新增
```ts
| { type: 'bossContactStarted'; enemyId: number }
| { type: 'bossContactDamage'; enemyId: number; damage: number }
| { type: 'bossContactEnded'; enemyId: number }
```

### 5.2 `src/ui/eventText.ts` → `formatToast()`
该 `switch` 无 `default` 且穷尽联合类型，新增事件不处理会导致 **TS 编译报错**。请显式处理：
- `bossContactStarted` → 返回一次性警告文案（如「命定追求者已突破防线，正在持续侵蚀」，文案放 `src/data/texts.json` 的 toast 段并复用 `T`）。
- `bossContactDamage` → `return null;`（不弹 toast，仅供表现层驱动，本次不接）。
- `bossContactEnded` → `return null;`。
- 无需加入 `SLOT_CHANGING` 集合。

---

## 6. 测试

新建 `tests/bossBehavior.test.ts`，不要把 BOSS 行为继续塞进 `waveSystem.test.ts`。用 `tests/helpers` 的 `freshState / enemy / constRng / createDefaultConfig / resetTestEnv`。至少覆盖：

1. **不再瞬移**：把 waveBoss 放在 `contactDistance` 内推进一帧 → `bossRuntime.phase === 'contact'`；boss 坐标接近炮台 `contactDistance`，且**明确断言坐标不是出生边缘坐标**（不在 `y≈-25 / x≈565` 等边缘）。
2. **接触中仍可被击杀**：boss 在 `state.enemies` 中；`findTarget` 返回该 boss；把 boss 血打到 0 经 `killEnemy` → 触发 `grantWaveBossReward`（有 boss 掉落）；随后 `advanceWavePhase` 能正常收尾进入下一波。
3. **帧率无关**：分别用 `dt=1/30、1/60、1/120` 模拟相同 4 秒接触，最终 `state.hp` 一致（允许极小浮点误差）。
4. **onBreach 每次接触仅一次**：进入接触触发 1 次；多个脉冲不再触发；被击退脱离后重新接触可再触发一次。
5. **护盾吸收脉冲**：2 层护盾吸掉前两脉冲（hp 不降），第三脉冲开始扣血；破盾 nova 只触发一次；nova 击退达到 `contactExitDistance` 时 boss 脱离接触（`phase==='approach'`）。
6. **冻结/眩晕暂停侵蚀**：接触中冻结 1s，这 1s 内 `state.hp` 不降；解冻后计时继续，**不得一次性补结算**积压伤害。
7. **击退解除接触**：接触时距离 = contactDistance；施加足够击退后距离 ≥ contactExitDistance 且 `phase==='approach'`。（注意 boss `knockbackResist=0.85`，需较大原始击退，测试里可用 `knockbackResistOverride` 或直接改状态验证阈值。）
8. **普通敌人不受影响**：普通敌人突破后仍被 `splice` 移除、仍只造成一次伤害、仍发 `breakthrough` + `onBreach`。
9. **曲线整体收敛**：连续模拟 approach 曲线，断言到炮台距离总体单调下降、不越过 contactDistance、不离开画面；顺/逆两个 `orbitDirection` 都能到达；减速下路径形状不变、只降速度。

### 更新既有测试
- `tests/waveSystem.test.ts` 的用例 **`'keeps a surviving Boss in the phase after a breakthrough'`**（约 48 行）：当前假设 boss 撞炮台后留在 `enemies` 且仍在 boss 阶段。语义改为「进入 contact 且不瞬移」。请更新该用例断言（保留「仍在 enemies / 仍是 boss 阶段 / waveBossId 不变」，新增「phase==='contact' 且未回边缘」）。
- `'keeps HP-zero defeat behavior…'`（约 60 行）：该用例直接构造 boss 于炮台中心并期望一帧内致玩家死亡。改为持续伤害后**一帧一个脉冲**、且有 `contactWarmup` 延迟，单帧可能不再致死。请改成推进足够时长后再断言 `gameEnd`，或将玩家 hp 设为低于单脉冲值以保持单帧致死语义。
- 跑 `tests/bossWaves.test.ts`：若未动 tuner 参数组，`BUDGET_TUNER_PARAMS` 长度断言应仍通过；动了就同步。

---

## 7. 参数基线（首轮，均可后续调）

```json
{
  "boss": { "speedBase": 28, "speedPerWave": 1.5, "contactDps": 14 },
  "bossBehavior": {
    "orbitStartRangeRatio": 1.0, "orbitStartMaxDistance": 180, "curveStrength": 0.65,
    "contactDistance": 48, "contactExitDistance": 60,
    "contactWarmup": 0.4, "contactTickInterval": 0.5, "hardControlPausesDamage": true
  }
}
```

预期体感：BOSS wave1≈29.5 / wave8≈40 速度进场（≈10s 到场，不再 16s 空转）；进入射程后曲线绕行制造压迫；突破后停在炮台旁，标准难度满血玩家约 7.5–11s 生存窗口，hell 约 7s；炮台持续输出，冻结/眩晕/击退可争取时间。

---

## 8. 硬约束清单（务必逐条满足）

- [ ] 删除 `Object.assign(e, randomEdgeSpawnPosition(rng))` 瞬移。
- [ ] `orbitDirection` 由 `boss.id` 决定，**不消耗 rng**。
- [ ] `contactDps` 乘难度 `dm.damage`；hell 难度该倍率为恒定 1.0。
- [ ] thorns 反伤 / 减免 / 致死都基于 **单次 pulseDamage**，不是 28、不是整段 DPS。
- [ ] BOSS 死亡一律经 `killEnemy`，复用既有 `grantWaveBossReward`，不另写奖励。
- [ ] `onBreach` 每次进入接触仅一次；脉冲用新事件 `bossContactDamage`，不复用 `breakthrough`。
- [ ] 冻结/眩晕暂停接触计时且不补算；脉冲用 `while` 累积器，帧率无关。
- [ ] 普通/bounty/validationElite 突破逻辑零改动。
- [ ] `advanceWavePhase` 的 boss 阶段收尾状态机不被绕过。
- [ ] `formatToast` 穷尽处理三个新事件（否则 TS 报错）。
- [ ] 全量 `npm test`（vitest）通过，`tsc` 无类型错误。
```
