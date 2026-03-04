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
import * as fs from 'fs';
import * as path from 'path';
import { PathResolver } from './pathResolver';
import { AnthropicService } from './anthropicService';
import { parseImportsFromContent, getLocalImports } from './importParser';
import {
  ImportedFileIssue,
  LintWithImportsResult,
  UnresolvedImport
} from '../types';

// Re-export types for backward compatibility
export type { ImportedFileIssue, LintWithImportsResult } from '../types';

/**
 * Service for recursively linting imported files
 */
export class ImportedFileLinter {
  private pathResolver: PathResolver;
  private anthropicService: AnthropicService;
  private lintedFiles: Set<string> = new Set();
  private unresolvedImports: UnresolvedImport[] = [];

  constructor(workspaceRoot: string, anthropicService: AnthropicService) {
    this.pathResolver = new PathResolver(workspaceRoot);
    this.anthropicService = anthropicService;
  }

  /**
   * Lint a file and all its local imports (recursively up to maxDepth)
   */
  async lintWithImports(
    filePath: string,
    fileContent: string,
    rules: string,
    maxDepth: number = 2,
    minConfidence: number = 0.5
  ): Promise<LintWithImportsResult> {
    // Clear the set of linted files for each top-level lint operation
    this.lintedFiles.clear();
    this.unresolvedImports = [];
    this.lintedFiles.add(path.resolve(filePath));

    console.log(`[ImportedFileLinter] Starting lint for: ${filePath}`);
    console.log(`[ImportedFileLinter] Max depth: ${maxDepth}, Min confidence: ${minConfidence}`);

    // Lint the main file
    const mainIssues = await this.anthropicService.lintTestFile(fileContent, filePath, rules, minConfidence);
    console.log(`[ImportedFileLinter] Found ${mainIssues.length} issues in main file`);

    // Find and lint imported files
    const importedIssues: ImportedFileIssue[] = [];

    if (maxDepth > 0) {
      try {
        const imports = parseImportsFromContent(fileContent, filePath);
        const localImports = getLocalImports(imports);

        console.log(`[ImportedFileLinter] Found ${imports.length} total imports, ${localImports.length} local imports`);
        if (localImports.length > 0)
          console.log(`[ImportedFileLinter] Local imports:`, localImports.map(i => i.moduleSpecifier));


        for (const imp of localImports) {
          console.log(`[ImportedFileLinter] Resolving import: "${imp.moduleSpecifier}" from ${path.basename(filePath)}`);
          const resolvedPath = this.pathResolver.resolveImport(imp.moduleSpecifier, filePath);

          if (!resolvedPath) {
            // Track unresolved imports for reporting
            console.log(`[ImportedFileLinter] ❌ Could not resolve: "${imp.moduleSpecifier}"`);
            this.unresolvedImports.push({
              moduleSpecifier: imp.moduleSpecifier,
              line: imp.line,
              fromFile: filePath
            });
            continue;
          }

          console.log(`[ImportedFileLinter] ✓ Resolved to: ${resolvedPath}`);

          const absolutePath = path.resolve(resolvedPath);
          if (this.lintedFiles.has(absolutePath)) {
            console.log(`[ImportedFileLinter] Skipping (already linted): ${path.basename(absolutePath)}`);
            continue;
          }

          const issues = await this.lintImportedFile(
              absolutePath,
              filePath,
              imp.line,
              rules,
              maxDepth - 1,
              minConfidence
          );

          console.log(`[ImportedFileLinter] Found ${issues.length} issues in ${path.basename(absolutePath)}`);
          importedIssues.push(...issues);
        }
      } catch (error) {
        console.error('[ImportedFileLinter] Failed to parse imports for recursive linting:', error);
      }
    }

    console.log(`[ImportedFileLinter] Summary: ${mainIssues.length} main issues, ${importedIssues.length} imported issues, ${this.unresolvedImports.length} unresolved`);

    return {
      mainIssues,
      importedIssues,
      unresolvedImports: this.unresolvedImports,
      lintedFiles: this.getLintedFiles()
    };
  }

