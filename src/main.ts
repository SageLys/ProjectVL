// 步骤2「平移」：将原单文件 IIFE 脚本近乎原样迁移到模块。
// 逻辑与数值保持与 legacy 单文件一致，仅去掉 IIFE 包裹、引入 CSS、做最小 TS 适配。
// 后续步骤会把数据/规则/表现/输入拆分为独立模块，届时本文件将被重写为薄胶水层。
import './styles/app.css';
import { gameConfig, cards as cardsData, enemies as enemiesData, waves as wavesData, perks as perksData, texts } from './data';

// 简易文案格式化：把 {token} 替换为 vars[token]。
function fmt(tpl: string, vars: Record<string, string | number> = {}): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
}

const canvas = document.querySelector('#game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const ui: any = {
  hpText: $('#hpText'), hpBar: $('#hpBar'), xpText: $('#xpText'), xpNeed: $('#xpNeed'), xpBar: $('#xpBar'), levelText: $('#levelText'),
  waveText: $('#waveText'), damageStat: $('#damageStat'), rateStat: $('#rateStat'), multiStat: $('#multiStat'), cards: $('#cards'), equipmentSlots: $('#equipmentSlots'), tempSlot: $('#tempSlot'),
  centerMsg: $('#centerMsg'), toast: $('#toast'), startBtn: $('#startBtn'), pauseBtn: $('#pauseBtn'),
  levelModal: $('#levelModal'), resultModal: $('#resultModal'), resultTitle: $('#resultTitle'), resultDesc: $('#resultDesc'),
  resultKills: $('#resultKills'), resultMerges: $('#resultMerges'), resultUses: $('#resultUses'), dropTelemetry: $('#dropTelemetry'),
  damageCtl: $('#damageCtl'), damageCtlVal: $('#damageCtlVal'), rateCtl: $('#rateCtl'), rateCtlVal: $('#rateCtlVal'),
  rangeCtl: $('#rangeCtl'), rangeCtlVal: $('#rangeCtlVal'), dropCtl: $('#dropCtl'), dropCtlVal: $('#dropCtlVal'),
  lifeCtl: $('#lifeCtl'), lifeCtlVal: $('#lifeCtlVal'), speedCtl: $('#speedCtl'), speedCtlVal: $('#speedCtlVal'), resetTunerBtn: $('#resetTunerBtn'),
};

const CARD_TYPES: any = cardsData.types;
const CARD_FX = cardsData.effects;
const TAU = Math.PI * 2;
const TURRET = gameConfig.turret;
const CB = gameConfig.combat;
const DEFAULT_CONFIG = gameConfig.defaultConfig;
const config: any = { ...DEFAULT_CONFIG };
let state: any, last = performance.now(), toastTimer: any = 0;

function reset() {
  state = {
    mode: 'ready', paused: false, time: 0, hp: gameConfig.hp.max, maxHp: gameConfig.hp.max, wave: 0, waveTime: 0, between: 0,
    enemies: [], bullets: [], particles: [], groundDrops: [], cards: Array(gameConfig.slots.cards).fill(null), equipment: Array(gameConfig.slots.equipment).fill(null), tempCards: [], nextCardId: 1, nextDropId: 1,
    spawnLeft: 0, spawnTimer: 0, waveClearPending: false,
    damageBonus: 0, fireRateBonus: 0, multi: 1, shotCd: 0, turretAngle: -Math.PI / 2,
    xp: 0, xpNeed: perksData.xpNeedBase, level: 1, kills: 0, merges: 0, uses: 0, collected: 0, expired: 0,
  };
  ui.resultModal.classList.remove('show');
  ui.levelModal.classList.remove('show');
  ui.startBtn.textContent = texts.buttons.start;
  ui.pauseBtn.textContent = texts.buttons.pause;
  message(texts.center.readyTitle, texts.center.readyBody, true);
  renderCards(); renderEquipment(); renderTempSlot(); updateUI();
}

function start() {
  if (state.mode === 'ended') reset();
  if (state.mode === 'ready') {
    state.mode = 'playing';
    nextWave();
    ui.startBtn.textContent = texts.buttons.restart;
    message('', '', false);
  } else {
    reset();
    state.mode = 'playing';
    nextWave();
    ui.startBtn.textContent = texts.buttons.restart;
    message('', '', false);
  }
}

