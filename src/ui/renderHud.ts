import type { Config, GameState } from '../core/types';
import { totalDamage, totalFireRate, totalMulti } from '../core/stats';
import type { DomRefs } from './domRefs';
import { formatRuntimeModifier } from './cardMeta';

/** 刷新 HUD：生命/奖励蓄力/波次/实时数值 + 调参回显 + 当前可执行操作提示。 */
export function renderHud(refs: DomRefs, state: GameState, config: Config): void {
  refs.hpText.textContent = String(Math.max(0, Math.round(state.hp)));
  refs.maxHpText.textContent = String(Math.round(state.maxHp));
  refs.hpBar.style.width = `${Math.max(0, (state.hp / state.maxHp) * 100)}%`;
  const meter = state.rewardMeter;
  refs.rewardPointsText.textContent = String(Math.floor(meter.points));
  refs.rewardThresholdText.textContent = String(meter.threshold);
  refs.rewardBar.style.width = `${Math.min(100, Math.max(0, (meter.points / meter.threshold) * 100))}%`;
  refs.waveText.textContent = String(state.wave);
  if (refs.validationSettleBtn) {
    refs.validationSettleBtn.hidden = state.wavePhase !== 'validationRewardSettle';
    refs.validationSettleBtn.textContent = `奖励结算 ${Math.ceil(state.validationRewardSettleRemaining)}s · 继续`;
  }
  if (refs.statModifierText) {
    const timed = state.statModifiers.filter(modifier => modifier.remaining !== undefined);
    const content = timed.map(modifier => (
      `${formatRuntimeModifier(modifier)} ${Math.max(0, modifier.remaining ?? 0).toFixed(1)}s`
    )).join(' · ');
    refs.statModifierText.hidden = timed.length === 0;
    refs.statModifierText.textContent = content;
    refs.statModifierText.title = content;
  }
  if (refs.damageStat) refs.damageStat.textContent = String(Math.round(totalDamage(state, config)));
  if (refs.rateStat) refs.rateStat.textContent = `${totalFireRate(state, config).toFixed(1)}/s`;
  if (refs.multiStat) refs.multiStat.textContent = String(totalMulti(state));
  const hasEquipment = state.equipment.some(Boolean);
  refs.equipmentHint.textContent = hasEquipment ? '拖到战场可一次性释放' : '拖入 3★+ 卡装备';
  refs.dropTelemetry.textContent = hasEquipment ? '同型同星拖入可升星 · 装备卡可释放' : '装备卡也可拖到战场释放';
  refs.cardsHint.textContent = '拖到战场释放 · 同型同星自动合成';
}
