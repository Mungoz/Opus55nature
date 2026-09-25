import puppeteer from 'puppeteer-core';
const variants = [
  ['new-default', { headless: true, args: [] }],
  ['new-angle-d3d11', { headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }],
];
for (const [name, opts] of variants) {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', ...opts });
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');
  const info = await page.evaluate(() => {
    const gl = document.getElementById('c').getContext('webgl2');
    if (!gl) return 'no webgl2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return [gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), !!gl.getExtension('EXT_color_buffer_float'), !!gl.getExtension('OES_texture_float_linear')].join(' | ');
  });
  console.log(name, '=>', info);
  await browser.close();
}
