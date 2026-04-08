// Fixture: empty filename prefix — literally ".checksum.spec.ts". Edge
// case for filename matchers. Contains exactly one test() so
// one-test-per-file should not fire.

declare function test(name: string, fn: () => Promise<void> | void): void;

test('dotfile spec', () => {});
