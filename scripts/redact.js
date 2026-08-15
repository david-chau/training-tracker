// Paints a solid box over part of an image and writes it back.
//
//     node scripts/redact.js docs/img/new-deployment.png 455 545 400 62
//
// x y w h are in image pixels. Used to keep a real email address out of a
// screenshot that is published to a public docs site.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

(async () => {
  const [file, x, y, w, h] = process.argv.slice(2);
  if (!file || h === undefined) {
    throw new Error('usage: node scripts/redact.js <png> <x> <y> <w> <h>');
  }
  const abs = path.resolve(file);
  const data = fs.readFileSync(abs).toString('base64');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(
    '<style>html,body{margin:0}div{position:relative;display:inline-block}' +
    'img{display:block}b{position:absolute;background:#5f6368;border-radius:3px}' +
    '</style><div><img id="i" src="data:image/png;base64,' + data + '">' +
    '<b style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h +
    'px"></b></div>');
  await page.waitForFunction(() => {
    const i = document.getElementById('i');
    return i && i.complete && i.naturalWidth > 0;
  });
  const box = page.locator('div');
  await box.screenshot({ path: abs });
  const size = await page.evaluate(() => {
    const i = document.getElementById('i');
    return i.naturalWidth + '×' + i.naturalHeight;
  });
  console.log('redacted ' + file + ' (' + size + ')');
  await browser.close();
})();
