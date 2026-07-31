# -*- coding: utf-8 -*-
"""触发器章节文案：人话 / 代码机制 / 触发参数 / 用例 / 坑。"""

TRIGGERS = [
    {
        "name": "onFire",
        "cn": "开火时",
        "sub": "每次开火时",
        "plain": (
            "炮台每打出一次攻击，就触发一次。这是「给这一发攻击加装配件」的唯一时机——"
            "穿透、弹射、分裂、命中爆炸、以及各种命中时才生效的状态，"
            "都要挂在这里，等子弹真的打到人身上才生效。"
        ),
        "code": [
            "调用点：<b>combatSystem.beginAttack()</b>——每创建一个 AttackInstance 立刻 "
            "<font face=\"mono\">fireTrigger('onFire', { attack, bullet })</font>。",
            "载荷：<font face=\"mono\">attack</font>（统一攻击实例，必有）+ "
            "<font face=\"mono\">bullet</font>（仅 projectile / lob 投递有实体弹；line 光束为 undefined）。"
            "<b>没有 enemy 载荷</b>。",
            "触发频率随主炮形态而变：<b>projectile</b> 每发子弹一次（多重射击 N 发 = 触发 N 次）；"
            "<b>lob</b>（迫击炮）每次开火一次；<b>line</b>（光束）每个光束周期一次，整道光束共用一个 attack。",
            "关键行为：<font face=\"mono\">attachRider()</font> 在 ctx 无 enemy 且存在 "
            "attack/bullet 时把原子塞进 <font face=\"mono\">attack.riders</font> 并<b>立即返回</b>——"
            "原子此刻不结算，等 <font face=\"mono\">resolveImpact</font> 命中敌人时由 "
            "<font face=\"mono\">runImpactRiders</font> 回放。",
            "例外：<font face=\"mono\">pierce</font> / <font face=\"mono\">ricochet</font> 不走 rider，"
            "直接改写 bullet 的 pierceLeft / ricochetLeft 字段，因此只对 projectile 投递有效。",
        ],
        "tp": "支持 <b>cooldownSeconds</b>（限制最短再触发间隔）。seconds / requiresSource / requiresStatus 在此无意义（无敌人载荷、无来源标签）。",
        "pitfalls": [
            "<b>挂 rider 的原子不会在开火瞬间生效。</b>把 slow 绑到 onFire，敌人不会在开火那一刻被减速，"
            "而是在这发子弹命中时才减速。设计上要按「命中后」来想，不是「开火后」。",
            "<b>光束/迫击炮形态下 pierce 与 ricochet 静默失效。</b>这是刻意设计（"
            "<font face=\"mono\">registry.ts</font> 的注释明确写「不属于被动丢失」），"
            "但配了「雷霆贯枪 + 光束换形」的玩家会觉得穿透没了。",
            "多重射击会成倍放大 onFire 频率，配 cooldownSeconds 时要按「每发」而不是「每次开火」估算。",
        ],
    },
    {
        "name": "onHit",
        "cn": "命中时",
        "sub": "命中敌人时",
        "plain": (
            "子弹（或光束、爆炸）真的打到一个敌人身上时触发。"
            "同一发攻击打同一个敌人只算一次——光束连续扫、爆炸范围重叠都不会重复触发。"
            "致命一击也会触发：敌人这一下被打死了，onHit 照样跑。"
        ),
        "code": [
            "调用点：<b>combatSystem.resolveImpact()</b>，在扣血与 riders 之后、形态 impact 之前。",
            "去重：<font face=\"mono\">attack.hitIds</font> 记录本次 attack 已命中的敌人 id；"
            "重复命中只走「补伤害」分支（<font face=\"mono\">dealDamage</font>），<b>不再触发 onHit</b>。"
            "持续光束的每个 tick、以及重叠的范围爆炸都靠这个去重。",
            "结算顺序（<font face=\"mono\">resolveImpact</font> 全序）："
            "<font face=\"mono\">扣血 → runImpactRiders → onHit → 形态 impacts → execute 检查 → 死亡结算(onKill)</font>。",
            "致命命中不被拦截——注释写明「不以 hp&gt;0 为门」，保证 split / aoeOnHit 在击杀帧仍然展开。",
            "载荷：<font face=\"mono\">attack, bullet, enemy, point</font>（命中点坐标）。"
            "有 enemy 意味着 <font face=\"mono\">attachRider</font> 直接返回 false，"
            "原子<b>立即对该敌人结算</b>，且 <font face=\"mono\">targets()</font> 只返回这一个敌人。",
        ],
        "tp": "支持 <b>requiresStatus</b>（frozen / dot / controlled / brand / vulnerable，判定被命中敌人当前状态）与 <b>cooldownSeconds</b>。requiresSource 不适用。",
        "pitfalls": [
            "<b>onHit 上的半径参数基本无效。</b>因为 ctx.enemy 存在，<font face=\"mono\">targets()</font> "
            "直接返回单个敌人，params.radius 被忽略。想做「命中后波及周围」要用 aoeOnHit / groundZone。",
            "光束形态下，一道光束对同一敌人整个持续期只触发一次 onHit——"
            "把高频叠层效果绑 onHit 时，光束玩法的实际层数会远低于弹道玩法。",
            "onHit 内若造成击杀，会同帧递归进 onKill；链式击杀最多嵌套 4 层（见 onKill 词条）。",
        ],
    },
    {
        "name": "onKill",
        "cn": "击杀时",
        "sub": "击杀敌人时",
        "plain": (
            "敌人被打死的那一刻触发，位置就在尸体所在处。"
            "可以只在「被某种方式杀死」或「死时身上带某种状态」时才触发，"
            "适合做「冻死的敌人炸一下」「连锁杀掉的目标再连一次」这类条件收益。"
        ),
        "code": [
            "调用点：<b>damageSystem.killEnemy()</b>，在掉落 roll 与经验结算之后。",
            "载荷：<font face=\"mono\">enemy, point = 敌人死亡坐标, source</font>（击杀来源标签，"
            "如 <font face=\"mono\">'weapon' / 'chain' / 'dot'</font>）。"
            "<b>enemy 已从 state.enemies 中移除</b>，但对象本身仍可读（状态字段仍是死亡瞬间的快照）。",
            "递归守卫：<font face=\"mono\">ON_KILL_MAX_DEPTH = 4</font>。"
            "onKill 里的效果可能同步打死另一个敌人并再次触发 onKill；超过 4 层直接返回空数组。",
            "过滤在 <font face=\"mono\">bindingConditionMet()</font> 中完成，"
            "requiresSource 比对 payload.source，requiresStatus 走 "
            "<font face=\"mono\">enemyHasStatus()</font>。",
        ],
        "tp": "支持 <b>requiresSource</b>（击杀来源标签）、<b>requiresStatus</b>（死亡瞬间状态）、<b>cooldownSeconds</b>。",
        "pitfalls": [
            "<b>ctx.enemy 存在，所以原子仍走单体分支。</b>但这个敌人已经死了——"
            "对它施加 slow / vulnerable 完全无效。想在尸体位置做范围效果，"
            "要用 groundZone / aoeOnHit / burstDamage 这类以 origin 为心的原子。",
            "<b>密集战斗中链式击杀会被 4 层深度截断</b>，超出部分静默不触发。"
            "做「击杀 → 连锁 → 再击杀」的滚雪球设计时，实际收益会低于纸面推算。",
            "requiresStatus 判定的是<b>死亡时刻</b>的状态。若击杀手段本身会清状态，条件可能永远不成立。",
        ],
    },
    {
        "name": "onWaveStart",
        "cn": "波次开始",
        "sub": "每波开始时",
        "plain": (
            "每一波敌人开始刷出来的时候触发一次。天然适合「开波前先上护盾」"
            "「每波召唤一个诱饵」「每波给自己加个 buff」这类节奏稳定的准备动作。"
        ),
        "code": [
            "调用点：<b>waveSystem</b> 波次推进处，<font face=\"mono\">fireTrigger('onWaveStart', { wave })</font>。",
            "载荷只有 <font face=\"mono\">wave</font>（波号）。<b>无 enemy、无 point</b> → "
            "<font face=\"mono\">ctx.origin</font> 回退到炮台坐标 "
            "<font face=\"mono\">(cfg.combat.turret.x, y)</font>。",
            "无敌人载荷 ⇒ 所有带 radius 的原子走「炮台为心的圈内全体」分支，"
            "而波次刚开始时场上通常没有敌人，范围伤害类原子实际打空。",
        ],
        "tp": "支持 <b>cooldownSeconds</b>（一般无必要，触发本身已是低频）。",
        "pitfalls": [
            "<b>此时场上多半没有敌人。</b>把 burstDamage / freeze 绑到 onWaveStart 几乎必然空放。"
            "这个触发器只适合作用于「自己」的原子：shield / statBuff / summon / restore。",
            "召唤类要留意：装备态 summon 是每(卡,绑定)单实例，"
            "每波重复触发只会<b>刷新</b>同一个召唤物（重置血量与位置），不会越召越多。",
        ],
    },
    {
        "name": "onBreach",
        "cn": "被突破时",
        "sub": "敌人突破防线时",
        "plain": (
            "敌人冲到了防线并对你造成损失时触发。这是「挨打反击」的时机——"
            "把敌人炸开、眩晕一圈、或者结一层护盾都在这里。"
        ),
        "code": [
            "两个调用点：<b>enemySystem</b> 普通敌人突破判定（载荷 "
            "<font face=\"mono\">enemy, damage, point = 敌人坐标</font>）"
            "与 <b>Boss 接触</b>分支。",
            "在此之前伤害已经过 <font face=\"mono\">runtime.absorbBreach()</font>："
            "先由 <font face=\"mono\">state.shield</font> 整次吸收（吸收成功则本次不掉血、并可能触发 "
            "novaOnBreak），否则按聚合后的 <font face=\"mono\">breachReduction</font> 打折。",
            "<b>唯一按触发器限定的词条缩放例外</b>："
            "<font face=\"mono\">buildModifierSystem.scaleEffects()</font> 中，"
            "只有 <font face=\"mono\">trigger === 'onBreach'</font> 的 "
            "<font face=\"mono\">burstDamage.damageMul</font> 会被 "
            "<font face=\"mono\">retaliationMul</font> 轴放大。",
        ],
        "tp": "支持 <b>requiresStatus</b>（突破者当前状态）与 <b>cooldownSeconds</b>——冲击类 5★ 破门反制正是用 cooldownSeconds 限制每 6s 至多一次。",
        "pitfalls": [
            "<b>护盾吸收成功时仍然会触发 onBreach。</b>触发与「是否真的掉血」是两件事，"
            "所以「被突破就回血」和「护盾」叠在一起会白赚。",
            "burstDamage 想吃 retaliationMul 加成，<b>必须绑在 onBreach 上</b>；"
            "同一个原子绑到 interval 就完全吃不到这条轴。",
            "Boss 接触与普通突破走的是两个不同分支，测试反击类卡时两种都要过一遍。",
        ],
    },
    {
        "name": "onPickup",
        "cn": "拾取时",
        "sub": "拾取掉落时",
        "plain": "捡起一个地面掉落物时触发。天然属于经济流派——捡东西就顺手回点血、多掉一张、加点经验。",
        "code": [
            "调用点：<b>dropSystem</b> 拾取结算末尾，在卡牌创建、进化与自动合成事件之后。",
            "载荷：<font face=\"mono\">drop</font>（掉落物对象）与 "
            "<font face=\"mono\">point = 掉落物坐标</font>。<b>无 enemy</b>。",
            "当前全项目仅 1 处使用（眷恋 3★ 分支 harvestC）——这是最未被开发的触发器。",
        ],
        "tp": "支持 <b>cooldownSeconds</b>。requiresSource / requiresStatus 不适用。",
        "pitfalls": [
            "拾取频率与掉落节奏强耦合（<font face=\"mono\">economy.ordinaryDropRate</font>）。"
            "调掉率的旋钮会连带改变绑在这里的收益，属于<b>隐性跨域耦合</b>。",
            "origin 是掉落物位置，可能远离战场；范围类原子容易打空。",
        ],
    },
    {
        "name": "interval",
        "cn": "周期触发",
        "sub": "每 N 秒一次",
        "plain": (
            "不需要任何条件，每隔 N 秒自己跑一次。适合做「持续输出」型的卡——"
            "定时打一发迫击炮、定时铺一块地面、定时连一次电。"
        ),
        "code": [
            "<b>不走 fireTrigger 总线</b>。由 "
            "<font face=\"mono\">interpreter.tickIntervalBindings()</font> 每帧推进，"
            "在 <font face=\"mono\">runtime.tickEffects()</font> 中最先执行。",
            "每(卡, 绑定)一个独立时钟：<font face=\"mono\">state.intervalClocks['卡id:绑定序号']</font>。"
            "周期取 <font face=\"mono\">triggerParams.seconds</font>，<b>缺省 1 秒</b>。",
            "卸下装备后，<font face=\"mono\">liveKeys</font> 之外的时钟会被清理"
            "（<font face=\"mono\">aura:</font> 与 <font face=\"mono\">weapon:</font> 前缀除外）。",
            "ctx <b>无任何载荷</b>：无 enemy / attack / bullet ⇒ attachRider 必然失败 ⇒ "
            "所有原子<b>立即结算</b>，且 <font face=\"mono\">targets()</font> 走"
            "「origin（炮台）半径圈内全体」分支。",
            "<b>不受 cooldownReady 闸门约束</b>——cooldownSeconds 只在 fireTriggerBindings 里判定，"
            "interval 路径不读它。",
        ],
        "tp": "只读 <b>seconds</b>。requiresSource / requiresStatus / <b>cooldownSeconds 在 interval 上完全无效</b>。",
        "pitfalls": [
            "<b>seconds 忘了写就是 1 秒。</b>这是最容易踩的默认值——"
            "一个本想 5 秒一次的领域会变成每秒铺一块。",
            "<b>cooldownSeconds 在这里静默失效</b>，校验器也不会报错。想限频只能改 seconds。",
            "半径参数在这里才真正生效（因为无 enemy 载荷）。同一个原子绑 onHit 和绑 interval，"
            "作用范围语义完全不同，调参时别照抄。",
            "interval 是全项目使用最密集的触发器之一（75 处绑定），改默认周期影响面极大。",
        ],
    },
    {
        "name": "onMerge",
        "cn": "合成时",
        "sub": "完成合成时",
        "plain": "两张同型同星的卡合成升星时触发。收益天然与「你合出了几星」挂钩，是经济/运营流派的专属节奏点。",
        "code": [
            "调用点：<b>cardSystem</b> 合成完成处，"
            "<font face=\"mono\">fireTrigger('onMerge', { merge: { cardType, resultStar } })</font>。",
            "载荷 <font face=\"mono\">merge.resultStar</font> 会被 "
            "<font face=\"mono\">mergePulse</font> 直接读取："
            "伤害 = <font face=\"mono\">damagePerMergeCount × resultStar</font>。",
            "无 enemy / 无 point ⇒ origin 回退炮台。mergePulse 自身也是以炮台为心计算距离。",
        ],
        "tp": "支持 <b>cooldownSeconds</b>。其余触发参数不适用。",
        "pitfalls": [
            "<b>只有 mergePulse 会读 resultStar。</b>其他原子绑在 onMerge 上拿不到星级信息，"
            "收益是固定值，不随合成品质变化。",
            "合成频率由玩家操作决定，波动极大。绑在这里的收益方差高，不适合承载核心 DPS。",
        ],
    },
    {
        "name": "passive",
        "cn": "常驻",
        "sub": "持续生效（无事件）",
        "plain": (
            "没有「时机」，只要卡装着就一直生效。掉率、经验、反伤、突破减免这些"
            "「没有具体发生瞬间」的效果都属于这一类；主炮换形和常驻光环也归这里。"
        ),
        "code": [
            "<b>不触发任何回调</b>。由 <font face=\"mono\">interpreter.getModifiers(state)</font> "
            "在每次被调用时<b>现场遍历</b>所有装备绑定并聚合，结果不缓存。",
            "9 个 <font face=\"mono\">modifierOnly</font> 原子在此聚合，"
            "它们在 <font face=\"mono\">registry.ATOMS</font> 里的实现是 "
            "<font face=\"mono\">noopModifier</font>（触发时什么都不做）："
            "dropRateMul / dropLifetimeMul / xpMul / expiryConvert / mergeMaterialRefund / "
            "wildcardRewardBonus / "
            "thorns / breachReduction / novaOnBreak。",
            "另外 3 个原子<b>只有绑定在 passive 上</b>才进入聚合："
            "<font face=\"mono\">beamMorph / mortarMorph</font>（进 weaponForms，参与主炮换形融合）与 "
            "<font face=\"mono\">aura</font>（进 auras，由 "
            "<font face=\"mono\">runtime.tickAuras</font> 周期脉冲）。"
            "绑到别的触发器时它们是「立即发射一道光束 / 立即一次落点爆炸 / 落点临时区域」。",
            "<font face=\"mono\">aura / mergeMaterialRefund / wildcardRewardBonus</font> "
            "都在契约里把 allowedTriggers 锁成 <font face=\"mono\">['passive']</font>。",
            "passive 路径有独立的默认值层：契约的 "
            "<font face=\"mono\">passiveDefault</font>（如 aura.tickInterval 触发路径 0.8s、"
            "passive 常驻 1s；execute.hpThresholdRatio 触发路径 0.15、passive 缺省 0）。",
        ],
        "tp": "不读任何 triggerParams。",
        "pitfalls": [
            "<b>getModifiers 不按触发器过滤 modifierOnly 原子。</b>"
            "把 thorns 或 dropRateMul 写在 onKill 下面，它<b>照样常驻生效</b>——"
            "既不会「击杀时才有」，校验器也不会报错（这些原子 allowedTriggers 是 'any'）。"
            "规范是一律写 passive，但这条目前靠约定而非工具保证。",
            "<b>getModifiers 每次调用都全量遍历</b>，且在 tickAuras / resolveImpact / "
            "absorbBreach / shoot 等热点路径中被反复调用。加装备绑定数量对性能是线性成本。",
            "同一张卡装两次不可能（装备类型互斥），但<b>不同卡提供同一 modifierOnly 原子时的叠加方式各不相同</b>"
            "（乘法 / 加法封顶 / 取最高 / 后写覆盖），见「融合与叠加总表」。"
            "特别注意 <font face=\"mono\">novaOnBreak</font> 是<b>后写覆盖</b>，不是取最强。",
        ],
    },
]
