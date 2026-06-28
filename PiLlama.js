#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const chalk = require('chalk');
const { loadConfig, saveConfig, ensureConfigDir } = require('./src/config');

async function main() {
  ensureConfigDir();
  const [,, cmd, model] = process.argv;

  console.log(chalk.magenta.bold('\n🦙 PiLlama') + chalk.gray(' — Ollama AI agent for Raspberry Pi\n'));

  switch (cmd) {
    case 'pull': return pullModel(model);
    case 'run':  return require('./src/agent')(model);
    default:     return help();
  }
}

function pullModel(model) {
  if (!model) {
    console.log(chalk.yellow('Usage: pillama pull <model>'));
    console.log(chalk.gray('  e.g. pillama pull tinyllama'));
    console.log(chalk.gray('  e.g. pillama pull llama3.2:1b'));
    return;
  }
  console.log(chalk.cyan(`📥 Pulling ${model}...\n`));
  try {
    execSync(`ollama pull ${model}`, { stdio: 'inherit' });
    const cfg = loadConfig();
    cfg.model = model;
    saveConfig(cfg);
    console.log(chalk.green(`\n✓ ${model} ready. Run it with: pillama run ${model}\n`));
  } catch (e) {
    console.error(chalk.red('Pull failed: ' + e.message));
    process.exit(1);
  }
}

function help() {
  console.log(chalk.bold('Commands:\n'));
  console.log(`  ${chalk.magenta('pillama pull <model>')}   Download an Ollama model`);
  console.log(`  ${chalk.magenta('pillama run  <model>')}   Start the AI agent (model optional, uses last pulled)\n`);
  console.log(chalk.gray('  e.g. pillama pull tinyllama'));
  console.log(chalk.gray('  e.g. pillama run'));
  console.log(chalk.gray('  e.g. pillama run llama3.2:1b\n'));
}

main().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
