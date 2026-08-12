import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview as createPreview } from 'vite';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const output = new URL('../artifacts/portfolio/', import.meta.url);
const screenshotPath = filename => fileURLToPath(new URL(filename, output));
const baseUrl = 'http://127.0.0.1:4173/';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : command;
    const executableArgs = process.platform === 'win32' ? ['/d', '/s', '/c', command, ...args] : args;
    const child = spawn(executable, executableArgs, { cwd: rootPath, stdio: 'inherit', shell: false, ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
  });
}

async function waitForPreview() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(baseUrl + 'hub.html');
      if (response.ok) return;
    } catch { /* preview is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('vite preview did not become ready');
}

const shots = [
  ['01-selection-drops.png', 'index.html?evidence=selection'],
  ['02-build-pressure.png', 'index.html?evidence=build'],
  ['03-bounty-offer.png', 'index.html?evidence=bounty'],
  ['04-bounty-active.png', 'index.html?evidence=bountyActive'],
  ['05-validation.png', 'index.html?evidence=validation'],
  ['06-hand-full.png', 'index.html?evidence=handFull'],
  ['07-card-detail.png', 'index.html?evidence=cardDetail'],
  ['08-evolution-fork.png', 'index.html?evidence=evolution'],
  ['09-fusion-equipped.png', 'index.html?evidence=fusion'],
  ['10-tuner-panel-full.png', 'index.html?evidence=tuner'],
  ['12-telemetry-hud.png', 'index.html?evidence=telemetryHud'],
  ['13-editor-overview.png', 'editor.html'],
  ['15-design-workbench.png', 'design.html'],
  ['17-mobile-portrait.png', 'index.html?evidence=mobileLayout', { width: 390, height: 844 }],
];

async function stable(page, url) {
  const failures = [];
  page.on('console', message => { if (message.type() === 'error') failures.push(`console: ${message.text()}`); });
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failures.push(`request: ${request.url()} (${request.failure()?.errorText})`));
  await page.goto(baseUrl + url, { waitUntil: 'networkidle' });
  if (url.startsWith('index.html')) {
    await page.waitForSelector('canvas#game');
    if (!url.includes('mobileLayout')) await page.waitForFunction(() => Boolean(window.__game));
  } else if (url === 'editor.html') {
    await page.waitForSelector('.editor-shell');
    await page.waitForSelector('.validation-ok');
  } else if (url === 'design.html') {
    await page.waitForSelector('.workbench-layout');
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const fatal = failures.filter(item => !item.includes('favicon.ico'));
  if (fatal.length) throw new Error(`${url}\n${fatal.join('\n')}`);
}

await mkdir(output, { recursive: true });
await run(npm, ['run', 'build']);
const preview = await createPreview({ root: rootPath, preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
try {
  await waitForPreview();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [filename, url, viewport = { width: 1440, height: 900 }] of shots) {
      const page = await browser.newPage({ viewportSize: viewport, deviceScaleFactor: 1 });
      await stable(page, url);
      await page.screenshot({ path: screenshotPath(filename), animations: 'disabled' });
      await page.close();
    }

    const tuner = await browser.newPage({ viewportSize: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await stable(tuner, 'index.html?evidence=tuner');
    const groups = tuner.locator('.tuner-group');
    const crops = await Promise.all([
      groups.nth(0).screenshot({ animations: 'disabled' }),
      groups.nth(3).screenshot({ animations: 'disabled' }),
      tuner.locator('.derived').screenshot({ animations: 'disabled' }),
    ]);
    const detail = await browser.newPage({ viewportSize: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await detail.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#07111e;color:#d8e6f5;font-family:Inter,"Microsoft YaHei",sans-serif}h1{margin:18px 24px 8px;font-size:22px;color:#67e8f9}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:0 18px 18px;align-items:start}.crop{min-width:0;max-height:820px;overflow:hidden;border:1px solid #2d5872;border-radius:10px;background:#081523}.crop img{display:block;width:100%;height:auto}</style><h1>关键参数特写 · 出怪 / 掉落 / TTK 派生读数</h1><div class="grid">${crops.map(buffer => `<div class="crop"><img src="data:image/png;base64,${buffer.toString('base64')}"></div>`).join('')}</div>`);
    await detail.screenshot({ path: screenshotPath('11-tuner-key-params.png'), animations: 'disabled' });
    await detail.close();
    await tuner.close();

    const editor = await browser.newPage({ viewportSize: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await stable(editor, 'editor.html');
    await editor.locator('.validation-panel').screenshot({ path: screenshotPath('14-editor-validation.png'), animations: 'disabled' });
    await editor.close();

    const design = await browser.newPage({ viewportSize: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await stable(design, 'design.html');
    const recipeButton = design.locator('.design-nav__tree .nav-group').last().locator('.design-nav__item').first();
    await recipeButton.click();
    await design.waitForTimeout(300);
    await design.screenshot({ path: screenshotPath('16-design-cards.png'), animations: 'disabled' });
    await design.close();

    const first = await browser.newPage({ viewportSize: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const second = await browser.newPage({ viewportSize: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await stable(first, 'index.html?evidence=selection');
    await stable(second, 'index.html?evidence=selection');
    const a = await first.locator('canvas#game').screenshot({ animations: 'disabled' });
    const b = await second.locator('canvas#game').screenshot({ animations: 'disabled' });
    const digest = buffer => createHash('sha256').update(buffer).digest('hex');
    if (digest(a) !== digest(b)) throw new Error('evidence=selection canvas is not reproducible');
    await first.close(); await second.close();
  } finally {
    await browser.close();
  }
  await mkdir(new URL('../public/portfolio/', import.meta.url), { recursive: true });
  await copyFile(new URL('10-tuner-panel-full.png', output), new URL('../public/portfolio/10-tuner-panel-full.png', import.meta.url));
  const files = await Promise.all(shots.map(async ([filename]) => [filename, (await readFile(new URL(filename, output))).byteLength]));
  console.log(`Captured ${files.length + 3} screenshots.`, files);
} finally {
  await new Promise(resolve => preview.httpServer.close(resolve));
}
