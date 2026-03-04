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
import * as vscode from 'vscode'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import { getExtensionVersion, compareSemver } from './versionService'

const REPO_OWNER = 'mattpettenato'
const REPO_NAME = 'team-ai-linter'
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours
const STARTUP_DELAY_MS = 30 * 1000 // 30 seconds

interface GitHubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: GitHubAsset[]
}

interface GitHubAsset {
  name: string
  url: string
  browser_download_url: string
}

/**
 * Automatic update checker for the Team AI Linter extension.
 * Checks GitHub Releases for new versions and prompts the user to install.
 */
export class AutoUpdater implements vscode.Disposable {
  private _startupTimer: ReturnType<typeof setTimeout> | undefined
  private _intervalTimer: ReturnType<typeof setInterval> | undefined
  private _checking = false

  constructor(
    private readonly _secrets: vscode.SecretStorage,
    private readonly _globalState: vscode.Memento,
    private readonly _globalStorageUri: vscode.Uri,
    private readonly _outputChannel: vscode.OutputChannel
  ) {}

  /**
   * Start the auto-update check schedule.
   * Waits 30s after startup, then checks every 4 hours.
   */
  start(): void {
    const config = vscode.workspace.getConfiguration('teamAiLinter')
    if (!config.get<boolean>('autoUpdate', true)) {
      this._log('Auto-update disabled by setting')
      return
    }

    this._startupTimer = setTimeout(() => {
      void this._checkForUpdate(false)
      this._intervalTimer = setInterval(() => {
        void this._checkForUpdate(false)
      }, CHECK_INTERVAL_MS)
    }, STARTUP_DELAY_MS)
  }

  /**
   * Manually trigger an update check. Shows "up to date" message if current.
   */
  async checkForUpdateManual(): Promise<void> {
    await this._checkForUpdate(true)
  }

  dispose(): void {
    if (this._startupTimer) clearTimeout(this._startupTimer)
    if (this._intervalTimer) clearInterval(this._intervalTimer)
  }

  private async _checkForUpdate(manual: boolean): Promise<void> {
    if (this._checking) {
      if (manual) vscode.window.showInformationMessage('Update check already in progress...')
      return
    }

    this._checking = true
    try {
      const token = await this._secrets.get('githubToken')
      if (!token) {
        if (manual) {
          const action = await vscode.window.showWarningMessage(
            'GitHub token not configured. Set it up to check for updates.',
            'Configure Token'
          )
          if (action === 'Configure Token')
            await vscode.commands.executeCommand('teamAiLinter.setupGithubToken')
        }
        this._log('No GitHub token configured')
        return
      }

      const currentVersion = getExtensionVersion()
      if (currentVersion === 'unknown') {
        this._log('Could not determine current version')
        return
      }

      this._log(`Current version: ${currentVersion}`)

      const releases = await this._fetchReleases(token)
      if (!releases || releases.length === 0) {
        if (manual) vscode.window.showInformationMessage('Team AI Linter is up to date!')
        this._log('No releases found')
        return
      }

      // Filter valid releases: non-draft, non-prerelease, with v-prefixed tags
      const validReleases = releases
        .filter(r => !r.draft && !r.prerelease && r.tag_name.startsWith('v'))
        .map(r => ({ ...r, version: r.tag_name.slice(1) }))
        .sort((a, b) => compareSemver(b.version, a.version))

      if (validReleases.length === 0) {
        if (manual) vscode.window.showInformationMessage('Team AI Linter is up to date!')
        this._log('No valid releases found')
        return
      }

      const latest = validReleases[0]
      this._log(`Latest release: v${latest.version}`)

      if (compareSemver(latest.version, currentVersion) <= 0) {
        if (manual) vscode.window.showInformationMessage(`Team AI Linter is up to date! (v${currentVersion})`)
        this._log('Already up to date')
        return
      }

      // Check if user previously skipped this version
      const skippedVersion = this._globalState.get<string>('skippedVersion')
      if (!manual && skippedVersion === latest.version) {
        this._log(`Skipping v${latest.version} (user previously skipped)`)
        return
      }

      // Find .vsix asset
      const vsixAsset = latest.assets.find(a => a.name.endsWith('.vsix'))
      if (!vsixAsset) {
        this._log(`No .vsix asset found in release v${latest.version}`)
        if (manual) vscode.window.showWarningMessage(`Update v${latest.version} found but no .vsix package available.`)
        return
      }

      // Show update notification
      const choice = await vscode.window.showInformationMessage(
        `Team AI Linter v${latest.version} is available (current: v${currentVersion})`,
        'Install Update',
        'Remind Me Later',
        'Skip This Version'
      )

      if (choice === 'Install Update')
        await this._installUpdate(vsixAsset, token, latest.version)
      else if (choice === 'Skip This Version')
        await this._globalState.update('skippedVersion', latest.version)

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this._log(`Update check failed: ${message}`)
      if (manual) vscode.window.showErrorMessage(`Update check failed: ${message}`)
    } finally {
      this._checking = false
    }
  }

