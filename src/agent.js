'use strict';

const readline = require('readline');
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const axios = require('axios');
const { loadConfig, saveConfig } = require('./config');

// ── helpers ───────────────────────────────────────────────────────────────────

function sh(cmd, timeout = 30000) {
  const r = spawnSync('bash', ['-c', cmd], { encoding: 'utf8', timeout });
  return (r.stdout || '') + (r.stderr || '');
}

function ask(rl, question) {
  return new Promise(r => rl.question(question, r));
}

async function confirm(rl, msg) {
  const a = await ask(rl, chalk.yellow(msg) + chalk.gray(' [y/N] '));
  return a.trim().toLowerCase() === 'y';
}

// ── permission store ──────────────────────────────────────────────────────────

const allowedPaths = new Set();

async function checkPathAccess(rl, filePath) {
  const abs = path.resolve(filePath);
  if (allowedPaths.has(abs)) return true;
  // agent's own created files are always allowed
  if (abs.startsWith(path.resolve('./pillama_'))) { allowedPaths.add(abs); return true; }
  const ok = await confirm(rl, `Allow PiLlama to access ${abs}?`);
  if (ok) allowedPaths.add(abs);
  return ok;
}

// ── hardware detection ────────────────────────────────────────────────────────

function detectHardware() {
  const r = cmd => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); } catch { return ''; } };
  return {
    board:  r('cat /proc/cpuinfo | grep Model'),
    os:     r('cat /etc/os-release | head -5'),
    memory: r('free -h | head -2'),
    disk:   r('df -h / | tail -1'),
    i2c:    r('i2cdetect -y 1') || r('i2cdetect -y 0'),
    usb:    r('lsusb'),
    serial: [r('ls /dev/serial* 2>/dev/null'), r('ls /dev/ttyUSB* 2>/dev/null'), r('ls /dev/ttyACM* 2>/dev/null')].filter(Boolean).join(' '),
    spi:    r('ls /dev/spidev* 2>/dev/null'),
    camera: r('vcgencmd get_camera 2>/dev/null') || r('libcamera-hello --list-cameras 2>&1 | head -5'),
    gpio:   r('gpio readall 2>/dev/null') || r('raspi-gpio get 2>/dev/null'),
    python: r('python3 --version'),
    node:   r('node --version'),
    pip:    r('pip3 --version'),
  };
}

// ── web search ────────────────────────────────────────────────────────────────

async function webSearch(query) {
  try {
    const res = await axios.get('https://api.duckduckgo.com/', {
      params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 }, timeout: 8000,
    });
    const d = res.data;
    const results = [];
    if (d.AbstractText) results.push(d.AbstractText);
    if (d.Answer) results.push(d.Answer);
    for (const r of (d.RelatedTopics || []).slice(0, 4)) if (r.Text) results.push(r.Text);
    return results.length ? results.join('\n') : 'No results found.';
  } catch (e) {
    return 'Search failed: ' + e.message;
  }
}

// ── ollama ────────────────────────────────────────────────────────────────────

