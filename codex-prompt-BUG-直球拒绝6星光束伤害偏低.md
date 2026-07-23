# Codex 任务：修复「直球拒绝」升到 6★ 化为光束后，主角伤害远低于卸下装备时

## 0. 一句话结论
这不是激光特效错觉，也不是数值略偏低——是**攻击形态换算公式错误**：6★ 光束的「每周期总伤害」只按**一发普通子弹**计算，且**完全不继承射速与多弹丸成长**，导致单体 DPS 只有普通主炮的约 29%。请按本文修复并补测试。

---

## 1. 现象（复现目标）
「直球拒绝」（内部卡 id = `pierce`）升到 6★ 后，`stars.6` 的 transform 被动把主炮变形为持续光束（`beamMorph`）。测试中发现：**装备并升满 6★ 后，主角对单个 Boss 的实际输出明显低于把这张卡卸下时。**

验收目标：修复后，6★ 光束在单体 Boss 上的 DPS 应与普通主炮**基本持平**（并通过贯穿在多目标场景获得额外收益），而不是反而大幅降级。

---

## 2. 根因（我已通读代码确认，均属实，不是猜测）

### 根因 A（必须修）：光束每周期总伤害只等于「一发普通子弹」
`src/core/systems/combatSystem.ts` → `updateTurret()`，`form.delivery === 'line'` 分支：

```ts
const duration = Math.max(form.tickInterval, form.duration);          // 默认 0.6
const tickCount = Math.max(1, Math.round(duration / form.tickInterval)); // 0.6/0.1 = 6
const damagePerTick = totalDamage(state, config) * form.deliveryDamageRatio / tickCount;
```

一整道光束 6 个 tick 加起来 = `totalDamage × deliveryDamageRatio`，也就是**只等于一发普通子弹 × 倍率**。然后要等 `form.interval`（默认 0.9s）才生成下一道。

- 普通主炮单体理论 DPS = `damage × fireRate × multi` = `18 × 5 × 1 = 90`（`src/config/base/combat.json` → `defaults.damage=18, fireRate=5`）。
- 6★ 光束单体理论 DPS = `18 × 1.3 ÷ 0.9 ≈ 26`。
- 相对普通主炮 ≈ **28.9%**，降低约 71%，与测试观感完全吻合。

### 根因 B（必须修）：光束不继承 `fireRate` / `multi` 成长
光束路径**只用 `totalDamage`**，不经过 `totalFireRate(state, config)`（`src/core/stats.ts:15`）和 `totalMulti(state)`（`src/core/stats.ts:19`）。

后果：每拿一次升级里的「射速 +12%」（`src/config/base/progression.json`）或未来任何 `multi` 提升，普通主炮线性/成倍变强，而光束**几乎不变**，差距只会越拉越大。当前 `multi` 初始为 1，但代码明确支持 `multi>1`，必须防止未来复发。

### 根因 C（先定规则，再决定是否修）：光束触发频率下降
`src/core/systems/combatSystem.ts` → `tickBeam()` / `resolveImpact()`：同一道光束对同一敌人只在**首次命中**触发 `onHit`（命中后进入 `attack.hitIds`，后续 tick 只扣血直接返回）。每道光束也只创建一次 `AttackInstance`，即 `onFire` 每 0.9s 才触发一次。

- 普通攻击 `onFire` ≈ 5 次/秒；光束 ≈ 1.11 次/秒。
- 依赖高频触发的联动卡（连锁 / 灼烧 / 冻结层数）触发效率约下降 78%。
- 现有测试 `tests/weaponFusionPipeline.test.ts` 已把「每道光束只触发一次」固化为断言，说明这是**当前设计约定**，不是意外——所以先写进契约，再决定是否引入虚拟触发预算。

### 补充事实（recalibration 时务必注意）：`damping` 只在多形态叠加时生效
`src/core/effects/interpreter.ts:79` → `damping = index === 0 ? 1 : cfg.combat.weaponFusion.damping`（默认 0.75）。
- 玩家**只装这一张**光束卡时，index=0，`deliveryDamageRatio = 1.3 × 1 = 1.3`（上文 26 DPS 数字成立）。
- 与另一张主炮形态卡（如榴弹）**同时装备**时，光束不是 index 0，`deliveryDamageRatio = 1.3 × 0.75 = 0.975`，DPS 更低。
- 所以重定 `damageRatio` 时要意识到：叠加场景下还会再乘 0.75，不能只按单卡场景校准。

---

## 3. 不要改动的正确行为（已确认无误，勿动其语义）
- `composeWeaponForm()`（`src/core/effects/interpreter.ts:64`）的 delivery/impact/cadence 正交融合与排序、`damping` / `radiusMul` 规则本身正确。
- `beamMorph` 只在 `trigger==='passive'` 时进入 `weaponForms`（`interpreter.ts:344`）。
- 6★ 只用 6★ 配置、不叠加 3★/5★ 弹道，这是 transform 形态的既定设计（`stars['6']` 直接替换）。**「变形后放弃旧弹道」是合理的**，问题只在新形态没有正确继承主炮的每秒输出预算。
- `tickBeam` 的横扫、命中判定、`updateBeams` 的 tick 推进逻辑正确，勿改。

---

## 4. 修复方案

### 第一阶段（必做）：让光束继承普通主炮的「每秒输出预算」
文件：`src/core/systems/combatSystem.ts`，`updateTurret()` 的 `line` 分支。

把：
```ts
const damagePerTick = totalDamage(state, config) * form.deliveryDamageRatio / tickCount;
```
改为：
```ts
const baselineDps =
  totalDamage(state, config)
  * totalFireRate(state, config)
  * totalMulti(state);
const cycleDamage = baselineDps * form.interval * form.deliveryDamageRatio;
const damagePerTick = cycleDamage / tickCount;
```

