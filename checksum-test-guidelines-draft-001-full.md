# Checksum Test Guidelines (Full Reference)

Comprehensive guidelines for writing robust, maintainable Playwright tests with Checksum AI. This document is intended for AI-powered test review and detailed reference.

---

## 1. checksumAI Wrapper Rules

### What to Wrap in checksumAI

Playwright **actions** that interact with the page must be wrapped:

- `click()`, `fill()`, `type()`, `clear()`, `hover()`
- `page.goto()`, `page.reload()`
- `page.waitForSelector()`, `page.waitForLoadState()`

```javascript
// CORRECT - Action wrapped in checksumAI
await checksumAI("Click submit button to save changes", async () => {
  await page.getByRole("button", { name: "Submit" }).click();
});

await checksumAI("Fill in the task name field", async () => {
  await page.getByPlaceholder("Task Name").fill(vs.taskName);
});

await checksumAI("Navigate to settings page", async () => {
  await page.goto(environment.baseURL + "/settings", { waitUntil: "domcontentloaded" });
});
```

### What NOT to Wrap in checksumAI

#### Element Selection - Never Wrap

```javascript
// WRONG - Element selection wrapped
const element = await checksumAI("Get element", async () => {
  return page.getByTestId("test");
});

// CORRECT - Direct element selection
const element = page.getByTestId("test");
```

```javascript
// WRONG - Locator chain wrapped
const logoContainer = await checksumAI("Get logo container", async () => {
  return firstCard.getByTestId("CompanyLogo");
});
const logoImage = await checksumAI("Get logo image", async () => {
  return logoContainer.locator("img");
});

// CORRECT - Direct locator chains
const logoContainer = firstCard.getByTestId("CompanyLogo");
const logoImage = logoContainer.locator("img");
```

#### Assertions - Never Wrap

```javascript
// WRONG - Assertion inside checksumAI
await checksumAI("Verify element", async () => {
  await expect(element).toBeVisible();
});

// WRONG - checksumAI nested inside expect
await expect(
  await checksumAI("Get element", async () => {
    return page.getByTestId("test");
  }),
  "Verify element is visible"
).toBeVisible();

// CORRECT - Direct assertion with message
await expect(
  page.getByTestId("test"),
  "Submit button should be visible after form loads"
).toBeVisible();
```

#### Data Retrieval for Variables - Never Wrap

```javascript
// WRONG - Data retrieval wrapped
const imageSrc = await checksumAI("Get logo image src", async () => {
  return await logoImage.getAttribute("src");
});
const companyName = await checksumAI("Get company name", async () => {
  return await nameElement.textContent();
});

// CORRECT - Direct data retrieval
const imageSrc = await logoImage.getAttribute("src");
const companyName = await nameElement.textContent();
const cardCount = await cards.count();

// Use variables in assertions outside checksumAI
expect(imageSrc).toContain("/assets/logo");
expect(companyName).toBeTruthy();
```

#### Never Wrap

- `page.getByTestId()`, `page.getByRole()`, `page.getByText()` (element selection)
- `.locator()`, `.first()`, `.nth()`, `.last()` (locator refinement)
- Variable assignments for locators
- `await expect()` or `expect()` (any assertion)
- Logic operations, loops, conditionals
- Console.log statements
- Test framework functions: `test()`, `test.describe()`, `test.beforeEach()`, `defineChecksumTest()`
- `getEnvironment()`, environment/login assignments

### checksumAI Description Guidelines

**Why descriptions matter:** They appear in Playwright traces, making debugging much easier. Anyone reviewing a trace should understand what each step is trying to accomplish without reading the code.

**Format: "Action X to accomplish Y"**

Descriptions should explain **both the action and intent**:

