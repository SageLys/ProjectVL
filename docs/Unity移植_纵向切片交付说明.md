# Unity 移植 · 纵向切片交付说明

日期：2026-07-26 ｜ 交付对象：Unity 开发者 ｜ 上游：`docs/接下来任务计划_v1.md`

本文件是给 Unity 开发者的开工契约。**目标不是把整个网页游戏翻译成 Unity，而是先打通一条端到端链路验证接口，再按原子类别扩张。** H5 原型是"可执行的规则参考实现"与调试基准，不是要照搬的前端。

---

## 一、开工就绪定义（Definition of Ready）

以下全部满足即可开工（不必等 H5 侧的契约固化代码全部完成）：

1. ✅ 模块三分类清单已定（见 `docs/接下来任务计划_v1.md` §1）。
2. ✅ 核心更新契约已定（本文件 §三）。
3. ✅ 配置权威源 = JSON，Unity **只读不反向写**（见 §五）。
4. ✅ 效果原子参数契约已定：`src/core/effects/atomContract.ts`（当前 34 原子的参数/默认值/触发器/形态支持），核对记录见 `docs/效果原子参数契约_落地记录.md`。
5. ✅ 一组固定 seed 黄金 fixture 已产出：`tests/golden/`，字段定义与比对口径见 `docs/黄金回放_fixture规格.md`。

---

## 二、Unity 一期只做纵向切片（范围边界）

**做**：一条端到端链路 + 一次跨引擎对照。**不做**：全部卡牌、全部遗物、全部文案、完整调参编辑器、全部 VFX、全部怪物机制、神池/进化/Bounty。

链路（12 步，必须按 H5 的语义实现）：
1. 读取同一套 JSON 配置（`config/base/*.json`）。
2. 构建基础 `GameState`（对齐 `core/createInitialState.ts` 的字段与初值）。
3. 固定时间步推进（`dt` 语义见 §三）。
4. 出现一种敌人（`enemies.json` 里最基础的一型）。
5. 炮台自动索敌 + 开火 + 伤害结算。
6. 一次掉落 + 一次拾取。
7. 一次合成（二合、同类型唯一）。
8. 一张卡的**装备态**（选一个简单触发绑定，如 `onHit` + `slow`）。
9. 一张卡的**消耗态**（拖入战场落点释放，如 `groundZone`）。
10. 一个触发器 + 一个状态效果（走 `statusSystem` 的控制预算/冲突仲裁）。
11. 核心 `GameEvent` 传给 Unity 表现层（Unity 自行实现表现，不进 core）。
12. 与 H5 黄金 fixture 对照（§六）。

通过后按此顺序扩张：弹道 → 控制 → 领域 → 防御 → 经济 → 神池/遗物/进化。

---

## 三、核心更新契约（H5 与 Unity 必须逐条一致）

### 3.1 单帧执行顺序（来自 `core/updateGame.ts`，权威）
每帧 `updateGame(state, config, rng, dt)`：

1. **门禁**：`mode !== 'playing'` 或 `paused` 或存在待处理决策（`decisions.current !== null` 或 `decisions.pending.length > 0`）→ 直接返回空事件，**不推进时间**。
2. **波间**：`intermission.active` 为真 → `state.time += dt` 后走 `tickBetween`，返回其事件（波间只推进波间逻辑，不跑战斗）。
3. 否则战斗帧，严格按此顺序：
   1. `state.time += dt`
   2. `tickOrdinaryDropBudget(dt)`（普通掉落额度累积）
   3. `updateTurret` → 事件（索敌 + 开火）
   4. `tickSpawns`（出怪）
   5. `updateBullets` → 事件
   6. `moveEnemies` → 事件
   7. `tickBountySystem` → 事件
   8. `tickEffects` → 事件（**区域/光环/召唤物/护盾/状态/interval 绑定统一在实体推进之后 tick**）
   9. `tickDrops` → 事件
   10. `updateParticles`（纯表现，Unity 可自行实现，不影响规则）
   11. `advanceWavePhase` → 事件（波次推进/结算）
4. 返回累积的 `GameEvent[]`。

> **不变量**：暂停与"有待决策"时时间不推进；波间与战斗互斥；效果运行时始终在实体推进之后。任一顺序变化都可能造成两端结果分叉。

