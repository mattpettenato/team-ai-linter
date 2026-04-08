// Fixture: three test() calls. Should fire checksum/one-test-per-file
// with count=3.

declare function test(name: string, fn: () => Promise<void> | void): void;

test('one', () => {});
test('two', () => {});
test('three', () => {});
