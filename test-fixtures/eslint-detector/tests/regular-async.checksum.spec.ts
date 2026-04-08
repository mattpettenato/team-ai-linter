// Fixture: properly awaited async work, single test(). Zero rules fire.

declare function test(name: string, fn: () => Promise<void> | void): void;

async function doWork(): Promise<string> {
  return 'done';
}

test('regular async', async () => {
  const result = await doWork();
  void result;
});
