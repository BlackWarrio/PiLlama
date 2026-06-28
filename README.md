# 🦙 PiLlama

Ollama AI robot assistant for Raspberry Pi. One command does everything.

## Install on Raspberry Pi

```bash
git clone https://github.com/YOUR_USERNAME/PiLlama.git
cd PiLlama
bash install.sh
```

The installer sets up Node.js, Ollama, and pulls a model for you.

## Usage

```bash
pillama pull tinyllama      # download a model
pillama run                 # start the agent (uses last pulled model)
pillama run llama3.2:1b     # start with a specific model
```

## What it does

Once running, PiLlama is a fully autonomous agent. Tell it what you want — it figures out the rest:

- 🔍 **Detects hardware** — scans I2C, USB, GPIO, SPI, serial, and camera on startup
- 🤖 **Identifies components** — tells you exactly what's connected
- 🔎 **Searches the web** — looks up library docs, pinouts, datasheets (DuckDuckGo, no API key)
- 📦 **Installs anything** — pip3, apt, npm, or `git clone`
- ⬇️ **Downloads files** — from any URL
- 📄 **Writes and runs scripts** — Python, Bash, or Node.js
- 📁 **Manages files** — read, write, delete, list (asks permission for your files)
- 💻 **Runs shell commands** — with confirmation before anything destructive
- 🧠 **Spawns sub-agents** — delegates complex subtasks to focused AI instances
- 🔄 **Pulls new models** — mid-session if needed

```
pillama run

🔍 Scanning hardware...
Detected: L298N motor driver (I2C 0x60), HC-SR04 ultrasonic sensor (GPIO), USB camera

You: make the robot drive forward and stop when it detects an obstacle
PiLlama: Installing RPi.GPIO and writing obstacle-avoidance script.

📦 Install: pip3 install RPi.GPIO   → Proceed? [y/N]
📄 Script: pillama_1234567890.py    → Run? [y/N]

You: now add a web dashboard to control it from my phone
PiLlama: I'll install Flask, write a web server, and set it up as a service.
```

## Config

Config is stored at `~/.pillama/config.json`.

| Key | Default | Description |
|---|---|---|
| `model` | `tinyllama` | Ollama model to use |
| `baseUrl` | `http://localhost:11434` | Ollama server URL |

## Safety

Every command, script, and file operation is shown before it runs. Nothing executes without your confirmation.
