/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Project, Node, SyntaxKind } from 'ts-morph';

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a ts-morph project for AST parsing
 */
function createProject(content: string, fileName: string): ReturnType<typeof Project.prototype.createSourceFile> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true }
  });

  const ext = fileName.endsWith('.js') ? '.js' : '.ts';
  return project.createSourceFile(`temp_${Date.now()}${ext}`, content);
}

// ============================================================================
// Unused Import Detection
// ============================================================================

export interface UnusedImportIssue {
  line: number;
  importName: string;
  moduleSpecifier: string;
}

/**
 * Check if an identifier is used anywhere in the file (excluding the import line)
 */
function isIdentifierUsedInFile(content: string, identifier: string, importLine: number): boolean {
  const lines = content.split('\n');
  const usagePattern = new RegExp(`\\b${escapeRegex(identifier)}\\b`);

  for (let i = 0; i < lines.length; i++) {
    if (i + 1 === importLine)
      continue;

    if (usagePattern.test(lines[i]))
      return true;

  }
  return false;
}

/**
 * Find imports that are declared but never used in the file
 */
export function findUnusedImports(content: string, fileName: string = 'temp.ts'): UnusedImportIssue[] {
  const sourceFile = createProject(content, fileName);
  const imports = sourceFile.getImportDeclarations();
  const issues: UnusedImportIssue[] = [];

  for (const imp of imports) {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    const impLine = imp.getStartLineNumber();

    // Check named imports
    for (const named of imp.getNamedImports()) {
      const name = named.getName();
      const alias = named.getAliasNode()?.getText() || name;

      if (!isIdentifierUsedInFile(content, alias, impLine)) {
        issues.push({
          line: impLine,
          importName: alias,
          moduleSpecifier
        });
      }
    }

    // Check default import
    const defaultImport = imp.getDefaultImport();
    if (defaultImport) {
      const name = defaultImport.getText();
      if (!isIdentifierUsedInFile(content, name, impLine)) {
        issues.push({
          line: impLine,
          importName: name,
          moduleSpecifier
        });
      }
    }

    // Check namespace import
    const namespaceImport = imp.getNamespaceImport();
    if (namespaceImport) {
      const name = namespaceImport.getText();
      if (!isIdentifierUsedInFile(content, name, impLine)) {
        issues.push({
          line: impLine,
          importName: name,
          moduleSpecifier
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// Unused Parameter Detection
// ============================================================================

export interface UnusedParameterIssue {
  line: number;
  functionName: string;
  parameterName: string;
}

/**
 * Find function parameters that are declared but never used in the function body
 */
export function findUnusedParameters(content: string, fileName: string = 'temp.ts'): UnusedParameterIssue[] {
  const sourceFile = createProject(content, fileName);
  const issues: UnusedParameterIssue[] = [];

  sourceFile.forEachDescendant(node => {
    if (
      Node.isFunctionDeclaration(node) ||
      Node.isArrowFunction(node) ||
      Node.isMethodDeclaration(node) ||
      Node.isFunctionExpression(node)
    ) {
      const params = node.getParameters();
      const body = node.getBody();

      if (!body)
        return;


      const bodyText = body.getText();

      // Get function name for better error messages
      let functionName = '<anonymous>';
      if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
        functionName = node.getName() || '<anonymous>';
      } else {
        const parent = node.getParent();
        if (parent && Node.isVariableDeclaration(parent))
          functionName = parent.getName();

      }

      for (const param of params) {
        const paramName = param.getName();

        // Skip destructured parameters
        if (paramName.includes('{') || paramName.includes('['))
          continue;


        // Skip rest parameters
        if (param.isRestParameter())
          continue;


        // Skip parameters that start with underscore (intentionally unused)
        if (paramName.startsWith('_'))
          continue;


        // Check if parameter is used in body
        const usagePattern = new RegExp(`\\b${escapeRegex(paramName)}\\b`);
        if (!usagePattern.test(bodyText)) {
          issues.push({
            line: param.getStartLineNumber(),
            functionName,
            parameterName: paramName
          });
        }
      }
    }
  });

  return issues;
}

// ============================================================================
// Bug Annotation Validation
// ============================================================================

export interface BugAnnotationIssue {
  line: number;
  testName: string;
  missingComponents: string[];
}

/**
 * Validate bug annotations in test files.
 * Tests marked as bugs should have both:
 * 1. annotation: { type: 'bug', description: '...' }
 * 2. tag: ['@bug']
 * Note: @bug in the test title is optional
 */
export function validateBugAnnotations(content: string, fileName: string = 'temp.ts'): BugAnnotationIssue[] {
  const sourceFile = createProject(content, fileName);
  const issues: BugAnnotationIssue[] = [];

  sourceFile.forEachDescendant(node => {
    if (Node.isCallExpression(node)) {
      const expression = node.getExpression();
      const expressionText = expression.getText();

      // Match test() calls
      if (expressionText === 'test' || expressionText.startsWith('test.')) {
        const args = node.getArguments();
        if (args.length < 2)
          return;


        // First arg is test name
        const testNameArg = args[0];
        let testName = '';
        if (Node.isStringLiteral(testNameArg))
          testName = testNameArg.getLiteralValue();
        else if (Node.isNoSubstitutionTemplateLiteral(testNameArg))
          testName = testNameArg.getLiteralValue();
        else
          testName = testNameArg.getText().replace(/['"]/g, '');


        // Check for config object
        let hasBugAnnotation = false;
        let hasBugTag = false;
        let hasAnnotationDescription = false;

        const configArg = args[1];
        if (Node.isObjectLiteralExpression(configArg)) {
          for (const prop of configArg.getProperties()) {
            if (Node.isPropertyAssignment(prop)) {
              const propName = prop.getName();
              const propValue = prop.getInitializer();

              // Check annotation property
              if (propName === 'annotation' && propValue) {
                if (Node.isObjectLiteralExpression(propValue)) {
                  const typeVal = propValue.getProperty('type');
                  const descVal = propValue.getProperty('description');
                  if (typeVal && Node.isPropertyAssignment(typeVal)) {
                    const typeInit = typeVal.getInitializer();
                    if (typeInit && typeInit.getText().includes('bug'))
                      hasBugAnnotation = true;

                  }
                  if (descVal)
                    hasAnnotationDescription = true;

                } else if (Node.isArrayLiteralExpression(propValue)) {
                  for (const elem of propValue.getElements()) {
                    if (Node.isObjectLiteralExpression(elem)) {
                      const typeVal = elem.getProperty('type');
                      if (typeVal && Node.isPropertyAssignment(typeVal)) {
                        const typeInit = typeVal.getInitializer();
                        if (typeInit && typeInit.getText().includes('bug')) {
                          hasBugAnnotation = true;
                          const descVal = elem.getProperty('description');
                          if (descVal)
                            hasAnnotationDescription = true;

                        }
                      }
                    }
                  }
                }
              }

              // Check tag property
              if (propName === 'tag' && propValue) {
                const tagText = propValue.getText();
                if (tagText.includes('@bug'))
                  hasBugTag = true;

              }
            }
          }
        }

        // Validate completeness - only tag and annotation are required (title @bug is optional)
        const hasSomeBugIndicator = hasBugAnnotation || hasBugTag;

        if (hasSomeBugIndicator) {
          const missing: string[] = [];

          if (!hasBugAnnotation)
            missing.push('annotation: { type: "bug", description: "..." }');

          if (hasBugAnnotation && !hasAnnotationDescription)
            missing.push('description in bug annotation');

          if (!hasBugTag)
            missing.push('tag: ["@bug"]');


          if (missing.length > 0) {
            issues.push({
              line: node.getStartLineNumber(),
              testName: testName.substring(0, 50),
              missingComponents: missing,
            });
          }
        }
      }
    }
  });

  return issues;
}

// ============================================================================
// Const Declaration Detection (prefer variableStore)
// ============================================================================

export interface ConstDeclarationIssue {
  line: number;
  variableName: string;
  testName: string;
}

// Patterns that indicate extracted data (should use variableStore)
const EXTRACTED_DATA_PATTERNS = [
  /\.textContent\s*\(/,
  /\.innerText\s*\(/,
  /\.innerHTML\s*\(/,
  /\.getAttribute\s*\(/,
  /\.inputValue\s*\(/,
  /\.getValue\s*\(/,
  /\.getText\s*\(/,
  /\.count\s*\(/,
  /\.isVisible\s*\(/,
  /\.isEnabled\s*\(/,
  /\.isChecked\s*\(/,
  /\.isDisabled\s*\(/,
  /\.boundingBox\s*\(/,
  /\.evaluate\s*\(/,
  /\.allTextContents\s*\(/,
  /\.allInnerTexts\s*\(/,
];

// Patterns that indicate locators/elements (OK to use const)
const LOCATOR_PATTERNS = [
  /page\s*\.\s*locator\s*\(/,
  /page\s*\.\s*getByRole\s*\(/,
  /page\s*\.\s*getByText\s*\(/,
  /page\s*\.\s*getByLabel\s*\(/,
  /page\s*\.\s*getByPlaceholder\s*\(/,
  /page\s*\.\s*getByTestId\s*\(/,
  /page\s*\.\s*getByTitle\s*\(/,
  /page\s*\.\s*getByAltText\s*\(/,
  /page\s*\.\s*frameLocator\s*\(/,
  /page\s*\.\s*frame\s*\(/,
  /\.\s*locator\s*\(/,
  /\.\s*getByRole\s*\(/,
  /\.\s*getByText\s*\(/,
  /\.\s*getByLabel\s*\(/,
  /\.\s*first\s*\(\s*\)/,
  /\.\s*last\s*\(\s*\)/,
  /\.\s*nth\s*\(/,
  /\.\s*filter\s*\(/,
];

/**
 * Find const declarations inside test() blocks that should use variableStore.
 * Only flags const that stores EXTRACTED DATA (textContent, innerText, etc.)
 */
export function findConstDeclarationsInTests(content: string, fileName: string = 'temp.ts'): ConstDeclarationIssue[] {
  const sourceFile = createProject(content, fileName);
  const issues: ConstDeclarationIssue[] = [];

  sourceFile.forEachDescendant(node => {
    if (Node.isCallExpression(node)) {
      const expression = node.getExpression();
      const expressionText = expression.getText();

      // Match test() calls
      if (
        expressionText === 'test' ||
        expressionText.startsWith('test.') ||
        expressionText === 'it' ||
        expressionText.startsWith('it.')
      ) {
        const args = node.getArguments();
        const testNameArg = args[0];
        let testName = '<unnamed>';
        if (testNameArg) {
          if (Node.isStringLiteral(testNameArg))
            testName = testNameArg.getLiteralValue();
          else if (Node.isNoSubstitutionTemplateLiteral(testNameArg))
            testName = testNameArg.getLiteralValue();
          else
            testName = testNameArg.getText().replace(/['"]/g, '').substring(0, 50);

        }

        // Find the callback function
        for (const arg of args) {
          if (Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)) {
            const body = arg.getBody();
            if (body && Node.isBlock(body)) {
              const statements = body.getStatements();

              body.forEachDescendant(descendant => {
                if (Node.isVariableStatement(descendant)) {
                  const declarationList = descendant.getDeclarationList();
                  const statementText = descendant.getText();

                  if (statementText.trimStart().startsWith('const ')) {
                    for (const declaration of declarationList.getDeclarations()) {
                      const nameNode = declaration.getNameNode();
                      const varName = nameNode.getText();

                      // Skip destructured declarations
                      if (varName.includes('{') || varName.includes('['))
                        continue;


                      // Skip underscore-prefixed
                      if (varName.startsWith('_'))
                        continue;


                      // Skip loop variable declarations
                      const parent = descendant.getParent();
                      if (parent && (Node.isForOfStatement(parent) || Node.isForInStatement(parent)))
                        continue;


                      const initializer = declaration.getInitializer();
                      if (!initializer)
                        continue;


                      const initText = initializer.getText();

                      // Skip if it's a locator pattern
                      const isLocator = LOCATOR_PATTERNS.some(pattern => pattern.test(initText));
                      if (isLocator)
                        continue;


                      // Only flag if it looks like extracted data
                      const isExtractedData = EXTRACTED_DATA_PATTERNS.some(pattern => pattern.test(initText));
                      if (!isExtractedData)
                        continue;


                      // Check if used only in immediate assertions
                      const constLine = descendant.getStartLineNumber();
                      const constIndex = statements.findIndex(s => s.getStartLineNumber() === constLine);

                      if (constIndex !== -1 && constIndex < statements.length - 1) {
                        let usedOnlyInImmediateAssertions = false;
                        for (let i = constIndex + 1; i < Math.min(constIndex + 3, statements.length); i++) {
                          const nextStmt = statements[i];
                          const nextText = nextStmt.getText();
                          const expectPattern = new RegExp(`expect\\s*\\(\\s*${escapeRegex(varName)}\\s*[,)]`);
                          if (expectPattern.test(nextText)) {
                            usedOnlyInImmediateAssertions = true;
                            break;
                          }
                        }
                        if (usedOnlyInImmediateAssertions)
                          continue;

                      }

                      issues.push({
                        line: descendant.getStartLineNumber(),
                        variableName: varName,
                        testName: testName.substring(0, 50),
                      });
                    }
                  }
                }
              });
            }
          }
        }
      }
    }
  });

  return issues;
}

// ============================================================================
// Expect Inside checksumAI Detection
// ============================================================================

export interface ExpectInsideChecksumAIIssue {
  line: number;
  checksumAIDescription: string;
}

/**
 * Find expect/assertion calls inside checksumAI wrapper blocks.
 * These should be flagged as errors - assertions should be outside checksumAI blocks.
 */
export function findExpectsInsideChecksumAI(content: string, fileName: string = 'temp.ts'): ExpectInsideChecksumAIIssue[] {
  const sourceFile = createProject(content, fileName);
  const issues: ExpectInsideChecksumAIIssue[] = [];

  sourceFile.forEachDescendant(node => {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();

      // Check if this is a checksumAI call (not a parameter named checksumAI)
      if (expr.getText() === 'checksumAI') {
        const args = node.getArguments();

        // Get description (first string argument)
        const descArg = args.find(arg =>
          Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)
        );
        const description = descArg?.getText().replace(/^['"`]|['"`]$/g, '') || '<unknown>';

        // Get callback argument
        const callbackArg = args.find(arg =>
          Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)
        );

        if (callbackArg) {
          // Find all expect calls inside the callback
          callbackArg.forEachDescendant(innerNode => {
            if (Node.isCallExpression(innerNode)) {
              const innerExpr = innerNode.getExpression();
              const exprText = innerExpr.getText();

              // Match: expect(...), expect.poll(...), expect.soft(...)
              if (exprText === 'expect' || exprText.startsWith('expect.')) {
                issues.push({
                  line: innerNode.getStartLineNumber(),
                  checksumAIDescription: description
                });
              }
            }
          });
        }
      }
    }
  });

  return issues;
}

// ============================================================================
// Multiple Actions in checksumAI Detection
// ============================================================================

export interface MultipleActionsInChecksumAIIssue {
  line: number;
  actionCount: number;
  checksumAIDescription: string;
}

const PLAYWRIGHT_ACTION_METHODS = new Set([
  'click', 'dblclick', 'fill', 'type', 'press', 'hover', 'check', 'uncheck',
  'selectOption', 'setInputFiles', 'tap', 'goto'
]);

/**
 * Find checksumAI blocks that contain more than one Playwright action.
 * Each block should wrap exactly one user interaction for AI agent recovery.
 */
export function findMultipleActionsInChecksumAI(content: string, fileName: string = 'temp.ts'): MultipleActionsInChecksumAIIssue[] {
  const sourceFile = createProject(content, fileName);
  const issues: MultipleActionsInChecksumAIIssue[] = [];

  sourceFile.forEachDescendant(node => {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();

      if (expr.getText() === 'checksumAI') {
        const args = node.getArguments();

        const descArg = args.find(arg =>
          Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)
        );
        const description = descArg?.getText().replace(/^['"`]|['"`]$/g, '') || '<unknown>';

        const callbackArg = args.find(arg =>
          Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)
        );

        if (callbackArg) {
          let actionCount = 0;

          callbackArg.forEachDescendant(innerNode => {
            if (Node.isCallExpression(innerNode)) {
              const innerExpr = innerNode.getExpression();
              const exprText = innerExpr.getText();
              const lastSegment = exprText.split('.').pop() ?? '';

              if (PLAYWRIGHT_ACTION_METHODS.has(lastSegment)) {
                actionCount++;
              }
            }
          });

          if (actionCount > 1) {
            issues.push({
              line: node.getStartLineNumber(),
              actionCount,
              checksumAIDescription: description,
            });
          }
        }
      }
    }
  });

  return issues;
}

// ============================================================================
// Expect Without Message Detection
// ============================================================================

export interface ExpectWithoutMessageIssue {
  line: number;
}

/**
 * Find expect() calls that are missing a descriptive message parameter.
 * Only flags expects that have an assertion method chained (.toBeVisible(), etc.)
 * and are not inside checksumAI blocks.
 */
export function findExpectsWithoutMessages(content: string, fileName: string = 'temp.ts'): ExpectWithoutMessageIssue[] {
  const sourceFile = createProject(content, fileName);
  const issues: ExpectWithoutMessageIssue[] = [];

  // Collect lines that are inside checksumAI blocks to exclude them
  const checksumAILines = new Set<number>();
  sourceFile.forEachDescendant(node => {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();
      if (expr.getText() === 'checksumAI') {
        const args = node.getArguments();
        const callbackArg = args.find(arg =>
          Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)
        );
        if (callbackArg) {
          const start = callbackArg.getStartLineNumber();
          const end = callbackArg.getEndLineNumber();
          for (let i = start; i <= end; i++) {
            checksumAILines.add(i);
          }
        }
      }
    }
  });

  sourceFile.forEachDescendant(node => {
    if (!Node.isCallExpression(node)) return;

    const expr = node.getExpression();
    const exprText = expr.getText();

    // Match: expect(...) — not expect.poll, expect.soft, etc.
    if (exprText !== 'expect') return;

    const line = node.getStartLineNumber();

    // Skip expects inside checksumAI blocks
    if (checksumAILines.has(line)) return;

    const args = node.getArguments();

    // Has a message if second arg is a string literal or template
    const hasMessage = args.length >= 2 && (
      Node.isStringLiteral(args[1]) || Node.isNoSubstitutionTemplateLiteral(args[1]) || Node.isTemplateExpression(args[1])
    );

    if (hasMessage) return;

    // Only flag if this expect() is the direct callee of a property access
    // i.e., the parent is a property access like expect(...).toBeVisible
    // This ensures the expect has an assertion method chained on it
    const parent = node.getParent();
    if (!parent || !Node.isPropertyAccessExpression(parent)) return;

    issues.push({ line });
  });

  return issues;
}

// ============================================================================
// Missing Environment Variable Guard Detection (checksum.config.ts)
// ============================================================================

export interface MissingEnvVarGuardIssue {
  line: number;
  missingVars: string[];
  guardExists: boolean;
}

/**
 * Find process.env variables used in checksum.config.ts that are not covered
 * by an if-guard block at the top of the file.
 *
 * Expected guard pattern:
 *   if (!process.env.X || !process.env.Y) { throw new Error(...); }
 *
 * Boolean-coerced env vars (!!process.env.CI) are intentionally excluded.
 */
export function findMissingEnvVarGuards(content: string, fileName: string = 'temp.ts'): MissingEnvVarGuardIssue[] {
  const sourceFile = createProject(content, fileName);
  const issues: MissingEnvVarGuardIssue[] = [];

  // Step 1: Find all if-guard blocks that throw on missing env vars
  const guardedVars = new Set<string>();
  const guardLineRanges: { start: number; end: number }[] = [];
  let hasGuard = false;

  sourceFile.forEachDescendant(node => {
    if (Node.isIfStatement(node)) {
      const thenBlock = node.getThenStatement();
      if (!thenBlock) return;

      // Check if the then-block contains a ThrowStatement
      let hasThrow = false;
      thenBlock.forEachDescendant(child => {
        if (Node.isThrowStatement(child)) {
          hasThrow = true;
        }
      });
      if (!hasThrow) return;

      // Extract guarded env var names from the condition
      const conditionText = node.getExpression().getText();
      const guardPattern = /!process\.env\.(\w+)/g;
      let match: RegExpExecArray | null;
      const foundVars: string[] = [];
      while ((match = guardPattern.exec(conditionText)) !== null) {
        foundVars.push(match[1]);
      }

      if (foundVars.length > 0) {
        hasGuard = true;
        for (const v of foundVars) {
          guardedVars.add(v);
        }
        guardLineRanges.push({
          start: node.getStartLineNumber(),
          end: node.getEndLineNumber(),
        });
      }
    }
  });

  // Step 2: Find all process.env.X usages in the body (outside guard ranges)
  const bodyEnvVars = new Set<string>();
  let firstEnvVarLine = 0;

  sourceFile.forEachDescendant(node => {
    if (Node.isPropertyAccessExpression(node)) {
      const text = node.getText();
      // Match process.env.SOMETHING
      const envMatch = text.match(/^process\.env\.(\w+)$/);
      if (!envMatch) return;

      const varName = envMatch[1];
      const line = node.getStartLineNumber();

      // Skip if inside a guard line range
      const inGuard = guardLineRanges.some(r => line >= r.start && line <= r.end);
      if (inGuard) return;

      // Skip boolean-coerced: !!process.env.X
      // Detected by checking for two nested PrefixUnaryExpression ancestors with ! operator
      const parent = node.getParent();
      if (parent && Node.isPrefixUnaryExpression(parent) &&
          parent.getOperatorToken() === SyntaxKind.ExclamationToken) {
        const grandparent = parent.getParent();
        if (grandparent && Node.isPrefixUnaryExpression(grandparent) &&
            grandparent.getOperatorToken() === SyntaxKind.ExclamationToken) {
          return; // This is !!process.env.X — skip it
        }
      }

      bodyEnvVars.add(varName);
      if (firstEnvVarLine === 0) {
        firstEnvVarLine = line;
      }
    }
  });

  // Step 3: If no env vars are used in the body, nothing to report
  if (bodyEnvVars.size === 0) {
    return [];
  }

  // Step 4: Find missing vars (used in body but not in guard)
  const missingVars = [...bodyEnvVars].filter(v => !guardedVars.has(v));

  if (missingVars.length > 0) {
    issues.push({
      line: firstEnvVarLine,
      missingVars,
      guardExists: hasGuard,
    });
  }

  return issues;
}

// ============================================================================
// Environment Variable Not In .env Detection
// ============================================================================

export interface EnvVarNotInDotenvIssue {
  line: number;
  varName: string;
}

/**
 * Find process.env variables used in checksum.config.ts that are not defined
 * in the .env file.
 *
 * Boolean-coerced env vars (!!process.env.CI) are intentionally excluded.
 */
export function findEnvVarsNotInDotenv(
  content: string,
  fileName: string,
  dotenvVars: Set<string>
): EnvVarNotInDotenvIssue[] {
  const sourceFile = createProject(content, fileName);
  const issues: EnvVarNotInDotenvIssue[] = [];
  const seenVars = new Set<string>();

  sourceFile.forEachDescendant(node => {
    if (Node.isPropertyAccessExpression(node)) {
      const text = node.getText();
      const envMatch = text.match(/^process\.env\.(\w+)$/);
      if (!envMatch) return;

      const varName = envMatch[1];

      // Only report each missing var once (first occurrence)
      if (seenVars.has(varName)) return;
      seenVars.add(varName);

      // Skip boolean-coerced: !!process.env.X
      const parent = node.getParent();
      if (parent && Node.isPrefixUnaryExpression(parent) &&
          parent.getOperatorToken() === SyntaxKind.ExclamationToken) {
        const grandparent = parent.getParent();
        if (grandparent && Node.isPrefixUnaryExpression(grandparent) &&
            grandparent.getOperatorToken() === SyntaxKind.ExclamationToken) {
          return;
        }
      }

      if (!dotenvVars.has(varName)) {
        issues.push({
          line: node.getStartLineNumber(),
          varName,
        });
      }
    }
  });

  return issues;
}