function nextWave() {
  if (state.wave > 0 && state.tempCards.length) {
    const cleared = state.tempCards.length;
    state.tempCards = [];
    toast(fmt(texts.toast.tempCleared, { count: cleared }));
  }
  state.wave++;
  state.spawnLeft = wavesData.enemyCountBase + state.wave * wavesData.enemyCountPerWave;
  state.spawnTimer = wavesData.firstSpawnDelay;
  state.waveClearPending = false;
  state.between = 0;
  toast(fmt(texts.toast.waveStart, { wave: state.wave }));
  renderTempSlot();
  updateUI();
}

function spawnEnemy() {
  const tr = wavesData.typeRoll;
  const roll = Math.random();
  let type = roll < tr.tankBase + state.wave * tr.tankPerWave ? 'tank' : roll < tr.fastThreshold ? 'fast' : 'normal';
  if (state.wave === wavesData.bossWave && state.spawnLeft === 1) type = 'boss';
  const def = (enemiesData as any)[type];
  const data = {
    label: def.label,
    hp: def.hpBase + state.wave * def.hpPerWave,
    speed: def.speedBase + state.wave * def.speedPerWave,
    r: def.r, color: def.color, damage: def.damage, xp: def.xp,
  };
  const side = Math.floor(Math.random() * 4), margin = wavesData.spawnMargin;
  const spawn = side === 0 ? { x: 35 + Math.random() * 890, y: -margin }
    : side === 1 ? { x: 960 + margin, y: 35 + Math.random() * 530 }
    : side === 2 ? { x: 35 + Math.random() * 890, y: 600 + margin }
    : { x: -margin, y: 35 + Math.random() * 530 };
  state.enemies.push({ ...spawn, type, maxHp: data.hp, ...data, hit: 0 });
}

function cardScale(star: number) { return gameConfig.starScale[star] || 1; }
function bonusFromCards(cards: any[]) {
  const bonus = { damage: 0, rate: 0, multi: 0, range: 0, drop: 0 };
  for (const card of cards) {
    if (!card) continue;
    const scale = cardScale(card.star);
    if (card.type === 'damage') bonus.damage += CARD_FX.damagePerScale * scale;
    if (card.type === 'rate') bonus.rate += CARD_FX.ratePerScale * scale;
    if (card.type === 'multi') card.star >= 2 ? bonus.multi++ : bonus.damage += CARD_FX.multiStar1DamagePerScale * scale;
    if (card.type === 'range') bonus.range += CARD_FX.rangePerScale * scale;
    if (card.type === 'luck') bonus.drop += CARD_FX.luckPerScale * scale;
  }
  return bonus;
}
function addBonus(a: any, b: any) { return { damage: a.damage + b.damage, rate: a.rate + b.rate, multi: a.multi + b.multi, range: a.range + b.range, drop: a.drop + b.drop }; }
function equipmentBonus() { return addBonus(bonusFromCards(state.equipment), bonusFromCards(state.tempCards)); }
function totalDamage() { return config.damage + state.damageBonus + equipmentBonus().damage; }
function totalFireRate() { return config.fireRate + state.fireRateBonus + equipmentBonus().rate; }
function totalMulti() { return state.multi + equipmentBonus().multi; }
function totalRange() { return config.range + equipmentBonus().range; }
function totalDropChance() { return Math.min(gameConfig.drops.chanceCap, config.dropChance + equipmentBonus().drop); }

function findTarget() {
  let best = null, bestDist = Infinity;
  for (const enemy of state.enemies) {
    const dist = Math.hypot(enemy.x - TURRET.x, enemy.y - TURRET.y);
    if (dist <= totalRange() && dist < bestDist) { best = enemy; bestDist = dist; }
  }
  return best;
}

function shoot(target: any) {
  const tx = TURRET.x, ty = TURRET.y;
  const a = Math.atan2(target.y - ty, target.x - tx);
  state.turretAngle = a;
  const spread = CB.spread;
  const multi = totalMulti();
  for (let i = 0; i < multi; i++) {
    const offset = (i - (multi - 1) / 2) * spread;
    state.bullets.push({ x: tx + Math.cos(a) * CB.muzzleOffset, y: ty + Math.sin(a) * CB.muzzleOffset, vx: Math.cos(a + offset) * CB.bulletSpeed, vy: Math.sin(a + offset) * CB.bulletSpeed, r: CB.bulletRadius, life: CB.bulletLife, damage: totalDamage() });
  }
  for (let i = 0; i < gameConfig.vfx.shootParticles; i++) particle(tx + Math.cos(a) * 26, ty + Math.sin(a) * 26, '#8cecff', 55);
}

