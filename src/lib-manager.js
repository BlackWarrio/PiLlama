'use strict';

const { execSync } = require('child_process');
const readline = require('readline');
const chalk = require('chalk');
const { ask } = require('./ai');

const MANAGERS = { apt: 'sudo apt-get install -y', pip: 'pip3 install', pip3: 'pip3 install', npm: 'npm install -g' };

function runInstall(cmd) {
  console.log(chalk.gray('$ ' + cmd));
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

module.exports = async function install(args) {
  // kiro-bridge install [manager] [package...]
  let manager = null;
  let packages = [];

  if (MANAGERS[args[0]]) {
    manager = args[0];
    packages = args.slice(1);
  } else {
    packages = args;
  }

  if (!packages.length) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const input = await new Promise(r => rl.question(chalk.green('What do you want to install? '), a => { rl.close(); r(a.trim()); }));
    if (!input) return console.log(chalk.yellow('Nothing to install.'));

    // Ask AI to resolve package name and manager
    console.log(chalk.cyan('\n🤖 Resolving package...\n'));
    const advice = await ask([
      { role: 'system', content: 'You are a Raspberry Pi package expert. Given a description or package name, respond with ONLY: <manager> <package> (e.g. "pip3 RPi.GPIO" or "apt python3-smbus"). One line only.' },
      { role: 'user', content: input },
    ]);
    const parts = advice.trim().split(/\s+/);
    manager = parts[0];
    packages = parts.slice(1);
    console.log(chalk.gray(`Resolved: ${manager} ${packages.join(' ')}\n`));
  }

  if (!MANAGERS[manager]) {
    console.log(chalk.red(`Unknown manager: ${manager}. Use: apt, pip3, npm`));
    return;
  }

  for (const pkg of packages) {
    console.log(chalk.cyan(`\nInstalling ${pkg} via ${manager}...`));
    const ok = runInstall(`${MANAGERS[manager]} ${pkg}`);
    console.log(ok ? chalk.green(`✓ ${pkg} installed`) : chalk.red(`✗ Failed to install ${pkg}`));
  }
};
