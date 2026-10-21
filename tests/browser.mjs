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
  await page.evaluate(await readFile(process.env.PICKER_PATH || path.join(root, 'picker.js'), 'utf8'));
  await page.locator('#meet-person-float-picker .tile').first().waitFor();
  record('Bundled picker highlights both participant tiles');
  assert.equal(await page.locator('#meet-person-float-picker .tile').count(), 2);
  await page.evaluate(() => {
    const copy = testSources.Alice.video.cloneNode(true);
    copy.style.display = 'none'; copy.id = 'hidden-copy';
    testSources.Alice.tile.append(copy);
    (window.__meetPersonFloatV4 || window.__meetPersonFloatV3).showPicker();
  });
  assert.equal(await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').count(), 1, 'A hidden duplicate must not remove the visible choice');
  record('Hidden duplicate video does not suppress the person selector');
  await page.evaluate(() => document.getElementById('hidden-copy').remove());
  async function chooseAlice() {
    await page.bringToFront();
    await page.evaluate(() => (window.__meetPersonFloatV4 || window.__meetPersonFloatV3).showPicker());
    await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').first().click();
    await page.waitForFunction(() => document.pictureInPictureElement === testSources.Alice.video);
  }
  await chooseAlice();
  assert.equal(await page.evaluate(() => !documentPictureInPicture.window), true);
  record('Selected person opens in native video PiP, without an HTML window or custom header');
  assert.equal(await page.evaluate(() => document.querySelectorAll('video').length), 2);
  assert.equal(await page.evaluate(() => document.pictureInPictureElement.srcObject === testSources.Alice.stream), true);
  record('Uses the original selected stream without creating video elements or duplicate audio');
  const other = await context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  assert.equal(await page.evaluate(() => document.pictureInPictureElement === testSources.Alice.video), true);
  record('Floating video survives switching tabs');
  const cdp = await context.newCDPSession(page);
  const windowInfo = await cdp.send('Browser.getWindowForTarget');
  await cdp.send('Browser.setWindowBounds', {windowId: windowInfo.windowId, bounds: {windowState: 'minimized'}});
  assert.equal(await page.evaluate(() => document.pictureInPictureElement === testSources.Alice.video && testSources.Alice.stream.active), true);
  record('Native video PiP remains active when the main Chrome window is minimized');
  await cdp.send('Browser.setWindowBounds', {windowId: windowInfo.windowId, bounds: {windowState: 'normal'}});
  await page.evaluate(() => testSources.Alice.tile.remove());
  await page.waitForFunction(() => !document.pictureInPictureElement);
  assert.equal(await page.evaluate(() => testSources.Bob.stream.active && testSources.Alice.stream.active), true);
  record('Removing Alice closes the video instead of switching to Bob, without stopping call tracks');
  await page.evaluate(() => addTile('Alice', '#116655'));
  await chooseAlice();
  record('Recreated Alice tile can be selected again');
  await page.evaluate(() => { testSources.Alice.tile.dataset.participantId = 'Carol'; });
  await page.waitForFunction(() => !document.pictureInPictureElement);
  record('Reusing the same video node for another identity closes the video');
  await page.evaluate(() => { testSources.Alice.tile.dataset.participantId = 'Alice'; });
  await chooseAlice();
  await page.evaluate(() => { const clone = testSources.Alice.tile.cloneNode(true); clone.id = 'duplicate'; document.getElementById('tiles').append(clone); });
  assert.equal(await page.evaluate(() => document.pictureInPictureElement === testSources.Alice.video), true);
  await page.evaluate(() => (window.__meetPersonFloatV4 || window.__meetPersonFloatV3).showPicker());
  assert.equal(await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').count(), 2);
  await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').first().click();
  assert.equal(await page.evaluate(() => document.pictureInPictureElement === testSources.Alice.video), true);
  record('Multiple tiles for the same participant keep the exact selected video');
  await page.evaluate(() => document.getElementById('duplicate').remove());
  await chooseAlice();
  await page.evaluate(() => { testSources.Alice.stream.getVideoTracks()[0].enabled = false; });
  await page.waitForFunction(() => !document.pictureInPictureElement);
  record('Disabled camera closes the video');
  await page.evaluate(() => { testSources.Alice.stream.getVideoTracks()[0].enabled = true; testSources.Alice.video.disablePictureInPicture = true; });
  await chooseAlice();
  record('A Meet video marked disablePictureInPicture can still be explicitly selected');
  await page.evaluate(() => document.exitPictureInPicture());
  await page.waitForFunction(() => !document.pictureInPictureElement);
  assert.equal(await page.evaluate(() => testSources.Alice.stream.getVideoTracks()[0].readyState), 'live');
  assert.equal(await page.evaluate(() => testSources.Alice.video.disablePictureInPicture), true);
  record('Closing the video leaves Meet tracks live and restores its original PiP hint');

  // An unavailable source must explain the failure across later refresh ticks.
  await page.evaluate(() => {
    testSources.Alice.video.srcObject = null;
    (window.__meetPersonFloatV4 || window.__meetPersonFloatV3).showPicker();
  });
  await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').first().click();
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.match(await page.locator('#meet-person-float-picker [role="status"]').textContent(), /still loading|camera is off/);
  assert.equal(await page.evaluate(() => !!document.pictureInPictureElement), false);
  record('Unready video gives a persistent error instead of silently doing nothing');
  await page.evaluate(() => { testSources.Alice.video.srcObject = testSources.Alice.stream; return testSources.Alice.video.play(); });
  await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').first().click();
  await page.waitForFunction(() => document.pictureInPictureElement === testSources.Alice.video);
  record('A loading video can be retried successfully without reopening the picker');
  await page.evaluate(() => document.exitPictureInPicture());

  await page.evaluate(() => {
    Object.defineProperty(testSources.Alice.stream.getVideoTracks()[0], 'muted', {configurable: true, value: true});
  });
  await chooseAlice();
  record('A temporary track mute does not block an otherwise playable video');
  await page.evaluate(() => {
    delete testSources.Alice.stream.getVideoTracks()[0].muted;
    return document.exitPictureInPicture();
  });

  await page.evaluate(() => {
    testSources.Alice.video.requestPictureInPicture = () => Promise.reject(new DOMException('Test permission rejection', 'NotAllowedError'));
    (window.__meetPersonFloatV4 || window.__meetPersonFloatV3).showPicker();
  });
  await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').first().click();
  await page.waitForFunction(() => document.getElementById('meet-person-float-picker')?.shadowRoot.querySelector('[role="status"]').textContent.includes('fresh click'));
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.match(await page.locator('#meet-person-float-picker [role="status"]').textContent(), /fresh click/);
  await page.evaluate(() => { delete testSources.Alice.video.requestPictureInPicture; });
  await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').first().click();
  await page.waitForFunction(() => document.pictureInPictureElement === testSources.Alice.video);
  record('Native request rejection stays visible, and the next real click retries successfully');

  // Switching must use the click directly, without waiting for explicit PiP teardown.
  await page.evaluate(() => {
    window.exitCalls = 0;
    document.exitPictureInPicture = () => { window.exitCalls++; throw new Error('Should switch directly'); };
    (window.__meetPersonFloatV4 || window.__meetPersonFloatV3).showPicker();
  });
  await page.locator('#meet-person-float-picker .tile[data-participant="Bob"]').click();
  await page.waitForFunction(() => document.pictureInPictureElement === testSources.Bob.video);
  assert.equal(await page.evaluate(() => exitCalls), 0);
  await page.evaluate(() => { delete document.exitPictureInPicture; });
  record('Switching people requests native PiP directly without an intervening exit wait');
  await page.evaluate(() => document.exitPictureInPicture());

  // Keep the pressed button stable while Meet changes the source under it.
  await page.evaluate(() => (window.__meetPersonFloatV4 || window.__meetPersonFloatV3).showPicker());
  let box = await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(() => { testSources.Alice.tile.dataset.participantId = 'Carol'; });
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.mouse.up();
  assert.equal(await page.evaluate(() => !!document.pictureInPictureElement), false);
  assert.match(await page.locator('#meet-person-float-picker [role="status"]').textContent(), /changed this video tile/);
  record('Identity change during a click is explained instead of silently selecting another person');
  await page.evaluate(() => { testSources.Alice.tile.dataset.participantId = 'Alice'; });
  await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').first().waitFor();
  box = await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(() => { testSources.Alice.video.style.transform = 'translateX(500px)'; });
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.mouse.up();
  assert.equal(await page.evaluate(() => !!document.pictureInPictureElement), false);
  assert.match(await page.locator('#meet-person-float-picker [role="status"]').textContent(), /changed this video tile/);
  record('Moving a tile during the click cannot select a stale overlay target');
  await page.evaluate(() => { testSources.Alice.video.style.transform = ''; });
  await chooseAlice();
  await page.evaluate(() => document.exitPictureInPicture());

  await page.evaluate(() => document.body.requestFullscreen());
  await page.evaluate(() => (window.__meetPersonFloatV4 || window.__meetPersonFloatV3).showPicker());
  assert.equal(await page.evaluate(() => document.getElementById('meet-person-float-picker').matches(':popover-open')), true);
  await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').first().click();
  await page.waitForFunction(() => document.pictureInPictureElement === testSources.Alice.video);
  record('Picker remains clickable above the fullscreen meeting layout');
  await page.evaluate(() => { if (document.fullscreenElement) return document.exitFullscreen(); });
  await page.evaluate(() => document.exitPictureInPicture());

  await page.evaluate(() => {
    const original = HTMLElement.prototype.showPopover;
    HTMLElement.prototype.showPopover = () => { throw new Error('Test popover failure'); };
    try { (window.__meetPersonFloatV4 || window.__meetPersonFloatV3).showPicker(); }
    finally { HTMLElement.prototype.showPopover = original; }
  });
  assert.equal(await page.evaluate(() => document.getElementById('meet-person-float-picker').hasAttribute('popover')), false);
  await page.locator('#meet-person-float-picker .tile[data-participant="Alice"]').first().click();
  await page.waitForFunction(() => document.pictureInPictureElement === testSources.Alice.video);
  record('Fixed-position fallback remains clickable if the top-layer API fails');
  await page.evaluate(() => document.exitPictureInPicture());
  await page.evaluate(() => (window.__meetPersonFloatV4 || window.__meetPersonFloatV3).showPicker());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#meet-person-float-picker').count(), 0);
  record('Escape dismisses the picker');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: context.browser()?.version(), checks, pageErrors: errors }, null, 2));
} finally {
  await context.close();
  await rm(profile, {recursive: true, force: true});
}
