import './calibration.css';
import { cfg } from '../config';
import type { ConfirmStyle, HoldOrDbl } from '../config/types';

interface PointerSample { at: string; pointerType: string; distancePx: number; durationMs: number; classifiedTap: boolean }
interface Attempt { at: string; mode: string; success: boolean; durationMs: number }

const samples: PointerSample[] = [];
const confirmAttempts: Attempt[] = [];
const shortcutAttempts: Attempt[] = [];
let reticleOffset = cfg.input.reticleOffsetY;
let confirmStyle: ConfirmStyle = cfg.input.confirmStyle;
let holdOrDbl: HoldOrDbl = cfg.input.holdOrDbl;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少校准页元素 #${id}`);
  return node as T;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function histogram(values: number[], step: number, max: number): string {
  const count = Math.ceil(max / step);
  const bins = Array.from({ length: count }, () => 0);
  for (const value of values) bins[Math.min(count - 1, Math.floor(value / step))] += 1;
  const peak = Math.max(1, ...bins);
  return bins.map((n, i) => `<div class="hist-bin"><i style="height:${Math.round(n / peak * 100)}%"></i><small>${i * step}–${(i + 1) * step}</small><b>${n}</b></div>`).join('');
}

function renderTapStats(): void {
  const distances = samples.map(s => s.distancePx);
  const durations = samples.map(s => s.durationMs);
  el('tapCount').textContent = String(samples.length);
  el('distanceHist').innerHTML = histogram(distances, 2, 24);
  el('durationHist').innerHTML = histogram(durations, 50, 600);
  const px = Math.max(1, Math.ceil(percentile(distances, .95)));
  const ms = Math.max(50, Math.ceil(percentile(durations, .95) / 10) * 10);
  el('tapAdvice').textContent = samples.length < 10
    ? `还需 ${10 - samples.length} 次；建议至少记录 20 次。`
    : `样本 P95：${px}px / ${ms}ms；建议阈值可从 ${px}px / ${ms}ms 起评估（当前配置 ${cfg.input.tapMaxPx}px / ${cfg.input.tapMaxMs}ms）。`;
}

function markdown(): string {
  const now = new Date();
  const rows = samples.map((s, i) => `| ${i + 1} | ${s.at} | ${s.pointerType} | ${s.distancePx.toFixed(2)} | ${s.durationMs.toFixed(1)} | ${s.classifiedTap ? '是' : '否'} |`).join('\n') || '| — | — | — | — | — | — |';
  const attemptRows = (items: Attempt[]) => items.map((a, i) => `| ${i + 1} | ${a.at} | ${a.mode} | ${a.success ? '成功' : '取消/失败'} | ${a.durationMs.toFixed(1)} |`).join('\n') || '| — | — | — | — | — |';
  return `# T1 触控校准记录

生成时间：${now.toLocaleString('zh-CN')}  
设备：${navigator.userAgent}

## 1. 点击阈值试验

- 样本数：${samples.length}
- 位移 P95：${percentile(samples.map(s => s.distancePx), .95).toFixed(2)} px
- 时长 P95：${percentile(samples.map(s => s.durationMs), .95).toFixed(1)} ms
- 当前初值：${cfg.input.tapMaxPx} px / ${cfg.input.tapMaxMs} ms

| # | 时间 | 指针 | 最大位移(px) | 时长(ms) | 按当前阈值判点击 |
|---:|---|---|---:|---:|---|
${rows}

## 2. 预览环偏移试验

- 选定 reticleOffsetY：${reticleOffset} px
- 试验范围：40–90 px
- 评判口径：不被手指挡住，且视觉上不觉得飘。

## 3. 确认形式试验

- 选定 confirmStyle：\`${confirmStyle}\`

| # | 时间 | 形式 | 结果 | 完成耗时(ms) |
|---:|---|---|---|---:|
${attemptRows(confirmAttempts)}

## 4. 双击 vs 长按试验

- 选定 holdOrDbl：\`${holdOrDbl}\`

| # | 时间 | 形式 | 结果 | 完成耗时(ms) |
|---:|---|---|---|---:|
${attemptRows(shortcutAttempts)}

## 5. 待人工回填

实测约 30 分钟后，将定案值回填到 \`src/config/base/input.json\`，再进入 S1a。确认前不要改动游戏本体输入逻辑。
`;
}

