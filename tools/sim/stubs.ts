export const noop: any = new Proxy(function () {}, { get: (_t, k) => (k === 'canvas' ? {} : noop), apply: () => noop, set: () => true });
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
(globalThis as any).window = {};
(globalThis as any).performance = { now: () => Date.now() };