  private _fetchReleases(token: string): Promise<GitHubRelease[] | null> {
    return new Promise((resolve) => {
      const options: https.RequestOptions = {
        hostname: 'api.github.com',
        path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'team-ai-linter-vscode',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }

      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data) as GitHubRelease[])
            } catch {
              this._log('Failed to parse releases JSON')
              resolve(null)
            }
          } else {
            this._log(`GitHub API returned ${res.statusCode}: ${data.slice(0, 200)}`)
            resolve(null)
          }
        })
      })

      req.on('error', (err) => {
        this._log(`Network error: ${err.message}`)
        resolve(null)
      })

      req.end()
    })
  }

  private async _installUpdate(asset: GitHubAsset, token: string, version: string): Promise<void> {
    const storagePath = this._globalStorageUri.fsPath
    await vscode.workspace.fs.createDirectory(this._globalStorageUri)

    const vsixPath = path.join(storagePath, asset.name)

    try {
      this._log(`Downloading ${asset.name}...`)

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Downloading Team AI Linter v${version}...`,
          cancellable: false
        },
        async () => {
          await this._downloadAsset(asset.url, token, vsixPath)
        }
      )

      this._log(`Installing from ${vsixPath}...`)
      await vscode.commands.executeCommand(
        'workbench.extensions.installExtension',
        vscode.Uri.file(vsixPath)
      )

      const choice = await vscode.window.showInformationMessage(
        `Team AI Linter v${version} installed! Reload window to activate.`,
        'Reload Now',
        'Later'
      )

      if (choice === 'Reload Now')
        await vscode.commands.executeCommand('workbench.action.reloadWindow')

      // Clear skipped version on successful install
      await this._globalState.update('skippedVersion', undefined)

    } finally {
      // Cleanup downloaded file
      try {
        if (fs.existsSync(vsixPath)) fs.unlinkSync(vsixPath)
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private _downloadAsset(assetApiUrl: string, token: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use the API URL with Accept header to get the binary — GitHub will redirect to CDN
      const url = new URL(assetApiUrl)

      const options: https.RequestOptions = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/octet-stream',
          'User-Agent': 'team-ai-linter-vscode'
        }
      }

      const req = https.request(options, (res) => {
        // Handle redirect — strip auth header for CDN
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirectUrl = res.headers.location
          if (!redirectUrl) {
            reject(new Error('Redirect with no Location header'))
            return
          }

          this._followRedirect(redirectUrl, destPath).then(resolve).catch(reject)
          return
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with status ${res.statusCode}`))
          return
        }

        const file = fs.createWriteStream(destPath)
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', reject)
      })

      req.on('error', reject)
      req.end()
    })
  }

  /** Follow redirect URL without auth header (CDN doesn't need it) */
  private _followRedirect(redirectUrl: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(redirectUrl)

      const options: https.RequestOptions = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'User-Agent': 'team-ai-linter-vscode',
          'Accept': 'application/octet-stream'
        }
      }

      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`CDN download failed with status ${res.statusCode}`))
          return
        }

        const file = fs.createWriteStream(destPath)
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', reject)
      })

      req.on('error', reject)
      req.end()
    })
  }

  private _log(message: string): void {
    this._outputChannel.appendLine(`[AutoUpdate] ${message}`)
  }
}

/**
 * Factory function to create an AutoUpdater instance
 */
export function createAutoUpdater(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): AutoUpdater {
  return new AutoUpdater(
    context.secrets,
    context.globalState,
    context.globalStorageUri,
    outputChannel
  )
}
