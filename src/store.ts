// Keeps the cart, settings and order audit log on disk.
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Cart, Order } from "./provider.js";

export interface Settings {
  address: string;
  max_spend: number; // naira per order
}

export const dir = process.env.CHOWDECK_HOME ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "chowdeck");

async function read<T>(name: string, fallback: T): Promise<T> {
  try {
    return { ...fallback, ...JSON.parse(await readFile(join(dir, name), "utf8")) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

async function write(name: string, value: unknown): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
}

export const loadSettings = () => read<Settings>("settings.json", { address: "", max_spend: 15000 });
export const saveSettings = (s: Settings) => write("settings.json", s);
export const loadCart = () => read<Cart>("cart.json", { vendor_id: "", lines: [] });
export const saveCart = (c: Cart) => write("cart.json", c);

export async function appendOrder(o: Order): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await appendFile(join(dir, "orders.jsonl"), JSON.stringify(o) + "\n", { mode: 0o600 });
}

export async function history(): Promise<Order[]> {
  try {
    const text = await readFile(join(dir, "orders.jsonl"), "utf8");
    return text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Order);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

/** Browser profile that holds the logged-in Chowdeck session. */
export const profileDir = () => join(dir, "browser-profile");
