function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function randomDelay(minMs, maxMs) {
  const ms = randomBetween(minMs, maxMs);
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function randomScroll(page) {
  const steps = randomBetween(2, 5);
  for (let i = 0; i < steps; i++) {
    const distance = randomBetween(200, 600);
    await page.evaluate(d => window.scrollBy(0, d), distance);
    await randomDelay(300, 900);
  }
  if (Math.random() < 0.4) {
    const back = randomBetween(100, 300);
    await page.evaluate(d => window.scrollBy(0, -d), back);
    await randomDelay(200, 500);
  }
}

async function typeSlowly(page, selector, text) {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char);
    await randomDelay(50, 200);
  }
}

async function randomMouseMove(page) {
  const moves = randomBetween(2, 4);
  const viewport = page.viewport() || { width: 1366, height: 768 };
  for (let i = 0; i < moves; i++) {
    const x = randomBetween(50, viewport.width - 50);
    const y = randomBetween(50, viewport.height - 50);
    await page.mouse.move(x, y);
    await randomDelay(100, 400);
  }
}

async function selectRandomText(page) {
  try {
    await page.evaluate(() => {
      const paras = Array.from(document.querySelectorAll('p, span, div'))
        .filter(el => el.innerText && el.innerText.trim().length > 20);
      if (paras.length === 0) return;
      const el = paras[Math.floor(Math.random() * paras.length)];
      el.click();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await randomDelay(300, 800);
    await page.evaluate(() => window.getSelection().removeAllRanges());
  } catch {}
}

const BLOCKED_TERMS = ['logout', 'sign-out', 'login', 'register', 'cart', 'checkout', 'payment'];

async function clickInternalLink(page, targetDomain) {
  try {
    const href = await page.evaluate((domain, blocked) => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      const candidates = links.filter(a => {
        const h = a.href || '';
        if (!h || h.startsWith('javascript:') || h === '#' || h.startsWith('mailto:') || h.startsWith('tel:')) return false;
        try {
          const url = new URL(h);
          if (url.hostname !== domain) return false;
          const text = (a.textContent || '').toLowerCase();
          const path = (url.pathname || '').toLowerCase();
          if (blocked.some(t => text.includes(t) || path.includes(t))) return false;
          return true;
        } catch {
          return false;
        }
      });
      if (candidates.length === 0) return null;
      return candidates[Math.floor(Math.random() * candidates.length)].href;
    }, targetDomain, BLOCKED_TERMS);

    if (!href) return false;

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      page.goto(href, { waitUntil: 'domcontentloaded', timeout: 15000 }),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function waitForNetworkIdle(page) {
  try {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 });
  } catch {}
}

module.exports = {
  randomDelay,
  randomScroll,
  typeSlowly,
  randomMouseMove,
  selectRandomText,
  clickInternalLink,
  waitForNetworkIdle,
  randomBetween,
};
