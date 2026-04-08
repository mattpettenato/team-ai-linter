// Fixture: single test() with multiple unawaited promises. Should fire
// @typescript-eslint/no-floating-promises multiple times.

declare function test(name: string, fn: () => Promise<void> | void): void;

async function doWork(): Promise<string> {
  return 'done';
}

test('multiple floating', async () => {
  doWork();
  doWork();
  doWork();
});
