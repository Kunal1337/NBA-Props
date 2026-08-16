const { execFile } = require('child_process');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', 'python', 'wnba_stats.py');
// Windows dev machines typically only have `python` on PATH; Linux hosts
// (Render, etc.) typically only have `python3`.
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
// Cold Python process startup (importing numpy/pandas/nba_api) alone can
// exceed 25s on a heavily CPU-throttled host (e.g. Render's free tier,
// 0.1 CPU) before any actual work happens — confirmed in production logs.
const TIMEOUT_MS = 60000;

/**
 * Run Backend/python/wnba_stats.py with the given args and parse its
 * single-line JSON stdout. The script prints `{"error": "..."}` and exits
 * 1 on known failures (player not found, upstream error) — those are
 * still valid JSON, so we parse stdout first and only fall back to
 * stderr/err.message if stdout isn't parseable JSON at all.
 *
 * @param {string[]} args
 * @param {{ stdin?: string, timeoutMs?: number }} [opts]
 */
function runWnbaScript(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      PYTHON_BIN,
      [SCRIPT_PATH, ...args],
      { timeout: opts.timeoutMs || TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (stdout) {
          try {
            const parsed = JSON.parse(stdout);
            if (parsed && parsed.error) return reject(new Error(parsed.error));
            return resolve(parsed);
          } catch (_) {
            // fall through — stdout wasn't valid JSON, treat as a crash
          }
        }
        const detail = stderr || err?.message || 'Empty response from wnba_stats.py';
        const timedOut = err?.killed && err?.signal === 'SIGTERM';
        reject(new Error(timedOut ? `Timed out after ${opts.timeoutMs || TIMEOUT_MS}ms: ${detail}` : detail));
      },
    );
    if (opts.stdin != null) {
      child.stdin.end(opts.stdin);
    }
  });
}

module.exports = { runWnbaScript };
