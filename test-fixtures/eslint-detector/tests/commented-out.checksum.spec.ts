// Fixture: one real test() call plus a commented-out test() call.
// Comments should not be counted. Should NOT fire one-test-per-file.

declare function test(name: string, fn: () => Promise<void> | void): void;

// test('fake', () => {})
/* test('also fake', () => {}) */
test('real', () => {});
