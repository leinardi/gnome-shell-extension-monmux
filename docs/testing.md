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
thing in this repository is allowed to see, and it exists **for the nested Shell**: no test spawns it.

It decides nothing. Which document comes back is the caller's choice, made through the environment before the Shell starts,
because the Shell inherits it:

| Variable | Values | Effect |
| --- | --- | --- |
| `MONMUX_FAKE_INFO` | a variant name, default `writable` | `info --json` answers from `info-<variant>.json`, with that variant's own exit code; `info --json --show-serial` from `info-<variant>-serials.json`, where the variant has one |
| `MONMUX_FAKE_VERSION` | `v0.6.0` (default) or `v0.5.0` | which monmux this pretends to be |
| `MONMUX_FAKE_SWITCH` | a fixture name, default `refused-input-not-enabled` | `switch --json` answers from `switch-<name>.json` |
| `MONMUX_FAKE_LOG` | a file path, unset by default | every argv the fake received, one shell-quoted line per run |

`MONMUX_FAKE_LOG` is how a click is verified. After exercising the menu in the nested Shell, read that file: it shows the exact
command line the extension built, which is the only way to prove the argv arrived as an array and not as a shell string.

`MONMUX_FAKE_VERSION=v0.5.0` answers `version --json` the way the release before that flag existed does — cobra's
`Error: unknown flag: --json` on stderr, nothing on stdout, exit 1 — because that shape is what the extension's version gate
reads as "too old".

`switch --json` exits 0 for `sent` and `dry-run`, 2 for either `refused-…` fixture and 1 for `failed`. The exit code is written
next to the fixture name in the script rather than derived from the document's `outcome`: the pairing of the two is monmux's
contract, and a fake that computed one from the other could not contradict it even where a test wants it to. The default is a
refusal, so a caller that forgets to set the variable exercises the path where nothing was written.

`info --json` is read-only and can still fail, so the fake pairs each variant with a code too. `checks-failing` is the state
where `ddcutil` is missing, and the real binary answers it by printing the report on stdout anyway — the report is the
diagnostic for exactly that failure — putting one line on stderr:

```text
Not ready: backend-not-ready: ddcutil was not found on PATH: exec: "ddcutil": executable file not found in $PATH
```

and exiting **2**, not 1. `cli.info` wraps the preflight refusal in a `readOnlyError`, and `exitCode()` unwraps that and finds
a refusal, which is the code a refusal gets. Every other variant exits 0 with nothing on stderr. A variant the script does not
know exits 70 rather than reaching for a fixture that may not exist.

`catalog list --json` answers from the captured catalog, and `doctor` from the captured `doctor.txt`, as prose and with exit 0.
Anything else — `catalog show`, `doctor --show-serial`, `info --show-serial` for a variant with no `-serials` fixture, a
`switch` without `--json` — exits 70 with a message saying it is not faked. Failing loudly beats answering with something
invented: a fake that decides differently from the real tool turns a green suite into a lie.

### The fixtures

Two kinds, and the difference matters when one of them disagrees with the real binary:

