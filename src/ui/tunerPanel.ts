import { activeVariants, cfg, VARIANTS } from '../config';
import './tunerPanel.css';
import type { Config } from '../core/types';
import { deriveMetrics } from './derivedMetrics';
import { getNumberAt, setNumberAt, TUNER_PARAMS, type TunerGroup } from './tunerSchema';

const PRESET_KEY = 'projectvl.tuner.presets.v2';

interface Preset {
  version: 2;
  name: string;
  savedAt: string;
  values: Record<string, number>;
}

export interface TunerPanel {
  syncInputs(): void;
  applyPendingWaveChanges(): void;
  getActivePresetName(): string;
}

export interface TunerHooks {
  onImmediateChange(path: string): void;
  onWaveConfigApplied(paths: string[]): void;
  onReset(): void;
  isWaveActive(): boolean;
  debug: {
    getSeed(): number;
    setSeed(seed: number): void;
    getTimeScale(): number;
    setTimeScale(scale: number): void;
    getInvincible(): boolean;
    setInvincible(value: boolean): void;
    jumpToWave(wave: number): void;
    restartWave(): void;
  };
}

const RUNTIME_KEYS: Record<string, keyof Config> = {
  'combat.defaults.damage': 'damage',
  'combat.defaults.fireRate': 'fireRate',
  'combat.defaults.range': 'range',
  'economy.defaults.dropChance': 'dropChance',
  'economy.defaults.dropLifetime': 'dropLifetime',
  'enemies.defaults.enemySpeed': 'enemySpeed',
};

const GROUPS: { key: TunerGroup; title: string; note?: string }[] = [
  { key: 'waves', title: 'A · 出怪节奏与波结构', note: '下波生效' },
  { key: 'combat', title: 'B · 炮台与弹道' },
  { key: 'enemies', title: 'C · 敌人数值' },
  { key: 'drops', title: 'D · 掉落与拾取' },
];

function readPresets(): Preset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESET_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is Preset => typeof item === 'object' && item !== null && 'values' in item) : [];
  } catch { return []; }
}

function format(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(3)));
}

function controlHtml(path: string, label: string, index: number): string {
  const range = cfg.tuner[path];
  if (!range) throw new Error(`tuner.json 缺少范围: ${path}`);
  return `<label class="tuner-control" data-path="${path}"><span>${label}</span><output></output><input data-tuner-index="${index}" type="range" min="${range.min}" max="${range.max}" step="${range.step}"></label>`;
}

