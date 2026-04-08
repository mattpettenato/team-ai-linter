// Fixture: file inside tests/deep/nested/. The /tests/ segment is present,
// so correct-test-directory should NOT fire.

declare function test(name: string, fn: () => Promise<void> | void): void;

test('deeply nested', () => {});
