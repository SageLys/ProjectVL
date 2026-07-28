// 编辑器可读性层：把编辑面里出现的四类英文标识翻成中文的**唯一来源**。
//
// 边界（S3-工具1）：
// - 结构只从 `core/effects/atomContract.ts` 读，本文件不复述原子/参数的存在性；
// - 已有中文只**引用**不抄写——原子中文名取 `texts.effectText.atoms`，原子解释取 `texts.glossary`，
//   参数解释优先取契约里的 `note`，词条属性解释取 `texts.affixHelp`，触发器取 `texts.effectText.triggers`；
// - 只有「开发者词汇」（参数名、域字段名、枚举取值）在本文件补齐——它们不是玩家可见文案，
//   不进 `texts`，也就不必让 validate 承担孤儿键/引用检查。缺口一律补在这里，禁止散落到各编辑器文件。
//
// 浏览器安全：只依赖 `atomContract` / `data`（静态 JSON）/ `contracts`，**不得** import
// `config/pipeline.ts` 或 `config/validateAll.ts`（`tests/editorLabels.test.ts` 会断言这一点）。
// texts 取的是磁盘静态副本：编辑器里改了 texts 域要刷新页面标签才更新，这是刻意的——
// 标签层是只读词典，不参与未保存态。
import { ATOM_CONTRACT, RUNTIME_STAT_KINDS, type AtomContract } from '../core/effects/atomContract';
import { texts } from '../data';
import { type EditorDomain } from './contracts';

/** 四个命名空间：原子 / 原子参数 / 可写域字段 / 枚举取值。 */
export type LabelKind = 'atom' | 'atomParam' | 'domainField' | 'enumValue';

export interface HumanLabel {
  /** 人类可读名（中文）。 */
  label: string;
  /** 一句话解释；缺省表示没有可用解释。 */
  help?: string;
}

type Lexicon = {
  effectText?: { atoms?: Record<string, string>; triggers?: Record<string, string> };
  glossary?: Record<string, string>;
  affixHelp?: Record<string, string>;
  cards?: Record<string, { name?: string; overview?: string }>;
  gods?: Record<string, { name?: string; theme?: string }>;
};

const lexicon = texts as unknown as Lexicon;
const contracts = ATOM_CONTRACT as Record<string, AtomContract | undefined>;