async function ollamaChat(messages, model, baseUrl) {
  const res = await axios.post(
    `${baseUrl}/api/chat`,
    { model, messages, stream: false },
    { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
  );
  return res.data.message.content.trim();
}

// ── sub-agent ─────────────────────────────────────────────────────────────────

async function runSubAgent(task, model, baseUrl) {
  console.log(chalk.magenta(`\n[sub-agent] Task: ${task}\n`));
  const messages = [
    { role: 'system', content: 'You are a specialist sub-agent. Complete the task given and return your result as plain text.' },
    { role: 'user', content: task },
  ];
  try {
    const result = await ollamaChat(messages, model, baseUrl);
    console.log(chalk.gray('[sub-agent result]\n') + chalk.white(result) + '\n');
    return result;
  } catch (e) {
    return 'Sub-agent failed: ' + e.message;
  }
}

// ── action executor ───────────────────────────────────────────────────────────

async function execute(action, rl, model, baseUrl) {
  switch (action.type) {

    case 'shell': {
      console.log(chalk.cyan('\n$ ') + chalk.white(action.cmd));
      if (!action.auto) {
        if (!await confirm(rl, 'Run this command?')) return 'skipped';
      }
      const out = sh(action.cmd);
      console.log(chalk.white(out || '(no output)') + '\n');
      return out || '(done)';
    }

    case 'script': {
      const ext = action.lang === 'bash' ? 'sh' : action.lang === 'node' ? 'js' : 'py';
      const file = `pillama_${Date.now()}.${ext}`;
      const filePath = path.resolve(file);
      fs.writeFileSync(filePath, action.content);
      if (ext === 'sh') fs.chmodSync(filePath, '755');
      console.log(chalk.green(`\n📄 ${file}\n`) + chalk.gray(action.content) + '\n');
      if (!await confirm(rl, `Run ${file}?`)) return `Saved to ${file} (not run)`;
      const runner = ext === 'sh' ? `bash ${filePath}` : ext === 'js' ? `node ${filePath}` : `python3 ${filePath}`;
      const out = sh(runner, 60000);
      console.log(chalk.white(out || '(no output)') + '\n');
      return out || '(done)';
    }

    case 'write_file': {
      const abs = path.resolve(action.path);
      if (!abs.startsWith(path.resolve('./pillama_'))) {
        if (!await checkPathAccess(rl, action.path)) return 'access denied';
      }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, action.content);
      console.log(chalk.green(`✓ Written: ${abs}\n`));
      return `Written: ${abs}`;
    }

    case 'read_file': {
      if (!await checkPathAccess(rl, action.path)) return 'access denied';
      try {
        const content = fs.readFileSync(path.resolve(action.path), 'utf8');
        console.log(chalk.gray(`[${action.path}]\n`) + chalk.white(content.slice(0, 2000)) + '\n');
        return content;
      } catch (e) { return 'Read error: ' + e.message; }
    }

    case 'delete_file': {
      if (!await checkPathAccess(rl, action.path)) return 'access denied';
      if (!await confirm(rl, `Delete ${action.path}?`)) return 'skipped';
      fs.rmSync(path.resolve(action.path), { recursive: true, force: true });
      console.log(chalk.green(`✓ Deleted: ${action.path}\n`));
      return `Deleted: ${action.path}`;
    }

    case 'list_files': {
      const dir = action.path || '.';
      if (!await checkPathAccess(rl, dir)) return 'access denied';
      const files = sh(`find ${dir} -maxdepth ${action.depth || 2} -not -path '*/.*'`);
      console.log(chalk.gray(files) + '\n');
      return files;
    }

    case 'install': {
      const mgr = action.manager || 'pip3';
      const cmd = mgr === 'pip3' ? `pip3 install ${action.pkg}`
                : mgr === 'apt'  ? `sudo apt-get install -y ${action.pkg}`
                : mgr === 'npm'  ? `npm install -g ${action.pkg}`
                : mgr === 'git'  ? `git clone ${action.pkg}`
                : action.pkg;
      console.log(chalk.cyan(`\n📦 ${cmd}`));
      if (!await confirm(rl, 'Proceed?')) return 'skipped';
      const out = sh(cmd, 120000);
      console.log(chalk.white(out || '(done)') + '\n');
      return out || '(done)';
    }

    case 'download': {
      const cmd = `wget -q -O ${action.dest || path.basename(action.url)} "${action.url}"`;
      console.log(chalk.cyan(`\n⬇  ${cmd}`));
      if (!await confirm(rl, 'Download?')) return 'skipped';
      const out = sh(cmd, 60000);
      console.log(chalk.white(out || '(done)') + '\n');
      return out || '(done)';
    }

    case 'search': {
      console.log(chalk.cyan(`\n🔎 Searching: ${action.query}\n`));
      const results = await webSearch(action.query);
      console.log(chalk.gray(results) + '\n');
      return results;
    }

    case 'sub_agent': {
      return await runSubAgent(action.task, model, baseUrl);
    }

    case 'ollama_pull': {
      console.log(chalk.cyan(`\n📥 Pulling model: ${action.model}`));
      if (!await confirm(rl, 'Pull?')) return 'skipped';
      const out = sh(`ollama pull ${action.model}`, 300000);
      console.log(chalk.white(out) + '\n');
      return out;
    }

    default:
      return `Unknown action: ${action.type}`;
  }
}

// ── system prompt ─────────────────────────────────────────────────────────────

function buildSystem(hw) {
  return `You are PiLlama, a fully autonomous AI agent running on a Raspberry Pi via Ollama.

DETECTED HARDWARE & SYSTEM:
${hw}

You can accomplish ANY task the user requests. When you need to act, reply ONLY with a JSON object:
{
  "explain": "what you are doing",
  "actions": [ ...one or more actions... ]
}

Available action types:
  { "type": "shell",       "cmd": "bash command",                         "auto": false }
  { "type": "script",      "lang": "python|bash|node", "content": "..." }
  { "type": "write_file",  "path": "relative/path",    "content": "..." }
  { "type": "read_file",   "path": "relative/path" }
  { "type": "delete_file", "path": "relative/path" }
  { "type": "list_files",  "path": ".",                "depth": 2 }
  { "type": "install",     "manager": "pip3|apt|npm|git", "pkg": "name or git url" }
  { "type": "download",    "url": "https://...",        "dest": "filename" }
  { "type": "search",      "query": "search terms" }
  { "type": "sub_agent",   "task": "delegate a focused subtask to another AI instance" }
  { "type": "ollama_pull", "model": "model-name" }

Rules:
- Set "auto": true on shell actions that are non-destructive and clearly safe (e.g. reading system info)
- Always use search when you need up-to-date library docs, pinouts, or unfamiliar APIs
- Use sub_agent to parallelize or delegate complex subtasks
- For file access outside your own created files, the user will be asked for permission
- Reply with plain text for questions or conversation (no JSON)
- Be autonomous: chain multiple actions to fully complete a task without asking the user mid-task unless confirmation is genuinely required`;
}

