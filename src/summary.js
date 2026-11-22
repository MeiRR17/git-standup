/**
 * Counts-only JSON for sharing activity without the underlying commit data.
 * Intentionally project only approved scalar fields: no subject, SHA, author,
 * author email, absolute path, Git remote, warning text or commit bodies.
 */
export function countsOnlySummary(report) {
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
    return { name: repo.name, commits: repo.commits.length };
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
    advisory: 'Repository labels and activity patterns may still be sensitive. No commit details are included.',
  };
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
  }
  return result;
}
