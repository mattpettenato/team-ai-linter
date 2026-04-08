// Fixture: two test() calls. Should fire `checksum/one-test-per-file` (multipleTests).

declare function test(name: string, fn: () => Promise<void> | void): void;

test('first test', async () => {
  // intentionally empty
});

test('second test', async () => {
  // intentionally empty
});