// —— 原子参数：通用参数名 + 「原子.参数」精确覆盖，同一张表按精确优先查 ——
// 覆盖只写「通用名会误导」的项（如 count 在 pierce 是穿透数、在 extraDrop 是掉落数量）。
const ATOM_PARAM_LABELS: Record<string, string> = {
  absorbHits: '抵挡次数',
  amount: '固定回复量',
  amountRatio: '生命上限回复比',
  at: '落点',
  bounces: '弹跳次数',
  chance: '触发概率',
  collisionDamage: '撞击伤害',
  color: '颜色',
  count: '数量',
  damage: '伤害',
  damageMul: '伤害倍率',
  damagePerMergeCount: '每星伤害',
  damagePerTick: '每跳固定伤害',
  damageRatio: '伤害比例',
  damageRetention: '伤害保留比',
  distance: '推开距离',
  distanceFromTurret: '距炮台距离',
  duration: '持续时间',
  effects: '嵌套效果',
  explode: '死亡爆炸',
  explodeDamageMul: '爆炸伤害倍率',
  falloff: '边缘衰减',
  fireInterval: '开火间隔',
  hp: '生命值',
  hpThresholdRatio: '生命阈值比例',
  innerRadius: '内径',
  interval: '间隔',
  kind: '类型',
  knockbackDistance: '击退距离',
  maxDepth: '递归层数上限',
  maxStacks: '叠加层数上限',
  mul: '乘数',
  operation: '叠加方式',
  placement: '放置方式',
  priorityWeight: '索敌权重',
  radius: '半径',
  radiusRatioOfRange: '半径占射程比',
  rampPerPierce: '每次穿透增伤',
  ratio: '比例',
  regenSeconds: '再生秒数',
  replacesEarlier: '替换更早实例',
  respawnOnce: '重生一次',
  rule: '规则',
  searchRange: '搜索范围',
  shape: '形状',
  stacksToTrigger: '触发所需层数',
  starWeights: '星级权重',
  stat: '目标属性',
  summonId: '召唤物 id',
  targets: '目标数',
  tauntRadius: '嘲讽半径',
  tickInterval: '结算间隔',
  value: '数值',
  width: '宽度',

  'beamMorph.duration': '单次光束持续',
  'beamMorph.interval': '主炮开火周期',
  'beamMorph.width': '光束宽度',
  'breachReduction.ratio': '突破减免比例',
  'chain.damageMul': '伤害基准倍率',
  'chain.targets': '起点数',
  'dropLifetimeMul.mul': '掉落时限乘数',
  'dropRateMul.mul': '掉率乘数',
  'execute.hpThresholdRatio': '处决血量阈值',
  'expiryConvert.ratio': '转化比例',
  'extraDrop.count': '掉落数量',
  'focusPriority.hpThresholdRatio': '筛选血量阈值',
  'mergePulse.radius': '波及半径',
  'mergeRule.rule': '合成规则',
  'mergeRule.value': '规则数值',
  'novaOnBreak.damage': '冲击伤害',
  'pierce.count': '穿透数',
  'pierce.damageMul': '贯穿弹伤害倍率',
  'pierce.width': '贯穿弹半径',
  'slow.ratio': '减速比例',
  'split.count': '分裂数',
  'statBuff.value': '强化数值',
  'summon.count': '召唤数量',
  'summon.damageRatio': '召唤物伤害比例',
  'summon.duration': '存在时间',
  'summon.hp': '召唤物生命',
  'summon.kind': '召唤物类型',
  'thorns.ratio': '反伤比例',
  'vulnerable.ratio': '易伤比例',
  'xpMul.mul': '经验乘数',
};

// 参数解释的兜底：仅在契约 `note` 缺省时生效，永远不覆盖 note。
const ATOM_PARAM_HELP: Record<string, string> = {
  amountRatio: '按最大生命的比例回复，与固定值相加后封顶',
  bounces: '起点之后继续传递/反弹的次数',
  damageRatio: '本次结算伤害 = 炮台总伤 × 本值',
  damageRetention: '每次传递后保留的伤害比例',
  distance: '沿远离作用点方向推开的距离',
  duration: '效果持续秒数',
  falloff: '越靠近边缘伤害衰减越多的比例',
  hp: '召唤物的初始生命',
  innerRadius: '环形内圈半径',
  interval: '两次动作之间的秒数',
  maxStacks: '同来源同目标可叠加的层数上限',
  operation: 'add = 加法叠加，mul = 乘法叠加',
  ratio: '按比例结算的强度',
  searchRange: '寻找下一个目标的搜索半径',
  shape: '区域几何形状',
  tickInterval: '两次周期结算之间的秒数',
  width: '判定宽度',
  'summon.priorityWeight': '召唤物被敌人选中的权重',
};

