// Provider that drives chowdeck.com/store in a real browser. Browsing (address, search,
// menus, cart) works logged out. The session lives in a persistent profile, so a login
// done once with `chowdeck login` (phone number + OTP) is reused by later runs.
// Playwright is imported lazily so the mock provider works without browsers installed.
import type { BrowserContext, Locator, Page, Response } from "playwright";
import { resolveOptions, splitOption } from "./options.js";
import type { Cart, CartLine, MenuItem, OptionGroup, Order, Provider, Quote, Vendor } from "./provider.js";
import { dir as dataDir, loadWebState, profileDir, saveWebState } from "./store.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
/** The last ₦ amount in the text: a discounted price follows the struck-through original. */
const lastNaira = (s: string) => {
  const all = [...s.matchAll(/₦\s*([\d,]+)/g)];
  const m = all[all.length - 1];
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

/** With CHOWDECK_DEBUG=1, saves a screenshot and the page text when a step fails. */
async function saveDebug(page: Page): Promise<void> {
  if (!process.env.CHOWDECK_DEBUG) return;
  try {
    const d = join(dataDir, "debug");
    await mkdir(d, { recursive: true });
    const stamp = Date.now();
    await page.screenshot({ path: join(d, `${stamp}.png`) });
    await writeFile(join(d, `${stamp}.txt`), `${page.url()}\n\n${await page.evaluate(() => document.body.innerText)}`);
    console.error(`debug files saved in ${d}`);
  } catch {
    // best effort only
  }
}

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1));

/** The header's address button. Its first line is a label that varies ("DELIVERY TO", "HOTEL", ...). */
const addressButton = (page: Page) => page.locator('header button[aria-haspopup="dialog"]:visible').first();

const readAddress = async (page: Page): Promise<string> => {
  const lines = (await addressButton(page).innerText()).split("\n").map(clean).filter(Boolean);
  return lines.length > 1 ? lines.slice(1).join(" ") : (lines[0] ?? "");
};
const isUnset = (a: string) => !a || /select an address/i.test(a);

