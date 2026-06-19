# Abhinand's Pi Setup

<p align="center">
  <img src="assets/featured.png" alt="Pi setup screenshot" width="800">
</p>

Personal `pi-setup` for [Pi coding agent](https://pi.dev): extensions, custom themes, skills, config examples, and sync tooling.

**Recommendation:** install the Pi CLI first, then run this setup. This repo wraps and customizes an existing Pi install; it is not a replacement installer for Pi itself.

## Core model

`~/.pi/agent` is the live Pi setup. This repo is the versioned `pi-setup` copy used to back up that live setup to GitHub and recreate it on any machine.

```txt
Live Pi runtime / source of truth:
  ~/.pi/agent/extensions
  ~/.pi/agent/themes
  ~/.pi/agent/skills
  ~/.pi/agent/settings.json
  ~/.pi/agent/mcp.json

Versioned pi-setup repo:
  ~/dev/ai-agents/pi-setup
  updated from live Pi files by pi-setup-sync
```

Normal flow:

```txt
make Pi changes in ~/.pi/agent  ->  pi-setup-sync  ->  GitHub
GitHub clone on another machine ->  install Pi CLI -> ./install.sh --restore --copy-config -> ~/.pi/agent
```

Do **not** install this checkout as an active Pi package in normal use. Loading both `~/.pi/agent` and this repo causes duplicate skill/theme conflict warnings at startup. If you are editing Pi functionality while your shell is inside this repo, edit the live file under `~/.pi/agent/...` first, then run `pi-setup-sync` to copy it back here.

## What's included

| Area | Included |
| --- | --- |
| Launcher | Compact `pi` wrapper with one-line major/minor update notices |
| Install safety | `--dry-run` preview, `--backup`, and `--revert <backup-dir>` |
| Sync | `pi-setup-sync` copies live `~/.pi/agent` resources back to this repo, commits, and pushes |
| Extensions | welcome header, context breakdown, file-change review, safety guard, custom footer, local model manager |
| Config examples | Safe `settings.example.json` and `mcp.example.json` without personal provider/model choices |
| Themes | `nebula-pulse`, `opencode`, `tokyo-night`, `one-dark-pro`, and more |
| Skills | Portable backups of installed Pi/agent skills |
| Smoke test | Docker restore/sync contract test in `tests/docker-e2e.sh` |

- `bin/pi` — compact Pi launcher wrapper
  - one-line major/minor update notices instead of large startup boxes
  - suppresses Pi's large built-in update boxes via `PI_OFFLINE=1` after its own compact notice
  - detects the real Pi binary from `PI_REAL_BIN`, `/usr/local/bin/pi`, `/usr/bin/pi`, or `/opt/homebrew/bin/pi`
  - preserves Pi's native themed header and loaded skills/extensions/themes listing
- `extensions/` — versioned copies of custom Pi extensions
  - themed startup welcome card with `/welcome updates on|off`
  - `/context` usage breakdown for startup tokens, messages, and tool calls (scrollback output; not added to model context)
  - `/filechanges` review/accept/decline workflow for Pi-made `edit`/`write` changes
  - `/safety` and `/permissions` guard rails for risky shell/file actions
  - `/accept on|off|status` toggle to require per-edit confirmation with a diff preview (Confirm-Edits)
  - custom footer with input/output/reasoning tokens, cost, context %, tokens/sec, model, thinking level, and git branch
  - `/local-models` manager for OpenAI-compatible local endpoints such as Ollama, LM Studio, RunPod, or llama.cpp servers
- `themes/` — versioned copies of custom themes
  - `nebula-pulse` *(current default)*
  - `opencode`
  - `tokyo-night`
  - `one-dark-pro`
  - `dracula`
  - `catppuccin-mocha`
  - `nord`
  - `gruvbox`
  - `rose-pine`
  - `synthwave-84`
- `skills/` — versioned portable copies of installed Pi skills
  - diagnose, find-docs, find-skills, grill-me, grill-with-docs, handoff, hf-cli, improve-codebase-architecture, mcp-code-search, teach, write-a-skill
- `config/` — safe example config files

## Set up from GitHub on a machine

Install Pi first (preferred), so `pi` already works before this repo adds the optional compact launcher. In containers or unusual installs, Pi may live at `/usr/local/bin/pi`; the launcher now detects that, and you can override it with `PI_REAL_BIN=/path/to/pi`.

On a minimal Ubuntu machine/container, install clone prerequisites first:

```bash
sudo apt-get update
sudo apt-get install -y git ca-certificates
```

Fast path with preview first:

```bash
# Show exactly what would change without installing anything
curl -fsSL https://raw.githubusercontent.com/abhinand5/pi-setup/main/install.sh \
  | bash -s -- --restore --copy-config --dry-run

# Install with a timestamped backup you can revert
curl -fsSL https://raw.githubusercontent.com/abhinand5/pi-setup/main/install.sh \
  | bash -s -- --restore --copy-config --backup
```

The one-line installer clones/updates this repo at `~/dev/ai-agents/pi-setup` by default, then runs the checked-out installer. Override with `PI_SETUP_CHECKOUT=/path/to/pi-setup` or `PI_SETUP_REPO_URL=https://github.com/<user>/<repo>.git`.

Manual clone path:

```bash
git clone git@github.com:abhinand5/pi-setup.git ~/dev/ai-agents/pi-setup
cd ~/dev/ai-agents/pi-setup
./install.sh --restore --copy-config --backup
```

For HTTPS:

```bash
git clone https://github.com/abhinand5/pi-setup.git ~/dev/ai-agents/pi-setup
cd ~/dev/ai-agents/pi-setup
./install.sh --restore --copy-config --backup
```

Useful installer options:

```bash
./install.sh --restore --copy-config --dry-run   # preview without changing files
./install.sh --restore --copy-config --backup    # save current live files first
./install.sh --revert ~/.pi/agent/backups/pi-setup-YYYYMMDD-HHMMSS
```

`--restore` copies repo resources into `~/.pi/agent/extensions`, `~/.pi/agent/themes`, and `~/.pi/agent/skills`.

`--copy-config` copies `config/settings.example.json` and `config/mcp.example.json` into `~/.pi/agent/`.

`--backup` saves current `extensions`, `themes`, `skills`, `settings.json`, and `mcp.json` under `~/.pi/agent/backups/pi-setup-*` before replacing anything. Revert with the exact command printed at the end of install.

The example settings intentionally do **not** include personal model/provider selections (`defaultProvider`, `defaultModel`, or `enabledModels`). Configure your own models after restore; otherwise Pi may warn about model IDs that only exist on someone else's machine.

Warnings:

- `--restore` replaces the current contents of those live resource directories.
- `--copy-config` overwrites `~/.pi/agent/settings.json` and `~/.pi/agent/mcp.json`.
- Use `--dry-run` first if you only want to preview the restore.

## Use your own GitHub repo

`pi-setup-sync` does not hardcode a GitHub URL. It commits in the checkout it is installed from and runs `git push`, so it uses that checkout's configured git remote.

For your own backup, fork or create your own repo first, then clone that repo:

```bash
git clone git@github.com:<user>/<repo>.git ~/dev/ai-agents/pi-setup
cd ~/dev/ai-agents/pi-setup
./install.sh --restore --copy-config
```

If you cloned this repo first and want future syncs to push to your own GitHub repo, change `origin`:

```bash
git remote -v
git remote set-url origin git@github.com:<user>/<repo>.git
git remote -v
```

Then `pi-setup-sync` will back up your live `~/.pi/agent` changes to that remote.

## Install helper commands only

On a machine that already has the live files in `~/.pi/agent`, run:

```bash
./install.sh
```

This installs:

- `pi-setup-sync` into `~/.local/bin`
- compact launcher `bin/pi` into `~/.local/bin/pi`

It also removes any legacy settings entry that points Pi at this repo as an active package.

## Uninstall pi-setup changes

To remove only what this repo installed/restored while leaving the underlying Pi CLI untouched:

```bash
./uninstall.sh
```

This removes the compact launcher, the `pi-setup-sync` helper if it points at this checkout, and restored resources under `~/.pi/agent/extensions`, `themes`, and `skills` that are owned by this repo. It removes copied example config files only when they are still identical to the examples; modified settings are left in place.

Preview first:

```bash
./uninstall.sh --dry-run
```

## Sync live Pi tweaks back to GitHub

After changing Pi locally, run this from the repo:

```bash
./sync.sh
```

Install the global helper from this checkout:

```bash
./setup_sync.sh
```

Then use it from anywhere:

```bash
pi-setup-sync
```

`pi-setup-sync` copies current `~/.pi/agent/extensions`, `~/.pi/agent/themes`, selected skills, `settings.json`, and `mcp.json` into this repo, validates JSON/theme tokens, commits, and pushes. It strips any self-referential package entry that would make Pi load this `pi-setup` repo at startup.

Syncing requires `git` and `python3`; pushing requires normal GitHub credentials for this repo.

Custom commit message:

```bash
pi-setup-sync "Update themes and footer"
```

Commit without pushing:

```bash
pi-setup-sync --no-push "Checkpoint local Pi setup"
```

Skill backup scans `~/.pi/agent/skills` and `~/.agents/skills`, resolves symlinks, dedupes duplicates, and stores portable copies in `skills/`. All skills are selected by default; press Enter at the selector to accept all in one keystroke. To customize, use ↑/↓ to move, Space to toggle, `a` for all, `n` for none, and Enter to continue.

Non-interactive options:

```bash
pi-setup-sync --all-skills
pi-setup-sync --skills hf-cli,diagnose "Back up selected skills"
pi-setup-sync --no-skills "Skip skill backup"
```

## Manual tests

Run the Docker end-to-end smoke test when you want to verify the setup/restore contract without adding CI:

```bash
tests/docker-e2e.sh
```

The test starts a fresh Ubuntu container, installs minimal clone prerequisites, clones this repo from its git remote, runs `./install.sh --restore --copy-config`, verifies the live `~/.pi/agent` layout, then checks that `pi-setup-sync` can copy a live change back into the cloned repo without pushing.

Useful variants:

```bash
tests/docker-e2e.sh --restore-only
tests/docker-e2e.sh --remote https://github.com/<user>/<repo>.git --branch main
```

## Feature audit

This repo currently includes these Pi customizations.

### Launcher and startup

- `bin/pi` wraps an existing Pi CLI instead of replacing it.
- Shows compact update notices only for major/minor Pi or npm package updates.
- Uses `PI_COMPACT_UPDATE_CHECK=0` or `/welcome updates off` to disable compact update notices.
- Uses `PI_REAL_BIN=/path/to/pi` if Pi is installed somewhere unusual.
- `extensions/flow-title.ts` replaces the startup header with a themed Pi logo, version, active model, cwd, key hints, and project name.

### Commands added by extensions

```txt
/welcome updates on|off       # toggle compact startup update notices
/context                      # explain context-window usage
/filechanges                  # inspect tracked edit/write changes and diffs
/filechanges-accept [force]   # keep files and clear the filechanges log
/filechanges-decline [force]  # revert tracked Pi-made changes
/safety enable|disable|status # manage Safety Guard
/permissions ...              # alias for /safety
/accept on|off|status         # require diff-preview confirmation before each edit/write
/local-models                 # add, refresh, remove, and select local LLM endpoints
```

### Context and review workflow

- `/context` estimates startup prompt, skills, context files, selected tools, messages, and tool-call result usage.
- `/filechanges` tracks successful Pi `edit` and `write` tool calls, stores baselines in the session, shows a status/widget, renders diffs, and can accept or revert all tracked changes.
- Non-interactive accept/decline requires `force` to avoid accidental destructive reverts.

### Safety Guard

- Injects a short safety instruction before agent start.
- Blocks or asks for confirmation before destructive/risky actions not explicitly requested by the user.
- Detects force pushes, amend/rebase/reset hard, branch/tag deletion, recursive deletion, protected path writes, package removals, service changes, broad `sudo`, and context purge.
- In git repos, normal recoverable edits are allowed without extra prompts.

### Confirm-Edits

- `/accept on` (or `/accept confirm`) turns OFF auto-accept: every Pi `edit` and `write` tool call is intercepted before execution and shown as a diff overlay in the Pi TUI. Press **Enter** to apply or **Esc / Ctrl-C** to skip.
- `/accept off` (or `/accept auto`) restores Pi's default behavior: edits and writes apply without asking.
- `/accept status` reports the current mode; bare `/accept` toggles.
- Mode is persisted in `~/.pi/agent/accept-edits.json` and a footer status (`accept: auto` / `accept: confirm`) reflects it.
- When confirmation is ON, a short steering note is appended to the system prompt so the model knows changes are gated and should not immediately retry a rejected change.
- In headless (non-interactive) sessions with confirmation ON, edits/writes are blocked because there is no UI to confirm them.

### Local models

- `/local-models` manages OpenAI-compatible endpoints.
- Stores endpoint metadata in `~/.pi/agent/local-models.json`.
- Registers available models as `local-<endpoint-id>` providers during extension load so `/model` can see them.
- Supports endpoint refresh, model selection, and endpoint removal.

### Footer and themes

- Custom footer shows input/output/reasoning tokens, cost, context percentage, tokens/sec, current model, thinking level, and git branch.
- Theme files define reusable palettes for the header, footer, diffs, thinking levels, markdown, and tool output.

### Configured packages

`config/settings.example.json` registers these external Pi packages by default:

- ask-user-question and todo tools
- Markdown preview/export
- MCP adapter
- context-mode and related context skills
- goal completion helper
- advisor tool
- spinner, rewind, `/btw`, and fff search

`config/mcp.example.json` currently configures the remote grep MCP server.

## Useful Pi commands

Welcome update notices only appear for major/minor updates, not patches. Toggle them with:

```txt
/welcome updates on
/welcome updates off
```

Review files changed by Pi before keeping or reverting them:

```txt
/filechanges          # inspect tracked edit/write changes and diffs
/filechanges-accept   # keep files and clear the log
/filechanges-decline  # revert tracked changes
```

In non-interactive print/json mode, accept/decline require `force`.

## Do not commit

Never commit secrets or runtime state:

- `~/.pi/agent/auth.json`
- `~/.pi/agent/sessions/`
- `~/.pi/agent/npm/`
- `~/.pi/agent/git/`
- `~/.pi/agent/local-models.json` unless intentionally sanitized
- cache files such as `mcp-cache.json`

## References / Citations

References and inspirations.

- [Pi Packages](https://pi.dev/packages)
- [mattpocock/skills](https://github.com/mattpocock/skills)
- [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config)
- [llama.cpp](https://github.com/ggml-org/llama.cpp)
- [noonghunna/club-3090](https://github.com/noonghunna/club-3090)
- [r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA)
