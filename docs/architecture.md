# Architecture

The extension runs `monmux`, turns what it reports into a menu, and turns what a switch answered into a notification. It takes
no decision about a monitor: which display may be written to, which input is enabled for it, and what that means on the wire
are `monmux`'s, taken against its catalog. This page describes the three pieces that arrangement rests on — the client, the
model and the lifecycle — and the preferences window beside them.

```text
extension.js ── when to read, when to write, and what dies in disable()
   │
   ├── src/lib/monmux.js    the client: argv arrays in, classified results out; spawn() starts the process
   ├── src/lib/model.js     the model: what the menu shows, as codes
   ├── src/lib/serials.js   the serials a click is pinned with, kept out of the model
   ├── src/lib/reasons.js   codes to translated sentences
   │
   ├── src/ui/indicator.js  the panel button and its menu, rendered from the model
   └── src/ui/notify.js     one notification per switch result

prefs.js ── a separate process: the shortcuts, serial targeting, and diagnostics that only read
```

Nothing under `src/lib/` imports the Shell, so the test suite runs it under plain `gjs` with a runner that answers from
fixtures. Widgets need a Shell and are checked in the nested one — see [testing.md](testing.md).

## The client

`src/lib/monmux.js` has two halves. The `Monmux` class is pure: it builds an argv array, hands it to the runner it was
constructed with, and classifies the answer. `spawn()` is that runner in the Shell and the only function in the repository
that starts a process.

### Commands

| Method | Command line | Answer |
| --- | --- | --- |
| `version()` | `monmux version --json` | classified |
| `info()` | `monmux info --json`, plus `--show-serial` only when asked | classified |
| `catalogList()` | `monmux catalog list --json` | classified |
| `doctor()` | `monmux doctor` | handed back as written: prose for a person, with its exit status |
| `switchInput()` | `monmux switch <input> --json`, plus `--dry-run` and `--serial <serial>` as two elements | classified |

`switchInput()` throws for an input name that is empty or starts with `-`, which cobra would parse as a flag. Neither source
of a name can produce one: the model never offers such an input, and a shortcut slot holding one is reported without running
anything. The throw is a guard, not a path.

### spawn()

`spawn(argv, cancellable)` runs `monmux` resolved from `PATH` — never a path, never a configurable one — through
`Gio.Subprocess` with an argv array, reads both pipes with `communicate_utf8_async`, and resolves to
`{exitCode, stdout, stderr}`. A process killed by a signal has no exit status, and its `exitCode` is `NaN`, which
`exitCode.js` reports as unexpected.

Cancelling the cancellable calls `force_exit()` on the process, which sends `SIGKILL`, and the promise resolves to `null`:
whoever cancelled is gone, and has nothing to render. The cancellable's handler is disconnected after every run. It rejects
when `monmux` cannot be started, or writes output that is not valid UTF-8: the menu shows that it could not be run or read,
and a switch reports it with "The write status is unknown.", because a run whose output could not be read may still have
sent a command.

`communicate_utf8_async` is wrapped in a promise inside the module instead of through `Gio._promisify`, so importing the
module patches nothing and has no side effect.

### Classification

The order is fixed, and a later step never overrides an earlier one:

1. **The exit code**, through `exitCode.js`, the only place a code has a meaning: `0` sent, `2` refused with nothing written,
   `1` failed with the write status unknown, anything else unexpected.
2. **The stderr shape** `unknown flag: --json` with no document at exit 1: a `monmux` too old to know the flag. That is
   `unsupported-flag`.
3. **The document**, against the contract of the command that was run. The command is passed in, never inferred from the
   answer, so a malformed answer cannot choose how strictly it is judged.

What comes out, and what each kind is guaranteed to carry:

| Kind | When | Carries |
| --- | --- | --- |
| `ok` | exit 0; for a switch, `outcome: sent` with `writeStatus: sent` | the document, and for a switch the display, model and input |
| `dry-run` | exit 0, `outcome: dry-run` with `writeStatus: none` | the document, with its non-empty `command` |
| `refused` | exit 2, and for a switch `refused`/`none` | a document; for a switch, one with `refusal.reason` |
| `failed` | exit 1 | text: a document with a non-empty `error`, or a non-empty stderr |
| `unsupported-flag` | exit 1, no document, cobra's complaint about `--json` | stderr |
| `protocol` | everything else: an undocumented exit code, a missing document, a pair the exit code contradicts | the exit code and the raw stdout and stderr |

A read-only command refuses too. `info` exits 2 when the backend's preflight declines — `ddcutil` missing, for instance — and
still prints its whole report, because the report is the diagnostic. So a refused `info` carries its document.

### readOnly()