export function createTunerPanel(root: HTMLElement, config: Config, hooks: TunerHooks): TunerPanel {
  root.hidden = false;
  const baseline = Object.fromEntries(TUNER_PARAMS.map(param => [param.path, getNumberAt(cfg, param.path)]));
  const pendingWaves = new Map<string, number>();
  let diffPaths = new Set<string>();
  let presets = readPresets();
  let activePresetName = '';

  const groupsHtml = GROUPS.map(group => {
    const controls = TUNER_PARAMS.filter(param => param.group === group.key)
      .map(param => controlHtml(param.path, param.label, TUNER_PARAMS.indexOf(param))).join('');
    return `<section class="tuner-group"><h3>${group.title}${group.note ? `<small>${group.note}</small>` : ''}</h3><div class="tuner-grid">${controls}</div></section>`;
  }).join('');
  const p2 = TUNER_PARAMS.filter(param => param.group === 'p2')
    .map(param => controlHtml(param.path, param.label, TUNER_PARAMS.indexOf(param))).join('');

  root.innerHTML = `<summary>开发调参 v2</summary><div class="dev-tools-body">
    <div class="tuner-toolbar"><label>配置 Variant <select id="variantSel"></select></label><button class="btn" id="resetTunerBtn">恢复默认参数</button></div>
    ${groupsHtml}
    <details class="tuner-group tuner-p2"><summary>P2 · 默认冻结</summary><div class="tuner-grid">${p2}</div></details>
    <section class="tuner-group derived"><h3>H · 派生指标 <small>即时联动</small></h3><div id="derivedMetrics"></div></section>
    <section class="tuner-group"><h3>Preset</h3><div class="preset-row"><input id="presetName" placeholder="命名 preset"><button class="btn" id="savePresetBtn">保存并导出 JSON</button></div><div class="preset-row"><select id="presetSel"></select><button class="btn" id="loadPresetBtn">加载</button><button class="btn danger" id="deletePresetBtn">删除</button></div><p class="tuner-note" id="presetSaveStatus">保存时同时写入项目 presets/；加载后高亮与加载前当前配置不同的字段。</p></section>
    <section class="tuner-group"><h3>调试模式</h3><div class="debug-grid">
      <label>目标波次<input id="jumpWaveInput" type="number" min="1" step="1" value="1"></label><button class="btn" id="jumpWaveBtn">清场并跳波</button>
      <label>RNG seed<input id="seedInput" type="number" step="1"></label><button class="btn" id="applySeedBtn">应用 seed</button>
      <label>timeScale <output id="timeScaleVal"></output><input id="timeScaleInput" type="range" min="0.25" max="3" step="0.25"></label>
      <label class="debug-check"><input id="invincibleInput" type="checkbox">锁血不死</label><button class="btn" id="restartWaveBtn">重开本波</button>
    </div></section>
  </div>`;

  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('[data-tuner-index]'));
  const derived = root.querySelector<HTMLElement>('#derivedMetrics')!;
  const presetName = root.querySelector<HTMLInputElement>('#presetName')!;
  const presetSel = root.querySelector<HTMLSelectElement>('#presetSel')!;
  const presetSaveStatus = root.querySelector<HTMLElement>('#presetSaveStatus')!;

  function displayedValue(path: string): number { return pendingWaves.get(path) ?? getNumberAt(cfg, path); }

  function metricConfig() {
    const draft = structuredClone(cfg);
    for (const [path, value] of pendingWaves) setNumberAt(draft, path, value);
    return draft;
  }

  function renderMetrics(): void {
    const metrics = deriveMetrics(metricConfig(), config);
    const types = [['normal', '普通'], ['fast', '高速'], ['tank', '重装'], ['boss', 'Boss']] as const;
    const table = types.map(([type, label]) => `<tr><th>${label}</th>${metrics.cells[type].map(cell => `<td title="命中率 ${format(cell.hitRate * 100)}%">${cell.ttk.toFixed(2)}s</td>`).join('')}</tr>`).join('');
    const n = metrics.cells.normal[0];
    derived.innerHTML = `<div class="metric-block"><b>TTK 矩阵</b><table><thead><tr><th>类型</th><th>波 1</th><th>波 2</th><th>波 3</th></tr></thead><tbody>${table}</tbody></table></div>
      <div class="metric-cards">
        <span><b>${n.entryWalk.toFixed(2)}s / ${n.insideWalk.toFixed(2)}s</b>入场走行 / 圈内存活走行（普通·波1）</span>
        <span><b>${n.killDepth.toFixed(1)}px</b>理论击杀深度（普通·波1）</span>
        <span><b>${n.onScreen.toFixed(2)}</b>理论同屏数（普通·波1）</span>
        <span><b>${metrics.waveDurations.slice(0, 3).map(value => `${value.toFixed(1)}s`).join(' / ')}</b>每波理论时长（前 3 波）</span>
        <span><b>${(metrics.totalDuration / 60).toFixed(2)}min</b>全局理论局长</span>
        <span><b>${metrics.dropsPerMinute.toFixed(2)}/min</b>每分钟掉落期望（普通·波1）</span>
      </div><p class="tuner-note">命中率模型：min(1, 敌半径 ÷ [射程 × tan(散布)])；走行距离取四边中点出生距离均值。</p>`;
  }

  function setImmediate(path: string, value: number): void {
    setNumberAt(cfg, path, value);
    const runtimeKey = RUNTIME_KEYS[path];
    if (runtimeKey) config[runtimeKey] = value;
    hooks.onImmediateChange(path);
  }

  function setParam(path: string, value: number): void {
    const param = TUNER_PARAMS.find(item => item.path === path)!;
    if (param.waveDeferred && hooks.isWaveActive()) pendingWaves.set(path, value);
    else {
      pendingWaves.delete(path);
      setImmediate(path, value);
      if (path.startsWith('waves.')) hooks.onWaveConfigApplied([path]);
    }
  }

  function snapshot(): Record<string, number> {
    return Object.fromEntries(TUNER_PARAMS.map(param => [param.path, displayedValue(param.path)]));
  }

  function updatePresetOptions(): void {
    presetSel.innerHTML = presets.length
      ? presets.map((preset, index) => `<option value="${index}">${preset.name} · ${new Date(preset.savedAt).toLocaleString()}</option>`).join('')
      : '<option value="">暂无 preset</option>';
  }

  function syncInputs(): void {
    for (const input of inputs) {
      const param = TUNER_PARAMS[Number(input.dataset.tunerIndex)];
      const value = displayedValue(param.path);
      input.value = String(value);
      input.closest<HTMLElement>('.tuner-control')!.querySelector('output')!.textContent = format(value);
      input.closest<HTMLElement>('.tuner-control')!.classList.toggle('diff', diffPaths.has(param.path));
      input.closest<HTMLElement>('.tuner-control')!.classList.toggle('pending', pendingWaves.has(param.path));
    }
    root.querySelector<HTMLInputElement>('#seedInput')!.value = String(hooks.debug.getSeed());
    const scale = hooks.debug.getTimeScale();
    root.querySelector<HTMLInputElement>('#timeScaleInput')!.value = String(scale);
    root.querySelector<HTMLOutputElement>('#timeScaleVal')!.value = `${scale}×`;
    root.querySelector<HTMLInputElement>('#invincibleInput')!.checked = hooks.debug.getInvincible();
    renderMetrics();
  }

  function applyPendingWaveChanges(): void {
    if (!pendingWaves.size) return;
    const paths = [...pendingWaves.keys()];
    for (const [path, value] of pendingWaves) setNumberAt(cfg, path, value);
    pendingWaves.clear();
    hooks.onWaveConfigApplied(paths);
    syncInputs();
  }

  for (const input of inputs) input.addEventListener('input', () => {
    const param = TUNER_PARAMS[Number(input.dataset.tunerIndex)];
    setParam(param.path, Number(input.value));
    diffPaths.delete(param.path);
    syncInputs();
  });

  const variantSel = root.querySelector<HTMLSelectElement>('#variantSel')!;
  variantSel.innerHTML = ['', ...Object.keys(VARIANTS)].map(name => `<option value="${name}"${(name === '' ? activeVariants.length === 0 : activeVariants.includes(name)) ? ' selected' : ''}>${name || 'base（默认）'}</option>`).join('');
  variantSel.addEventListener('change', () => {
    const url = new URL(location.href); url.searchParams.delete('variant');
    if (variantSel.value) url.searchParams.set('variant', variantSel.value);
    location.href = url.toString();
  });

  root.querySelector('#resetTunerBtn')!.addEventListener('click', () => {
    activePresetName = '';
    diffPaths.clear();
    for (const param of TUNER_PARAMS) setParam(param.path, baseline[param.path]);
    syncInputs(); hooks.onReset();
  });
  root.querySelector('#savePresetBtn')!.addEventListener('click', () => {
    const name = presetName.value.trim();
    if (!name) { presetName.focus(); return; }
    const preset: Preset = { version: 2, name, savedAt: new Date().toISOString(), values: snapshot() };
    activePresetName = name;
    const existing = presets.findIndex(item => item.name === name);
    if (existing >= 0) presets[existing] = preset; else presets.push(preset);
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
    updatePresetOptions(); presetSel.value = String(existing >= 0 ? existing : presets.length - 1);
    presetSaveStatus.textContent = '正在写入项目 presets/…';
    void fetch('/__tuner/preset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, preset }),
    }).then(async response => {
      const result = await response.json() as { ok?: boolean; path?: string };
      if (!response.ok || !result.ok || !result.path) throw new Error('保存失败');
      presetSaveStatus.textContent = `已写入项目：${result.path}；也已下载到浏览器下载目录。`;
    }).catch(() => {
      presetSaveStatus.textContent = '项目内写入失败；JSON 仍已下载到浏览器下载目录。请通过 npm run dev 打开页面后重试。';
    });
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.tuner.json`;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  root.querySelector('#loadPresetBtn')!.addEventListener('click', () => {
    const preset = presets[Number(presetSel.value)]; if (!preset) return;
    activePresetName = preset.name;
    const before = snapshot();
    diffPaths = new Set(TUNER_PARAMS.filter(param => before[param.path] !== preset.values[param.path]).map(param => param.path));
    for (const param of TUNER_PARAMS) if (typeof preset.values[param.path] === 'number') setParam(param.path, preset.values[param.path]);
    syncInputs();
  });
  root.querySelector('#deletePresetBtn')!.addEventListener('click', () => {
    const index = Number(presetSel.value); if (!presets[index]) return;
    presets.splice(index, 1); localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); updatePresetOptions();
  });

  root.querySelector('#applySeedBtn')!.addEventListener('click', () => { hooks.debug.setSeed(Number(root.querySelector<HTMLInputElement>('#seedInput')!.value)); syncInputs(); });
  root.querySelector('#jumpWaveBtn')!.addEventListener('click', () => { applyPendingWaveChanges(); hooks.debug.jumpToWave(Number(root.querySelector<HTMLInputElement>('#jumpWaveInput')!.value)); });
  root.querySelector('#restartWaveBtn')!.addEventListener('click', () => { applyPendingWaveChanges(); hooks.debug.restartWave(); });
  root.querySelector<HTMLInputElement>('#timeScaleInput')!.addEventListener('input', event => { hooks.debug.setTimeScale(Number((event.currentTarget as HTMLInputElement).value)); syncInputs(); });
  root.querySelector<HTMLInputElement>('#invincibleInput')!.addEventListener('change', event => hooks.debug.setInvincible((event.currentTarget as HTMLInputElement).checked));

  updatePresetOptions(); syncInputs();
  return { syncInputs, applyPendingWaveChanges, getActivePresetName: () => activePresetName };
}
