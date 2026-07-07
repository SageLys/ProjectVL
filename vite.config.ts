import { defineConfig } from 'vite';

// 原型工程：根目录即项目根，index.html 为入口，dist/ 为构建产物。
export default defineConfig({
  root: '.',
  // 相对基路径：便于直接以 file:// 打开 dist/index.html 做离线验收。
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
