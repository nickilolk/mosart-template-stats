/**
 * Installs Mosart Template Stats as a Windows Service.
 *
 * Prerequisites:
 *   npm install -g node-windows
 *
 * Usage:
 *   node install-service.js          — install & start the service on port 3002
 *   PORT=8080 node install-service.js — install on a custom port
 *   node install-service.js remove   — uninstall the service
 *
 * Once installed the service appears in services.msc as
 * "Mosart Template Stats" and starts automatically on boot.
 */

const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'Mosart Template Stats',
  description: 'Real-time Viz Mosart template usage statistics dashboard',
  script: path.join(__dirname, 'server.js'),
  env: [{ name: 'PORT', value: process.env.PORT || '3002' }],
});

if (process.argv[2] === 'remove') {
  svc.on('uninstall', () => console.log('Service removed.'));
  svc.uninstall();
} else {
  svc.on('install', () => {
    console.log('Service installed. Starting...');
    svc.start();
  });
  svc.on('alreadyinstalled', () => console.log('Service is already installed.'));
  svc.on('start', () => console.log('Service started.'));
  svc.install();
}
