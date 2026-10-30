# Project context and decisions

Read this first when picking the project up in a new session. Last updated 2026-10-30.

## Goal

A CLI plus an agent skill so a person's AI assistant can order food on Chowdeck (Nigerian delivery platform) for them, with the person approving every order.

## State of play

| Area | Status |
|---|---|
| CLI (config, search, menu, cart, quote, order, status, history, `--json`) | Done |
| Safety: dry-run by default, `--confirm`, per-order spend cap, audit log | Done |
| Agent skill (`skills/chowdeck/SKILL.md`) | Done |
| Mock provider (canned vendors, never places real orders) | Done, the default |
| Web provider: address, search, menus, cart, subtotal quote | Done, tested live, no login needed |
| Web provider: login/whoami | Done (user logs in by hand in a visible browser) |
| Web provider: delivery/service fees, `place`, `status` | **Not built** (needs a logged-in session) |
| Official API access from Chowdeck | **Not obtained**; partner email drafted, see `docs/outreach/` |

## Key findings about Chowdeck (checked 2026-10-30)

- **No public customer ordering API.** The website calls a private API at `api.chowdeck.com`. We do not call it directly: it is undocumented, unstable and likely against their terms.
- **Web ordering exists** at `https://chowdeck.com/store`. Browsing works logged out once a delivery address is chosen (autocomplete dialog, `Enter a new address`).
- **Login** is phone number + OTP on `/store/sign-in`, behind a Cloudflare challenge. We do not try to bypass it. `chowdeck login` opens a visible browser so the user logs in themselves.
- **Cart is server-side**, tied to the browser session, so the persistent profile keeps it.
- **WhatsApp ordering** exists (`https://wa.me/2349165045801`, linked from `chowdeck.com/ai`). There is no documented API. Programmatic use would mean automating a WhatsApp account (unofficial libraries break WhatsApp's terms and risk bans) or misusing the Business Cloud API. Replies are free text. **Rejected.**
- **Paystack Index** ([help page](https://index.paystack.com/legal/support/food-orders)) is an AI agent that links to a Chowdeck account (phone + OTP) and orders on the user's behalf, paid from Chowdeck or Zap balance. It shows Chowdeck supports partner agents, but third-party access is not documented. Only that one page was read.
- Approaches considered and rejected: reverse-engineering the private API, WhatsApp bridge. Chosen: browser automation now, official API if Chowdeck grants it.

## Decisions

- **Language: TypeScript** (Node 20+). Go was scaffolded first and deleted when the user switched to TypeScript. Playwright is first-class in TS.
- **Provider interface** (`src/provider.ts`) isolates Chowdeck access, so the CLI and skill stay unchanged if an API provider replaces the browser one.
- **Never guess at payment.** `place()` throws on purpose. A wrong click on an unseen checkout page could charge real money.
- **Repo:** https://github.com/billmal071/chowdeck-cli (public, `main`). Commits are authored as `billmal071 <5255082+billmal071@users.noreply.github.com>` with no AI trailers, at the user's request.
- **License: MIT**, copyright `billmal071` (2026).

## Next steps (in order)

1. Send the partner email (`docs/outreach/chowdeck-partner-email.md`). If Chowdeck grants API access, add an `ApiProvider` and stop here.
2. Otherwise finish the web provider, which needs the user's logged-in session:
   1. User runs `CHOWDECK_PROVIDER=web node dist/cli.js login` on their own machine.
   2. Record or screenshot the checkout flow (`npx playwright codegen https://chowdeck.com/store`, or screenshots of checkout and payment).
   3. Implement fee parsing in `quote()`, then `place()` and `status()` in `src/web.ts`. Verify against a real, small order the user approves.
3. Support items with options (sizes, extras); currently they fail with a clear error.
4. Add install steps for the skill.

## Working in a cloud session (gotchas)

- Playwright from npm expects a newer browser build than the one pre-installed in the cloud container. Run with `CHOWDECK_BROWSER_PATH=/opt/pw-browsers/chromium`.
- Cloud sessions can't do the OTP login, so only logged-out features can be tested there.
- Quick live check:
  ```bash
  npm install && npm run build
  export CHOWDECK_HOME=$(mktemp -d) CHOWDECK_PROVIDER=web CHOWDECK_BROWSER_PATH=/opt/pw-browsers/chromium
  node dist/cli.js config --address "Admiralty Way, Lekki"
  node dist/cli.js search jollof
  node dist/cli.js cart add lekki-admiralty-way/restaurants/university-of-jollof-street47m586 water 2
  node dist/cli.js quote   # expect subtotal 1000 at the time of writing
  ```
  Vendors and prices change, so adjust the ids.
- The GitHub tools available in cloud sessions can't change repo visibility or create repos in other people's accounts.
