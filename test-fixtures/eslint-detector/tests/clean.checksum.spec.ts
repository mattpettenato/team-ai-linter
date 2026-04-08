// Fixture: clean file. Should produce ZERO ESLint issues.
// - Exactly one test() call
// - Inside tests/ directory
// - All async work is awaited

declare function test(name: string, fn: () => Promise<void> | void): void;

async function doWork(): Promise<void> {
  return Promise.resolve();
}

test('clean fixture', async () => {
  await doWork();
});
