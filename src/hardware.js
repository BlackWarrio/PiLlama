'use strict';

const { execSync } = require('child_process');
const chalk = require('chalk');
const { ask } = require('./ai');

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch { return ''; }
}

function detectHardware() {
  return {
    i2c:    run('i2cdetect -y 1') || run('i2cdetect -y 0'),
    usb:    run('lsusb'),
    gpio:   run('gpio readall') || run('raspi-gpio get'),
    serial: run('ls /dev/serial*') + run('ls /dev/ttyUSB* 2>/dev/null') + run('ls /dev/ttyACM* 2>/dev/null'),
    spi:    run('ls /dev/spidev*'),
    camera: run('vcgencmd get_camera') || run('libcamera-hello --list-cameras 2>&1 | head -5'),
    board:  run('cat /proc/cpuinfo | grep Model'),
    os:     run('cat /etc/os-release | head -3'),
  };
}

module.exports = async function detect() {
  console.log(chalk.cyan('🔍 Scanning connected hardware...\n'));

  const hw = detectHardware();
  const lines = [];

  if (hw.board)  { console.log(chalk.bold('Board:'));  console.log(hw.board + '\n');  lines.push('Board: ' + hw.board); }
  if (hw.i2c)    { console.log(chalk.bold('I2C devices:')); console.log(hw.i2c + '\n');  lines.push('I2C scan:\n' + hw.i2c); }
  if (hw.usb)    { console.log(chalk.bold('USB devices:')); console.log(hw.usb + '\n');  lines.push('USB:\n' + hw.usb); }
  if (hw.serial) { console.log(chalk.bold('Serial ports:')); console.log(hw.serial + '\n'); lines.push('Serial: ' + hw.serial); }
  if (hw.spi)    { console.log(chalk.bold('SPI devices:')); console.log(hw.spi + '\n');  lines.push('SPI: ' + hw.spi); }
  if (hw.camera) { console.log(chalk.bold('Camera:')); console.log(hw.camera + '\n'); lines.push('Camera: ' + hw.camera); }
  if (hw.gpio)   { console.log(chalk.bold('GPIO:')); console.log(hw.gpio + '\n');  lines.push('GPIO:\n' + hw.gpio); }

  if (!lines.length) {
    console.log(chalk.yellow('No hardware interfaces detected. Make sure I2C/SPI are enabled via raspi-config.\n'));
    return;
  }

  console.log(chalk.cyan('🤖 Asking AI to identify components...\n'));
  try {
    const summary = await ask([
      { role: 'system', content: 'You are a Raspberry Pi hardware expert. Identify connected components from scan output. Be brief and specific.' },
      { role: 'user', content: 'Identify these components:\n' + lines.join('\n') },
    ]);
    console.log(chalk.bold('Detected components:'));
    console.log(chalk.white(summary) + '\n');
    console.log(chalk.gray('Tip: Run `kiro-bridge generate` to create a control script for these components.\n'));
  } catch (e) {
    console.log(chalk.yellow('(AI identification unavailable: ' + e.message + ')'));
  }
};