### 3.2 待 H5 侧补全并写入规格（Unity 需要，H5 T0.4 会正式产出）
- **RNG 播种规则**：`rng: () => number` 注入点、每系统内的调用次序（决定掉落/暴击/权重抽样的可重放性）。
- **伤害结算顺序**：`damageSystem.dealDamage` 内的减免/护盾/反伤/处决判定次序。
- **触发器重入/递归规则**：`split`/`chain` 的 `maxDepth`、rider 挂载、`cooldownSeconds` 语义。
- **状态冲突仲裁**：`statusSystem` 取最强/延时、控制预算 `controlBudgetDenies`。
- **派生属性对账**：装备变化后 `reconcileMaxHp`/`totalDamage` 等 `AFFIX_SINKS.globalConsumer` 的重算时机。
- **局内热更策略**：一局内是否允许换配置（当前：`variant` 切换 = 带参重载，保证一局内不漂移）。

### 3.3 数值语义
- 单位：像素 → 世界单位的换算比在规格书写死。
- 浮点：**做统计一致，不做逐位一致**（见 §六容差）。
- 时间步：约定 `dtCap`（单帧 dt 上限）以防长卡顿放大积分误差；两端一致。

---

## 四、效果解释器移植要点

- 卡 = 数据（JSON）+ 通用解释器（触发器 → 效果原子）。**Unity 侧只写解释器，禁止为某张卡写 if**——与 H5 架构规则一致。
- 参数已是"按 atom 判别的强类型"（`EffectDef` 判别联合，见 `core/effects/defs.ts`）。Unity 侧据此生成 C# DTO 或自定义反序列化；**默认值一律以 `core/effects/atomContract.ts` 的 `ATOM_CONTRACT` 为准**（H5 运行时也从这张表读兜底，不再有内联默认值），其中 `consumeDefault` / `passiveDefault` / `variantDefaults` 表示同一参数在不同结算路径下的兜底差异，Unity 必须一并实现。
- 一期只需实现链路里用到的原子（如 `slow`/`groundZone`）；扩张阶段按类别补齐。

---

## 五、配置消费规则（D3）

- **JSON 是唯一权威源**。Unity 直接读 `config/base/*.json` 与 `variant` 覆盖（深合并语义见 `config/loader.ts`）。
- Unity 可把 JSON 导入为 ScriptableObject **作为运行时缓存/资产**，但 **SO 不是第二套真相，不得在 Unity 里手工改数值再回写**。改数值一律回到 JSON。
- 文案：Unity Localization 的 String Table 由同一份外部文案表（`data/texts.json` 及后续本地化表）导入。
- 索敌抽象：一期只有自动索敌。请把索敌封装成接口 `ITargetProvider`（`AutoTargetProvider` 先行，`ManualAimTargetProvider` 预留），以便将来加手动瞄准不改攻击系统。

---

## 六、跨引擎黄金对照协议

**完整规格见 `docs/黄金回放_fixture规格.md`**（字段定义、rng 算法与自检向量、逐项容差、排查顺序、如何新增 fixture）。要点：

- H5 侧已产出 5 个 fixture（`tests/golden/`）：`<id>.spec.json` 是输入，`<id>.summary.json` 是期望输出，两者都是 JSON，Unity 直接读同一批文件。
- 覆盖：①纯战斗切片（无决策无输入，**Unity 一期即可完整复刻**）②消耗态释放 ③合成升星+装备态 ④三波通关 ⑤突破失败。
- rng = mulberry32，算法与常量见规格书 §2；Unity 端第一件事是跑通 seed=42 的前 8 抽自检向量。
- 验收：**关键语义必须一致**（事件类型序列、掉落序列、通关/失败结果、波次推进、`rng.draws` 抽取次数）；**数值按规格书 §5 的逐项容差**（H5 内部是逐位相等，容差只对 Unity 生效）。
- 这是"复刻正确"的唯一客观验收标准；任何一致性失败先查 §3.1 执行顺序与 §3.2 判定次序（规格书 §6 给了排查顺序）。

---

## 七、给 Unity 开发者的三条硬约束

1. **先切片，后扩张**：一期不追求功能齐全；端到端跑通 + 黄金对照通过，才逐类扩张。
2. **core 不依赖引擎**：Unity 的规则层同样只接收 `state + config + dt + rng` 返回状态变更与事件；表现/输入/UI 分层，副作用由事件驱动。
3. **配置只读**：一切数值来自 JSON；发现配置问题反馈给 H5 侧改 JSON，不在 Unity 私自改。
