/** 画布点击拾取：把点击坐标换算到画布坐标系后交给回调（由控制器调用 collectNearest）。 */
export function createDropClick(canvas: HTMLCanvasElement, onPoint: (x: number, y: number) => void): void {
  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * canvas.width;
    const y = ((e.clientY - r.top) / r.height) * canvas.height;
    onPoint(x, y);
  });
}
