import { defineConfig } from 'vitest/config';

// core/ 系统为纯逻辑，测试无需浏览器环境，使用 node 环境即可。
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
