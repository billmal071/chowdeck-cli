#!/usr/bin/env node
// chowdeck: browse and order food from the command line. Add --json to any command.
import { parseArgs } from "node:util";
import { MockProvider } from "./mock.js";
import { WebProvider, isLoggedIn, login } from "./web.js";
import type { Cart, Provider } from "./provider.js";
import * as store from "./store.js";

const usage = `chowdeck - order food from the terminal

Usage:
  chowdeck login | whoami          (web provider only)
  chowdeck config [--address ADDR] [--max-spend NAIRA]
  chowdeck search [QUERY]
  chowdeck menu VENDOR_ID
  chowdeck cart add VENDOR_ID ITEM_ID [QTY]
  chowdeck cart show | clear
  chowdeck quote
  chowdeck order [--confirm]
  chowdeck status ORDER_ID
  chowdeck history

Add --json to any command for machine-readable output.
Orders are a dry run unless --confirm is passed.
Set CHOWDECK_PROVIDER=web to use chowdeck.com (default: mock, no real orders).`;

const useWeb = process.env.CHOWDECK_PROVIDER === "web";
const provider: Provider = useWeb ? new WebProvider() : new MockProvider();

async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      confirm: { type: "boolean" },
      address: { type: "string" },
      "max-spend": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, ...pos] = positionals;
  if (!cmd || cmd === "help" || values.help) return void console.log(usage);

  const out = (data: unknown, human: string) =>
    console.log(values.json ? JSON.stringify(data, null, 2) : human);

  switch (cmd) {
    case "login":
    case "whoami": {
      if (!useWeb) throw new Error("only available with CHOWDECK_PROVIDER=web");
      if (cmd === "login") await login();
      const ok = await isLoggedIn();
      return out({ logged_in: ok }, ok ? "logged in" : "not logged in");
    }

    case "config": {
      const s = await store.loadSettings();
      if (values.address) s.address = values.address;
      if (values["max-spend"]) {
        const n = Number(values["max-spend"]);
        if (!Number.isInteger(n) || n <= 0) throw new Error("--max-spend must be a positive whole number");
        s.max_spend = n;
      }
      await store.saveSettings(s);
      return out(s, `address: "${s.address}"\nmax spend: ₦${s.max_spend}`);
    }

    case "search": {
      const vs = await provider.search(pos[0] ?? "");
      return out(vs, vs.map((v) => `${v.id}  ${v.name} (${v.cuisine}) open=${v.open} eta=${v.eta_min}min`).join("\n"));
    }

    case "menu": {
      if (!pos[0]) throw new Error("usage: chowdeck menu VENDOR_ID");
      const { vendor, items } = await provider.menu(pos[0]);
      const lines = items.map((i) => `  ${i.id}  ${i.name}  ₦${i.price} available=${i.available}`);
      return out({ vendor, items }, [`${vendor.name} (open=${vendor.open})`, ...lines].join("\n"));
    }

    case "cart":
      return cartCommand(pos, out);

    case "quote": {
      const { cart, address } = await loadReady();
      const q = await provider.quote(cart, address);
      return out(q, `subtotal ₦${q.subtotal} + delivery ₦${q.delivery_fee} + service ₦${q.service_fee} = ₦${q.total} (eta ${q.eta_min}min)`);
    }

    case "order": {
      const { cart, address, max_spend } = await loadReady();
      const q = await provider.quote(cart, address);
      if (q.total > max_spend) {
        throw new Error(`total ₦${q.total} exceeds max spend ₦${max_spend} (raise with \`chowdeck config --max-spend\`)`);
      }
      if (!values.confirm) {
        return out(
          { dry_run: true, quote: q, address },
          `DRY RUN: would order for ₦${q.total} to "${address}". Re-run with --confirm to place it.`,
        );
      }
      const o = await provider.place(cart, address);
      await store.appendOrder(o);
      await store.saveCart({ vendor_id: "", lines: [] });
      return out(o, `placed order ${o.id} for ₦${o.total} (${o.status})`);
    }

    case "status": {
      if (!pos[0]) throw new Error("usage: chowdeck status ORDER_ID");
      const o = await provider.status(pos[0]);
      return out(o, `${o.id}: ${o.status}`);
    }

    case "history": {
      const os = await store.history();
      return out(os, os.map((o) => `${o.id}  ₦${o.total}  ${o.status}  ${o.placed_at}`).join("\n"));
    }

    default:
      throw new Error(`unknown command "${cmd}"\n\n${usage}`);
  }

  async function cartCommand(args: string[], print: typeof out): Promise<void> {
    const cart = await store.loadCart();
    switch (args[0]) {
      case "add": {
        const [, vendorId, itemId, qtyArg] = args;
        if (!vendorId || !itemId) throw new Error("usage: chowdeck cart add VENDOR_ID ITEM_ID [QTY]");
        const qty = qtyArg === undefined ? 1 : Number(qtyArg);
        if (!Number.isInteger(qty) || qty < 1) throw new Error("QTY must be a positive number");
        if (cart.vendor_id && cart.vendor_id !== vendorId) {
          throw new Error("cart already has items from another vendor; run `chowdeck cart clear` first");
        }
        const { items } = await provider.menu(vendorId);
        const item = items.find((i) => i.id === itemId);
        if (!item) throw new Error(`item "${itemId}" not found at vendor "${vendorId}"`);
        if (!item.available) throw new Error(`"${item.name}" is unavailable`);
        cart.vendor_id = vendorId;
        cart.lines.push({ item_id: item.id, name: item.name, qty, unit_price: item.price });
        await store.saveCart(cart);
        return print(cart, `added ${qty}x ${item.name}`);
      }
      case "show":
        return print(cart, [`vendor: ${cart.vendor_id}`, ...cart.lines.map((l) => `  ${l.qty}x ${l.name} ₦${l.unit_price}`)].join("\n"));
      case "clear": {
        const empty: Cart = { vendor_id: "", lines: [] };
        await store.saveCart(empty);
        return print(empty, "cart cleared");
      }
      default:
        throw new Error("usage: chowdeck cart add|show|clear");
    }
  }
}

async function loadReady() {
  const [cart, s] = await Promise.all([store.loadCart(), store.loadSettings()]);
  if (cart.lines.length === 0) throw new Error("cart is empty");
  if (!s.address) throw new Error("no delivery address; run `chowdeck config --address ...`");
  return { cart, ...s };
}

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error("error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
