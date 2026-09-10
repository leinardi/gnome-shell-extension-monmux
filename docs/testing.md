# Testing

Everything automated in this repository is forbidden from reaching a real monitor, and the enforcement is mechanical rather
than a matter of remembering. This page says how, and what is left for a human to do by hand.

## Why a click is a write

In `monmux` the dangerous act is a command: `monmux switch`. Here it is a click. Opening the panel menu of a build that can
reach the real binary and picking an input runs exactly that command, with exactly the same consequence for the monitor in
front of you. So the rule in [AGENTS.md](../AGENTS.md) — *no AI agent writes to a monitor* — covers the menu, the nested Shell
and `gnome-extensions enable` on a live session, not only the CLI.

## The fake monmux

`tests/bin/monmux` is an executable shell script that answers from `tests/fixtures/`. It is the only `monmux` any automated
thing in this repository is allowed to see.

- `monmux version` and `monmux info --json` come from the captured fixtures.
- `monmux switch …` returns whatever `MONMUX_FAKE_SWITCH` names: `ok` (exit 0), `refused` (exit 2), `failed` (exit 1). The
  default is `refused`, so a test that forgets to set it exercises the path where nothing was written.
- Anything else exits 70 with a message saying it is not faked. Failing loudly beats answering with something invented: a fake
  that decides differently from the real tool turns a green suite into a lie.

Phase 2 adds the `catalog list --json` and `catalog show … --json` fixtures.

## How the suite refuses to touch hardware

Two layers, and the second is the one that matters:

1. The `test` script in `package.json` prepends `tests/bin` to `PATH`, so every entry point — `make ext-test`, the `ext-test`
   pre-commit hook, CI, an IDE run of the npm script — resolves the fake.
2. `tests/main.js` then calls `GLib.find_program_in_path('monmux')` and compares it against `tests/bin/monmux`. If it is
   anything else, or nothing at all, the process prints why and exits 1 **before the first test runs**. Nothing local — not the
   test files, not even the harness — is imported statically, for exactly this reason: a static import is evaluated before the
   first statement of the module, so it would run before the guard and make it a guard over nothing. Everything local arrives
   through a dynamic `import()` after the check.

There is no third layer inside the tests, because there is nothing to guard: no test spawns a process. If one ever needs to,
it drives the fake, and it still passes through the check above.

You can prove the guard works:

```sh
gjs -m tests/main.js       # without the PATH the npm script sets
```

On a machine with the real `monmux` installed this prints `refusing to run: monmux on PATH is /usr/bin/monmux` and exits 1.
On a machine without one it prints `no monmux on PATH`. Neither runs a test.

## The nested Shell

```sh
make ext-nested
```

starts `gnome-shell --devkit --wayland` under `dbus-run-session` with `tests/bin` first on `PATH` and `G_MESSAGES_DEBUG` set to
the `GNOME Shell` and `Gjs` domains. Not `all`: that turns on debug output for every library in the process, and dconf alone
buries startup and teardown — the two moments worth reading — under a watch/unwatch line per settings path per extension.
Warnings are not debug-level and print either way. `make ext-nested G_MESSAGES_DEBUG=all` when you need somebody else's library.
The Shell inside that session — and therefore the extension inside it, and therefore any click in its menu — can only resolve
the fake. **That is what makes this target safe for an agent to run**, and it is why the `PATH` prefix is not a convenience to
be dropped when something does not work.

Inside the nested Shell, install and enable the build under test, open the menu, and watch the terminal for warnings. A leak on
`disable()` almost always announces itself there.

`--devkit` needs GNOME Shell 48 or newer. On an older host, run the nested Shell the way that host documents; the `PATH`
prefix is the part that must not change.

A nested session against the **real** `monmux` is a human's manual command, not a target in this repository:

```sh
dbus-run-session -- gnome-shell --devkit --wayland
```

## The human hardware checklist

Run this before a release, and whenever a change touches the switch path. Nothing here may be delegated to an agent.

| # | Step | Expected |
| --- | --- | --- |
| 1 | `monmux doctor` in a terminal | every check passes, and the display you intend to switch is listed as writable |
| 2 | `make ext-pack && make ext-install`, then log out and back in | `gnome-extensions info monmux@leinardi.github.io` shows the new version |
| 3 | `gnome-extensions enable monmux@leinardi.github.io` | the indicator appears in the panel, with no warning in `make ext-logs` |
| 4 | Open the menu | one section per attached display; the inputs the catalog enables are clickable, the rest greyed with a reason |
| 5 | `monmux switch <display> <input> --dry-run` in a terminal | prints the command it would run; nothing on the monitor changes |
| 6 | Click that same input in the menu | the monitor switches, and the notification says the command was sent |
| 7 | Click an input the catalog does not enable, if the menu offers one | a refusal notification naming the reason, ending in that nothing was written; the monitor does not change |
| 8 | `gnome-extensions disable monmux@leinardi.github.io` while a switch is in flight | the indicator disappears; `make ext-logs` shows no warning and no message after the disable |
| 9 | Unplug and replug a monitor with the menu open | the menu updates; no duplicate section, no stale entry |

Record what happened in the pull request. If a step changed a monitor's input, say which monitor and which input — that is the
evidence, and for a new model it belongs in a monitor report in the [monmux](https://github.com/leinardi/monmux) repository.
