#!/bin/bash
set -e

echo ""
echo "🦙 PiLlama Installer"
echo "===================="
echo ""

# Node.js
if ! command -v node &> /dev/null; then
  echo "📦 Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
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
sudo npm link

# I2C + SPI
echo ""
read -p "Enable I2C and SPI? (recommended for hardware projects) [y/N] " yn
if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
  sudo raspi-config nonint do_i2c 0
  sudo raspi-config nonint do_spi 0
  sudo apt-get install -y i2c-tools python3-smbus
  echo "✓ I2C and SPI enabled"
fi

# Ollama
echo ""
if ! command -v ollama &> /dev/null; then
  echo "📦 Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
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
