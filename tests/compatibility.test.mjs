import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = process.cwd();

const readProjectFile = fileName => readFile(path.join(root, fileName), 'utf8');

const loadLegacyDetector = async () => {
  const source = await readProjectFile('src/utils/legacyBrowser.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2015,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
};

test('legacy detector supports Geestart Android 9 and old Chromium TVs', async () => {
  const { isLegacyTvUserAgent } = await loadLegacyDetector();

  assert.equal(isLegacyTvUserAgent('Mozilla/5.0 (Linux; Android 9; Geestart TV) AppleWebKit/537.36 Chrome/66.0 Safari/537.36'), true);
  assert.equal(isLegacyTvUserAgent('Mozilla/5.0 (Linux; Android 8; Geestar) GoBrowser/1.0'), true);
  assert.equal(isLegacyTvUserAgent('Mozilla/5.0 (Linux; Android 9; TV) AppleWebKit/537.36 Chrome/65.0 Safari/537.36'), true);
});

test('modern Android mobile and Google TV keep the full visual mode', async () => {
  const { isLegacyTvUserAgent } = await loadLegacyDetector();

  assert.equal(isLegacyTvUserAgent('Mozilla/5.0 (Linux; Android 9; Pixel 3) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'), false);
  assert.equal(isLegacyTvUserAgent('Mozilla/5.0 (Linux; Android 12; GoogleTV) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'), false);
});

test('responsive and auth compatibility contracts are present', async () => {
  const css = await readProjectFile('src/index.css');
  const app = await readProjectFile('src/App.tsx');
  const html = await readProjectFile('index.html');
  const serviceWorker = await readProjectFile('public/sw.js');
  const firebase = await readProjectFile('src/services/firebaseService.ts');
  const userContext = await readProjectFile('src/context/UserContext.tsx');

  assert.match(css, /html:not\(\.legacy-tv-browser\) \.neon-shell/);
  assert.match(css, /html:not\(\.legacy-tv-browser\) \.memoriya-experience \.memoriya-mobile-dock/);
  assert.match(css, /html\.legacy-tv-browser \.memoriya-navbar \.navbar-links/);
  assert.match(app, /import Login from ['"]\.\/pages\/Login['"]/);
  assert.match(app, /import StoryMode from ['"]\.\/pages\/StoryMode['"]/);
  assert.match(html, /Geestart/);
  assert.match(serviceWorker, /Geestart/);
  assert.doesNotMatch(firebase, /^import\s+\{[\s\S]*from ['"]firebase\/(app|auth)['"]/m);
  assert.match(firebase, /import\('firebase\/auth'\)/);
  assert.match(userContext, /isFirebaseConfigured && !isLegacyTvBrowser\(\)/);
});
