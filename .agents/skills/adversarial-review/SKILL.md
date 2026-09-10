---
name: adversarial-review
description: >
  Adversarial code review of changes to the monmux GNOME Shell extension:
  working tree, staged diff, branch, commit range, or PR. Hunts for
  re-implemented monmux policy, subprocesses that are not argv arrays, mixed-up
  exit codes, false "nothing was written" promises, objects created in enable()
  and never destroyed in disable(), leaked signal ids and GLib sources,
  main-loop blocking, serial leaks into the journal, St or Clutter reaching
  prefs.js, and tests that could execute the real monmux, then reports ranked
  findings. Use whenever the user asks to review changes, a diff, PR, branch,
  or commit; check work before committing; assess merge readiness; or poke
  holes in an implementation.
---

# Adversarial Review — monmux GNOME Shell extension

Assume the change is wrong until proven right: it hides a bug, leaks something
`disable()` should have destroyed, decides something `monmux` is supposed to
decide, tells the user nothing was written when nobody knows, or drifts from a
documented contract. Find the concrete input, state, or failure point where it
fails. Do not praise or restyle the change. A review with no findings is
credible only after active attempts to break the changed behaviour.

This skill is the entry point for reviewing any change in this repository.
`AGENTS.md` and the project documentation remain the sources of truth; this
skill defines review procedure and reporting.

## 0. The hard rule, during review too

**Reviewing never switches a monitor.** The `AGENTS.md` prohibition applies to
this skill exactly as it applies to implementation. In this repository the write
is a click, so: no picking an input in a Shell whose `monmux` is the real
binary, no `gnome-extensions enable` of a build in the user's live session
followed by interaction, no `make ext-nested` with `tests/bin` off `PATH`, no
`monmux switch` without `--dry-run`, no `ddcutil setvcp`, no `m1ddc … set …`,
no `i2cset`/`i2ctransfer`.

Read-only verification is allowed: `make ext-nested` as written (the fake is the
only `monmux` it can resolve), `monmux info`, `monmux doctor`, `monmux catalog
…`, `monmux switch … --dry-run`, `gnome-extensions info`, reading
`/sys/class/drm/**`. Anything a reviewer wants proven on real hardware goes into
the report as a command for the human to run, never executed here.

Also read `.agents/skills/gjs-style-guide/SKILL.md` before judging style; the
enforced rules live there, not in your habits.

## 1. Establish the diff

Never review from memory or only from the user's description. Read the actual
diff and determine its intent.

| User intent | Command |
| --- | --- |
| "my work", "before I commit", uncommitted changes | `git status --short`, then `git diff HEAD`; inspect untracked files too |
| staged changes only | `git diff --staged` |
| branch, "this PR", "ready to merge" | determine the base branch (`main`), then `git diff main...HEAD` |
| specific commit range | `git diff <base>..<head>` |
| GitHub PR number | `gh pr view <n>` for intent and metadata, then `gh pr diff <n>` |

Read `git log --oneline` for the reviewed range and any linked issue or PR body.
Code that works but does something other than the stated intent is a finding.

Read every changed file with enough surrounding context to understand its
contracts. For a behaviour change, inspect callers, the tests, and the docs that
depend on the changed symbol. A change to a widget's lifecycle needs the
matching `disable()` read in full, not skimmed.

## 2. Load project authority

Always read `AGENTS.md`. Load only the additional documentation relevant to the
changed paths:

| Changed area | Read | Review focus |
| --- | --- | --- |
| `src/lib/monmux.js` and any new subprocess | `AGENTS.md` invariants 2 and 3 | argv array, `monmux` from `PATH`, async only, cancellable, exit-code mapping, stderr handling, malformed JSON |
| `src/lib/exitCode.js` | `AGENTS.md` invariant 3 | 0/1/2 mapped exactly, undocumented codes never become a refusal, no code claims "nothing was written" that monmux did not promise |
| `src/lib/**` (other) | `.agents/skills/gjs-style-guide/SKILL.md` | purity: no Shell import, no St, no Clutter; testable under plain gjs |
| `src/extension.js`, any new widget | `AGENTS.md` invariant 4, the e.g.o rules in §3 | enable/disable symmetry, signal ids, GLib sources, nothing in a constructor, no main-loop blocking |
| `src/prefs.js` | `.agents/skills/gjs-style-guide/SKILL.md` | GTK only, no St/Clutter, no `resource:///org/gnome/shell/ui/…`, schema keys that exist |
| `src/metadata.json`, `src/schemas/**` | `scripts/check-metadata.js` | uuid, shell-version list, settings-schema present in the zip, gettext domain, no `version` key |
| `tests/**`, `tests/bin/monmux` | `docs/testing.md` | the fake is still the only reachable binary, the PATH guard still runs first, no test spawns anything |
| `.mk/**`, `Makefile`, `.github/workflows/**` | `docs/testing.md`, `AGENTS.md` | no target or job that can reach the real monmux, `verify` still covers what CI covers |
| `README.md`, `CONTRIBUTING.md`, docs | — | claims that match the code, no feature described that phase 2 has not shipped |

