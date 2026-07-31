import fs from 'node:fs';
import path from 'node:path';

type JsonObject = Record<string, unknown>;

const root = path.resolve(import.meta.dirname, '..');
const draftPath = path.join(root, 'docs', '文案稿_待审核.md');
const textsPath = path.join(root, 'src', 'data', 'texts.json');
const draft = fs.readFileSync(draftPath, 'utf8');
const texts = JSON.parse(fs.readFileSync(textsPath, 'utf8')) as JsonObject;
const before = structuredClone(texts);

const allowedRoots = new Set([
  'glossary', 'affixHelp', 'effectText', 'affixes', 'waveRewardStats', 'lanes',
  'cards', 'evolution', 'center', 'buttons', 'decisions', 'intermission', 'toast',
  'wildcard', 'result', 'rewards', 'rewardReceipt',
]);

function cleanCopy(value: string): string {
  let result = value.replaceAll('**', '').trim();
  for (const marker of ['（不改', '（按你的决定', '（原「持续伤害」']) {
    const index = result.indexOf(marker);
    if (index >= 0) result = result.slice(0, index).trim();
  }
  return result;
}

function getAtPath(target: JsonObject, jsonPath: string): unknown {
  let cursor: unknown = target;
  for (const key of jsonPath.split('.')) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || !(key in cursor)) {
      throw new Error(`审定稿路径不存在：${jsonPath}`);
    }
    cursor = (cursor as JsonObject)[key];
  }
  return cursor;
}

function setAtPath(target: JsonObject, jsonPath: string, value: string): void {
  const keys = jsonPath.split('.');
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    const next = cursor[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      throw new Error(`审定稿路径不是对象：${jsonPath}`);
    }
    cursor = next as JsonObject;
  }
  const leaf = keys.at(-1)!;
  if (typeof cursor[leaf] !== 'string') throw new Error(`审定稿路径不是文案叶子：${jsonPath}`);
  cursor[leaf] = value;
}

