# AGENTS.md

## HARD RULE: no monitor writes by any AI agent

**No AI agent — main session, subagent, reviewer, or any tool-driven automation — may run a command that switches a monitor's
input.** Only the human user does that, by hand, when they decide to. This applies during implementation *and* during review.

In this repository the write is a click: opening the panel menu of a build that can reach the real `monmux` and picking an input
is exactly the same act as running `monmux switch`, and it is forbidden for the same reason.

Forbidden for agents:

- clicking an input in a Shell — nested or live — whose `monmux` is the real binary
- `monmux switch` without `--dry-run`, including `monmux switch --unsafe-model …`
- `ddcutil setvcp …`, any `ddcutil` invocation with `--i2c-source-addr`, `m1ddc … set …`, `i2cset`, `i2ctransfer`, or any direct
  write to `/dev/i2c-*`
- `gnome-extensions enable monmux@leinardi.github.io` in the user's live session followed by interacting with the menu
- `make ext-nested` with `tests/bin` removed from `PATH`, or any other nested session that can resolve the real binary

Allowed for agents (read-only):

- `make ext-nested` — it prepends `tests/bin` to `PATH`, so the Shell inside it can only ever find the fake `monmux`
- `monmux info`, `monmux doctor`, `monmux switch … --dry-run`, `monmux catalog list`, `monmux catalog show …`
- `monmux version`, `ddcutil --version`, `ddcutil detect`, reading `/sys/class/drm/**`

**Tests never execute the real `monmux`.** `tests/main.js` prepends nothing itself: the `test` npm script puts `tests/bin` first
on `PATH`, and then `main.js` resolves `GLib.find_program_in_path('monmux')` and refuses to run a single test unless it is the
fake at `tests/bin/monmux`. A suite that finds the real binary exits 1 before the first assertion. Do not relax that check, and
do not add a test that spawns anything.

Hardware validation is a checklist the human runs — [`docs/testing.md`](docs/testing.md). Agents prepare the commands and wait.

CI runs no `monmux` command at all, and installs neither `monmux` nor `ddcutil`.

`.claude/settings.json` denies the forbidden commands it can name: `monmux switch`, `ddcutil setvcp`,
`ddcutil --i2c-source-addr…`, `m1ddc`, `i2cset`, `i2ctransfer`, `gnome-extensions enable`, and the two obvious ways to write a
`/dev/i2c-*` node. Two things about that list. It denies **every** `monmux switch`, `--dry-run` included, because a permission
pattern matches a prefix and cannot tell one from the other, and erring closed is the whole point of this repository — run a
dry run yourself with `!` when you need one. And it is defence in depth, not the boundary: a deny list cannot enumerate every
spelling of a write, so the rule above is the authority and a command that is merely *unlisted* is not thereby allowed.

## What this is

