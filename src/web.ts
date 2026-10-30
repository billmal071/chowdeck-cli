// Provider that drives chowdeck.com/store in a real browser. Browsing (address, search,
// menus, cart) works logged out. The session lives in a persistent profile, so a login
// done once with `chowdeck login` (phone number + OTP) is reused by later runs.
// Playwright is imported lazily so the mock provider works without browsers installed.
import type { BrowserContext, Page } from "playwright";
import type { Cart, MenuItem, Order, Provider, Quote, Vendor } from "./provider.js";
import { loadWebState, profileDir, saveWebState } from "./store.js";

const STORE_URL = "https://chowdeck.com/store";
const VENDOR_PATH = /^\/store\/[^/]+\/(restaurants|shops|pharmacy|pharmacies|local-markets)\/[^/?]+$/;
// Selectors for chowdeck.com's current markup; if the site changes, this is what breaks.
const SUGGESTION = "span.overflow-y-auto > span.cursor-pointer";
const MENU_CARD = "span.cursor-pointer:has(h2[title])";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const slug = (s: string) =>
  clean(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const naira = (s: string) => {
  const m = s.match(/₦\s*([\d,]+)/);
  return m ? Number(m[1]!.replace(/,/g, "")) : NaN;
};
const etaMinutes = (s: string) => {
  const m = s.match(/(\d+)\s*-\s*(\d+)\s*mins?/i);
  return m ? Number(m[2]) : 0;
};

async function launch(headless: boolean): Promise<BrowserContext> {
  const { chromium } = await import("playwright");
  return chromium.launchPersistentContext(profileDir(), {
    headless,
    executablePath: process.env.CHOWDECK_BROWSER_PATH || undefined, // e.g. system Chrome
    viewport: { width: 1280, height: 1000 },
  });
}

const loginButton = (page: Page) => page.getByRole("button", { name: "Login", exact: true });

/** Opens a visible browser so you can log in yourself; resolves once the session is saved. */
export async function login(timeoutMs = 5 * 60_000): Promise<void> {
  const ctx = await launch(false);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(`${STORE_URL}/sign-in`);
    console.error("Log in with your phone number and OTP in the browser window...");
    // The header shows a "Login" button only while signed out.
    await loginButton(page).first().waitFor({ state: "detached", timeout: timeoutMs });
    console.error("Logged in. Session saved.");
  } finally {
    await ctx.close();
  }
}

/** True if the saved profile is signed in. */
export async function isLoggedIn(): Promise<boolean> {
  const ctx = await launch(true);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(STORE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    return (await loginButton(page).count()) === 0;
  } finally {
    await ctx.close();
  }
}

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1));

/** Picks the delivery address on chowdeck.com. Returns the address as the site resolved it. */
async function selectAddress(page: Page, address: string): Promise<string> {
  const state = await loadWebState();
  await page.goto(STORE_URL, { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: /Delivery to/i }).first();
  await trigger.waitFor({ timeout: 20_000 });
  const read = async () => clean((await trigger.innerText()).replace(/delivery to/i, ""));
  const current = await read();
  if (state.requested === address && current && !/select an address/i.test(current)) return current;

  await trigger.click();
  await page.getByPlaceholder("Enter a new address").fill(address);
  const rows = page.locator(SUGGESTION);
  try {
    await rows.first().waitFor({ timeout: 10_000 });
  } catch {
    throw new Error(`chowdeck.com found no address matching "${address}"; try a fuller address`);
  }
  // The first suggestion can be a nearby business, so prefer the best word overlap.
  const texts = (await rows.allInnerTexts()).map(clean);
  const want = tokens(address);
  let best = 0;
  let bestScore = -1;
  texts.forEach((t, i) => {
    const score = [...tokens(t)].filter((w) => want.has(w)).length;
    if (score > bestScore) [best, bestScore] = [i, score];
  });
  await rows.nth(best).click();

  let resolved = "";
  for (let i = 0; i < 40 && (!resolved || /select an address/i.test(resolved)); i++) {
    await page.waitForTimeout(250);
    resolved = await read();
  }
  if (!resolved || /select an address/i.test(resolved)) throw new Error("could not set the delivery address on chowdeck.com");
  await saveWebState({ requested: address, resolved });
  return resolved;
}

