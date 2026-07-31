export type ModalShellMode = 'centered' | 'fullscreen';

export interface ModalShellOptions {
  mode: ModalShellMode;
  /** false = 强制选择，不可点遮罩/Esc 关闭 */
  dismissible: boolean;
  className?: string;
  labelledBy?: string;
}

export interface ModalShell {
  overlay: HTMLElement;
  dialog: HTMLElement;
  header: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  open(returnFocus?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function modalShell(options: ModalShellOptions): ModalShell {
  const overlay = document.createElement('div');
  const dialog = document.createElement('section');
  const header = document.createElement('header');
  const body = document.createElement('div');
  const footer = document.createElement('footer');
  let open = false;
  let returnFocus: HTMLElement | null = null;
  let previousBodyOverflow = '';

  overlay.className = [
    'modal-shell',
    `modal-shell-${options.mode}`,
    options.className ?? '',
  ].filter(Boolean).join(' ');
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  dialog.className = 'modal-shell-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;
  if (options.labelledBy) dialog.setAttribute('aria-labelledby', options.labelledBy);
  header.className = 'modal-shell-header';
  body.className = 'modal-shell-body';
  footer.className = 'modal-shell-footer';
  footer.hidden = true;
  dialog.append(header, body, footer);
  overlay.append(dialog);
  (document.querySelector('#globalOverlayRoot') ?? document.body).append(overlay);

  const close = (): void => {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = previousBodyOverflow;
    overlay.dispatchEvent(new CustomEvent('modal-shell-close'));
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!open) return;
    if (event.key === 'Escape') {
      if (options.dismissible) {
        event.preventDefault();
        close();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  overlay.addEventListener('click', event => {
    if (options.dismissible && event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeyDown);

  return {
    overlay,
    dialog,
    header,
    body,
    footer,
    open(focusTarget = document.activeElement as HTMLElement | null): void {
      let newlyOpened = false;
      if (!open) {
        newlyOpened = true;
        open = true;
        returnFocus = focusTarget;
        previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        overlay.hidden = false;
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
      }
      if (newlyOpened) {
        const first = dialog.querySelector<HTMLElement>(focusableSelector);
        (first ?? dialog).focus();
      }
    },
    close,
    isOpen: () => open,
    destroy(): void {
      close();
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    },
  };
}
