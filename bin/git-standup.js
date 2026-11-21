#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { summarize, renderMarkdown } from '../src/report.js';
import { dailyBreakdown } from '../src/daily.js';
import { standupToCsv } from '../src/csv.js';

const HELP = [
  'git-standup — summarize recent local commits across repositories',
  '',
  'Usage: git-standup [options]',
  '',
  'Repository selection:',
  '  --root PATH          Look for Git repositories in PATH and immediate children',
  '  --repo PATH          Include a specific repository (repeatable)',
  '',
  'Date range (local calendar):',
  '  (default)            Yesterday',
  '  --today              Today so far',
  '  --days N             Previous N complete days (1–365)',
  '  --since YYYY-MM-DD   Start date, inclusive',
  '  --until YYYY-MM-DD   End date, inclusive',
  '',
  'Author filters:',
  '  (default)            Only configured Git user.email for each repository',
  '  --author TEXT        Match author name or email containing TEXT',
  '  --all-authors        Include contributors beyond the configured Git user',
  '  --include-merges     Include merge commits',
  '',
  'Output:',
  '  --json               Print structured JSON instead of Markdown',
  '  --csv                Export counts-only CSV (no commit messages)',
  '  --require-complete   Fail if any repository cannot be scanned in full',
  '  --daily              Include commits and active repos per local calendar day',
  '  --top N              Show at most N commits per repo in Markdown (1–2000)',
  '  --output PATH        Save a new file (never overwrite an existing file)',
  '  -h, --help           Show this message',
  '',
  'Examples:',
  '  git-standup --root ~/code',
  '  git-standup --root ~/code --days 7',
  '  git-standup --root ~/code --days 7 --daily --top 5',
  '  git-standup --root ~/code --days 7 --csv --daily --output activity.csv',
  '  git-standup --repo ~/code/app --repo ~/code/docs --today',
  '  git-standup --root ~/code --since 2026-11-01 --until 2026-11-20 --json',
].join('\n');

function parseOptions(args) {
  const options = { repos: [] };
  let selectRange = '';
  const take = (index, flag) => {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing value for ' + flag + '.');
    return value;
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '-h' || flag === '--help') options.help = true;
    else if (flag === '--root') options.root = take(i++, flag);
    else if (flag === '--repo') options.repos.push(take(i++, flag));
    else if (flag === '--author') options.author = take(i++, flag);
    else if (flag === '--all-authors') options.allAuthors = true;
    else if (flag === '--include-merges') options.includeMerges = true;
    else if (flag === '--json') options.json = true;
    else if (flag === '--csv') options.csv = true;
    else if (flag === '--require-complete') options.requireComplete = true;
    else if (flag === '--daily') options.daily = true;
    else if (flag === '--top') {
      const raw = take(i++, flag);
      if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) > 2000) throw new Error('--top must be an integer 1–2000.');
      options.top = Number(raw);
    }
    else if (flag === '--output') options.output = take(i++, flag);
    else if (flag === '--today') {
      if (selectRange) throw new Error('Use only one primary date range mode.');
      selectRange = 'today'; options.today = true;
    } else if (flag === '--days') {
      if (selectRange) throw new Error('Use only one primary date range mode.');
      selectRange = 'days'; options.days = Number(take(i++, flag));
    } else if (flag === '--since') {
      if (selectRange) throw new Error('Use only one primary date range mode.');
      selectRange = 'since'; options.since = take(i++, flag);
    } else if (flag === '--until') {
      options.until = take(i++, flag);
    } else throw new Error('Unknown argument: ' + flag + '. Try --help.');
  }
  if (options.author && options.allAuthors) throw new Error('Choose --author or --all-authors, not both.');
  if (options.today && options.until) throw new Error('Cannot combine --today and --until.');
  if (options.root && options.repos.length) throw new Error('Choose --root or explicit --repo entries, not both.');
  if (options.json && options.csv) throw new Error('Choose --json or --csv, not both.');
  if ((options.json || options.csv) && options.top) throw new Error('--top only affects Markdown.');
  return options;
}

try {
  const opts = parseOptions(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(HELP + '\n');
  } else {
    const report = summarize(opts);
    if (opts.daily) report.daily = dailyBreakdown(report);
    const result = opts.csv ? standupToCsv(report, { daily: Boolean(opts.daily) }) :
      opts.json ? JSON.stringify(report, null, 2) + '\n' :
      renderMarkdown(report, { top: opts.top ?? null });
    if (opts.output) {
      writeFileSync(opts.output, result, { encoding: 'utf8', flag: 'wx' });
      process.stderr.write('Saved standup report to ' + opts.output + '\n');
    } else process.stdout.write(result);
  }
} catch (error) {
  process.stderr.write('git-standup: ' + (error.message || String(error)) + '\n');
  process.exitCode = 1;
}
