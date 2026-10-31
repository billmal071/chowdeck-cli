# Architecture

```
src/cli.ts       command parsing, safety checks, output (human or --json)
src/provider.ts  Provider interface and shared types (prices are whole naira)
src/mock.ts      in-memory provider; the default; never places real orders
src/web.ts       browser provider (Playwright) for chowdeck.com/store, plus login()/isLoggedIn()
src/options.ts   pure rules for item options (required groups, max picks, ambiguity); has unit tests
src/store.ts     files under $CHOWDECK_HOME (default ~/.config/chowdeck)
skills/chowdeck/SKILL.md   instructions that teach an agent the ordering workflow
```

## Provider interface

`search`, `menu`, `quote`, `place`, `status`, optional `itemOptions` and `close`. `quote` may return an `address` (as the provider resolved it) and a `note` (caveats such as fees not included). To add a provider, implement the interface and select it in `src/cli.ts`.

## Safety model

- `order` is a dry run unless `--confirm` is passed.
- `order` refuses if the quote total exceeds `max_spend` (default ₦15,000, set with `config --max-spend`).
- Confirmed orders are appended to `orders.jsonl`; the cart is cleared after an order.
- One vendor per cart. Unavailable items and closed vendors are rejected.
- The skill tells agents never to confirm without the user's explicit approval of the exact cart, total and address.

## Web provider

- Uses a persistent Chromium profile in `$CHOWDECK_HOME/browser-profile`, so a login and the delivery address persist.
- Vendor id = the path after `/store/` (e.g. `lekki-admiralty-way/restaurants/university-of-jollof-street47m586`). Item id = slug of the item name (deduplicated with `-2`, `-3`).
- `selectAddress` types the configured address, then picks the autocomplete suggestion with the most word overlap (the first suggestion can be a nearby business). The resolved address is shown to the user. Last choice is remembered in `web-state.json`.
- **Options:** `itemOptions` clicks Add: a plain item is added to the site's cart (then cleared again) and returns no groups; otherwise the dialog opens and its groups are read. `cart add --option` resolves picks with `resolveOptions` and stores canonical `Group=Choice` strings plus a per-unit price including option prices. `quote` re-opens the dialog for each such line, clicks the choices, sets the quantity with the stepper, and checks the dialog's "Add to cart" total against the cart before clicking it.
- `quote` rebuilds the cart on chowdeck.com (clears it, clicks Add per unit), verifies the subtotal after every click, and returns the subtotal, explaining any automatic packaging charge (subtotal minus items must not exceed the packaging lines shown in the cart panel).
- Selectors (`MENU_CARD`, `SUGGESTION`, and text patterns) match the site's current markup and will need updating if it is redesigned.

## Configuration

| Variable | Meaning |
|---|---|
| `CHOWDECK_PROVIDER` | `web` for chowdeck.com; anything else uses the mock |
| `CHOWDECK_HOME` | data directory (settings, cart, order log, browser profile) |
| `CHOWDECK_BROWSER_PATH` | Chrome/Chromium executable to use instead of Playwright's |
| `CHOWDECK_DEBUG` | set to 1 to save a screenshot and page text to `$CHOWDECK_HOME/debug/` when address selection fails |

Files in `$CHOWDECK_HOME`: `settings.json`, `cart.json`, `orders.jsonl`, `web-state.json`, `browser-profile/`. The profile holds a logged-in session, so treat the directory as sensitive.