function particle(x: number, y: number, color: string, speed = 80) {
  const a = Math.random() * TAU, s = Math.random() * speed;
  state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .25 + Math.random() * .35, max: .6, color, size: 2 + Math.random() * 3 });
}

function killEnemy(enemy: any) {
  state.kills++;
  state.xp += enemy.xp;
  for (let i = 0; i < gameConfig.vfx.killParticles; i++) particle(enemy.x, enemy.y, enemy.color, 150);
  if (Math.random() < totalDropChance() || enemy.type === 'boss') spawnGroundDrop(enemy.x, enemy.y);
  if (state.xp >= state.xpNeed) levelUp();
}

function spawnGroundDrop(x: number, y: number, forcedType: string | null = null) {
  const keys = Object.keys(CARD_TYPES);
  const type = forcedType || keys[Math.floor(Math.random() * keys.length)];
  state.groundDrops.push({ id: state.nextDropId++, x, y, type, star: 1, life: config.dropLifetime, maxLife: config.dropLifetime, pulse: Math.random() * TAU });
}

function addTestPair() {
  const type = Object.keys(CARD_TYPES)[state.merges % Object.keys(CARD_TYPES).length];
  spawnGroundDrop(360, 370, type);
  spawnGroundDrop(440, 370, type);
  spawnGroundDrop(520, 370, type);
  spawnGroundDrop(600, 370, type);
  toast(fmt(texts.toast.testDrops, { name: CARD_TYPES[type].name }));
}

function collectDrop(drop: any) {
  const empty = state.cards.findIndex((card: any) => card === null);
  if (empty < 0) { toast(texts.toast.cardsFull); return; }
  state.groundDrops = state.groundDrops.filter((d: any) => d.id !== drop.id);
  state.cards[empty] = { id: state.nextCardId++, type: drop.type, star: drop.star };
  state.collected++;
  const merged = autoMergeCards();
  toast(merged ? fmt(texts.toast.collectMerged, { count: merged }) : fmt(texts.toast.collect, { name: CARD_TYPES[drop.type].name }));
  renderCards(); updateUI();
}

function autoMergeCards() {
  let merged = 0, changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < state.cards.length; i++) {
      const a = state.cards[i];
      if (!a) continue;
      if (a.star >= gameConfig.maxStar) continue;
      for (let j = i + 1; j < state.cards.length; j++) {
        const b = state.cards[j];
        if (!b) continue;
        if (a.type === b.type && a.star === b.star) {
          state.cards[i] = { id: state.nextCardId++, type: a.type, star: a.star + 1 };
          state.cards[j] = null;
          state.merges++; merged++; changed = true;
          break outer;
        }
      }
    }
  }
  return merged;
}

function levelUp() {
  state.xp -= state.xpNeed;
  state.level++;
  state.xpNeed = Math.round(state.xpNeed * perksData.xpGrowth);
  state.paused = true;
  ui.levelModal.classList.add('show');
  updateUI();
}

function quickEquip(cardIndex: number) {
  const target = state.equipment.findIndex((card: any) => card === null);
  if (target < 0) { toast(texts.toast.equipFull); return; }
  moveOrSwap('cards', cardIndex, 'equipment', target);
}

function quickUnequip(equipIndex: number) {
  const target = state.cards.findIndex((card: any) => card === null);
  if (target < 0) { toast(texts.toast.unequipFull); return; }
  moveOrSwap('equipment', equipIndex, 'cards', target);
}

function collectionFor(kind: string) {
  if (kind === 'cards') return state.cards;
  if (kind === 'equipment') return state.equipment;
  return null;
}

function absorbTempCard(sourceKind: string, sourceIndex: number) {
  const source = collectionFor(sourceKind);
  if (!source) return;
  const moving = source[sourceIndex];
  if (!moving) return;
  source[sourceIndex] = null;
  state.tempCards.push(moving);
  state.uses++;
  const merged = sourceKind === 'cards' ? autoMergeCards() : 0;
  toast(fmt(texts.toast.tempInvest, { name: CARD_TYPES[moving.type].name, mergeSuffix: merged ? fmt(texts.toast.mergeSuffix, { count: merged }) : '' }));
  renderCards(); renderEquipment(); renderTempSlot(); updateUI();
}

