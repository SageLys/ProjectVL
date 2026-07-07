import type { DomRefs } from './domRefs';

/** 建立 toast 通道：显示 1.5s 后淡出（每次调用重置计时）。 */
export function createToast(refs: DomRefs) {
  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  return function toast(text: string): void {
    refs.toast.textContent = text;
    refs.toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => refs.toast.classList.remove('show'), 1500);
  };
}
