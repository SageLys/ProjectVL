// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { modalShell } from '../src/ui/modalShell';

afterEach(() => document.body.replaceChildren());

describe('modal shell', () => {
  it('labels the dialog, traps Tab, and restores focus', () => {
    const source = document.createElement('button');
    const first = document.createElement('button');
    const last = document.createElement('button');
    document.body.append(source);
    source.focus();
    const shell = modalShell({ mode: 'centered', dismissible: true, labelledBy: 'title' });
    const title = document.createElement('h2');
    title.id = 'title';
    shell.header.append(title);
    shell.body.append(first, last);
    shell.open(source);

    expect(shell.dialog.getAttribute('role')).toBe('dialog');
    expect(shell.dialog.getAttribute('aria-modal')).toBe('true');
    expect(shell.dialog.getAttribute('aria-labelledby')).toBe('title');
    expect(document.activeElement).toBe(first);
    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);
    shell.close();
    expect(document.activeElement).toBe(source);
  });

  it('ignores Escape and backdrop clicks when dismissal is disabled', () => {
    const shell = modalShell({ mode: 'centered', dismissible: false });
    shell.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    shell.overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shell.isOpen()).toBe(true);
    shell.destroy();
  });
});