```javascript
// BAD - Too vague, trace will be unhelpful
await checksumAI("Click", async () => { ... });
await checksumAI("Click button", async () => { ... });
await checksumAI("Navigate", async () => { ... });

// BAD - Only describes what, not why
await checksumAI("Click on the dropdown", async () => {
  await page.getByRole("button", { name: "Country" }).click();
});

// GOOD - Action and intent clear (Click X to accomplish Y)
await checksumAI("Click 'Country of Residence' dropdown to select user's country", async () => {
  await page.getByRole("button", { name: "Country of Residence" }).click();
});

// GOOD - Clear what and why
await checksumAI("Click Submit button to save the new task", async () => {
  await page.getByRole("button", { name: "Submit" }).click();
});

// GOOD - Navigation with purpose
await checksumAI("Navigate to Settings page to configure notification preferences", async () => {
  await page.goto(environment.baseURL + "/settings");
});

// GOOD - Fill with context
await checksumAI("Fill task name field with unique test identifier", async () => {
  await page.getByPlaceholder("Task Name").fill(vs.taskName);
});
```

**More examples of good descriptions:**
- `"Click 'Add to Cart' button to add the selected product"`
- `"Fill email field with test user credentials"`
- `"Click 'Delete' to remove the created test item"`
- `"Hover over user avatar to reveal dropdown menu"`
- `"Click 'Export' button to download the report as CSV"`

### Assertion Message Guidelines

**Why assertion messages matter:** Like checksumAI descriptions, these appear in Playwright traces and in failure reports. Clear messages make it obvious what went wrong without diving into code.

Messages should explain **expected page state**, not implementation details:

```javascript
// BAD - Too vague, unhelpful in trace/failure
await expect(element).toBeVisible();  // No message at all!
await expect(element, "Check visibility").toBeVisible();
await expect(element, "Element visible").toBeVisible();

// BAD - Implementation detail instead of state
await expect(
  page.getByRole("button", { name: "Country" }),
  "Dropdown should have aria-expanded attribute"
).toHaveAttribute("aria-expanded", "true");

// GOOD - Describes expected state clearly
await expect(
  page.getByRole("button", { name: "Country" }),
  "Country dropdown should be expanded after clicking"
).toHaveAttribute("aria-expanded", "true");

// GOOD - Explains what should happen
await expect(
  page.getByText(vs.taskName),
  "Newly created task should appear in the task list"
).toBeVisible();

await expect(
  page.getByRole("alert"),
  "Success toast should confirm the user was saved"
).toBeVisible();

await expect(
  page.locator(".cart-count"),
  "Cart badge should show 1 item after adding product"
).toHaveText("1");
```

```javascript
// BAD - Raw data in message (not meaningful)
"The date 13/02/2024 should appear";
"'showing 20 out of 157' text appear";

// GOOD - Functional description (explains the why)
"The current date should appear in the header";
"The pagination should show the count of products matching the filter";
```

---

## 2. Locator Best Practices

### Preferred Locator Strategies

1. **Test IDs** - Most reliable
   ```javascript
   page.getByTestId("submit-button")
   page.locator('[data-testid="user-row"]')
   ```

2. **Roles with accessible names**
   ```javascript
   page.getByRole("button", { name: "Submit" })
   page.getByRole("heading", { name: /Welcome/i })
   ```

3. **Placeholders and labels**
   ```javascript
   page.getByPlaceholder("Enter your email")
   page.getByLabel("Username")
   ```

4. **Static text with regex**
   ```javascript
   page.getByText(/Submit Order/i)
   page.locator('button:has-text("Save")')
   ```

### Never Use

```javascript
// WRONG - Dynamic/build-time classes
page.locator('.ac-4r32')
page.locator('[class*="Button_primary__"]')

// WRONG - nth() just to select among duplicates
page.locator('button').nth(2)  // Unless deliberately choosing from a list

// WRONG - State-dependent selectors
page.locator('[class="selected"]')  // Unless setting state is part of test
```

### State-Independent Locators

```javascript
// WRONG - Depends on specific item content
await page.getByText("John's Task #42").click();

// CORRECT - Works for any item in list
await page.getByTestId("task-row").first().click();

// CORRECT - Uses stable identifier
await page.locator('[data-testid="task-row"]').filter({ hasText: vs.taskName }).click();
```

### Locator Definition Files

Define locators in dedicated files, not inline:

