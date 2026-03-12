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
// WRONG - Data retrieval wrapped in checksumAI
const imageSrc = await checksumAI("Get logo image src", async () => {
  return await logoImage.getAttribute("src");
});
const companyName = await checksumAI("Get company name", async () => {
  return await nameElement.textContent();
});

// CORRECT - Direct data retrieval outside checksumAI
const imageSrc = await logoImage.getAttribute("src");
const companyName = await nameElement.textContent();
const cardCount = await cards.count();

// Use variables in assertions outside checksumAI
expect(imageSrc).toContain("/assets/logo");
expect(companyName).toBeTruthy();
```

**NOTE**: Variable assignments inside or outside checksumAI wrappers are both acceptable. This is not flagged as an issue.

**DO NOT flag as violations:**
- Variable assignments anywhere (inside or outside checksumAI)
- Playwright locator methods like `.filter()`, `.first()`, `.nth()`, `.last()`
- Click actions, fill actions, or any other Playwright actions inside checksumAI

#### Never Wrap

- `page.getByTestId()`, `page.getByRole()`, `page.getByText()` (element selection)
- `.locator()`, `.first()`, `.nth()`, `.last()` (locator refinement)
- Variable assignments for locators
- `await expect()` or `expect()` (any assertion)
- Logic operations, loops, conditionals
- Console.log statements
- Test framework functions: `test()`, `test.describe()`, `test.beforeEach()`, `defineChecksumTest()`
- `getEnvironment()`, environment/login assignments

### checksumAI Description Guidelines (STRICT)

**Why descriptions matter:**
1. **Playwright Traces:** Descriptions appear in traces, making debugging much easier. Anyone reviewing a trace should understand what each step is trying to accomplish without reading the code.
2. **AI Agent Recovery:** When a checksumAI step fails, an AI agent reads the description to understand what needs to happen and dynamically solve the failure. Good descriptions help the AI agent recover from failures intelligently.

**THIS IS STRICTLY ENFORCED - Flag violations as warnings**

**Rule: `misleading_checksumAI_description`** - Action type doesn't match description
**Rule: `vague_checksumAI_description`** - Description too vague for AI agent to understand

**Format: "Action X to accomplish Y"**

Descriptions MUST:
1. **Accurately describe what the code actually does** - misleading descriptions are a violation
2. **Be specific, not vague** - descriptions like "Wait", "Click", "Do something" are violations
3. **Explain both the action and intent**

**MISLEADING DESCRIPTIONS (flag these - ACTION TYPE mismatches only):**
```javascript
// BAD - Description says "Wait" but code does variable assignment
await checksumAI("Wait for the message to be processed", async () => {
  vs.messageContent = await page.locator(...).textContent();  // This is DATA EXTRACTION, not waiting!
});

// CORRECT - Description matches the actual action type
await checksumAI("Extract message content for later verification", async () => {
  vs.messageContent = await page.locator(...).textContent();
});

// BAD - Description says "Click" but code does navigation
await checksumAI("Click on settings", async () => {
  await page.goto("/settings");  // This is NAVIGATION, not clicking!
});
```

**DO NOT flag minor content mismatches:**
```javascript
// This is FINE - description describes the action, not exact data
await checksumAI("Fill in the Message input field with the prompt", async () => {
  await page.getByRole("textbox").fill("Some test message");  // Actual text can differ
});
```

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

// Rely on the global assertion timeout configured in playwright.config.ts.
// Do not pass explicit { timeout } to assertions.
```

### Avoid waitForTimeout (Warning Only)

Using `waitForTimeout` is generally discouraged but sometimes acceptable. Flag as **warning** severity, not error - it's the user's discretion to determine if it's appropriate for their use case.

```javascript
// DISCOURAGED - Fixed sleep can be brittle
await page.waitForTimeout(1000);
await page.locator('button').click();

// PREFERRED - Wait for specific state when possible
await expect(page.getByRole("dialog", { name: "Add field" })).toBeVisible();
await page.getByRole("button", { name: "Add" }).click();
```

**Note**: Sometimes `waitForTimeout` is the pragmatic choice (e.g., waiting for animations, debounced inputs). Use your judgment.

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

**EXCEPTIONS - The following DO NOT need the `cktest` prefix:**
- Variables referencing pre-existing stable test fixtures: `DO_NOT_DELETE`, `DONOTDELETE`, `DO-NOT-DELETE`
- Variables containing `CHECKSUM` or `checksum` (these are stable fixture identifiers)
- Any variable storing a reference to pre-existing fixture data (not test-generated data)

