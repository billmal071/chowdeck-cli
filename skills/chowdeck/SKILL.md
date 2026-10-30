---
name: chowdeck
description: Order food from Chowdeck via the `chowdeck` CLI. Use when the user asks to find food, browse a restaurant menu, build a cart, get a price quote, place or track a food delivery order.
---

# Ordering food with the chowdeck CLI

Always pass `--json` and parse the output. Prices are in naira (₦).

## Workflow

1. **Check setup.** Run `chowdeck config --json`. If `address` is empty, ask the user for their delivery address and run `chowdeck config --address "<address>"`.
2. **Find a vendor.** `chowdeck search "<query>" --json`. Skip vendors with `open: false`.
3. **Read the menu.** `chowdeck menu <vendor_id> --json`. Only use items with `available: true`.
4. **Build the cart.** `chowdeck cart add <vendor_id> <item_id> [qty]`. A cart holds one vendor only; use `chowdeck cart clear` to start over.
5. **Quote.** `chowdeck quote --json`, which returns subtotal, fees, total and ETA.
6. **Get explicit approval.** Show the user the items, total, address and ETA, and wait for a clear "yes". Never skip this step, and never infer approval from the original request.
7. **Place the order.** `chowdeck order --confirm --json`. Without `--confirm` it is a dry run, which is safe to use to preview.
8. **Track.** `chowdeck status <order_id> --json`. `chowdeck history --json` lists past orders.

## With the real Chowdeck site (`CHOWDECK_PROVIDER=web`)

- Vendor ids are paths like `lekki-admiralty-way/restaurants/university-of-jollof-street47m586`. Use the id exactly as `search` returns it.
- Item ids are slugs from `menu` (e.g. `water`, `egusi-soup`).
- `quote` builds the cart on chowdeck.com and returns the **subtotal only**. Delivery and service fees are added at checkout, so tell the user the final total will be higher.
- `quote` and `order` print the delivery address the site resolved (`delivering to: ...`). Show it to the user and confirm it is right before any order, because the site picks the closest match to the text in `config --address`.
- Items that need options (sizes, extras) can't be added; tell the user to add those in the Chowdeck app.
- Placing orders is **not implemented** for the web provider yet: `order --confirm` fails by design. Do not look for workarounds. Give the user the vendor, items and subtotal so they can finish in the Chowdeck app.

## Rules

- Do not run `order --confirm` without the user's approval of that exact cart and total in this conversation.
- Do not raise the spend limit (`config --max-spend`) unless the user asks.
- If the user's choice is ambiguous (several vendors or dishes fit), ask instead of guessing.
- On errors (closed vendor, unavailable item, over the spend limit), report the problem and offer alternatives. Do not retry `order --confirm` blindly, since that could place a duplicate order. Check `chowdeck history` first.
