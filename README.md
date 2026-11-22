# Git Standup

A local command-line tool that answers **“What did I work on yesterday?”** by summarizing Git commits across your repositories. Generates readable Markdown or structured JSON, without network access, external packages, or hosted accounts.

## Requirements

- Node.js 22 or newer
- Git installed and available in PATH
- One Git repository or a workspace directory containing several repositories

## Quick start

Run this project directly from its checkout:

    node bin/git-standup.js --help
    node bin/git-standup.js --root ~/code
    node bin/git-standup.js --root ~/code --days 7
    node bin/git-standup.js --root ~/code --today
    node bin/git-standup.js --root ~/code --days 7 --daily --top 5
    node bin/git-standup.js --root ~/code --days 7 --csv --daily --output activity.csv
    node bin/git-standup.js --root ~/code --days 7 --csv --require-complete
    node bin/git-standup.js --root ~/code --days 7 --counts-only --daily
    node bin/git-standup.js --root ~/code --days 7 --counts-only --by-type
    node bin/git-standup.js --root ~/code --days 7 --counts-only --by-type --daily
    node bin/git-standup.js --root ~/code --days 7 --counts-only --by-type --csv --daily --output types.csv
    node bin/git-standup.js --repo ~/code/project-a --repo ~/code/project-b
    node bin/git-standup.js --root ~/code --since 2026-11-01 --until 2026-11-20

You can also run the CLI through an npm link from a checkout, or use the published package metadata as the basis for a future npm release. This project is **not claimed to be published on npm**.

If you run it without options, it searches the current working directory and its immediate children for Git repositories.

## Output

The Markdown report groups commits by repository and includes subject, timestamp and short SHA. The JSON format provides the same structured information. If different repositories share the same folder name, display labels are disambiguated with numeric suffixes such as `app` and `app [2]`, without exposing parent directory paths. The daily active-repository counts treat them as distinct repositories:

**Counts-only JSON mode** (`--counts-only`) emits a structured local report with date range, scanned/active repository totals and commit counts per repository. With `--daily`, it adds aggregate day-level commit and active-repository counts. It never includes commit subjects, SHAs, author details, raw warning strings, or absolute paths. Like CSV, this mode **requires a complete scan** and refuses misleading partial totals. Repository names and activity counts can still be sensitive. Programmatic callers can use `countsOnlySummary(report)` from `src/summary.js`.

**Optional type breakdown** (`--counts-only --by-type`) adds per-repository and global totals for recognized Conventional Commit categories (`feat`, `fix`, `perf`, `docs`, `ci`, etc.) and an `other` bucket for unknown or non-conventional headers. Each commit is counted exactly once. It uses existing, complete Git scan metadata and does not include subjects, SHAs, author details or absolute paths. This is a *descriptive grouping*, not a validator of messages or proof of completed work; commit subject classifications can be misleading. The additional type distributions can still be sensitive. Combine with `--daily` to also include a **per-day `byType` breakdown** under each daily record, including zero-activity days. The existing global and per-repository type summaries still cover the full selected range. The new daily buckets use the same computer-local calendar dates as `--daily` (not UTC dates), reconcile their category counts to that day's commit total, and fail if commit timestamps are invalid or daily records contradict the count projection.

**Conventional Commit type CSV** (`--counts-only --by-type --csv`) serializes the already validated complete-scan type breakdown as fixed-schema, BOM-prefixed, CRLF-delimited CSV. It includes a `total` row and one `repository` row per project with counts for every supported Conventional Commit type and `other`. With `--daily`, additional `day` rows aggregate each local calendar date **across all repositories**, including inactive days; they are not repository-by-day intersections. `record_kind`, `date` and `repository` distinguish the row meanings. Each row's type counts must sum to its `commits` count. Repo names are formula-neutralized spreadsheet cells, and no commit subject, author, hash, remote or absolute path is exported. This mode requires `--counts-only --by-type`, cannot be combined with `--json`, and refuses incomplete scans. The existing `--csv` mode without `--counts-only` retains its original repository/day layout.

**CSV mode** is designed for safer sharing and spreadsheet inspection. CSV export now **fails closed** if a repository scan is incomplete or the report is not explicitly marked complete; no partial CSV output file is written. Narrow the date range, resolve inaccessible repositories, and retry when this happens. `--csv` exports each repository name and its count of matching commits, without commit subjects, hashes, author emails or absolute paths. With `--daily`, the CSV contains one row for every repository and calendar day in the selected period, including zero-activity days. CSV cells containing potentially executable spreadsheet formulas are escaped. Repository names are still metadata that may be sensitive.

    node bin/git-standup.js --root ~/code --json
    node bin/git-standup.js --root ~/code --days 7 --output standup.md

