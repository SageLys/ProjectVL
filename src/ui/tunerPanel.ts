import { activeVariants, cfg, VARIANTS } from '../config';
import { createDefaultConfig } from '../core/createInitialState';
import type { Config } from '../core/types';
import type { DomRefs } from './domRefs';

/**
 * 实时调参面板：6 项滑杆即时改写运行 config + variant 切换器（A/B 测试基建入口）。
 * variant 切换 = 带 ?variant= 参数重载页面，保证一局内配置不漂移。
 */
export function createTunerPanel(refs: DomRefs, config: Config, hooks: { onChange(): void; onReset(): void }) {
  function syncInputs(): void {
    refs.damageCtl.value = String(config.damage);
    refs.rateCtl.value = String(config.fireRate);
    refs.rangeCtl.value = String(config.range);
    refs.dropCtl.value = String(config.dropChance * 100);
    refs.lifeCtl.value = String(config.dropLifetime);
    refs.speedCtl.value = String(config.enemySpeed * 100);
  }

  // 滑杆范围来自配置（tuner 域），HTML 中的属性仅为占位。
  const ranges: [HTMLInputElement, keyof typeof cfg.tuner][] = [
    [refs.damageCtl, 'damage'], [refs.rateCtl, 'fireRate'], [refs.rangeCtl, 'range'],
    [refs.dropCtl, 'dropChance'], [refs.lifeCtl, 'dropLifetime'], [refs.speedCtl, 'enemySpeed'],
  ];
  for (const [input, key] of ranges) {
    input.min = String(cfg.tuner[key].min);
    input.max = String(cfg.tuner[key].max);
    input.step = String(cfg.tuner[key].step);
  }

  refs.damageCtl.addEventListener('input', () => { config.damage = Number(refs.damageCtl.value); hooks.onChange(); });
  refs.rateCtl.addEventListener('input', () => { config.fireRate = Number(refs.rateCtl.value); hooks.onChange(); });
  refs.rangeCtl.addEventListener('input', () => { config.range = Number(refs.rangeCtl.value); hooks.onChange(); });
  refs.dropCtl.addEventListener('input', () => { config.dropChance = Number(refs.dropCtl.value) / 100; hooks.onChange(); });
  refs.lifeCtl.addEventListener('input', () => { config.dropLifetime = Number(refs.lifeCtl.value); hooks.onChange(); });
  refs.speedCtl.addEventListener('input', () => { config.enemySpeed = Number(refs.speedCtl.value) / 100; hooks.onChange(); });
  refs.resetTunerBtn.addEventListener('click', () => {
    Object.assign(config, createDefaultConfig());
    syncInputs();
    hooks.onChange();
    hooks.onReset();
  });

  // variant 切换器：base + 已注册 variant 列表。
  const options = ['', ...Object.keys(VARIANTS)];
  refs.variantSel.innerHTML = options
    .map(name => `<option value="${name}"${(name === '' ? activeVariants.length === 0 : activeVariants.includes(name)) ? ' selected' : ''}>${name || 'base（默认）'}</option>`)
    .join('');
  refs.variantSel.addEventListener('change', () => {
    const name = refs.variantSel.value;
    const url = new URL(window.location.href);
    url.searchParams.delete('variant');
    if (name) url.searchParams.set('variant', name);
    window.location.href = url.toString();
  });

  return { syncInputs };
}
