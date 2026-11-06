import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Chart.js는 canvas가 필요하므로 테스트에서는 빈 구현으로 대체
vi.mock('chart.js/auto', () => ({
  default: class {
    constructor() {}
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
