// Fixture: file outside any tests/ directory.
// Should fire `checksum/correct-test-directory`.
// Has one test() call so the count rule stays quiet.

declare function test(name: string, fn: () => Promise<void> | void): void;

test('wrong place fixture', async () => {
  // intentionally empty
});
