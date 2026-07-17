# 任务:修复击退(impact)对 Boss 的死循环——按类型击退抗性 + 连续击退递减

## 背景与根因(已完成诊断,直接按此实施)

装备 impact 3★(onFire 每发命中击退 22px)打 Boss 时出现死循环:Boss 速度 20 px/s、炮台射速 5/s、射程 150,每个射击间隔 Boss 只前进 20/5 = 4px,却被推回 22px,于是 Boss 永久卡在射程边缘,有效 DPS 从 90 掉到约 16,玩家零压力干等数分钟。

死循环的数学条件:`击退距离 > 敌速 ÷ 射速`。这不是 impact 整体超模,也不是 Boss 太慢,而是击退原子缺少"抗性/递减"维度的系统性漏洞——单个 normal 怪(24/5 = 4.8 < 22)同样会被无限杂耍,只是平时成群+血少不明显。

修复分两层,两层同时做:

1. **按敌人类型的击退抗性**(boss 高抗、tank 中抗),恢复 Boss 战压力;
2. **同一敌人短窗口内连续击退递减**,修掉"波末单怪被无限杂耍"的通病。

## 具体改动

### 1. 配置:`src/config/base/enemies.json`

每个敌人类型加 `knockbackResist`(0~1,受到的击退距离 ×(1-resist)):

- normal: 0
- fast: 0
- tank: 0.4
- boss: 0.85

`src/config/base/combat.json` 新增击退递减参数块:

```json
"knockbackFatigue": { "decayFactor": 0.5, "windowSeconds": 2, "minMultiplier": 0.125 }
```

同步更新 `src/config/types.ts` 中对应的类型定义(EnemyTypeDef 加 `knockbackResist: number`;combat 配置类型加 `knockbackFatigue`)。检查 `src/config/loader.ts` / `configLoader.test.ts` 是否有需要跟随的校验或默认值。

### 2. 运行时:`src/core/effects/statusSystem.ts`

- `EnemyStatus`(位于 `src/core/types.ts`)新增击退疲劳字段:
  ```ts
  /** 击退疲劳:短窗口内连续击退按 multiplier 递减;窗口过期重置。 */
  kbFatigue: { multiplier: number; remaining: number } | null;
  ```
  `emptyStatus()` 初始化为 `null`。
- `applyKnockback(e, fromX, fromY, distance)` 修改(签名不变,内部计算实际位移):
  1. 冻结中仍然无效(保留现有仲裁规则 2);
  2. `effective = distance × (1 - knockbackResist[e.type]) × (e.status.kbFatigue?.multiplier ?? 1)`;
  3. 按 effective 位移;位移后更新疲劳:`multiplier = max(minMultiplier, 当前 multiplier × decayFactor)`,`remaining = windowSeconds`;
  4. 返回值语义不变(是否实际发生位移;effective ≤ 0 时返回 false 且不写疲劳)。
- `tickStatusTimers()` 推进 `kbFatigue.remaining`,≤0 时置回 `null`。
- 文件头部的 `CONFLICT_RULES` 注释表新增两条:`'击退 × 类型抗性(boss/tank 减免)'`、`'连续击退短窗递减,窗口过期重置'`。

### 3. 调用方检查(不应需要改动,但要确认)

`applyKnockback` 的三处调用:`registry.ts` 的 knockback 原子、`runtime.ts` 的 summon explodeOnDeath 与 novaOnBreak。签名不变,均自动获得抗性+递减。impact 的消耗态(一次性大击退 80~180)受递减影响极小,符合预期;5★ onBreach 冲击波、6★ interval 脉冲对 Boss 打折是刻意设计,不要为它们开豁免。

### 4. 可调参数(可选,建议做)

`src/config/base/tuner.json` 为四个类型的 `enemies.types.*.knockbackResist` 加条目(min 0, max 1, step 0.05)。

## 测试要求

- 更新/新增 `tests/effectAtoms.test.ts`:
  - 现有 knockback 位移断言若因新字段失败,按新公式修正;
  - 新增:boss 类型敌人受 distance 60 击退,实际位移 = 60 × 0.15 = 9;
  - 新增:同一敌人 2 秒内连续三次击退,位移依次 ×1、×0.5、×0.25;窗口过期(>2s)后重置回 ×1;
  - 新增:冻结中击退仍返回 false、不产生疲劳。
- 新增一个数值回归测试(可放 `tests/effectAtoms.test.ts` 或独立文件):模拟 Boss(speed 20)在射程边缘持续受 fireRate 5、每发击退 22 的射击——断言 Boss 与炮台距离单调收敛(即每个射击间隔净位移为负:22 × 0.15 × fatigue < 4),死循环不再成立。
- 跑全量 `npx vitest run`,修复所有因新字段(`kbFatigue`、`knockbackResist`)引入的类型/快照失败。

## 验收标准

1. 装备 impact 3★ 打 Boss:Boss 被每发轻微顿挫但持续逼近,不再卡在射程边缘无限循环;
2. 波末单个 normal/fast 怪不再被无限杂耍(连续击退迅速衰减到 ×0.125);
3. impact 对成群小怪的控制手感基本不变(首次击退全额);
4. 全部测试通过,无 lint/类型错误。

## 禁止事项

- 不要改 Boss 速度、HP 或 impact 的 22px 基础距离——数值身份保持不变,只加抗性/递减两层;
- 不要在各原子里散落仲裁逻辑,抗性与递减必须集中在 `statusSystem.ts` 的 `applyKnockback`(项目 P2 §2 正交性约束);
- 不要给冻结豁免逻辑引入回归。
