import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dailyMarkdown } from './daily.js';

const MAX_REPOSITORIES = 120;
const MAX_COMMITS_PER_REPO = 2000;
const SEP = '\x1f';
const END = '\x1e';

function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 12 * 1024 * 1024,
  });
  if (result.error) throw new Error('Could not execute Git: ' + result.error.message);
  if (result.status !== 0) {
    throw new Error((result.stderr || '').trim() || 'Git exited with code ' + result.status);
  }
  return result.stdout.trim();
}

/** Look for repos in the specified directory and its immediate children. */
export function discoverRepos(root) {
  const folder = resolve(root);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new Error('Workspace directory does not exist: ' + folder);
  }
  const paths = [];
  if (existsSync(join(folder, '.git'))) paths.push(folder);
  else {
    const children = readdirSync(folder, { withFileTypes: true });
    for (const child of children) {
      if (!child.isDirectory() || child.name.startsWith('.') || child.name === 'node_modules') continue;
      const candidate = join(folder, child.name);
      if (existsSync(join(candidate, '.git'))) {
        // Never silently drop repositories from an aggregate report.
        if (paths.length >= MAX_REPOSITORIES) {
          throw new RangeError('More than 120 repositories found; select a smaller workspace or use --repo.');
        }
        paths.push(candidate);
      }
    }
  }
  return paths;
}

function localDay(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function parseDay(input) {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error('Use YYYY-MM-DD for dates.');
  }
  const [y, m, d] = input.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw new Error('Invalid calendar date: ' + input);
  }
  return date;
}
function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
/** Convert inclusive local-calendar dates to exclusive timestamp boundaries. */
export function windowForOptions(options, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let begin, end;
  if (options.since) {
    begin = parseDay(options.since);
    end = options.until ? addDays(parseDay(options.until), 1) : addDays(today, 1);
  } else if (options.today) {
    begin = today; end = addDays(today, 1);
  } else {
    const days = Number(options.days ?? 1);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Days must be 1–365.');
    end = options.until ? addDays(parseDay(options.until), 1) : today;
    begin = addDays(end, -days);
  }
  if (options.until && !options.since && options.today) throw new Error('Cannot combine --today with --until.');
  if (begin >= end) throw new Error('Start date must not exceed the end date.');
  return { begin, end, firstDay: localDay(begin), lastDay: localDay(addDays(end, -1)) };
}

function configuredEmail(repo) {
  try { return git(repo, ['config', '--get', 'user.email']).trim().toLowerCase(); }
  catch { return ''; }
}

function parseLog(output) {
  if (!output) return [];
  return output.split(END).map(item => item.trim()).filter(Boolean).flatMap(entry => {
    const fields = entry.split(SEP);
    if (fields.length !== 6) return [];
    const [sha, name, email, timestamp, subject, body] = fields;
    return [{ sha, name, email, timestamp, subject: subject.replace(/[\r\n]+/g, ' ').trim(), body }];
  });
}

/** Collect local Git commit metadata; no shell evaluation or network calls. */
export function summarize(options = {}) {
  const requested = options.repos?.length ? options.repos.map(x => resolve(x)) : discoverRepos(options.root ?? process.cwd());
  const roots = [...new Set(requested)];
  if (roots.length > MAX_REPOSITORIES) throw new Error('At most 120 repositories can be scanned.');
  if (!roots.length) throw new Error('No Git repositories found. Use --root or --repo to specify locations.');
  const range = windowForOptions(options);
  const reports = [], warnings = [];
  let incomplete = false;
  const observed = new Set();

  for (const root of roots) {
    try {
      const canonical = git(root, ['rev-parse', '--show-toplevel']);
      if (observed.has(canonical)) continue;
      observed.add(canonical);
      const title = basename(canonical);
      const authorEmail = options.allAuthors || options.author ? '' : configuredEmail(canonical);
      if (!authorEmail && !options.allAuthors && !options.author) {
        warnings.push(title + ': no configured Git email; all authors included.');
      }
      const args = [
        'log', '--all', '--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1e',
        '--since=' + range.begin.toISOString(), '--before=' + range.end.toISOString(),
        // Collect one extra row to detect truncation reliably.
        '--max-count=' + (MAX_COMMITS_PER_REPO + 1),
      ];
      if (!options.includeMerges) args.push('--no-merges');
      const collected = parseLog(git(canonical, args));
      const truncated = collected.length > MAX_COMMITS_PER_REPO;
      const logs = collected.slice(0, MAX_COMMITS_PER_REPO);
      if (truncated) {
        incomplete = true;
        if (options.requireComplete) {
          throw new RangeError(title + ': more than 2,000 commits in the Git time window. Narrow the date range.');
        }
      }
      const commits = logs.filter(commit => {
        if (options.author) {
          const term = options.author.toLowerCase();
          return (commit.name + ' ' + commit.email).toLowerCase().includes(term);
        }
        if (authorEmail) return commit.email.toLowerCase() === authorEmail;
        return true;
      }).map(commit => ({
        sha: commit.sha,
        subject: commit.subject,
        author: commit.name,
        timestamp: commit.timestamp,
      }));
      commits.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      reports.push({ name: title, commits });
      if (truncated) {
        warnings.push(title + ': Git log limit exceeded; totals may omit commits.');
      }
    } catch (error) {
      if (options.requireComplete) throw error;
      incomplete = true;
      warnings.push(basename(root) + ': ' + error.message);
    }
  }
  reports.sort((a, b) => b.commits.length - a.commits.length || a.name.localeCompare(b.name));
  const total = reports.reduce((sum, repo) => sum + repo.commits.length, 0);
  return {
    range: { since: range.firstDay, until: range.lastDay },
    scanned: reports.length,
    active: reports.filter(repo => repo.commits.length > 0).length,
    total,
    repositories: reports,
    warnings,
    complete: !incomplete,
  };
}

function escapeMarkdown(value) {
  return value.replace(/([\\\x60*_{}[\]()#+.!|>~-])/g, '\\$1');
}
/** Render a stable standup note sorted by repository and commit timestamp. */
export function renderMarkdown(report, { top = null } = {}) {
  if (top !== null && (!Number.isInteger(top) || top < 1 || top > 2000)) {
    throw new RangeError('Top must be an integer between 1 and 2,000.');
  }
  const lines = [
    '# Git standup — ' + report.range.since + (report.range.until === report.range.since ? '' : ' to ' + report.range.until),
    '',
    report.total + ' commits across ' + report.active + ' active repositories (' + report.scanned + ' scanned).',
    '',
  ];
  if (!report.total) lines.push('No commits found in the selected period.', '');
  if (Array.isArray(report.daily)) lines.push(dailyMarkdown(report.daily));
  for (const repo of report.repositories) {
    if (!repo.commits.length) continue;
    lines.push('## ' + escapeMarkdown(repo.name) + ' (' + repo.commits.length + ')', '');
    for (const commit of (top === null ? repo.commits : repo.commits.slice(0, top))) {
      const time = commit.timestamp.slice(0, 16).replace('T', ' ');
      lines.push('- ' + escapeMarkdown(commit.subject) + ' — ' + time + ' (' + commit.sha.slice(0, 7) + ')');
    }
    if (top !== null && repo.commits.length > top) {
      lines.push('- ... ' + (repo.commits.length - top) + ' additional commits omitted from display (full counts preserved).');
    }
    lines.push('');
  }
  if (report.warnings.length) {
    lines.push('## Notes', '');
    for (const warning of report.warnings) lines.push('- ' + escapeMarkdown(warning));
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
