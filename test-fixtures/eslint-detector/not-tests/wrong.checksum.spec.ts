// Fixture: directory "not-tests" contains the substring "tests" but NOT as
// a /tests/ path segment. correct-test-directory should fire.

declare function test(name: string, fn: () => Promise<void> | void): void;

test('wrong dir', () => {});
