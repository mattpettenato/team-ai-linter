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

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface DependencyValidation {
  packageName: string;
  isDeclared: boolean;
  declaredIn?: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies';
  packageJsonPath?: string;
}

/**
 * Service for validating package.json dependencies
 */
/**
 * Set of Node.js built-in modules that don't need to be in package.json
 */
const NODE_BUILTIN_MODULES = new Set([
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'timers/promises',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
]);

/**
 * Service for validating package.json dependencies
 */
export class PackageJsonService {
  private cache: Map<string, PackageJson> = new Map();

  /**
   * Check if a module name is a Node.js built-in module
   */
  isNodeBuiltinModule(moduleName: string): boolean {
    // Handle node: prefix (e.g., 'node:fs')
    const name = moduleName.startsWith('node:') ? moduleName.slice(5) : moduleName;
    return NODE_BUILTIN_MODULES.has(name);
  }

  /**
   * Find the nearest package.json by traversing up from a file
   */
  findNearestPackageJson(fromFile: string): string | null {
    let currentDir = path.dirname(fromFile);

    while (currentDir !== path.dirname(currentDir)) {
      const pkgPath = path.join(currentDir, 'package.json');
      if (fs.existsSync(pkgPath))
        return pkgPath;

      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  /**
   * Load and parse a package.json file
   */
  private loadPackageJson(pkgPath: string): PackageJson | null {
    // Check cache first
    if (this.cache.has(pkgPath))
      return this.cache.get(pkgPath)!;


    try {
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content) as PackageJson;
      this.cache.set(pkgPath, pkg);
      return pkg;
    } catch (error) {
      console.warn(`Failed to parse package.json at ${pkgPath}:`, error);
      return null;
    }
  }

  /**
   * Check if a package is declared in the nearest package.json
   */
  validateDependency(packageName: string, fromFile: string): DependencyValidation {
    const pkgPath = this.findNearestPackageJson(fromFile);

    if (!pkgPath) {
      return {
        packageName,
        isDeclared: false,
      };
    }

    const pkg = this.loadPackageJson(pkgPath);

    if (!pkg) {
      return {
        packageName,
        isDeclared: false,
        packageJsonPath: pkgPath,
      };
    }

    // Check all dependency fields
    const dependencyFields: Array<{
      field: keyof Pick<PackageJson, 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'>;
      name: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies';
    }> = [
      { field: 'dependencies', name: 'dependencies' },
      { field: 'devDependencies', name: 'devDependencies' },
      { field: 'peerDependencies', name: 'peerDependencies' },
      { field: 'optionalDependencies', name: 'optionalDependencies' },
    ];

    for (const { field, name } of dependencyFields) {
      const deps = pkg[field];
      if (deps && packageName in deps) {
        return {
          packageName,
          isDeclared: true,
          declaredIn: name,
          packageJsonPath: pkgPath,
        };
      }
    }

    return {
      packageName,
      isDeclared: false,
      packageJsonPath: pkgPath,
    };
  }

  /**
   * Validate multiple dependencies at once
   */
  validateDependencies(packageNames: string[], fromFile: string): Map<string, DependencyValidation> {
    const results = new Map<string, DependencyValidation>();

    for (const packageName of packageNames)
      results.set(packageName, this.validateDependency(packageName, fromFile));


    return results;
  }

  /**
   * Get all dependencies from the nearest package.json
   */
  getAllDependencies(fromFile: string): Set<string> {
    const pkgPath = this.findNearestPackageJson(fromFile);

    if (!pkgPath)
      return new Set();


    const pkg = this.loadPackageJson(pkgPath);

    if (!pkg)
      return new Set();


    const allDeps = new Set<string>();

    const addDeps = (deps?: Record<string, string>) => {
      if (deps) {
        for (const name of Object.keys(deps))
          allDeps.add(name);

      }
    };

    addDeps(pkg.dependencies);
    addDeps(pkg.devDependencies);
    addDeps(pkg.peerDependencies);
    addDeps(pkg.optionalDependencies);

    return allDeps;
  }

  /**
   * Check if a package is installed in any node_modules directory walking up
   * from the given file. This catches transitive dependencies that are not
   * declared directly in package.json but are still resolvable at runtime
   * because a parent dependency pulls them in.
   */
  isInstalledInNodeModules(packageName: string, fromFile: string): boolean {
    let currentDir = path.dirname(fromFile);

    while (true) {
      const candidate = path.join(currentDir, 'node_modules', packageName, 'package.json');
      if (fs.existsSync(candidate))
        return true;

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir)
        return false;
      currentDir = parentDir;
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