// —— 可写域字段：每个域的顶层字段必须齐全（覆盖度由测试守住）——
const DOMAIN_FIELD_LABELS: Record<EditorDomain, Record<string, string>> = {
  combat: {
    canvas: '画布', turret: '炮台', hp: '生命', defaults: '基础数值',
    attackPreviewMargin: '攻击预览余量', bullet: '子弹', weaponFusion: '武器融合',
    'weaponFusion.damping': '同类叠加伤害衰减',
    'weaponFusion.areaMul': '同类叠加范围面积比',
    breakthroughDist: '突破判定距离', dangerZoneWidth: '危险区宽度', dtCap: '单帧步长上限',
    knockbackFatigue: '击退疲劳', ccImmunity: '控制免疫窗', controlCeiling: '控制上限',
    controlBudget: '控制预算', vfx: '特效',
  },
  waves: {
    totalWaves: '总波数', spawnMode: '刷怪模式', enemyCountBase: '基础敌人数',
    enemyCountPerWave: '每波敌人增量', firstSpawnDelay: '首次刷怪延迟', spawnInterval: '刷怪间隔',
    budget: '刷怪预算', stagePlan: '阶段计划', intermission: '波间间歇', spawnMargin: '出生边距',
    typeRoll: '类型抽取', bossWaves: 'Boss 波次', waveBoss: '波次 Boss',
  },
  enemies: { defaults: '默认属性', types: '敌人类型', bossBehavior: 'Boss 行为' },
  difficulty: { defaultDifficulty: '默认难度', profiles: '难度档位' },
  skills: { version: '版本', cards: '卡牌' },
  gods: { version: '版本', gods: '神祇' },
  relics: { version: '版本', relics: '遗物' },
  evolutionRecipes: { version: '版本', recipes: '进化配方' },
  waveRewards: { version: '版本', floor: '保底奖励', choice: '奖励选项' },
  progression: {
    killXpMul: '击杀经验倍率', relicChoices: '遗物候选数', targetRelics: '目标遗物数',
    xpThresholds: '升级经验阈值', rarityByRelicIndex: '稀有度曲线', settlement: '结算',
  },
  economy: {
    maxStar: '最高星级', mergeCopies: '合成所需份数',
    mergeCopiesWhenTwoCopyDisabled: '双份合成关闭时的份数', equipThreshold: '装备星级门槛',
    handSlots: '手牌槽位', equipSlots: '装备槽位', equipIrreversible: '装备不可逆',
    unequipPolicy: '卸下策略', equipSwappable: '装备可替换', inRunSlotExpansion: '局内槽位扩展',
    equipDistinctTypes: '装备类型互斥', feedEquipped: '可喂养已装备卡',
    placeholderAssumptions: '占位假设', dropStarPolicy: '掉落星级策略', drops: '掉落物',
    defaults: '默认数值', ordinaryDropRate: '普通掉落节奏（每分钟）', normalDropTypePolicy: '普通掉落类型策略',
  },
  bounty: {
    enabled: '启用', rewardBias: '奖励偏置', offer: '委托发放', encounter: '遭遇',
    reward: '奖励', visual: '表现',
  },
  input: {
    tapMaxPx: '点击最大位移', tapMaxMs: '点击最长时长', reticleOffsetY: '准星纵向偏移',
    confirmStyle: '确认方式', holdOrDbl: '长按 / 双击',
  },
  tuner: { version: '版本', params: '调参项' },
  texts: {
    center: '中央提示', buttons: '按钮', lanes: '通道', levelup: '升级', affixes: '词条',
    gods: '神祇文案', decisions: '抉择', waveRewardStats: '波末奖励属性',
    waveRewardCapped: '波末奖励封顶', evolution: '进化文案', intermission: '间歇',
    toast: '浮动提示', wildcard: '万用牌', result: '结算', cards: '卡牌文案',
    effectText: '效果文案', glossary: '术语解释', affixHelp: '词条说明', relics: '遗物文案',
    tuner: '调参文案',
  },
};

