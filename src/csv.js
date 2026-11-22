/**
 * Privacy-aware CSV exports of a Git Standup report.
 *
 * Output contains repo labels and counts only. No commit subjects, author
 * emails, hashes, remote URLs, full paths or messages are included.
 *
 * --daily mode emits a rectangular local-calendar-day x repository dataset,
 * including days without activity so spreadsheet comparisons are honest.
 */
const MAX_REPOS = 120;
const MAX_DAYS = 366;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function localDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  return [String(year).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}
function parseLocalDay(day) {
  if (typeof day !== 'string' || !DATE.test(day)) throw new RangeError('Expected YYYY-MM-DD range.');
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) {
    throw new RangeError('Invalid calendar date in report.');
  }
  return date;
}
function daysBetween(since, until) {
  const start = parseLocalDay(since), end = parseLocalDay(until);
  if (start > end) throw new RangeError('Date range is reversed.');
  const days = [];
  for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    if (days.length >= MAX_DAYS) throw new RangeError('CSV daily export supports at most 366 days.');
    days.push([String(current.getFullYear()).padStart(4, '0'),
      String(current.getMonth() + 1).padStart(2, '0'), String(current.getDate()).padStart(2, '0')].join('-'));
  }
  return days;
}
function cell(value) {
  let text = String(value ?? '');
  // Prevent formula execution when opening repo names in spreadsheet software.
  if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
function row(values) { return values.map(cell).join(','); }
function validReport(report) {
  if (!report || !report.range || !Array.isArray(report.repositories) ||
      report.repositories.length > MAX_REPOS) throw new TypeError('Expected a Git Standup report (max 120 repositories).');
  for (const repo of report.repositories) {
    if (!repo || typeof repo.name !== 'string' || !Array.isArray(repo.commits)) {
      throw new TypeError('Malformed repository in standup report.');
    }
  }
}

/**
 * Export repository-level summaries by default, or repository x day counts.
 * @param {object} report Output from summarize()
 * @param {{daily?:boolean}} options
 */
export function standupToCsv(report, { daily = false } = {}) {
  validReport(report);
  // CSV has no safe place for a top-level partial-results warning. Refuse
  // incomplete or unverified reports rather than publish misleading totals.
  if (report.complete !== true) {
    throw new Error('CSV export requires a complete Git scan. Narrow the date range or repair scan errors.');
  }
  if (typeof daily !== 'boolean') throw new TypeError('daily must be boolean.');
  const lines = [];
  if (!daily) {
    lines.push(row(['repository', 'commits']));
    for (const repo of report.repositories) lines.push(row([repo.name, repo.commits.length]));
  } else {
    const days = daysBetween(report.range.since, report.range.until);
    lines.push(row(['date', 'repository', 'commits']));
    for (const repo of report.repositories) {
      const counts = new Map(days.map(day => [day, 0]));
      for (const commit of repo.commits) {
        const day = localDay(commit.timestamp);
        if (counts.has(day)) counts.set(day, counts.get(day) + 1);
      }
      for (const day of days) lines.push(row([day, repo.name, counts.get(day)]));
    }
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