The output file is created only when it does not already exist, protecting previous reports from accidental overwrites. **Daily timeline** includes even days without commits; the optional top-N Markdown view only limits printed bullets, not the underlying total and per-day metrics.

## Options

- `--root PATH`: scan a Git repository or a workspace containing Git repositories as direct children.
- `--repo PATH`: include a specific repository; this option can be repeated.
- `--today`: local calendar day so far.
- `--days N`: previous N complete local calendar days, excluding today (default N=1, meaning yesterday).
- `--since YYYY-MM-DD`: inclusive first date.
- `--until YYYY-MM-DD`: inclusive last date; can be combined with `--days` or `--since`.
- `--author TEXT`: include authors whose name or email contains the supplied text.
- `--all-authors`: include every contributor; otherwise the CLI matches each repository's configured `user.email`.
- `--include-merges`: include merge commits (excluded by default).
- `--json`: print a machine-readable report.
- `--csv`: output a UTF-8 CSV (BOM + CRLF) of aggregated repository counts, without commit metadata. Refuses incomplete scan results; does not produce misleading partial spreadsheets. Can combine with `--counts-only --by-type` for a fixed-schema type breakdown including optional day totals; otherwise remains incompatible with `--counts-only`. Cannot combine with `--json` or `--top`.
- `--counts-only`: emit a redacted counts-only JSON report without per-commit metadata. Requires `complete: true` and cannot be combined with `--json`, `--csv`, or `--top`.
- `--by-type`: only with `--counts-only`, add aggregate and per-repository counts by Conventional Commit category, with unknown/nonconventional subjects grouped as `other`. Combine with `--daily` for a per-day `byType` count map, including inactive days.
- `--require-complete`: return a nonzero exit code instead of reporting partial results if Git log collection exceeds 2,000 commits per repository or a repository scan fails.
- `--daily`: include a local-calendar-day table showing commit counts and number of active repositories. In JSON mode adds a `daily` array. In CSV mode provides **repository × local day** counts (maximum 366 days).
- `--top N`: show only the N newest commit bullets per repository in Markdown (1–2,000), retaining accurate full counts; incompatible with `--json`.
- `--output PATH`: save a new file rather than print to stdout.
- `-h`, `--help`: display usage.

## Design and privacy

The tool uses Git locally through Node.js child processes. No shell commands are dynamically evaluated. There are no HTTP requests, telemetry, account connections, or dependencies. The report omits commit-author email addresses and absolute repository paths to make it easier to share.

Git log collection includes all locally known refs (`git log --all`), with at most 2,000 retained entries per repository (the scan reads one extra entry to detect truncation), and excludes merges unless requested. Workspaces are scanned one directory level deep, with a maximum of 120 repositories; the tool does not clone or fetch from remotes. Local author filtering happens **after** bounded collection, so a range with many unrelated-author commits may require narrowing the dates. Incomplete reports set `complete: false` in JSON, emit a warning on stderr in all CLI formats, and include a prominent warning in Markdown. Malformed Git records are treated as a scan failure rather than silently discarded. Use `--require-complete` to reject incomplete totals instead of generating a report.

**Author filtering:** The default uses the `user.email` configured for each repository. If no email is configured, all authors are included and the report records a warning. Override with `--author` or `--all-authors` when necessary.

## Implementation status

This is a development implementation; automated tests were deliberately deferred to the owner's consolidated test cycle. Do not treat results as validated until those tests are complete.

## Source

- `src/report.js` — local repository discovery, commit collection, date windows and report generation
- `src/daily.js` — pure local-day aggregation and Markdown activity timeline
- `src/csv.js` — privacy-focused repository/day CSV and complete-scan Conventional Commit type CSV
- `src/summary.js` — counts-only complete-scan JSON projection with optional Conventional Commit type counts excluding per-commit metadata
- `bin/git-standup.js` — CLI argument parser, help and Markdown/JSON output
- `package.json` — ESM and CLI metadata
- `LICENSE` — MIT

## Author

Built by Meir Dvir · https://github.com/MeiRR17
