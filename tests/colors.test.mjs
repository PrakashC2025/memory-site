import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const readProjectFile = fileName => readFile(path.join(root, fileName), 'utf8');

const hexToRgb = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);

const luminance = hex => hexToRgb(hex)
  .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);

const contrast = (foreground, background) => {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
};

test('every active theme accent remains readable on the memory background', async () => {
  const source = await readProjectFile('src/context/ThemeContext.tsx');
  const background = '#030407';
  const themeNames = ['golden', 'dreamy', 'moonlight', 'blossom', 'cosmic'];

  for (const themeName of themeNames) {
    const block = source.match(new RegExp(`${themeName}: \\{([\\s\\S]*?)\\n  \\}`, 'm'))?.[1];
    assert.ok(block, `missing ${themeName} theme block`);
    const colors = [...block.matchAll(/(?:primary|secondary|accent): '(#[0-9a-fA-F]{6})'/g)].map(match => match[1]);
    assert.equal(colors.length, 3, `${themeName} should define three readable accents`);
    for (const color of colors) {
      assert.ok(contrast(color, background) >= 4.5, `${themeName} color ${color} is below WCAG AA contrast`);
    }
  }
});

test('muted memory text tokens stay above the small-text contrast floor', async () => {
  const css = await readProjectFile('src/index.css');
  const muted = Number(css.match(/--memory-muted:\s*rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/)?.[1]);
  const dim = Number(css.match(/--memory-dim:\s*rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/)?.[1]);

  assert.ok(muted >= 0.68, 'memory-muted should remain readable');
  assert.ok(dim >= 0.56, 'memory-dim should remain readable');
});
