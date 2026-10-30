# chowdeck-cli

CLI and agent skill for ordering food on Chowdeck. Read `docs/CONTEXT.md` first (status, findings, decisions, next steps), then `docs/ARCHITECTURE.md`.

- Build: `npm install && npm run build`; typecheck: `npm run typecheck`.
- Default provider is a mock. `CHOWDECK_PROVIDER=web` uses chowdeck.com via Playwright.
- Never implement order placement or payment clicks by guessing at pages you haven't seen. Real orders spend real money.
- Commits are authored as `billmal071 <5255082+billmal071@users.noreply.github.com>` with no AI trailers, unless the user says otherwise.