/** Picks the delivery address on chowdeck.com. Returns the address as the site resolved it. */
async function selectAddress(page: Page, address: string): Promise<string> {
  const state = await loadWebState();
  await page.goto(STORE_URL, { waitUntil: "domcontentloaded" });
  await addressButton(page).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500); // the page re-renders once right after load
  const current = await readAddress(page);
  if (state.requested === address && !isUnset(current)) return current;

  await addressButton(page).click();
  await page.getByPlaceholder("Enter a new address").fill(address);
  const rows = page.locator(SUGGESTION);
  try {
    await rows.first().waitFor({ timeout: 10_000 });
  } catch {
    throw new Error(`chowdeck.com found no address matching "${address}"; try a fuller address`);
  }
  // The first suggestion can be a nearby business, so prefer the best word overlap,
  // counting overlap with the street part (before the first comma) double.
  const texts = (await rows.allInnerTexts()).map(clean);
  const want = tokens(address);
  const wantStreet = tokens(address.split(",")[0] ?? "");
  const overlap = (t: string, w: Set<string>) => [...tokens(t)].filter((x) => w.has(x)).length;
  let best = 0;
  let bestScore = -1;
  texts.forEach((t, i) => {
    const score = overlap(t, want) + overlap(t.split(",")[0] ?? "", wantStreet);
    if (score > bestScore) [best, bestScore] = [i, score];
  });
  await rows.nth(best).click();

  let resolved = "";
  for (let i = 0; i < 60 && isUnset(resolved); i++) {
    await page.waitForTimeout(250);
    resolved = await readAddress(page).catch(() => "");
  }
  if (isUnset(resolved)) throw new Error("could not set the delivery address on chowdeck.com");
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
    const price = lastNaira(r.text);
    return {
      index: r.index,
      id: n === 1 ? base : `${base}-${n}`,
      name: clean(r.name),
      price: Number.isNaN(price) ? 0 : price, // out-of-stock items show no price
      available: !/out of stock/i.test(r.text) && !Number.isNaN(price),
      has_options: /\bFrom\b/.test(r.text),
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

const isCartPost = (r: Response) => r.url().includes("/customer/cart") && r.request().method() === "POST";
const dialog = (page: Page) => page.locator("[role=dialog]:visible").filter({ hasText: "Add to cart" }).last();
const GROUP = "div.border-t:has(span.font-medium.text-base)";

/**
 * Clicks an item's Add button. Plain items go straight into the cart ("added"); items with
 * options open a dialog ("dialog") and nothing is added until its own Add to cart is clicked.
 */
async function clickAdd(page: Page, card: Locator, name: string): Promise<"added" | "dialog"> {
  const added = page.waitForResponse(isCartPost, { timeout: 8000 }).then(() => "added" as const).catch(() => null);
  const opened = dialog(page).waitFor({ timeout: 8000 }).then(() => "dialog" as const).catch(() => null);
  await card.getByRole("button").first().click();
  const result = await Promise.race([added, opened]);
  if (!result) throw new Error(`clicking Add on "${name}" did nothing; the page may have changed`);
  if (result === "added") await page.waitForTimeout(700);
  return result;
}

/** Reads the option groups from an open item dialog. */
async function readOptions(dlg: Locator): Promise<OptionGroup[]> {
  // The groups render a moment after the dialog opens: wait for them, then for the count to settle.
  await dlg.locator(GROUP).first().waitFor({ timeout: 6000 }).catch(() => {});
  let seen = -1;
  for (let i = 0; i < 10; i++) {
    const n = await dlg.locator(GROUP).count();
    if (n === seen) break;
    seen = n;
    await dlg.page().waitForTimeout(300);
  }
  return dlg.evaluate((el, sel) => {
    const t = (x: string | null | undefined) => (x ?? "").replace(/\s+/g, " ").trim();
    return [...el.querySelectorAll<HTMLElement>(sel)].map((g) => {
      const lines = g.innerText.split("\n").map(t).filter(Boolean);
      const header = lines.slice(1, 4).join(" "); // e.g. "Select 1 Required" or "Select up to 2"
      const required = /required/i.test(header);
      const upTo = header.match(/up to (\d+)/i);
      const exact = header.match(/select (\d+)/i);
      const max = upTo ? Number(upTo[1]) : exact ? Number(exact[1]) : 1;
      const choices = [...g.querySelectorAll<HTMLElement>("div.px-4 > div")]
        .map((r) => {
          const m = r.innerText.match(/₦\s*([\d,]+)/);
          return { name: t(r.querySelector("span.text-sm")?.textContent), price: m ? Number(m[1]!.replace(/,/g, "")) : 0 };
        })
        .filter((c) => c.name);
      return { name: lines[0] ?? "", required, min: required ? (upTo ? 1 : max) : 0, max, choices };
    });
  }, GROUP);
}

async function closeDialog(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await dialog(page).waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
}

/** Selects the chosen options in the open dialog, sets the quantity and clicks its Add to cart. */
async function addFromDialog(page: Page, line: CartLine, item: { price: number }): Promise<void> {
  const dlg = dialog(page);
  const groups = await readOptions(dlg);
  const picked = resolveOptions(line.name, groups, line.options ?? []);
  if (item.price + picked.delta !== line.unit_price) {
    throw new Error(
      `price of "${line.name}" with its options is now ₦${item.price + picked.delta}, not ₦${line.unit_price}; rebuild the cart`,
    );
  }
  for (const spec of picked.canonical) {
    const { group, choice } = splitOption(spec);
    const gi = groups.findIndex((g) => g.name === group);
    const ci = groups[gi]!.choices.findIndex((c) => c.name === choice);
    await dlg.locator(GROUP).nth(gi).locator("div.px-4 > div").nth(ci).locator("button").first().click();
    await page.waitForTimeout(250);
  }
  for (let n = 1; n < line.qty; n++) {
    await dlg.locator("button.px-2\\.5").last().click();
    await page.waitForTimeout(250);
  }
  const addButton = dlg.getByRole("button", { name: /Add to cart/ });
  const shown = naira(await addButton.innerText());
  const expected = line.unit_price * line.qty;
  if (shown !== expected) {
    await closeDialog(page);
    throw new Error(`the dialog shows ₦${shown} for "${line.name}" but the cart expects ₦${expected}; nothing was added`);
  }
  const posted = page.waitForResponse(isCartPost, { timeout: 10_000 });
  await addButton.click();
  await posted;
  await dlg.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
}

/** Packaging charges (e.g. "Take Away Pack") the vendor adds to the cart automatically. */
async function readPackaging(page: Page): Promise<number> {
  const body = await page.evaluate(() => document.body.innerText);
  const start = body.indexOf("YOUR CART");
  const end = body.indexOf("Subtotal", start);
  if (start < 0 || end < 0) return 0;
  const lines = body.slice(start, end).split("\n").map(clean).filter(Boolean);
  let total = 0;
  lines.forEach((l, i) => {
    if (!/pack|container/i.test(l) || /^pack \d+$/i.test(l) || /add to this pack|duplicate pack/i.test(l)) return;
    const m = lines[i + 1]?.match(/^₦\s*([\d,]+)$/);
    if (m) total += Number(m[1]!.replace(/,/g, ""));
  });
  return total;
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
    try {
      return { page, address: await selectAddress(page, wanted) };
    } catch (e) {
      await saveDebug(page);
      throw e;
    }
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

  async itemOptions(vendorId: string, itemId: string): Promise<OptionGroup[]> {
    const { page } = await this.ready();
    await page.goto(`${STORE_URL}/${vendorId}`, { waitUntil: "domcontentloaded" });
    const menu = await readMenu(page);
    const item = menu.items.find((i) => i.id === itemId);
    if (!item) throw new Error(`item "${itemId}" not found at vendor "${vendorId}"`);
    if (!item.available) throw new Error(`"${item.name}" is unavailable`);
    const result = await clickAdd(page, page.locator(MENU_CARD).nth(item.index), item.name);
    if (result === "added") {
      // A plain item went into the site's cart just by looking; take it back out.
      for (let i = 0; i < 12 && (await readSubtotal(page)) === 0; i++) await page.waitForTimeout(250);
      await clearCart(page);
      return [];
    }
    const groups = await readOptions(dialog(page));
    await closeDialog(page);
    return groups;
  }

  /**
   * Rebuilds the cart on chowdeck.com from ours (clearing whatever was there), picks each item's
   * options, and checks the site's subtotal against ours. Delivery and service fees come at checkout.
   */
  async quote(cart: Cart, _address: string): Promise<Quote> {
    const { page, address } = await this.ready();
    await page.goto(`${STORE_URL}/${cart.vendor_id}`, { waitUntil: "domcontentloaded" });
    const menu = await readMenu(page);
    if (!menu.open) throw new Error(`vendor "${menu.name}" is closed`);
    await clearCart(page);

    let items = 0;
    for (const line of cart.lines) {
      const item = menu.items.find((i) => i.id === line.item_id);
      if (!item) throw new Error(`"${line.name}" is no longer on the menu`);
      if (!item.available) throw new Error(`"${line.name}" is out of stock`);
      const card = () => page.locator(MENU_CARD).nth(item.index);
      const options = line.options ?? [];
      if ((await clickAdd(page, card(), line.name)) === "dialog") {
        await addFromDialog(page, line, item);
      } else {
        if (options.length) throw new Error(`"${line.name}" has no options, but ${options.join(", ")} was given`);
        if (item.price !== line.unit_price) {
          throw new Error(`price of "${line.name}" changed from ₦${line.unit_price} to ₦${item.price}; rebuild the cart`);
        }
        for (let n = 1; n < line.qty; n++) {
          if ((await clickAdd(page, card(), line.name)) !== "added") throw new Error(`unexpected options dialog for "${line.name}"`);
        }
      }
      items += line.unit_price * line.qty;
    }

    await page.waitForTimeout(800);
    const subtotal = await readSubtotal(page);
    const packaging = await readPackaging(page);
    const extra = subtotal - items;
    if (extra < 0 || extra > packaging) {
      throw new Error(
        `chowdeck.com shows a subtotal of ₦${subtotal}, but the cart adds up to ₦${items}${packaging ? ` plus ₦${packaging} packaging` : ""}; nothing was ordered`,
      );
    }
    return {
      subtotal,
      delivery_fee: 0,
      service_fee: 0,
      total: subtotal,
      eta_min: menu.eta_min,
      ...(extra ? { packaging: extra } : {}),
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
