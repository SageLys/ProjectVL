import type { Config, GameState } from '../core/types';
import { totalDamage, totalFireRate, totalMulti } from '../core/stats';
import type { DomRefs } from './domRefs';

/** 刷新 HUD：血/经验/等级/波次/实时数值 + 调参回显 + 当前可执行操作提示。 */
export function renderHud(refs: DomRefs, state: GameState, config: Config): void {
  refs.hpText.textContent = String(Math.max(0, Math.round(state.hp)));
  refs.hpBar.style.width = `${Math.max(0, (state.hp / state.maxHp) * 100)}%`;
  refs.xpText.textContent = String(state.xp);
  refs.xpNeed.textContent = String(state.xpNeed);
  refs.xpBar.style.width = `${(state.xp / state.xpNeed) * 100}%`;
  refs.levelText.textContent = String(state.level);
  refs.waveText.textContent = String(state.wave);
  refs.damageStat.textContent = String(Math.round(totalDamage(state, config)));
  refs.rateStat.textContent = `${totalFireRate(state, config).toFixed(1)}/s`;
  refs.multiStat.textContent = String(totalMulti(state));
  refs.damageCtlVal.textContent = config.damage.toFixed(0);
  refs.rateCtlVal.textContent = config.fireRate.toFixed(1);
  refs.rangeCtlVal.textContent = config.range.toFixed(0);
  refs.dropCtlVal.textContent = `${Math.round(config.dropChance * 100)}%`;
  refs.lifeCtlVal.textContent = `${config.dropLifetime.toFixed(1)}秒`;
  refs.speedCtlVal.textContent = `${Math.round(config.enemySpeed * 100)}%`;
  const hasEquipment = state.equipment.some(Boolean);
  refs.equipmentHint.textContent = hasEquipment ? '长按装备卡可销毁' : '拖入 3★+ 卡装备';
  refs.dropTelemetry.textContent = hasEquipment ? '同型同星拖入可升星' : '装备永久 · 仅销毁腾位';
  refs.cardsHint.textContent = '拖到战场释放 · 同型同星自动合成';
}
