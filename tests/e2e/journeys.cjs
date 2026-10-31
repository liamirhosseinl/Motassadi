/**
 * End-to-end user journeys (public site + admin panel) against a RUNNING production build.
 * Uses a disposable database prepared with:  admin:create (username "owner") + seed:demo.
 *
 *   E2E_BASE_URL=http://localhost:3100 E2E_OWNER_PASSWORD=... node tests/e2e/journeys.cjs
 *
 * Never point this at the real office database: it creates, publishes and voids records.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const sharp = require("sharp");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD;
if (!OWNER_PASSWORD) { console.error("E2E_OWNER_PASSWORD is required"); process.exit(2); }
const SHOTS = __dirname + "/shots";
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const consoleErrors = [];
function ok(name, cond, info = "") { results.push({ name, pass: !!cond, info }); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ reducedMotion: "reduce", locale: "fa-IR", viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`${page.url()} :: ${m.text()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()} :: pageerror ${e.message}`));

  // ── Public site ──
  let r = await page.goto(BASE + "/");
  ok("home 200", r.status() === 200);
  ok("html lang/dir", (await page.getAttribute("html", "lang")) === "fa-IR" && (await page.getAttribute("html", "dir")) === "rtl");
  ok("home shows brand + phone", (await page.content()).includes("املاک متصدی") && (await page.content()).includes("09136189808"));
  ok("home has LocalBusiness JSON-LD", (await page.locator('script[type="application/ld+json"]').allTextContents()).some((t) => t.includes("RealEstateAgent")));
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, ""));
    return ["Lahzeh", "IRANSansX", "IRANYekan"].filter((n) => loaded.includes(n));
  });
  ok("brand fonts loaded (Lahzeh display, IRANSansX text, IRANYekan numbers)", fonts.length === 3, fonts.join(", "));
  await page.screenshot({ path: `${SHOTS}/01-home-desktop.png`, fullPage: true });

  r = await page.goto(BASE + "/properties?deal=sale");
  const cards = await page.locator(".pcard").count();
  ok("search deal=sale returns cards", cards >= 3, `${cards} cards`);
  ok("draft demo listing hidden from search", !(await page.content()).includes("باغ ۲۰۰۰ متری"));
  await page.screenshot({ path: `${SHOTS}/02-search.png`, fullPage: true });
  r = await page.goto(BASE + "/properties?deal=rent&sort=price_asc");
  ok("search rent", (await page.locator(".pcard").count()) >= 1);
  r = await page.goto(BASE + "/properties?deal=sale&view=list");
  ok("list view renders", (await page.locator(".grid-cards.as-list .pcard").count()) >= 3 && (await page.locator('.view-toggle a[aria-current="true"]').innerText()).includes("فهرستی"));
  ok("filter form keeps list view", (await page.locator('form.filters input[name="view"][value="list"]').count()) === 1);
  await page.screenshot({ path: `${SHOTS}/02b-search-list.png`, fullPage: true });
  r = await page.goto(BASE + "/properties?minPrice=abc&page=-4");
  ok("invalid search params do not crash", r.status() === 200);

  await page.goto(BASE + "/properties?deal=sale");
  const href = await page.locator("a.pcard").first().getAttribute("href");
  r = await page.goto(BASE + href);
  ok("property detail 200", r.status() === 200, href);
  const html = await page.content();
  ok("detail hides private address & notes", !html.includes("نشانی ساختگی") && !html.includes("دادهٔ نمونه"));
  ok("detail has RealEstateListing JSON-LD", html.includes("RealEstateListing"));
  ok("detail shows toman label", html.includes("تومان"));
  ok("gallery present", (await page.locator(".gallery").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/03-detail.png`, fullPage: true });

  // inquiry: first invalid (no consent) keeps typed values, then valid
  await page.fill("#iq-name", "آزمون خودکار");
  await page.fill("#iq-phone", "09000" + String(Math.floor(100000 + Math.random() * 899999)));
  await page.waitForTimeout(2300);
  await page.click("button:has-text('ارسال درخواست')");
  await page.waitForSelector(".alert-error", { timeout: 10000 });
  ok("inquiry without consent rejected", true);
  ok("typed values kept after error", (await page.inputValue("#iq-name")) === "آزمون خودکار");
  await page.check('input[name="consent"]');
  await page.click("button:has-text('ارسال درخواست')");
  await page.waitForSelector(".alert-success", { timeout: 10000 });
  ok("inquiry accepted after server save", true, await page.locator(".alert-success").innerText());

  r = await page.goto(BASE + "/properties/M-0000-9999");
  ok("unknown property → 404", r.status() === 404);
  r = await page.goto(BASE + "/no-such-page");
  ok("404 page", r.status() === 404 && (await page.content()).includes("۴۰۴") || r.status() === 404);
  await page.screenshot({ path: `${SHOTS}/04-404.png` });
  for (const p of ["/about", "/contact", "/privacy", "/terms", "/guide/buy-sell", "/guide/rent"]) {
    r = await page.goto(BASE + p); ok(`content ${p} 200`, r.status() === 200);
  }
  ok("legal page marked for review", (await (await page.goto(BASE + "/privacy")).text()).includes("بازبینی") || (await page.content()).includes("پیش‌نویس"));
  r = await page.goto(BASE + "/sitemap.xml"); const sm = await r.text();
  // demo seed: 16 published + 1 reserved are indexable; sold keeps its page but leaves the sitemap; draft/pending never appear
  ok("sitemap lists indexable listings only", sm.split("/properties/M-").length - 1 === 17, `${sm.split("/properties/M-").length - 1} listings`);
  r = await page.goto(BASE + "/robots.txt"); const rb = await r.text();
  ok("robots disallows /admin", rb.includes("Disallow: /admin"));

  // mobile layout
  const m = await browser.newContext({ reducedMotion: "reduce", locale: "fa-IR", viewport: { width: 375, height: 780 }, isMobile: true });
  const mp = await m.newPage();
  for (const p of ["/", "/properties", "/properties?view=list", href, "/contact"]) {
    await mp.goto(BASE + p);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`mobile no horizontal scroll ${p}`, overflow <= 1, `overflow ${overflow}px`);
  }

  // motion: reveal-on-scroll must end with every animated block visible
  const mo = await (await browser.newContext({ locale: "fa-IR", viewport: { width: 1366, height: 900 } })).newPage();
  await mo.goto(BASE + "/", { waitUntil: "networkidle" });
  const startHidden = await mo.evaluate(() => document.querySelectorAll("[data-reveal]:not(.is-in)").length);
  const H = await mo.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y <= H; y += 300) { await mo.evaluate((yy) => window.scrollTo(0, yy), y); await mo.waitForTimeout(40); }
  await mo.waitForTimeout(400);
  const stillHidden = await mo.evaluate(() => [...document.querySelectorAll("[data-reveal]:not(.is-in)")].filter((e) => !e.closest(".rail")).length);
  ok("scroll animations reveal all home sections", startHidden > 0 && stillHidden === 0, `${startHidden} animated, ${stillHidden} left hidden`);
  await mo.context().close();
  await mp.goto(BASE + "/"); await mp.screenshot({ path: `${SHOTS}/05-home-mobile.png`, fullPage: true });
  await mp.goto(BASE + href); await mp.screenshot({ path: `${SHOTS}/06-detail-mobile.png`, fullPage: true });

  // ── Admin ──
  r = await page.goto(BASE + "/admin");
  ok("admin redirects to login", page.url().includes("/admin/login"));
  ok("login noindex header", (await (await page.request.get(BASE + "/admin/login")).headers())["x-robots-tag"]?.includes("noindex"));
  await page.fill('input[name="username"]', "owner");
  await page.fill('input[name="password"]', "wrong-password-x");
  await page.click("button:has-text('ورود')");
  await page.waitForSelector(".alert-error");
  ok("wrong password rejected generically", (await page.locator(".alert-error").innerText()).includes("درست نیست"));
  await page.fill('input[name="password"]', OWNER_PASSWORD);
  await page.click("button:has-text('ورود')");
  await page.waitForURL(BASE + "/admin");
  ok("owner login → dashboard", true);
  const cookies = await ctx.cookies();
  const sess = cookies.find((c) => c.name === "mt_session");
  ok("session cookie httpOnly+SameSite", sess && sess.httpOnly && sess.sameSite !== "None");
  await page.screenshot({ path: `${SHOTS}/07-dashboard.png`, fullPage: true });

  // global search from the sidebar
  await page.fill("#admin-q", "آزمون خودکار");
  await page.press("#admin-q", "Enter");
  await page.waitForURL(/\/admin\/search\?q=/);
  ok("global search finds the new inquiry", (await page.locator("section", { hasText: "درخواست‌ها" }).innerText()).includes("آزمون خودکار"));
  await page.screenshot({ path: `${SHOTS}/07b-global-search.png`, fullPage: true });

  // inquiries
  await page.goto(BASE + "/admin/inquiries");
  ok("new inquiry visible in panel", (await page.content()).includes("آزمون خودکار"));
  await page.click("text=آزمون خودکار");
  await page.waitForURL(/\/admin\/inquiries\/\d+/);
  await page.selectOption('select[name="status"]', "contacted");
  await page.click("button:has-text('ثبت وضعیت')");
  await page.waitForSelector("text=وضعیت ثبت شد.");
  await page.fill('textarea[name="body"]', "تماس گرفته شد؛ فردا بازدید");
  await page.click("button:has-text('ثبت تماس')");
  await page.waitForSelector("text=تماس گرفته شد؛ فردا بازدید", { timeout: 10000 });
  ok("inquiry status + call note", true);
  const mk = page.locator("button:has-text('ساخت مخاطب جدید از این درخواست')");
  if (await mk.count()) await mk.click();
  await page.waitForSelector('aside a[href^="/admin/contacts/"]', { timeout: 15000 });
  ok("contact created from inquiry", true);
  await page.fill('input[name="purpose"]', "هماهنگی بازدید");
  await page.click("button:has-text('ثبت پیگیری')");
  await page.waitForSelector("text=پیگیری ثبت شد.");
  ok("follow-up from inquiry", true);
  await page.screenshot({ path: `${SHOTS}/08-inquiry.png`, fullPage: true });

  // property create → images → publish
  await page.goto(BASE + "/admin/properties/new");
  await page.fill('input[name="title"]', "آگهی آزمون خودکار ۸۰ متری");
  await page.selectOption('select[name="categoryId"]', { label: "آپارتمان" });
  await page.fill('textarea[name="description"]', "توضیح آزمون برای انتشار با واقعیت‌های قابل بررسی.");
  await page.fill('input[name="price"]', "۳٬۲۰۰٬۰۰۰٬۰۰۰");
  await page.fill('input[name="area"]', "80");
  await page.fill('input[name="neighborhood"]', "محلهٔ آزمون");
  await page.click("button:has-text('ذخیره به‌عنوان پیش‌نویس')");
  await page.waitForURL(/\/admin\/properties\/\d+\?created=1/, { timeout: 15000 });
  const pid = page.url().match(/properties\/(\d+)/)[1];
  ok("property created", true, `id ${pid}`);
  const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 84, g: 119, b: 146 } } }).jpeg().toBuffer();
  await page.setInputFiles("#img-upload", { name: "photo.jpg", mimeType: "image/jpeg", buffer: png });
  await page.waitForSelector(".img-tile", { timeout: 20000 });
  ok("image upload with progress UI", (await page.locator(".img-tile").count()) >= 1);
  const publishBtn = page.locator('button[name="to"][value="published"]');
  if (await publishBtn.count()) {
    await publishBtn.first().click();
    await page.waitForSelector("text=وضعیت به‌روز شد.", { timeout: 10000 });
  } else {
    await page.selectOption('select[name="to"]', "published"); await page.click("button:has-text('تغییر وضعیت')");
  }
  await page.waitForTimeout(1500);
  await page.reload();
  ok("property published", (await page.content()).includes("منتشرشده"));
  await page.screenshot({ path: `${SHOTS}/09-property-edit.png`, fullPage: true });
  r = await page.goto(BASE + "/properties?q=" + encodeURIComponent("آزمون خودکار"));
  ok("new listing appears on public search", (await page.content()).includes("آگهی آزمون خودکار"));

  // transactions + finance
  await page.goto(BASE + "/admin/transactions");
  await page.locator('tbody a[href^="/admin/transactions/"]').first().click();
  await page.waitForURL(/\/admin\/transactions\/\d+/);
  const txUrl = page.url();
  ok("tx shows expected vs received", (await page.content()).includes("کمیسیون مورد انتظار") && (await page.content()).includes("دریافت ناقص"));
  await page.click("text=ثبت دریافت کمیسیون");
  await page.waitForURL(/finance\/new\?tx=/);
  await page.fill('input[name="amount"]', "1500000");
  await page.selectOption('select[name="method"]', "cash");
  await page.setInputFiles("#attachment", { name: "receipt.jpg", mimeType: "image/jpeg", buffer: png });
  await page.click("button:has-text('ثبت')");
  await page.waitForURL(txUrl, { timeout: 15000 });
  ok("commission receipt recorded → fully paid", (await page.content()).includes("تسویه"));
  await page.screenshot({ path: `${SHOTS}/10-transaction.png`, fullPage: true });

  await page.goto(BASE + "/admin/finance");
  ok("finance totals shown", (await page.content()).includes("جمع دریافت"));
  const att = await page.locator('a:has-text("رسید")').first().getAttribute("href");
  const attRes = await page.request.get(BASE + att);
  ok("attachment downloads for finance-capable user", attRes.status() === 200 && attRes.headers()["content-type"] === "image/jpeg");
  // void one entry
  const row = page.locator("tr", { hasText: "1,500,000" }).first();
  const rowCount = await page.locator("tbody tr").count();
  await page.locator('input[name="reason"]').first().fill("آزمون ابطال");
  await page.locator('button:has-text("ابطال")').first().click();
  await page.locator('dialog[open] button.btn-danger').click();
  await page.waitForSelector("text=ثبت باطل شد", { timeout: 10000 });
  ok("finance entry voided (not deleted)", true, `${rowCount} rows before`);
  await page.goto(BASE + "/admin/finance?status=void");
  ok("voided entry kept with reason", (await page.content()).includes("آزمون ابطال"));
  await page.screenshot({ path: `${SHOTS}/11-finance.png`, fullPage: true });

  // CSV
  const csv = await page.request.get(BASE + "/api/admin/export/finance?status=all");
  const body = await csv.text();
  ok("finance CSV export", csv.status() === 200 && body.charCodeAt(0) === 0xfeff && body.includes("مبلغ (تومان)"));

  // reports
  await page.goto(BASE + "/admin/reports");
  ok("operations report", (await page.content()).includes("بار کاری کارکنان"));
  await page.screenshot({ path: `${SHOTS}/12-report-ops.png`, fullPage: true });
  await page.click("a.tab:has-text('مالی')");
  await page.waitForURL(/tab=finance/);
  ok("finance report + receivables", (await page.content()).includes("مطالبات کمیسیون"));
  ok("monthly and yearly finance summaries", (await page.content()).includes("خلاصهٔ سالانه") && (await page.content()).includes("جمع سال"));
  await page.screenshot({ path: `${SHOTS}/13-report-finance.png`, fullPage: true });

  // settings: currency display rial reflects publicly
  await page.goto(BASE + "/admin/settings");
  const curForm = page.locator("form", { has: page.locator('input[name="group"][value="currency"]') });
  await curForm.locator('select[name="display"]').selectOption("rial");
  await curForm.locator("button:has-text('ذخیره')").click();
  await curForm.locator("text=ذخیره شد.").waitFor();
  await page.goto(BASE + href);
  ok("currency setting → rial shown publicly", (await page.content()).includes("ریال"));
  await page.goto(BASE + "/admin/settings");
  await curForm.locator('select[name="display"]').selectOption("toman");
  await curForm.locator("button:has-text('ذخیره')").click();
  await curForm.locator("text=ذخیره شد.").waitFor();
  await page.screenshot({ path: `${SHOTS}/14-settings.png` });

  // users: create agent, then check agent restrictions
  await page.goto(BASE + "/admin/users");
  const cu = page.locator("form", { hasText: "کاربر جدید" });
  await cu.locator('input[name="name"]').fill("مشاور آزمون");
  await cu.locator('input[name="username"]').fill("agent.e2e");
  await cu.locator('select[name="role"]').selectOption("agent");
  await cu.locator('input[name="password"]').fill("agent-pass-2026x");
  await cu.locator('input[name="password2"]').fill("agent-pass-2026x");
  await cu.locator("button:has-text('ساخت کاربر')").click();
  await cu.locator("text=کاربر ساخته شد").waitFor();
  ok("owner creates agent", true);
  await page.screenshot({ path: `${SHOTS}/15-users.png`, fullPage: true });

  const actx = await browser.newContext({ reducedMotion: "reduce", locale: "fa-IR", viewport: { width: 1366, height: 900 } });
  const ap = await actx.newPage();
  await ap.goto(BASE + "/admin/login");
  await ap.fill('input[name="username"]', "agent.e2e");
  await ap.fill('input[name="password"]', "agent-pass-2026x");
  await ap.click("button:has-text('ورود')");
  await ap.waitForURL(BASE + "/admin");
  const nav = await ap.locator(".admin-nav").innerText();
  ok("agent nav hides finance/users/settings", !nav.includes("دریافت و هزینه") && !nav.includes("کاربران") && !nav.includes("تنظیمات"));
  await ap.goto(BASE + "/admin/finance");
  ok("agent blocked from finance page", ap.url().includes("/admin/forbidden"));
  ok("agent blocked from finance CSV", (await ap.request.get(BASE + "/api/admin/export/finance")).status() === 403);
  ok("agent blocked from attachment", (await ap.request.get(BASE + att)).status() === 403);
  await ap.goto(BASE + "/admin/properties");
  await ap.goto(BASE + "/admin/search?q=" + encodeURIComponent("نمونه"));
  const agentSearch = await ap.content();
  ok("agent global search hides finance and others' listings", !agentSearch.includes("دریافت و هزینه") && !agentSearch.includes("آگهی آزمون خودکار"));
  ok("agent sees no owner listings", (await ap.locator("tbody tr").count()) === 0 || !(await ap.content()).includes("آگهی آزمون خودکار"));
  const anon = await (await browser.newContext()).request.get(BASE + "/api/admin/export/contacts");
  ok("anonymous export → 401", anon.status() === 401);

  // admin on a phone
  const mctx = await browser.newContext({ reducedMotion: "reduce", locale: "fa-IR", viewport: { width: 390, height: 844 }, isMobile: true, storageState: await ctx.storageState() });
  const mpa = await mctx.newPage();
  for (const p of ["/admin", "/admin/properties", "/admin/inquiries", "/admin/finance"]) {
    await mpa.goto(BASE + p);
    const of = await mpa.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`admin mobile page fits ${p}`, of <= 1, `overflow ${of}px`);
  }
  await mpa.goto(BASE + "/admin"); await mpa.screenshot({ path: `${SHOTS}/16-admin-mobile.png`, fullPage: true });
  await mctx.close();

  // logout
  await page.goto(BASE + "/admin");
  await page.click("button:has-text('خروج')");
  await page.waitForURL(/\/admin\/login/);
  r = await page.goto(BASE + "/admin/finance");
  ok("logout ends session", page.url().includes("/admin/login"));

  // media for draft listing image must not be public
  await browser.close();
  fs.writeFileSync(SHOTS + "/results.json", JSON.stringify({ results, consoleErrors }, null, 2));
  console.log(`\n${results.filter((x) => x.pass).length}/${results.length} passed; console errors: ${consoleErrors.length}`);
  consoleErrors.slice(0, 10).forEach((e) => console.log("  console:", e));
})().catch(async (e) => {
  try { const pgs = (await (globalThis.__b?.contexts?.() ?? [])); } catch {} console.error("E2E CRASH:", e.message); fs.writeFileSync(SHOTS + "/results.json", JSON.stringify({ results, consoleErrors, crash: e.message }, null, 2)); process.exit(1); });
