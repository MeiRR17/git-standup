/**
 * Aggregate existing local Git standup reports into a calendar-day activity
 * timeline. No subprocesses, network calls, or source-code access.
 *
 * Day boundaries follow the computer's local timezone, matching the
 * existing --today/--since/--until semantics.
 */
function localDay(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) return null;
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError('Report contains an invalid date.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year, month - 1, day);
  if (result.getFullYear() !== year || result.getMonth() + 1 !== month || result.getDate() !== day) {
    throw new RangeError('Report date is not on the calendar.');
  }
  return result;
}
function dayString(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

/**
 * Each day shows commit count and number of contributing repositories.
 * Days without commits are included rather than silently omitted.
 */
export function dailyBreakdown(report) {
  if (!report || !report.range || !Array.isArray(report.repositories)) {
    throw new TypeError('Expected a Git Standup summary.');
  }
  const first = parseDay(report.range.since), last = parseDay(report.range.until);
  const days = [];
  const lookup = new Map();
  for (let current = new Date(first), count = 0; current <= last; current.setDate(current.getDate() + 1)) {
    if (++count > 366) throw new RangeError('A daily breakdown supports up to 366 days.');
    const entry = { date: dayString(current), commits: 0, activeRepositories: 0 };
    days.push(entry);
    lookup.set(entry.date, { entry, seen: new Set() });
  }
  for (const repo of report.repositories) {
    for (const commit of repo.commits) {
      const day = localDay(commit.timestamp);
      const value = lookup.get(day);
      if (!value) continue;
      value.entry.commits++;
      value.seen.add(repo.name);
    }
  }
  for (const value of lookup.values()) value.entry.activeRepositories = value.seen.size;
  return days;
}

export function dailyMarkdown(days) {
  if (!Array.isArray(days)) throw new TypeError('Expected daily entries.');
  const lines = ['### Daily activity (local timezone)', '', '| Date | Commits | Active repositories |',
    '| --- | ---: | ---: |'];
  for (const day of days) {
    lines.push('| ' + day.date + ' | ' + day.commits + ' | ' + day.activeRepositories + ' |');
  }
  lines.push('');
  return lines.join('\n');
}
