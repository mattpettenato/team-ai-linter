// Fixture: unawaited promise. Should fire `@typescript-eslint/no-floating-promises`.
// Also has exactly one test() call inside tests/, so the other rules stay quiet.

declare function test(name: string, fn: () => Promise<void> | void): void;

async function doWork(): Promise<string> {
  return 'done';
}

test('floating promise fixture', async () => {
  doWork(); // <-- intentionally unawaited
});
