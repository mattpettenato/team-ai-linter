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
import { PanelData, DisplayIssue, FileResult, UnstagedFile, MissingFile, DisplayWorkspaceIssue } from './lintResultsPanel';

// Checksum logo with text - using currentColor for text to work in both light/dark themes
const CHECKSUM_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 158 44" fill="none">
  <path fill="currentColor" d="M58.321 19.894h3.038c-.044-.731-.219-1.36-.525-1.887a4.076 4.076 0 0 0-1.202-1.34 4.892 4.892 0 0 0-1.66-.812 6.938 6.938 0 0 0-1.923-.263c-.918 0-1.734.154-2.447.461a5.085 5.085 0 0 0-1.814 1.295 5.515 5.515 0 0 0-1.136 1.954 7.695 7.695 0 0 0-.372 2.436c0 .849.138 1.632.415 2.349.277.702.663 1.31 1.158 1.822a5.311 5.311 0 0 0 1.792 1.207 6.388 6.388 0 0 0 2.338.417c1.5 0 2.732-.395 3.693-1.185.962-.79 1.544-1.94 1.748-3.447h-2.993c-.102.703-.357 1.266-.765 1.69-.393.41-.962.615-1.705.615-.48 0-.888-.11-1.223-.329a2.595 2.595 0 0 1-.809-.834 4.238 4.238 0 0 1-.415-1.163 6.203 6.203 0 0 1-.131-1.252c0-.424.044-.848.131-1.273.087-.439.233-.834.437-1.185a2.66 2.66 0 0 1 .83-.878c.336-.234.75-.351 1.246-.351 1.326 0 2.09.651 2.294 1.953Zm3.982-8.319v15.673h3.103v-5.949c0-1.156.19-1.983.568-2.48.379-.512.99-.768 1.836-.768.743 0 1.26.234 1.551.702.291.454.437 1.149.437 2.085v6.41h3.103v-6.98c0-.703-.066-1.34-.197-1.91-.116-.585-.327-1.076-.633-1.47-.306-.41-.729-.725-1.268-.945-.524-.234-1.201-.35-2.032-.35-.582 0-1.18.153-1.792.46-.611.293-1.114.768-1.507 1.427h-.066v-5.905h-3.103Zm19.683 8.78H76.94c.014-.22.058-.468.13-.746.088-.278.227-.541.416-.79a2.38 2.38 0 0 1 .787-.615c.335-.175.75-.263 1.245-.263.758 0 1.319.205 1.683.614.378.41.64 1.01.786 1.8Zm-5.047 1.976h8.15a8.047 8.047 0 0 0-.218-2.524 6.083 6.083 0 0 0-1.005-2.152 4.822 4.822 0 0 0-1.749-1.492c-.713-.38-1.551-.57-2.513-.57-.859 0-1.646.153-2.36.46a5.507 5.507 0 0 0-1.813 1.273 5.45 5.45 0 0 0-1.18 1.888 6.645 6.645 0 0 0-.415 2.37c0 .878.13 1.683.393 2.415a5.626 5.626 0 0 0 1.158 1.888c.495.527 1.1.936 1.814 1.229.714.278 1.515.417 2.404.417 1.281 0 2.374-.293 3.277-.878s1.573-1.558 2.01-2.92h-2.73c-.103.352-.38.688-.831 1.01-.452.308-.99.461-1.617.461-.874 0-1.544-.226-2.01-.68-.467-.454-.722-1.186-.765-2.195Zm16.808-2.437h3.037c-.043-.731-.218-1.36-.524-1.887a4.076 4.076 0 0 0-1.202-1.34 4.892 4.892 0 0 0-1.66-.812 6.938 6.938 0 0 0-1.923-.263c-.918 0-1.734.154-2.448.461a5.085 5.085 0 0 0-1.813 1.295 5.515 5.515 0 0 0-1.137 1.954 7.695 7.695 0 0 0-.371 2.436c0 .849.138 1.632.415 2.349.277.702.663 1.31 1.158 1.822a5.311 5.311 0 0 0 1.792 1.207 6.388 6.388 0 0 0 2.338.417c1.5 0 2.731-.395 3.693-1.185.961-.79 1.544-1.94 1.748-3.447h-2.994c-.102.703-.356 1.266-.764 1.69-.394.41-.962.615-1.705.615-.48 0-.888-.11-1.224-.329a2.595 2.595 0 0 1-.808-.834 4.238 4.238 0 0 1-.415-1.163 6.195 6.195 0 0 1-.131-1.252c0-.424.043-.848.13-1.273a3.83 3.83 0 0 1 .438-1.185 2.65 2.65 0 0 1 .83-.878c.335-.234.75-.351 1.246-.351 1.325 0 2.09.651 2.294 1.953Zm4.266-8.319v15.673h3.103V23.34l1.202-1.163 3.103 5.07h3.758l-4.742-7.177 4.261-4.17h-3.671l-3.911 4.082v-8.407h-3.103Zm13.793 11.985h-2.95c.029.761.197 1.398.503 1.91.32.497.721.9 1.202 1.207a5.184 5.184 0 0 0 1.682.659 9.315 9.315 0 0 0 1.923.197c.641 0 1.267-.066 1.879-.198a4.628 4.628 0 0 0 1.661-.636 3.524 3.524 0 0 0 1.158-1.207c.306-.512.459-1.142.459-1.888 0-.527-.102-.966-.306-1.317a2.668 2.668 0 0 0-.808-.9 4.139 4.139 0 0 0-1.159-.593 12.258 12.258 0 0 0-1.311-.373 51.46 51.46 0 0 0-1.289-.285 12.87 12.87 0 0 1-1.136-.286 2.513 2.513 0 0 1-.787-.439.856.856 0 0 1-.306-.68c0-.234.059-.417.175-.549.11-.141.253-.254.415-.329.181-.075.373-.12.568-.132.188-.028.378-.043.568-.044.554 0 1.035.11 1.443.33.408.204.633.607.677 1.207h2.95c-.058-.702-.24-1.28-.546-1.734a3.406 3.406 0 0 0-1.115-1.12 4.686 4.686 0 0 0-1.551-.592 9.075 9.075 0 0 0-3.562 0 4.59 4.59 0 0 0-1.573.57c-.466.264-.845.63-1.136 1.098-.277.468-.416 1.068-.416 1.8 0 .497.102.922.306 1.273.204.337.474.622.809.856.335.22.714.402 1.136.549.44.132.885.25 1.333.351 1.107.234 1.967.468 2.578.702.627.235.94.586.94 1.054a1.2 1.2 0 0 1-.197.702 1.62 1.62 0 0 1-.502.44 2.67 2.67 0 0 1-.656.24 3.655 3.655 0 0 1-1.573-.043 2.453 2.453 0 0 1-.743-.33 2.111 2.111 0 0 1-.546-.592 1.86 1.86 0 0 1-.197-.878Zm19.057 3.688V15.899h-3.103v5.949c0 1.156-.189 1.99-.568 2.502-.379.498-.991.747-1.836.747-.742 0-1.26-.227-1.551-.68-.291-.47-.437-1.172-.437-2.108v-6.41h-3.103v6.98c0 .703.058 1.347.175 1.932.131.57.35 1.061.655 1.47.306.396.722.703 1.246.923.539.22 1.224.329 2.054.329a4.49 4.49 0 0 0 1.923-.439c.626-.293 1.136-.768 1.53-1.427h.065v1.58h2.95Zm1.568-11.349v11.349h3.103v-6.585c0-.556.08-1.003.241-1.34.16-.35.349-.614.568-.79.233-.19.466-.314.699-.373.248-.073.444-.11.59-.11.495 0 .867.088 1.114.264.263.16.445.38.547.658.116.278.182.586.196.922.015.322.022.652.022.988v6.366h3.103v-6.322c0-.351.022-.695.066-1.032.058-.35.16-.658.306-.922.16-.278.371-.497.633-.658.277-.176.634-.264 1.071-.264.437 0 .779.074 1.027.22.262.146.459.344.59.593.131.248.211.541.24.878.03.336.044.695.044 1.075v6.432h3.103v-7.595c0-.732-.102-1.354-.306-1.866-.204-.527-.488-.951-.852-1.273a3.336 3.336 0 0 0-1.311-.702 6.005 6.005 0 0 0-1.661-.22c-.787 0-1.471.19-2.054.57-.568.381-1.02.82-1.355 1.318-.306-.703-.757-1.193-1.355-1.47-.582-.279-1.23-.418-1.944-.418-.743 0-1.406.161-1.989.483a4.466 4.466 0 0 0-1.464 1.36h-.044V15.9h-2.928Z"/>
  <path fill="url(#logo-a)" d="m12.66 33.778-11.258-6.53v8.37l11.259 6.53 16.804-9.746v-8.37L12.66 33.778Z"/>
  <path fill="url(#logo-b)" d="m8.618 11.94 11.258-6.53-7.216-4.184-11.258 6.53v19.492l7.216 4.185V11.94Z"/>
  <path fill="url(#logo-c)" d="m19.877 5.41-7.216 4.186 16.805 9.746v13.059l7.216-4.185V15.157L19.876 5.411Z"/>
  <defs>
    <linearGradient id="logo-a" x1="29.533" x2="1.422" y1="30.678" y2="30.678" gradientUnits="userSpaceOnUse">
      <stop stop-color="#00C2FF" stop-opacity="0"/><stop offset=".601" stop-color="#4B47FF"/><stop offset="1" stop-color="#4B47FF"/>
    </linearGradient>
    <linearGradient id="logo-b" x1="5.639" x2="19.79" y1="29.772" y2="5.373" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FF4ECD" stop-opacity="0"/><stop offset=".596" stop-color="#BD00FF"/><stop offset="1" stop-color="#B75BFF"/>
    </linearGradient>
    <linearGradient id="logo-c" x1="19.825" x2="33.804" y1="5.385" y2="29.488" gradientUnits="userSpaceOnUse">
      <stop stop-color="#00FFB2" stop-opacity="0"/><stop offset=".606" stop-color="#00D1FF"/><stop offset="1" stop-color="#00D1FF"/>
    </linearGradient>
  </defs>
