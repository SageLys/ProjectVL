// DOM 引用集中缓存。UI 层唯一接触 document 的入口之一（另一处是各 render/input 模块）。

function el<T extends Element>(sel: string): T {
  const node = document.querySelector(sel);
  if (!node) throw new Error(`缺少必要 DOM 元素: ${sel}`);
  return node as unknown as T;
}

export function getDomRefs() {
  return {
    canvas: el<HTMLCanvasElement>('#game'),
    hpText: el<HTMLElement>('#hpText'),
    hpBar: el<HTMLElement>('#hpBar'),
    xpText: el<HTMLElement>('#xpText'),
    xpNeed: el<HTMLElement>('#xpNeed'),
    xpBar: el<HTMLElement>('#xpBar'),
    levelText: el<HTMLElement>('#levelText'),
    waveText: el<HTMLElement>('#waveText'),
    totalWavesText: el<HTMLElement>('#totalWavesText'),
    damageStat: el<HTMLElement>('#damageStat'),
    rateStat: el<HTMLElement>('#rateStat'),
    multiStat: el<HTMLElement>('#multiStat'),
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
    damageCtl: el<HTMLInputElement>('#damageCtl'),
    damageCtlVal: el<HTMLElement>('#damageCtlVal'),
    rateCtl: el<HTMLInputElement>('#rateCtl'),
    rateCtlVal: el<HTMLElement>('#rateCtlVal'),
    rangeCtl: el<HTMLInputElement>('#rangeCtl'),
    rangeCtlVal: el<HTMLElement>('#rangeCtlVal'),
    dropCtl: el<HTMLInputElement>('#dropCtl'),
    dropCtlVal: el<HTMLElement>('#dropCtlVal'),
    lifeCtl: el<HTMLInputElement>('#lifeCtl'),
    lifeCtlVal: el<HTMLElement>('#lifeCtlVal'),
    speedCtl: el<HTMLInputElement>('#speedCtl'),
    speedCtlVal: el<HTMLElement>('#speedCtlVal'),
    variantSel: el<HTMLSelectElement>('#variantSel'),
    resetTunerBtn: el<HTMLButtonElement>('#resetTunerBtn'),
    perkButtons: Array.from(document.querySelectorAll<HTMLButtonElement>('[data-perk]')),
  };
}

export type DomRefs = ReturnType<typeof getDomRefs>;
