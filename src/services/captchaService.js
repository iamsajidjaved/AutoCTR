const CAPTCHA_SOLVE_TIMEOUT_MS = 120_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isCaptchaPresent(page) {
  return await page.evaluate(() => {
    return !!document.querySelector(
      'iframe[src*="recaptcha"], #captcha-form, .g-recaptcha, iframe[title*="reCAPTCHA"]'
    );
  });
}

async function waitForCaptchaSolved(page) {
  const deadline = Date.now() + CAPTCHA_SOLVE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const solved = await page.evaluate(() => {
      const el = document.getElementById('g-recaptcha-response');
      return el && el.value && el.value.length > 0;
    });

    if (solved) return true;

    const stillPresent = await isCaptchaPresent(page);
    if (!stillPresent) return true;

    await sleep(2000);
  }

  return false;
}

async function handleCaptcha(page) {
  const present = await isCaptchaPresent(page);
  if (!present) return { solved: false, reason: 'not_present' };

  const solved = await waitForCaptchaSolved(page);
  if (!solved) return { solved: false, reason: 'timeout' };

  await sleep(1500);
  return { solved: true };
}

module.exports = { handleCaptcha, isCaptchaPresent };