No matching document does not mean lighter review. Apply `AGENTS.md`, the
invariants below, and the general adversarial passes.

## 3. Repository invariants

Check these whenever affected, directly or indirectly. Weakening any of them is
normally a blocker.

- **The extension re-implements no policy.** Which monitor may be written to and
  which input is enabled for it are `monmux`'s decisions. A change that infers
  writability, guesses at a model, retries a refusal, offers a raw VCP code or
  value, hard-codes a catalog fact, or asks a monitor what input it is on is a
  blocker. `monmux` never reads the current input; a menu that shows an active
  marker is showing something nobody measured.
- **One subprocess, one way.** Only `src/lib/monmux.js` spawns. Argv array,
  never a shell string; `'monmux'` from `PATH`, never an absolute or
  user-configurable path; asynchronous, never `communicate_utf8()` or
  `spawn_sync` on the Shell's main loop. A settings key holding a binary path is
  a blocker, not a convenience.
- **Exit codes are mapped exactly.** `0` sent, `2` refused with nothing written,
  `1` ran and failed with the write status unknown, anything else unexpected.
  Only a refusal may reach the user as "nothing was written". A path that
  reports a failure as a refusal is a false promise about hardware and is a
  blocker.
- **enable/disable symmetry.** For every object, signal connection, `GLib`
  timeout or idle source, notification source and `Gio.Cancellable` created in
  `enable()` or after it, find the line in `disable()` that releases it. A
  handler id kept in a local, a source id never removed, a subprocess whose
  callback fires after `disable()` and touches a destroyed widget: all findings,
  the last one a blocker. Nothing may be created in a constructor.
- **Redaction survives.** `monmux` redacts serials by default; nothing here may
  undo that. A `--show-serial` that is not an explicit user action, or any
  serial, serial string, EDID hex or display UUID reaching `console.*`, is a
  blocker.
- **Layer separation.** No GTK in `extension.js`. No St, Clutter or
  `resource:///org/gnome/shell/ui/…` in `prefs.js`. Nothing under `src/lib/`
  imports the Shell — that is what keeps it testable, and an import added there
  breaks the suite's ability to run at all.
- **Tests can never reach the real monmux.** The `test` script prepends
  `tests/bin`, and `tests/main.js` refuses to run unless
  `GLib.find_program_in_path('monmux')` is the fake. A change that removes the
  guard, moves it after the first import of a test file, or adds a test that
  spawns a process is a blocker.
- **Every user-visible string goes through gettext**, and no log line does.
- **The e.g.o rules hold**: no side effects at import time (a module that does
  work when loaded runs it on the lock screen too), no `Lang`, no `Mainloop`,
  no `ByteArray`, no `imports.` legacy syntax, no minified or generated code in
  the packed zip, no telemetry, no network access.
- **`shell-version` means something.** A new API has to exist in Shell 46, or
  46 comes out of the list deliberately, in the same commit, with the reason
  written down. Nothing checks this mechanically — the `@girs` types are pinned
  to 50, for the reason in `AGENTS.md` — so for every Shell, GTK or Adwaita API
  the diff introduces, look up its "since" version and say in the review whether
  46 has it.
- **Every JavaScript file carries the GPL-2.0-or-later header** from
  `.idea/copyright/GPL_2_0_or_later.xml`.

## 4. Adversarial passes

Do not skim for style. Run each pass with "how can this fail?" framing:

- **monmux is missing or old:** no `monmux` on `PATH` at all; a `monmux` that
  exits 127; one whose `--json` flag does not exist yet; one that prints valid
  JSON with a field this code requires absent; a version below whatever minimum
  the code assumes. Every one of those must produce a menu that says what is
  wrong, not a stack trace in the journal and an empty popup.
- **Malformed output:** truncated JSON, JSON that parses to `null`, an empty
  stdout with exit 0, a huge stderr, output in a locale that reorders fields,
  non-UTF-8 bytes. `JSON.parse` throwing inside an async callback with no catch
  takes the Shell's promise chain with it.
- **Exit 1 versus exit 2:** for every new branch, confirm the user-facing
  wording matches what the code actually knows. Look for a "nothing was written"
  string reachable from a non-2 code, and for a `catch` that swallows the
  distinction.