The preferences window runs `monmux` through `readOnly(spawn)`. The wrapper lists what may run — `version`, `info`,
`catalog`, `doctor` — and rejects every other command, a `switch` included, and `--show-serial` or `--show-serial=…` in any
position, before a process exists. A command `monmux` adds later is refused until somebody decides it only reads.

## The model

`buildModel({version, info, catalog})` in `src/lib/model.js` turns the three results into what the menu shows:

```text
{monmux, version, problems, checks, displays}
```

It emits codes and never sentences. The only human text that passes through is `monmux`'s own, untranslated: display and
model names, input labels from the catalog, a failing check, and the raw output of a run with no usable document.

### The version gate

`needsReports(version)` decides whether `info` and `catalog list` are read at all, and the extension asks it before running
them. A `monmux` the gate turns away is asked nothing more:

| `monmux` | When | Model |
| --- | --- | --- |
| `missing` | `locate()` found nothing on `PATH` | one problem, the install link |
| `too-old` | older than 0.6.0, or too old to know `--json` | one problem, the install link |
| `unknown` | it answered, and the answer names no version | one problem, carrying what it wrote |
| `ok` | 0.6.0 or newer, or a version it cannot parse, such as `dev` from a local build | the reports are read |

### Problems and checks

Beside the displays, the model lists what stopped it from reading them normally: `report-refused` (the report is still read,
with stderr as the detail), `report-failed`, `catalog-failed` and `protocol`. The extension adds `serials-unreadable` when
serial targeting could not read the serials. Every check in the report whose `ok` is not `true` is listed as failing,
malformed ones included.

### Displays

Each display is judged in order, and the first rule that applies decides it:

1. A display missing a field it is modelled from is `protocol`.
2. Inputs enabled on a display that is not writable, or not matched exactly, are two of `monmux`'s answers disagreeing:
   `protocol`.
3. A status other than `ok` greys the display with that status: `no-ddc-channel`, `edid-unreadable`, `no-uuid`, or a value
   from a newer `monmux`, passed on as it is.
4. A display that is not writable is `display-not-writable`.
5. A writable display the catalog does not know is `none`, with the call to action to test and report it.
6. Any other match that is not exact, such as `ambiguous`, greys it with the match.
7. An exact match is joined with its catalog entry.

The join is on the model's full name, and on nothing looser. No entry, or more than one, is `protocol`. Otherwise the inputs
`enabledInputs` names come first, labelled from the entry, followed by every other input the entry records, greyed as
`recorded` with the grade of its evidence: `verified`, `documented`, `reported` or `quoted`. An enabled input the entry does
not record, or whose record has no label or grade, is a `protocol` input and is not offered. A malformed list — an enabled
name that is empty, repeated or starts with `-`, or a record with no name — makes the whole display `protocol`. A display
with any recorded input gets the call to action.

`enabledInputs` alone decides what is enabled. The catalog's `writeEnabled` is never read: `monmux` already decided that by
the time `info` answered. A greyed input says what the fields say — recorded, not enabled, and the grade — and nothing more,
because the JSON carries no reason an input is disabled. If `monmux` starts reporting one, that is a change to its
`docs/json.md` first, and to this model second.

`canOffer(display, input)` is the one test the menu applies before making an input clickable: the display has no reason, the
input is enabled, and the input has no reason.

When two or more writable displays match exactly, whatever their models, `monmux` refuses an unpinned switch with
`multiple-candidates`. The model marks each of them `needsSerial`; it decides nothing else about them.

### Reasons

`src/lib/reasons.js` is the one place a code becomes a sentence. It is constructed with a `gettext` function rather than
importing one, so the suite can load it. A code with no entry renders as the code itself, so a value from a newer `monmux`
is visible rather than hidden. Its labels — titles, buttons, fixed sentences — live there too, so `src/ui` holds no sentence
of its own and a translator reads one file. Placeholders are named, so a translation can reorder them, and are only filled
with `monmux`'s own words.

The suite holds the two tables together: the model emits no code outside `EMITTED` in `model.js`, every code there is
reachable, and `CODES` in `reasons.js` has a sentence for every one.

### Serials

Serial numbers never enter the model. `src/lib/serials.js` reads them from `info --json --show-serial`, which the extension
only runs while the user has serial targeting on and some display `needsSerial`. A serial is kept, by display label, only
when:

- the result was `ok` or `refused`;
- the label appears once in that report;
- the display there has the same model, match and writability as the display the menu shows under that label, so a monitor
  moved to another connector between the two reads is not pinned by mistake.

`serialFor()` hands one to a click only when targeting is on and the display `needsSerial`; otherwise the click goes unpinned
and `monmux` decides. A failed read is `serials-unreadable` with no detail, because what that run wrote is the unredacted
report. Serials go to `switch --serial` and nowhere else: not to a widget, a notification or the log.

