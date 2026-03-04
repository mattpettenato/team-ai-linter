# contacts-lerna Guidelines

# contacts-lerna Guidelines

This document outlines guidelines for Playwright tests within the contacts-lerna project, covering content generation, test creation, best practices, and specific implementation details.

# General Guidelines

* Provide initial AI-generated content and human-reviewed completed tests.  
* Create tests in **JavaScript**.  
* Rework the existing tests.  
* Adhere to Playwright best practices.  
* Utilize the existing Page Object (PO) model where applicable.  
* Do NOT merge in Pull Requests (PRs).  
* Here is the [`CONTRIBUTING.MD`]() file (which can also be found on the second tab of this document)

# Test Structure and Best Practices

* Use `test.describe` to group tests by features or workflows for improved readability and organization.  
* Use `test.beforeAll` for test setup and `test.afterAll` for test cleanup.  
* Add cleanup context in the `afterAll`:

```javascript
test.afterAll(async () => {
  await global.$page.close();
});
```

* Ensure test descriptions accurately reflect what is being tested.  
* Each test should be atomic, not relying on the successful completion or side effects of other tests.  
* Extract all locators and complex user actions into separate Page Object/Model classes.  
* Use targeted `expects` or wait for an element instead of generic `await page.waitForTimeout()`.  
  * **Why `page.waitForTimeout()` is a problem:** Fixed sleeps are brittle (too short → flakiness, too long → slow tests) and make tests nondeterministic.  
  * **Recommended replacement patterns:**  
    * Use `expect(locator).toBeVisible()` or `locator.waitFor({ state: 'visible' })` with a reasonable timeout.  
    * Wait for a specific network response when an action triggers a request.  
    * **Example replacement:**  
      * Replace: `await page.waitForTimeout(1000);`  
      * With: `await expect(page.getByRole('dialog', { name: 'Add custom field' })).toBeVisible({ timeout: 10_000 });`  
* Normalize numeric & date data before sorting/assertions.  
* Scope selectors to containers/dialogs.  
* Avoid force clicks and swallowed errors.  
* Use robust `counts`/`hasText`/`toHaveCount` instead of fragile `nth()` checks.

# Locator Strategies

Locator strategies vary by page, using either built-in Playwright testing library methods or `data-qe-id` attributes.

| Pages that use data-qe-id’s | Pages that use getBy\* locators |
| :---- | :---- |
| Add multiple contacts flows | All contacts page |
| Upload from a file flow | List and segments page |
| View import/export activity page | Contacts on a List |
| Import errors page | Manage tags page |
| Import unsubscribed contacts flow | Manage custom fields page |
| Create a new segment flow | Add a single contact |
|  | Contact profile page |

# StatSig Implementation

* StatSig cookie overrides should be individually set for each test.  
* **Example of how to Enable Statsig in a test:**  
  * `playwright/integration/add-multiple/add-multiple-custom-field-multiselect-validation-spec.js`  
  * **StatSig feature gates to enable in addition to the feature gates that are mentioned in the individual Jira stories:**  
    * `enable_rise_contacts`  
    * `enable_rise_contacts_lists`  
    * `enable_rise_contacts_add_in_nav`

# CONTRIBUTING.MD

\# Playwright Testing Contributing Guide

This guide helps new engineers understand our best practices for writing and maintaining Playwright tests in the contacts-lerna project.

\#\# Project Setup & Environment

\#\#\# Prerequisites

