#!/bin/bash
set -e

echo ""
echo "🦙 PiLlama Installer"
echo "===================="
echo ""

# Use sudo only if not already root
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  if command -v sudo &> /dev/null; then
    SUDO="sudo"
  else
    echo "❌ This script must be run as root, or sudo must be available."
    echo "   Try: su -c 'bash install.sh'  or  sudo bash install.sh"
    exit 1
  fi
fi

# Node.js
if ! command -v node &> /dev/null; then
  echo "📦 Installing Node.js..."
  TMP_NODE=$(mktemp /tmp/nodesource_setup.XXXXXX.sh)
  curl -fsSL https://deb.nodesource.com/setup_20.x -o "$TMP_NODE"
  $SUDO bash "$TMP_NODE"
  rm -f "$TMP_NODE"
  $SUDO apt-get install -y nodejs
else
  echo "✓ Node.js $(node -v)"
fi

# npm deps
echo ""
echo "📦 Installing dependencies..."
npm install --production

chmod +x PiLlama.js

echo ""
echo "🔧 Installing pillama command..."
$SUDO npm link

# I2C + SPI
echo ""
read -p "Enable I2C and SPI? (recommended for hardware projects) [y/N] " yn
if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
  $SUDO raspi-config nonint do_i2c 0
  $SUDO raspi-config nonint do_spi 0
  $SUDO apt-get install -y i2c-tools python3-smbus
  echo "✓ I2C and SPI enabled"
fi

# Ollama
echo ""
if ! command -v ollama &> /dev/null; then
  echo "📦 Installing Ollama..."
  TMP_OLLAMA=$(mktemp /tmp/ollama_install.XXXXXX.sh)
  curl -fsSL https://ollama.com/install.sh -o "$TMP_OLLAMA"
  $SUDO bash "$TMP_OLLAMA"
  rm -f "$TMP_OLLAMA"
else
  echo "✓ Ollama found"
fi

# Pull a model
echo ""
echo "Choose a model:"
echo "  1) tinyllama  — fastest, ~600MB (recommended for Pi)"
echo "  2) llama3.2:1b"
echo "  3) phi3:mini"
echo "  4) Enter custom model name"
read -p "Pick [1-4, default 1]: " choice
case "$choice" in
  2) MODEL="llama3.2:1b" ;;
  3) MODEL="phi3:mini" ;;
  4) read -p "Model name: " MODEL ;;
  *) MODEL="tinyllama" ;;
esac

echo ""
pillama pull "$MODEL"

echo ""
echo "✅ PiLlama ready!"
echo ""
echo "  pillama run              — start agent with default model"
echo "  pillama run llama3.2:1b  — start with a specific model"
echo "  pillama pull <model>     — download another model"
echo ""