// 跨域通用字段名：域内没有精确项时按末段兜底（结构树深层节点大多命中这里）。
const COMMON_FIELD_LABELS: Record<string, string> = {
  add: '加值', affixPool: '词条池', allowedPhase: '允许阶段', amplifyAxis: '强化轴',
  anchorCardIds: '锚点卡', anchors: '档位', applyPolicy: '生效策略', axis: '作用轴',
  base: '基准值', batchMax: '单批上限', bindingIndex: '绑定序号', boss: 'Boss', bossReward: 'Boss 奖励', build: '构筑',
  bootstrapForcedDrops: '开局强制发牌次数', bootstrapMinDiscovery: '冷启动探索保底', buildPerMinute: '构筑期每分钟掉落',
  buildTransitionSeconds: '构筑期速率过渡秒数', candidateFraction: '候选比例', carryCap: '掉落额度积压上限', chanceCap: '掉落概率封顶',
  candidates: '候选项', cardId: '卡 id', category: '类别', ccResist: '控制抗性',
  ccResistOverride: '控制抗性覆盖', checkInterval: '检查间隔', checkpoints: '进化节点',
  color: '颜色', common: '普通', consumable: '消耗态', cost: '消耗', count: '数量',
  damage: '伤害', damageMul: '伤害倍率', desc: '描述', description: '说明', discovery: '探索', dropChance: '基础掉落概率', duration: '持续时间',
  effects: '效果', effectIndex: '效果序号', enabled: '启用', end: '终点值', enemy: '敌人', epic: '史诗', equip: '装备态',
  evolutionTree: '进化树', exposed: '面板可见', fireRate: '攻速', fusionPolicy: '融合策略',
  god: '神祇', godAffinity: '神祇亲和', godWeightAdd: '神祇权重加值', group: '分组', hard: '困难', height: '高度',
  historicalMergeCap: '历史合成封顶', historicalMergeWeight: '历史合成权重',
  hp: '生命', hpBase: '基础生命', hpMul: '生命倍率', hpPerWave: '每波生命增量', id: '标识',
  ingredientA: '材料 A', ingredientB: '材料 B', inputs: '输入', interval: '间隔',
  kind: '种类', knockbackResist: '击退抗性', knockbackResistOverride: '击退抗性覆盖',
  implementationBatch: '实现批次', label: '显示名', labelKey: '文案键', life: '存活时间', mainRosterSize: '主池规模',
  max: '最大值', maxAlive: '同时存活上限', maxSameTypeStreak: '同型连发上限', maxStacks: '最大层数', maxWeightRatio: '权重比上限', min: '最小值',
  maturity: '构筑成熟度', mergeReadyMultiplier: '可合成加权', mergeWeight: '合成权重', modifiersAffectTarget: '词条加成是否影响目标速率',
  minStar: '最低星级', milestones: '里程碑文案', mode: '模式', mul: '乘数', multiplier: '倍率', name: '名称', options: '选项',
  outputCardId: '产出卡', outputStar: '产出星级', overview: '概览', paramName: '参数名', params: '参数', parentEffectPath: '父效果路径', path: '配置路径',
  perWave: '每波增量', pityDrops: '保底掉落次数', pivot: '拐点', poolInfluence: '池影响',
  power: '曲线指数', r: '半径', radius: '半径', range: '射程', rare: '稀有', rarity: '稀有度',
  ratio: '比例', recipeOnly: '仅配方产物', relaxed: '轻松', reward: '奖励', roleBagSize: '角色袋容量', scale: '缩放', scoreCap: '加分封顶',
  scorePerStack: '每层加分', scorePower: '承诺分指数', section: '分段', selection: '抽取', selectionPerMinute: '选择期每分钟掉落',
  sides: '边数', speed: '速度', speedBase: '基础速度', speedMul: '速度倍率',
  speedPerWave: '每波速度增量', spread: '散布', standard: '标准', star: '星级',
  starWeight: '星级权重', starWeights: '星级权重', stars: '星级形态', start: '起点值', stat: '属性', step: '步进',
  subRosterSize: '副池规模', synergyTags: '协同标签', tags: '标签', targetOnScreen: '在场目标数',
  targetTags: '目标标签', teaching: '教学卡', textKey: '文案键', theme: '主题', tier: '形态', title: '标题', topK: '候选前 N 名', trigger: '触发器',
  triggerParams: '触发参数', type: '类型', typePolicy: '类型策略', types: '类型表',
  validation: '验证局', value: '数值', variableCardIds: '可变卡', version: '版本',
  waveEndSprint: '波末冲刺', waveQuota: '波次配额', weight: '权重', width: '宽度',
  detail: '详情', fx: '演出级别', hand: '手牌态', shortByTier: '分星短文案',
  x: '横坐标', xp: '经验', y: '纵坐标',
  earlyMix: '局初角色配比', equipWeight: '装备权重', equippedBaseBonus: '装备基础加分', equippedStarBonus: '装备每星加分',
  excludeTopK: '排除前 N 名', fullEquippedTypes: '满值装备类型数', fullHighestStar: '满值最高星', fullMergeOps: '满值合成次数',
  lateMix: '局末角色配比',
};