function moveOrSwap(sourceKind: string, sourceIndex: number, targetKind: string, targetIndex: number) {
  if (sourceKind === targetKind && sourceIndex === targetIndex) return;
  if (targetKind === 'temp') { absorbTempCard(sourceKind, sourceIndex); return; }
  const source = collectionFor(sourceKind);
  const target = collectionFor(targetKind);
  if (!source || !target) return;
  const moving = source[sourceIndex];
  if (!moving) return;
  if (targetKind === 'equipment' && moving.star < gameConfig.maxStar) {
    toast(texts.toast.equipOnly3Star);
    return;
  }
  const replaced = target[targetIndex];
  target[targetIndex] = moving;
  source[sourceIndex] = replaced || null;
  const merged = targetKind === 'cards' || sourceKind === 'cards' ? autoMergeCards() : 0;
  state.uses++;
  toast(replaced
    ? fmt(texts.toast.swapped, { a: CARD_TYPES[moving.type].name, b: CARD_TYPES[replaced.type].name })
    : fmt(texts.toast.moved, { name: CARD_TYPES[moving.type].name, mergeSuffix: merged ? fmt(texts.toast.mergeSuffix, { count: merged }) : '' }));
  renderCards(); renderEquipment(); renderTempSlot(); updateUI();
}

let activePointerDrag: any = null, activeHotSlot: any = null;
function beginPointerDrag(e: PointerEvent, source: string, index: number, el: HTMLElement) {
  if (e.button != null && e.button !== 0) return;
  activePointerDrag = { source, index, el };
  el.classList.add('dragging');
}

function slotFromPoint(x: number, y: number) {
  return (document.elementFromPoint(x, y) as any)?.closest?.('.card-slot, .equip-slot, .temp-slot') || null;
}

document.addEventListener('pointermove', e => {
  if (!activePointerDrag) return;
  const slot = slotFromPoint(e.clientX, e.clientY);
  if (activeHotSlot !== slot) {
    activeHotSlot?.classList.remove('hot');
    activeHotSlot = slot;
    activeHotSlot?.classList.add('hot');
  }
});

document.addEventListener('pointerup', e => {
  if (!activePointerDrag) return;
  const drag = activePointerDrag, slot = slotFromPoint(e.clientX, e.clientY);
  drag.el.classList.remove('dragging');
  activeHotSlot?.classList.remove('hot');
  activePointerDrag = null; activeHotSlot = null;
  if (!slot) return;
  const targetKind = slot.dataset.testid === 'card-slot' ? 'cards' : slot.dataset.testid === 'temp-slot' ? 'temp' : 'equipment';
  moveOrSwap(drag.source, drag.index, targetKind, Number(slot.dataset.index));
});

function createCardElement(card: any, source: string, index: number) {
  const meta = CARD_TYPES[card.type];
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'card'; el.draggable = false;
  el.dataset.id = card.id; el.dataset.testid = source === 'cards' ? 'upgrade-card' : 'equipped-card';
  el.setAttribute('aria-label', `${source === 'equipment' ? '已装备' : ''}${card.star}星${meta.name}卡`); el.style.setProperty('--card', meta.color);
  el.innerHTML = `<b>${meta.icon} ${meta.name}</b><em>${'★'.repeat(card.star)}</em><small>${meta.desc}强化</small>`;
  el.addEventListener('dblclick', e => { e.preventDefault(); source === 'cards' ? quickEquip(index) : quickUnequip(index); });
  el.addEventListener('pointerdown', e => beginPointerDrag(e, source, index, el));
  return el;
}

function makeSlot(kind: string, index: number, card: any) {
  const slot = document.createElement('div');
  slot.className = kind === 'cards' ? 'card-slot' : 'equip-slot';
  slot.dataset.testid = kind === 'cards' ? 'card-slot' : 'equipment-slot'; slot.dataset.index = String(index);
  if (card) slot.append(createCardElement(card, kind, index)); else slot.textContent = kind === 'cards' ? '+' : `装备 ${index + 1}`;
  return slot;
}

function renderCards() {
  ui.cards.innerHTML = '';
  for (let i = 0; i < gameConfig.slots.cards; i++) ui.cards.append(makeSlot('cards', i, state.cards[i]));
}

function renderEquipment() {
  ui.equipmentSlots.innerHTML = '';
  for (let i = 0; i < gameConfig.slots.equipment; i++) ui.equipmentSlots.append(makeSlot('equipment', i, state.equipment[i]));
}