type MenuRow = MenuItem & { index: number };

async function readMenu(page: Page): Promise<{ name: string; open: boolean; eta_min: number; items: MenuRow[] }> {
  try {
    await page.waitForSelector("h2[title]", { timeout: 20_000 });
  } catch {
    throw new Error("could not load the menu (is the vendor id right? use one from `chowdeck search`)");
  }
  await page.waitForTimeout(1000);
  const raw = await page.evaluate((sel) => {
    const cards = [...document.querySelectorAll<HTMLElement>(sel)];
    return {
      title: document.title,
      h1: document.querySelector("h1")?.textContent ?? "",
      body: document.body.innerText,
      items: cards.map((c, index) => ({
        index,
        name: c.querySelector("h2[title]")!.getAttribute("title") ?? "",
        text: c.innerText,
      })),
    };
  }, MENU_CARD);

  const seen = new Map<string, number>();
  const items = raw.items.map((r) => {
    const base = slug(r.name);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const price = naira(r.text);
    return {
      index: r.index,
      id: n === 1 ? base : `${base}-${n}`,
      name: clean(r.name),
      price: Number.isNaN(price) ? 0 : price, // out-of-stock items show no price
      available: !/out of stock/i.test(r.text) && !Number.isNaN(price),
    };
  });
  // The header reads: ... | 20 - 30 mins | <vendor name> | Verified | ... | CLOSED | OPENS 12:00 PM
  const lines = raw.body.split("\n").map(clean).filter(Boolean);
  const etaAt = lines.findIndex((l) => /^\d+\s*-\s*\d+\s*mins?$/i.test(l));
  const name = (etaAt >= 0 && lines[etaAt + 1]) || clean(raw.title.split(/\s+Menu\s*&|\s[-|–]\s/)[0] ?? "");
  const head = lines.slice(0, 40).join(" | ");
  const open = !/\bCLOSED\b|\bOPENS \d/.test(head);
  return { name, open, eta_min: etaMinutes(raw.body), items };
}

const readSubtotal = async (page: Page): Promise<number> => {
  const body = await page.evaluate(() => document.body.innerText);
  const m = body.match(/Subtotal\s*₦\s*([\d,]+)/);
  return m ? Number(m[1]!.replace(/,/g, "")) : 0;
};

async function clearCart(page: Page): Promise<void> {
  if ((await readSubtotal(page)) === 0) return;
  await page.getByRole("button", { name: "Clear Cart" }).first().click();
  for (let i = 0; i < 20 && (await readSubtotal(page)) !== 0; i++) await page.waitForTimeout(250);
  if ((await readSubtotal(page)) !== 0) throw new Error("could not empty the existing cart on chowdeck.com");
}

export class WebProvider implements Provider {
  private ctx?: BrowserContext;
  constructor(private getAddress: () => Promise<string>) {}

  async close(): Promise<void> {
    await this.ctx?.close();
    this.ctx = undefined;
  }

  private async ready(): Promise<{ page: Page; address: string }> {
    const wanted = await this.getAddress();
    if (!wanted) throw new Error("no delivery address; run `chowdeck config --address ...`");
    this.ctx ??= await launch(true);
    const page = this.ctx.pages()[0] ?? (await this.ctx.newPage());
    return { page, address: await selectAddress(page, wanted) };
  }

