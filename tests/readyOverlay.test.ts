import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('restored ready layout', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  it('keeps the pre-rework message and start layers separate', () => {
    expect(html).not.toContain('class="ready-overlay"');
    expect(html.match(/class="start-overlay"/g)).toHaveLength(1);
    expect(html.match(/class="center-msg"/g)).toHaveLength(1);
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

  it('keeps global content overlays outside the game shell', () => {
    const shellEnd = html.indexOf('</main>');
    const globalRoot = html.indexOf('id="globalOverlayRoot"');
    const result = html.indexOf('id="resultModal"');
    expect(globalRoot).toBeGreaterThan(shellEnd);
    expect(result).toBeGreaterThan(globalRoot);
  });
});