  /**
   * Lint an imported file and recursively lint its imports
   */
  private async lintImportedFile(
    importedFilePath: string,
    sourceFile: string,
    importLine: number,
    rules: string,
    remainingDepth: number,
    minConfidence: number
  ): Promise<ImportedFileIssue[]> {
    console.log(`[ImportedFileLinter] >>> lintImportedFile called for: ${importedFilePath}`);

    // Avoid circular imports and already-linted files
    const absolutePath = path.resolve(importedFilePath);
    if (this.lintedFiles.has(absolutePath)) {
      console.log(`[ImportedFileLinter] Already linted, skipping: ${importedFilePath}`);
      return [];
    }
    this.lintedFiles.add(absolutePath);

    // Check file exists and is readable
    if (!fs.existsSync(importedFilePath)) {
      console.log(`[ImportedFileLinter] ❌ File does not exist: ${importedFilePath}`);
      return [];
    }

    try {
      const content = fs.readFileSync(importedFilePath, 'utf-8');
      console.log(`[ImportedFileLinter] Read file: ${path.basename(importedFilePath)} (${content.length} bytes)`);
      console.log(`[ImportedFileLinter] Calling anthropicService.lintTestFile for: ${path.basename(importedFilePath)}`);

      const issues = await this.anthropicService.lintTestFile(content, importedFilePath, rules, minConfidence);
      console.log(`[ImportedFileLinter] anthropicService returned ${issues.length} issues for ${path.basename(importedFilePath)}`);

      if (issues.length > 0)
        console.log(`[ImportedFileLinter] Issues found:`, issues.map(i => `Line ${i.line}: [${i.rule}] ${i.message}`));


      // Convert to ImportedFileIssue
      const importedIssues: ImportedFileIssue[] = issues.map(issue => ({
        ...issue,
        sourceFile,
        importedFile: importedFilePath,
        importLine,
        // Prefix message with file context for clarity
        message: `[${path.basename(importedFilePath)}] ${issue.message}`
      }));

      // Recursively lint this file's imports
      if (remainingDepth > 0) {
        console.log(`[ImportedFileLinter] Checking nested imports for ${path.basename(importedFilePath)} (depth remaining: ${remainingDepth})`);
        try {
          const nestedImports = parseImportsFromContent(content, importedFilePath);
          const localNestedImports = getLocalImports(nestedImports);
          console.log(`[ImportedFileLinter] Found ${localNestedImports.length} local nested imports`);

          for (const imp of localNestedImports) {
            console.log(`[ImportedFileLinter] Resolving nested import: "${imp.moduleSpecifier}"`);
            const resolvedPath = this.pathResolver.resolveImport(
                imp.moduleSpecifier,
                importedFilePath
            );

            if (!resolvedPath) {
              // Track unresolved imports from nested files too
              console.log(`[ImportedFileLinter] ❌ Could not resolve nested import: "${imp.moduleSpecifier}"`);
              this.unresolvedImports.push({
                moduleSpecifier: imp.moduleSpecifier,
                line: imp.line,
                fromFile: importedFilePath
              });
              continue;
            }

            console.log(`[ImportedFileLinter] ✓ Resolved nested import to: ${resolvedPath}`);

            const nestedAbsolutePath = path.resolve(resolvedPath);
            if (this.lintedFiles.has(nestedAbsolutePath)) {
              console.log(`[ImportedFileLinter] Nested file already linted, skipping`);
              continue;
            }

            const nestedIssues = await this.lintImportedFile(
                nestedAbsolutePath,
                sourceFile,
                importLine,
                rules,
                remainingDepth - 1,
                minConfidence
            );
            importedIssues.push(...nestedIssues);
          }
        } catch (error) {
          console.error(`[ImportedFileLinter] Failed to parse imports for ${importedFilePath}:`, error);
        }
      }

      console.log(`[ImportedFileLinter] <<< Returning ${importedIssues.length} total issues from ${path.basename(importedFilePath)}`);
      return importedIssues;
    } catch (error) {
      console.error(`[ImportedFileLinter] Failed to lint imported file ${importedFilePath}:`, error);
      return [];
    }
  }

  /**
   * Get the list of files that were linted
   */
  getLintedFiles(): string[] {
    return Array.from(this.lintedFiles);
  }
}
