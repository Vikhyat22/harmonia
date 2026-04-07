#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import {
  analyzeAutoplayLogReport,
  formatAutoplayValidationReport,
  getPendingValidationRows,
} from '../src/lib/autoplayValidation.js';

const MATRIX_PATH = new URL('../docs/superpowers/plans/2026-04-03-autoplay-source-validation.md', import.meta.url);

async function main() {
  const [command = 'pending', ...rest] = process.argv.slice(2);

  if (command === 'pending') {
    const markdown = await readFile(MATRIX_PATH, 'utf8');
    const pendingRows = getPendingValidationRows(markdown);

    console.log('Pending Autoplay Live Validation Rows');
    console.log('');

    if (pendingRows.length === 0) {
      console.log('Everything in the validation matrix is checked off.');
      return;
    }

    let currentSection = null;
    for (const row of pendingRows) {
      if (row.section !== currentSection) {
        currentSection = row.section;
        console.log(currentSection);
      }
      console.log(`- ${row.mode}`);
    }
    return;
  }

  if (command === 'analyze') {
    const options = parseAnalyzeArgs(rest);
    const input = options.file
      ? await readFile(options.file, 'utf8')
      : await readStdin();

    const report = analyzeAutoplayLogReport(input, {
      source: options.source,
      mode: options.mode,
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(formatAutoplayValidationReport(report));
    return;
  }

  printUsage();
  process.exitCode = 1;
}

function parseAnalyzeArgs(args) {
  const options = {
    source: null,
    mode: null,
    file: null,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--source') {
      options.source = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--mode') {
      options.mode = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (!options.file) {
      options.file = arg;
    }
  }

  return options;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }

    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/autoplay-validation-helper.mjs pending');
  console.log('  node scripts/autoplay-validation-helper.mjs analyze --source spotify --mode strict-original path/to/logs.txt');
  console.log('  pbpaste | node scripts/autoplay-validation-helper.mjs analyze --source youtube --mode strict-original');
}

await main();
