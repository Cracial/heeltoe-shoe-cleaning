
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectDir = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'sepatu-kinclong-playwright-')
);
const dbPath = path.join(tempDir, 'playwright.db');
const serverPath = path.join(projectDir, 'server.js');

let stopping = false;

const server = spawn(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', serverPath],
  {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: '3000',
      HOST: '127.0.0.1',
      DB_PATH: dbPath,
      SEED_DEMO: '0',
    },
    stdio: 'inherit',
  }
);

function cleanup() {
  try {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  } catch (error) {
    console.error('Gagal menghapus database Playwright sementara:', error);
  }
}

function stop(signal) {
  if (stopping) return;
  stopping = true;

  if (server.exitCode === null && server.signalCode === null) {
    server.kill(signal);
  }
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

server.on('error', (error) => {
  console.error('Gagal menjalankan server Playwright:', error);
  cleanup();
  process.exitCode = 1;
});

server.on('exit', (code, signal) => {
  cleanup();

  if (signal === 'SIGINT' || signal === 'SIGTERM') {
    process.exitCode = 0;
  } else {
    process.exitCode = code ?? 1;
  }
});
