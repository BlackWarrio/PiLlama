'use strict';

const axios = require('axios');
const { loadConfig } = require('./config');
const chalk = require('chalk');

const OLLAMA_DEFAULT = 'http://localhost:11434';

async function ask(messages) {
  const cfg = loadConfig();
  const base = cfg.baseUrl || OLLAMA_DEFAULT;
  const model = cfg.model || 'tinyllama';

  try {
    const res = await axios.post(
      `${base}/api/chat`,
      { model, messages, stream: false },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return res.data.message.content.trim();
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.error(chalk.red('Ollama is not running. Start it with: ollama serve'));
    } else {
      console.error(chalk.red('Ollama error: ' + e.message));
    }
    process.exit(1);
  }
}

module.exports = { ask };
