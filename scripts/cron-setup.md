# Weekly Audit Cron Setup

This document explains how to schedule the Noesis Quality Engine to run automatically every week.

## What It Does

The `weekly-audit.py` script runs the full 7-dimension CI audit against all 125 blog posts, appends the results to a rolling history log, and updates the quality dashboard. It exits with code `1` if any post fails the audit, which makes it ideal for CI/CD pipelines as well as cron jobs.

## Option A: System Cron (macOS / Linux)

### 1. Make the scripts executable

```bash
chmod +x /Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog/scripts/ci-audit.py
chmod +x /Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog/scripts/weekly-audit.py
chmod +x /Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog/scripts/generate-dashboard.py
```

### 2. Open your crontab

```bash
crontab -e
```

### 3. Add the weekly line

The following line runs the audit every **Monday at 03:17** (off-peak minute):

```cron
17 3 * * 1 cd /Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog && /usr/bin/python3 scripts/weekly-audit.py >> docs/weekly-audit.log 2>&1
```

> **Note:** If your Python 3 is at a different path (e.g., from Homebrew or Pyenv), replace `/usr/bin/python3` with the output of `which python3`.

### 4. Verify the cron is installed

```bash
crontab -l
```

You should see the line above listed.

## Option B: Kimi Work Scheduled Job

If you are using Kimi Work, you can register a recurring local-conversation job instead of system cron:

1. Open Kimi Work automation settings.
2. Create a new scheduled job with trigger: **Weekly, Monday, 03:17**.
3. Point the execution to the `weekly-audit.py` script.
4. Set the workspace to `/Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog`.

The job will run the audit and keep the history log automatically.

## Output Files

After each run, check these files in `docs/`:

| File | Purpose |
|------|---------|
| `ci-audit-report.json` | Latest full audit (per-post scores, classifications) |
| `ci-audit-history.jsonl` | Rolling history of every weekly run (one JSON line per run) |
| `quality-dashboard.md` | Human-readable summary dashboard |
| `weekly-audit.log` | Console output from the cron (if redirected) |

## Alerting

If you want email or Slack alerts when the audit fails, wrap the cron line:

```cron
17 3 * * 1 cd /Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog && /usr/bin/python3 scripts/weekly-audit.py >> docs/weekly-audit.log 2>&1 || echo "AUDIT FAILED" | mail -s "Noesis Weekly Audit Failure" your-email@example.com
```

On macOS you can also use `osascript` to show a native notification:

```cron
17 3 * * 1 cd /Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog && /usr/bin/python3 scripts/weekly-audit.py >> docs/weekly-audit.log 2>&1 || osascript -e 'display notification "Weekly audit failed." with title "Noesis Quality Engine"'
```

## Troubleshooting

- **Python not found:** Use `which python3` to get the correct path.
- **Permission denied:** Ensure `chmod +x` was run on all scripts.
- **JSON decode error:** If `ci-audit-report.json` is malformed, delete it and run `ci-audit.py` manually once to regenerate.
- **Missing posts:** Verify `src/content/posts/` contains the `.md` files.

## Manual Trigger

You can always run the audit manually:

```bash
cd /Volumes/madara/2026/twc-vault/01-Projects/tryambakam-noesis/synchronocities-blog
python3 scripts/weekly-audit.py
```

Then open `docs/quality-dashboard.md` to review the results.