## The lifecycle

`src/extension.js` decides when things run. The Shell keeps the extension object across `enable()` and `disable()`, so the
constructor only declares fields; everything is created in `enable()` and released in `disable()`.

### enable()

- adds the indicator to the panel, and creates the client, the notifier (whose message-tray source appears with the first
  notification), the set of in-flight cancellables and the serial map;
- connects the menu's `open-state-changed`, which refreshes on open;
- connects `monitors-changed`, which refreshes once changes have stopped arriving for a second;
- connects `changed::serial-targeting`, which forgets the serials when it is turned off and refreshes either way;
- binds one keybinding per shortcut slot, in `Shell.ActionMode.NORMAL` only — not in the overview, never on the lock screen
  — and records only the ones the window manager accepted.

### disable()

In this order:

1. bumps the generation counter, the one value that outlives `disable()`;
2. removes the keybindings it added;
3. cancels every in-flight run, which kills its `monmux`;
4. forgets the serials;
5. removes the hotplug timeout;
6. disconnects the handlers;
7. destroys the indicator (its handler on the dry-run key goes with the button) and the notification source, with every
   notification it posted.

A switch killed this way — including by the screen lock, which disables extensions — posts no notification, and nothing is
known about whether it wrote.

### Refreshing

A refresh cancels the refresh before it, waits for a running switch, then reads `version`, and — when `needsReports()` says
so — `info` and `catalog list` in parallel. With serial targeting on and a display that `needsSerial`, it reads the serials,
and only then replaces the menu and the serial map together. At every step a result is dropped if its cancellable was
cancelled or the generation it started in is no longer current. That covers a result arriving after a `disable()`, and after
a whole disable-and-enable.

The menu is only rebuilt when the new model differs from the one it shows (`sameModel()`), which is not the case for most
refreshes a menu-open starts: rebuilding would destroy the item under the pointer. Before a rebuild, key focus moves from
the old items to the menu and every one of them is un-highlighted, because the Shell remembers the highlighted item in each
enclosing section and a destroyed item only clears it in its own; the menu would otherwise reach for the destroyed item when
it closes. A model that really changed while an input is held down still replaces that input, and the click is dropped.

### Switching

A click in the menu and a shortcut both end in `_switch()`, so both follow **Dry run**, and both get the same notifications.
Only one switch runs at a time:

- While it runs, the menu's inputs are insensitive, and a second click or shortcut is ignored, not queued.
- A switch cancels a refresh in flight, because a read must not overlap a write, and starts that refresh again once it is
  over.
- The dry-run key is read when the switch starts.
- A click is pinned with its display's serial when serial targeting applies. A shortcut names an input and no display, and is
  never pinned.

A shortcut reads its slot's input key when it is pressed. An empty slot, or one holding something that is not an input name,
starts nothing and posts a notification saying that `monmux` was not run.

### Notifications

`src/ui/notify.js` switches on the result's kind, never on an exit code, and claims no more than `monmux` did:

| Kind | Title | Body |
| --- | --- | --- |
| `ok` | Input-switch command sent | the input, display and model, and that the change of input is not independently confirmed |
| `dry-run` | Dry run | the command `monmux` would have run |
| `refused` | monmux refused | the reason, its detail, and "No DDC write was performed.", with a Troubleshooting button for that reason; a `multiple-candidates` refusal of a click made while Serial targeting is off also names that setting |
| `failed` | monmux failed | "The write status is unknown." and `monmux`'s error |
| `unsupported-flag` | monmux is too old | the minimum version and "The write status is unknown.", with the install link |
| `protocol` | monmux gave an unexpected answer | the raw output and "The write status is unknown.", with a link to report it |
| a thrown error | monmux failed | that it could not be run or read, and "The write status is unknown." |

Only a refusal says that nothing was written.

## The preferences window

`src/prefs.js` runs in its own GJS process, with GTK and without the Shell. It sets keys, and the extension decides what they
mean. Its `monmux` is `new Monmux(readOnly(spawn))`, so the window cannot start a switch even by mistake.

- One `Gio.Cancellable` is created with the window, handed to every run, and cancelled on `close-request` and `destroy`.
  Every completion checks it before touching a widget, and the window's settings handlers are disconnected on `destroy`.
- The shortcut dialog inhibits system shortcuts while it is active, so pressing a combination that is already bound reaches
  the dialog instead of running a switch. On Wayland the Shell may first ask whether the window may do that.
- The Diagnostics page shows where `monmux` was found, the version it reports, and what `monmux doctor` prints, with a button
  to copy it.
