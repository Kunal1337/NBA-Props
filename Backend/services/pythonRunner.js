const { execFile } = require('child_process');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', 'python', 'wnba_stats.py');
const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const TIMEOUT_MS = 25000;

/**
 * Run Backend/python/wnba_stats.py with the given args and parse its
 * single-line JSON stdout. The script prints `{"error": "..."}` and exits
 * 1 on known failures (player not found, upstream error) — those are
 * still valid JSON, so we parse stdout first and only fall back to
 * stderr/err.message if stdout isn't parseable JSON at all.
 */
function runWnbaScript(args) {
  return new Promise((resolve, reject) => {
    execFile(
      PYTHON_BIN,
      [SCRIPT_PATH, ...args],
      { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
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
        reject(new Error(err ? (stderr || err.message) : 'Empty response from wnba_stats.py'));
      },
    );
  });
}

module.exports = { runWnbaScript };
