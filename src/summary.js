/**
 * Counts-only JSON for sharing activity without the underlying commit data.
 * Intentionally project only approved scalar fields: no subject, SHA, author,
 * author email, absolute path, Git remote, warning text or commit bodies.
 */
const COMMIT_TYPES = Object.freeze([
  'feat', 'fix', 'perf', 'refactor', 'docs', 'build', 'ci',
  'test', 'chore', 'style', 'revert', 'other',
]);
const recognized = new Set(COMMIT_TYPES.slice(0, -1));
const header = /^([a-z][a-z0-9-]*)(?:\(([^()\r\n]{1,80})\))?(!)?:\s*(\S.*)$/i;

function commitType(subject) {
  const matched = header.exec(subject.trim());
  const type = matched?.[1]?.toLowerCase();
  return recognized.has(type) ? type : 'other';
}

function typeCounts(commits) {
  const counts = Object.fromEntries(COMMIT_TYPES.map(type => [type, 0]));
  for (const commit of commits) {
    if (!commit || typeof commit.subject !== 'string') {
      throw new TypeError('Commit type totals require valid local Git subject metadata.');
    }
    counts[commitType(commit.subject)]++;
  }
  return counts;
}

/**
 * Optional Conventional Commit group counts for the same complete scan.
 * Unknown/malformed headers fall into "other"; no raw subjects leave memory.
 * The result is a descriptive grouping, not a Conventional Commit compliance audit.
 */
export function countsOnlySummary(report, { byType = false } = {}) {
  if (typeof byType !== 'boolean') throw new TypeError('byType must be boolean.');
  if (!report || report.complete !== true || !report.range ||
      !Array.isArray(report.repositories) || report.repositories.length > 120) {
    throw new Error('Counts-only JSON requires a complete Git scan of at most 120 repositories.');
  }
  const dates = report.range;
  if (typeof dates.since !== 'string' || typeof dates.until !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dates.since) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dates.until)) {
    throw new TypeError('A valid report date range is required.');
  }
  const repositories = report.repositories.map(repo => {
    if (!repo || typeof repo.name !== 'string' || repo.name.length > 250 ||
        !Array.isArray(repo.commits) || repo.commits.length > 2000) {
      throw new TypeError('Report contains an invalid repository summary.');
    }
    return {
      name: repo.name,
      commits: repo.commits.length,
      ...(byType ? { byType: typeCounts(repo.commits) } : {}),
    };
  });
  const total = repositories.reduce((sum, repo) => sum + repo.commits, 0);
  const active = repositories.filter(repo => repo.commits > 0).length;
  if (report.total !== total || report.active !== active ||
      report.scanned !== repositories.length) {
    throw new TypeError('Report count totals are inconsistent.');
  }
  const result = {
    format: 'git-standup-counts-v1',
    range: { since: dates.since, until: dates.until },
    complete: true,
    scanned: repositories.length,
    active,
    total,
    repositories,
    advisory: 'Repository labels, grouped commit types and activity patterns may still be sensitive. No commit subjects or other commit details are included.',
  };
  if (byType) {
    const counts = Object.fromEntries(COMMIT_TYPES.map(type => [type, 0]));
    for (const repo of repositories) {
      for (const type of COMMIT_TYPES) counts[type] += repo.byType[type];
    }
    result.byType = counts;
    result.typeAdvisory = 'Types are inferred from recognized Conventional Commit subject prefixes. Nonconventional or unknown types count as other; no message contents are exported.';
  }
  if (report.daily !== undefined) {
    if (!Array.isArray(report.daily) || report.daily.length > 366) {
      throw new TypeError('Invalid daily breakdown.');
    }
    result.daily = report.daily.map(day => {
      if (!day || typeof day.date !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
          !Number.isSafeInteger(day.commits) || day.commits < 0 ||
          !Number.isSafeInteger(day.activeRepositories) ||
          day.activeRepositories < 0 || day.activeRepositories > repositories.length) {
        throw new TypeError('Invalid daily entry.');
      }
      return { date: day.date, commits: day.commits, activeRepositories: day.activeRepositories };
    });
    if (byType) {
      // No per-commit metadata leaves this projection. Reuse the same local
      // civil-day semantics as dailyBreakdown(): UTC slicing is incorrect for
      // commits near midnight and on DST transition dates.
      const dailyLookup = new Map(result.daily.map(day => [
        day.date, Object.fromEntries(COMMIT_TYPES.map(type => [type, 0])),
      ]));
      if (dailyLookup.size !== result.daily.length) {
        throw new TypeError('Duplicate daily dates in the report.');
      }
      for (const repo of report.repositories) {
        for (const commit of repo.commits) {
          if (!commit || typeof commit.subject !== 'string') {
            throw new TypeError('Missing commit type metadata.');
          }
          const time = new Date(commit.timestamp);
          if (!Number.isFinite(time.getTime())) {
            throw new TypeError('Invalid commit timestamp in daily type breakdown.');
          }
          const key = [time.getFullYear(), String(time.getMonth() + 1).padStart(2, '0'),
            String(time.getDate()).padStart(2, '0')].join('-');
          const bucket = dailyLookup.get(key);
          if (bucket) bucket[commitType(commit.subject)]++;
        }
      }
      result.daily = result.daily.map(day => {
        const types = dailyLookup.get(day.date);
        if (Object.values(types).reduce((sum, count) => sum + count, 0) !== day.commits) {
          throw new TypeError('Daily commit-type totals do not reconcile with daily counts.');
        }
        return { ...day, byType: types };
      });
    }
  }
  return result;
}