| Fixture | Origin |
| --- | --- |
| `catalog-list.json` | captured from `monmux catalog list --json` |
| `doctor.txt` | captured from `monmux doctor` (v0.6.0) on the machine with the LG 38WR85QC-W; it prints no serial |
| `version.json`, `version-v0.6.0.txt` | captured from the installed monmux v0.6.0, commit `029694f`, built 2026-09-10, with `monmux version` and `monmux version --json` |
| `version-v0.5.0.txt` | captured the same way from the release before it |
| `info-writable.json` | captured from `monmux info --json` on the LG 38WR85QC-W |
| every other `info-*.json` | constructed: a display situation this machine does not have |
| every `switch-*.json` | constructed: written against [monmux's `docs/json.md`](https://github.com/leinardi/monmux/blob/main/docs/json.md) |

The commit is written down because the v0.6.0 tag is not in a monmux checkout yet: that build was installed before it was
tagged. Check these two against `monmux version --json` on the machine, not against the tags in a clone — a clone without the
tag says nothing about which binary is installed.

The `switch-*.json` documents are constructed because no agent may run `monmux switch`, dry run included — see
[AGENTS.md](../AGENTS.md). They follow the published contract field for field, and the human checklist compares their shape
with what the real binary answers.

`info-not-write-enabled.json` deserves a note of its own. It is a display that matches the catalog **exactly** and whose model
is not write-enabled, so `enabledInputs` is empty while the catalog still records inputs for it — the state the menu greys out
with a "test and report this monitor" call to action. Today's monmux cannot produce it: only write-enabled entries carry EDID
identities, and matching is on identities alone, so a non-write-enabled model always comes back as `match: none`. The contract
permits it, a later catalog entry can create it, and the extension has to render it correctly before then.

`info-two-supported.json` is constructed the same way: two writable displays of two different models, both matched exactly,
which is the case monmux's `multiple-candidates` rule is about. Only the LG entry is write-enabled in today's catalog, so the
Dell half cannot come from a real binary yet; the menu has to handle it all the same.

Fixtures carry synthetic serials and nothing else. Only the two `info-*-serials.json` fixtures carry any — `SYNTHLG0001`,
`SYNTHLG0002` and `SYNTHDELL0002`, which no monitor has — and they stand for `info --json --show-serial`. Every other fixture is
redacted, which is what `monmux` prints unless `--show-serial` is passed. A real serial must never be committed.

## How the suite refuses to touch hardware

Two layers, and the second is the one that matters:

1. The `test` script in `package.json` prepends `tests/bin` to `PATH`, so every entry point — `make ext-test`, the `ext-test`
   pre-commit hook, CI, an IDE run of the npm script — resolves the fake.
2. `tests/main.js` then calls `GLib.find_program_in_path('monmux')` and compares it against `tests/bin/monmux`. If it is
   anything else, or nothing at all, the process prints why and exits 1 **before the first test runs**. Nothing local — not the
   test files, not even the harness — is imported statically, for exactly this reason: a static import is evaluated before the
   first statement of the module, so it would run before the guard and make it a guard over nothing. Everything local arrives
   through a dynamic `import()` after the check.

There is no third layer inside the tests, because there is nothing to guard: **no test spawns a process, and none may.** The
fake exists for the nested Shell, not for the suite — a unit test drives a module directly, with a runner it supplies itself,
so a subprocess never enters the picture. The `PATH` guard above stays as the belt for that rule rather than as support for an
exception to it: it is what makes a suite that started spawning something unable to reach a real monitor.

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

Run this before a release, and whenever a change touches the switch path. It is the whole of the hardware verification: work
through it top to bottom, and nothing here may be delegated to an agent. The order matters: the `monmux` side comes first,
because the extension gates on it, and nothing touches a monitor until the binary under test has been shown to answer in the
shapes the suite's fixtures have.

Keep `make ext-logs` running in a second terminal from step 6 onwards. Any warning, critical or `JS ERROR` that mentions
`monmux` fails the step it appeared in. What each greyed reason and each notification means is in the
[README](../README.md#why-something-is-greyed-out).

Record what happened in the pull request, step by step. If a step changed a monitor's input, say which monitor, which input,
and what the monitor's on-screen display showed — that is the evidence, and for a new model it belongs in a monitor report in
the [monmux](https://github.com/leinardi/monmux) repository.

### monmux

Either install a `monmux` release, or build one with `make go-build` in a `monmux` checkout and put its `dist/monmux` first on
`PATH`. The version gate accepts the `dev` version such a build reports.

| # | Step | Expected |
| --- | --- | --- |
| 1 | `monmux version` and `command -v monmux` in a terminal | 0.6.0 or newer — or `dev`, or a `git describe` string, for a local build — at the path you expect |
| 2 | `monmux doctor` | every check passes, and the display you intend to switch is listed as writable |
| 3 | `monmux version --json`, then `monmux switch dp --dry-run --json` | both print the shapes [monmux's `docs/json.md`](https://github.com/leinardi/monmux/blob/main/docs/json.md) documents; the dry run's `command` is what it would run, and nothing on the monitor changes |

### Contract drift

Before any real click, capture what the binary under test answers into a scratch directory, and compare its shape — every
field path and its JSON type — with the fixtures the suite reads. The values are expected to differ: the version, the
connector, what the catalog holds. The fixtures stay as they are, because the tests pin the values in them. The four
`monmux` commands only read, and the comparison needs `jq`. From the repository root:

```sh
mkdir -p ~/monmux-capture
monmux version --json > ~/monmux-capture/version.json
monmux info --json > ~/monmux-capture/info-writable.json
monmux catalog list --json > ~/monmux-capture/catalog-list.json
monmux switch dp --dry-run --json > ~/monmux-capture/switch-dry-run.json

shape() {
  jq -r '[paths as $p
    | ($p | map(if type == "number" then "[]" else . end) | join(".")) + ": " + (getpath($p) | type)]
    | unique | .[]' "$1"
}
for name in version info-writable catalog-list switch-dry-run; do
  echo "== $name"
  diff <(shape "tests/fixtures/$name.json") <(shape ~/monmux-capture/"$name".json)
done
```

| # | Step | Expected |
| --- | --- | --- |
| 4 | Run the commands above | no difference, or only differences [monmux's `docs/json.md`](https://github.com/leinardi/monmux/blob/main/docs/json.md) allows. A `<` line is a field the fixture has and the capture lacks, or has with another type: drift, unless `docs/json.md` makes that field optional. A `>` line is a field only the capture has, which the contract allows. A path under an array that is empty on one side is not drift |
| 5 | `make ext-test` | every test passes on the committed fixtures. If step 4 found drift, stop here, and fix it before touching hardware: a shape change is a `docs/json.md` change in `monmux` first, then a change to the fixtures and to the tests that read them |

### Install and the menu

| # | Step | Expected |
| --- | --- | --- |
| 6 | `make ext-pack && make ext-install`, log out and back in, then `gnome-extensions enable monmux@leinardi.github.io` | the indicator appears in the panel |
| 7 | Open the menu, keep the pointer on an input until the menu has finished reading, then press <kbd>Escape</kbd> | one section per attached display, with its connector and model; the inputs the catalog enables are clickable, the rest greyed with a reason; the footer shows the version from step 1; nothing "has been already disposed" in `make ext-logs` |
| 8 | Turn **Dry run** on in the menu, and click **DisplayPort** | a **Dry run** notification with the same command as step 3; nothing on the monitor changes |
| 9 | Turn **Dry run** off, and click **DisplayPort** | the monitor switches; the notification is **Input-switch command sent**, and does not claim the monitor changed |
| 10 | With the menu open, unplug a monitor, wait two seconds, and plug it back in | the menu follows each change; no duplicate section, no stale entry |

### Keyboard shortcuts

| # | Step | Expected |
| --- | --- | --- |
| 11 | In **Preferences → Shortcuts**, give slot 1 a shortcut and `usb-c`; turn **Dry run** on, and press the shortcut on the desktop | if GNOME asks whether the window may capture shortcuts, allow it; the **Dry run** notification shows the command; nothing on the monitor changes |
| 12 | With the preferences still open, set slot 1's shortcut again, and press the same combination in the dialog | the dialog captures it and closes; no notification; nothing on the monitor changes |
| 13 | Turn **Dry run** off, and press the shortcut on the desktop | the monitor switches to USB-C, with the notification step 9 got |
| 14 | Press it again with the overview open | nothing happens |
| 15 | Give slot 2 an input the catalog records for another model and not for this monitor, and a shortcut; press it with **Dry run** off | **monmux refused**, with the reason and "No DDC write was performed."; **Troubleshooting** opens the section for that reason; nothing on the monitor changes |
| 16 | Give slot 3 a shortcut and **No input**, and press it | **Shortcut 3 has no input to switch to**, and "monmux was not run." |

### Serial targeting

Only with two supported monitors attached. Skip it otherwise, and say so in the record: until it is done, serial targeting
stays marked as not hardware-verified.

| # | Step | Expected |
| --- | --- | --- |
| 17 | With **Serial targeting** off and **Dry run** off, click an input | **monmux refused** with `multiple-candidates`, the hint to turn on Serial targeting, and "No DDC write was performed." |
| 18 | Turn **Serial targeting** on in **Preferences → Shortcuts**, reopen the menu, turn **Dry run** on, and click an input under one monitor | a **Dry run** notification for the monitor the click was made under |
| 19 | Turn **Dry run** off, and click an input under the other monitor | that monitor switches, and the first does not |
| 20 | Read the notifications from steps 17–19, and `make ext-logs` since step 17 | no serial number anywhere |

### Diagnostics, translations, teardown

| # | Step | Expected |
| --- | --- | --- |
| 21 | **Preferences → Diagnostics → Run monmux doctor**, then **Copy**, and paste it somewhere | the same lines as step 2; the version and location match step 1; nothing on the monitor changes |
| 22 | Close the preferences window straight after pressing **Run monmux doctor** | the window closes, with no warning about a widget |
| 23 | In an Italian session (or with `LANGUAGE=it`), open the menu, a notification and the preferences | every string the extension writes is in Italian; `monmux`'s own words, such as a check's name, stay as it wrote them |
| 24 | Click an input with **Dry run** off, and run `gnome-extensions disable monmux@leinardi.github.io` straight after | the indicator disappears, and no notification follows. Whether the monitor switched is unknown: the run was killed. Write down which it did |
| 25 | `for i in $(seq 20); do gnome-extensions enable monmux@leinardi.github.io; sleep 2; gnome-extensions disable monmux@leinardi.github.io; sleep 1; done`; press slot 1's shortcut; then enable the extension once more | no warning in `make ext-logs` during the loop; the shortcut does nothing while the extension is disabled; after the last enable, exactly one indicator in the panel |

### The sent and refused answers

Step 4 compared the dry run. The other two `switch` fixtures can only be compared after a real switch, so they come last,
with the `shape` function from step 4:

| # | Step | Expected |
| --- | --- | --- |
| 26 | `monmux switch dp --json > ~/monmux-capture/switch-sent.json`, then `diff <(shape tests/fixtures/switch-sent.json) <(shape ~/monmux-capture/switch-sent.json)` | the monitor switches; the shapes agree, judged as in step 4 |
| 27 | `monmux switch <input> --json > ~/monmux-capture/switch-refused.json` for the input from step 15, then `diff <(shape tests/fixtures/switch-refused-input-not-enabled.json) <(shape ~/monmux-capture/switch-refused.json)` | a refusal, and nothing on the monitor changes; the shapes agree, judged as in step 4 |

Drift found here is handled as in step 5: a `docs/json.md` change in `monmux` first, then the fixtures and the tests that read
them.
