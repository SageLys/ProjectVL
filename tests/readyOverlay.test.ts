import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ReadyOverlay architecture', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  it('owns one complete central ready layout', () => {
    expect(html.match(/class="ready-overlay"/g)).toHaveLength(1);
    expect(html).not.toContain('class="start-overlay"');
    expect(html).not.toContain('class="center-msg"');
    expect(html).toContain('id="readyTitle"');
    expect(html).toContain('id="readyDescription"');
    expect(html).toContain('id="startBtn"');
  });

  it('uses a button radiogroup instead of hidden native inputs', () => {
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(4);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(4);
    expect(html).not.toContain('type="radio"');
  });

  it('keeps global content overlays outside the transformed stage', () => {
    const stageEnd = html.indexOf('</main>');
    const globalRoot = html.indexOf('id="globalOverlayRoot"');
    const result = html.indexOf('id="resultModal"');
    expect(globalRoot).toBeGreaterThan(stageEnd);
    expect(result).toBeGreaterThan(globalRoot);
  });
});
