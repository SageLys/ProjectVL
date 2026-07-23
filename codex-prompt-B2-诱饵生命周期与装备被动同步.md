# 任务:修复诱饵(decoy)装备态全流程失效——装备被动同步 + 单实例生命周期 + 外围放置

前置:先完成 B1(统一攻击管线与融合契约)。本任务只动召唤物生命周期,不依赖 B1 的光束/榴弹改动,但 EffectCtx 扩展要基于 B1 后的代码。

## 背景与根因(已完成诊断,直接按此实施)

玩家体感"诱饵不生效,射程内外都一样"。核对代码后确认装备态诱饵**在功能上完全死亡**,由四个缺陷叠加:

1. **装备后不立即生成**:诱饵装备态绑定 `onWaveStart`(`src/config/base/skills.json` decoy 3/5/6★)。`equipmentSystem.moveOrSwap` 只移动卡牌并发事件,没有任何"装备时初始化被动"的流程。波中途装备 → 本波什么都不发生。
2. **生成在炮台正中心**:`interpreter.baseCtx` 中 origin 缺省 = 炮台坐标(约 L94);onWaveStart 不传 point;summon 原子 count=1 时 jitter=0(registry 约 L311-318)→ 诱饵与炮台完全重叠。
3. **中心放置导致物理上永远不被触碰**:`enemySystem.moveEnemies` 中敌人撞召唤物的判定半径是 `16 + e.r`(normal=32/fast=28/tank=38),而炮台突破判定 `breakthroughDist=48` **更大且先于走到召唤物碰撞距离达成**(两判定在同一循环内,突破在敌人距炮台<48 时就把敌人移除了)。所以与炮台同心的诱饵:敌人先突破消失,诱饵永远不掉血、不爆炸、不重生。嘲讽半径 140 也只是让敌人"改为走向同一个点"。
4. **跨波累积 + 无卸载清理**:duration=999(`cappedDuration` 对装备态不封顶),每波 onWaveStart 再召一个,普通波间流转不清 summons(只有 `jumpToWave` 清)。诱饵既然不会死,会每波+1 无限堆叠;卸下装备后旧诱饵仍在。6★ mirrorTurret 同样存在 2/4 两个问题(tauntRadius 2000 + priorityWeight 5,全场敌人都会走向炮台中心的镜像塔,同样先突破)。

附带确认:渲染顺序 `drawSummonsAndShield` 在 `drawTurret` 之前(canvasRenderer),同心时诱饵被炮台盖住——放置修好后此问题自然消失,表现增强放 B3。

现有测试(skillsBatch1 decoy 段)只直接调 `fireTrigger('onWaveStart')` 断言 summons 数组,未覆盖装备流程/放置/多波/拦截,全部需要补。

## 具体改动

### 1. 召唤物来源标记(`src/core/types.ts` + `registry.ts` + `interpreter.ts`)

- `Summon` 新增:`sourceCardId?: number; sourceBindingIndex?: number;`(消耗态释放的召唤物不带来源,保持现有到期逻辑)。
- `EffectCtx` 新增 `sourceCardId?/sourceBindingIndex?`;`fireTriggerBindings`/`tickIntervalBindings` 构造 ctx 时从 `equippedBindings` 的 `{ card, bindingIndex }` 填入;summon 原子写到生成的召唤物上。

### 2. 装备被动同步函数(`src/core/effects/` 新文件或并入 interpreter)

```ts
export function reconcileEquipmentPassives(state: GameState, config: Config, rng: Rng): GameEvent[]
```

语义(声明式对账,不是事件流):

