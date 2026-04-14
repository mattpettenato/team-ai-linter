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

interface TsConfigPaths {
  [alias: string]: string[];
}

interface TsConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: TsConfigPaths;
  };
  extends?: string;
}

/**
 * Path resolver that handles TypeScript path aliases and relative imports
 */
export class PathResolver {
  private baseUrl: string;
  private pathMappings: Map<string, string[]> = new Map();
  private workspaceRoot: string;
  /** Directories we've already checked for tsconfig.json */
  private checkedDirs: Set<string> = new Set();
  /** The tsconfig.json path that was loaded, if any */
  private loadedTsConfigPath: string | null = null;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.baseUrl = workspaceRoot;
    this.loadTsConfig();
  }

  /**
   * Load and parse tsconfig.json for path mappings (from workspace root)
   */
  private loadTsConfig(): void {
    const tsconfigPath = path.join(this.workspaceRoot, 'tsconfig.json');
    this.checkedDirs.add(this.workspaceRoot);

    if (!fs.existsSync(tsconfigPath))
      return;


    try {
      const config = this.readTsConfig(tsconfigPath);
      this.processConfig(config, path.dirname(tsconfigPath));
      this.loadedTsConfigPath = tsconfigPath;
    } catch (error) {
      console.warn('Failed to parse tsconfig.json:', error);
    }
  }

  /**
   * Find the nearest tsconfig.json by walking up from the given directory
   * @returns The path to tsconfig.json or null if not found
   */
  private findNearestTsConfig(startDir: string): string | null {
    let currentDir = startDir;

    while (currentDir.length >= this.workspaceRoot.length) {
      // Skip directories we've already checked
      if (!this.checkedDirs.has(currentDir)) {
        this.checkedDirs.add(currentDir);

        const tsconfigPath = path.join(currentDir, 'tsconfig.json');
        if (fs.existsSync(tsconfigPath))
          return tsconfigPath;

      }

      // Move to parent directory
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root
        break;
      }
      currentDir = parentDir;
    }

    return null;
  }

  /**
   * Try to load tsconfig.json from a file's directory context
   * This is called when path alias resolution fails
   */
  private tryLoadTsConfigFromFileContext(fromFile: string): boolean {
    // If we've already loaded a tsconfig, don't replace it
    if (this.loadedTsConfigPath)
      return false;


    const fileDir = path.dirname(fromFile);
    const tsconfigPath = this.findNearestTsConfig(fileDir);

    if (!tsconfigPath)
      return false;


    try {
      const config = this.readTsConfig(tsconfigPath);
      this.processConfig(config, path.dirname(tsconfigPath));
      this.loadedTsConfigPath = tsconfigPath;
      console.log(`[PathResolver] Loaded tsconfig.json from: ${tsconfigPath}`);
      return true;
    } catch (error) {
      console.warn(`Failed to parse tsconfig.json at ${tsconfigPath}:`, error);
      return false;
    }
  }

  /**
   * Read and parse a tsconfig.json file, handling extends
   */
  private readTsConfig(configPath: string): TsConfig {
    const content = fs.readFileSync(configPath, 'utf-8');
    // Remove comments from JSON (TypeScript allows comments in tsconfig)
    // This regex is careful to not match /* or // inside strings
    const jsonContent = this.stripJsonComments(content);
    const config: TsConfig = JSON.parse(jsonContent);

    // Handle extends
    if (config.extends) {
      const basePath = path.dirname(configPath);
      const extendsPath = path.resolve(basePath, config.extends);

      if (fs.existsSync(extendsPath)) {
        const parentConfig = this.readTsConfig(extendsPath);
        // Merge configs (child overrides parent)
        return {
          ...parentConfig,
          ...config,
          compilerOptions: {
            ...parentConfig.compilerOptions,
            ...config.compilerOptions,
          }
        };
      }
    }

    return config;
  }

  /**
   * Process the tsconfig and extract path mappings
   * @param config The parsed tsconfig object
   * @param tsconfigDir The directory containing the tsconfig.json (for resolving baseUrl)
   */
  private processConfig(config: TsConfig, tsconfigDir: string): void {
    if (config.compilerOptions?.baseUrl) {
      this.baseUrl = path.resolve(tsconfigDir, config.compilerOptions.baseUrl);
    } else {
      // Default baseUrl to tsconfig directory if not specified
      this.baseUrl = tsconfigDir;
    }

    if (config.compilerOptions?.paths) {
      for (const [alias, targets] of Object.entries(config.compilerOptions.paths))
        this.pathMappings.set(alias, targets);

    }
  }

  /**
   * Check whether a module specifier matches any tsconfig path alias pattern,
   * regardless of whether the resolved file exists on disk. Used to distinguish
   * "this is a path-aliased local import" from "this is an npm package import".
   */
  matchesAnyPathAlias(moduleSpecifier: string, fromFile: string): boolean {
    if (this.pathMappings.size === 0 && !this.loadedTsConfigPath)
      this.tryLoadTsConfigFromFileContext(fromFile);

    for (const pattern of this.pathMappings.keys()) {
      if (this.matchPattern(moduleSpecifier, pattern) !== null)
        return true;
    }
    return false;
  }

  /**
   * Resolve an import specifier to an absolute file path
   * Returns null if the file doesn't exist or can't be resolved
   */
  resolveImport(moduleSpecifier: string, fromFile: string): string | null {
    // Handle relative imports
    if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/'))
      return this.resolveRelativeImport(moduleSpecifier, fromFile);


    // Handle path alias imports
    let resolved = this.resolvePathAliasImport(moduleSpecifier);

    // If resolution failed and we haven't loaded a tsconfig yet,
    // try to find one by walking up from the file being imported from
    if (resolved === null && !this.loadedTsConfigPath) {
      const loadedNew = this.tryLoadTsConfigFromFileContext(fromFile);
      if (loadedNew) {
        // Retry resolution with newly loaded path mappings
        resolved = this.resolvePathAliasImport(moduleSpecifier);
      }
    }

    return resolved;
  }

  /**
   * Resolve a relative import (./foo, ../bar)
   */
  private resolveRelativeImport(moduleSpecifier: string, fromFile: string): string | null {
    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, moduleSpecifier);
    return this.resolveWithExtensions(resolved);
  }

  /**
   * Resolve a path alias import (@checksum/utils/foo)
   */
  private resolvePathAliasImport(moduleSpecifier: string): string | null {
    // Try each path mapping
    for (const [pattern, targets] of this.pathMappings) {
      const match = this.matchPattern(moduleSpecifier, pattern);

      if (match !== null) {
        // Try each target path
        for (const target of targets) {
          const resolvedTarget = target.replace('*', match);
          const fullPath = path.resolve(this.baseUrl, resolvedTarget);
          const resolved = this.resolveWithExtensions(fullPath);

          if (resolved)
            return resolved;

        }
      }
    }

    return null;
  }

  /**
   * Match a module specifier against a path pattern
   * Returns the wildcard match or null if no match
   */
  private matchPattern(moduleSpecifier: string, pattern: string): string | null {
    // Exact match (no wildcard)
    if (!pattern.includes('*'))
      return moduleSpecifier === pattern ? '' : null;


    // Pattern with wildcard (e.g., @checksum/utils/*)
    const [prefix, suffix] = pattern.split('*');

    if (!moduleSpecifier.startsWith(prefix))
      return null;


    if (suffix && !moduleSpecifier.endsWith(suffix))
      return null;


    // Extract the wildcard match
    const matchStart = prefix.length;
    const matchEnd = suffix ? moduleSpecifier.length - suffix.length : moduleSpecifier.length;

    return moduleSpecifier.substring(matchStart, matchEnd);
  }

  /**
   * Try to resolve a path with various extensions
   */
  private resolveWithExtensions(filePath: string): string | null {
    // Try exact path first
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile())
      return filePath;


    // Try with extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
    for (const ext of extensions) {
      const withExt = filePath + ext;
      if (fs.existsSync(withExt) && fs.statSync(withExt).isFile())
        return withExt;

    }

    // Try as directory with index file
    const indexFiles = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];
    for (const indexFile of indexFiles) {
      const indexPath = path.join(filePath, indexFile);
      if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile())
        return indexPath;

    }

    return null;
  }

  /**
   * Check if a resolved path has a case mismatch with the actual file on disk.
   * On macOS (case-insensitive), fs.existsSync("Report/foo.ts") returns true even
   * when the real directory is "report/". This catches those mismatches that would
   * break on case-sensitive filesystems (Linux/CI).
   * Returns the real path if there's a mismatch, or null if the case matches.
   */
  checkCaseMismatch(resolvedPath: string): string | null {
    try {
      const realPath = fs.realpathSync(resolvedPath);
      if (realPath !== resolvedPath) {
        return realPath;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Strip comments from JSON content while preserving strings
   * Handles line comments and block comments without corrupting strings
   */
  private stripJsonComments(content: string): string {
    let result = '';
    let i = 0;
    let inString = false;
    let stringChar = '';

    while (i < content.length) {
      const char = content[i];
      const nextChar = content[i + 1];

      // Handle string boundaries
      if ((char === '"' || char === "'") && (i === 0 || content[i - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        result += char;
        i++;
        continue;
      }

      // Inside a string, just copy everything
      if (inString) {
        result += char;
        i++;
        continue;
      }

      // Check for line comment
      if (char === '/' && nextChar === '/') {
        // Skip until end of line
        while (i < content.length && content[i] !== '\n')
          i++;

        continue;
      }

      // Check for block comment
      if (char === '/' && nextChar === '*') {
        i += 2; // Skip /*
        // Skip until */
        while (i < content.length - 1) {
          if (content[i] === '*' && content[i + 1] === '/') {
            i += 2; // Skip */
            break;
          }
          i++;
        }
        continue;
      }

      // Regular character
      result += char;
      i++;
    }

    return result;
  }
}
