# -*- coding: utf-8 -*-
"""34 个效果原子的文案：人话 / 代码机制 / 叠加融合 / 坑。
参数表、允许触发器、词条缩放靶点、卡牌用例均由脚本从代码自动提取，不在此处手抄。
"""

M = "mono"


def c(s):
    return f'<font face="{M}">{s}</font>'


ATOMS = {
    # ============================ 弹道 ============================
    "pierce": {
        "plain": "子弹打穿一个敌人后继续往前飞，还能打到后面的人。每穿一个，伤害按比例衰减（也可以配成越穿越疼）。",
        "code": [
            f"装备态：不结算伤害，只<b>改写子弹字段</b>——{c('bullet.pierceLeft / damageRetention / rampPerPierce')}，"
            f"实际穿透判定在子弹碰撞逻辑里。",
            f"<b>仅对 projectile 投递生效</b>：{c('if (ctx.bullet && (!ctx.attack || ctx.attack.delivery === projectile))')}。"
            f"光束(line) / 迫击炮(lob) 形态下直接落到消耗态分支或什么都不做。",
            f"消耗态是<b>完全不同的一条路径</b>：沿「炮台→落点」轴发射一颗巨型贯穿弹，"
            f"半径 = {c('width')}、伤害 = 炮台总伤 × {c('damageMul')}、"
            f"穿透上限硬编码 999、存活时间 × 1.6（非契约常量 {c('PIERCE_CONSUME_LIFE_MUL')}）。",
        ],
        "fusion": "多张卡同时给 pierce 时，各自作用在自己那一发 attack 上；同一发子弹被多次写入则<b>后写覆盖</b>（不累加）。",
        "pitfalls": [
            "换成光束或迫击炮形态后穿透静默失效，且没有任何提示。",
            f"{c('damageRetention')} 在装备态默认 0.8、消耗态默认 1（{c('consumeDefault')}）——同一个参数两条路径两个默认值。",
            f"{c('width')} 与 {c('damageMul')} <b>只在消耗态有用</b>，装备态写了也读不到。",
        ],
    },
    "chain": {
        "plain": "打中一个敌人后，电流跳到附近的下一个，再跳下一个。每跳一次伤害衰减一点，同一个目标不会被跳两次。",
        "code": [
            f"命中路径（有 enemy）：{c('chainFrom()')} 从起点跳 {c('bounces')} 次，"
            f"用 {c('visited')} 集合去重，每跳伤害 × {c('damageRetention')}，"
            f"跳跃伤害标记来源 {c(chr(39)+'chain'+chr(39))}（可被 onKill 的 requiresSource 捕获）。",
            f"伤害基准三级回退：{c('ctx.attack.damage')} → {c('ctx.bullet.damage')} → "
            f"{c('ctx.baseDamage × damageMul')}。",
            f"无敌人载荷（interval / 消耗态）：先在 origin 附近取至多 {c('targets')} 个起点，"
            f"搜索半径 = {c('ctx.radius ?? totalRange()')}，每个起点各自跑一遍链。",
            f"{c('initialHit')} 逻辑：只有在既无 attack 也无 bullet 时才对起点补一次伤害——"
            f"避免与武器本身的命中伤害重复计算。",
        ],
        "fusion": "多来源各自独立成链，不合并。damageRetention 会被 effectDamageMul 轴放大但<b>硬封顶 1</b>（不会越跳越疼）。",
        "pitfalls": [
            "onFire 绑定时走 rider，实际是「命中后才连锁」；onHit 绑定时立即连锁。两者视觉相同但时序不同。",
            f"{c('targets')} 与 {c('bounces')} 是两个概念：前者是「开几条链」，后者是「每条链跳几次」。"
            "只有无敌人载荷时 targets 才生效。",
            "连锁击杀会递归触发 onKill，是 4 层深度守卫最常见的触发源。",
        ],
    },
    "split": {
        "plain": "一发子弹炸成好几个小弹片，朝随机方向飞出去。弹片伤害是原来的一部分，默认只裂一代（不会无限裂下去）。",
        "code": [
            f"生成 {c('count')} 颗 {c(chr(39)+'fragment'+chr(39))} 子弹，"
            f"方向随机、速度 = 主炮子弹速度 × 0.8、半径 × 0.8、存活 0.5s（均为实现内常量）。",
            f"{c('maxDepth')} 防指数增殖：弹片自身带 {c('splitDepth')}，"
            f"到达上限后再命中不再分裂。默认 1 = 只裂一代。",
            f"弹片带 {c('pendingOnFire: true')}，会各自走一遍统一攻击管线（因此弹片也能再触发 onFire 绑定）。",
            f"起点：有 enemy 时用敌人坐标，否则用 {c('ctx.origin')}；"
            f"有 enemy 时弹片的 {c('hitIds')} 预置该敌人 id，避免立刻回打原目标。",
        ],
        "fusion": "多来源各自独立生成弹片，数量相加。quantityAdd 词条按整数向上取整加到 count 上。",
        "pitfalls": [
            f"<b>{c('maxDepth')} 调到 2 以上会指数级增殖</b>，是最容易做出性能事故的旋钮。",
            "弹片伤害基准取的是「这一发攻击的伤害」，所以在光束形态下 damageRatio 的实际数值感受完全不同。",
        ],
    },
    "ricochet": {
        "plain": "子弹打中后不消失，而是改变方向去找下一个目标。",
        "code": [
            f"只写一个字段：{c('bullet.ricochetLeft = bounces')}，反弹寻的逻辑在子弹更新中。",
            f"与 pierce 同样<b>仅 projectile 投递生效</b>，且是全项目唯一 "
            f"{c('supports.consume = false')} 的弹道原子（消耗态不支持）。",
        ],
        "fusion": "同一发子弹被多次写入时后写覆盖。quantityAdd 词条加 bounces。",
        "pitfalls": [
            "全项目仅 3 处使用，是最少被验证的原子之一。",
            "光束/迫击炮形态下失效，且 runImpactRiders 里还有一道闸门专门拦截手工注入的 ricochet rider。",
        ],
    },
    "aoeOnHit": {
        "plain": "打中的地方炸开一小片，波及周围的敌人。越靠圈边伤害越低。",
        "code": [
            f"{c('explode()')}：圈内每个敌人伤害 = 基准 × "
            f"{c('damageRatio')} × (1 − {c('falloff')} × min(1, 距离/半径))。",
            f"伤害基准回退：{c('attack.damage')} → {c('bullet.damage')} → {c('baseDamage')}。",
            f"半径优先级：{c('params.radius')} &gt; {c('ctx.radius')}（消耗态档位）&gt; 契约默认 70。",
            f"爆炸伤害走 {c('dealDamage')}，因此<b>会产生事件</b>（emitsEvents = true），可能连锁触发 onKill。",
        ],
        "fusion": "多来源各自独立爆炸，伤害相加（无去重）。damageRatio 吃 effectDamageMul 轴。",
        "pitfalls": [
            f"爆炸<b>不走 resolveImpact</b>，所以不触发 onHit、不受 attack.hitIds 去重约束——"
            "多个 aoeOnHit 重叠时同一敌人会被算多次。",
            f"{c('falloff')} = 0 表示全圈满伤，1 表示边缘归零；这个参数对实际 DPS 影响约 ±30%，容易被忽略。",
        ],
    },
    "beamMorph": {
        "plain": "把主炮从「打子弹」改成「射一道持续光束」。光束会跟着当前瞄准方向横扫，打到线上所有人。",
        "code": [
            f"<b>两种完全不同的行为</b>，取决于绑在哪个触发器上：",
            f"① 绑 {c('passive')} → 进入 {c('getModifiers().weaponForms')}，"
            f"由 {c('composeWeaponForm()')} 参与主炮形态融合，"
            f"把 delivery 改成 {c(chr(39)+'line'+chr(39))}，"
            f"读取 {c('interval / duration / tickInterval / width / damageRatio')}。",
            f"② 绑其它触发器 → 调用 {c('beam()')}，<b>立即发射一道瞬时光束</b>："
            f"朝最近敌人方向，命中带宽内全部敌人，伤害 = 炮台总伤 × damageRatio，一次性结算。",
            f"passive 路径下的每周期伤害由 {c('updateTurret')} 换算："
            f"{c('cycleDamage = baselineDps × interval × deliveryDamageRatio')}，"
            f"再均分到 {c('round(duration / tickInterval)')} 个 tick——"
            f"<b>光束总伤是按 DPS 预算反推的，不是 damageRatio 直乘</b>。",
        ],
        "fusion": "多张 beam 卡时<b>只有 damageRatio 最高的一张胜出并全额生效</b>，其余被完全压制"
                  f"（记入 {c('suppressedSourceCardTypes')} 遥测）。整道光束共用一个 attack，对同一敌人只触发一次 onHit。",
        "pitfalls": [
            "<b>压制是「赢家通吃」而非衰减。</b>玩家同时装两张光束卡，弱的那张的换形效果完全消失。",
            f"{c('interval / duration / tickInterval')} <b>只在 passive 换形路径读取</b>，"
            "绑到 interval 触发器时这三个参数完全无效。",
            "光束形态会关闭 pierce / ricochet，并让 onHit 触发频率骤降——弹道流派的卡与光束卡是隐性反协同。",
        ],
    },
    "mortarMorph": {
        "plain": "把主炮改成抛射炮：炮弹飞到目标点落地炸开一圈。",
        "code": [
            f"① 绑 {c('passive')} → 进 weaponForms，delivery 变 {c(chr(39)+'lob'+chr(39))}，"
            f"并作为一条 {c('impact')} 叠加轴。",
            f"② 绑其它触发器 → 立即在 {c('ctx.origin')} 做一次 {c('explode()')}。",
            f"融合时 impact 独立叠加：第 1 个 mortar 全额，第 2 个及之后伤害 × "
            f"{c('cfg.combat.weaponFusion.damping')}、半径 × "
            f"{c('sqrt(cfg.combat.weaponFusion.areaMul)')}。",
            f"与光束共存时：若已有 beam 胜出，delivery 保持 line，mortar 仍以 impact 形式挂在光束上，"
            f"每次爆炸从 {c('impactShare')} 预算中分账。",
        ],
        "fusion": "mortar 之间是<b>叠加</b>（不是压制），但第 2 个起有 damping 衰减。beam 存在时 mortar 只贡献 impact，不抢 delivery。",
        "pitfalls": [
            f"{c('impactShare')} 是控制混装 build 强度的<b>主旋钮</b>，改它会同时影响所有 beam+mortar 组合。",
            "当前配置只有 1 张范围形态卡，damping / areaMul 实际未生效——这两个值目前是「纸面参数」。",
            "lob 投递下 pierce / ricochet 同样失效。",
        ],
    },
    # ============================ 控制 ============================
    "slow": {
        "plain": "让敌人走得慢一点，持续几秒。多个来源不叠乘，只取最狠的那个。",
        "code": [
            f"{c('applySlow(e, ratio, duration)')}：ratio 取 "
            f"{c('max(现有, 新)')}，剩余时长取 {c('max(现有, 新)')}。<b>不叠乘</b>。",
            f"速度换算：{c('speedMultiplier = 1 − ratio')}（不可动时直接 0）。",
            "onFire 绑定时走 rider 延迟到命中；其余触发器立即结算。",
            "<b>不受控制预算约束</b>——slow 属于软控，controlBudgetDenies 只拦 freeze / stun / knockback。",
        ],
        "fusion": "多来源<b>取最强</b>，时长取最长（statusSystem 仲裁规则 3）。ratio 吃 controlPotencyMul 轴，封顶 0.8。",
        "pitfalls": [
            "<b>堆多张减速卡几乎没有额外收益</b>，因为取最强而非叠乘。这是设计上最反直觉的一条。",
            f"slow 会让敌人进入 {c('isControlled')} 状态，从而吃到 controlledDamageTakenMul 的全局增伤——"
            "所以减速卡的真实价值在「开增伤窗口」而非降速本身。",
        ],
    },
    "freeze": {
        "plain": "把敌人原地冻住，完全不能动。可以配成「打够几层才冻」。冻结结束后有一段免疫窗，短时间内冻不住第二次。",
        "code": [
            f"{c('applyFreeze()')} 三道闸门：① {c('ccImmune > 0')} 直接返回；"
            f"② {c('stacksToTrigger')} 层数累计（未叠满只加层不冻结）；"
            f"③ 时长封顶 {c('cfg.combat.controlCeiling.freezeSeconds')}。",
            f"实际时长 = 封顶后时长 × (1 − 敌人 {c('ccResist')})；boss / tank 抗性更高。",
            f"施加前还要过 {c('controlBudgetDenies(state, e)')}——"
            f"群体战斗中会主动拒绝控制，保证场上留下足够的「自由推进者」。",
            f"结束时（{c('tickStatusTimers')}）写入 "
            f"{c('ccImmune = cfg.combat.ccImmunity.afterFreezeSeconds')} 并清零 freezeStacks。",
        ],
        "fusion": "多来源取<b>最长剩余时长</b>（max），不叠加。duration 吃 controlPotencyMul 轴（在封顶之前）。",
        "pitfalls": [
            "<b>冻结中击退无效</b>（仲裁规则 2）——冰系 + 击退系是硬冲突。",
            "<b>冻结时嘲讽暂停</b>——反正动不了。",
            "控制预算会静默拒绝施加，所以「大范围冻结」在敌人密集时的实际覆盖率远低于半径暗示的数量。"
            "这是刻意的体验保护，不是 bug。",
            f"{c('stacksToTrigger')} 未声明时立即冻结；声明为 1 时代码里 "
            f"{c('stacksToTrigger > 1')} 为假，行为等同于立即冻结。",
        ],
    },
    "stun": {
        "plain": "短暂打断敌人，让它站着不动。比冻结时间短，通常用来救急。",
        "code": [
            "<b>全项目唯一自行判定概率的原子</b>：" + c("runEffects") + " 的统一概率闸门"
            "明确跳过 stun（" + c("ef.atom !== 'stun'") + "），改由 stun 自己<b>逐目标</b>掷骰。"
            "因此「50% 眩晕」对一圈 10 个敌人是「每个各 50%」，不是「一半概率全体眩晕」。",
            f"其余与 freeze 同构：ccImmune 闸门 → 时长封顶 "
            f"{c('controlCeiling.stunSeconds')} → × (1 − ccResist) → 取 max。",
            f"同样受 {c('controlBudgetDenies')} 约束。结束后写入 "
            f"{c('ccImmunity.afterStunSeconds')} 免疫窗。",
        ],
        "fusion": "取最长剩余时长。duration 吃 controlPotencyMul 轴。",
        "pitfalls": [
            f"<b>chance 的语义与其它所有原子不同。</b>其它原子的 chance 是「这条效果整体要不要执行」，"
            "stun 的 chance 是「每个目标各自过不过」。写文案时别混。",
            f"stun 的 chance 契约默认值是 1（必定），而通用 CHANCE 没有默认值（未声明 = 必定执行）——"
            "结果相同但来源不同。",
        ],
    },
    "knockback": {
        "plain": "把敌人朝外推开一段距离。连续推同一个敌人会越推越短（疲劳），而且不会把射程内的敌人推到射程外。",
        "code": [
            f"{c('applyKnockback()')} 闸门链：冻结中直接返回 false → 距离封顶 "
            f"{c('controlCeiling.knockbackDistance')} → × 疲劳系数 → × (1 − {c('knockbackResist')})。",
            f"疲劳：每次成功击退后写 {c('kbFatigue.multiplier = max(minMultiplier, 当前 × decayFactor)')}，"
            f"窗口 {c('windowSeconds')} 内不断衰减，过期重置。",
            f"射程限位：{c('clampToRange = totalRange()')}——只拦「向外推出射程」，"
            f"<b>不会把射程外的敌人吸回来</b>（{c('maxAllowed = max(clampToRange, preDist)')}）。",
            f"{c('collisionDamage > 0')} 时检查相邻敌人，撞上则<b>双方各受</b> "
            f"炮台总伤 × collisionDamage（只撞第一个命中的，break）。",
        ],
        "fusion": "多来源各自独立推一次，但疲劳系数会连续衰减——密集击退的边际收益快速递减。distance 吃 controlPotencyMul 轴。",
        "pitfalls": [
            "<b>冻结中的敌人推不动</b>，返回 false，连带 collisionDamage 也不结算。",
            "受控制预算约束，群战中会被拒绝。",
            "collisionDamage 会伤到被击退者自己——做「撞击流」时要记得这份自伤其实是额外输出。",
        ],
    },
    "taunt": {
        "plain": "让敌人改去打指定的位置或召唤物，而不是直冲炮台。",
        "code": [
            f"{c('applyTaunt(e, sourceKey, priorityWeight, x, y, duration, summonId)')}："
            f"在 {c('e.status.taunt[]')} 中按 sourceKey <b>upsert</b>；同来源剩余时长取 max，坐标与 summonId 用新值。",
            f"未声明 {c('summonId')} 时嘲讽到 {c('ctx.origin')}；"
            f"声明后绑定到指定召唤物；召唤物一死只删除对应候选，并立即回退到下一候选。",
            f"{c('activeTaunt()')} 是唯一仲裁入口：priorityWeight 高者优先（默认 1），"
            f"再比 remaining，最后按 sourceKey 字典序决胜。",
            f"装备来源键为 {c('cardType/cardId/bindingIndex/effectIndex')}，消耗态为 {c('consume/cardType')}，都不含装备槽号。",
            "不受控制预算约束（不属于硬控）。",
        ],
        "fusion": "同来源 upsert；不同来源各自计时，由 activeTaunt 按权重、时长、稳定来源键确定赢家并支持失效回退。",
        "pitfalls": [
            "<b>冻结/眩晕期间嘲讽不生效</b>（仲裁规则 1，反正动不了）。",
            "显式 taunt 会计入 isControlled；环境召唤物的 tauntRadius 吸引仍不计入，两套权重也不互相竞争。",
            "正式配置目前只有冰晶壁垒 6★ aura 来源，但消耗态也能与它形成多来源候选。",
        ],
    },
    "vulnerable": {
        "plain": "给敌人挂个「破防」标记，让它接下来受到的所有伤害都变高。",
        "code": [
            f"{c('applyVulnerable(e, ratio, duration, maxStacks)')}："
            f"maxStacks &gt; 1 时按 {c('min(ratio × maxStacks, 现有 + ratio)')} 累加，"
            f"再与现有取 max；maxStacks = 1 时直接取 max。",
            f"消费点：{c('damageTakenMultiplier(e) = 1 + ratio')}，"
            f"在 {c('resolveImpact')} 中乘到伤害上。",
            "不受控制预算约束；但会让敌人计入 isControlled，从而叠加 controlledDamageTakenMul。",
        ],
        "fusion": "多来源<b>取最强</b>（仲裁规则 4），时长取最长。ratio 吃 controlPotencyMul 轴。",
        "pitfalls": [
            f"<b>{c('dealDamage')} 路径不一定过易伤。</b>只有 resolveImpact（武器命中）会乘 "
            f"{c('damageTakenMultiplier')}；DOT / 爆炸等直接调 dealDamage 的路径需逐条核对。"
            "这是易伤实际收益低于纸面的主要原因。",
            "是全项目使用最广的控制原子（74 处绑定），改默认值影响面极大。",
        ],
    },
    # ============================ 领域 ============================
    "aura": {
        "plain": "以炮台为中心的一圈常驻光环，每隔一段时间对圈内所有敌人施加一次里面写的效果。",
        "code": [
            "<b>契约锁死只能绑 passive</b>（" + c("allowedTriggers: ['passive']") + "），"
            "与两个合成经济原子一样，只允许放在 passive 下。",
            f"passive 路径：进 {c('getModifiers().auras')}，由 "
            + c('runtime.tickAuras()') + " 用独立时钟 " + c("'aura:卡id:绑定序号'") + " 推进；"
            f"每次脉冲对圈内每个敌人以 {c('zoneTick: true')} 跑一遍 "
            f"{c('params.effects')}。",
            f"半径：声明 {c('radius')} 优先；否则 "
            f"{c('radiusRatioOfRange × totalRange()')}——<b>会随射程成长</b>。",
            f"消耗态：走 {c('makeZone()')} 变成一块落点临时区域（此时才读 duration）。",
            f"tickInterval 有 {c('passiveDefault: 1')}（触发路径默认 0.8）。",
            f"颜色未声明时继承来源卡主题色（{c('resolveCardVisual(sourceCardType).accent')}）。",
        ],
        "fusion": "<b>按来源独立并行</b>，各有各的时钟，互不合并。多张光环卡 = 多份脉冲。",
        "pitfalls": [
            f"{c('duration')} 在 passive 常驻光环上<b>完全无效</b>（常驻无时限），只有消耗态读它。",
            f"嵌套效果在 zoneTick 上下文里跑，<b>dot 会变成直接掉血而非叠状态</b>（见 dot 词条）。",
            f"半径同时吃 areaScaleMul 轴的两个靶点（{c('radius')} 与 "
            f"{c('radiusRatioOfRange')}），只有声明的那个会被放大。",
            "光环脉冲频率高、目标是全场圈内，是最容易做出性能与体验双重失控的原子。",
        ],
    },
    "groundZone": {
        "plain": "在地上铺一块持续几秒的区域，站在里面的敌人每隔一段时间吃一次里面写的效果。",
        "code": [
            f"{c('makeZone()')} 往 {c('state.zones')} 推一个 Zone，"
            f"由 {c('runtime.tickZones()')} 每帧推进 remaining 与 tickTimer。",
            f"形状：{c('circle / ring / line')}。"
            f"{c('line')} 以 origin 为起点，长度 = {c('radius × 2')}、宽度 = {c('radius')}，"
            f"按敌人中心到线段距离 ≤ 半宽命中。",
            f"线形朝向优先取触发 {c('payload.point')} 相对炮台的方向；无 point 时从 origin 朝最近敌人；"
            f"两者都不存在时确定性回退 {c('+x')}，全程不读取 RNG。",
            f"ring 的内径未声明时 = {c('radius × 0.5')}。",
            f"消耗态 duration <b>硬性封顶 5 秒</b>（{c('cappedDuration')}，设计约束 R4）。",
            f"半径/时长优先级：{c('params')} &gt; {c('ctx.radius / ctx.duration')}（消耗态档位）&gt; 契约默认。",
            f"tick 时对区域内每个敌人以 {c('zoneTick: true')} 跑嵌套效果，"
            f"baseDamage 用<b>创建区域那一刻</b>快照的 {c('zone.baseDamage')}。",
        ],
        "fusion": "多块区域重叠时<b>各自独立结算</b>，敌人会被每块区域各打一次。",
        "pitfalls": [
            f"<b>baseDamage 是创建时快照。</b>区域存续期间玩家吃了增伤，已铺下的区域伤害不会更新。",
            f"{c('shape: line')} 的 radius 同时决定长度与宽度；areaScaleMul 放大 radius 时两轴会一起变大。",
            "使用最密集的原子（78 处绑定），且 tick 是「区域数 × 敌人数」的乘积，性能敏感。",
            f"areaScaleMul 轴同时放大 {c('radius')} 与 {c('duration')}，范围类词条对领域卡是双重收益。",
        ],
    },
    "dot": {
        "plain": "让敌人持续掉血，每隔一小段时间掉一次，持续几秒。",
        "code": [
            f"<b>两条完全不同的结算路径：</b>",
            f"① 普通路径 → {c('applyDot(e, perTick / tickInterval, duration)')}，"
            f"把 <b>DPS</b>（不是每跳伤害）挂到 {c('enemy.status.dots')}，"
            f"由 {c('runtime.tickDots')} 按帧累积 {c('dps × dt')} 后一次性 dealDamage。",
            f"② {c('zoneTick && ctx.enemy')} → <b>当场直接掉血</b> "
            + c('dealDamage(..., perTick, \'dot\')') + "，<b>不叠状态</b>。"
            f"aura / groundZone 内嵌 dot 走的是这条。",
            f"每跳伤害：声明 {c('damageRatio')} → 炮台总伤 × 该值；"
            f"否则用固定值 {c('damagePerTick')}（默认 5）。",
        ],
        "fusion": "普通路径下多来源 dot <b>各自入列、伤害相加</b>（applyDot 是 push，不去重不取强）——"
                  "这是少数真正线性叠加的控制/领域效果。",
        "pitfalls": [
            f"<b>{c('tickInterval')} 在普通路径上只用于把每跳伤害换算成 DPS</b>，"
            "实际掉血是按帧连续的，不会「一跳一跳」地跳。改 tickInterval 而不改 damageRatio 会等比改变总伤。",
            f"<b>区域内嵌 dot 每次脉冲直接结算一次全额 perTick</b>，"
            "所以「区域 tickInterval 0.5s + dot damageRatio 0.3」的真实 DPS 是 0.6 倍炮台总伤，容易低估。",
            f"{c('damageRatio')} 吃 dotDamageMul 轴，但 {c('damagePerTick')} <b>不吃</b>——"
            "用固定值配的 dot 完全无法被词条放大。",
        ],
    },
    "summon": {
        "plain": "召唤一个有自己血量的小单位。有三种：吸引火力的诱饵、会自己开火的镜像炮台、绕着炮台转的环绕体。",
        "code": [
            f"三种 kind：{c('decoy')}（纯挨打）、{c('mirrorTurret')}"
            f"（向 0.8 射程内最近敌人开火，伤害 = 总伤 × damageRatio）、"
            f"{c('orbital')}（绕炮台半径 85 公转并造成接触伤害）。"
            f"开火/接触冷却统一读取 {c('fireInterval')}：mirrorTurret 默认 0.7s、"
            f"orbital 默认 0.25s、decoy 为 0 且不开火；显式配置下限 0.05s。",
            f"装备态：每 <b>(卡, 绑定)</b> 严格<b>单实例</b>，键 = "
            f"{c('sourceCardId:sourceBindingIndex')}；"
            f"{c('remaining = undefined')} 表示常驻至来源消失。重复触发只会就地刷新属性。",
            f"{c('reconcileEquipmentPassives()')} 每帧对账：清理失去来源的召唤物、"
            f"收敛重复实例、补齐缺失实例。属性不匹配（{c('equipmentSummonMatches')}）时重建。",
            f"非装备态（消耗/临时）：按 {c('count')} 生成，带 "
            f"{c('SUMMON_GROUP_JITTER = 30')} 散布，读 duration 到期消失。",
            f"{c('placement: threatDirection')}：按 1/距离 加权的威胁方向放到炮台外围 "
            f"{c('distanceFromTurret')} 处；无敌人时按不含装备槽号的稳定来源键确定方位。",
            f"{c('respawnOnce')} 只对<b>被摧毁</b>生效，到期消失不重生，每实例限一次。",
            f"{c('tauntRadius')} 有 variantDefault：{c('orbital')} 默认 0（不嘲讽），其余 140。",
        ],
        "fusion": "每(卡,绑定)单实例，天然不叠。同卡内 "
                  f"{c('replacesEarlier: true')} 会删掉同卡更早绑定的召唤物（用于星级升级换代）。",
        "pitfalls": [
            f"<b>装备态 {c('count')} 与 {c('duration')} 无效</b>——单实例、常驻。"
            "写了不报错，但完全不生效。",
            f"{c('fireInterval')} 会参与装备实例对账；配置变化后现有实例会同步刷新，"
            "不需要等待召唤物被摧毁。",
            f"{c('hp')} 吃 defenseDurabilityMul 轴、{c('damageRatio')} 与 "
            f"{c('explodeDamageMul')} 吃 effectDamageMul 轴——召唤流吃两条不同的词条轴。",
            f"死亡爆炸半径硬编码 120（{c('explodeSummon')}），不是任何参数。",
        ],
    },
    # ============================ 经济 ============================
    "dropRateMul": {
        "plain": "提高地面掉落物出现的概率。装着就一直生效，没有触发时机。",
        "code": [
            f"<b>modifierOnly：触发时是 no-op</b>（{c('noopModifier')}）。"
            f"实际读取在 {c('getModifiers()')}：{c('m.dropRateMul *= mul')}。",
            "起点不是 1，而是 " + c("modifierTotal(state, 'dropRateMul').mul + .add")
            + "（运行时属性修饰器的贡献），再逐条乘上各装备的 mul。",
        ],
        "fusion": "<b>乘法叠加</b>（融合规则第 1 条）。",
        "pitfalls": [
            f"绑到非 passive 触发器<b>照样常驻生效</b>——getModifiers 不按触发器过滤。校验器也不报错。",
            f"若 {c('economy.normalDropTypePolicy.modifiersAffectTarget')} 关闭，"
            "所有提升掉落率的效果对普通掉落<b>完全失效</b>。这是一个域外开关。",
        ],
    },
    "dropLifetimeMul": {
        "plain": "让地上的掉落物躺得更久才消失，给玩家更多时间去捡。",
        "code": [
            f"modifierOnly，{c('getModifiers()')} 中 {c('m.dropLifetimeMul *= mul')}。",
        ],
        "fusion": "乘法叠加。",
        "pitfalls": ["与 expiryConvert 是同一条设计线（都在处理「来不及捡」），叠在一起时收益会互相稀释。"],
    },
    "xpMul": {
        "plain": "本局获得的经验变多，升级更快。",
        "code": [
            f"modifierOnly，{c('getModifiers()')} 中 {c('m.xpMul *= mul')}；"
            f"消费点在 {c('damageSystem')} 的击杀经验结算："
            f"{c('enemy.xp × killXpMul × (1 + xpGainBonus) × mods.xpMul')}。",
        ],
        "fusion": "乘法叠加。",
        "pitfalls": ["只影响击杀经验，不影响其它经验来源。"],
    },
    "extraDrop": {
        "plain": "额外多掉几张卡。可以指定掉在哪（命中点/击杀点/炮台脚下），也可以配星级权重。",
        "code": [
            f"<b>不是 modifierOnly</b>——这是唯一会真正生成掉落的经济原子。",
            "星级按 " + c('starWeights') + " 加权抽取（默认 " + c('{&quot;1&quot;: 1}') + "），"
            f"随后被 {c('cfg.economy.dropStarPolicy.bountyBossMax')} <b>硬性截断</b>。",
            f"卡型由 {c('selectUniformCardType()')} 均匀抽取（不走普通掉落的角色袋/探索保底逻辑）。",
            f"落点：{c('at = turret')} 用炮台坐标，其余用 {c('ctx.origin')}；"
            f"再加 {c('EXTRA_DROP_SCATTER = 60')} 的随机散布。",
            f"来源标记 {c(chr(39)+'skillExtra'+chr(39))}，会记入 {c('recordCardDropShown')} 遥测。",
        ],
        "fusion": "各来源独立生成，数量相加。",
        "pitfalls": [
            f"<b>starWeights 会被 dropStarPolicy 上限截断</b>，配了高星权重也可能一律降到上限。",
            "卡型是均匀随机的，不参与普通掉落的构筑导向逻辑——高频 extraDrop 会稀释掉落导演的调控效果。",
        ],
    },
    "expiryConvert": {
        "plain": "掉落物自然过期时，按概率转成经验，减少未拾取损失。",
        "code": [
            f"modifierOnly。{c('getModifiers()')} 先按卡实例折叠同卡后声明，再按规范来源序连乘失败概率。",
        ],
        "fusion": "同卡后声明覆盖；跨卡为 <b>1 − ∏(1 − ratioᵢ)</b>。例如 0.5 与 0.65 融合为 0.825。",
        "pitfalls": [
            "只对每枚过期掉落掷一次骰；不能拆成每来源独立掷骰，否则会改变 RNG 流并可能重复发 XP。",
            "ratio = 0 仍代表存在贡献并消费一次 RNG；chance 参数在 passive 聚合路径没有语义。",
        ],
    },
    "mergeMaterialRefund": {
        "plain": "普通同型合并或装备喂养升星后，按概率补回若干张同型低星素材卡。",
        "code": [
            f"modifierOnly，且契约锁死 {c("allowedTriggers: ['passive']")}。"
            f"{c('getModifiers()')} 按稳定装备来源序累积到 {c('mergeMaterialRefunds[]')}，聚合时绝不掷骰。",
            f"消费点是 {c('commitMerge()')}：仅 {c('merge / feed')} 会按 scope 过滤后逐条掷 "
            f"{c('rng() < refundChance')}；{c('wildcard / recipe')} 直接跳过且不读 RNG。",
            f"成功项先进入 {c('state.pendingMergeRefunds')}；当前合并循环稳定后由 "
            f"{c('flushMergeRefunds()')} 发牌，避免中途重入自动合并。",
            f"连续返还最多推进 {c('MAX_REFUND_ROUNDS = 4')} 轮；满手牌或超限的待发卡只记 lost，"
            "不会生成地面掉落。",
        ],
        "fusion": "多来源全部入列；按稳定来源序逐条独立掷骰，成功数量相加。",
        "pitfalls": [
            "<b>当前 skills.json 中 0 处使用</b>——只有契约、消费端与测试，现有卡牌行为和 RNG 流不变。",
            "返还星级会夹到 resultStar - 1；结果小于 1 时不发牌。",
        ],
    },
    "wildcardRewardBonus": {
        "plain": "在 Bounty 或波末 Boss 原本承诺的万能卡奖励上，再加若干张同星万能卡。",
        "code": [
            f"modifierOnly，且只允许 passive。{c('getModifiers()')} 按稳定来源序累积到 "
            f"{c('wildcardRewardBonuses[]')}，聚合时不掷骰。",
            f"Bounty 在 {c('createOffer()')} 组装奖励时掷完并冻结 count，展示与最终掉落共用同一个值。",
            f"Boss 在 {c('grantWaveBossReward()')} 组装地面奖励时加成；validation 的 "
            f"{c("kind: 'card'")} 分支直接跳过，不额外读取 RNG。",
            f"奖励仍由 {c('spawnWildcardDrop()')} 生成同一堆地面掉落，不直接写入库存。"
            "基线 count 为 0 时，加成命中也可以凭空生成一堆。",
        ],
        "fusion": "多来源逐条独立掷骰，命中的 count 全部加到该来源的一堆基线奖励上。",
        "pitfalls": [
            "<b>当前 skills.json 中 0 处使用</b>——现有 Bounty/Boss 的 RNG 顺序与奖励不变。",
            "未拾取的万能卡仍在地面，不计入结算分。",
        ],
    },
    "mergePulse": {
        "plain": "每次合成卡牌时，以炮台为中心放一圈伤害。合出的星级越高，伤害越高。",
        "code": [
            f"伤害 = {c('damagePerMergeCount × (ctx.merge?.resultStar ?? 1)')}。",
            "范围以<b>炮台</b>为心（不是 ctx.origin）；"
            + c("radius: 'all'") + " 表示全场（" + c('r = Infinity') + "）。",
            f"是唯一 {c('supports.consume = false')} 且 {c('emitsEvents = true')} 的经济原子。",
        ],
        "fusion": "各来源独立结算，伤害相加。",
        "pitfalls": [
            f"<b>只有绑在 onMerge 上才能拿到 resultStar</b>；绑别的触发器时 "
            f"{c('resultStar')} 回退为 1，伤害只有 1 倍系数。"
            f"（霜税 5★ 分支就把它绑在 onKill 上——那里的伤害恒为 damagePerMergeCount × 1。）",
            c("radius: 'all'") + " 是 number | enum 联合类型，是契约里唯一的类型联合，"
            "编辑器与校验都要特殊处理。",
        ],
    },
    # ============================ 防御 ============================
    "shield": {
        "plain": "给自己套几层护盾，每层能整次挡掉一次突破伤害。可以配成破碎后过几秒自动恢复。",
        "code": [
            f"<b>按「次数」而非「数值」吸收</b>：{c('absorbBreach()')} 中 "
            f"{c('shield.hits--')} 并直接 {c('return null')}（本次完全不掉血），"
            f"与突破伤害大小无关。",
            f"破碎时（hits 归零）依次：推 {c('shieldBroken')} 事件 → "
            f"触发 novaOnBreak（若有）→ 若 {c('regenSeconds != null')} 则开始再生倒计时。",
            f"再生由 {c('runtime.tickShield()')} 推进，完成后 hits 回满并推 "
            f"{c('shieldRestored')} 事件。",
            f"施加时若已有护盾则<b>就地合并</b>，不新建。",
        ],
        "fusion": f"<b>absorbHits 取最大，regenSeconds 取最小</b>（融合规则第 8 条）。"
                  f"当前 hits 也会被抬到 max（{c('cur.hits = Math.max(cur.hits, hits)')}）——"
                  f"重复触发 onWaveStart 会顺带补满护盾。",
        "pitfalls": [
            f"<b>护盾吸收成功仍会触发 onBreach 绑定</b>——「被突破就反击」的卡在有盾时也会响。",
            f"「每层挡整次」意味着<b>护盾对小怪和 Boss 同等有效</b>，这在 Boss 接触突破下价值极高。",
            f"{c('absorbHits')} 吃 defenseDurabilityMul 轴且按整数取整。",
        ],
    },
    "thorns": {
        "plain": "受到伤害时，按比例把伤害弹回给攻击者。",
        "code": [
            f"modifierOnly。{c('getModifiers()')} 中 "
            f"{c('m.thornsRatio += ratio')}——<b>加法叠加</b>。",
            f"契约默认 0（不写 = 没有反伤）。",
        ],
        "fusion": "<b>加法叠加</b>（融合规则第 2 条）。ratio 吃 retaliationMul 轴。",
        "pitfalls": [
            "默认值 0 意味着漏写参数等于原子不生效，且不报错。",
            "绑到非 passive 触发器仍然常驻生效。",
        ],
    },
    "breachReduction": {
        "plain": "敌人突破时对你造成的生命损失打折。多张卡的减免直接相加，但总减免最多 90%。",
        "code": [
            f"modifierOnly。{c('getModifiers()')} 中 "
            + c('m.breachReduction = min(0.9, m.breachReduction + ratio)') + "——"
            f"<b>逐条累加且每次都夹到 0.9</b>。",
            f"消费点：{c('absorbBreach()')} 末尾 {c('return damage × (1 − breachReduction)')}，"
            f"仅在护盾未吸收时走到。",
            f"上限常量 {c('BREACH_REDUCTION_CAP = 0.9')} 定义在 interpreter.ts，"
            f"<b>不属于任何原子参数</b>。",
        ],
        "fusion": "加法叠加，聚合后封顶 0.9。",
        "pitfalls": [
            "<b>封顶是硬上限</b>，堆到 0.9 之后再加完全无收益。多张减免卡的边际价值会突然归零。",
            "护盾吸收成功时这条完全不参与——护盾与减免是「或」不是「且」。",
        ],
    },
    "novaOnBreak": {
        "plain": "护盾被打碎的瞬间，自动向四周放一次冲击波，造成伤害并把敌人推开。",
        "code": [
            f"modifierOnly。{c('getModifiers()')} 先按卡实例折叠同卡后声明，再跨卡分轴取 max。",
            f"消费点：{c('absorbBreach()')} 的护盾破碎分支。"
            f"<b>作用半径硬编码 220</b>，不是任何参数。",
            f"对圈内敌人先 {c('applyKnockback')}（带射程限位）再 {c('dealDamage')}。",
        ],
        "fusion": "同卡后声明覆盖；跨卡 damage 与 knockbackDistance <b>独立取最大</b>。例如 {40,70} 与 {30,135} 得 {40,135}。",
        "pitfalls": [
            "damage 与击退不能相加，也不能每来源各执行一次；否则会改变强度、击退疲劳和事件顺序。",
            "damage = 0、knockbackDistance = 0 仍代表存在贡献；chance 参数在 passive 聚合路径没有语义。",
            f"半径 220 是硬编码，设计上无法调整冲击范围。",
            f"{c('damage')} 吃 retaliationMul 轴。",
        ],
    },
    "execute": {
        "plain": "血量低于某个比例的敌人直接被抹掉，不用再慢慢磨。",
        "code": [
            f"<b>两条路径</b>：① 触发式 → {c('tryExecute(state, config, rng, e, threshold)')} "
            f"对 targets 逐个判定；② passive 聚合 → "
            + c('m.executeThreshold = max(...)') + "，由 " + c('resolveImpact') + " 在每次命中后统一检查。",
            f"passive 路径的默认值是 {c('passiveDefault: 0')}（不处决），"
            f"触发路径默认 {c('0.15')}——同参数两个默认值。",
            f"passive 聚合<b>取最高阈值</b>（融合规则第 3 条）。",
        ],
        "fusion": "passive 取最高阈值；触发式各自独立判定。",
        "pitfalls": [
            f"<b>漏写 hpThresholdRatio 时，passive 路径等于关闭（0），触发路径等于 15%。</b>"
            "同一份 JSON 在两条路径上行为完全不同，是契约里最隐蔽的一处双默认值。",
            f"passive 处决检查只在 {c('resolveImpact')} 后执行——纯 DOT 或纯区域伤害杀不触发处决检查。",
        ],
    },
    # ============================ 共用 ============================
    "burstDamage": {
        "plain": "立刻在某个位置放一发范围伤害，倍率按炮台总伤算。最直白的「一下打一片」。",
        "code": [
            f"伤害 = {c('ctx.baseDamage × damageMul')}，对 "
            + c('targets(ctx, \'burstDamage\', p)') + " 逐个 dealDamage。",
            f"注意 <b>radius 只用于视觉</b>：伤害目标由 {c('targets()')} 决定"
            f"（有 enemy → 单体；无 enemy → ctx.radius ?? params.radius 圈内），"
            f"而 {c('retaliationNova')} 特效用的是单独算出的 radius 变量。",
            f"绑在 <b>onBreach</b> 上时 {c('damageMul')} 会被 retaliationMul 轴放大——"
            f"这是 buildModifierSystem 里<b>唯一按触发器限定的缩放例外</b>。",
        ],
        "fusion": "各来源独立结算，伤害相加。damageMul 吃 effectDamageMul 轴（全触发器）+ retaliationMul 轴（仅 onBreach）。",
        "pitfalls": [
            f"<b>绑 onHit 时 radius 无效</b>（只打命中的那一个）。要做「命中后炸一圈」应该用 aoeOnHit。",
            f"特效半径与实际伤害半径可能不一致（前者读 params.radius ?? ctx.radius ?? 100，"
            f"后者优先 ctx.radius）——消耗态下两者会对上，装备态下可能对不上。",
            "使用最广的共用原子（56 处绑定），是数值调整的高杠杆点。",
        ],
    },
    "focusPriority": {
        "plain": "给敌人打个「优先打这个」的标记，让炮台的索敌更倾向选它。可以只标记残血目标。",
        "code": [
            f"{c('applyBrand(e, weight, duration)')}：weight 与 remaining 都<b>取 max</b>。",
            f"消费点：{c('combatSystem.findTarget()')} 的索敌优先级链——"
            f"<b>紧急半径内最近 &gt; 活跃 Bounty 成员最近 &gt; brand 权重降序 &gt; 射程内最近</b>。",
            f"{c('hpThresholdRatio')} 可选：声明后只标记 "
            f"{c('e.hp / e.maxHp <= 阈值')} 的目标（如圣域 5★ 处刑印记）。<b>未声明 = 不筛血量</b>。",
        ],
        "fusion": "多来源取最高权重、最长时长。",
        "pitfalls": [
            f"<b>brand 优先级排在紧急半径和 Bounty 之后</b>——"
            "有敌人贴脸或 Bounty 活跃时，标记会被完全无视。",
            "标记不改变伤害，只改变选谁打。单目标场景下等于无效果。",
        ],
    },
    "restore": {
        "plain": "立刻回血。可以是固定数值，也可以按生命上限的百分比，两者能一起写。",
        "code": [
            c('state.hp = min(maxHp, hp + amount + maxHp × amountRatio)')
            + "——两个参数<b>相加</b>后统一封顶。",
            f"校验器强制：{c('amount')} 与 {c('amountRatio')} <b>至少要声明一个</b>"
            f"（两者契约默认值都是 0，全缺省等于什么都不做）。",
        ],
        "fusion": "各来源独立结算，即时生效，无叠加概念。",
        "pitfalls": [
            f"<b>不吃任何词条缩放轴</b>——AFFIX_SINKS 里没有指向 restore 的靶点。"
            "回血量是纯配置值，遗物和词条完全放大不了。",
            f"{c('maxHpAdd')} 类 statBuff 到期时会 {c('reconcileMaxHp')}，"
            "配合 restore 使用时要注意「先回血再掉上限」的顺序问题。",
        ],
    },
    "statBuff": {
        "plain": "在一段时间内提高自己的某项属性（伤害、攻速、射程、掉率……）。可以配成叠好几层。",
        "code": [
            f"往 {c('state.statModifiers')} 推一条带 "
            + c('sourceId = statBuff:卡id:属性:运算') + " 的修饰器，"
            f"由 {c('runtime.tickStatModifiers')} 倒计时移除。",
            f"叠层：同 sourceId 的条数 &lt; {c('maxStacks')} 时新增；"
            f"达到上限时<b>刷新剩余时间最短的那一条</b>（而不是拒绝或新增）。",
            f"{c('stat')} 的合法值域是 {c('RUNTIME_STAT_KINDS')}（19 项），"
            f"包含 damage / fireRate 与全部 CardStatKind。",
            f"{c('value')} 有 variantDefault：{c('operation = mul')} 时默认 1（乘法恒等元），"
            f"{c('add')} 时默认 0（加法恒等元）。",
            f"校验器额外约束：duration 必须 &gt; 0；mul 时 value 必须 &gt; 0。",
            f"{c('stat = maxHpAdd')} 时会立即 {c('reconcileMaxHp(state)')}。",
            f"消耗态 duration <b>封顶 5 秒</b>（cappedDuration，设计约束 R4）。",
        ],
        "fusion": "按 sourceId 分组，同卡同属性同运算共享层数上限；不同卡各自独立成组。",
        "pitfalls": [
            f"<b>sourceId 不含 bindingIndex</b>——同一张卡的两个绑定给同一属性加 buff 时会共用层数池，"
            "互相刷新。想要独立叠层必须换 stat 或换卡。",
            f"<b>装备态 sourceId 用 cardId，消耗态用 cardType</b>"
            "（" + c("ctx.sourceCardId ?? ctx.sourceCardType ?? 'anonymous'") + "）——"
            "同一张卡的装备态与消耗态 buff 互不干扰，这通常是想要的，但要意识到。",
            f"stat 是 3 个 required 参数之一（stat / operation / value / duration 均 required），"
            "但 registry 仍保留 damage / mul / 1 / 3 的兜底以防手工注入的残缺数据。",
            "使用极广（60 处绑定），且 stat 值域跨 19 种属性——改这里等于改半个数值系统。",
        ],
    },
}