1. 枚举当前生效装备的全部含 `summon` 原子的绑定,得到期望集合 `(cardId, bindingIndex) → params`;
2. **孤儿清理**:`state.summons` 中带来源标记、但来源已不在期望集合(卡被卸下/替换/升星后绑定变化)的 → 移除(可留 0.3s 消退粒子,非必须);
3. **缺失补齐**:期望集合中尚无对应实例的 → 立即按放置规则(见 §3)生成一个;
4. **单实例保证**:同一 `(cardId, bindingIndex)` 至多一个实例;summon 原子在装备态(ctx 带来源)下若实例已存在,改为**刷新**:回满 HP、按放置规则重新定位、`respawned=false`(5★ 每波重获一次重生),**不再 push 新实例**。消耗态(无来源)行为不变。

调用点:

- `equipmentSystem.moveOrSwap` 成功变更装备栏后(含 feed 升星路径);
- `equipmentSystem.consumeCard` 消耗装备栏卡后;
- `waveSystem.startNextWave` 的 `fireTrigger('onWaveStart')` 之后(onWaveStart 里的 summon 走"刷新"分支,天然实现每波重定位+回血,不累积);
- 装备态诱饵不再依赖 duration:生成时 `remaining = undefined`(常驻,生命周期由 reconcile 管理)。skills.json 中装备态 `duration: 999` 参数删除。

### 3. 放置规则(通用参数,写进 skills.json 的 summon params)

skills.json 装备态 summon 参数新增(消耗态不加,仍落点放置):

```json
{ "placement": "threatDirection", "distanceFromTurret": 150 }
```

- `threatDirection`:取当前场上敌人按 `1/dist` 加权的平均方位角,在炮台外 `distanceFromTurret` 处放置;
- 无敌人时回退:按装备槽序号均分方位(`slotIndex / 装备槽数 × 2π`),结果可预测;
- 实现放在 summon 原子或 reconcile 的共享 helper;镜像炮台(6★)同样适用。
- 数值(140 嘲讽半径等)**保持不动**——先让机制活过来,强度调整等表现与测试齐了再说。

### 4. 5★ respawnOnce 语义

- 保持"被摧毁(非到期)才重生、每实例一次"(runtime.tickSummons 现有逻辑);
- 每波刷新时 `respawned=false`(见 §2.4),即"每波至多重生一次"。

### 5. 已知交互确认(不改,写注释)

- 敌人撞诱饵是"消散不给击杀奖励"(moveEnemies 注释已写明),放到外围后这会真实发生——确认这是刻意设计,在 designNotes 补一句,防止后续被当 bug。
- waveBoss 撞诱饵清嘲讽继续走(现有),保留。

## 明确不做

- 嘲讽半径圈、被吸引指示线、受击/爆炸/重生反馈等表现 → B3。
- 不调诱饵 HP/半径/爆伤数值。

## 测试要求(新建 `tests/summonLifecycle.test.ts`,vitest)

用真实装备流程(`moveOrSwap` 放入装备栏),不要直接 `fireTrigger`:

1. 波中途装备 decoy 3★ → 立即出现 1 个诱饵,且不在炮台中心(距炮台 ≈ distanceFromTurret);
2. 诱饵放在威胁方向:在固定位置造敌人,断言诱饵方位角朝向敌群;无敌人时按槽位角回退;
3. 嘲讽拦截真实发生:射程外/内敌人进入嘲讽半径后移动目标变为诱饵,最终撞诱饵消散、诱饵掉血(不再是先突破);嘲讽半径外敌人不受影响;
4. 连续 3 波(走 startNextWave)→ 始终恰好 1 个对应诱饵,每波回满血、可重定位;
5. 卸下装备(moveOrSwap 移回手牌)→ 诱饵立即消失;替换成其他卡同理;
6. 5★:被摧毁重生一次,同波第二次摧毁不再重生;下一波刷新后重生资格恢复;
7. 6★ mirrorTurret:同样单实例、外围放置、卸下清理;
8. 消耗态诱饵(手牌点放)不受影响:仍落点生成、按 duration 到期(回归现有 skillsBatch1 断言)。

## 验收标准

装备诱饵卡的瞬间画面上就出现在炮台外围的诱饵;敌人成群改道去撞它;它会掉血、爆炸、(5★)重生;换波不堆叠;卸下即消失。
