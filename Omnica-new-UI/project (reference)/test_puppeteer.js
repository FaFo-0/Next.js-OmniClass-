const puppeteer = require('puppeteer');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });
  
  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message);
    console.log('STACK TRACE:\n', error.stack);
  });

  await page.goto('http://localhost:8000/Omnic-Portal.html');
  await wait(2000);
  
  // click tweaks panel
  await page.click('button[title="Omnic Tweaks"]');
  await wait(500);
  
  // click Admin radio button
  const adminRadio = await page.$x("//label[contains(., 'Admin')]");
  if (adminRadio.length > 0) {
    await adminRadio[0].click();
  }
  
  await wait(2000);
  await browser.close();
})();