async function exportResults(source: string): Promise<void> {
  const content = markdown();
  try {
    const response = await fetch('/__calibration/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: content }) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    el('exportStatus').textContent = `${source}结果已汇总写入 docs/T1_触控校准记录.md`;
  } catch {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'T1_触控校准记录.md'; a.click();
    URL.revokeObjectURL(a.href);
    el('exportStatus').textContent = '服务端写入失败，已改为下载 Markdown。';
  }
}

function bindExports(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-export]').forEach(button => button.addEventListener('click', () => void exportResults(button.dataset.export ?? '校准')));
}

function bindTapTarget(): void {
  const target = el('tapTarget');
  let start: { id: number; x: number; y: number; at: number; max: number } | null = null;
  target.addEventListener('pointerdown', event => {
    start = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), max: 0 };
    target.setPointerCapture(event.pointerId);
    target.classList.add('active');
  });
  target.addEventListener('pointermove', event => {
    if (!start || start.id !== event.pointerId) return;
    start.max = Math.max(start.max, Math.hypot(event.clientX - start.x, event.clientY - start.y));
  });
  const finish = (event: PointerEvent) => {
    if (!start || start.id !== event.pointerId) return;
    const duration = performance.now() - start.at;
    const distance = Math.max(start.max, Math.hypot(event.clientX - start.x, event.clientY - start.y));
    samples.push({ at: new Date().toISOString(), pointerType: event.pointerType, distancePx: distance, durationMs: duration, classifiedTap: distance < cfg.input.tapMaxPx && duration < cfg.input.tapMaxMs });
    start = null; target.classList.remove('active'); renderTapStats();
  };
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
}

