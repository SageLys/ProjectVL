# 黄金回放 fixture 规格（T0.5）

日期：2026-07-26 ｜ 交付对象：Unity 开发者 + H5 侧维护者
上游：`docs/接下来任务计划_v1.md` §T0.5、`docs/Unity移植_纵向切片交付说明.md` §六（对照协议）

本文件定义**跨引擎一致性基线**：一组「固定 seed + 固定配置 + 脚本化输入」的对局录像，以及它们的结束态摘要。
这是"复刻正确"的**唯一客观验收标准**——任何一致性失败，先查交付说明 §3.1 的单帧执行顺序与 §3.2 的判定次序。

---

## 0. 文件清单

| 路径 | 作用 |
|---|---|
| `src/core/rng.ts` | 可播种 rng（mulberry32）+ 计数包装。**Unity 必须实现同一算法**，见 §2 |
| `src/core/replay/record.ts` | 录制/重放 harness：`runReplay(spec) → summary` |
| `tests/golden/<id>.spec.json` | 输入（ReplaySpec）——Unity 直接读这份文件重放 |
| `tests/golden/<id>.summary.json` | 期望输出（ReplaySummary）——Unity 与这份比对 |
| `tests/goldenReplay.test.ts` | H5 侧只读回放测试（逐位相等 + 连跑两次自洽） |
| `scripts/recordGoldenReplay.ts` | 唯一写盘入口：`npm run replay:record [id...]` |

> **只读约定**：回放测试永不写盘。fixture 只能由 `npm run replay:record` 重生成，且**重生成即意味着你承认行为变了**——提交时必须在 PR/commit 说明差异原因。

---

## 1. 五个 fixture 与覆盖面

| id | 场景 | 帧数 | 结果 | 覆盖 | Unity 一期可复刻？ |
|---|---|---|---|---|---|
| `01-slice-combat` | 第 1 波纯战斗 16s | 480 | 进行中 | 出怪 / 索敌 / 开火 / 伤害 / 击杀掉落 / 掉落过期 | ✅ **完全可复刻**（无决策、无输入） |
| `02-slice-consumable` | 消耗态落点释放 | 900 | 进行中 | 拾取 / 二合 / 消耗释放 ×2 / freeze 状态 | ⚠️ 需再实现拾取与消耗态 |
| `03-slice-merge-equip` | 合成升星 + 装备态 | 900 | 进行中 | 四合三 / 进化分支决策 / 装备 3★ / 词条掷点 | ⚠️ 需再实现合成、装备、进化分支 |
| `04-run-victory` | dev-short 三波通关 | ≤12000 | **胜利** | 完整链路：神池抽选 / 波间决策 / 波末 Boss / 遗物 / 结算 | ❌ 二期以后 |
| `05-run-defeat` | 低心防被突破 | ≤9000 | **失败** | breakthrough 承伤 / 失败结算 | ⚠️ 需实现突破伤害 |

**建议接入顺序**：Unity 一期只对 `01` 逐项比对；每扩张一个类别，再纳入下一个 fixture。
每个 fixture 实际触发了哪些子系统，看其 summary 的 `eventCounts`——那是权威清单，不要凭表格猜。

---

## 2. RNG：mulberry32（两端必须逐位一致）

```
state = seed >>> 0                      // uint32
每次抽取：
  state = (state + 0x6d2b79f5) mod 2^32
  t = state
  t = imul(t XOR (t >>> 15), t OR 1)
  t = t XOR (t + imul(t XOR (t >>> 7), t OR 61))
  return (t XOR (t >>> 14)) >>> 0 / 4294967296
```

- `imul` = **32 位有符号整数乘法**（取低 32 位）；C# 用 `unchecked((int)a * (int)b)`。
- `>>>` = 无符号右移；`>>> 0` = 转 uint32。
- 全过程只有最后一步除以 `2^32` 是浮点，因此序列可逐位复刻。
- **自检向量**（seed=42 的前 8 抽，保留 12 位小数）：
  `0.60110375192, 0.448290558998, 0.85246579349, 0.669734041439, 0.174813898746, 0.526592542185, 0.27322799433, 0.624744653935`
  Unity 端第一件事就是跑通这 8 个数；对不上就不必往下比了。
- **硬约束**：`src/core/**` 内禁止出现 `Math.random`（由 `tests/goldenReplay.test.ts` 守住）；rng 一律由调用方注入。

---

## 3. ReplaySpec 字段

```jsonc
{
  "id": "01-slice-combat",          // 主键，与文件名一致
  "description": "……",              // 人读说明，不参与比对
  "seed": 42,                       // rng 种子
  "variants": ["dev-short"],        // 配置 variant 名单（深合并覆盖 base，语义见 config/loader.ts）
  "difficulty": "hell",             // 可选，缺省 'hell'
  "dt": 0.03333333333333333,        // 固定时间步（秒）= 1/30
  "frames": 480,                    // 最多推进帧数；对局提前结束则提前收尾
  "start": "wave1",                 // 'wave1' 直接开第 1 波（不产生开局决策）；'run' 走开局波间（含神池抽选）
  "decisionPolicy": "firstCandidate", // 待决策时的确定性选择：第一个 / 最后一个候选
  "overrides": { "hp": 60, "maxHp": 60, "damage": 6, "fireRate": 0, "range": 60, "dropChance": 0 },
  "inputs": [ /* 见 §4 */ ]
}
```

