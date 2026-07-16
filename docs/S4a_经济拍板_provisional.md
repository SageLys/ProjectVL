# S4a · 6★ 经济拍板（provisional）

日期：2026-07-14
状态：**已定 provisional**，解锁 S5。真正的经济标定（merge_sim + 6★ 可达性 + E3/E6 回填）留 S4b（S5 后、真卡+真人遥测到位时）。
口径基准：`presets/budget模式初版.tuner.json`（唯一敲定的 preset）。

---

## 1. 用户拍板（收敛为单锚）

用户基于满意 preset 的主观体验判断：§5 五问里**只有 Q5（拾取锚）有用**，其余（6★ 件数 / 首件时机 / 4★5★ 分布 / 可达性解法）**都从"每分钟掉落期望"派生**，故本轮不单独拍板，全部留 S4b 由掉落期望反推。

- **dropChance = 0.27**（保持现值，用户同意）。
- **锚：普通掉落·每分钟掉落期望 ≈ 55/min。** 这是调参面板「派生指标 H · 每分钟掉落期望（普通·波1）」的读数，用户以此为满意手感的定量表达。

## 2. 这个 55/min 到底是什么（口径澄清，供 S4b 正确使用）

面板读数 `derivedMetrics.dropsPerMinute` 的实际算法（`src/ui/derivedMetrics.ts`）是：

```
expectedDrops   = (全 8 波总出怪数 − boss 数) × dropChance + boss 数
dropsPerMinute  = expectedDrops ÷ 全局理论局长 × 60
```

在 budget 模式初版 preset 下实算（脚本复核）：

| 量 | 值 |
|---|---|
| 全 8 波总出怪数 | 2280 |
| boss 数 | 3（波 3/5/8） |
| expectedDrops | 617.8 |
| 全局理论局长 | 11.15 min |
| **dropsPerMinute** | **55.42 /min** ✅ 与用户"55左右"一致 |

**⚠ 两个口径注意（S4b 必须知道）：**
1. 标签写「普通·波1」，但算法是**全 8 波全局平均**，且只把敌人当 normal/boss（未分 fast/tank）。它是"整局掉落供给速率"的均值，**不是波1专属值**。
2. 面板是**理论值**（击杀即时、hitRate 模型）。真人实测波1实际落地掉落更低（该满意会话波1 ≈ 22/min，因前段密度低于全局均值 + 真实走行/命中损耗）。S4b 的 merge_sim 应按**逐波掉落速率**（随波爬升）建模，而不是套一个平的 55/min。

## 3. Q1–Q4：留 S4b（由 55/min 供给反推）

6★ 件数 / 首件时机 / 4★5★ 分布 / 可达性解法方向——**不在本轮拍板**。S4b 以"整局约 618 次掉落供给 + 手牌7/装备3 + 合成规则"为输入，反推这些量的可行区间，再交用户拍板。

## 4. 本轮实际动作：把满意 preset 焙进 base 配置（关键）

**发现**：满意的「budget模式初版」此前**只存在于 preset 文件 / localStorage**，`src/config/base/*.json` 仍是 P3 旧值（interval 模式、range 210、dropChance 0.5、5 波…），且**无启动自动加载**——即 fresh build / 生产包跑的是旧"无聊"配置。若不处理，S5 会在错误基线上实装与测试。

**动作**：将 preset 全部键焙入 `src/config/base/{waves,combat,enemies,economy,progression}.json`，使默认构建 = 手感基线。关键落定值：

| 域 | 字段 | 旧 base | 现 base(=满意preset) |
|---|---|---|---|
| waves | spawnMode | interval | budget |
| waves | totalWaves / bossWaves | 5 / [5] | 8 / [3,5,8] |
| waves | budget.targetOnScreen | 4+1w | 5+10w |
| combat | range / damage / fireRate | 210 / 16 / 3.3 | 150 / 18 / 5 |
| economy | dropChance | 0.5 | **0.27** |
| enemies | normal.hpPerWave | 7 | 12 |
| progression | xpNeedBase / xpGrowth | 8 / 1.35 | 10 / 2 |

**测试维护**（6 个 config 耦合用例更新，均属"断言写死了旧 base 值"的机械修正，非逻辑改动）：
- `waveSystem`：spawnLeft 测试 pin 回 interval；boss hp 断言改按 cfg 动态算；胜利判定改末波=totalWaves。
- `configLoader`：`applyVariants([])` 后 totalWaves 5→8。
- `bossWaves`：默认 bossWaves 断言 pin [5]。
- `progressionSystem`：XP 曲线两用例 pin 回 8/1.35。
- `effectAtoms`：beamMorph 目标位置移进 range 150 内。
- `waveBudgetSystem`：budget 配额 48→103、首检补怪 5→10。
- `headlessRun`：整局 bot 时长预算 12min→25min（新配置整局更长）。

## 5. 验收 & 遗留

- 复算脚本口径：`src/ui/derivedMetrics.ts`（面板同源）；55.42/min 可复现。
- 测试：19/20 文件执行通过；`tunerV2` 断言全部从 cfg 动态重算（不含写死 base 值），经静态核对不受影响。
- **装备语义（2026-07-14 已拍板＝选项B）**：装备可撤销/可消耗（`equipIrreversible=false`/`unequipPolicy=consume`）；P2 设计表 R11/§4、交互清单、总计划均已对齐（schema/代码本就是此语义）。
- **遗留给 S4b**：merge_sim 6 档重写（按逐波掉落速率，不套平 55）、6★ 可达性、E3/E6 回填。`resonance` 卡已删除，万能卡改为独立资源机制。Boss TTK 21–49s 亦待 S4b/技能 DPS 缩放。
