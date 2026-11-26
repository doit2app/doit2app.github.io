const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const out = async (svg, file, size, transparent) => {
    const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;background:transparent">${fs.readFileSync(svg,'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
    await p.close();
  };
  const A = '../../assets/';
  await out('icon.svg', A + 'icon.png', 1024, false);
  await out('fg.svg', A + 'android-icon-foreground.png', 1024, true);
  await out('bg.svg', A + 'android-icon-background.png', 1024, false);
  await out('mono.svg', A + 'android-icon-monochrome.png', 1024, true);
  await out('splash.svg', A + 'splash-icon.png', 1024, true);
  await out('icon.svg', A + 'favicon.png', 48, false);
  // 미리보기: 큰 아이콘, 홈 화면 크기, 안드로이드 원형 마스크
  const prev = await b.newPage({ viewport: { width: 900, height: 360 }, deviceScaleFactor: 2 });
  const svg = fs.readFileSync('icon.svg','utf8'); const fg = fs.readFileSync('fg.svg','utf8'); const bg = fs.readFileSync('bg.svg','utf8');
  await prev.setContent(`<html><body style="margin:0;background:#E7E5E4;font-family:sans-serif;display:flex;gap:40px;align-items:center;padding:30px">
   <div style="text-align:center"><div style="width:260px;height:260px;border-radius:58px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.2)">${svg.replace('<svg ','<svg width="260" height="260" ')}</div><p>아이폰·스토어</p></div>
   <div style="text-align:center"><div style="width:200px;height:200px;border-radius:50%;overflow:hidden;position:relative;box-shadow:0 8px 22px rgba(0,0,0,.2)"><div style="position:absolute;inset:-25%">${bg.replace('<svg ','<svg width="300" height="300" ')}</div><div style="position:absolute;inset:-25%">${fg.replace('<svg ','<svg width="300" height="300" ')}</div></div><p>안드로이드 (원형)</p></div>
   <div style="text-align:center;background:#111;padding:24px;border-radius:20px"><div style="width:64px;height:64px;border-radius:15px;overflow:hidden;margin:auto">${svg.replace('<svg ','<svg width="64" height="64" ')}</div><p style="color:#fff;font-size:12px;margin:8px 0 0">홈 화면 크기</p></div>
  </body></html>`);
  await prev.screenshot({ path: 'preview.png' }); await b.close();
})();
