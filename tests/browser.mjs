import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profile = await mkdtemp(path.join(process.env.TMPDIR || os.tmpdir(), 'meet-float-test-'));
const checks = [];
const record = message => { checks.push(message); console.log('PASS:', message); };
console.log('Starting isolated Chrome');
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROME_EXECUTABLE,
  ignoreDefaultArgs: ['--disable-extensions'],
  headless: process.env.HEADLESS === '1',
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  viewport: null
});
console.log('Chrome started');
const page = await context.newPage();
context.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.route('https://meet.google.com/**', route => route.fulfill({
    contentType: 'text/html',
    headers: { 'Content-Security-Policy': "require-trusted-types-for 'script'; trusted-types 'none'" },
    body: '<!doctype html><title>Local Meet fixture</title><style>body{background:#202124;color:white;font:18px system-ui}section{display:inline-block;margin:20px}video{display:block;width:320px;height:200px;background:black}</style><h1>Local synthetic call</h1><div id="tiles"></div>'
  }));
  console.log('Loading fixture');
  await page.goto('https://meet.google.com/test-fixture');
  console.log('Creating camera streams');
  await page.evaluate(() => {
    window.testSources = {};
    window.addTile = (id, color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 200;
      const paint = canvas.getContext('2d');
      paint.fillStyle = color; paint.fillRect(0, 0, 320, 200);
      paint.fillStyle = 'white'; paint.font = '30px sans-serif'; paint.fillText(id, 20, 90);
      const stream = canvas.captureStream(5);
      setInterval(() => {
        paint.fillStyle = color; paint.fillRect(0, 0, 320, 200);
        paint.fillStyle = 'white'; paint.fillText(id, 20, 90);
        paint.fillText(String(Date.now()).slice(-5), 20, 140);
      }, 200);
      const tile = document.createElement('section');
      tile.dataset.participantId = id;
      const video = document.createElement('video');
      video.autoplay = true; video.muted = true; video.srcObject = stream;
      tile.append(document.createTextNode(id), video);
      document.getElementById('tiles').append(tile);
      window.testSources[id] = { canvas, stream, video, tile };
      return video.play();
    };
    return Promise.all([addTile('Alice', '#116655'), addTile('Bob', '#663366')]);
  });
  console.log('Streams playing');
  const prefs = JSON.parse(await readFile(path.join(profile, 'Default', 'Preferences'), 'utf8').catch(() => '{}'));
  let id = Object.entries(prefs.extensions?.settings || {}).find(([, v]) => v.path === root)?.[0];
  if (!id) {
    const management = await context.newPage();
    await management.goto('chrome://extensions');
    id = await management.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({includeDisabled: false}, entries => resolve(entries.find(e => e.name === 'Meet Person Float')?.id))));
    await management.close();
  }
  assert.ok(id, 'Unpacked extension loaded');
  record('Chrome loaded the unpacked extension');
  // Loading a popup URL directly does not grant activeTab. Inject the exact bundled
  // picker here; the toolbar's user-granted permission is a separate manual check.
  await page.evaluate(await readFile(path.join(root, 'picker.js'), 'utf8'));
  await page.locator('#meet-person-float-picker .tile').first().waitFor();
  record('Bundled picker highlights both participant tiles');
  assert.equal(await page.locator('#meet-person-float-picker .tile').count(), 2);
  const pipEvent = context.waitForEvent('page');
  await page.locator('#meet-person-float-picker .tile').first().click();
  const pip = await pipEvent;
  await pip.waitForLoadState('domcontentloaded');
  await pip.waitForFunction(() => document.querySelector('video')?.readyState >= 2 && document.getElementById('status')?.hidden);
  record('Selected participant appears in a real native picture-in-picture window');
  assert.equal(await pip.evaluate(() => document.querySelector('video').srcObject.getAudioTracks().length), 0);
  assert.equal(await page.evaluate(() => documentPictureInPicture.window.document.querySelector('video').srcObject.getVideoTracks()[0] === testSources.Alice.stream.getVideoTracks()[0]), true);
  record('Mirrors only Alice and excludes audio');
  const other = await context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  assert.equal(await pip.evaluate(() => !window.closed && document.querySelector('video').srcObject.active), true);
  record('Floating video survives switching tabs');
  const cdp = await context.newCDPSession(page);
  const windowInfo = await cdp.send('Browser.getWindowForTarget');
  await cdp.send('Browser.setWindowBounds', {windowId: windowInfo.windowId, bounds: {windowState: 'minimized'}});
  assert.equal(await pip.evaluate(() => !window.closed && document.querySelector('video').srcObject.active), true);
  record('Floating window remains open with an active stream when the main Chrome window is minimized');
  await cdp.send('Browser.setWindowBounds', {windowId: windowInfo.windowId, bounds: {windowState: 'normal'}});
  await page.evaluate(() => testSources.Alice.tile.remove());
  await pip.waitForFunction(() => !document.querySelector('video').srcObject && !document.getElementById('status').hidden);
  record('Removing Alice clears the picture instead of switching to Bob');
  await page.evaluate(() => addTile('Alice', '#116655'));
  await pip.waitForFunction(() => document.querySelector('video').srcObject?.active && document.getElementById('status').hidden);
  assert.equal(await page.evaluate(() => documentPictureInPicture.window.document.querySelector('video').srcObject.getVideoTracks()[0] === testSources.Alice.stream.getVideoTracks()[0]), true);
  record('Recreated Alice tile reconnects to the new stream');
  await page.evaluate(() => { testSources.Alice.tile.dataset.participantId = 'Carol'; });
  await pip.waitForFunction(() => !document.querySelector('video').srcObject);
  record('Reusing the same video node for another identity clears the picture');
  await page.evaluate(() => { testSources.Alice.tile.dataset.participantId = 'Alice'; });
  await pip.waitForFunction(() => document.querySelector('video').srcObject?.active);
  await page.evaluate(() => { const clone = testSources.Alice.tile.cloneNode(true); clone.id = 'duplicate'; document.getElementById('tiles').append(clone); });
  await pip.waitForFunction(() => !document.querySelector('video').srcObject && document.getElementById('status').textContent.includes('multiple'));
  record('Ambiguous identity clears the picture');
  await page.evaluate(() => document.getElementById('duplicate').remove());
  await pip.waitForFunction(() => document.querySelector('video').srcObject?.active);
  await page.evaluate(() => { testSources.Alice.stream.getVideoTracks()[0].enabled = false; });
  await pip.waitForFunction(() => !document.querySelector('video').srcObject);
  record('Disabled camera clears the picture');
  await page.evaluate(() => { testSources.Alice.stream.getVideoTracks()[0].enabled = true; });
  await pip.waitForFunction(() => document.querySelector('video').srcObject?.active);
  if (process.env.SCREENSHOT_DIR) {
    await pip.screenshot({path: path.join(process.env.SCREENSHOT_DIR, 'floating-window.png')});
  }
  await pip.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForFunction(() => !documentPictureInPicture.window);
  assert.equal(await page.evaluate(() => testSources.Alice.stream.getVideoTracks()[0].readyState), 'live');
  record('Closing the float leaves Meet camera tracks live');
  await page.evaluate(() => window.__meetPersonFloatV2.showPicker());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#meet-person-float-picker').count(), 0);
  record('Escape dismisses the picker');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: context.browser()?.version(), checks, pageErrors: errors }, null, 2));
} finally {
  await context.close();
  await rm(profile, {recursive: true, force: true});
}
