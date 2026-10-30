# Install and set up

Needs Node 20 or newer.

## 1. Install the CLI

**Option A: from a clone (simplest, and easy to update with `git pull`)**

```bash
git clone https://github.com/billmal071/chowdeck-cli
cd chowdeck-cli
npm install          # also builds, via the `prepare` script
npm install -g .     # puts `chowdeck` on your PATH, linked to this folder
```

Keep the clone in place: the global command points at it. After `git pull`, run `npm install` again to rebuild.

**Option B: standalone copy (no link to the clone)**

```bash
cd chowdeck-cli && npm install && npm pack
npm install -g ./chowdeck-cli-0.1.0.tgz
```

Check it works:

```bash
chowdeck --help
chowdeck search burger     # uses the mock provider, no real orders
```

Don't install straight from GitHub with `npm install -g github:billmal071/chowdeck-cli`: with the npm version tested (10.9) it links to a temporary clone that is deleted afterwards.

## 2. Install the skill so your agent knows how to use it

The skill is `skills/chowdeck/SKILL.md`. The agent runs `chowdeck` in a shell, so make sure `chowdeck --help` works in the shell the agent uses.

- **Claude Code (all projects):**
  ```bash
  mkdir -p ~/.claude/skills/chowdeck
  cp skills/chowdeck/SKILL.md ~/.claude/skills/chowdeck/SKILL.md
  ```
- **Claude Code (one project):** copy it to `.claude/skills/chowdeck/SKILL.md` inside that project.
- **Other agents:** it is plain markdown instructions. Paste it into the agent's instructions or rules file.

Then ask the agent something like "find me jollof rice and build a cart". Because the default provider is a mock, it is safe to try.

## 3. Settings

```bash
chowdeck config --address "12 Admiralty Way, Lekki" --max-spend 15000
```

The spend cap (₦ per order) and a delivery address are required before `quote` or `order`.

## 4. Use the real Chowdeck site (web provider)

```bash
export CHOWDECK_PROVIDER=web
```

The web provider drives a real browser. It needs one of:

- Playwright's Chromium: from the clone, run `npx playwright install chromium`, or
- your own Chrome/Chromium: `export CHOWDECK_BROWSER_PATH=/path/to/chrome`.

Then search, menus, cart and subtotal quotes work, no login needed. For a logged-in session, run `chowdeck login` and sign in yourself in the window that opens. Ordering itself is not implemented yet; see [CONTEXT.md](CONTEXT.md) for what's left.

## Where data lives

`~/.config/chowdeck` (or `$CHOWDECK_HOME`): settings, cart, order log, remembered address and the browser profile. The profile holds a logged-in session, so keep that folder private. To remove everything: `npm uninstall -g chowdeck-cli`, delete that folder and delete `~/.claude/skills/chowdeck`.
