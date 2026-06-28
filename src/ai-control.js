'use strict';

const { execSync } = require('child_process');
const readline = require('readline');
const chalk = require('chalk');
const { ask } = require('./ai');

const SYSTEM = `You are an AI controller for a Raspberry Pi. The user will give you tasks.
You will respond with a JSON object like: { "cmd": "shell command here", "explain": "what it does" }
Rules:
- Only use standard Linux/Raspberry Pi commands
- Never use rm -rf on system dirs, never format disks
- For file writes, use echo or tee
- Keep commands to one line when possible
- If a task is dangerous or unclear, set cmd to "" and explain the issue`;

const DANGEROUS = ['mkfs', 'dd if=', 'rm -rf /', 'chmod 777 /', ':(){:|:&};:'];

function isSafe(cmd) {
  return !DANGEROUS.some(d => cmd.includes(d));
}

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000 }).trim();
  } catch (e) {
    return e.stderr || e.message;
  }
}

module.exports = async function control() {
  const history = [{ role: 'system', content: SYSTEM }];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(chalk.cyan('🤖 AI Control Mode') + chalk.gray(' — AI will execute commands on this Pi.'));
  console.log(chalk.yellow('⚠  Commands will run as the current user. Type exit to quit.\n'));

  const prompt = () => rl.question(chalk.green('Task: '), async (input) => {
    input = input.trim();
    if (!input || input === 'exit') { console.log(chalk.gray('Exited AI control.')); return rl.close(); }

    history.push({ role: 'user', content: input });

    try {
      const raw = await ask(history);
      let parsed;

      try { parsed = JSON.parse(raw); }
      catch { parsed = { cmd: '', explain: raw }; }

      console.log(chalk.cyan(`\nPlan: ${parsed.explain}`));

      if (!parsed.cmd) {
        console.log(chalk.yellow('No command to run.\n'));
        history.push({ role: 'assistant', content: raw });
        return prompt();
      }

      if (!isSafe(parsed.cmd)) {
        console.log(chalk.red('⛔ Blocked: command flagged as dangerous.\n'));
        return prompt();
      }

      console.log(chalk.gray('$ ' + parsed.cmd));

      // Confirm before running
      const confirmRl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ok = await new Promise(r => confirmRl.question(chalk.yellow('Run? [y/N] '), a => { confirmRl.close(); r(a.trim().toLowerCase() === 'y'); }));

      if (!ok) { console.log(chalk.gray('Skipped.\n')); return prompt(); }

      const output = runCmd(parsed.cmd);
      console.log(chalk.white(output || '(no output)') + '\n');
      history.push({ role: 'assistant', content: raw });
      history.push({ role: 'user', content: 'Command output: ' + output });
    } catch (e) {
      console.log(chalk.red('Error: ' + e.message) + '\n');
    }
    prompt();
  });

  prompt();
};
