'use strict';
/** Terminate a process tree without depending on Windows-only taskkill. */
const { execFile } = require('child_process');

function killTree(pid) {
  const n = Number(pid);
  if (!n || n === process.pid) return Promise.resolve();
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      execFile('taskkill', ['/PID', String(n), '/T', '/F'], { windowsHide: true }, () => resolve());
    });
  }
  return new Promise((resolve) => {
    try { process.kill(n, 'SIGTERM'); } catch (_) { /* already gone */ }
    setTimeout(() => {
      try { process.kill(n, 'SIGKILL'); } catch (_) { /* already gone */ }
      resolve();
    }, 1500);
  });
}

module.exports = { killTree };