function bindReticle(): void {
  const pad = el('reticlePad');
  const ring = el('reticle');
  const slider = el<HTMLInputElement>('offsetSlider');
  const updateValue = () => { reticleOffset = Number(slider.value); el('offsetValue').textContent = `${reticleOffset}px`; };
  slider.value = String(reticleOffset); updateValue(); slider.addEventListener('input', updateValue);
  let activeId: number | null = null;
  const move = (event: PointerEvent) => {
    if (event.pointerId !== activeId) return;
    const rect = pad.getBoundingClientRect();
    ring.style.transform = `translate(${event.clientX - rect.left - 27}px, ${event.clientY - rect.top - reticleOffset - 27}px)`;
  };
  pad.addEventListener('pointerdown', event => { activeId = event.pointerId; pad.setPointerCapture(event.pointerId); ring.hidden = false; move(event); });
  pad.addEventListener('pointermove', move);
  const end = () => { activeId = null; ring.hidden = true; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
}

function bindConfirm(): void {
  const card = el('equipCard');
  const bubbleMode = el<HTMLButtonElement>('bubbleMode');
  const ringMode = el<HTMLButtonElement>('ringMode');
  let downAt = 0; let timer = 0;
  const select = (mode: ConfirmStyle) => {
    confirmStyle = mode;
    bubbleMode.classList.toggle('selected', mode === 'bubble'); ringMode.classList.toggle('selected', mode === 'hold-ring');
    el('confirmHelp').textContent = mode === 'bubble' ? '轻触装备格，再点气泡中的“确认装备”。' : '按住装备格，直到 800ms 填充环完成。';
  };
  bubbleMode.addEventListener('click', () => select('bubble')); ringMode.addEventListener('click', () => select('hold-ring')); select(confirmStyle);
  card.addEventListener('pointerdown', event => {
    downAt = performance.now(); card.setPointerCapture(event.pointerId);
    if (confirmStyle === 'hold-ring') {
      card.classList.add('holding');
      timer = window.setTimeout(() => { confirmAttempts.push({ at: new Date().toISOString(), mode: 'hold-ring', success: true, durationMs: performance.now() - downAt }); card.classList.remove('holding'); card.classList.add('success'); }, 800);
    }
  });
  card.addEventListener('pointerup', () => {
    clearTimeout(timer); card.classList.remove('holding');
    if (confirmStyle === 'bubble') el('confirmBubble').hidden = false;
    else if (!card.classList.contains('success')) confirmAttempts.push({ at: new Date().toISOString(), mode: 'hold-ring', success: false, durationMs: performance.now() - downAt });
    setTimeout(() => card.classList.remove('success'), 450);
  });
  el('confirmYes').addEventListener('click', () => { confirmAttempts.push({ at: new Date().toISOString(), mode: 'bubble', success: true, durationMs: performance.now() - downAt }); el('confirmBubble').hidden = true; card.classList.add('success'); setTimeout(() => card.classList.remove('success'), 450); });
  el('confirmNo').addEventListener('click', () => { confirmAttempts.push({ at: new Date().toISOString(), mode: 'bubble', success: false, durationMs: performance.now() - downAt }); el('confirmBubble').hidden = true; });
}

function bindShortcut(): void {
  const card = el('shortcutCard');
  const dbl = el<HTMLButtonElement>('doubleMode'); const hold = el<HTMLButtonElement>('longMode');
  let firstTap = 0; let downAt = 0; let timer = 0;
  const select = (mode: HoldOrDbl) => { holdOrDbl = mode; dbl.classList.toggle('selected', mode === 'double-tap'); hold.classList.toggle('selected', mode === 'long-press'); el('shortcutHelp').textContent = mode === 'double-tap' ? '在 350ms 内连续轻触两次。' : '持续按住 650ms。'; };
  dbl.addEventListener('click', () => select('double-tap')); hold.addEventListener('click', () => select('long-press')); select(holdOrDbl);
  const success = (mode: string, started: number) => { shortcutAttempts.push({ at: new Date().toISOString(), mode, success: true, durationMs: performance.now() - started }); card.classList.add('success'); setTimeout(() => card.classList.remove('success'), 450); };
  card.addEventListener('pointerdown', event => { downAt = performance.now(); card.setPointerCapture(event.pointerId); if (holdOrDbl === 'long-press') timer = window.setTimeout(() => success('long-press', downAt), 650); });
  card.addEventListener('pointerup', () => {
    clearTimeout(timer);
    if (holdOrDbl === 'long-press') { if (!card.classList.contains('success')) shortcutAttempts.push({ at: new Date().toISOString(), mode: 'long-press', success: false, durationMs: performance.now() - downAt }); return; }
    const now = performance.now();
    if (firstTap && now - firstTap <= 350) { success('double-tap', firstTap); firstTap = 0; } else firstTap = now;
  });
}

export function mountCalibrationApp(root: HTMLElement): void {
  document.title = 'ProjectVL · T1 触控校准';
  root.innerHTML = `<main class="calibrate">
    <header><div><small>DEV ONLY · T1</small><h1>触控交互校准</h1><p>按顺序完成三组试验。建议手机竖屏、自然持握，每组多试几次。</p></div><a href="/">返回游戏</a></header>
    <section><h2>1. 点击阈值试验</h2><p>用自然速度点击全屏点靶，系统记录 down→up 最大位移与时长。样本 <b id="tapCount">0</b></p><div id="tapTarget" class="tap-target"><span>点这里</span></div><p id="tapAdvice">建议至少记录 20 次。</p><h3>位移分布（px）</h3><div id="distanceHist" class="hist"></div><h3>时长分布（ms）</h3><div id="durationHist" class="hist"></div><button data-export="点击阈值">导出结果</button></section>
    <section><h2>2. 预览环偏移试验</h2><p>在试验区按住并拖动，调到“不被手指挡住且不觉得飘”。</p><label>Δy <input id="offsetSlider" type="range" min="40" max="90" step="1"><output id="offsetValue"></output></label><div id="reticlePad" class="reticle-pad"><span>按住拖动</span><i id="reticle" class="reticle" hidden></i></div><button data-export="预览环偏移">导出结果</button></section>
    <section><h2>3. 确认形式试验</h2><div class="mode-row"><button id="bubbleMode">抬指后气泡</button><button id="ringMode">长按填充环</button></div><p id="confirmHelp"></p><div class="prototype"><button id="equipCard" class="mock-card"><b>⚡ 装备</b><small>3★ · 永久不可撤销</small></button><div id="confirmBubble" class="confirm-bubble" hidden><b>此操作不可撤销</b><button id="confirmYes">确认装备</button><button id="confirmNo">取消</button></div></div><button data-export="确认形式">导出结果</button>
      <hr><h2>双击 vs 长按</h2><div class="mode-row"><button id="doubleMode">双击</button><button id="longMode">长按</button></div><p id="shortcutHelp"></p><button id="shortcutCard" class="mock-card"><b>◆ 模拟卡格</b><small>体验快捷动作触发</small></button><button data-export="双击长按">导出结果</button></section>
    <footer><p id="exportStatus">任一“导出结果”都会把当前全部试验汇总写入 docs/T1_触控校准记录.md。</p></footer>
  </main>`;
  bindTapTarget(); bindReticle(); bindConfirm(); bindShortcut(); bindExports(); renderTapStats();
}
