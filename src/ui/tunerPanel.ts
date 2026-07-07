import { gameConfig } from '../data';
import type { Config } from '../core/types';
import type { DomRefs } from './domRefs';

/** 实时调参面板：6 项滑杆即时改写 config，附「恢复默认参数」。 */
export function createTunerPanel(refs: DomRefs, config: Config, hooks: { onChange(): void; onReset(): void }) {
  function syncInputs(): void {
    refs.damageCtl.value = String(config.damage);
    refs.rateCtl.value = String(config.fireRate);
    refs.rangeCtl.value = String(config.range);
    refs.dropCtl.value = String(config.dropChance * 100);
    refs.lifeCtl.value = String(config.dropLifetime);
    refs.speedCtl.value = String(config.enemySpeed * 100);
  }

  refs.damageCtl.addEventListener('input', () => { config.damage = Number(refs.damageCtl.value); hooks.onChange(); });
  refs.rateCtl.addEventListener('input', () => { config.fireRate = Number(refs.rateCtl.value); hooks.onChange(); });
  refs.rangeCtl.addEventListener('input', () => { config.range = Number(refs.rangeCtl.value); hooks.onChange(); });
  refs.dropCtl.addEventListener('input', () => { config.dropChance = Number(refs.dropCtl.value) / 100; hooks.onChange(); });
  refs.lifeCtl.addEventListener('input', () => { config.dropLifetime = Number(refs.lifeCtl.value); hooks.onChange(); });
  refs.speedCtl.addEventListener('input', () => { config.enemySpeed = Number(refs.speedCtl.value) / 100; hooks.onChange(); });
  refs.resetTunerBtn.addEventListener('click', () => {
    Object.assign(config, gameConfig.defaultConfig);
    syncInputs();
    hooks.onChange();
    hooks.onReset();
  });

  return { syncInputs };
}
