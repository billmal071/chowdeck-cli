// Provider that drives chowdeck.com/store in a real browser. The session lives in a
// persistent profile, so you sign in once (phone number + OTP) with `chowdeck login`.
// Playwright is imported lazily so the mock provider works without browsers installed.
import type { BrowserContext } from "playwright";
import type { Cart, Order, Provider, Quote, Vendor, MenuItem } from "./provider.js";
import { profileDir } from "./store.js";

const STORE_URL = "https://chowdeck.com/store";

async function launch(headless: boolean): Promise<BrowserContext> {
  const { chromium } = await import("playwright");
  return chromium.launchPersistentContext(profileDir(), {
    headless,
    executablePath: process.env.CHOWDECK_BROWSER_PATH || undefined, // e.g. system Chrome
    viewport: { width: 1280, height: 900 },
  });
}

/** Opens a visible browser so you can log in yourself; resolves once the session is saved. */
export async function login(timeoutMs = 5 * 60_000): Promise<void> {
  const ctx = await launch(false);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(`${STORE_URL}/sign-in`);
    console.error("Log in with your phone number and OTP in the browser window...");
    // The header shows a "Login" button only while signed out.
    await page.getByRole("button", { name: "Login", exact: true }).first().waitFor({ state: "detached", timeout: timeoutMs });
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
    return (await page.getByRole("button", { name: "Login", exact: true }).count()) === 0;
  } finally {
    await ctx.close();
  }
}

const todo = (what: string) =>
  new Error(`web provider: ${what} is not implemented yet (selectors must be recorded from a logged-in session)`);

export class WebProvider implements Provider {
  search(_query: string): Promise<Vendor[]> {
    throw todo("search");
  }
  menu(_vendorId: string): Promise<{ vendor: Vendor; items: MenuItem[] }> {
    throw todo("menu");
  }
  quote(_cart: Cart, _address: string): Promise<Quote> {
    throw todo("quote");
  }
  place(_cart: Cart, _address: string): Promise<Order> {
    throw todo("place");
  }
  status(_orderId: string): Promise<Order> {
    throw todo("status");
  }
}
