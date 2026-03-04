# Checksum Test Guidelines

Quick reference for writing robust, maintainable Playwright tests with Checksum AI.

---

## Quick Rules (TL;DR)

- Wrap **actions** in `checksumAI()` - clicks, fills, navigation
- **Never** wrap assertions or element selection in `checksumAI()`
- Use web-first assertions (`expect(locator).toBeVisible()`) instead of `waitForTimeout()`
- Avoid using `networkidle` - use `domcontentloaded`
- Use test IDs or stable attributes - never dynamic CSS classes
- Store variables in `variableStore` (vs) - randomize with `Date.now()`
- One test per file with `defineChecksumTest()`
- Under 30 steps = don't split, 30-40 = consider, 40+ = likely split
- **Never assume data exists** - Create what you need before interacting with it
- **Prefer API setup** - Use APIs to create test data when not testing the creation flow

---

## checksumAI Wrapper Rules

**Wrap these in checksumAI:**
- `click()`, `fill()`, `type()`, `clear()`, `hover()`
- `page.goto()`, `page.reload()`
- `page.waitForSelector()`, `page.waitForLoadState()`

**Never wrap in checksumAI:**
- Element selection: `getByTestId()`, `getByRole()`, `locator()`
- Assertions: `expect()`, `await expect()`
- Data retrieval for variables: `.textContent()`, `.getAttribute()`, `.count()`
- Test framework functions: `test()`, `test.describe()`, `defineChecksumTest()`

**Write descriptive thoughts** - Makes Playwright traces readable:
- Format: "Click X to accomplish Y" or "Fill X field with Y"
- Bad: `"Click button"` | Good: `"Click Submit button to save the new task"`
- Bad: `"Navigate"` | Good: `"Navigate to Settings page to configure notifications"`

---

## Locator Best Practices

- Prefer `data-testid`, role, placeholder, or label attributes
- Use regex when text might vary slightly
- Never use build-time generated selectors (e.g., `ac-4r32`)
- Never use `nth()` unless deliberately choosing from a list
- Create state-independent locators that work across users/environments
- Define locators in dedicated files, not inline in tests
- Use Page Object Model for collection-level abstractions

---

## Assertions & Waiting

- Use web-first assertions that auto-wait: `await expect(locator).toBeVisible()`
- Adjust timeout parameter when needed: `{ timeout: 60_000 }`
- Never use `waitForTimeout()` unless animation/debounce requires it
- Avoid using `{ waitUntil: 'networkidle' }` - use `'domcontentloaded'`
- Use `expect.poll()` for custom JavaScript validations

**Write descriptive assertion messages** - Makes traces and failures clear:
- Describe the expected state, not implementation details
- Bad: `"Element visible"` | Good: `"Task should appear in the list after saving"`
- Bad: `"Check text"` | Good: `"Success toast should confirm the user was created"`

---

## Test Structure & Annotations

- Use `defineChecksumTest("description", "uniqueID")` for each test
- Group tests with `test.describe()` blocks
- Use `test.step()` to group large flows for readability
- Tag tests appropriately:
  - `@smoke` - Critical functionality (discuss with team first)
  - `@regression` - Full regression suite (discuss with team first)
  - `@checksum` - Tests created by Checksum AI
  - `@bug` - Tracking known issues

**Tagging example:**
```javascript
test.describe('Feature tests', { tag: '@checksum' }, () => {
  test('test case', async ({ page }) => { ... });
});
```

---

## Test Splitting Guidelines

**Step Count Thresholds:**
- Under 30 steps = **DO NOT SPLIT**
- 30-40 steps = Consider splitting only if truly independent flows
- Over 40 steps = Likely needs splitting

**When NOT to Split:**
- Single user journey (create > configure > verify > save)
- Part 2 would recreate Part 1's state
- Test verifies multiple aspects of ONE created item

**When to Split:**
- Test does genuinely separate, unrelated tasks
- Clear independence points exist
- Each split can run fresh without the other

**Split Requirements:**
- Each split must be independently executable
- Include complete setup: login + app selection + navigation
- No shared variables between splits

---

## Variables & Test Data

- Use `variableStore` (vs) for shared test values
- **Always use `cktest` prefix** for identifiable test data: `vs.taskName = \`cktest-\${Date.now()}\``
- The `cktest` prefix makes test-generated data easy to identify and clean up
- Store test files in `checksum/test-data/bin`
- Resolve with `page.resolveAssetsFolder()`

---

## Environment Configuration

**Correct usage:**
```javascript
test.describe(() => {
  const { environment, login } = getEnvironment({ name: "qa-main" });
  test.use({ baseURL: environment.baseURL });

  test(defineChecksumTest("Test", "ID"), async ({ page }) => {
    await page.goto(environment.baseURL + "/path");
  });
});
```

- Never hardcode URLs like `"https://..."`
- Use `process.env.SOME_URL` or `getEnvironment()` config
- Define environments in `checksum.config.ts`

---

## Common Anti-Patterns

| Don't | Do |
|-------|-----|
| `await page.waitForTimeout(1000)` | `await expect(element).toBeVisible()` |
| `{ waitUntil: 'networkidle' }` | `{ waitUntil: 'domcontentloaded' }` |
| `await checksumAI("Get element", () => page.locator(...))` | `const el = page.locator(...)` |
| `page.locator('.dynamic-class-a4x2')` | `page.getByTestId('stable-id')` |
| Hardcoded `"https://example.com"` | `environment.baseURL + "/path"` |
| `await checksumAI(() => expect(...))` | `await expect(...)` directly |
| Click existing `"John Smith"` to edit | Create user via API first, then edit |
| Assume data exists in the system | Create what you need before interacting |

---

## Data Setup & State Management

**Golden Rule: Never assume data exists. Create what you need.**

- If testing **edit** functionality → Create the item first (via API or UI)
- If testing **delete** functionality → Create the item first
- If testing **viewing details** → Create the item first
- If testing **search/filter** → Create items that match your criteria first

**Prefer API Setup Over UI Setup:**
- Use APIs to create test data when you're not testing the creation flow itself
- API setup is faster, more reliable, and keeps tests focused
- Only use UI creation when you're specifically testing the create flow

**When to Use UI vs API:**
| Testing This | Setup With |
|--------------|------------|
| Edit user profile | API: create user |
| Create new product | UI: test the creation flow |
| Delete a task | API: create task first |
| View order details | API: create order first |
| Full CRUD flow | UI for create, then edit/delete |

**DRY Principle:**
- Create reusable API helper functions for common setup
- Share setup utilities across tests in the same collection
- Use `test.beforeEach` for common setup patterns

---

## State & Race Conditions

- Design tests for different environments/users
- Don't rely on existing app state - create what you need
- Handle pagination when searching for items
- Use `try/catch` with short timeout for optional elements
- Consider using `addLocatorHandler` for sporadic dialogs
