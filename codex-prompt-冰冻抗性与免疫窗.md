# 任务:修复冰冻(frost)对 Boss 的永冻锁——按类型 CC 抗性 + 解控免疫窗

## 背景与根因(已完成诊断,直接按此实施)

装备 frost 3★ 打 Boss 出现"全程冻结、零压力":

- frost 3★ onFire 每发命中 `slow 0.3/1.5s` + `freeze{ duration: 0.8, stacksToTrigger: 3 }`;
- 炮台默认 fireRate 5/s,每发加 1 层冻结,**3 层触发一次 0.8s 冻结**;
- 攒满 3 层耗时 3 ÷ 5 = **0.6s**,而冻结持续 **0.8s** > 0.6s;
- 冻结期间炮台仍持续命中、继续叠层,于是下一次冻结在上一次结束前就触发 → **冻结 100% 覆盖,Boss 永久定身**,毫无威胁。`amplifyAxis` 还能把 stacksToTrigger 降到 2 甚至 1,进一步恶化。

这与已修复的击退死循环是**同一类漏洞**:硬控原子(freeze/stun)缺少"抗性/免疫"维度。本次修复与击退保持一致的两层结构,让代码库形成统一的 CC 抗性模型:

1. **按敌人类型的硬控抗性 `ccResist`**(boss/tank 减免冻结·眩晕时长),缩短 Boss 被定身时间;
2. **解控后免疫窗 `ccImmune`**(冻结/眩晕结束后一小段时间内免疫再次硬控,且期间不累积冻结层),**保证 Boss 每轮必得一段行动时间**,从数学上打破永冻锁。

> 注意:只处理**硬控(freeze / stun,会把输入清零)**。**减速(slow)是软控,不受影响**——Boss 仍会被减速,frost 的手感与身份(“让世界慢下来”)保留,只是冻结从“永久”变“周期性”。

## 与已有击退修复的一致性

代码库已存在击退抗性/疲劳(`enemies.json` 的 `knockbackResist`、`combat.json` 的 `knockbackFatigue`、`EnemyStatus.kbFatigue`、`statusSystem.applyKnockback`)。本任务照同样的分层与落点实现,命名对齐:`ccResist`(每类型) + `ccImmunity`(combat 配置) + `EnemyStatus.ccImmune`(运行时)。所有仲裁集中在 `statusSystem.ts`,禁止散落到各原子(项目 P2 §2 正交性约束)。

## 具体改动

### 1. 配置:`src/config/base/enemies.json`

每个类型新增 `ccResist`(0~1,硬控时长 ×(1-ccResist)):

- normal: 0
- fast: 0
- tank: 0.25
- boss: 0.5

`src/config/base/combat.json` 新增免疫窗参数块(与 `knockbackFatigue` 并列):

```json
"ccImmunity": { "afterFreezeSeconds": 1.2, "afterStunSeconds": 0.8 }
```

同步 `src/config/types.ts`:`EnemyTypeDef` 加 `ccResist: number`;combat 配置类型加 `ccImmunity: { afterFreezeSeconds: number; afterStunSeconds: number }`。检查 `src/config/loader.ts` / `configLoader.test.ts` 是否需要默认值或校验跟随(参考 `knockbackResist` / `knockbackFatigue` 是怎么接的)。

### 2. 运行时:`src/core/types.ts`

`EnemyStatus` 新增字段:

```ts
/** 解控免疫窗:冻结/眩晕结束后一小段时间内免疫再次硬控,期间冻结层不累积。 */
ccImmune: number;
```

`emptyStatus()`(在 `statusSystem.ts`)初始化 `ccImmune: 0`。

### 3. 运行时:`src/core/effects/statusSystem.ts`

- **`applyFreeze(e, duration, stacksToTrigger?)`**:
  1. **最前面**加免疫闸:`if (e.status.ccImmune > 0) return;`(免疫期内既不触发冻结,也不累积层数);
  2. 叠层逻辑保持不变(stacksToTrigger 模式攒满才冻);
  3. 真正冻结时按类型抗性缩短:`const eff = duration * (1 - ccResist[e.type]); e.status.frozen = Math.max(e.status.frozen, eff);`。
