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
