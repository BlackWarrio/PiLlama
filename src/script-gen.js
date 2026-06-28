'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const { ask } = require('./ai');

const SYSTEM = `You are a Raspberry Pi developer. Generate complete, working scripts for Pi hardware.
Rules:
- Use Python 3 unless Bash is more appropriate
- Include all imports and pin definitions
- Add brief comments for hardware wiring
- Script must run standalone with no missing dependencies
- Output ONLY the script code, no explanation`;

module.exports = async function generate(args) {
  let description = args.join(' ');

  if (!description) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    description = await new Promise(r => rl.question(chalk.green('Describe what you want to control: '), a => { rl.close(); r(a.trim()); }));
  }

  if (!description) return console.log(chalk.yellow('No description provided.'));

  console.log(chalk.cyan('\n🤖 Generating script...\n'));

  const code = await ask([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: description },
  ]);

  // detect language from first line
  const isShell = code.startsWith('#!/bin/bash') || code.startsWith('#!/bin/sh');
  const ext = isShell ? 'sh' : 'py';
  const filename = `kiro_script_${Date.now()}.${ext}`;
  const outPath = path.join(process.cwd(), filename);

  fs.writeFileSync(outPath, code);
  if (isShell) fs.chmodSync(outPath, '755');

  console.log(code + '\n');
  console.log(chalk.green(`✓ Saved to ${filename}`));
  if (!isShell) console.log(chalk.gray(`Run with: python3 ${filename}`));
  else console.log(chalk.gray(`Run with: bash ${filename}`));
};
