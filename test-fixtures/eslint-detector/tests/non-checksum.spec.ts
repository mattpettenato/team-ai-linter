// Fixture: regular .spec.ts (NOT .checksum.spec.ts). The checksum/* rules
// should be gated off. no-floating-promises may still fire because this is
// a .ts file, but we don't assert on it here.

declare function test(name: string, fn: () => Promise<void> | void): void;

test('one', () => {});
test('two', () => {});
