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

import { Project, SourceFile, ImportDeclaration } from 'ts-morph';

export interface ParsedImport {
  /** The import specifier (e.g., './utils', '@checksum/utils/helper', 'lodash') */
  moduleSpecifier: string;
  /** Whether this is a relative import (starts with . or ..) */
  isRelative: boolean;
  /** Whether this is a path alias import (starts with @) */
  isPathAlias: boolean;
  /** Whether this is a package import (from node_modules) */
  isPackage: boolean;
  /** Line number where the import declaration starts */
  line: number;
  /** End line number of the import declaration */
  endLine: number;
  /** Named imports (e.g., ['foo', 'bar'] from 'import { foo, bar } from ...') */
  namedImports: string[];
  /** Default import name if present */
  defaultImport?: string;
  /** Namespace import name if present (e.g., 'utils' from 'import * as utils from ...') */
  namespaceImport?: string;
}

/**
 * Parse all imports from a TypeScript/JavaScript file
 */
export function parseImports(filePath: string): ParsedImport[] {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
    }
  });

  const sourceFile = project.addSourceFileAtPath(filePath);
  return parseImportsFromSourceFile(sourceFile);
}

/**
 * Parse all imports from a source file content string
 */
export function parseImportsFromContent(content: string, fileName: string = 'temp.ts'): ParsedImport[] {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
    }
  });

  const ext = fileName.endsWith('.js') ? '.js' : '.ts';
  const tempFileName = `temp_${Date.now()}${ext}`;

  const sourceFile = project.createSourceFile(tempFileName, content);
  return parseImportsFromSourceFile(sourceFile);
}

function parseImportsFromSourceFile(sourceFile: SourceFile): ParsedImport[] {
  const importDeclarations = sourceFile.getImportDeclarations();
  return importDeclarations.map(imp => parseImportDeclaration(imp));
}

function parseImportDeclaration(imp: ImportDeclaration): ParsedImport {
  const moduleSpecifier = imp.getModuleSpecifierValue();
  const line = imp.getStartLineNumber();
  const endLine = imp.getEndLineNumber();

  // Determine import type
  const isRelative = moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/');
  const isPathAlias = !isRelative && moduleSpecifier.startsWith('@') && !moduleSpecifier.startsWith('@types/');
  const isPackage = !isRelative && !isPathAlias;

  // Extract import details
  const namedImports: string[] = [];
  let defaultImport: string | undefined;
  let namespaceImport: string | undefined;

  // Get default import
  const defaultImportNode = imp.getDefaultImport();
  if (defaultImportNode)
    defaultImport = defaultImportNode.getText();


  // Get namespace import
  const namespaceImportNode = imp.getNamespaceImport();
  if (namespaceImportNode)
    namespaceImport = namespaceImportNode.getText();


  // Get named imports
  const namedImportsNodes = imp.getNamedImports();
  for (const namedImport of namedImportsNodes)
    namedImports.push(namedImport.getName());


  return {
    moduleSpecifier,
    isRelative,
    isPathAlias,
    isPackage,
    line,
    endLine,
    namedImports,
    defaultImport,
    namespaceImport,
  };
}

/**
 * Filter imports to only local imports (relative + path aliases).
 * These are the imports that need git safety checking.
 */
export function getLocalImports(imports: ParsedImport[]): ParsedImport[] {
  return imports.filter(imp => imp.isRelative || imp.isPathAlias);
}

/**
 * Filter imports to only package imports.
 * These need package.json validation.
 */
export function getPackageImports(imports: ParsedImport[]): ParsedImport[] {
  return imports.filter(imp => imp.isPackage);
}

/**
 * Get the base package name from a module specifier.
 * e.g., '@anthropic-ai/sdk' -> '@anthropic-ai/sdk'
 *       'lodash/fp' -> 'lodash'
 *       '@types/node' -> '@types/node'
 */
export function getBasePackageName(moduleSpecifier: string): string {
  if (moduleSpecifier.startsWith('@')) {
    // Scoped package: @scope/package or @scope/package/subpath
    const parts = moduleSpecifier.split('/');
    if (parts.length >= 2)
      return `${parts[0]}/${parts[1]}`;

    return moduleSpecifier;
  }

  // Regular package: package or package/subpath
  const parts = moduleSpecifier.split('/');
  return parts[0];
}

// Re-export AST detection functions for backward compatibility
export {
  findUnusedImports,
  findUnusedParameters,
  validateBugAnnotations,
  findConstDeclarationsInTests,
  findExpectsInsideChecksumAI,
  UnusedImportIssue,
  UnusedParameterIssue,
  BugAnnotationIssue,
  ConstDeclarationIssue,
  ExpectInsideChecksumAIIssue,
} from './detection/astDetector';