function renderTempSlot() {
  const counts = state.tempCards.reduce((acc: any, card: any) => {
    const key = `${card.type}-${card.star}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  ui.tempSlot.classList.toggle('has-temp', state.tempCards.length > 0);
  ui.tempSlot.innerHTML = state.tempCards.length
    ? `<div class="temp-summary"><b>已投入 ${state.tempCards.length} 张</b><em>${Object.entries(counts).map(([key, count]) => { const [type, star] = key.split('-'); return `${CARD_TYPES[type].name}${star}星×${count}`; }).join(' / ')}</em><small>下一波开始时清空</small></div>`
    : '拖入卡牌<br>叠加到本波';
}

function update(dt: number) {
  if (state.mode !== 'playing' || state.paused) return;
  state.time += dt;
  state.shotCd -= dt;
  const target = findTarget();
  if (target) state.turretAngle = Math.atan2(target.y - TURRET.y, target.x - TURRET.x);
  if (target && state.shotCd <= 0) { shoot(target); state.shotCd = 1 / totalFireRate(); }

  if (state.spawnLeft > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) { spawnEnemy(); state.spawnLeft--; state.spawnTimer = Math.max(.28, .72 - state.wave * .05); }
  }

  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j--) {
      const e = state.enemies[j];
      if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (b.r + e.r) ** 2) {
        e.hp -= b.damage; e.hit = .08; hit = true; particle(b.x, b.y, '#d8fbff', 50);
        if (e.hp <= 0) { state.enemies.splice(j, 1); killEnemy(e); }
        break;
      }
    }
    if (hit || b.life <= 0 || b.x < -20 || b.x > 980 || b.y < -20 || b.y > 620) state.bullets.splice(i, 1);
  }

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const dx = TURRET.x - e.x, dy = TURRET.y - e.y, len = Math.hypot(dx, dy) || 1;
    e.x += dx / len * e.speed * config.enemySpeed * dt; e.y += dy / len * e.speed * config.enemySpeed * dt; e.hit -= dt;
    if (Math.hypot(dx, dy) < CB.breakthroughDist) {
      state.hp -= e.damage; state.enemies.splice(i, 1);
      for (let k = 0; k < gameConfig.vfx.breakthroughParticles; k++) particle(TURRET.x, TURRET.y, '#ff6677', 170);
      toast(fmt(texts.toast.breakthrough, { damage: e.damage }));
      if (state.hp <= 0) end(false);
    }
  }

  for (let i = state.groundDrops.length - 1; i >= 0; i--) {
    const drop = state.groundDrops[i];
    drop.life -= dt; drop.pulse += dt * 3;
    if (drop.life <= 0) { state.groundDrops.splice(i, 1); state.expired++; }
  }

  for (let i = state.particles.length - 1; i >= 0; i--) { const p = state.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; p.life -= dt; if (p.life <= 0) state.particles.splice(i, 1); }

  if (state.spawnLeft === 0 && state.enemies.length === 0 && !state.waveClearPending && state.mode === 'playing') {
    state.waveClearPending = true;
    if (state.wave >= wavesData.totalWaves) end(true);
    else { state.between = wavesData.betweenWaves; toast(fmt(texts.toast.waveClear, { wave: state.wave })); }
  }
  if (state.between > 0) { state.between -= dt; if (state.between <= 0) nextWave(); }
  updateUI();
}

function end(win: boolean) {
  state.mode = 'ended'; state.paused = true;
  ui.resultTitle.textContent = win ? texts.result.winTitle : texts.result.loseTitle;
  ui.resultDesc.textContent = fmt(win ? texts.result.winDesc : texts.result.loseDesc, { collected: state.collected, expired: state.expired });
  ui.resultKills.textContent = state.kills; ui.resultMerges.textContent = state.merges; ui.resultUses.textContent = state.uses;
  ui.resultModal.classList.add('show');
}

function updateUI() {
  ui.hpText.textContent = Math.max(0, Math.round(state.hp)); ui.hpBar.style.width = `${Math.max(0, state.hp / state.maxHp * 100)}%`;
  ui.xpText.textContent = state.xp; ui.xpNeed.textContent = state.xpNeed; ui.xpBar.style.width = `${state.xp / state.xpNeed * 100}%`; ui.levelText.textContent = state.level;
  ui.waveText.textContent = state.wave; ui.damageStat.textContent = Math.round(totalDamage()); ui.rateStat.textContent = `${totalFireRate().toFixed(1)}/s`; ui.multiStat.textContent = totalMulti();
  ui.damageCtlVal.textContent = config.damage.toFixed(0); ui.rateCtlVal.textContent = config.fireRate.toFixed(1); ui.rangeCtlVal.textContent = config.range.toFixed(0);
  ui.dropCtlVal.textContent = `${Math.round(config.dropChance * 100)}%`; ui.lifeCtlVal.textContent = `${config.dropLifetime.toFixed(1)}秒`; ui.speedCtlVal.textContent = `${Math.round(config.enemySpeed * 100)}%`;
  ui.dropTelemetry.textContent = `地面 ${state.groundDrops.length} · 已拾取 ${state.collected} · 超时 ${state.expired}`;
}

function message(title: string, body: string, show: boolean) { ui.centerMsg.innerHTML = `<h2>${title}</h2><p>${body}</p>`; ui.centerMsg.style.display = show ? 'block' : 'none'; }
function toast(text: string) { ui.toast.textContent = text; ui.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1500); }

function drawGrid() {
  ctx.fillStyle = '#06101d'; ctx.fillRect(0, 0, 960, 600);
  const g = ctx.createLinearGradient(0, 0, 0, 600); g.addColorStop(0, 'rgba(29,79,112,.18)'); g.addColorStop(1, 'rgba(3,9,18,.05)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 600);
  ctx.strokeStyle = 'rgba(103,232,249,.055)'; ctx.lineWidth = 1;
  for (let x = 0; x < 960; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 600); ctx.stroke(); }
  for (let y = 0; y < 600; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(960, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(197,138,255,.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(TURRET.x, TURRET.y, 62, 0, TAU); ctx.stroke();
  ctx.save(); ctx.setLineDash([7, 9]); ctx.strokeStyle = 'rgba(103,232,249,.13)'; ctx.beginPath(); ctx.arc(TURRET.x, TURRET.y, totalRange(), 0, TAU); ctx.stroke(); ctx.restore();
}

function draw() {
  drawGrid();
  for (const p of state.particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
  for (const b of state.bullets) { ctx.shadowBlur = 14; ctx.shadowColor = '#70ecff'; ctx.fillStyle = '#c7f8ff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); } ctx.shadowBlur = 0;
  for (const e of state.enemies) {
    ctx.save(); ctx.translate(e.x, e.y); if (e.hit > 0) ctx.globalAlpha = .55; ctx.shadowBlur = 18; ctx.shadowColor = e.color; ctx.fillStyle = e.color; ctx.beginPath();
    const sides = e.type === 'fast' ? 3 : e.type === 'tank' ? 6 : e.type === 'boss' ? 8 : 4;
    for (let i = 0; i < sides; i++) { const a = -Math.PI / 2 + i * TAU / sides; const r = e.r * (i % 2 ? 0.82 : 1); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(2,8,17,.86)'; ctx.beginPath(); ctx.arc(0, 0, e.r * .38, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(e.x - e.r, e.y - e.r - 9, e.r * 2, 4); ctx.fillStyle = e.color; ctx.fillRect(e.x - e.r, e.y - e.r - 9, e.r * 2 * Math.max(0, e.hp / e.maxHp), 4);
  }
  for (const drop of state.groundDrops) {
    const meta = CARD_TYPES[drop.type], ratio = Math.max(0, drop.life / drop.maxLife), bob = Math.sin(drop.pulse) * 3;
    ctx.save(); ctx.translate(drop.x, drop.y + bob); ctx.shadowBlur = 18; ctx.shadowColor = meta.color; ctx.fillStyle = 'rgba(5,13,24,.92)'; ctx.strokeStyle = meta.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = meta.color; ctx.font = 'bold 17px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(meta.icon, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 27, -Math.PI / 2, TAU - Math.PI / 2); ctx.stroke(); ctx.strokeStyle = ratio > .35 ? '#67e8f9' : '#ff6b6b'; ctx.beginPath(); ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + TAU * ratio); ctx.stroke();
    ctx.fillStyle = '#e8f2ff'; ctx.font = 'bold 10px Microsoft YaHei'; ctx.fillText(`${drop.life.toFixed(1)}s`, 0, 36); ctx.restore();
  }
  const a = state.turretAngle;
  ctx.save(); ctx.translate(TURRET.x, TURRET.y); ctx.fillStyle = '#241a3d'; ctx.strokeStyle = '#d59bff'; ctx.lineWidth = 3; ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(197,138,255,.65)'; ctx.beginPath(); ctx.arc(0, 0, 32, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#ff8ed4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-19, -21); ctx.quadraticCurveTo(-31, -38, -9, -30); ctx.moveTo(19, -21); ctx.quadraticCurveTo(31, -38, 9, -30); ctx.stroke(); ctx.fillStyle = '#ff8ed4'; ctx.font = 'bold 15px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♥', 0, 1);
  ctx.rotate(a); ctx.fillStyle = '#68e8fa'; ctx.fillRect(3, -7, 42, 14); ctx.fillStyle = '#d9fbff'; ctx.fillRect(34, -4, 18, 8); ctx.restore(); ctx.shadowBlur = 0;
}

function loop(now: number) { const dt = Math.min(CB.dtCap, (now - last) / 1000); last = now; update(dt); draw(); requestAnimationFrame(loop); }
function canvasPoint(e: PointerEvent) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * canvas.width, y: (e.clientY - r.top) / r.height * canvas.height }; }
canvas.addEventListener('pointerdown', e => { const p = canvasPoint(e); let nearest = null, best = Infinity; for (const drop of state.groundDrops) { const d = Math.hypot(drop.x - p.x, drop.y - p.y); if (d < gameConfig.drops.pickupRadius && d < best) { nearest = drop; best = d; } } if (nearest) collectDrop(nearest); });
addEventListener('keydown', e => { if (e.code === 'KeyP') togglePause(); });
ui.startBtn.addEventListener('click', start); ui.pauseBtn.addEventListener('click', togglePause); ($('#testCardBtn') as HTMLElement).addEventListener('click', addTestPair); ($('#restartBtn') as HTMLElement).addEventListener('click', () => { reset(); start(); });
function togglePause() { if (state.mode !== 'playing') return; state.paused = !state.paused; ui.pauseBtn.textContent = state.paused ? texts.buttons.resume : texts.buttons.pause; message(state.paused ? texts.center.pausedTitle : '', texts.center.pausedBody, state.paused); }
function syncTunerInputs() {
  ui.damageCtl.value = config.damage; ui.rateCtl.value = config.fireRate; ui.rangeCtl.value = config.range; ui.dropCtl.value = config.dropChance * 100; ui.lifeCtl.value = config.dropLifetime; ui.speedCtl.value = config.enemySpeed * 100; updateUI();
}
ui.damageCtl.addEventListener('input', () => { config.damage = Number(ui.damageCtl.value); updateUI(); });
ui.rateCtl.addEventListener('input', () => { config.fireRate = Number(ui.rateCtl.value); updateUI(); });
ui.rangeCtl.addEventListener('input', () => { config.range = Number(ui.rangeCtl.value); updateUI(); });
ui.dropCtl.addEventListener('input', () => { config.dropChance = Number(ui.dropCtl.value) / 100; updateUI(); });
ui.lifeCtl.addEventListener('input', () => { config.dropLifetime = Number(ui.lifeCtl.value); updateUI(); });
ui.speedCtl.addEventListener('input', () => { config.enemySpeed = Number(ui.speedCtl.value) / 100; updateUI(); });
ui.resetTunerBtn.addEventListener('click', () => { Object.assign(config, DEFAULT_CONFIG); syncTunerInputs(); toast(texts.toast.tunerReset); });
const PERK_BY_ID: any = Object.fromEntries(perksData.perks.map(p => [p.id, p]));
document.querySelectorAll('[data-perk]').forEach(btn => btn.addEventListener('click', () => {
  const perk = PERK_BY_ID[(btn as HTMLElement).dataset.perk as string];
  if (!perk) return;
  if (perk.kind === 'damagePct') state.damageBonus += totalDamage() * perk.value;
  if (perk.kind === 'fireRatePct') state.fireRateBonus += totalFireRate() * perk.value;
  if (perk.kind === 'heal') state.hp = Math.min(state.maxHp, state.hp + perk.value);
  state.paused = false;
  ui.levelModal.classList.remove('show');
  toast(fmt(texts.toast.perkApplied, { title: perk.title }));
  updateUI();
}));
reset(); requestAnimationFrame(loop);
(window as any).__game = { getState: () => ({ ...state, enemies: state.enemies.length, bullets: state.bullets.length, config: { ...config } }), start, reset, spawnGroundDrop, addTestPair, moveOrSwap };
