// Fixture: single test() that chains Promise.resolve().then(...) without
// awaiting. Should fire @typescript-eslint/no-floating-promises.

declare function test(name: string, fn: () => Promise<void> | void): void;

test('promise in callback', () => {
  Promise.resolve().then(() => {
    const x = 1;
    void x;
  });
});
