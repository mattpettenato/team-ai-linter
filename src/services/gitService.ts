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
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface GitFileStatus {
  /** File path */
  filePath: string;
  /** Whether the file exists on disk */
  exists: boolean;
  /** Whether the file is tracked by git */
  isTracked: boolean;
  /** Whether the file has uncommitted modifications */
  isModified: boolean;
  /** Whether the file is staged for commit */
  isStaged: boolean;
  /** Whether the file is untracked (new file not added to git) */
  isUntracked: boolean;
}

/**
 * Git service for checking file status
 */
export class GitService {
  private gitRoot: string | null = null;

  constructor(private workspaceRoot: string) {
    this.findGitRoot();
  }

  /**
   * Find the git repository root
   */
  private findGitRoot(): void {
    let currentDir = this.workspaceRoot;

    while (currentDir !== path.dirname(currentDir)) {
      const gitDir = path.join(currentDir, '.git');
      if (fs.existsSync(gitDir)) {
        this.gitRoot = currentDir;
        return;
      }
      currentDir = path.dirname(currentDir);
    }

    this.gitRoot = null;
  }

  /**
   * Get the git root directory
   */
  getGitRoot(): string | null {
    return this.gitRoot;
  }

  /**
   * Check the git status of a file
   */
  async getFileStatus(filePath: string): Promise<GitFileStatus> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.workspaceRoot, filePath);

    const exists = fs.existsSync(absolutePath);

    const [isTracked, gitStatus] = await Promise.all([
      this.isFileTracked(absolutePath),
      this.getGitStatusOutput(absolutePath),
    ]);

    // Parse git status output
    // First column is index status, second is worktree status
    // ' ' = unmodified, 'M' = modified, 'A' = added, 'D' = deleted, '?' = untracked
    const isModified = gitStatus.includes(' M') || gitStatus.includes('MM');
    const isStaged = gitStatus.startsWith('M') || gitStatus.startsWith('A');
    const isUntracked = gitStatus.startsWith('??');

    return {
      filePath: absolutePath,
      exists,
      isTracked,
      isModified,
      isStaged,
      isUntracked,
    };
  }

  /**
   * Check if a file is tracked by git
   */
  private async isFileTracked(filePath: string): Promise<boolean> {
    try {
      await execAsync(`git ls-files --error-unmatch "${filePath}"`, {
        cwd: path.dirname(filePath),
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get the git status output for a file
   */
  private async getGitStatusOutput(filePath: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git status --porcelain "${filePath}"`, {
        cwd: path.dirname(filePath),
      })
      // Only trim trailing whitespace — the leading characters are status codes
      // e.g., " M path/file" means modified in worktree (not staged)
      //        "M  path/file" means modified in index (staged)
      return stdout.trimEnd()
    } catch {
      return ''
    }
  }

  /**
   * Check if the only unstaged change in a file is the "Last linted" timestamp
   */
  async isOnlyLintTimestampDiff(filePath: string): Promise<boolean> {
    try {
      const cwd = path.dirname(filePath)
      const { stdout } = await execAsync(`git diff -- "${filePath}"`, { cwd })
      if (!stdout.trim()) return false

      // Extract only added/removed content lines (not diff headers)
      const contentLines = stdout.split('\n').filter(
        line => (line.startsWith('+') || line.startsWith('-')) &&
                !line.startsWith('+++') && !line.startsWith('---')
      )

      // Check if every changed line is a "Last linted" comment (or empty)
      return contentLines.length > 0 && contentLines.every(
        line => /^[+-]\s*\/\/\s*Last linted:/.test(line) || /^[+-]\s*$/.test(line)
      )
    } catch {
      return false
    }
  }

  /**
   * Check multiple files at once (more efficient)
   */
  async getFilesStatus(filePaths: string[]): Promise<Map<string, GitFileStatus>> {
    const results = new Map<string, GitFileStatus>();

    // Check all files in parallel
    const statusPromises = filePaths.map(async filePath => {
      const status = await this.getFileStatus(filePath);
      return { filePath, status };
    });

    const statuses = await Promise.all(statusPromises);

    for (const { filePath, status } of statuses)
      results.set(filePath, status);


    return results;
  }

  /**
   * Check if git is available
   */
  async isGitAvailable(): Promise<boolean> {
    try {
      await execAsync('git --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get files that would cause issues on a clean checkout
   */
  filterProblematicFiles(statuses: GitFileStatus[]): GitFileStatus[] {
    return statuses.filter(status => {
      // File doesn't exist - definitely problematic
      if (!status.exists)
        return true;


      // File is not tracked by git - will be missing on clean checkout
      if (!status.isTracked && !status.isStaged)
        return true;


      // File has local modifications that aren't committed
      // This is a warning, not an error - the committed version will be used
      if (status.isModified && !status.isStaged)
        return true;


      return false;
    });
  }
}
