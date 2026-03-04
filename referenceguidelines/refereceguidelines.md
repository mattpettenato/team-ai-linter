## Collect Fanatics Guidelines:

## Best Practices

### Test ID Locators

1. **Definition Rules**

   - Always define locators in dedicated files
   - Use barrel files for clean imports
   - Keep related locators grouped together
   - Export constants with `as const`

2. **Usage Guidelines**

   - Never hardcode locator strings in test files
   - Update locators in one place when component IDs change
   - Use dynamic locator generators for repeated patterns
   - Composing locators should be done in the locators files, not in test suites

3. **Maintenance**
   - Document significant changes to locator patterns
   - Remove unused locators promptly
   - Keep locator names consistent with component hierarchy

### Test Writing

1. **Test Structure**

   - Organize tests by feature
   - Use descriptive test names
   - Follow the Arrange-Act-Assert pattern
   - Keep tests independent and isolated

2. **Selectors**

   - Prefer test IDs over other selectors
   - Use dynamic locators for repeated patterns
   - Avoid overly generic selectors
   - Consider caching frequently accessed elements

3. **Data Management**
   - Use test data utilities for setup/teardown
   - Clean up test data after tests
   - Use unique identifiers for test data

## Troubleshooting

1. **Common Issues**

   - Duplicate identifiers: Verify module prefix and casing
   - Missing locators: Check barrel file exports
   - Type errors: Ensure `as const` is applied correctly
   - Dynamic locator issues: Check parameter types and values

2. **Performance Tips**
   - Use specific selectors when possible
   - Avoid overly generic locators
   - Consider caching frequently accessed elements
   - Use parallel test execution when possible





   