```javascript
// locators/settings-page.ts
export const SETTINGS_LOCATORS = {
  saveButton: '[data-testid="settings-save"]',
  cancelButton: '[data-testid="settings-cancel"]',
  nameInput: '[data-testid="settings-name-input"]',
} as const;

// In test file
import { SETTINGS_LOCATORS } from '@checksum/locators/settings-page';
await page.locator(SETTINGS_LOCATORS.saveButton).click();
```

### Page Object Model Pattern

```javascript
// page-objects/settings.page.ts
export class SettingsPage {
  constructor(private page: Page, private checksumAI: ChecksumAI) {}

  async fillName(name: string) {
    await this.checksumAI("Fill settings name field", async () => {
      await this.page.getByTestId("settings-name-input").fill(name);
    });
  }

  async save() {
    await this.checksumAI("Click save to apply settings", async () => {
      await this.page.getByRole("button", { name: "Save" }).click();
    });
  }
}
```

---

## 3. Assertions & Waiting

### Web-First Assertions (Preferred)

```javascript
// CORRECT - Web-first assertions auto-wait
await expect(page.getByTestId("submit-button")).toBeVisible();
await expect(page.getByRole("heading")).toHaveText(/Welcome/);
await expect(page.locator(".item-list")).toHaveCount(5);

// With extended timeout when needed
await expect(page.getByTestId("slow-loading-element")).toBeVisible({
  timeout: 60_000,
});
```

### Never Use waitForTimeout

```javascript
// WRONG - Brittle fixed sleep
await page.waitForTimeout(1000);
await page.locator('button').click();

// CORRECT - Wait for specific state
await expect(page.getByRole("dialog", { name: "Add field" })).toBeVisible({
  timeout: 10_000,
});
await page.getByRole("button", { name: "Add" }).click();
```

### Never Use networkidle

```javascript
// WRONG - May hang indefinitely
await page.goto("/dashboard", { waitUntil: "networkidle" });

// CORRECT - Faster, more reliable
await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

// After indirect navigation (clicking a link)
await page.getByRole("link", { name: "Settings" }).click();
await page.waitForLoadState("domcontentloaded");
```

### Custom Validations with expect.poll

```javascript
// When web-first assertion isn't possible (e.g., validating sort order)
await expect.poll(async () => {
  const items = await page.locator(".item").allTextContents();
  return items;
}).toEqual(["Apple", "Banana", "Cherry"]);
```

### Race Condition Handling

```javascript
// If button exists on both current and target page, assert different element first
await page.getByRole("link", { name: "Settings" }).click();
await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
await page.getByRole("button", { name: "Save" }).click();

// For text that loads async
await expect(page.locator(".price")).toHaveText(/\$\d+\.\d{2}/);

// For optional/sporadic elements (like onboarding dialogs)
await page.addLocatorHandler(
  page.getByRole("dialog", { name: "What's New" }),
  async () => {
    await page.getByRole("button", { name: "Got it" }).click();
  }
);
```

---

## 4. Test Structure & Annotations

### Basic Test Structure

```javascript
import { init } from "@checksum-ai/runtime";
const { test, defineChecksumTest, expect, checksumAI, getEnvironment } = init();

test.describe(() => {
  const { environment, login } = getEnvironment({ name: "qa-main" });
  test.use({ baseURL: environment.baseURL });

  test(
    defineChecksumTest("Create new task with all fields", "U8hGX"),
    async ({ page, variableStore: vs }) => {
      // Setup
      vs.taskName = `cktest-${Date.now()}`;

      // Actions
      await checksumAI("Navigate to tasks page", async () => {
        await page.goto(environment.baseURL + "/tasks");
      });

      await checksumAI("Click create new task button", async () => {
        await page.getByRole("button", { name: "New Task" }).click();
      });

      await checksumAI("Fill task name", async () => {
        await page.getByPlaceholder("Task Name").fill(vs.taskName);
      });

      await checksumAI("Save the task", async () => {
        await page.getByRole("button", { name: "Save" }).click();
      });

      // Assertions
      await expect(
        page.getByRole("heading", { name: vs.taskName }),
        "New task should appear in the list"
      ).toBeVisible();
    }
  );
});
```

### Tagging Tests

