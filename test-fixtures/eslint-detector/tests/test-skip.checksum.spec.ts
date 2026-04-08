// Fixture: single test.skip() call. Counts as one test — should NOT fire
// checksum/one-test-per-file.

declare const test: {
  (name: string, fn: () => Promise<void> | void): void;
  only: (name: string, fn: () => Promise<void> | void) => void;
  skip: (name: string, fn: () => Promise<void> | void) => void;
};

test.skip('foo', () => {});