\- Node.js (use the version specified in the playwright directory using \`.nvmrc\` or run \`nvm use\` from the playwright directory. Playwright's node version is independent of the one used by the root directory and application code.

\#\#\# Initial Setup

1\. Navigate to the playwright directory:

   \`\`\`bash

   cd contacts-lerna/playwright

   \`\`\`

2\. Ensure you're using the correct Node version:

   \`\`\`bash

   cd contacts-lerna

   nvm use

   \`\`\`

3\. Install test dependencies:

   \`\`\`bash

   cd contacts-lerna

   nvm use

   npm install

   npx playwright install

   \`\`\`

\#\# Test Organization & Structure

\#\#\# Directory Structure

\`\`\`

playwright/

├── integration/           \# Test specifications organized by feature

│   ├── activity/         \# Activity-related tests

│   ├── add-contacts/     \# Add contacts functionality

│   ├── contacts-ui/      \# Contacts UI tests

│   └── ...

├── helpers/              \# Reusable helper functions

├── page-objects/         \# Page Object Model implementations

├── resources/            \# Test data files (CSV, XLSX, etc.)

└── playwright.config.js  \# Playwright configuration

\`\`\`

\#\#\# Test File Naming Conventions

\- Use descriptive names ending with \`-spec.js\`

\- Group related tests in feature-specific directories and use hyphens between words.

\- Examples:

  \- \`lists-creating-spec.js\`

  \- \`activity-basic-spec.js\`

  \- \`contacts-import-sync-csv-spec.js\`

\#\#\# Test Categorization

Use tags to categorize tests:

\- \`@smoke\` \- Critical functionality tests

\- \`@lighthouse\` \- Lighthouse Performance Tests

\- \`@regression\` \- Full regression test suite

\- \`@checksum\` \- Tests created by Checksum AI

Do not tag any tests with @smoke or @regression without prior discussion with the team. Those tags need a shared understanding of overall coverage to decide where that's appropriate for inclusion. 

Tagging can be done on the describe block or on tests themselves. 

Tags do not belong within the describe string itself but in an explicit tag.

Example of tagging at the test level:

\`\`\`javascript

test('test contacts list page', {

  tag: '@smoke',

}, async ({ page }) \=\> {

  // ...

});

\`\`\`

Example of tagging at the test describe level:

\`\`\`javascript

import { test, expect } from '@playwright/test';

test.describe('group', {

  tag: '@checksum',

}, () \=\> {

  test('test contact import', async ({ page }) \=\> {

    // ...

  });

  test('test contacts list view',async ({ page }) \=\> {

    // ...

  });

});

\`\`\`

\#\#\# Test Organization Best Practices

\- Group related tests in \`test.describe()\` blocks

\- Use descriptive test names that explain the expected behavior

\- Keep tests focused on single functionality

\- If there are multiple flows for a single function under test, test only a single flow in a single testcase. Break up other flows into other test cases.

\- Use \`test.beforeAll()\` and \`test.afterAll()\` for setup/teardown

\- Use \`test.beforeEach()\` and \`test.afterEach()\` for test-specific setup

\- Share a single browserContext for all tests in a spec file. This minimizes time lost to setup and tear down. However, a single spec file should not be larger than 12 tests. If there are more than 8 tests consider a 2nd spec file. Sharing browserContexts across tests increases execution speed but too much reuse leaves you vulnerable to leaking memory. 

\#\# Page Object Model Guidelines

\#\#\# Page Object Structure

Page objects should be organized by feature/component and follow this pattern:

\`\`\`

page-objects/

├── contactsMain/

│   └── contacts-main-page-po.js

├── addContact/

│   ├── add-contact-dialog-po.js

│   └── add-contact-form-po.js

└── index.js  \# Central export file

\`\`\`

\#\#\# Page Object Naming Conventions

\- Files should end with \`-po.js\` (page object)

\- Use kebab-case for file names

\- Use descriptive names that match the UI component

\- Examples:

  \- \`contacts-main-page-po.js\`

  \- \`add-contact-dialog-po.js\`

  \- \`import-errors-po.js\`

\#\#\# Page Object Implementation

\`\`\`javascript

// Selector definitions at the top

const createListButton \= \`\[data-qe-id="button-create-list"\]\`;

const createListInput \= \`\[data-qe-id="list-name-field"\]\`;

// Helper functions

const clickCreateListButton \= async () \=\> {

  await appPo.waitForSelector(createListButton);

  await appPo.clickBtn(createListButton);

};

// Export all functions

module.exports \= {

  clickCreateListButton,

  // ... other functions

};

\`\`\`

\#\#\# Page Object Best Practices

\- Define selectors as constants at the top of the file

\- Use descriptive function names that explain the action

\- Keep functions focused on single actions

\- Use the shared \`appPo\` for common operations

\- Handle timeouts appropriately

\- Export all public functions

\- Avoid 

\#\#\# Helper Function Organization

\- Create reusable helper functions in the \`helpers/\` directory

\- Use descriptive names that explain the functionality

\- Group related helpers in the same file

\- Export functions for reuse across tests

\- Examples:

  \- \`import-helper.js\` \- File import utilities

  \- \`create-list.js\` \- List creation helpers

  \- \`user-login.js\` \- Authentication helpers

\#\# Test Data Management

\#\#\# Test Data Location

Store test data files in the \`resources/data/\` directory:

\`\`\`

resources/

└── data/

    ├── 1\_contact\_with\_details.csv

    ├── multiple\_contacts.xlsx

    ├── import\_errors.txt

    └── ...

\`\`\`

\#\#\# File Upload Patterns

Use the established patterns for file uploads:

\`\`\`javascript

// For file imports

const testFilePathLocation \= path.resolve(\_\_dirname, '../../resources/data/1\_contact\_with\_details.csv');

await createListWithFileImport(testFilePathLocation, 'MyList');

// For direct file uploads

const fullPath \= path.resolve(\_\_dirname, \`../resources/data/${fileName}\`);

await $page.frameLocator('\#fullscreenDistUiMember\_iframe').locator(fileInput).setInputFiles(fullPath);

\`\`\`

\#\#\# Data-Driven Testing

\- Use CSV, XLSX, or other data files for test data

\- Create helper functions to read and process test data

\- Use descriptive file names that indicate the test scenario

\- Examples:

  \- \`1\_contact\_with\_details.csv\` \- Single contact test

  \- \`multiple\_contacts.xlsx\` \- Multiple contacts test

  \- \`import\_errors.txt\` \- Error handling test

\#\#\# Test Data Best Practices

\- Use realistic test data that matches production scenarios

\- Keep test data files small and focused

\- Use descriptive file names

\- Document any special requirements for test data

\- Clean up test data after tests complete when necessary

\#\#\# File Path Handling

\- Always use \`path.resolve()\` for file paths

\- Use relative paths from the test file location

\- Handle both absolute and relative paths in helper functions

\- Example:

  \`\`\`javascript

  const fullPath \= isAbsolutePath ? file : path.resolve(\_\_dirname, \`../resources/data/${file}\`);

  \`\`\`

\#\# Additional Resources

\- \[Playwright Documentation\]([https://playwright.dev/](https://playwright.dev/)) 

\- \[Page Object Model Pattern\]([https://playwright.dev/docs/pom](https://playwright.dev/docs/pom)) 

\- \[Test Data Management\]([https://playwright.dev/docs/test-data](https://playwright.dev/docs/test-data)) 

\- \[Best Practices\]([https://playwright.dev/docs/best-practices](https://playwright.dev/docs/best-practices))   