```javascript
// Tag at describe level - applies to all tests in block
test.describe("Settings functionality", { tag: "@checksum" }, () => {
  test("test 1", async ({ page }) => { /* ... */ });
  test("test 2", async ({ page }) => { /* ... */ });
});

// Tag at test level
test("critical login flow", { tag: "@smoke" }, async ({ page }) => {
  // ...
});

// Multiple tags
test("feature test", { tag: ["@checksum", "@regression"] }, async ({ page }) => {
  // ...
});
```

**Tag meanings:**
- `@smoke` - Critical functionality (coordinate with team before using)
- `@regression` - Full regression suite (coordinate with team before using)
- `@checksum` - Tests created by Checksum AI
- `@bug` - Tests tracking known issues

### Using test.step for Flow Clarity

```javascript
test(defineChecksumTest("Complete checkout flow", "XyZ12"), async ({ page, vs }) => {
  await test.step("Add items to cart", async () => {
    await checksumAI("Navigate to products", async () => {
      await page.goto("/products");
    });
    await checksumAI("Add first product to cart", async () => {
      await page.getByTestId("add-to-cart").first().click();
    });
  });

  await test.step("Complete checkout", async () => {
    await checksumAI("Go to cart", async () => {
      await page.getByRole("link", { name: "Cart" }).click();
    });
    await checksumAI("Click checkout", async () => {
      await page.getByRole("button", { name: "Checkout" }).click();
    });
  });

  await test.step("Verify order confirmation", async () => {
    await expect(
      page.getByRole("heading", { name: "Order Confirmed" }),
      "Order confirmation should be displayed"
    ).toBeVisible();
  });
});
```

---

## 5. Test Splitting Guidelines

### Step Count Thresholds

| Step Count | Action |
|------------|--------|
| Under 30 | **DO NOT SPLIT** - This is a hard rule |
| 30-40 | Consider splitting ONLY if truly independent flows exist |
| Over 40 | Likely needs splitting, but verify flows are truly independent |

### Single User Journey = DO NOT SPLIT

If the test follows ONE logical user journey, keep it together:

```
Create task > Configure settings > Add attachments > Verify saved
```

This is ONE journey - don't split even if it has many steps.

### When NOT to Split

- **Part 2 recreates Part 1's work**: If Part 2 needs to redo the same actions as Part 1 just to reach a state for validation
- **Parts share data**: If Part 1 creates something that Part 2 validates
- **Verification of single action**: If test creates ONE thing and verifies multiple aspects (different tabs, fields)
- **"Smoke test" or "Comprehensive flow" in name**: These are meant to test end-to-end

### When Splitting IS Appropriate

- Test does genuinely SEPARATE tasks that don't share state
- Test has clearly independent sections with no connection
- Over 40 steps AND natural breakpoints between unrelated flows

### Split Requirements

Each split MUST be independently executable:

1. **Complete Setup**: Login + app/workspace selection + navigation
2. **No Missing Dependencies**: All variables defined within the split
3. **Valid Assertions**: All assertions make sense given starting state
4. **Reachable State**: Can reach starting point without running other splits

### Split Validation Checklist

For EACH proposed split:
- [ ] Can this run immediately after login + setup without ANY prior test parts?
- [ ] Are all assertions valid given the starting state?
- [ ] Are all variables this part uses either defined in this part or in setup?
- [ ] If this navigates to a URL directly, is that URL accessible without prior UI flow?

---

## 6. Variables & Test Data

### Using variableStore

**Always use the `cktest` prefix** for test-generated data. This makes it easy to:
- Identify test data in the UI and database
- Clean up test data after runs
- Distinguish test data from real user data

```javascript
test(defineChecksumTest("Create task", "abc123"), async ({ page, variableStore: vs }) => {
  // Set unique values - ALWAYS use cktest prefix
  vs.taskName = `cktest-${Date.now()}`;
  vs.userName = `cktest-user-${Date.now()}`;
  vs.productName = `cktest-product-${Date.now()}`;
  vs.description = `cktest - Test description created at ${new Date().toISOString()}`;

  // Use in actions
  await checksumAI("Fill task name", async () => {
    await page.getByPlaceholder("Task Name").fill(vs.taskName);
  });

  // Use in assertions
  await expect(
    page.getByRole("heading", { name: vs.taskName }),
    "Task with generated name should appear"
  ).toBeVisible();
});
```

