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

import { GitIssue } from '../../types';
import { ParsedImport, parseImportsFromContent, getBasePackageName } from '../importParser';
import { PathResolver } from '../pathResolver';
import { GitService } from '../gitService';
import { PackageJsonService } from '../packageJsonService';

/**
 * Service for checking git safety of imports.
 * Validates that imported files are tracked by git and packages are declared.
 */
export class GitSafetyChecker {
  private pathResolver: PathResolver;
  private gitService: GitService;
  private packageJsonService: PackageJsonService;

  constructor(workspaceRoot: string) {
    this.pathResolver = new PathResolver(workspaceRoot);
    this.gitService = new GitService(workspaceRoot);
    this.packageJsonService = new PackageJsonService();
  }

  /**
   * Check all imports in a file for git safety issues.
   */
  async checkImports(fileContent: string, filePath: string): Promise<GitIssue[]> {
    const issues: GitIssue[] = [];
    const imports = parseImportsFromContent(fileContent, filePath);

    for (const imp of imports) {
      const importIssues = await this.checkImport(imp, filePath);
      issues.push(...importIssues);
    }

    return issues;
  }

  /**
   * Check a single import for git safety issues.
   */
  private async checkImport(imp: ParsedImport, filePath: string): Promise<GitIssue[]> {
    const moduleSpecifier = imp.moduleSpecifier;

    // Skip type-only imports from @types/*
    if (moduleSpecifier.startsWith('@types/'))
      return [];


    // For relative imports (./foo, ../bar), always resolve as local file
    if (imp.isRelative)
      return this.checkRelativeImport(imp, filePath);


    // For @-prefixed imports, try to resolve via tsconfig paths first
    if (moduleSpecifier.startsWith('@'))
      return this.checkScopedImport(imp, filePath);


    // For non-@ prefixed, non-relative imports (e.g., 'lodash', 'react')
    return this.checkPackageImport(imp, filePath);
  }

  /**
   * Check a relative import (./foo, ../bar).
   */
  private async checkRelativeImport(imp: ParsedImport, filePath: string): Promise<GitIssue[]> {
    const resolvedPath = this.pathResolver.resolveImport(imp.moduleSpecifier, filePath);

    if (!resolvedPath) {
      return [{
        importLine: imp.line,
        moduleSpecifier: imp.moduleSpecifier,
        message: `Cannot resolve import "${imp.moduleSpecifier}" — file does not exist. Create the file or fix the import path.`,
        severity: 'error',
        isMissing: true,
      }];
    }

    const gitIssue = await this.checkLocalFileGitStatus(imp, resolvedPath);
    return gitIssue ? [gitIssue] : [];
  }

  /**
   * Check a scoped import (@scope/package).
   * First tries tsconfig path resolution, falls back to package.json check.
   */
  private async checkScopedImport(imp: ParsedImport, filePath: string): Promise<GitIssue[]> {
    const resolvedPath = this.pathResolver.resolveImport(imp.moduleSpecifier, filePath);

    if (resolvedPath) {
      // Successfully resolved via tsconfig paths - treat as local file
      const gitIssue = await this.checkLocalFileGitStatus(imp, resolvedPath);
      return gitIssue ? [gitIssue] : [];
    }

    // Path resolution failed. If the specifier matches a tsconfig alias pattern,
    // it's a local import with a missing file — not an npm package.
    if (this.pathResolver.matchesAnyPathAlias(imp.moduleSpecifier, filePath)) {
      return [{
        importLine: imp.line,
        moduleSpecifier: imp.moduleSpecifier,
        message: `Cannot resolve import "${imp.moduleSpecifier}" — matches a tsconfig path alias but no file exists at the resolved location.`,
        severity: 'error',
        isMissing: true,
      }];
    }

    // Could not resolve via tsconfig - treat as npm package
    return this.checkPackageImport(imp, filePath);
  }

  /**
   * Check a package import against package.json.
   */
  private checkPackageImport(imp: ParsedImport, filePath: string): GitIssue[] {
    const baseName = getBasePackageName(imp.moduleSpecifier);

    // Skip Node.js built-in modules
    if (this.packageJsonService.isNodeBuiltinModule(baseName))
      return [];

    // Skip if installed in node_modules anywhere up the tree.
    // This covers transitive dependencies (e.g. @checksum-ai/runtime is a
    // subdep of checksumai) without requiring the package to be declared
    // directly in package.json.
    if (this.packageJsonService.isInstalledInNodeModules(baseName, filePath))
      return [];

    const validation = this.packageJsonService.validateDependency(baseName, filePath);

    // No package.json found anywhere up the tree — we have no project context
    // to validate against. Skip rather than emit a noisy false positive (e.g.
    // for scratch files in /tmp).
    if (!validation.packageJsonPath)
      return [];

    if (!validation.isDeclared) {
      return [{
        importLine: imp.line,
        moduleSpecifier: imp.moduleSpecifier,
        message: `Package "${baseName}" is not declared in package.json and is not installed in node_modules - will fail on clean install`,
        severity: 'error',
      }];
    }

    return [];
  }

  /**
   * Check git status for a local file and return an issue if there's a problem.
   */
  private async checkLocalFileGitStatus(
    imp: ParsedImport,
    resolvedPath: string
  ): Promise<GitIssue | null> {
    const gitStatus = await this.gitService.getFileStatus(resolvedPath);

    if (!gitStatus.exists) {
      return {
        importLine: imp.line,
        moduleSpecifier: imp.moduleSpecifier,
        message: `Import "${imp.moduleSpecifier}" resolves to non-existent file: ${resolvedPath}. Create the file or fix the import path.`,
        severity: 'error',
        isMissing: true,
      };
    }

    // Check for case mismatches that pass on macOS but fail on Linux
    const realPath = this.pathResolver.checkCaseMismatch(resolvedPath);
    if (realPath) {
      return {
        importLine: imp.line,
        moduleSpecifier: imp.moduleSpecifier,
        message: `Import path case mismatch — will fail on Linux/CI (case-sensitive). Import resolves to "${resolvedPath}" but actual path on disk is "${realPath}". Fix the import or rename the file/directory.`,
        severity: 'error',
        resolvedFilePath: realPath,
        isCaseMismatch: true,
      };
    }

    if (!gitStatus.isTracked && !gitStatus.isStaged) {
      return {
        importLine: imp.line,
        moduleSpecifier: imp.moduleSpecifier,
        message: `Import "${imp.moduleSpecifier}" is NOT tracked by git and not staged — run: git add ${resolvedPath}`,
        severity: 'error',
        resolvedFilePath: resolvedPath,
        isUnstaged: true,
      };
    }

    if (gitStatus.isModified && !gitStatus.isStaged) {
      // Don't flag if the only change is the linter's own "Last linted" timestamp
      const isOnlyTimestamp = await this.gitService.isOnlyLintTimestampDiff(resolvedPath)
      if (isOnlyTimestamp) return null

      return {
        importLine: imp.line,
        moduleSpecifier: imp.moduleSpecifier,
        message: `Import "${imp.moduleSpecifier}" has unstaged changes that will NOT be included in your commit — run: git add ${resolvedPath}`,
        severity: 'error',
        resolvedFilePath: resolvedPath,
        isUnstaged: true,
      };
    }

    return null;
  }
}