```javascript
test(defineChecksumTest("Create task", "abc123"), async ({ page, variableStore: vs }) => {
  // Set unique values - ALWAYS use cktest prefix for TEST-GENERATED data
  vs.taskName = `cktest-${Date.now()}`;
  vs.userName = `cktest-user-${Date.now()}`;
  vs.productName = `cktest-product-${Date.now()}`;
  vs.description = `cktest - Test description created at ${new Date().toISOString()}`;

  // EXCEPTION: Referencing stable fixtures - no cktest prefix needed
  vs.connectorName = "CHECKSUM_DO_NOT_DELETE";
  vs.projectName = "CHECKSUM DO NOT DELETE PROJECT";

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
// WRONG - Relies on random existing state
await page.getByText("John's Existing Task").click();

// CORRECT - Creates own test data
vs.taskName = `cktest-${Date.now()}`;
await checksumAI("Create new task", async () => {
  await page.getByRole("button", { name: "New Task" }).click();
});
await checksumAI("Fill task name", async () => {
  await page.getByPlaceholder("Name").fill(vs.taskName);
});

// ALSO CORRECT - Using stable test fixtures (DO_NOT_DELETE, CHECKSUM patterns)
vs.connectorName = "CHECKSUM_DO_NOT_DELETE";  // Stable fixture, no cktest needed
await checksumAI("Search for fixture connector", async () => {
  await page.getByPlaceholder("Search").fill(vs.connectorName);
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

// Or use try/catch with web-first assertion
try {
  await expect(page.getByRole("dialog", { name: "Welcome" })).toBeVisible();
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
// DISCOURAGED (warning) - waitForTimeout can be brittle but sometimes necessary
await page.waitForTimeout(2000);

// WRONG (error)
await page.goto("/page", { waitUntil: "networkidle" });
await page.waitForSelector(".element", { state: "visible" });

// CORRECT
await expect(page.locator(".element")).toBeVisible();
await page.goto("/page", { waitUntil: "domcontentloaded" });
await expect(page.locator(".element")).toBeVisible();
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

---

## 11. Functions & Module Guidelines

### Never Use variableStore in Function Arguments

Do not use `vs: IVariableStore` as an argument within functions. All variables used within a function should be included as explicit arguments, with the exception of variables used within the scope of the function itself that are temporary.

```javascript
// WRONG - variableStore as function argument
async function fillUserForm(page: Page, vs: IVariableStore) {
  await page.fill('#name', vs.userName);
  await page.fill('#email', vs.userEmail);
}

// CORRECT - Pass values directly as arguments
async function fillUserForm(page: Page, userName: string, userEmail: string) {
  await page.fill('#name', userName);
  await page.fill('#email', userEmail);
}

// Usage
await fillUserForm(page, vs.userName, vs.userEmail);
```

### Correct Import Patterns

**Always import from Checksum runtime, never from Playwright directly:**

```javascript
// WRONG - Importing from @playwright/test
import { Page, expect } from "@playwright/test";

// CORRECT - Import from Checksum runtime
import { IChecksumPage, IChecksumExpect } from "@checksum-ai/runtime";
```

### Test File Setup and Login Initialization

**All Checksum test files must use `init()` to get runtime utilities.** The `login`, `expect`, `checksumAI`, and other utilities come from the `init()` function - they are NOT separate imports.

**Correct test file setup:**

```typescript
import { test as base } from "@playwright/test";
import { init } from "@checksum-ai/runtime";

// CORRECT - Get all utilities from init()
const { test, defineChecksumTest, login, expect, checksumAI } = init(base);

test(
  defineChecksumTest("My test name", "TC001"),
  async ({ page, vs }) => {
    // Use login inside checksumAI wrapper
    await checksumAI("Log into application", async () => {
      await login(page, { environment: "my-environment" });
    });

    // Rest of test...
  }
);
```

**Common mistakes to avoid:**

```typescript
// WRONG - Do NOT try to import login from a separate module
import { login } from "@checksum/utils/login";  // This doesn't exist!

// WRONG - Do NOT import expect from Playwright
import { expect } from "@playwright/test";  // Use expect from init() instead

// WRONG - Do NOT use Playwright's test directly
import { test } from "@playwright/test";  // Use test from init() instead
```

**For utility files** that receive Checksum types as parameters:

```typescript
import { IChecksumPage, IChecksumExpect, ChecksumAI } from "@checksum-ai/runtime";

// Utility functions receive the Checksum-wrapped instances as parameters
export async function myUtilityFunction(
  page: IChecksumPage,
  expect: IChecksumExpect,
  checksumAI: ChecksumAI
) {
  // Use the passed-in instances
  await checksumAI("Do something", async () => {
    await page.click("button");
  });
}
```

---

## 12. Type Safety

### Never Silence TypeScript with Unsafe Assertions

Using `as string` or `|| ""` to avoid TypeScript complaints makes failures increasingly difficult to diagnose. Type errors should be addressed properly.

```javascript
// WRONG - Silencing TypeScript with type assertion
baseURL: process.env.STAGING_BASE_URL as string