- **`applyStun(e, duration)`**:同样在最前面加 `if (e.status.ccImmune > 0) return;`,并按 `ccResist` 缩短时长。
- **`tickStatusTimers()`**:
  - 推进 `ccImmune`:`if (s.ccImmune > 0) s.ccImmune -= dt;`
  - 冻结到期时开免疫窗并清层:把现有 `if (s.frozen > 0) s.frozen -= dt;` 改为检测“本 tick 由 >0 落到 ≤0”,落到 ≤0 时 `s.ccImmune = Math.max(s.ccImmune, cfg.combat.ccImmunity.afterFreezeSeconds); s.freezeStacks = 0;`
  - 眩晕到期时同理:落到 ≤0 时 `s.ccImmune = Math.max(s.ccImmune, cfg.combat.ccImmunity.afterStunSeconds);`
- 文件头 `CONFLICT_RULES` 注释表新增两条:`'freeze/stun × 类型抗性(boss/tank 减免时长)'`、`'硬控结束→免疫窗内免疫再控且不累积冻结层'`。冻结抑制击退的规则 2 保持不变。

### 4. 调用方检查(应无需改动,确认即可)

freeze/stun 原子(`registry.ts`)、frost 6★ interval 冻结、impact 5★/6★ 的 stun、consumable frost 大冻结——全部经由 `applyFreeze`/`applyStun`,自动获得抗性+免疫窗。consumable frost(手动一次性 3s 冻结)对 Boss 变 1.5s,属预期;不要为消耗态开豁免。

### 5. 可调参数(可选,建议做)

`src/config/base/tuner.json` 为四类型的 `enemies.types.*.ccResist` 加条目(min 0, max 1, step 0.05)。

## 测试要求

- 更新/新增 `tests/effectAtoms.test.ts`(注意现有第 28/32/50/143-156/197 行的 freeze/stun 断言会受影响,按新逻辑修正):
  - boss 类型受 `freeze duration 0.8` → `frozen === 0.4`(0.8 × 0.5);
  - normal 类型不受抗性影响,`frozen === 0.8`;
  - **免疫窗**:令敌人 `ccImmune` 到期流程后,窗口内再次 `applyFreeze` / `applyStun` 无效(frozen/stunned 不变、freezeStacks 不增);窗口耗尽后可再次冻结;
  - 冻结自然到期后 `ccImmune` 被置为 `afterFreezeSeconds` 且 `freezeStacks` 归零;
  - slow 不受 ccResist / ccImmune 影响(软控回归保护)。
- 新增**永冻锁回归测试**:模拟 Boss(fireRate 5、frost 3★ 每发叠 1 层、freeze 0.8/3 层)持续受击若干秒,断言冻结**并非 100% 覆盖**——存在 `frozen === 0 且 ccImmune > 0` 的行动窗口(即 Boss 每个周期必然获得移动时间),永冻数学条件不再成立。
- 跑全量 `npx vitest run`,修复所有因新字段(`ccResist`、`ccImmune`、`ccImmunity`)引入的类型/快照失败。

## 验收标准

1. 装备 frost 3★ 打 Boss:Boss 呈"冻一下→挣脱行动一段→再冻"的周期节奏,持续逼近并造成压力,不再永久定身;
2. 波末单个 tank 也不再被永冻锁死;
3. frost 对成群小怪的控场手感基本不变(首次冻结全额,减速全程有效);
4. 全部测试通过,无 lint/类型错误。

## 禁止事项

- 不要改 Boss 速度/HP、frost 的 0.8s 基础冻结时长或 stacksToTrigger 数值——数值身份不变,只加抗性/免疫窗两层;
- 不要让免疫窗/抗性影响 slow(软控)——否则破坏 frost 身份;
- 抗性与免疫仲裁必须集中在 `statusSystem.ts`,不得散落进各原子;
- 不要给"冻结抑制击退"(仲裁规则 2)引入回归。