</svg>`;

// Small logo icon only (for header)
const CHECKSUM_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 44" fill="none">
  <path fill="url(#icon-a)" d="m12.66 33.778-11.258-6.53v8.37l11.259 6.53 16.804-9.746v-8.37L12.66 33.778Z"/>
  <path fill="url(#icon-b)" d="m8.618 11.94 11.258-6.53-7.216-4.184-11.258 6.53v19.492l7.216 4.185V11.94Z"/>
  <path fill="url(#icon-c)" d="m19.877 5.41-7.216 4.186 16.805 9.746v13.059l7.216-4.185V15.157L19.876 5.411Z"/>
  <defs>
    <linearGradient id="icon-a" x1="29.533" x2="1.422" y1="30.678" y2="30.678" gradientUnits="userSpaceOnUse">
      <stop stop-color="#00C2FF" stop-opacity="0"/><stop offset=".601" stop-color="#4B47FF"/><stop offset="1" stop-color="#4B47FF"/>
    </linearGradient>
    <linearGradient id="icon-b" x1="5.639" x2="19.79" y1="29.772" y2="5.373" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FF4ECD" stop-opacity="0"/><stop offset=".596" stop-color="#BD00FF"/><stop offset="1" stop-color="#B75BFF"/>
    </linearGradient>
    <linearGradient id="icon-c" x1="19.825" x2="33.804" y1="5.385" y2="29.488" gradientUnits="userSpaceOnUse">
      <stop stop-color="#00FFB2" stop-opacity="0"/><stop offset=".606" stop-color="#00D1FF"/><stop offset="1" stop-color="#00D1FF"/>
    </linearGradient>
  </defs>
</svg>`;

function escapeHtml(text: string): string {
  return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'error': return '<span class="severity-icon error">&#x2717;</span>';
    case 'warning': return '<span class="severity-icon warning">&#x26A0;</span>';
    case 'info': return '<span class="severity-icon info">&#x2139;</span>';
    default: return '';
  }
}

function getSourceBadge(source: string): string {
  switch (source) {
    case 'git': return '<span class="source-badge git">git</span>';
    case 'imported': return '<span class="source-badge imported">imported</span>';
    default: return '';
  }
}

function groupIssuesBySeverityAndRule(issues: DisplayIssue[]): Map<string, Map<string, DisplayIssue[]>> {
  const severityOrder = ['error', 'warning', 'info'];
  const grouped = new Map<string, Map<string, DisplayIssue[]>>();

  for (const severity of severityOrder)
    grouped.set(severity, new Map());


  for (const issue of issues) {
    const severityGroup = grouped.get(issue.severity);
    if (severityGroup) {
      const ruleGroup = severityGroup.get(issue.rule) || [];
      ruleGroup.push(issue);
      severityGroup.set(issue.rule, ruleGroup);
    }
  }

  return grouped;
}