// WRONG - Using empty string fallback
const user = await page.locator('h1').textContent() || ""

// CORRECT - Proper error handling for environment variables
if (!process.env.STAGING_BASE_URL) {
  throw new Error("STAGING_BASE_URL environment variable is required");
}
baseURL: process.env.STAGING_BASE_URL

// CORRECT - Proper null handling for text content
const user = await page.locator('h1').textContent();
if (!user) {
  throw new Error("Expected user heading to have text content");
}

// CORRECT - Use expect to verify before using
await expect(page.locator('h1')).toHaveText(/./);  // Verify non-empty
const user = await page.locator('h1').textContent();
```

### Environment Variable Validation

Assert required environment variables at the top of the config so tests fail fast:

```javascript
// checksum.config.ts or playwright.config.ts
if (!process.env.CHECKSUM_API_KEY) {
  throw new Error("Missing CHECKSUM_API_KEY environment variable");
}

if (!process.env.BASE_URL) {
  throw new Error("Missing BASE_URL environment variable");
}
```

---

## 13. Locator Advanced Patterns

### Use Regular Expressions for Flexible Matching

Prefer regex over exact text matching for more resilient tests:

```javascript
// BRITTLE - Exact text matching
await page.getByText("Download was successful!").click();

// BETTER - Regex matching (case-insensitive, partial match)
await page.getByText(/(download|success)/i).click();
```

### Handle Dates Dynamically

Never hard-code date values. Use relative dates that account for weekdays, weekends, and month boundaries:

```javascript
// WRONG - Hard-coded date
await page.fill('#date', '2024-01-15');
await page.getByRole('button', { name: 'January 15' }).click();

// CORRECT - Dynamic date relative to today
const today = new Date();
const formattedDate = today.toISOString().split('T')[0];
await page.fill('#date', formattedDate);
```

### Avoid .nth() Unless Index is Part of Logic

Using `.nth()` just to select among duplicate elements is fragile. Use more specific locators instead:

```javascript
// WRONG - nth just to choose among duplicates
await page.locator('button').nth(2).click();

// CORRECT - Using .first() is OK when selecting from a list intentionally
await page.locator('[data-testid="item"]').first().click();

// CORRECT - More specific locator
await page.getByRole('button', { name: 'Submit' }).click();
await page.locator('[data-testid="submit-button"]').click();
```

---

## 14. Handling Popups, Modals & Toast Messages

### For Popups That Always Appear

Add them to the test flow explicitly:

```javascript
// Assert the modal appears and close it
await expect(page.getByRole('dialog')).toBeVisible();
await checksumAI("Close the welcome modal", async () => {
  await page.getByRole('button', { name: 'Got it' }).click();
});

// Or wait until hidden
await expect(page.getByRole('dialog')).toBeHidden();
```

### For Sporadic Popups (May or May Not Appear)

Use `addLocatorHandler` for elements that appear intermittently:

```javascript
// Register handler for sporadic popups
await page.addLocatorHandler(
  page.getByRole('dialog', { name: 'New Feature Announcement' }),
  async () => {
    await page.getByRole('button', { name: 'Dismiss' }).click();
  }
);

// Or use try/catch with short timeout
try {
  await page.getByRole('dialog', { name: 'Welcome' }).waitFor({ timeout: 2000 });
  await page.getByRole('button', { name: 'Skip' }).click();
} catch {
  // Dialog didn't appear, continue with test
}
```

---

## 15. Special Element Handling

### Canvas Elements

To interact with Canvas elements, use coordinates:

```javascript
await checksumAI("Click on canvas element at specific position", async () => {
  await page.locator('canvas').click({ position: { x: 100, y: 200 } });
});
```

### File Uploads

Files used during tests must be stored within the `checksum/test-data/bin` directory:

```javascript
// Retrieve files using the built-in method
const testFilePath = page.resolveAssetsFolder(["relative/path/from/bin/directory"]);

await checksumAI("Upload test document", async () => {
  await page.setInputFiles('input[type="file"]', testFilePath);
});
```

---

## 16. Utility File Best Practices

### Correct Type Imports for Utilities

Utility files that work with Playwright pages must use Checksum types, not Playwright types directly:

```typescript
// WRONG - Using Playwright types directly
import { Page, expect } from "@playwright/test";

export const makePayment = async (
  page: Page,
  checksumAI: Function,
  amount: string
) => { ... }

// CORRECT - Using Checksum types
import { IChecksumPage, IChecksumExpect } from "@checksum-ai/runtime";