含义：`光束每周期总伤害 = 普通主炮每秒伤害 × 光束周期 × 形态倍率`。这样 `damage / fireRate / multi` 的任何成长，光束都等比继承。

> 注意：`totalFireRate` / `totalMulti` 已在文件顶部 `import { totalDamage, totalFireRate, totalMulti, totalRange } from '../stats';` 引入，无需新增 import。

### 第二阶段（必做）：重定 `damageRatio`
文件：`src/config/base/skills.json`，`pierce.stars.6`。

采用新公式后，`damageRatio` 的语义从「一道光束等于几发子弹」变成「相对普通主炮 DPS 的倍率」。当前 `1.3` 会让光束在单体上就 = 130% 普通 DPS 且还能贯穿，过强。

改为：
```json
{ "atom": "beamMorph", "params": { "interval": 0.9, "width": 32, "damageRatio": 1.0 } }
```

设计意图：单体 Boss 与普通主炮持平；多目标靠贯穿获得额外价值；6★ 的价值来自稳定命中 / 贯穿 / 持续扫射 / 构筑形态变化，而非单体倍率。可接受调参区间 `0.95 ~ 1.10`，**首选 1.0**。（记得：与其他主炮形态叠加时还会再乘 `damping=0.75`，若希望叠加场景也不过弱，可在契约里注明或后续单独调。）

### 第三阶段（先定规则，暂不强改）：光束的附加效果触发规则
在 `docs/装备被动融合契约.md` 的「主炮形态」一节补一条明确约定，二选一：

- **方向 A（本次采用，改动最小）**：保持「每道光束对每个敌人只触发一次 `onHit`、每道光束只触发一次 `onFire`」。射速 / 多弹丸只折算进直接伤害，不额外增加连锁 / 冻结 / 灼烧触发次数。数值与性能可控，但高频触发流构筑会变化。
- **方向 B（暂不实现，留作后续）**：为光束维护 `virtualShotBudget`，按 `totalFireRate × totalMulti × dt` 累积虚拟射击次数，达到阈值允许触发一次附加效果，并配 `procCoefficient`（如 0.4~0.6）压制过量触发。实现 / 测试 / 数值风险高，本次不做。

本次只需把方向 A 写进契约，作为验证期的显式契约。若第一阶段测试发现联动流仍大幅变弱，再单开任务评估方向 B。

---

## 5. 必须新增 / 更新的测试

### 5.1 更新旧断言
`tests/weaponFusionPipeline.test.ts` 中「一整道光束 = 一发普通子弹伤害」相关断言（如 `expect(direct.hp).toBeCloseTo(100 - config.damage, 5)` 及依赖 `config.damage/6` 的链式断言）会随新公式失效，需按新的「每周期 = baselineDps × interval × ratio」重算期望值，保持其验证「触发只发生一次」的语义不变。

### 5.2 新增 `tests/weaponDpsParity.test.ts`（DPS 契约测试）
用固定、不移动、不死亡的高血量 Boss，模拟固定时长，对照普通主炮与 6★ 光束总伤害：

1. **单体对照**：`光束总伤害 / 普通主炮总伤害` 应落在 `0.98 ~ 1.02`（按 `damageRatio=1.0`；若最终定别的值，按比例调期望）。
2. **射速继承**：分别设 `fireRate = 5 / 5.6 / 7 / 10`，要求光束与普通主炮伤害比例基本恒定。
3. **多弹丸继承**：设 `multi = 1 / 2 / 3`，要求光束伤害预算随 `multi` 等比增长。
4. **多目标价值**：同一直线放 3 个敌人，要求每个敌人受到近似相同的光束伤害，且光束总伤害明显高于单体普通主炮。
5. **帧率稳定性**：`dt = 1/30 / 1/60 / 1/120` 模拟同样时长，光束总伤害误差 < 1%（防止 tick 边界多结算/少结算）。
6.（可选）**组合构筑**：直球拒绝 + 冷淡处理 / 心跳连锁 / 热情退烧 / 范围榴弹，用现有逐卡 `triggers / hits / damage` 统计记录各卡贡献，作为方向 A/B 决策依据。

---

## 6. 改动清单（第一轮）
| 文件 | 改动 |
|---|---|
| `src/core/systems/combatSystem.ts` | 用 `totalDamage × totalFireRate × totalMulti × interval × ratio` 计算光束每周期伤害 |
| `src/config/base/skills.json` | `pierce.stars.6` 的 `beamMorph.damageRatio` 从 `1.3` 改为 `1.0` |
| `tests/weaponFusionPipeline.test.ts` | 更新受新公式影响的旧断言（保留「触发一次」语义） |
| `tests/weaponDpsParity.test.ts` | 新增单体 / 射速 / 多弹丸 / 多目标 / 帧率 DPS 契约测试 |
| `docs/装备被动融合契约.md` | 补写方向 A：光束的伤害/射速/多弹丸/触发继承规则 |

## 7. 交付要求
1. 只做上述最小改动，**不要**把 `damageRatio` 粗暴抬到 4.5（那只在默认射速/单弹丸下勉强对齐，射速一涨立刻复发）。
2. 全量 `npm test`（或项目对应命令）通过；新增 DPS 契约测试全绿。
3. 手动或脚本验证：装备并升满 6★「直球拒绝」后，单体 Boss DPS 与卸下时基本持平（不再出现「升到 6★ 反而打不动」）。
4. 若第一轮测试显示联动流仍显著变弱，**不要**擅自实现方向 B，先在 PR 说明中标注并单开后续任务。
