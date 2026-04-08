// Fixture: single test() with a purely synchronous body. Zero rules fire.

declare function test(name: string, fn: () => Promise<void> | void): void;

test('sync test', () => {
  const x = 1 + 1;
  void x;
});
