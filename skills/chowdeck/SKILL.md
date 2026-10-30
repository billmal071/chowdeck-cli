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

## Rules

- Do not run `order --confirm` without the user's approval of that exact cart and total in this conversation.
- Do not raise the spend limit (`config --max-spend`) unless the user asks.
- If the user's choice is ambiguous (several vendors or dishes fit), ask instead of guessing.
- On errors (closed vendor, unavailable item, over the spend limit), report the problem and offer alternatives. Do not retry `order --confirm` blindly, since that could place a duplicate order. Check `chowdeck history` first.
