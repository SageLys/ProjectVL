// DOM 引用集中缓存。UI 层唯一接触 document 的入口之一（另一处是各 render/input 模块）。

function el<T extends Element>(sel: string): T {
  const node = document.querySelector(sel);
  if (!node) throw new Error(`缺少必要 DOM 元素: ${sel}`);
  return node as unknown as T;
}

function maybeEl<T extends Element>(sel: string): T | null {
  return document.querySelector<T>(sel);
}

export function getDomRefs() {
  return {
    canvas: el<HTMLCanvasElement>('#game'),
    arena: el<HTMLElement>('#arena'),
    dock: el<HTMLElement>('#dock'),
    aimPreview: el<HTMLElement>('#aimPreview'),
    screenPreview: el<HTMLElement>('#screenPreview'),
    hpText: el<HTMLElement>('#hpText'),
    hpBar: el<HTMLElement>('#hpBar'),
    xpText: el<HTMLElement>('#xpText'),
    xpNeed: el<HTMLElement>('#xpNeed'),
    xpBar: el<HTMLElement>('#xpBar'),
    levelText: el<HTMLElement>('#levelText'),
    waveText: el<HTMLElement>('#waveText'),
    totalWavesText: el<HTMLElement>('#totalWavesText'),
    damageStat: maybeEl<HTMLElement>('#damageStat'),
    rateStat: maybeEl<HTMLElement>('#rateStat'),
    multiStat: maybeEl<HTMLElement>('#multiStat'),
    cards: el<HTMLElement>('#cards'),
    equipmentBar: el<HTMLElement>('#equipmentBar'),
    equipmentHint: el<HTMLElement>('#equipmentHint'),
    equipmentSlots: el<HTMLElement>('#equipmentSlots'),
    cardsHint: el<HTMLElement>('#cardsHint'),
    centerMsg: el<HTMLElement>('#centerMsg'),
    toast: el<HTMLElement>('#toast'),
    startBtn: el<HTMLButtonElement>('#startBtn'),
    pauseBtn: el<HTMLButtonElement>('#pauseBtn'),
    testCardBtn: el<HTMLButtonElement>('#testCardBtn'),
    restartBtn: el<HTMLButtonElement>('#restartBtn'),
    levelModal: el<HTMLElement>('#levelModal'),
    resultModal: el<HTMLElement>('#resultModal'),
    resultTitle: el<HTMLElement>('#resultTitle'),
    resultDesc: el<HTMLElement>('#resultDesc'),
    resultKills: el<HTMLElement>('#resultKills'),
    resultMerges: el<HTMLElement>('#resultMerges'),
    resultUses: el<HTMLElement>('#resultUses'),
    dropTelemetry: el<HTMLElement>('#dropTelemetry'),
    perkButtons: Array.from(document.querySelectorAll<HTMLButtonElement>('[data-perk]')),
  };
}

export type DomRefs = ReturnType<typeof getDomRefs>;