**为什么需要 `decisionPolicy`**：`updateGame` 在 `decisions.current !== null` 时直接返回、**不推进时间**（交付说明 §3.1 门禁）。
没有选择策略，任何跨波对局都会卡死在决策上。策略是纯确定性的：取候选列表的首/末项。

**执行顺序（每帧，Unity 必须照此实现）**：
1. `updateGame(state, config, rng, dt)`
2. 若产生了待决策，就地按 `decisionPolicy` 依次清空决策队列（同一帧内，最多 16 次，防御死循环）
3. 执行本帧的脚本输入（同帧多条按声明顺序）
4. 记录新出现的掉落、累计伤害
5. `mode !== 'playing'` 则收尾

---

## 4. 脚本化输入（ReplayInput）

每条输入带 `frame`，并可选 `repeatEvery` / `repeatUntil` 做周期展开（`repeatUntil` 缺省 = `frames`）。

| kind | 字段 | 语义 |
|---|---|---|
| `spawnDrop` | `x, y, cardType, star` | **场景搭建用**：直接生成一枚掉落，避免依赖掉落 rng 才能构造合成场景。这是唯一不对应玩家动作的输入 |
| `collectAt` | `x, y, radius?` | 点击拾取 (x,y) 半径内最近的掉落（`radius` 缺省 = `economy.drops.pickupRadius`） |
| `collectFirstDrop` | — | 点击最早出现的地面掉落；场上无掉落时无动作 |
| `moveOrSwap` | `source, index, targetKind, targetIndex` | 拖拽：手牌/装备栏之间移动或交换 |
| `consumeAt` | `index, x, y` | 消耗释放：手牌 `index` 的卡在 (x,y) 落点释放 |
| `confirmIntermission` | — | 波间「准备完毕」，跳过剩余自由整备时间 |

**空动作是合法的**：目标槽位为空、场上无掉落等情况下动作静默无效——这保证了输入脚本不必预知运行时状态，重放仍然确定。

---

## 5. ReplaySummary 字段与比对口径

| 字段 | 类型 | Unity 比对口径 |
|---|---|---|
| `spec` | 输入回写 | **必须逐字相等**（确认两端跑的是同一份输入） |
| `framesRun` / `mode` / `win` | 标量 | **必须相等**（通关/失败结论不允许有分歧） |
| `wave` | `{wave, phase, spawnLeft, waveSpawnQuota, intermission}` | **必须相等**（波次推进是关键语义） |
| `eventSequence` | `[{frame, type}]` | **类型序列必须相等**；帧号允许 ±1 帧偏移（浮点累积） |
| `eventCounts` | `Record<type, number>` | **必须相等** |
| `dropSequence` | `[{frame, action, dropId, kind, cardType, star}]` | `action`/`cardType`/`star` 序列必须相等；`frame` 同上允许 ±1 |
| `cards` / `equipment` | 槽位快照（含 `affixes`、`evolutionPath`） | **必须相等** |
| `wildcards` / `relics` / `counters` | 计数与 id 列表 | **必须相等** |
| `enemiesRemaining` | 整数 | **必须相等** |
| `hp` / `maxHp` | 浮点 | 相对误差 ≤ **1e-6** |
| `cumulativeDamageDealt` / `cumulativeDamageTaken` | 浮点 | 相对误差 ≤ **1e-4**（逐帧累加，误差会放大） |
| `rng.draws` | 整数 | **必须相等**——这是 rng 调用次序的指纹，比任何数值都更早暴露分叉 |
| `rng.last` | 浮点 | 必须相等（同一序列的同一位置） |

> **H5 内部是逐位相等**（`toEqual` 全字段严格比对），上述容差**只对 Unity 生效**。

两个易错定义，Unity 必须照抄：

- `cumulativeDamageDealt` = 逐帧对**同 id** 敌人取 `max(0, 前帧hp − 本帧hp)` 求和。敌人消失那一帧的剩余血量**不计入**（死亡由 `counters.kills` 表达）。
- `cumulativeDamageTaken` = `breakthrough` 与 `bossContactDamage` 事件携带的 `damage` 之和。

---

## 6. 排查顺序（对不上时）

1. `rng.draws` 对不上 → 某个系统多抽/少抽了一次随机数：核对交付说明 §3.1 的单帧执行顺序与各系统内部的抽取次序。
2. `rng.draws` 一致但 `eventSequence` 分叉 → 判定次序问题（伤害结算/状态仲裁/触发器重入）：核对 §3.2。
3. 事件一致但数值超容差 → 积分/取整差异：核对 `dt` 语义、`dtCap`、像素→世界单位换算。
4. 只有 `cards`/`equipment` 不一致 → 合成/装备/词条掷点的 rng 消费位置不同。

---

## 7. 如何新增一个 fixture

1. 在 `tests/golden/` 新建 `<NN>-<名字>.spec.json`（编号决定录制与断言顺序）。
2. `npm run replay:record <id>` 生成 `<id>.summary.json`；不带参数则全量重录。
3. 在 `tests/goldenReplay.test.ts` 的 fixture 清单里登记 id，并按需补一条语义断言（"这个 fixture 到底覆盖了什么"）。
4. `npm run test` 全绿后连同 summary 一起提交。

**改动 fixture 的纪律**：summary 变了就是行为变了。先确认这是有意的玩法/规则变更，再重录；不要为了让测试变绿而重录。
