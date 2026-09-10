# Contributing

This extension asks a tool to write to hardware, and a click in its menu is that write. The rules below are stricter than a
typical GNOME extension's for that reason, and one of them is absolute — read
[The rule](#the-rule-no-ai-agent-switches-a-monitor) first.

## Prerequisites

- GNOME Shell 46 or newer, and a Wayland or X11 session to test in
- `gjs`, `libglib2.0-bin` (`glib-compile-schemas`) and `gnome-shell` or `gnome-shell-common` (`gnome-extensions`) —
  on Fedora: `gjs`, `glib2-devel`, `gnome-shell`
- `gettext` for `make ext-pot`
- Node 22+ — run `make ext-deps` once after cloning; the pre-commit hooks are `language: system` and use that `node_modules`
- [`pre-commit`](https://pre-commit.com/) — install the hooks once with `make pre-commit-install`
- [`monmux`](https://github.com/leinardi/monmux) for running the extension against a real monitor. Nothing in this repository
  needs it: the test suite and the nested Shell use the fake in `tests/bin`.

## The rule: no AI agent switches a monitor

**AI agents are welcome to work on this extension. What no AI agent may do is run a command — or click a menu item — that
switches a monitor's input.**

The restriction is on one class of action, not on who contributes. An assistant in an editor, a coding agent, a subagent, a
review bot or any other tool-driven automation may write, refactor, test and review this project like any other GJS codebase —
during implementation and during review alike. It must stop at the point where an action would change a monitor's state. Only a
human does that, by hand, deliberately.

Forbidden for agents: clicking an input in a Shell whose `monmux` is the real binary; `gnome-extensions enable` of a build in
the user's live session followed by interaction; `make ext-nested` with `tests/bin` removed from `PATH`; `monmux switch` without
`--dry-run`; `ddcutil setvcp …`; `m1ddc … set …`; `i2cset`; `i2ctransfer`; any direct write to `/dev/i2c-*`.

Allowed for agents, all read-only: `make ext-nested` as it is written, `monmux info`, `monmux doctor`,
`monmux switch … --dry-run`, `monmux catalog …`, `gnome-extensions info`, reading `/sys/class/drm`.

**The test suite never executes the real `monmux`.** The `test` script prepends `tests/bin` to `PATH`, and `tests/main.js`
refuses to run a single test unless the `monmux` it resolves is that fake — see [docs/testing.md](docs/testing.md). Hardware
validation is a checklist a human runs.

## Building and testing

```sh
make ext-deps          # npm ci — once after cloning
make verify            # lint + typecheck + test + schemas + pack
make ext-lint          # eslint . --max-warnings 0
make ext-lint-fix      # the same with --fix
make ext-typecheck     # tsc --noEmit against the @girs types (pinned to 50)
make ext-test          # the gjs suite, against the fake monmux
make ext-schemas       # glib-compile-schemas --strict src/schemas
make ext-pack          # dist/monmux@leinardi.github.io.shell-extension.zip
make ext-install       # install that zip for this user
make ext-nested        # a nested Shell that can only see the fake monmux
make ext-logs          # journalctl -f -o cat /usr/bin/gnome-shell
make check             # the full pre-commit suite
make check-stage       # the same, on staged files only
```

The Makefile pulls shared snippets from `leinardi/make-common@v1` into `.mk/` on first run; `make mk-common-update` refreshes
them. Repo-local targets live in `.mk/extension.mk`.

## What belongs where

`src/lib/` holds pure modules: no `resource:///` import, no St, no Clutter, nothing from the Shell. That is what lets the test
suite run them under plain `gjs`, and it is why logic goes there rather than inside a widget. `src/extension.js` is thin —
lifecycle, widgets, and calls into `src/lib`. `src/prefs.js` runs in a different process, with GTK and no Shell.

Anything under `src/` ends up in the packed zip. Nothing else does.

## The extension decides nothing

Which monitor may be written to, which input is enabled for it, and what bytes that means are `monmux`'s decisions, taken
against evidence recorded in its catalog. This extension runs it, renders what it reports, and reports back what it said.

Related rules that no change may weaken:

- **Never re-implement a policy.** No inferring that an input is probably fine, no retrying a refusal, no raw VCP anything, no
  asking a monitor which input it is currently on — `monmux` does not read that, so the menu shows no active marker.
- **One subprocess, one way.** Only `src/lib/monmux.js` spawns, and it spawns `monmux` from `PATH` through an argv array,
  asynchronously, with a cancellable. Never a shell string, never a configurable path: that would turn a menu into a way to run
  an arbitrary program.
- **Never claim more than was done.** Exit code `2` means nothing was written and may be reported as such. Exit code `1` means
  the write status is unknown, and has to say so.
- **Everything created in `enable()` is destroyed in `disable()`.** Widgets, signal handler ids, `GLib` sources, notification
  sources, in-flight subprocesses.

The full list is in [AGENTS.md](AGENTS.md). A monitor that is not supported is a report for
[leinardi/monmux](https://github.com/leinardi/monmux), not an issue here.

## Code style

GJS style is enforced by `eslint.config.js` — GNOME Shell's own rule set plus this repository's overrides — and by
`tsc --checkJs` against `@girs/gnome-shell`, pinned to 50. It is *not* pinned to 46, so a clean type-check does not prove an
API exists in the oldest supported Shell; check the API's "since" version yourself, and see [AGENTS.md](AGENTS.md) for why the
pin is where it is. The conventions are written out in `.agents/skills/gjs-style-guide/SKILL.md`; read it before writing
JavaScript. A few that come up constantly:

- Four spaces, single quotes, semicolons, trailing commas in multi-line literals *and* imports.
- A single-statement `if` body has no braces and goes on the next line.
- Every JavaScript file starts with the GPL-2.0-or-later header.
- Comments explain why, not what. A comment that restates the code is noise; a comment explaining why a check exists is the
  reason somebody will not delete it in six months.

## Branches, commits and pull requests

- Branch names: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`.
- Commit messages start with a conventional-commit type — `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`, `ci:` —
  followed by a short imperative subject. A scope is optional. The `conventional-pre-commit` hook checks this at commit time
  (`make pre-commit-install` wires up the `commit-msg` stage), and a CI job checks every commit in a pull request.
- Keep pull requests focused: one logical change each.
- All checks must pass before merge.

## Reporting security issues

Privately, through GitHub's security advisories — see [SECURITY.md](SECURITY.md).
