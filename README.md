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
    node bin/git-standup.js --repo ~/code/project-a --repo ~/code/project-b
    node bin/git-standup.js --root ~/code --since 2026-11-01 --until 2026-11-20

You can also run the CLI through an npm link from a checkout, or use the published package metadata as the basis for a future npm release. This project is **not claimed to be published on npm**.

If you run it without options, it searches the current working directory and its immediate children for Git repositories.

## Output

The Markdown report groups commits by repository and includes subject, timestamp and short SHA. The JSON format provides the same structured information:

**CSV mode** is designed for safer sharing and spreadsheet inspection. `--csv` exports each repository name and its count of matching commits, without commit subjects, hashes, author emails or absolute paths. With `--daily`, the CSV contains one row for every repository and calendar day in the selected period, including zero-activity days. CSV cells containing potentially executable spreadsheet formulas are escaped. Repository names are still metadata that may be sensitive.

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
- `--csv`: output a UTF-8 CSV (BOM + CRLF) of aggregated repository counts, without commit metadata. Cannot be combined with `--json` or `--top`.
- `--daily`: include a local-calendar-day table showing commit counts and number of active repositories. In JSON mode adds a `daily` array. In CSV mode provides **repository × local day** counts (maximum 366 days).
- `--top N`: show only the N newest commit bullets per repository in Markdown (1–2,000), retaining accurate full counts; incompatible with `--json`.
- `--output PATH`: save a new file rather than print to stdout.
- `-h`, `--help`: display usage.

## Design and privacy

The tool uses Git locally through Node.js child processes. No shell commands are dynamically evaluated. There are no HTTP requests, telemetry, account connections, or dependencies. The report omits commit-author email addresses and absolute repository paths to make it easier to share.

Git log collection includes all locally known refs (`git log --all`), up to 2,000 log entries per repository, and excludes merges unless requested. Workspace auto-discovery scans one directory level, with a maximum of 120 repositories. It does not clone or fetch remote repositories.

**Author filtering:** The default uses the `user.email` configured for each repository. If no email is configured, all authors are included and the report records a warning. Override with `--author` or `--all-authors` when necessary.

## Implementation status

This is a development implementation; automated tests were deliberately deferred to the owner's consolidated test cycle. Do not treat results as validated until those tests are complete.

## Source

- `src/report.js` — local repository discovery, commit collection, date windows and report generation
- `src/daily.js` — pure local-day aggregation and Markdown activity timeline
- `src/csv.js` — privacy-focused per-repository and per-day CSV summaries
- `bin/git-standup.js` — CLI argument parser, help and Markdown/JSON output
- `package.json` — ESM and CLI metadata
- `LICENSE` — MIT

## Author

Built by Meir Dvir · https://github.com/MeiRR17