### Test Data Files

```javascript
// Store files in checksum/test-data/bin
const testFilePath = page.resolveAssetsFolder(["uploads", "test-document.pdf"]);

await checksumAI("Upload test file", async () => {
  await page.getByTestId("file-input").setInputFiles(testFilePath);
});
```

### Data Independence

```javascript
// WRONG - Relies on existing state
await page.getByText("John's Existing Task").click();

// CORRECT - Creates own test data
vs.taskName = `cktest-${Date.now()}`;
await checksumAI("Create new task", async () => {
  await page.getByRole("button", { name: "New Task" }).click();
});
await checksumAI("Fill task name", async () => {
  await page.getByPlaceholder("Name").fill(vs.taskName);
});
```

---

## 7. Environment Configuration

### Correct getEnvironment Usage

```javascript
import { init } from "@checksum-ai/runtime";
const { test, defineChecksumTest, expect, checksumAI, getEnvironment } = init();

test.describe(() => {
  // CORRECT - Object parameter with name property
  const { environment, login } = getEnvironment({ name: "qa-main" });
  test.use({ baseURL: environment.baseURL });

  test(defineChecksumTest("Test name", "testId"), async ({ page }) => {
    await checksumAI("Navigate to start", async () => {
      await page.goto(environment.baseURL + "/path");
    });
  });
});
```

```javascript
// WRONG - String parameter
const environment = getEnvironment("qa-main");

// WRONG - Hardcoded URL
await page.goto("https://www.qa.example.com/path");
```

### Environment Variables (Acceptable)

```javascript
// OK - Using process.env for URLs
await page.goto(process.env.BASE_URL + "/path");
```

### Available Environments

Check `checksum.config.ts` for available environments. Common patterns:
- `"qa-main"` - Main QA environment
- `"qa-employer"` - Employer portal QA
- `"staging"` - Staging environment

---

## 8. Data Setup & State Management

### Golden Rule: Never Assume Data Exists

**Create what you need before interacting with it.** This applies to:
- Edit tests → Create the item first
- Delete tests → Create the item first
- View/detail tests → Create the item first
- Search/filter tests → Create items matching your criteria first
- Any test that clicks on or interacts with existing data → Create it first

```javascript
// WRONG - Assumes user "John Smith" exists in the system
await page.getByText("John Smith").click();
await page.getByRole("button", { name: "Edit" }).click();
// What if John Smith doesn't exist in this environment?

// CORRECT - Create the user first, then edit
const userId = await apiCreateUser({ name: `cktest-user-${Date.now()}` });
await page.goto(`/users/${userId}`);
await page.getByRole("button", { name: "Edit" }).click();
```

```javascript
// WRONG - Assumes there's an order to verify
test("verify order details display correctly", async ({ page }) => {
  await page.goto("/orders");
  await page.getByText("Order #12345").click();  // Might not exist!
  await expect(page.getByText("Total:")).toBeVisible();
});

// CORRECT - Create order first, then verify
test("verify order details display correctly", async ({ page, request, vs }) => {
  // Setup: Create order via API
  const order = await request.post("/api/orders", {
    data: { product: "Widget", quantity: 2 }
  });
  vs.orderId = order.id;

  // Test: Verify the details display
  await page.goto(`/orders/${vs.orderId}`);
  await expect(page.getByText("Total:")).toBeVisible();
  await expect(page.getByText("Widget")).toBeVisible();
});
```

### When to Use API vs UI Setup

| What You're Testing | How to Set Up Data |
|--------------------|-------------------|
| Create new product | **UI** - This IS what you're testing |
| Edit user profile | **API** - Create user, then test edit UI |
| Delete a task | **API** - Create task, then test delete UI |
| View order details | **API** - Create order, then test view UI |
| Search functionality | **API** - Create items with known values, then search |
| Full CRUD flow | **UI for Create**, then continue to edit/delete |
| Filter by status | **API** - Create items with different statuses |

### API Setup Examples

