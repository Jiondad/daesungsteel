import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Chart.js는 canvas가 필요하므로 테스트에서는 빈 구현으로 대체
// 생성된 차트 설정을 globalThis.__chartConfigs 에 기록해 테스트에서 검사할 수 있게 한다
vi.mock('chart.js/auto', () => ({
  default: class {
    constructor(ctx, config) {
      (globalThis.__chartConfigs = globalThis.__chartConfigs || []).push(config);
    }
    destroy() {}
    update() {}
  },
}));

const ctxProxy = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : ctxProxy()),
  apply: () => ctxProxy(),
  set: () => true,
});
HTMLCanvasElement.prototype.getContext = () => ctxProxy();

afterEach(() => cleanup());