- **Lifecycle:** `disable()` immediately after `enable()`; `disable()` while a
  subprocess is running; `disable()` with the menu open; two `enable()` calls in
  a row (a leaked indicator from the first shows as a duplicate icon); the lock
  screen, where `disable()` runs and the session is in an odd state. Count the
  creations and the destructions and make them match.
- **Signals and sources:** every `connect()` in the diff — is the id stored, and
  disconnected? Every `GLib.timeout_add`/`idle_add` — is the id removed, and
  does the callback return `GLib.SOURCE_REMOVE` where it should? A callback that
  returns `undefined` is a source that stops silently.
- **Hotplug and multiple displays:** a monitor arriving or leaving while the
  menu is open; `monitors-changed` firing during a refresh; two displays where
  one matches the catalog and one does not; a refresh that starts a second
  subprocess before the first returned.
- **Blocking:** search the diff for any synchronous call — `communicate_utf8`,
  `spawn_sync`, `load_contents` on a file, a `while` loop over a stream. On the
  Shell's main loop each one is a visible freeze.
- **Redaction:** inspect every new format string, error, log line and menu label
  for a serial, a serial string, EDID hex or a UUID reaching output.
- **prefs.js:** it runs in a process with no Shell. Anything the diff adds there
  that touches St, Clutter, `Main`, or `global` throws at load — and the
  preferences dialog failing to open is a bug report that reads as "nothing
  happens".
- **Tests:** require behaviour-focused coverage for changed behaviour in
  `src/lib`. Reject tests that pass against the old code, that assert on the
  fake's canned string rather than on the decision, that weaken an existing
  assertion, or that reach for a process. A new exit-code path without a test is
  a finding.
- **Contract drift:** compare the implementation against `README.md`,
  `AGENTS.md`, `docs/testing.md`, `src/metadata.json` and the commit or PR
  intent. Flag any undocumented setting, string, shortcut, shell-version change
  or new dependency.

Prefer one reproducible defect over ten vague suggestions. If you cannot name
the triggering state and the wrong result or broken invariant, keep
investigating or omit it.

## 5. Verify findings and gates

Use focused runs while investigating (`npm run test`, `npx eslint src/lib`),
then run the gate the changed set owes. Verification is read-only by
construction: the suite executes no external binary, and no gate here can reach
a monitor.

| Diff touched | Run |
| --- | --- |
| `src/lib/**` or `tests/**` | `make ext-lint`, `make ext-typecheck`, `make ext-test` |
| `src/extension.js`, `src/prefs.js`, `src/stylesheet.css` | `make verify`, then `make ext-nested` and open the menu |
| `src/metadata.json`, `src/schemas/**` | `make ext-schemas`, `make ext-pack`, then `make check-stage` |
| `package.json`, `eslint.config.js`, `tsconfig.json`, `ambient.d.ts` | `make ext-deps`, then `make verify` |
| `Makefile`, `.mk/**`, `.pre-commit-config.yaml`, `.github/**` | `make check` |
| broad change or merge-readiness review | `make verify`, then `make check` |
| docs or skill only | `make check` and inspect the rendered content and links |

`make ext-nested` is a gate a reviewer may run: the Shell inside it can only
resolve `tests/bin/monmux`. Check the journal it prints for warnings on
`disable()` — a leak usually announces itself there.

A failing gate is a confirmed finding when the reviewed change caused it. If a
gate cannot run, state why and mark it unverified; never imply it passed.

Hardware behaviour is never a gate you run. If a finding can only be settled by
switching a real monitor, write the exact steps for the human — the checklist in
`docs/testing.md` is the format — and mark the finding unresolved.

## 6. Report

Rank findings by severity, worst first. A false "nothing was written" promise, a
subprocess that is not an argv array or that takes a configurable path, a
re-implemented policy decision, a callback that can touch a destroyed widget, a
serial reaching a log, and a test that could execute the real `monmux` are
normally blockers. Skip pure formatting unless it changes meaning or breaks a
required gate.

For each finding:

```text
<path>:<line> - <severity: blocker | high | medium | low>: <one-line defect>
  Failure: <concrete input/state -> wrong result or broken invariant>
  Fix: <specific corrective change>
```

Put findings first. Then list open questions or assumptions, followed by any
hardware checks the human must run, followed by a one-line verdict: **block**,
**approve with nits**, or **approve**. Include gates actually run and gates not
run. If no findings exist, say so explicitly and briefly name the failure modes
you tried to trigger. Be blunt, but never invent a finding to appear thorough.