```javascript
// Helper function for creating test data
async function apiCreateProduct(request: APIRequestContext, data: ProductData) {
  const response = await request.post("/api/products", { data });
  return response.json();
}

// Use in test
test(defineChecksumTest("Edit product name", "abc123"), async ({ page, request, vs }) => {
  // SETUP via API - not testing creation, so skip the UI
  const product = await apiCreateProduct(request, {
    name: `cktest-product-${Date.now()}`,
    price: 99.99,
  });
  vs.productId = product.id;
  vs.productName = product.name;

  // TEST the edit functionality via UI
  await page.goto(`/products/${vs.productId}/edit`);

  await checksumAI("Update product name", async () => {
    await page.getByLabel("Product Name").fill("Updated Name");
  });

  await checksumAI("Save changes", async () => {
    await page.getByRole("button", { name: "Save" }).click();
  });

  // VERIFY
  await expect(
    page.getByText("Updated Name"),
    "Product name should be updated"
  ).toBeVisible();
});
```

### DRY: Reusable Setup Utilities

```javascript
// checksum/utils/api-helpers.ts
// NOTE: Always use "cktest" prefix for identifiable test data
export async function apiCreateUser(request: APIRequestContext, overrides = {}) {
  const defaultData = {
    name: `cktest-user-${Date.now()}`,
    email: `cktest-${Date.now()}@example.com`,  // cktest prefix in email too
  };
  const response = await request.post("/api/users", {
    data: { ...defaultData, ...overrides },
  });
  return response.json();
}

export async function apiCreateTask(request: APIRequestContext, overrides = {}) {
  const defaultData = {
    title: `cktest-task-${Date.now()}`,
    status: "pending",
  };
  const response = await request.post("/api/tasks", {
    data: { ...defaultData, ...overrides },
  });
  return response.json();
}

// Use in tests
import { apiCreateUser, apiCreateTask } from "@checksum/utils/api-helpers";

test(defineChecksumTest("Delete task", "xyz789"), async ({ page, request, vs }) => {
  const task = await apiCreateTask(request);
  vs.taskId = task.id;

  // Now test the delete flow via UI
  await page.goto(`/tasks/${vs.taskId}`);
  await checksumAI("Click delete button", async () => {
    await page.getByRole("button", { name: "Delete" }).click();
  });
  // ...
});
```

### Using test.beforeEach for Common Setup

```javascript
test.describe("Task management", () => {
  let taskId: string;

  test.beforeEach(async ({ request }) => {
    // Every test in this block gets a fresh task
    const task = await apiCreateTask(request);
    taskId = task.id;
  });

  test("can edit task title", async ({ page }) => {
    await page.goto(`/tasks/${taskId}/edit`);
    // Test edit functionality...
  });

  test("can delete task", async ({ page }) => {
    await page.goto(`/tasks/${taskId}`);
    // Test delete functionality...
  });

  test("can mark task complete", async ({ page }) => {
    await page.goto(`/tasks/${taskId}`);
    // Test completion functionality...
  });
});
```

---

## 9. State & Race Conditions

### State Independence

```javascript
// Design tests to work on different environments/users
// Don't rely on existing app state - CREATE what you need

// WRONG - Assumes specific data exists
await page.getByText("Existing Product ABC").click();

// CORRECT - Create test data or use API setup
const productId = await apiCreateProduct({ name: `cktest-${Date.now()}` });
await page.goto(`/products/${productId}`);
```

### Pagination Handling

```javascript
// WRONG - Assumes item is on first page
await page.getByText(vs.itemName).click();

// CORRECT - Search or filter to find item
await checksumAI("Search for the item", async () => {
  await page.getByPlaceholder("Search").fill(vs.itemName);
});
await expect(page.getByText(vs.itemName)).toBeVisible();
```

### Sporadic Elements

```javascript
// For elements that appear sometimes (onboarding, feature announcements)
await page.addLocatorHandler(
  page.getByRole("dialog", { name: "New Features" }),
  async () => {
    await page.getByRole("button", { name: "Dismiss" }).click();
  }
);

// Or use try/catch with short timeout
try {
  await page.getByRole("dialog", { name: "Welcome" }).waitFor({ timeout: 2000 });
  await page.getByRole("button", { name: "Skip" }).click();
} catch {
  // Dialog didn't appear, continue
}
```

