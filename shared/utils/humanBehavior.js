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

// SERP interaction for impression visits: scrolls through the results,
// hovers a non-target result, optionally expands a "People also ask" panel,
// and may scroll back up — all WITHOUT clicking the target domain.
// `targetDomain` is passed only so we can deliberately avoid hovering it
// (we don't want any accidental click tracking on the target).
async function browseSerp(page, targetDomain, dwellMs) {
  const deadline = Date.now() + dwellMs;
  const startedAt = Date.now();
  const viewport = page.viewport() || { width: 1366, height: 768 };

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) break;

    const roll = Math.random();

    if (roll < 0.55) {
      // Smooth scroll a small distance through the results
      const distance = randomBetween(180, 520);
      await page.evaluate(d => window.scrollBy({ top: d, behavior: 'smooth' }), distance);
      await randomDelay(800, 2200);

    } else if (roll < 0.75) {
      // Hover over a non-target organic result to mimic reading
      try {
        const coords = await page.evaluate((domain) => {
          const links = [...document.querySelectorAll('#search a h3')]
            .map(h => h.closest('a'))
            .filter(a => a && !a.href.includes(domain));
          if (!links.length) return null;
          const link = links[Math.floor(Math.random() * links.length)];
          link.scrollIntoView({ behavior: 'instant', block: 'center' });
          const r = link.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return null;
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        }, targetDomain);
        if (coords) {
          await page.mouse.move(coords.x, coords.y, { steps: randomBetween(8, 18) });
          await randomDelay(1200, 3200);
        }
      } catch {}

    } else if (roll < 0.88 && remaining > 4000) {
      // Expand a "People also ask" question (in-place expand, no navigation)
      try {
        const expanded = await page.evaluate(() => {
          const candidates = [...document.querySelectorAll('[jsname], [role="button"]')]
            .filter(el => /people also ask|related questions/i.test(el.textContent || ''));
          if (!candidates.length) return false;
          const items = [...document.querySelectorAll('div[jsname][role="button"], div[data-q]')];
          const pick = items[Math.floor(Math.random() * Math.min(items.length, 4))];
          if (pick) { pick.click(); return true; }
          return false;
        });
        if (expanded) await randomDelay(1500, 3500);
      } catch {}

    } else {
      // Idle reading pause + small mouse jiggle
      const x = randomBetween(80, viewport.width - 80);
      const y = randomBetween(120, viewport.height - 120);
      await page.mouse.move(x, y, { steps: randomBetween(5, 12) });
      await randomDelay(1500, 4000);
    }
  }

  // Occasional final scroll back near the top
  if (Math.random() < 0.4) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await randomDelay(500, 1500);
  }

  return { elapsedSeconds: Math.round((Date.now() - startedAt) / 1000) };
}

module.exports = {
  randomDelay,
  randomScroll,
  typeSlowly,
  randomMouseMove,
  selectRandomText,
  clickInternalLink,
  waitForNetworkIdle,
  browseSerp,
  randomBetween,
};

