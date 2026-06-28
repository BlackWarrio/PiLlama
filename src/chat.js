'use strict';

const readline = require('readline');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { ask } = require('./ai');
const { webSearch } = require('./search');

// ── hardware detection ────────────────────────────────────────────────────────

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch { return ''; }
}

function detectHardware() {
  return {
    board:  run('cat /proc/cpuinfo | grep Model'),
    i2c:    run('i2cdetect -y 1') || run('i2cdetect -y 0'),
    usb:    run('lsusb'),
    serial: [run('ls /dev/serial*'), run('ls /dev/ttyUSB* 2>/dev/null'), run('ls /dev/ttyACM* 2>/dev/null')].filter(Boolean).join(' '),
    spi:    run('ls /dev/spidev*'),
    camera: run('vcgencmd get_camera') || run('libcamera-hello --list-cameras 2>&1 | head -5'),
    gpio:   run('gpio readall') || run('raspi-gpio get'),
  };
}

async function scanAndDescribe() {
  console.log(chalk.cyan('🔍 Scanning hardware...\n'));
  const hw = detectHardware();
  const lines = Object.entries(hw).filter(([,v]) => v).map(([k,v]) => `${k}:\n${v}`);

  if (!lines.length) return 'No hardware interfaces detected.';

  for (const line of lines) console.log(chalk.gray(line) + '\n');

  console.log(chalk.cyan('🤖 Identifying components...\n'));
  const summary = await ask([
    { role: 'system', content: 'You are a Raspberry Pi hardware expert. Identify connected components from scan output. Be brief and list each component on one line.' },
    { role: 'user', content: lines.join('\n') },
  ]);
  console.log(chalk.bold('Detected:') + ' ' + chalk.white(summary) + '\n');
  return summary;
}

// ── agent actions ─────────────────────────────────────────────────────────────

const DANGEROUS = ['mkfs', 'dd if=', 'rm -rf /', 'chmod 777 /'];

function isSafe(cmd) {
  return !DANGEROUS.some(d => cmd.includes(d));
}

function runCmd(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 30000 }).trim(); }
  catch (e) { return e.stderr || e.message; }
}

async function confirm(rl, question) {
  return new Promise(r => rl.question(question, a => r(a.trim().toLowerCase() === 'y')));
}

async function executeAction(action, rl) {
  if (action.type === 'search') {
    console.log(chalk.cyan(`\n🔎 Searching: ${action.query}\n`));
    const results = await webSearch(action.query);
    console.log(chalk.gray(results) + '\n');
    return results;
  }

  if (action.type === 'script') {
    const ext = action.lang === 'bash' ? 'sh' : 'py';
    const file = `kiro_${Date.now()}.${ext}`;
    const outPath = path.join(process.cwd(), file);
    fs.writeFileSync(outPath, action.content);
    if (ext === 'sh') fs.chmodSync(outPath, '755');
    console.log(chalk.green(`\n📄 Script: ${file}\n`) + chalk.gray(action.content) + '\n');
    const run = await confirm(rl, chalk.yellow(`Run ${file}? [y/N] `));
    if (run) {
      const out = runCmd(ext === 'sh' ? `bash ${outPath}` : `python3 ${outPath}`);
      console.log(chalk.white(out || '(no output)') + '\n');
      return out;
    }
    return `Saved to ${file} (not run)`;
  }

  if (action.type === 'install') {
    const cmd = action.manager === 'pip3' ? `pip3 install ${action.pkg}`
              : action.manager === 'npm'  ? `npm install -g ${action.pkg}`
              : `sudo apt-get install -y ${action.pkg}`;
    console.log(chalk.cyan(`\n📦 Install: ${cmd}`));
    const ok = await confirm(rl, chalk.yellow('Proceed? [y/N] '));
    if (ok) {
      const out = runCmd(cmd);
      console.log(chalk.white(out || '(done)') + '\n');
      return out;
    }
    return 'Install skipped';
  }

  if (action.type === 'shell') {
    if (!isSafe(action.cmd)) {
      console.log(chalk.red('⛔ Blocked: dangerous command.\n'));
      return 'Blocked';
    }
    console.log(chalk.cyan('\n$ ') + chalk.white(action.cmd));
    const ok = await confirm(rl, chalk.yellow('Run? [y/N] '));
    if (ok) {
      const out = runCmd(action.cmd);
      console.log(chalk.white(out || '(no output)') + '\n');
      return out;
    }
    return 'Skipped';
  }
}

// ── main chat loop ────────────────────────────────────────────────────────────

const SYSTEM = (hw) => `You are PiLlama, an AI robot assistant running on a Raspberry Pi powered by Ollama.

Detected hardware:
${hw}

You help users build robots by writing code, installing libraries, and running commands.

When the user asks you to DO something (not just explain), reply with a JSON object:
{
  "explain": "what you're doing",
  "actions": [
    { "type": "search", "query": "search query" },
    { "type": "install", "manager": "pip3|apt|npm", "pkg": "package-name" },
    { "type": "script", "lang": "python|bash", "content": "full script here" },
    { "type": "shell", "cmd": "one-line command" }
  ]
}

Use "search" when you need up-to-date information, library docs, or hardware pinouts.
For conversation / questions, reply with plain text.
Keep explanations concise. Scripts must be complete and runnable.`;

module.exports = async function chat() {
  let hwSummary;
  try {
    hwSummary = await scanAndDescribe();
  } catch (e) {
    hwSummary = 'Hardware scan unavailable: ' + e.message;
    console.log(chalk.yellow(hwSummary + '\n'));
  }

  const history = [{ role: 'system', content: SYSTEM(hwSummary) }];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(chalk.magenta('💬 Chat started. Describe what you want your robot to do.') + chalk.gray(' (exit to quit)\n'));

  const prompt = () => rl.question(chalk.green('You: '), async (input) => {
    input = input.trim();
    if (!input || input === 'exit') { console.log(chalk.gray('Bye!')); return rl.close(); }

    history.push({ role: 'user', content: input });

    try {
      const raw = await ask(history);
      history.push({ role: 'assistant', content: raw });

      // try to parse as agent action
      let parsed = null;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {}

      if (parsed && parsed.actions?.length) {
        console.log(chalk.magenta('\nPiLlama: ') + chalk.white(parsed.explain) + '\n');
        const results = [];
        for (const action of parsed.actions) {
          const result = await executeAction(action, rl);
          if (result) results.push(result);
        }
        // feed results back so AI can continue
        if (results.length) {
          history.push({ role: 'user', content: 'Results:\n' + results.join('\n') });
        }
      } else {
        console.log(chalk.magenta('PiLlama: ') + chalk.white(raw) + '\n');
      }
    } catch (e) {
      console.log(chalk.red('Error: ' + e.message) + '\n');
      history.pop();
    }

    prompt();
  });

  prompt();
};