const COMMON_FIELD_HELP: Record<string, string> = {
  areaMul: '同时装备 2 张以上范围形态卡时，第 2 个及之后的贡献所覆盖的面积占比；半径按本值开平方缩放。当前配置仅 1 张范围形态卡，本值暂不生效',
  bootstrapForcedDrops: '选副神后前 N 次普通掉落按预排队列强制发放，完全绕过角色袋与探索保底',
  bootstrapMinDiscovery: '只要活跃池里还有从未作为普通掉落出现过的卡，就把探索名额抬到这个下限',
  buildTransitionSeconds: '进入构筑期后速率线性爬坡到位所需的有效战斗秒数，跨波累加',
  candidateFraction: '排除主力后，按承诺分从低到高取这个比例作为转向候选',
  carryCap: '额度池上限，防止长时间不杀敌后攒额度、再一口气爆出大量掉落',
  chanceCap: '仅在 ordinaryDropRate.enabled=false 的回退模式下生效',
  dropChance: '仅在 ordinaryDropRate.enabled=false 的回退模式下生效',
  damping: '同时装备 2 张以上范围形态卡时，第 2 个及之后的贡献伤害乘本值；固定值、不复利。当前配置仅 1 张范围形态卡，本值暂不生效',
  excludeTopK: '转向角色会先排除承诺分最高的这几张，它们已是主力',
  maxWeightRatio: '最高权重不得超过最低权重的这个倍数，防止单一卡型垄断掉落',
  mergeReadyMultiplier: '手上已有该型 1★（再来一张即可合成）时的权重倍率',
  modifiersAffectTarget: '关闭后，所有提升掉落率的遗物/词条对普通掉落完全失效',
  scorePower: '权重 =（承诺分 + 0.5）的本次方；大于 1 更偏向高分卡，小于 1 更平均',
};

// —— 枚举取值 ——
const STAT_LABELS: Record<typeof RUNTIME_STAT_KINDS[number], string> = {
  damage: '伤害', fireRate: '攻速',
  damageAdd: '伤害加值', fireRateAdd: '攻速加值', rangeAdd: '射程加值', multiAdd: '多重射击加值',
  maxHpAdd: '生命上限加值', heal: '治疗',
  effectDamageMul: '效果伤害倍率', quantityAdd: '数量加值', controlPotencyMul: '控制强度倍率',
  controlledDamageTakenMul: '受控增伤倍率', areaScaleMul: '范围倍率', dotDamageMul: '持续伤害倍率',
  defenseDurabilityMul: '防御耐久倍率', retaliationMul: '反击倍率',
  dropRateMul: '掉率倍率', dropLifetimeMul: '掉落时限倍率', xpMul: '经验倍率',
};

const ENUM_LABELS: Record<string, Record<string, string>> = {
  at: { point: '作用点', turret: '炮台', killPoint: '击杀点' },
  category: { projectile: '弹道', control: '控制', domain: '领域', economy: '经济', defense: '防御' },
  kind: { decoy: '诱饵', mirrorTurret: '镜像炮台', orbital: '环绕体' },
  operation: { add: '加法', mul: '乘法' },
  paramType: {
    number: '数值', integer: '整数', string: '文本', boolean: '布尔',
    enum: '枚举', effects: '嵌套效果', record: '记录',
  },
  placement: { threatDirection: '威胁方向' },
  rarity: { common: '普通', rare: '稀有', epic: '史诗' },
  rule: { wildcardDrop: '万用牌掉落', refundChance: '返还概率' },
  shape: { circle: '圆形', ring: '环形', line: '直线' },
  stat: STAT_LABELS,
  tier: { core: '核心', dual: '双效', transform: '变形' },
  valueType: {
    string: '文本', number: '数值', boolean: '布尔', object: '对象', array: '数组', null: '空值',
  },
};