// ── hardware watcher ──────────────────────────────────────────────────────────

function hwSnapshot() {
  const r = cmd => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); } catch { return ''; } };
  return [
    r('i2cdetect -y 1 2>/dev/null') || r('i2cdetect -y 0 2>/dev/null'),
    r('lsusb'),
    r('ls /dev/ttyUSB* /dev/ttyACM* /dev/serial* 2>/dev/null'),
    r('ls /dev/spidev* 2>/dev/null'),
    r('vcgencmd get_camera 2>/dev/null'),
  ].join('|');
}

function watchHardware(history, interval = 3000) {
  let last = hwSnapshot();
  return setInterval(() => {
    const current = hwSnapshot();
    if (current !== last) {
      last = current;
      const msg = '⚡ New hardware detected — re-scanning...';
      console.log('\n' + chalk.yellow(msg));
      const hw = detectHardware();
      const lines = Object.entries(hw).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join('\n');
      // inject into history so AI is aware next turn
      history.push({ role: 'user', content: `[SYSTEM] Hardware change detected:\n${lines}` });
      console.log(chalk.gray(lines) + '\n');
      process.stdout.write(chalk.green('You: '));
    }
  }, interval);
}

// ── main agent loop ───────────────────────────────────────────────────────────

module.exports = async function runAgent(modelArg) {
  const cfg = loadConfig();
  const model = modelArg || cfg.model || 'tinyllama';
  const baseUrl = cfg.baseUrl || 'http://localhost:11434';

  // save chosen model
  cfg.model = model;
  saveConfig(cfg);

  // scan hardware
  console.log(chalk.cyan('🔍 Scanning hardware...\n'));
  const hw = detectHardware();
  const hwLines = Object.entries(hw).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join('\n');
  console.log(chalk.gray(hwLines) + '\n');

  // identify components via AI
  console.log(chalk.cyan('🤖 Identifying components...\n'));
  let hwSummary = hwLines;
  try {
    hwSummary = await ollamaChat([
      { role: 'system', content: 'You are a Raspberry Pi hardware expert. Identify connected components briefly, one line each.' },
      { role: 'user', content: hwLines },
    ], model, baseUrl);
    console.log(chalk.bold('Detected: ') + chalk.white(hwSummary) + '\n');
  } catch (e) {
    console.log(chalk.yellow('(Could not identify components: ' + e.message + ')\n'));
  }

  const history = [{ role: 'system', content: buildSystem(hwSummary) }];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // watch for newly connected hardware in the background
  const watcher = watchHardware(history);
  rl.on('close', () => clearInterval(watcher));

  console.log(chalk.magenta(`🦙 PiLlama running with ${model}`) + chalk.gray(' — tell me what to build. (exit to quit)\n'));

  const prompt = () => rl.question(chalk.green('You: '), async input => {
    input = input.trim();
    if (!input || input === 'exit') { console.log(chalk.gray('\nBye! 🦙\n')); return rl.close(); }

    history.push({ role: 'user', content: input });

    try {
      const raw = await ollamaChat(history, model, baseUrl);
      history.push({ role: 'assistant', content: raw });

      // try to parse actions
      let parsed = null;
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      } catch {}

      if (parsed?.actions?.length) {
        console.log(chalk.magenta('\nPiLlama: ') + chalk.white(parsed.explain) + '\n');
        const results = [];
        for (const action of parsed.actions) {
          const result = await execute(action, rl, model, baseUrl);
          if (result && result !== 'skipped') results.push(`[${action.type}] ${result}`);
        }
        if (results.length) {
          history.push({ role: 'user', content: 'Action results:\n' + results.join('\n') });
          // let AI reflect on results and continue if needed
          const followUp = await ollamaChat(history, model, baseUrl);
          history.push({ role: 'assistant', content: followUp });
          // only print if it's a text response (not another action batch)
          if (!followUp.includes('"actions"')) {
            console.log(chalk.magenta('PiLlama: ') + chalk.white(followUp) + '\n');
          } else {
            // execute follow-up actions too
            try {
              const m2 = followUp.match(/\{[\s\S]*\}/);
              if (m2) {
                const p2 = JSON.parse(m2[0]);
                if (p2?.actions?.length) {
                  console.log(chalk.magenta('PiLlama: ') + chalk.white(p2.explain) + '\n');
                  for (const action of p2.actions) await execute(action, rl, model, baseUrl);
                }
              }
            } catch {}
          }
        }
      } else {
        console.log(chalk.magenta('PiLlama: ') + chalk.white(raw) + '\n');
      }
    } catch (e) {
      if (e.code === 'ECONNREFUSED') {
        console.log(chalk.red('Ollama is not running. Start it with: ollama serve\n'));
      } else {
        console.log(chalk.red('Error: ' + e.message) + '\n');
      }
      history.pop();
    }

    prompt();
  });

  prompt();
};
