# chowdeck-cli

A TypeScript CLI (and agent skill) for ordering food. It currently runs against a **mock provider**; no real orders are placed.

```bash
npm install && npm run build
node dist/cli.js config --address "12 Admiralty Way, Lekki"
node dist/cli.js search burger --json
node dist/cli.js cart add v2 m4 2
node dist/cli.js quote
node dist/cli.js order            # dry run
node dist/cli.js order --confirm
```

- `src/provider.ts`: the `Provider` interface. `src/mock.ts` is the mock; add the real Chowdeck integration (e.g. Playwright browser automation) and swap it in `src/cli.ts`.
- `src/store.ts`: cart, settings (address, max spend) and order audit log, kept in `$CHOWDECK_HOME` or `~/.config/chowdeck`.
- `skills/chowdeck/SKILL.md`: the skill that teaches agents the workflow and safety rules.

## Web provider (in progress)

`CHOWDECK_PROVIDER=web` drives chowdeck.com/store in a real browser using a persistent profile in `$CHOWDECK_HOME/browser-profile`.

```bash
npx playwright install chromium     # or set CHOWDECK_BROWSER_PATH to system Chrome
export CHOWDECK_PROVIDER=web
node dist/cli.js config --address "Admiralty Way, Lekki"
node dist/cli.js search jollof
node dist/cli.js menu lekki-admiralty-way/restaurants/university-of-jollof-street47m586
node dist/cli.js cart add lekki-admiralty-way/restaurants/university-of-jollof-street47m586 water 2
node dist/cli.js quote      # builds the cart on chowdeck.com, prints subtotal and resolved address
```

| Feature | Status |
|---|---|
| Delivery address selection, search, menus, cart, subtotal quote | Working, tested live, no login needed |
| `login` / `whoami` (you log in yourself in a visible browser; phone + OTP + Cloudflare challenge, which this tool does not try to bypass) | Working |
| Delivery and service fees, `order --confirm`, `status` | Not implemented: needs a logged-in session to build and verify, and the tool will not guess where a payment button is |
| Items that need options (sizes, extras) | Not supported; they fail with a clear error |

The selectors target chowdeck.com's current markup (`src/web.ts`), so a site redesign can break them.

## Docs

- [`docs/INSTALL.md`](docs/INSTALL.md): install the CLI and the agent skill, settings, web provider setup
- [`docs/CONTEXT.md`](docs/CONTEXT.md): status, findings about Chowdeck, decisions and next steps (start here in a new session)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): code layout, provider interface, safety model, configuration
- [`docs/outreach/`](docs/outreach/chowdeck-partner-email.md): draft email asking Chowdeck for API access

## License

[MIT](LICENSE)
