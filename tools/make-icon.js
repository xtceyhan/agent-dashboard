'use strict';

/* ============================================================
   make-icon.js — assets/icon.svg'yi çok çözünürlüklü bir
   Windows .ico dosyasına (ve bir 256px .png'ye) dönüştürür.

   Çalıştır:  node tools/make-icon.js
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const pngToIcoMod = require('png-to-ico');
const pngToIco = pngToIcoMod.default || pngToIcoMod;

const assets = path.join(__dirname, '..', 'assets');
const svg = fs.readFileSync(path.join(assets, 'icon.svg'));
const sizes = [16, 24, 32, 48, 64, 128, 256];

(async () => {
  const pngs = sizes.map((size) => {
    const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
    return Buffer.from(r.render().asPng());
  });

  const ico = await pngToIco(pngs);
  fs.writeFileSync(path.join(assets, 'icon.ico'), ico);
  fs.writeFileSync(path.join(assets, 'icon.png'), pngs[pngs.length - 1]);

  console.log(
    `icon.ico yazıldı (${sizes.join(', ')} px) → ${(ico.length / 1024).toFixed(
      1
    )} KB`
  );
})().catch((err) => {
  console.error('İkon üretilemedi:', err);
  process.exit(1);
});