---

## 10. Anti-Pattern Reference

### checksumAI Misuse

```javascript
// WRONG - Large blocks mixing actions and assertions
await checksumAI("Verify elements", async () => {
  const element = page.getByTestId("test");
  await expect(element).toBeVisible();  // Assertion inside - BAD
  const text = await element.textContent();
  expect(text).toBeTruthy();  // Assertion inside - BAD
});

// CORRECT - Separate actions and assertions
await expect(page.getByTestId("test")).toBeVisible();
const text = await page.getByTestId("test").textContent();
expect(text).toBeTruthy();
```

### Locator Anti-Patterns

```javascript
// WRONG
page.locator('.MuiButton-root-abc123')  // Dynamic class
page.locator('div > div > button').nth(3)  // Fragile path + nth
page.locator('[class="active selected"]')  // State-dependent

// CORRECT
page.getByTestId("submit-button")
page.getByRole("button", { name: "Submit" })
page.locator('[data-testid="item-row"]').first()  // nth OK for list selection
```

### Waiting Anti-Patterns

```javascript
// WRONG
await page.waitForTimeout(2000);
await page.goto("/page", { waitUntil: "networkidle" });
await page.waitForSelector(".element", { state: "visible" });

// CORRECT
await expect(page.locator(".element")).toBeVisible();
await page.goto("/page", { waitUntil: "domcontentloaded" });
await expect(page.locator(".element")).toBeVisible({ timeout: 10000 });
```

### Test Structure Anti-Patterns

```javascript
// WRONG - Hardcoded URLs
await page.goto("https://qa.example.com/dashboard");

// WRONG - No unique test data
await page.fill('[name="title"]', "Test Task");

// WRONG - Relies on existing state
await page.click('text="Existing Item"');

// CORRECT
await page.goto(environment.baseURL + "/dashboard");
await page.fill('[name="title"]', `cktest-${Date.now()}`);
await page.click(`text="${vs.createdItemName}"`);
```

### Data Setup Anti-Patterns

```javascript
// WRONG - Test edits something without creating it first
test("can edit user profile", async ({ page }) => {
  await page.goto("/users");
  await page.getByText("John Smith").click();  // Assumes John exists!
  await page.getByRole("button", { name: "Edit" }).click();
  // ...
});

// WRONG - Test deletes something that might not exist
test("can delete task", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByText("Important Task").click();  // What if it doesn't exist?
  await page.getByRole("button", { name: "Delete" }).click();
});

// CORRECT - Create data first, then interact with it
test("can edit user profile", async ({ page, request, vs }) => {
  // Setup: Create user via API
  const user = await apiCreateUser(request);
  vs.userId = user.id;

  // Test: Edit via UI
  await page.goto(`/users/${vs.userId}/edit`);
  await page.getByLabel("Name").fill("Updated Name");
  await page.getByRole("button", { name: "Save" }).click();
});

// CORRECT - Create task first, then delete it
test("can delete task", async ({ page, request, vs }) => {
  // Setup: Create task via API
  const task = await apiCreateTask(request);
  vs.taskId = task.id;

  // Test: Delete via UI
  await page.goto(`/tasks/${vs.taskId}`);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
});
```

---

## File Naming Conventions

- Test files: `<feature>-<description>.checksum.spec.ts`
- Page objects: `<page-name>.page.ts`
- Utilities: `<feature>.utils.ts`
- Locators: `<page-name>.locators.ts`

---

## Readability Guidelines

### Spacing

```javascript
// CORRECT - Blank lines between assertions and actions
await expect(element1, "Check 1").toBeVisible();

await expect(element2, "Check 2").toBeVisible();

await checksumAI("Click button", async () => {
  await page.getByRole("button").click();
});
```

### Non-Async Assertions in test.step

```javascript
// For better trace visibility with non-async assertions
await test.step("Verify element text", () => {
  expect(text, "Text should be truthy").toBeTruthy();
});
```