A GNOME Shell extension that puts the attached monitors in the top panel and switches them between video inputs when you pick
one. It decides nothing: [`monmux`](https://github.com/leinardi/monmux) is a separate command-line tool that identifies each
monitor against a built-in catalog and refuses anything it cannot positively identify or that the catalog does not explicitly
enable. This extension runs it, renders what it reports, and reports back what it said. When `monmux` is not installed, the menu
says so and links to it.

Shell versions 46 through 50. GPL-2.0-or-later, the norm on extensions.gnome.org. Publication there comes later; today this is
installed from source.

| Page | What it answers |
| --- | --- |
| [`README.md`](README.md) | What this is, how to install it, what it does. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Prerequisites, the workflow, the rule above in prose. |
| [`docs/testing.md`](docs/testing.md) | How the no-write rule is enforced, and the human checklist. |
| [`SECURITY.md`](SECURITY.md) | What the threat model is and how to report a vulnerability. |
| [`.agents/skills/gjs-style-guide/SKILL.md`](.agents/skills/gjs-style-guide/SKILL.md) | The GJS rules this repository enforces. |
| [`.agents/skills/adversarial-review/SKILL.md`](.agents/skills/adversarial-review/SKILL.md) | How a change here is reviewed. |

## Layout

- `src/` — exactly what `gnome-extensions pack` bundles, and nothing else.
    - `src/extension.js` — the Shell side. Thin: lifecycle, and calls into `src/ui` and `src/lib`. No parsing, no policy.
    - `src/prefs.js` — the preferences window. A separate GJS process with GTK and no Shell: never import St, Clutter or
      anything under `resource:///org/gnome/shell/ui/`. It runs `monmux` only through `readOnly(spawn)`, which refuses a
      `switch` and `--show-serial` before any process starts, and ties every run to one cancellable closed with the window.
    - `src/lib/` — no `gi://St`, no `gi://Clutter`, no `resource:///`, no Shell import of any kind. This is what the test suite
      can run under plain `gjs`, and the reason to put logic here rather than in a widget. One role per module:
        - `monmux.js` — everything that talks to `monmux`, in two halves: the pure client, which builds argv arrays and
          classifies answers, and `spawn`, the one adapter in the repository that starts a process. Nothing else spawns.
        - `exitCode.js` — the only place an exit code is given a meaning.
        - `version.js` — the version gate.
        - `model.js` — what the menu shows, built from what `monmux` reported. Pure, and it emits codes, never sentences.
        - `reasons.js` — the only mapping from a code to text a user reads, translated through the `gettext` it is handed.
        - `links.js` — the only source of URLs. Nothing else builds one.
        - `serials.js` — the serials a click is pinned with, read from `info --show-serial` only while the user opted in,
          and kept out of the model. Nothing it reads is rendered or logged, a failure included.
        - `shortcuts.js` — the keyboard shortcut slots: each slot's two settings keys, and whether the input a slot names
          can be handed to `monmux`. The argv is still built in `monmux.js`.
    - `src/ui/` — the widgets, built from the model and from nothing else. Shell imports belong here and in `extension.js`
      only. No sentence and no URL of its own: every word comes from `reasons.js`, every link from `links.js`. Nothing here
      spawns, and nothing here is unit tested — widgets need a Shell, so they are checked in `make ext-nested`.
        - `indicator.js` — the panel button and its menu. The indicator owns its `PanelMenu.Button` rather than subclassing
          it, so the extension adds `indicator.button` to the panel and destroys it through `indicator.destroy()`.
        - `notify.js` — the one notification source, and what each switch result says.
        - `common.js` — opening a link, and cutting raw output to a length a menu line can hold.
    - `src/schemas/` — the GSettings schema. `make ext-schemas` compiles it; the compiled file is not committed.
- `tests/` — the gjs suite, the harness, the fixtures, and `tests/bin/monmux`, the fake that is the only `monmux` any automated
  thing in this repository is allowed to see.
- `scripts/check-metadata.js` — the pre-commit gate on `src/metadata.json`.
- `.mk/extension.mk` — every `ext-*` target. `Makefile` itself holds no recipes.
- `po/` — translations, from phase 2 onwards, when there is a first translatable string to extract.

## Common commands

```bash
make ext-deps          # npm ci — required once after cloning, the hooks depend on it
make verify            # ext-lint + ext-typecheck + ext-test + ext-schemas + ext-pack
make ext-lint          # eslint . --max-warnings 0
make ext-lint-fix      # the same with --fix
make ext-typecheck     # tsc --noEmit over @girs types
make ext-test          # the gjs suite, against tests/bin/monmux
make ext-schemas       # glib-compile-schemas --strict src/schemas
make ext-pack          # dist/monmux@leinardi.github.io.shell-extension.zip
make ext-install       # install that zip into this user's session
make ext-nested        # a nested Shell that can only see the fake monmux — agent-safe
make ext-logs          # journalctl -f -o cat /usr/bin/gnome-shell
make check             # pre-commit on all files
make check-stage       # pre-commit on the staging area only
```

The Makefile pulls shared snippets from `leinardi/make-common@v1` into `.mk/` on first run. To refresh: `make mk-common-update`.

## Invariants

Do not weaken any of these.

1. **The extension re-implements no policy.** Which monitor may be written to, which input is enabled for it, and what bytes
   that means are `monmux`'s decisions, taken against evidence in its catalog. This extension renders them. It never infers
   that an input is probably fine, never retries a refusal, never offers a raw VCP anything, and never asks a monitor what
   input it is currently on — `monmux` does not read that, so neither does the menu.
2. **One subprocess, one way.** Only `src/lib/monmux.js` spawns anything, and it spawns `monmux` resolved from `PATH` through
   `Gio.Subprocess` with an **argv array**: never a shell string, never a synchronous call on the Shell's main loop, never a
   path the user can configure. A configurable binary path is a way to run an arbitrary program as the user, from a menu.
3. **Exit codes are mapped exactly.** `0` sent, `2` refused with nothing written, `1` the tool ran and failed and the write
   status is unknown, anything else unexpected. `src/lib/exitCode.js` is the one place that knows this. Only a refusal may be
   reported to the user as "nothing was written"; a failure says the status is unknown, in those words.
4. **Everything created in `enable()` dies in `disable()`.** Widgets destroyed, signal handler ids disconnected, `GLib` timeout
   and idle sources removed, notification sources destroyed, in-flight subprocesses cancelled through a `Gio.Cancellable` whose
   callback survives the disable. Nothing is built in a constructor: the Shell keeps the extension object across enable/disable
   cycles, so a constructor's work outlives the `disable()` that was supposed to undo it.
5. **No serial is shown unless the user opted in.** `monmux` redacts by default, and this extension displays what it prints. A
   feature that passes `--show-serial` has to be a deliberate, user-driven action, and its output never goes into a log line.
6. **Layer separation holds.** No GTK in `extension.js`. No St or Clutter in `prefs.js`. Nothing under `src/lib/` imports the
   Shell, so the suite can run it under plain `gjs`.
7. **Every user-visible string goes through gettext**, `_()` from the extension's own import, never a bare literal.
8. **The e.g.o review rules are a floor**: no side effects at import time, no `Lang`, no `Mainloop`, no `ByteArray`, no
   minified or generated code in the zip, no telemetry, no network access.

## Style

GJS style is enforced by `eslint.config.js`, which is GNOME Shell's own rule set (`eslint-config-gnome`) plus this repository's
overrides. The rules are written out in [`.agents/skills/gjs-style-guide/SKILL.md`](.agents/skills/gjs-style-guide/SKILL.md);
read it before writing JavaScript. `tsc --checkJs` runs over the same files against `@girs/gnome-shell`.

**The types are pinned to Shell 50, not to 46.** Pinning them to the oldest supported Shell was the intent — an API that only
exists in a newer Shell would then be a type error here rather than a crash on somebody's 46 desktop — and it does not work:
`@girs/gnome-shell@46.0.2` is a July 2024 release whose dependencies are the `…-4.0.0-beta.12` generation of the `@girs`
packages, while the current `@girs/gjs` is the unified `4.x` line. Installed together they produce type errors that describe
the disagreement between two generations of type packages, not anything about Shell 46. So `make ext-typecheck` does **not**
tell you whether an API exists in 46. Compatibility across 46–50 is a review question and a runtime one: check the API's
"since" version in the GNOME documentation before using it, and the human checklist in
[`docs/testing.md`](docs/testing.md) is where it is actually observed. Revisit this pin if `@girs` ever republishes the older
Shell types against the current core packages.

Every JavaScript file starts with the GPL header from `.idea/copyright/GPL_2_0_or_later.xml`.

## Validation matrix

Run before considering an edit done:

| You edited | Run |
| --- | --- |
| `src/lib/**` or `tests/**` | `make ext-lint ext-typecheck ext-test` |
| `src/extension.js`, `src/prefs.js` | `make verify`, then `make ext-nested` and open the menu |
| `src/metadata.json`, `src/schemas/**` | `make ext-schemas`, then `make check-stage` (the `ext-metadata` hook) |
| `package.json`, `eslint.config.js`, `tsconfig.json` | `make ext-deps`, then `make verify` |
| `Makefile`, `.mk/**`, `.github/workflows/**` | `make check` |
| anything user-visible | `make verify`, and add the string to the phase 2 gettext work if it is new |
| docs or a skill | `make check`, and read the rendered result |