function withHelp(label: string, help: string | undefined): HumanLabel {
  return help ? { label, help } : { label };
}

/** `a.b.c` → `['a', 'b.c']`；无点号时后段为空串。 */
function splitOnce(key: string): [string, string] {
  const dot = key.indexOf('.');
  return dot < 0 ? [key, ''] : [key.slice(0, dot), key.slice(dot + 1)];
}

function tailSegment(key: string): string {
  const parts = key.split('.');
  return parts[parts.length - 1] || key;
}

function atomInfo(atom: string): HumanLabel | undefined {
  const label = lexicon.effectText?.atoms?.[atom];
  return label ? withHelp(label, lexicon.glossary?.[atom]) : undefined;
}

function atomParamInfo(atom: string, param: string): HumanLabel | undefined {
  const label = ATOM_PARAM_LABELS[`${atom}.${param}`] ?? ATOM_PARAM_LABELS[param];
  if (!label) return undefined;
  const note = contracts[atom]?.params[param]?.note;
  return withHelp(label, note ?? ATOM_PARAM_HELP[`${atom}.${param}`] ?? ATOM_PARAM_HELP[param]);
}

function domainFieldInfo(domain: string, field: string): HumanLabel | undefined {
  const table = (DOMAIN_FIELD_LABELS as Record<string, Record<string, string> | undefined>)[domain];
  const tail = tailSegment(field);
  const label = table?.[field] ?? table?.[tail] ?? COMMON_FIELD_LABELS[tail];
  return label ? withHelp(label, COMMON_FIELD_HELP[tail]) : undefined;
}

function enumValueInfo(group: string, value: string): HumanLabel | undefined {
  if (group === 'atom') return atomInfo(value);
  if (group === 'trigger') {
    const label = lexicon.effectText?.triggers?.[value];
    return label ? { label } : undefined;
  }
  if (group === 'god') {
    const god = lexicon.gods?.[value];
    return god?.name ? withHelp(god.name, god.theme) : undefined;
  }
  const label = ENUM_LABELS[group]?.[value];
  if (!label) return undefined;
  return group === 'stat' ? withHelp(label, lexicon.affixHelp?.[value]) : { label };
}

/**
 * 查表；查不到返回 undefined（调用方决定回退）。key 形态：
 * - `atom`：`chain`
 * - `atomParam`：`chain.bounces`
 * - `domainField`：`combat.turret` 或 `combat.turret.radius`（无域前缀时按通用字段名查）
 * - `enumValue`：`rarity.epic` / `trigger.onFire` / `god.storm` / `atom.chain`
 */
export function lookupLabel(kind: LabelKind, key: string): HumanLabel | undefined {
  if (kind === 'atom') return atomInfo(key);
  const [head, rest] = splitOnce(key);
  if (!rest) return kind === 'domainField' ? domainFieldInfo('', head) : undefined;
  if (kind === 'atomParam') return atomParamInfo(head, rest);
  if (kind === 'domainField') return domainFieldInfo(head, rest);
  return enumValueInfo(head, rest);
}

/** 查表；查不到回退成英文末段（永不抛错、永不返回空 label）。 */
export function describeLabel(kind: LabelKind, key: string): HumanLabel {
  return lookupLabel(kind, key) ?? { label: tailSegment(key) };
}

/** 「中文（englishKey）」；没有中文时只回显英文 key。 */
export function labelWithKey(kind: LabelKind, key: string, english = tailSegment(key)): string {
  const { label } = describeLabel(kind, key);
  return label === english ? english : `${label}（${english}）`;
}

/** 卡片中文名 + 一句话定位；缺文案时回退卡 id。 */
export function cardLabel(id: string): HumanLabel {
  const card = lexicon.cards?.[id];
  return card?.name ? withHelp(card.name, card.overview) : { label: id };
}