function renderIssue(issue: DisplayIssue): string {
  const confidenceStr = issue.confidence !== undefined
    ? `<span class="confidence">${Math.round(issue.confidence * 100)}%</span>`
    : '';

  // Escape the message for use in JavaScript string
  const escapedMessage = escapeHtml(issue.message).replace(/'/g, "\\'").replace(/\n/g, '\\n');

  // Create a unique ID for this issue
  const issueId = `${escapeHtml(issue.filePath)}:${issue.line}:${escapeHtml(issue.rule)}`;

  // Line content preview (truncated if too long)
  const linePreview = issue.lineContent
    ? `<div class="line-preview"><code>${escapeHtml(issue.lineContent.length > 100 ? issue.lineContent.substring(0, 100) + '...' : issue.lineContent)}</code></div>`
    : '';

  const isCriticalGit = issue.isUnstaged || issue.isMissing || issue.isCaseMismatch;
  const criticalAttr = isCriticalGit ? ' data-critical-git="true"' : '';

  return `
    <div class="issue${isCriticalGit ? ' unstaged' : ''}" data-severity="${issue.severity}" data-issue-id="${issueId}"${criticalAttr} onclick="navigateToLine('${escapeHtml(issue.filePath)}', ${issue.line})">
      <div class="issue-header">
        ${getSeverityIcon(issue.severity)}
        <span class="line-number">Line ${issue.line}</span>
        <span class="rule-badge">${escapeHtml(issue.rule)}</span>
        ${getSourceBadge(issue.source)}
        ${confidenceStr}
        <div class="issue-actions">
          <button class="fix-btn" onclick="event.stopPropagation(); fixSingleIssue('${escapeHtml(issue.filePath)}', ${issue.line}, '${escapeHtml(issue.rule)}', '${escapedMessage}')" title="Fix this issue in Cursor">
            &#x2692;
          </button>
          <button class="ignore-btn" onclick="event.stopPropagation(); toggleIgnore('${issueId}')" title="Ignore this issue">
            &#x2715;
          </button>
          <button class="restore-btn" onclick="event.stopPropagation(); toggleIgnore('${issueId}')" title="Restore this issue">
            &#x21B6;
          </button>
        </div>
      </div>
      <div class="issue-message">${escapeHtml(issue.message)}</div>
      ${linePreview}
    </div>
  `;
}

function renderFileSection(file: FileResult, index: number): string {
  const errorCount = file.issues.filter(i => i.severity === 'error').length;
  const warningCount = file.issues.filter(i => i.severity === 'warning').length;
  const infoCount = file.issues.filter(i => i.severity === 'info').length;
  const hasIssues = file.issues.length > 0;

  // For files with no issues, show a simple clean indicator
  if (!hasIssues) {
    return `
      <div class="file-section clean" data-errors="0" data-warnings="0" data-info="0">
        <div class="file-header clean-header">
          <span class="clean-icon">&#x2714;</span>
          <span class="file-name">${escapeHtml(file.fileName)}</span>
          <span class="file-path">${escapeHtml(file.filePath)}</span>
          <span class="clean-label">No issues</span>
        </div>
      </div>
    `;
  }

  const grouped = groupIssuesBySeverityAndRule(file.issues);
  let issuesHtml = '';

  for (const ruleGroups of grouped.values()) {
    if (ruleGroups.size === 0)
      continue;

    for (const issues of ruleGroups.values()) {
      for (const issue of issues)
        issuesHtml += renderIssue(issue);

    }
  }

  const countParts: string[] = [];
  if (errorCount > 0)
    countParts.push(`<span class="count-error">${errorCount} error${errorCount !== 1 ? 's' : ''}</span>`);
  if (warningCount > 0)
    countParts.push(`<span class="count-warning">${warningCount} warning${warningCount !== 1 ? 's' : ''}</span>`);
  if (infoCount > 0)
    countParts.push(`<span class="count-info">${infoCount} info</span>`);

  return `
    <div class="file-section" data-errors="${errorCount}" data-warnings="${warningCount}" data-info="${infoCount}">
      <div class="file-header" onclick="toggleFileSection(${index})">
        <span class="collapse-icon" id="collapse-icon-${index}">&#x25BC;</span>
        <span class="file-name">${escapeHtml(file.fileName)}</span>
        <span class="file-path">${escapeHtml(file.filePath)}</span>
        <span class="issue-counts">${countParts.join(' ')}</span>
      </div>
      <div class="file-issues" id="file-issues-${index}">
        ${issuesHtml}
      </div>
    </div>
  `;
}

function renderEmptyState(): string {
  return `
    <div class="empty-state">
      <div class="empty-icon">&#x2714;</div>
      <div class="empty-title">No Issues Found</div>
      <div class="empty-subtitle">Your code looks great!</div>
    </div>
  `;
}

function renderSummary(data: PanelData): string {
  if (data.totalIssues === 0)
    return '<div class="summary success">No issues found</div>';


  const parts: string[] = [];
  if (data.errorCount > 0)
    parts.push(`<span class="count-error">${data.errorCount} error${data.errorCount !== 1 ? 's' : ''}</span>`);

  if (data.warningCount > 0)
    parts.push(`<span class="count-warning">${data.warningCount} warning${data.warningCount !== 1 ? 's' : ''}</span>`);

  if (data.infoCount > 0)
    parts.push(`<span class="count-info">${data.infoCount} info</span>`);


  return `
    <div class="summary">
      <span class="total">${data.totalIssues} issue${data.totalIssues !== 1 ? 's' : ''}</span>
      <span class="breakdown">(${parts.join(', ')})</span>
    </div>
  `;
}

function renderUnstagedAlert(unstagedFiles: UnstagedFile[]): string {
  if (!unstagedFiles || unstagedFiles.length === 0)
    return '';

  const gitAddCommands = unstagedFiles.map(f => `git add ${f.filePath}`).join('\n');
  const escapedCommands = escapeHtml(gitAddCommands).replace(/'/g, "\\'").replace(/\n/g, '\\n');

  const fileListHtml = unstagedFiles.map(f =>
    `<div class="unstaged-file">
      <span class="unstaged-file-icon">&#x26A0;</span>
      <span class="unstaged-file-path">${escapeHtml(f.moduleSpecifier)}</span>
      <code class="unstaged-file-cmd">git add ${escapeHtml(f.filePath)}</code>
    </div>`
  ).join('');

  return `
    <div class="unstaged-alert">
      <div class="unstaged-alert-header">
        <span class="unstaged-alert-icon">&#x26D4;</span>
        <span class="unstaged-alert-title">UNSTAGED FILES DETECTED</span>
        <button class="unstaged-copy-btn" onclick="copyGitAddCommands('${escapedCommands}')">Copy git add commands</button>
      </div>
      <div class="unstaged-alert-body">
        <p class="unstaged-alert-desc">The following imported files have changes that are <strong>NOT staged</strong> for commit. If you commit without staging them, your tests will break.</p>
        ${fileListHtml}
      </div>
    </div>
  `;
}

function renderReplAlert(data: PanelData | undefined): string {
  if (!data) return '';

  const replIssues: { filePath: string; fileName: string; line: number; lineContent?: string }[] = [];
  for (const file of data.files) {
    for (const issue of file.issues) {
      if (issue.rule === 'repl_import') {
        replIssues.push({
          filePath: file.filePath,
          fileName: file.fileName,
          line: issue.line,
          lineContent: issue.lineContent,
        });
      }
    }
  }

  if (replIssues.length === 0) return '';

  const fileListHtml = replIssues.map(r =>
    `<div class="repl-file">
      <span class="repl-file-icon">&#x26A0;</span>
      <span class="repl-file-location">${escapeHtml(r.fileName)}:${r.line}</span>
      ${r.lineContent ? `<code class="repl-file-code">${escapeHtml(r.lineContent.trim())}</code>` : ''}
    </div>`
  ).join('');

  return `
    <div class="repl-alert">
      <div class="repl-alert-header">
        <span class="repl-alert-icon">&#x1F6A8;</span>
        <span class="repl-alert-title">REMOVE REPL IMPORT</span>
      </div>
      <div class="repl-alert-body">
        <p class="repl-alert-desc">REPL imports are for <strong>local debugging only</strong> and must be removed before committing. Your code will not pass review with repl imports.</p>
        ${fileListHtml}
      </div>
    </div>
  `;
}

function renderMissingFilesAlert(missingFiles: MissingFile[]): string {
  if (!missingFiles || missingFiles.length === 0)
    return '';

  const fileListHtml = missingFiles.map(f =>
    `<div class="unstaged-file">
      <span class="unstaged-file-icon">&#x2717;</span>
      <span class="unstaged-file-path">${escapeHtml(f.moduleSpecifier)}</span>
      <span class="unstaged-file-cmd">File does not exist</span>
    </div>`
  ).join('');

  return `
    <div class="unstaged-alert missing-alert">
      <div class="unstaged-alert-header">
        <span class="unstaged-alert-icon">&#x26D4;</span>
        <span class="unstaged-alert-title">MISSING FILES DETECTED</span>
      </div>
      <div class="unstaged-alert-body">
        <p class="unstaged-alert-desc">The following imported files <strong>do not exist</strong>. Your tests will fail. Create the files or fix the import paths.</p>
        ${fileListHtml}
      </div>
    </div>
  `;
}

function renderWorkspaceSection(issues: DisplayWorkspaceIssue[] | undefined): string {
  if (!issues || issues.length === 0)
    return '';

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  const countParts: string[] = [];
  if (errorCount > 0)
    countParts.push(`<span class="count-error">${errorCount} error${errorCount !== 1 ? 's' : ''}</span>`);
  if (warningCount > 0)
    countParts.push(`<span class="count-warning">${warningCount} warning${warningCount !== 1 ? 's' : ''}</span>`);
  if (infoCount > 0)
    countParts.push(`<span class="count-info">${infoCount} info</span>`);

  const rowsHtml = issues.map(issue => {
    const icon = getSeverityIcon(issue.severity);
    const escapedPath = escapeHtml(issue.offenderPath).replace(/'/g, "\\'");
    return `
      <div class="workspace-issue" onclick="openFile('${escapedPath}')" title="Open ${escapeHtml(issue.offenderPath)}">
        ${icon}
        <span class="workspace-issue-rule">${escapeHtml(issue.rule)}</span>
        <span class="workspace-issue-name">${escapeHtml(issue.offenderName)}</span>
        <span class="workspace-issue-path">${escapeHtml(issue.offenderPath)}</span>
        <div class="workspace-issue-message">${escapeHtml(issue.message)}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="file-section workspace-section" data-errors="${errorCount}" data-warnings="${warningCount}" data-info="${infoCount}">
      <div class="file-header workspace-header" onclick="toggleWorkspaceSection()">
        <span class="collapse-icon" id="collapse-icon-workspace">&#x25BC;</span>
        <span class="file-name">Workspace Issues</span>
        <span class="file-path">Repo-wide checks</span>
        <span class="issue-counts">${countParts.join(' ')}</span>
      </div>
      <div class="file-issues" id="file-issues-workspace">
        ${rowsHtml}
      </div>
    </div>
  `;
}

function renderFilterButtons(data: PanelData | undefined): string {
  if (!data || data.totalIssues === 0)
    return '';

  // Show the waitForTimeout toggle for all users
  const showWaitForTimeoutToggle = true;

  return `
    <div class="filter-bar">
      <span class="filter-label">Filter:</span>
      <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">
        All (${data.totalIssues})
      </button>
      ${data.errorCount > 0 ? `
        <button class="filter-btn" data-filter="error" onclick="setFilter('error')">
          <span class="filter-icon error">&#x2717;</span> Errors (${data.errorCount})
        </button>
      ` : ''}
      ${data.warningCount > 0 ? `
        <button class="filter-btn" data-filter="warning" onclick="setFilter('warning')">
          <span class="filter-icon warning">&#x26A0;</span> Warnings (${data.warningCount})
        </button>
      ` : ''}
      ${data.infoCount > 0 ? `
        <button class="filter-btn" data-filter="info" onclick="setFilter('info')">
          <span class="filter-icon info">&#x2139;</span> Info (${data.infoCount})
        </button>
      ` : ''}
      ${showWaitForTimeoutToggle ? `
        <div class="filter-separator"></div>
        <label class="toggle-container" title="Auto-ignore all waitForTimeout issues (situational)">
          <input type="checkbox" id="ignoreWaitForTimeout" onchange="toggleIgnoreWaitForTimeout(this.checked)">
          <span class="toggle-label">Ignore waitForTimeout</span>
        </label>
        <label class="toggle-container" title="Auto-ignore all .nth() selector warnings">
          <input type="checkbox" id="ignoreNthSelectors" onchange="toggleIgnoreNthSelector(this.checked)">
          <span class="toggle-label">Ignore .nth() selectors</span>
        </label>
        <label class="toggle-container" title="Auto-ignore all networkidle warnings">
          <input type="checkbox" id="ignoreNetworkidle" onchange="toggleIgnoreNetworkidle(this.checked)">
          <span class="toggle-label">Ignore networkidle</span>
        </label>
      ` : ''}
      <div class="expand-collapse-btns">
        <button class="expand-collapse-btn" onclick="expandAll()" title="Expand all file sections">&#x25BC; Expand</button>
        <button class="expand-collapse-btn" onclick="collapseAll()" title="Collapse all file sections">&#x25B2; Collapse</button>
      </div>
    </div>
  `;
}

export function generateLoadingHtml(filename: string, version: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Lint Results</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 0;
      line-height: 1.5;
    }

    .container {
      max-width: 100%;
      padding: 16px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 16px 12px 16px;
      margin: -16px -16px 16px -16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background-color: var(--vscode-editor-background);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .header-icon {
      width: 24px;
      height: 28px;
      flex-shrink: 0;
    }

    .header-icon svg {
      width: 100%;
      height: 100%;
    }

    .header-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .version-badge {
      font-size: 11px;
      font-weight: 500;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 1px 6px;
      border-radius: 10px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .action-btn {
      padding: 6px 12px;
      font-size: 12px;
      border: none;
      border-radius: 4px;
      cursor: not-allowed;
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      opacity: 0.5;
    }

    .loading-state {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      margin-bottom: 12px;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 6px;
    }

    .loading-spinner {
      width: 100px;
      height: 28px;
      animation: pulse 1.5s ease-in-out infinite;
      color: var(--vscode-foreground);
      flex-shrink: 0;
    }

    .loading-spinner svg {
      width: 100%;
      height: 100%;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(1.05); opacity: 1; }
    }

    .loading-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .loading-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .loading-filename {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family, monospace);
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Terminal Activity Log */
    .terminal-container {
      margin: 0;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: hidden;
      background-color: var(--vscode-terminal-background, #1e1e1e);
    }

    .terminal-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background-color: var(--vscode-sideBarSectionHeader-background);
      cursor: pointer;
      user-select: none;
    }

    .terminal-header:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .terminal-icon {
      font-family: var(--vscode-editor-font-family, monospace);
      color: var(--vscode-terminal-ansiGreen, #4ec9b0);
      font-weight: bold;
    }

    .terminal-title {
      font-size: 12px;
      font-weight: 500;
      flex: 1;
      color: var(--vscode-foreground);
    }

    .terminal-toggle {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      transition: transform 0.15s;
    }

    .terminal-toggle.collapsed {
      transform: rotate(-90deg);
    }

    .terminal-body {
      max-height: 200px;
      overflow-y: auto;
      transition: max-height 0.2s ease-out;
    }

    .terminal-body.collapsed {
      max-height: 0;
    }

    .terminal-content {
      padding: 8px 12px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.6;
      min-height: 40px;
    }

    .status-line {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 2px 0;
      color: var(--vscode-terminal-foreground, #cccccc);
    }

    .status-timestamp {
      color: var(--vscode-terminal-ansiBlue, #569cd6);
      font-size: 11px;
      min-width: 65px;
      opacity: 0.8;
    }

    .status-icon {
      width: 14px;
      text-align: center;
      flex-shrink: 0;
    }

    .status-icon.spinner {
      animation: spin 1s linear infinite;
      color: var(--vscode-terminal-ansiYellow, #dcdcaa);
    }

    .status-icon.check {
      color: var(--vscode-terminal-ansiGreen, #4ec9b0);
    }

    .status-icon.error {
      color: var(--vscode-terminal-ansiRed, #f14c4c);
    }

    .status-icon.info {
      color: var(--vscode-terminal-ansiCyan, #9cdcfe);
    }

    .status-text {
      flex: 1;
      word-break: break-word;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <div class="header-icon">${CHECKSUM_ICON_SVG}</div>
        <span class="header-title">AI Lint Results</span>
        <span class="version-badge">v${version}</span>
      </div>
      <div class="header-actions">
        <button class="action-btn" disabled>Copy Fix Prompt</button>
        <button class="action-btn" disabled>Fix Now</button>
      </div>
    </div>

    <div class="content">
      <div class="loading-state">
        <div class="loading-spinner">${CHECKSUM_LOGO_SVG}</div>
        <div class="loading-info">
          <div class="loading-title">Analyzing...</div>
          <div class="loading-filename">${escapeHtml(filename)}</div>
        </div>
      </div>

      <div class="terminal-container">
        <div class="terminal-header" onclick="toggleTerminal()">
          <span class="terminal-icon">&gt;</span>
          <span class="terminal-title">Activity Log</span>
          <span class="terminal-toggle" id="terminal-toggle">&#x25BC;</span>
        </div>
        <div class="terminal-body" id="terminal-body">
          <div class="terminal-content" id="terminal-content">
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function toggleTerminal() {
      const body = document.getElementById('terminal-body');
      const toggle = document.getElementById('terminal-toggle');
      if (body && toggle) {
        body.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
      }
    }

    function getStatusIconChar(icon) {
      switch (icon) {
        case 'spinner': return '◐';
        case 'check': return '✓';
        case 'error': return '✗';
        case 'info': return '•';
        default: return '•';
      }
    }

    function escapeHtmlJs(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function addStatusLine(status) {
      const container = document.getElementById('terminal-content');
      if (!container) return;

      const existingLine = document.getElementById('status-' + status.id);
      const line = existingLine || document.createElement('div');
      line.id = 'status-' + status.id;
      line.className = 'status-line';

      const iconClass = status.icon || '';
      const iconChar = getStatusIconChar(status.icon);
      const timestampHtml = status.timestamp
        ? '<span class="status-timestamp">' + escapeHtmlJs(status.timestamp) + '</span>'
        : '';

      line.innerHTML = timestampHtml +
        '<span class="status-icon ' + iconClass + '">' + iconChar + '</span>' +
        '<span class="status-text">' + escapeHtmlJs(status.text) + '</span>';

      if (!existingLine) {
        container.appendChild(line);
      }

      // Auto-scroll to bottom
      const body = document.getElementById('terminal-body');
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    }

    function clearTerminal() {
      const container = document.getElementById('terminal-content');
      if (container) container.innerHTML = '';
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'status':
          addStatusLine(message);
          break;
        case 'statusClear':
          clearTerminal();
          break;
      }
    });
  </script>
</body>
</html>`;
}

export function generatePanelHtml(data: PanelData | undefined, version: string): string {
  const timestamp = data ? formatTimestamp(data.timestamp) : '';
  const replAlertHtml = renderReplAlert(data);
  const unstagedAlertHtml = data?.unstagedFiles ? renderUnstagedAlert(data.unstagedFiles) : '';
  const missingAlertHtml = data?.missingFiles ? renderMissingFilesAlert(data.missingFiles) : '';
  const summaryHtml = data ? renderSummary(data) : '';
  const filterHtml = renderFilterButtons(data);
  const workspaceSectionHtml = renderWorkspaceSection(data?.workspaceIssues);

  let contentHtml = '';
  const hasWorkspaceIssues = (data?.workspaceIssues?.length ?? 0) > 0;
  if (!data || (data.files.length === 0 && !hasWorkspaceIssues)) {
    contentHtml = renderEmptyState();
  } else {
    // Workspace-scoped issues render at the top — they aren't tied to any
    // one file. Per-file sections follow (issues first, clean files last).
    const filesWithIssues = data.files.filter(f => f.issues.length > 0);
    const cleanFiles = data.files.filter(f => f.issues.length === 0);
    const sortedFiles = [...filesWithIssues, ...cleanFiles];
    contentHtml = workspaceSectionHtml + sortedFiles
        .map((file, index) => renderFileSection(file, index))
        .join('');
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Lint Results</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 0;
      line-height: 1.5;
    }

    .container {
      max-width: 100%;
      padding: 16px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 16px 12px 16px;
      margin: -16px -16px 16px -16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      position: sticky;
      top: 0;
      z-index: 10;
      background-color: var(--vscode-editor-background);
      transition: box-shadow 0.2s;
    }

    .header.scrolled {
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .header-icon {
      width: 24px;
      height: 28px;
      flex-shrink: 0;
    }

    .header-icon svg {
      width: 100%;
      height: 100%;
    }

    .header-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .timestamp {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .version-badge {
      font-size: 11px;
      font-weight: 500;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 1px 6px;
      border-radius: 10px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .action-btn {
      padding: 6px 12px;
      font-size: 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      transition: background-color 0.15s;
    }

    .action-btn:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .action-btn.primary {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .action-btn.primary:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    .filter-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      margin: 0 -16px 12px -16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      position: sticky;
      top: 61px;
      z-index: 9;
      background-color: var(--vscode-editor-background);
      transition: box-shadow 0.2s;
    }

    .filter-bar.scrolled {
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }

    .filter-label {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-right: 4px;
    }

    .filter-btn {
      padding: 4px 10px;
      font-size: 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      cursor: pointer;
      background-color: transparent;
      color: var(--vscode-foreground);
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .filter-btn:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .filter-btn.active {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    .filter-icon {
      font-size: 12px;
    }

    .filter-icon.error {
      color: var(--vscode-testing-iconFailed, #f14c4c);
    }

    .filter-icon.warning {
      color: var(--vscode-editorWarning-foreground, #cca700);
    }

    .filter-icon.info {
      color: var(--vscode-editorInfo-foreground, #3794ff);
    }

    .filter-btn.active .filter-icon {
      color: inherit;
    }

    .filter-separator {
      width: 1px;
      height: 20px;
      background-color: var(--vscode-panel-border);
      margin: 0 8px;
    }

    .toggle-container {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      padding: 4px 8px;
      border-radius: 4px;
      transition: background-color 0.15s;
    }

    .toggle-container:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .toggle-container input[type="checkbox"] {
      cursor: pointer;
      width: 14px;
      height: 14px;
    }

    .toggle-label {
      user-select: none;
    }

    .summary {
      padding: 12px 16px;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 14px;
    }

    .summary.success {
      background-color: var(--vscode-testing-iconPassed);
      color: var(--vscode-editor-background);
      opacity: 0.9;
    }

    .summary .total {
      font-weight: 600;
    }

    .summary .breakdown {
      color: var(--vscode-descriptionForeground);
      margin-left: 8px;
    }

    .count-error {
      color: var(--vscode-testing-iconFailed, #f14c4c);
    }

    .count-warning {
      color: var(--vscode-editorWarning-foreground, #cca700);
    }

    .count-info {
      color: var(--vscode-editorInfo-foreground, #3794ff);
    }

    .file-section {
      margin-bottom: 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: hidden;
    }

    .file-section.clean {
      opacity: 0.7;
    }

    .file-section.clean .file-header {
      cursor: default;
    }

    .file-section.clean .file-header:hover {
      background-color: var(--vscode-sideBarSectionHeader-background);
    }

    .clean-icon {
      color: var(--vscode-testing-iconPassed, #73c991);
      font-size: 14px;
      margin-right: 4px;
    }

    .clean-label {
      font-size: 12px;
      color: var(--vscode-testing-iconPassed, #73c991);
      margin-left: auto;
    }

    .file-section.hidden {
      display: none;
    }

    .file-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background-color: var(--vscode-sideBarSectionHeader-background);
      cursor: pointer;
      user-select: none;
    }

    .file-header:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .collapse-icon {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      transition: transform 0.15s;
    }

    .collapse-icon.collapsed {
      transform: rotate(-90deg);
    }

    .file-name {
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .file-path {
      flex: 1;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .issue-counts {
      font-size: 12px;
      display: flex;
      gap: 8px;
    }

    .file-issues {
      background-color: var(--vscode-editor-background);
    }

    .file-issues.collapsed {
      display: none;
    }

    .file-section.workspace-section {
      border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700);
    }

    .workspace-header .file-name {
      color: var(--vscode-editorWarning-foreground, #cca700);
    }

    .workspace-issue {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: pointer;
      transition: background-color 0.1s;
    }

    .workspace-issue:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .workspace-issue-rule {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 3px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .workspace-issue-name {
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .workspace-issue-path {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      justify-self: end;
      max-width: 45%;
    }

    .workspace-issue-message {
      grid-column: 1 / -1;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      padding-left: 28px;
    }

    .issue {
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: pointer;
      transition: background-color 0.1s;
    }

    .issue.hidden {
      display: none;
    }

    .issue.ignored {
      opacity: 0.4;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
    }

    .issue.ignored .issue-message {
      text-decoration: line-through;
    }

    .issue.ignored .restore-btn {
      opacity: 1;
    }

    .issue.ignored .ignore-btn {
      display: none;
    }

    .issue:last-child {
      border-bottom: none;
    }

    .issue:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .issue.ignored:hover {
      opacity: 0.6;
    }

    .issue-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .severity-icon {
      font-size: 14px;
      width: 18px;
      text-align: center;
    }

    .severity-icon.error {
      color: var(--vscode-testing-iconFailed, #f14c4c);
    }

    .severity-icon.warning {
      color: var(--vscode-editorWarning-foreground, #cca700);
    }

    .severity-icon.info {
      color: var(--vscode-editorInfo-foreground, #3794ff);
    }

    .line-number {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      min-width: 60px;
    }

    .rule-badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-family: var(--vscode-editor-font-family, monospace);
    }

    .source-badge {
      font-size: 10px;
      padding: 2px 5px;
      border-radius: 3px;
      text-transform: uppercase;
      font-weight: 500;
    }

    .source-badge.git {
      background-color: var(--vscode-gitDecoration-modifiedResourceForeground);
      color: var(--vscode-editor-background);
      opacity: 0.8;
    }

    .source-badge.imported {
      background-color: var(--vscode-editorInfo-foreground);
      color: var(--vscode-editor-background);
      opacity: 0.8;
    }

    .confidence {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .issue-actions {
      display: flex;
      gap: 4px;
      margin-left: auto;
    }

    .fix-btn, .ignore-btn, .restore-btn {
      background: none;
      border: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      padding: 2px 6px;
      font-size: 12px;
      border-radius: 3px;
      opacity: 0;
      transition: opacity 0.15s, background-color 0.15s;
    }

    .restore-btn {
      display: none;
    }

    .issue.ignored .restore-btn {
      display: inline-block;
    }

    .issue:hover .fix-btn,
    .issue:hover .ignore-btn,
    .issue:hover .restore-btn {
      opacity: 1;
    }

    .fix-btn:hover {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .ignore-btn:hover {
      background-color: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-foreground);
    }

    .restore-btn:hover {
      background-color: var(--vscode-testing-iconPassed);
      color: var(--vscode-editor-background);
    }

    .issue-message {
      font-size: 13px;
      color: var(--vscode-foreground);
      padding-left: 26px;
      word-wrap: break-word;
    }

    .line-preview {
      margin-top: 6px;
      padding: 6px 10px;
      margin-left: 26px;
      background-color: var(--vscode-textBlockQuote-background, rgba(127, 127, 127, 0.1));
      border-left: 3px solid var(--vscode-textBlockQuote-border, rgba(127, 127, 127, 0.3));
      border-radius: 0 4px 4px 0;
      font-size: 12px;
      overflow-x: auto;
    }

    .line-preview code {
      font-family: var(--vscode-editor-font-family, monospace);
      color: var(--vscode-textPreformat-foreground, var(--vscode-foreground));
      white-space: pre;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
    }

    .empty-icon {
      font-size: 48px;
      color: var(--vscode-testing-iconPassed, #73c991);
      margin-bottom: 16px;
    }

    .empty-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 8px;
    }

    .empty-subtitle {
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
    }

    .no-matches {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
    }

    /* Loading state */
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      text-align: center;
    }

    .loading-spinner {
      width: 140px;
      height: 40px;
      margin-bottom: 20px;
      animation: pulse 1.5s ease-in-out infinite;
      color: var(--vscode-foreground);
    }

    .loading-spinner svg {
      width: 100%;
      height: 100%;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(1.05); opacity: 1; }
    }

    .loading-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 8px;
    }

    .loading-filename {
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family, monospace);
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Unstaged Alert Banner */
    .unstaged-alert {
      margin-bottom: 16px;
      border: 2px solid var(--vscode-testing-iconFailed, #f14c4c);
      border-radius: 8px;
      overflow: hidden;
      background-color: rgba(241, 76, 76, 0.08);
      animation: alertPulse 2s ease-in-out 3;
    }

    @keyframes alertPulse {
      0%, 100% { border-color: var(--vscode-testing-iconFailed, #f14c4c); }
      50% { border-color: #ff6b6b; box-shadow: 0 0 12px rgba(241, 76, 76, 0.3); }
    }

    .unstaged-alert-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background-color: rgba(241, 76, 76, 0.15);
      border-bottom: 1px solid rgba(241, 76, 76, 0.3);
    }

    .unstaged-alert-icon {
      font-size: 20px;
      color: var(--vscode-testing-iconFailed, #f14c4c);
    }

    .unstaged-alert-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--vscode-testing-iconFailed, #f14c4c);
      letter-spacing: 0.5px;
      flex: 1;
    }

    .unstaged-copy-btn {
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid var(--vscode-testing-iconFailed, #f14c4c);
      border-radius: 4px;
      cursor: pointer;
      background-color: var(--vscode-testing-iconFailed, #f14c4c);
      color: white;
      transition: opacity 0.15s;
    }

    .unstaged-copy-btn:hover {
      opacity: 0.85;
    }

    .unstaged-alert-body {
      padding: 12px 16px;
    }

    .unstaged-alert-desc {
      font-size: 13px;
      color: var(--vscode-foreground);
      margin-bottom: 10px;
      line-height: 1.5;
    }

    .unstaged-file {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      margin-bottom: 6px;
      background-color: rgba(241, 76, 76, 0.06);
      border-radius: 4px;
      border-left: 3px solid var(--vscode-testing-iconFailed, #f14c4c);
    }

    .unstaged-file-icon {
      color: var(--vscode-testing-iconFailed, #f14c4c);
      font-size: 14px;
      flex-shrink: 0;
    }

    .unstaged-file-path {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-foreground);
      min-width: 120px;
    }

    .unstaged-file-cmd {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      background-color: rgba(127, 127, 127, 0.1);
      padding: 2px 8px;
      border-radius: 3px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* REPL alert banner */
    .repl-alert {
      margin-bottom: 16px;
      border: 3px solid #ff0000;
      border-radius: 8px;
      overflow: hidden;
      background-color: rgba(255, 0, 0, 0.12);
      animation: replPulse 1.5s ease-in-out infinite;
    }

    @keyframes replPulse {
      0%, 100% { border-color: #ff0000; box-shadow: 0 0 8px rgba(255, 0, 0, 0.4); }
      50% { border-color: #ff4444; box-shadow: 0 0 20px rgba(255, 0, 0, 0.6); }
    }

    .repl-alert-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      background-color: rgba(255, 0, 0, 0.25);
      border-bottom: 1px solid rgba(255, 0, 0, 0.4);
    }

    .repl-alert-icon {
      font-size: 22px;
    }

    .repl-alert-title {
      font-size: 16px;
      font-weight: 800;
      color: #ff4444;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .repl-alert-body {
      padding: 12px 16px;
    }

    .repl-alert-desc {
      font-size: 13px;
      color: var(--vscode-foreground);
      margin-bottom: 10px;
      line-height: 1.5;
    }

    .repl-file {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      margin-bottom: 6px;
      background-color: rgba(255, 0, 0, 0.08);
      border-radius: 4px;
      border-left: 3px solid #ff0000;
    }

    .repl-file-icon {
      color: #ff0000;
      font-size: 14px;
      flex-shrink: 0;
    }

    .repl-file-location {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-foreground);
      min-width: 120px;
    }

    .repl-file-code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      background-color: rgba(127, 127, 127, 0.1);
      padding: 2px 8px;
      border-radius: 3px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Unstaged issue styling */
    .issue.unstaged {
      border-left: 4px solid var(--vscode-testing-iconFailed, #f14c4c);
      background-color: rgba(241, 76, 76, 0.06);
    }

    .issue.unstaged:hover {
      background-color: rgba(241, 76, 76, 0.12);
    }

    /* Terminal Activity Log */
    .terminal-container {
      margin: 16px 0;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: hidden;
      background-color: var(--vscode-terminal-background, #1e1e1e);
    }

    .terminal-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background-color: var(--vscode-sideBarSectionHeader-background);
      cursor: pointer;
      user-select: none;
    }

    .terminal-header:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .terminal-icon {
      font-family: var(--vscode-editor-font-family, monospace);
      color: var(--vscode-terminal-ansiGreen, #4ec9b0);
      font-weight: bold;
    }

    .terminal-title {
      font-size: 12px;
      font-weight: 500;
      flex: 1;
      color: var(--vscode-foreground);
    }

    .terminal-toggle {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      transition: transform 0.15s;
    }

    .terminal-toggle.collapsed {
      transform: rotate(-90deg);
    }

    .terminal-body {
      max-height: 200px;
      overflow-y: auto;
      transition: max-height 0.2s ease-out;
    }

    .terminal-body.collapsed {
      max-height: 0;
    }

    .terminal-content {
      padding: 8px 12px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.6;
      min-height: 40px;
    }

    .status-line {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 2px 0;
      color: var(--vscode-terminal-foreground, #cccccc);
    }

    .status-timestamp {
      color: var(--vscode-terminal-ansiBlue, #569cd6);
      font-size: 11px;
      min-width: 65px;
      opacity: 0.8;
    }

    .status-icon {
      width: 14px;
      text-align: center;
      flex-shrink: 0;
    }

    .status-icon.spinner {
      animation: spin 1s linear infinite;
      color: var(--vscode-terminal-ansiYellow, #dcdcaa);
    }

    .status-icon.check {
      color: var(--vscode-terminal-ansiGreen, #4ec9b0);
    }

    .status-icon.error {
      color: var(--vscode-terminal-ansiRed, #f14c4c);
    }

    .status-icon.info {
      color: var(--vscode-terminal-ansiCyan, #9cdcfe);
    }

    .status-text {
      flex: 1;
      word-break: break-word;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Expand/Collapse All buttons */
    .expand-collapse-btns {
      display: flex;
      gap: 4px;
      margin-left: auto;
    }

    .expand-collapse-btn {
      padding: 4px 8px;
      font-size: 11px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      cursor: pointer;
      background-color: transparent;
      color: var(--vscode-descriptionForeground);
      transition: all 0.15s;
    }

    .expand-collapse-btn:hover {
      background-color: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }

    /* Smooth scrolling for content */
    .content {
      scroll-behavior: smooth;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <div class="header-icon">${CHECKSUM_ICON_SVG}</div>
        <span class="header-title">AI Lint Results</span>
        <span class="version-badge">v${version}</span>
        <span class="timestamp">${timestamp}</span>
      </div>
      <div class="header-actions">
        <button class="action-btn" onclick="copyFixPrompt()">Copy Fix Prompt</button>
        <button class="action-btn primary" onclick="fixAllIssues()">Fix Now</button>
      </div>
    </div>

    ${replAlertHtml}
    ${unstagedAlertHtml}
    ${missingAlertHtml}
    ${summaryHtml}
    ${filterHtml}

    <div class="terminal-container">
      <div class="terminal-header" onclick="toggleTerminal()">
        <span class="terminal-icon">&gt;</span>
        <span class="terminal-title">Activity Log</span>
        <span class="terminal-toggle collapsed" id="terminal-toggle">&#x25BC;</span>
      </div>
      <div class="terminal-body collapsed" id="terminal-body">
        <div class="terminal-content" id="terminal-content">
        </div>
      </div>
    </div>

    <div class="content" id="content">
      ${contentHtml}
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentFilter = 'all';
    const ignoredIssues = new Set();

    // Scroll detection for sticky header shadow
    window.addEventListener('scroll', function() {
      const header = document.querySelector('.header');
      const filterBar = document.querySelector('.filter-bar');
      const scrolled = window.scrollY > 10;

      if (header) {
        header.classList.toggle('scrolled', scrolled);
      }
      if (filterBar) {
        filterBar.classList.toggle('scrolled', scrolled);
      }
    });

    function navigateToLine(file, line) {
      vscode.postMessage({
        type: 'navigateToLine',
        file: file,
        line: line
      });
    }

    function copyFixPrompt() {
      vscode.postMessage({
        type: 'copyFixPrompt',
        ignoredIssues: Array.from(ignoredIssues)
      });
    }

    function rerunLint() {
      vscode.postMessage({ type: 'rerunLint' });
    }

    function toggleIgnore(issueId) {
      const issueEl = document.querySelector('[data-issue-id="' + issueId + '"]');
      if (!issueEl) return;

      if (ignoredIssues.has(issueId)) {
        // Restore the issue
        ignoredIssues.delete(issueId);
        issueEl.classList.remove('ignored');
      } else {
        // Ignore the issue
        ignoredIssues.add(issueId);
        issueEl.classList.add('ignored');
      }

      // Notify extension of the change
      vscode.postMessage({
        type: 'updateIgnoredIssues',
        ignoredIssues: Array.from(ignoredIssues)
      });

      // Update counts display
      updateIgnoredCount();
    }

    function updateIgnoredCount() {
      const ignoredCount = ignoredIssues.size;
      const summaryEl = document.querySelector('.summary');
      if (summaryEl && ignoredCount > 0) {
        let ignoredSpan = document.querySelector('.ignored-count');
        if (!ignoredSpan) {
          ignoredSpan = document.createElement('span');
          ignoredSpan.className = 'ignored-count';
          summaryEl.appendChild(ignoredSpan);
        }
        ignoredSpan.textContent = ' — ' + ignoredCount + ' ignored';
        ignoredSpan.style.color = 'var(--vscode-descriptionForeground)';
        ignoredSpan.style.marginLeft = '8px';
      } else if (ignoredCount === 0) {
        const ignoredSpan = document.querySelector('.ignored-count');
        if (ignoredSpan) ignoredSpan.remove();
      }
    }

    function toggleIgnoreWaitForTimeout(checked) {
      // Find all issues with waitForTimeout rule or message
      const issues = document.querySelectorAll('.issue');
      issues.forEach(issue => {
        const ruleBadge = issue.querySelector('.rule-badge');
        const ruleText = ruleBadge ? ruleBadge.textContent : '';
        const messageEl = issue.querySelector('.issue-message');
        const messageText = messageEl ? messageEl.textContent : '';
        // Check both rule and message for waitForTimeout references
        const isWaitForTimeoutIssue = ruleText.toLowerCase().includes('waitfortimeout') ||
                                       messageText.toLowerCase().includes('waitfortimeout');
        if (isWaitForTimeoutIssue) {
          const issueId = issue.dataset.issueId;
          if (checked) {
            // Ignore the issue - always add class, add to set if not already there
            ignoredIssues.add(issueId);
            issue.classList.add('ignored');
          } else {
            // Restore the issue - always remove class, remove from set if present
            ignoredIssues.delete(issueId);
            issue.classList.remove('ignored');
          }
        }
      });

      // Notify extension of the change
      vscode.postMessage({
        type: 'updateIgnoredIssues',
        ignoredIssues: Array.from(ignoredIssues)
      });

      // Update counts display
      updateIgnoredCount();
    }

    function toggleIgnoreNthSelector(checked) {
      // Find all issues with nth selector rule or message
      const issues = document.querySelectorAll('.issue');
      issues.forEach(issue => {
        const ruleBadge = issue.querySelector('.rule-badge');
        const ruleText = ruleBadge ? ruleBadge.textContent : '';
        const messageEl = issue.querySelector('.issue-message');
        const messageText = messageEl ? messageEl.textContent : '';
        // Check both rule and message for nth selector references
        const isNthSelectorIssue = ruleText.toLowerCase().includes('nth') ||
                                   messageText.toLowerCase().includes('.nth(');
        if (isNthSelectorIssue) {
          const issueId = issue.dataset.issueId;
          if (checked) {
            // Ignore the issue - always add class, add to set if not already there
            ignoredIssues.add(issueId);
            issue.classList.add('ignored');
          } else {
            // Restore the issue - always remove class, remove from set if present
            ignoredIssues.delete(issueId);
            issue.classList.remove('ignored');
          }
        }
      });

      // Notify extension of the change
      vscode.postMessage({
        type: 'updateIgnoredIssues',
        ignoredIssues: Array.from(ignoredIssues)
      });

      // Update counts display
      updateIgnoredCount();
    }

    function toggleIgnoreNetworkidle(checked) {
      // Find all issues with networkidle rule or message
      const issues = document.querySelectorAll('.issue');
      issues.forEach(issue => {
        const ruleBadge = issue.querySelector('.rule-badge');
        const ruleText = ruleBadge ? ruleBadge.textContent : '';
        const messageEl = issue.querySelector('.issue-message');
        const messageText = messageEl ? messageEl.textContent : '';
        // Check both rule and message for networkidle references
        const isNetworkidleIssue = ruleText.toLowerCase().includes('networkidle') ||
                                    messageText.toLowerCase().includes('networkidle');
        if (isNetworkidleIssue) {
          const issueId = issue.dataset.issueId;
          if (checked) {
            ignoredIssues.add(issueId);
            issue.classList.add('ignored');
          } else {
            ignoredIssues.delete(issueId);
            issue.classList.remove('ignored');
          }
        }
      });

      // Notify extension of the change
      vscode.postMessage({
        type: 'updateIgnoredIssues',
        ignoredIssues: Array.from(ignoredIssues)
      });

      // Update counts display
      updateIgnoredCount();
    }

    function fixAllIssues() {
      vscode.postMessage({
        type: 'fixAllIssues',
        ignoredIssues: Array.from(ignoredIssues)
      });
    }

    function fixSingleIssue(file, line, rule, message) {
      vscode.postMessage({
        type: 'fixSingleIssue',
        file: file,
        line: line,
        rule: rule,
        message: message
      });
    }

    function copyGitAddCommands(commands) {
      vscode.postMessage({
        type: 'copyGitAddCommands',
        gitAddCommands: commands
      });
    }

    function toggleFileSection(index) {
      const issuesDiv = document.getElementById('file-issues-' + index);
      const iconSpan = document.getElementById('collapse-icon-' + index);

      if (issuesDiv.classList.contains('collapsed')) {
        issuesDiv.classList.remove('collapsed');
        iconSpan.classList.remove('collapsed');
      } else {
        issuesDiv.classList.add('collapsed');
        iconSpan.classList.add('collapsed');
      }
    }

    function toggleWorkspaceSection() {
      const issuesDiv = document.getElementById('file-issues-workspace');
      const iconSpan = document.getElementById('collapse-icon-workspace');
      if (!issuesDiv || !iconSpan) return;

      if (issuesDiv.classList.contains('collapsed')) {
        issuesDiv.classList.remove('collapsed');
        iconSpan.classList.remove('collapsed');
      } else {
        issuesDiv.classList.add('collapsed');
        iconSpan.classList.add('collapsed');
      }
    }

    function openFile(file) {
      vscode.postMessage({ type: 'openFile', file: file });
    }

    function setFilter(filter) {
      currentFilter = filter;

      // Update button states
      document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.filter === filter) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // Filter issues
      const issues = document.querySelectorAll('.issue');
      issues.forEach(issue => {
        if (filter === 'all' || issue.dataset.severity === filter) {
          issue.classList.remove('hidden');
        } else {
          issue.classList.add('hidden');
        }
      });

      // Hide file sections that have no visible issues
      const fileSections = document.querySelectorAll('.file-section');
      fileSections.forEach(section => {
        const visibleIssues = section.querySelectorAll('.issue:not(.hidden)');
        if (visibleIssues.length === 0) {
          section.classList.add('hidden');
        } else {
          section.classList.remove('hidden');
        }
      });
    }

    function expandAll() {
      const fileIssuesDivs = document.querySelectorAll('.file-issues');
      const collapseIcons = document.querySelectorAll('.collapse-icon');
      fileIssuesDivs.forEach(div => div.classList.remove('collapsed'));
      collapseIcons.forEach(icon => icon.classList.remove('collapsed'));
    }

    function collapseAll() {
      const fileIssuesDivs = document.querySelectorAll('.file-issues');
      const collapseIcons = document.querySelectorAll('.collapse-icon');
      fileIssuesDivs.forEach(div => div.classList.add('collapsed'));
      collapseIcons.forEach(icon => icon.classList.add('collapsed'));
    }

    // Terminal Activity Log functions
    function toggleTerminal() {
      const body = document.getElementById('terminal-body');
      const toggle = document.getElementById('terminal-toggle');
      if (body && toggle) {
        body.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
      }
    }

    function getStatusIconChar(icon) {
      switch (icon) {
        case 'spinner': return '◐';
        case 'check': return '✓';
        case 'error': return '✗';
        case 'info': return '•';
        default: return '•';
      }
    }

    function escapeHtmlJs(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function addStatusLine(status) {
      const container = document.getElementById('terminal-content');
      if (!container) return;

      const existingLine = document.getElementById('status-' + status.id);
      const line = existingLine || document.createElement('div');
      line.id = 'status-' + status.id;
      line.className = 'status-line';

      const iconClass = status.icon || '';
      const iconChar = getStatusIconChar(status.icon);
      const timestampHtml = status.timestamp
        ? '<span class="status-timestamp">' + escapeHtmlJs(status.timestamp) + '</span>'
        : '';

      line.innerHTML = timestampHtml +
        '<span class="status-icon ' + iconClass + '">' + iconChar + '</span>' +
        '<span class="status-text">' + escapeHtmlJs(status.text) + '</span>';

      if (!existingLine) {
        container.appendChild(line);
      }

      // Auto-scroll to bottom
      const body = document.getElementById('terminal-body');
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    }

    function clearTerminal() {
      const container = document.getElementById('terminal-content');
      if (container) container.innerHTML = '';
    }

    // Handle status messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'status':
          addStatusLine(message);
          break;
        case 'statusClear':
          clearTerminal();
          break;
      }
    });
  </script>
</body>
</html>`;
}