export const makePayment = async (
  page: IChecksumPage,
  checksumAI: Function,
  expect: IChecksumExpect,
  amount: string
) => { ... }
```

### Remove Unused Parameters

Functions should only declare parameters they actually use. Unused parameters add confusion and maintenance burden:

```typescript
// WRONG - contactName and email are never used in the function body
export const makePartialPaymentConfido = async (
  page: IChecksumPage,
  checksumAI: Function,
  contactName: string,  // UNUSED
  email: string,        // UNUSED
  amount: string
) => {
  await checksumAI("Enter payment amount", async () => {
    await page.getByLabel("Amount").fill(amount);
  });
}

// CORRECT - Only declare parameters that are used
export const makePartialPaymentConfido = async (
  page: IChecksumPage,
  checksumAI: Function,
  amount: string
) => {
  await checksumAI("Enter payment amount", async () => {
    await page.getByLabel("Amount").fill(amount);
  });
}

// If a parameter must exist but isn't used (e.g., for API compatibility), prefix with underscore
export const myFunction = async (_unusedParam: string, usedParam: string) => {
  console.log(usedParam);
}
```

### Remove Dead Imports

Do not leave unused imports in files. They add confusion and can cause issues during refactoring:

```typescript
// WRONG - lodash is imported but never used
import { Page } from "@playwright/test";
import _ from "lodash";  // UNUSED

export const helper = (page: Page) => { ... }

// CORRECT - Only import what you use
import { Page } from "@playwright/test";

export const helper = (page: Page) => { ... }
```

---

## 17. Code Hygiene

### No Commented-Out Code Blocks

Remove commented-out code instead of leaving it in the file. Use git history to retrieve old code if needed:

```typescript
// WRONG - Commented code should be removed
// await checksumAI("Click Case Workflow tab", () =>
//   incognitoPage.getByRole("tab", { name: "Case Workflow" }).click()
// );

await checksumAI("Click next step", () =>
  page.getByRole("button", { name: "Next" }).click()
);

// CORRECT - Clean code without commented blocks
await checksumAI("Click next step", () =>
  page.getByRole("button", { name: "Next" }).click()
);
```

**Note**: Single-line explanatory comments and TODO comments are acceptable.

### Hardcoded Environment Values in login()

Hardcoded environment strings in `login()` calls are acceptable. Extracting to constants is optional:

```typescript
// ACCEPTABLE - Hardcoded environment string inline
await checksumAI("Log into application", async () => {
  await login(page, { environment: "xnow-dev" });
});

// ALSO ACCEPTABLE - Constants at top of file (optional)
const ENV_NAME = "glade-testing";
const ROLE = "confido";

// Later in test...
login(page, { role: ROLE, environment: ENV_NAME });
```

### Store Environment Data in Variable Store (vs)

When using environment data inside checksumAI actions, store it in `vs` first rather than accessing `environment` directly:

```typescript
// WRONG - Direct environment access inside checksumAI action
await checksumAI("Fill password", () =>
  page.getByPlaceholder("Enter your password").fill(environment.users![0].password!)
);

// CORRECT - Store in vs first, then use
vs.password = environment.users![0].password;

await checksumAI("Fill password", () =>
  page.getByPlaceholder("Enter your password").fill(vs.password)
);
```

**Why this matters**: The variable store (`vs`) provides a clear audit trail of what values are being used in the test, makes debugging easier, and allows AI agents to understand the test context better.

---

## 18. Wait Methods and checksumAI

### Wrap Wait Methods for Debugging

Wait methods like `waitForURL`, `waitForSelector`, and `waitForLoadState` should be wrapped in checksumAI for better debugging visibility and AI agent recovery:

```typescript
// WRONG - Raw waits are hard to debug in traces
await page.waitForURL("**/purchase-confirmation**", { timeout: 30000 });
await page.waitForLoadState("domcontentloaded");

// CORRECT - Wrapped for visibility and AI agent recovery
await checksumAI("Wait for purchase confirmation page to load", () =>
  page.waitForURL("**/purchase-confirmation**", { timeout: 30000 })
);

await checksumAI("Wait for page content to be ready", () =>
  page.waitForLoadState("domcontentloaded")
);
```

**Exception**: `waitForLoadState` immediately after `goto()` in the same checksumAI wrapper is acceptable without a separate wrapper.

```typescript
// This is acceptable - waitForLoadState is part of the navigation action
await checksumAI("Navigate to settings page", async () => {
  await page.goto(environment.baseURL + "/settings");
  await page.waitForLoadState("domcontentloaded");
});
```

**Why this matters**:
1. Wrapped wait methods appear clearly in Playwright traces, making debugging easier
2. The checksumAI description tells an AI agent exactly what the test is waiting for
3. If a wait fails, the AI agent can read the description and attempt recovery

---