  async search(query: string): Promise<Vendor[]> {
    const { page } = await this.ready();
    await page.goto(query ? `${STORE_URL}/search?q=${encodeURIComponent(query)}` : STORE_URL, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector('a[href^="/store/"]', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const cards = await page.$$eval('a[href^="/store/"]', (as) =>
      as.map((a) => ({ href: a.getAttribute("href") ?? "", text: (a as HTMLElement).innerText })),
    );
    const out: Vendor[] = [];
    const seen = new Set<string>();
    for (const c of cards) {
      if (!VENDOR_PATH.test(c.href) || seen.has(c.href)) continue;
      seen.add(c.href);
      const urlSlug = slug(decodeURIComponent(c.href.split("/").pop()!));
      const lines = c.text.split("\n").map(clean).filter(Boolean);
      // Cards mix the name with promo, status, rating and ETA lines; drop those, then
      // prefer the remaining line closest to the URL slug.
      const noise = /%|\boff\b|discount|free|deal|promo|closed|^\d|^\(|mins?$/i;
      const shared = (l: string) => {
        const a = slug(l);
        let i = 0;
        while (i < a.length && i < urlSlug.length && a[i] === urlSlug[i]) i++;
        return i;
      };
      const names = lines.filter((l) => !noise.test(l));
      const name = (names.length ? names : lines).map((l) => ({ l, n: shared(l) })).sort((a, b) => b.n - a.n)[0]?.l ?? urlSlug;
      out.push({
        id: c.href.replace(/^\/store\//, ""),
        name,
        cuisine: c.href.split("/")[3]!,
        open: !/\bclosed\b/i.test(c.text),
        eta_min: etaMinutes(c.text),
      });
      if (out.length >= 20) break;
    }
    return out;
  }

  async menu(vendorId: string): Promise<{ vendor: Vendor; items: MenuItem[] }> {
    const { page } = await this.ready();
    await page.goto(`${STORE_URL}/${vendorId}`, { waitUntil: "domcontentloaded" });
    const m = await readMenu(page);
    return {
      vendor: { id: vendorId, name: m.name, cuisine: vendorId.split("/")[1] ?? "", open: m.open, eta_min: m.eta_min },
      items: m.items.map(({ index: _i, ...item }) => item),
    };
  }

  /** Rebuilds the cart on chowdeck.com from ours, checks the subtotal and returns it. Fees come at checkout. */
  async quote(cart: Cart, _address: string): Promise<Quote> {
    const { page, address } = await this.ready();
    await page.goto(`${STORE_URL}/${cart.vendor_id}`, { waitUntil: "domcontentloaded" });
    const menu = await readMenu(page);
    if (!menu.open) throw new Error(`vendor "${menu.name}" is closed`);
    await clearCart(page);

    let expected = 0;
    for (const line of cart.lines) {
      const item = menu.items.find((i) => i.id === line.item_id);
      if (!item) throw new Error(`"${line.name}" is no longer on the menu`);
      if (!item.available) throw new Error(`"${line.name}" is out of stock`);
      if (item.price !== line.unit_price) {
        throw new Error(`price of "${line.name}" changed from ₦${line.unit_price} to ₦${item.price}; rebuild the cart`);
      }
      for (let n = 0; n < line.qty; n++) {
        await page.locator(MENU_CARD).nth(item.index).getByRole("button").first().click();
        expected += item.price;
        await page.waitForTimeout(1200);
        if ((await readSubtotal(page)) !== expected) {
          throw new Error(`"${line.name}" could not be added as a plain item (it may need options); add it in the Chowdeck app`);
        }
      }
    }
    const subtotal = await readSubtotal(page);
    return {
      subtotal,
      delivery_fee: 0,
      service_fee: 0,
      total: subtotal,
      eta_min: menu.eta_min,
      address,
      note: "Subtotal only: delivery and service fees are added at checkout, so the final total will be higher.",
    };
  }

  async place(_cart: Cart, _address: string): Promise<Order> {
    throw new Error(
      "web provider: placing orders is not implemented. The checkout and payment steps need a logged-in session to build and verify, and this tool will not guess where a payment button is.",
    );
  }

  async status(_orderId: string): Promise<Order> {
    throw new Error("web provider: order status is not implemented yet");
  }
}
