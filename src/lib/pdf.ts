// Server-side PDF-generatie via headless Chrome. Op Vercel gebruiken we de
// serverless-geschikte @sparticuz/chromium-binary + puppeteer-core; lokaal
// gebruiken we de volledige puppeteer-package (bundelt een eigen Chromium).
export async function renderPdf(url: string, cookieHeader: string): Promise<Buffer> {
  let browser

  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteerCore = await import('puppeteer-core')
    // @sparticuz/chromium bundelt de headless_shell-build van Chromium, die alleen
    // de "oude" headless-modus spreekt. headless: true laat puppeteer-core de
    // "nieuwe" modus verwachten, waardoor het opstarten van de browser faalt.
    browser = await puppeteerCore.launch({
      args: await puppeteerCore.defaultArgs({ args: chromium.args, headless: 'shell' }),
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    })
  } else {
    const puppeteer = await import('puppeteer')
    browser = await puppeteer.launch()
  }

  try {
    const page = await browser.newPage()
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map((pair) => {
        const [name, ...rest] = pair.trim().split('=')
        return { name, value: rest.join('='), url }
      })
      await page.setCookie(...cookies)
    }
    await page.goto(url, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