const updates = new Map<string, string>();
for (const line of draft.split(/\r?\n/)) {
  if (!line.startsWith('| `')) continue;
  const cells = line.slice(1, -1).split('|').map(cell => cell.trim());
  const pathCell = cells[0]?.match(/^`([^`]+)`$/);
  if (!pathCell || !pathCell[1].includes('.')) continue;
  const jsonPath = pathCell[1];
  if (!allowedRoots.has(jsonPath.split('.')[0])) continue;
  const rawValue = cells.length >= 3 ? cells[2] : cells[1];
  if (!rawValue) throw new Error(`审定稿缺少新文案：${jsonPath}`);
  updates.set(jsonPath, cleanCopy(rawValue));
}

const godCopy: Record<string, { name: string; theme: string }> = {
  storm: { name: '电到你', theme: '别问为什么发麻，问就是你自己凑太近。' },
  winter: { name: '冻到你', theme: '不吵不闹，就是不给你机会——这才是真的狠。' },
  inferno: { name: '烧到你', theme: '她没点火，是你自己烧起来的。' },
  bulwark: { name: '扎到你', theme: '看着挺乖，伸手就知道有多扎手。' },
  plenty: { name: '薅到你', theme: '标记了就是我的，你送的心意一分不少地薅走。' },
};
for (const [id, copy] of Object.entries(godCopy)) {
  updates.set(`gods.${id}.name`, copy.name);
  updates.set(`gods.${id}.theme`, copy.theme);
}

// 审定稿与质量门禁冲突处：不改机制，只把同义的三档短句写成不同表述；
// fusion 是仓库第 61 张文案卡，审定稿漏列，但质量门禁要求所有旧卡名都更新。
const qualityOverrides: Record<string, string> = {
  'cards.fusion.name': '光炮一起上',
  'cards.fusion.hand.shortByTier.1': '立刻把光束和迫击炮揉成一招',
  'cards.fusion.equip.shortByTier.1': '主炮把光束和迫击炮合成一招',
  'cards.goldenVolley.equip.shortByTier.3': '每穿一个就挂上赏印，标记等着变现',
  'cards.harvest.equip.shortByTier.6': '掉落率和心意时限都提高，奖励积分也跟着涨',
  'cards.overgrowth.equip.shortByTier.6': '掉落率和心意时限都提高，积分也跟着涨',
  'cards.luckyStar.equip.shortByTier.6': '心意掉落和留存都提高，积分也跟着涨',
  'cards.overcharge.equip.shortByTier.6': '每波开始和每 2.5 秒都会自动叠攻速加成',
  'cards.glacialSpike.equip.shortByTier.5': '扎的还是那些人，但冰封后能直接扎碎',
  'cards.hoarfrostTithe.equip.shortByTier.3': '命中就收冰税，受控的人越多税越高',
  'cards.sentinel.equip.shortByTier.5': '召唤帮手继续开火，这次输出更猛',
  'cards.bountyCall.equip.shortByTier.6': '赏印点名范围更广，自己还越打越猛',
  'cards.stormLattice.equip.shortByTier.5': '穿透路径持续放电，沿途自动连锁',
  'cards.stormLattice.equip.shortByTier.6': '每次开火贯穿人群，再用电链追击',
  'cards.thunderRime.equip.shortByTier.5': '雷云罩住人群减速，落雷周期冰封',
  'cards.thunderRime.equip.shortByTier.6': '减速雷云不散，落雷接连冻住目标',
  'cards.emberSpark.equip.shortByTier.5': '子弹点火后，灼烧目标继续放电',
  'cards.emberSpark.equip.shortByTier.6': '命中先灼烧，烧着的人再挨自动电击',
  'cards.voltBastion.equip.shortByTier.5': '壁垒挨打就充电，充满立刻放风暴',
  'cards.voltBastion.equip.shortByTier.6': '破防或满充都会炸开一圈闪电',
  'cards.ampereFlow.equip.shortByTier.5': '感电目标挂赏印后，击杀必掉心意',
  'cards.ampereFlow.equip.shortByTier.6': '赏印和感电叠在一起，心意必定掉落',
  'cards.crystalRelay.equip.shortByTier.5': '电链命中就立晶柱，柱旁持续减速',
  'cards.crystalRelay.equip.shortByTier.6': '晶柱会减速周围，倒下时再炸一圈',
  'cards.glacialEpoch.equip.shortByTier.5': '冰环周期向外扩，冰封目标会碎冰',
  'cards.glacialEpoch.equip.shortByTier.6': '扩张冰环反复冻人，碎冰时再爆发',
  'cards.rimeShell.equip.shortByTier.5': '先叠冻结层再灼烧，冰封后炸第二次',
  'cards.rimeShell.equip.shortByTier.6': '命中同时叠冻点火，冰封目标再爆炸',
  'cards.tombSpire.equip.shortByTier.5': '防线破口召唤冰塔，嘲讽追求者',
  'cards.tombSpire.equip.shortByTier.6': '冰塔倒下时冰封周围，破口还能再立',
  'cards.stasisLedger.equip.shortByTier.5': '每次合成都冻住全场，冰封击杀多掉',
  'cards.stasisLedger.equip.shortByTier.6': '合成触发全场冰封，击杀奖励翻倍',
  'cards.solarPiercer.equip.shortByTier.5': '穿透弹一路灼烧，沿飞行路径留火场',
  'cards.solarPiercer.equip.shortByTier.6': '每次开火贯穿人群，灼热走廊留在身后',
  'cards.steamBurst.equip.shortByTier.5': '减速圈里持续点火，双重状态一起引爆',
  'cards.steamBurst.equip.shortByTier.6': '光环减速又灼烧，状态叠齐自动爆炸',
  'cards.volcanoCore.equip.shortByTier.5': '火山定时喷发，灼烧击杀会接着喷',
  'cards.volcanoCore.equip.shortByTier.6': '常驻火山反复爆发，烧死目标续上喷发',
  'cards.emberMoat.equip.shortByTier.5': '壁垒外常驻火场，挨打时持续灼烧',
  'cards.emberMoat.equip.shortByTier.6': '壁垒破防立刻爆燃，外圈火焰一直烧',
  'cards.emberYield.equip.shortByTier.5': '灼烧目标挂赏印后，击杀必掉心意',
  'cards.emberYield.equip.shortByTier.6': '捡起心意叠高火势，烧着赏印目标必掉',
  'cards.pylonCircuit.equip.shortByTier.5': '每波部署三座塔，命中后电链追击',
  'cards.pylonCircuit.equip.shortByTier.6': '三塔开局落位，炮台命中持续连锁',
  'cards.glacialEffigy.equip.shortByTier.5': '周期落锤召唤冰像，冰像会嘲讽',
  'cards.glacialEffigy.equip.shortByTier.6': '冰像消失时冰封周围，下一座继续落下',
  'cards.wrathMortar.equip.shortByTier.3': '突破就装填，攒够了周期清仓爆炸齐射',
  'cards.wrathMortar.equip.shortByTier.5': '突破为迫击炮装填，攒满就成排爆炸',
  'cards.wrathMortar.equip.shortByTier.6': '周期清空弹仓齐射，突破越多炮弹越足',
  'cards.aegisCitadel.equip.shortByTier.5': '四段圣墙开局立好，塌一段就补一段',
  'cards.aegisCitadel.equip.shortByTier.6': '圣墙倒下自动重建，核心始终有壁垒',
  'cards.rootLoom.equip.shortByTier.5': '合成会让根网生长，守过一波继续强化',
  'cards.rootLoom.equip.shortByTier.6': '根网随合成扩张，过波后整张网再变强',
  'cards.midasChain.equip.shortByTier.5': '电链命中一路挂赏印，击杀铸出心意',
  'cards.midasChain.equip.shortByTier.6': '连锁标记整条链，赏印击杀继续掉落',
  'cards.frostDew.equip.shortByTier.5': '减速泉圈统计受控目标，人越多回血越快',
  'cards.frostDew.equip.shortByTier.6': '泉圈持续减速，受控人群不断恢复心防',
  'cards.pyreBrand.equip.shortByTier.5': '周期给高价值目标烙赏印，顺手点火',
  'cards.pyreBrand.equip.shortByTier.6': '带赏印的目标烧死后，灼烧接力下一个',
  'cards.fortuneThorns.equip.shortByTier.5': '反弹伤害积攒福缘，攒满就掉心意',
  'cards.fortuneThorns.equip.shortByTier.6': '遭遇突破也会分红，反伤越多收益越快',
  'cards.goldenGrove.equip.shortByTier.5': '每次捡心意就种树，金树持续挂赏印',
  'cards.goldenGrove.equip.shortByTier.6': '金树标记追求者并产出，拾取还能继续种',
};
for (const [jsonPath, value] of Object.entries(qualityOverrides)) updates.set(jsonPath, value);

function placeholders(value: unknown): string[] {
  return typeof value === 'string' ? [...value.matchAll(/\{[^{}]+\}/g)].map(match => match[0]).sort() : [];
}

for (const [jsonPath, value] of updates) {
  const oldValue = getAtPath(texts, jsonPath);
  if (JSON.stringify(placeholders(oldValue)) !== JSON.stringify(placeholders(value))) {
    throw new Error(`占位符集合变化：${jsonPath} (${placeholders(oldValue)} -> ${placeholders(value)})`);
  }
  setAtPath(texts, jsonPath, value);
}

for (const [cardId, card] of Object.entries((texts.cards ?? {}) as JsonObject)) {
  const oldCard = ((before.cards as JsonObject)[cardId]) as JsonObject;
  for (const mode of ['hand', 'equip']) {
    const nextMode = (card as JsonObject)[mode] as JsonObject;
    const oldMode = oldCard[mode] as JsonObject;
    const nextTiers = Object.keys(nextMode.shortByTier as JsonObject).sort();
    const oldTiers = Object.keys(oldMode.shortByTier as JsonObject).sort();
    if (JSON.stringify(nextTiers) !== JSON.stringify(oldTiers)) throw new Error(`档位键变化：cards.${cardId}.${mode}.shortByTier`);
    const nextMilestones = nextMode.milestones as JsonObject;
    const oldMilestones = oldMode.milestones as JsonObject;
    if (JSON.stringify(Object.keys(nextMilestones).sort()) !== JSON.stringify(Object.keys(oldMilestones).sort())) {
      throw new Error(`里程碑键变化：cards.${cardId}.${mode}.milestones`);
    }
    for (const star of Object.keys(nextMilestones)) {
      const nextFx = (nextMilestones[star] as JsonObject).fx;
      const oldFx = (oldMilestones[star] as JsonObject).fx;
      if (nextFx !== oldFx) throw new Error(`fx 变化：cards.${cardId}.${mode}.milestones.${star}.fx`);
    }
  }
}

fs.writeFileSync(textsPath, `${JSON.stringify(texts, null, 2)}\n`, 'utf8');
console.log(`已写入 ${updates.size} 条审定文案（含五神 10 条）。`);
