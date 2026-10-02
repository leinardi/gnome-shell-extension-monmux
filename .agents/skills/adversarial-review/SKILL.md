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
  findings. Use when the user asks to review changes, a diff, PR, branch, or
  commit; check work before committing; assess merge readiness; or poke holes
  in an implementation.
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

Copy this checklist and tick items as you go:

```text
Review progress:
- [ ] 0. No-write rule acknowledged; only read-only commands from here on
- [ ] 1. Diff and stated intent read; every changed file read with its context
- [ ] 2. AGENTS.md and the documents for the changed paths loaded
- [ ] 3. Repository invariants checked
- [ ] 4. Adversarial passes run
- [ ] 5. Gates run, or marked unverified; hardware checks written for the human
- [ ] 6. Report written: ranked findings, verdict, gates run
```

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
diff and determine its intent. With no scope given, review the uncommitted work;
if the tree is clean, review the branch against `main`.

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
| `src/lib/monmux.js` and any new subprocess | `AGENTS.md` invariants "One subprocess, one way" and "Exit codes are mapped exactly" | argv array, `monmux` from `PATH`, async only, cancellable, exit-code mapping, stderr handling, malformed JSON |
| `src/lib/exitCode.js` | `AGENTS.md` invariant "Exit codes are mapped exactly" | 0/1/2 mapped exactly, undocumented codes never become a refusal, no code claims "nothing was written" that monmux did not promise |
| `src/lib/serials.js` | `AGENTS.md` invariant "No serial is shown unless the user opted in" | `--show-serial` only while the user opted in; nothing it reads is rendered or logged, a failure included; serials stay out of the model |
| `src/lib/reasons.js`, `src/lib/links.js` | `AGENTS.md` layout notes for both modules | the only sources of user-visible text and of URLs; every string a literal inside `_()`, with a `// Translators:` comment for each placeholder |
| `src/lib/**` (other) | `.agents/skills/gjs-style-guide/SKILL.md` | purity: no Shell import, no St, no Clutter; testable under plain gjs |
| `src/extension.js` | `AGENTS.md` invariant "Everything created in `enable()` dies in `disable()`", the extensions.gnome.org (e.g.o) rules in §3 | enable/disable symmetry, signal ids, GLib sources, nothing created in a constructor, no main-loop blocking |
| `src/ui/**` | the same lifecycle invariant, `AGENTS.md` layout notes for `src/ui/` | no sentence or URL of its own, nothing spawns, `indicator.button` added and destroyed through the indicator, every signal id released |
| `src/prefs.js` | `.agents/skills/gjs-style-guide/SKILL.md` | GTK only, no St/Clutter, no `resource:///org/gnome/shell/ui/…`, `monmux` only through `readOnly(spawn)`, schema keys that exist |
| `src/metadata.json`, `src/schemas/**` | `scripts/check-metadata.js` | uuid, shell-version list, settings-schema present in the zip, gettext domain, no `version` key |
| `po/**` | `scripts/check-pot.js` | template and translations regenerated with `make ext-pot`, not edited to hide drift |
| `tests/**`, `tests/bin/monmux` | `docs/testing.md` | the fake is still the only reachable binary, the PATH guard still runs first, no test spawns anything |
| `.mk/**`, `Makefile`, `.github/workflows/**` | `docs/testing.md`, `docs/release.md`, `AGENTS.md` | no target or job that can reach the real monmux, `verify` still covers what CI covers |
| `README.md`, `CONTRIBUTING.md`, docs | — | claims that match the code, no feature described that the code does not implement |

No matching document does not mean lighter review. Apply `AGENTS.md`, the
invariants below, and the general adversarial passes.

## 3. Repository invariants

`AGENTS.md` § Invariants is the checklist; read it in full. Weakening any
invariant is normally a blocker. What to look for while reviewing:

- **No policy.** Inferring writability, guessing at a model, retrying a refusal,
  offering a raw VCP code or value, hard-coding a catalog fact, or showing an
  "active input" marker (`monmux` never reads the current input, so nobody
  measured it) is a blocker.
- **One subprocess, one way.** A settings key holding a binary path is a blocker,
  not a convenience. So is a second place that spawns.
- **Exit codes.** A path that reports a failure as a refusal is a false promise
  about hardware and a blocker.
- **enable/disable symmetry.** For every object, signal connection, `GLib`
  source, notification source and `Gio.Cancellable` created in `enable()` or
  after it, find the line in `disable()` that releases it. A handler id kept in a
  local, a source id never removed, a subprocess whose callback fires after
  `disable()` and touches a destroyed widget: all findings, the last one a
  blocker.
- **Redaction.** A `--show-serial` that is not an explicit user action, or any
  serial, serial string, EDID hex or display UUID reaching `console.*` or a menu
  label, is a blocker.
- **Layer separation.** An import added under `src/lib/` that reaches the Shell
  breaks the suite's ability to run at all.
- **Tests can never reach the real monmux.** A change that removes the PATH
  guard in `tests/main.js`, moves it after the first import of a test file, or
  adds a test that spawns a process is a blocker.
- **gettext.** Extension-side sentences come only from `reasons.js`; a sentence
  or URL written in `src/ui/` or `extension.js`, a translated log line, or a
  string changed without `make ext-pot` is a finding.
- **The e.g.o rules hold**, plus: no `imports.` legacy syntax, and a module that
  does work when loaded is a finding (it runs on the lock screen too).
- **`shell-version` means something.** Nothing checks it mechanically — the
  `@girs` types are pinned to 50 (`AGENTS.md`, "Style") — so for every Shell,
  GTK or Adwaita API the diff introduces, look up its "since" version and say in
  the review whether 46 has it. Otherwise 46 leaves the list deliberately, in
  the same commit, with the reason written down.
- **Every JavaScript file carries the GPL-2.0-or-later header** from
  `.idea/copyright/GPL_2_0_or_later.xml`.
- **The release ships what CI checked.** `docs/release.md` is the contract:
  the release workflow's `build` job runs `make verify` on the released commit
  and attaches exactly the zip `ext-pack` produced. A release path that skips
  `verify`, packs outside `ext-pack`, or puts a `version` into
  `src/metadata.json` (extensions.gnome.org assigns it) is a finding.
- **Workflows stay pinned and least-privilege.** `contents: read` at the top,
  extra permissions per job with the reason; every action pinned to a full
  commit SHA with a `# vX.Y.Z` comment; inputs reach shell through `env:`,
  never `${{ }}` inside `run:`.

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

For every suspected defect, run this loop:

1. Reproduce it with a read-only command, or trace the triggering state through
   the code to the wrong result.
2. Confirmed (you can name the state and the wrong result or broken invariant)?
   Report it.
3. Not confirmed? Dig once more — read the caller, the test, or the fake's
   fixture. Still nothing? Drop it.

## 5. Verify findings and gates

Use focused runs while investigating (`npm run test`, `npx eslint src/lib`),
then run the gate the changed set owes. Verification is read-only by
construction: the suite executes no external binary, and no gate here can reach
a monitor.

| Diff touched | Run |
| --- | --- |
| `src/lib/**` or `tests/**` | `make ext-lint`, `make ext-typecheck`, `make ext-test` |
| `src/extension.js`, `src/ui/**`, `src/prefs.js`, `src/stylesheet.css` | `make verify`, then `make ext-nested` and open the menu |
| a user-visible string, `po/**` | `make ext-pot-check` (needs gettext) |
| `src/metadata.json`, `src/schemas/**` | `make ext-schemas`, `make ext-pack`, then `make check-stage` |
| `scripts/check-*.js` | `make ext-lint`, then the target that runs the script: `make check-stage` (`ext-metadata` hook) for `check-metadata.js`, `make ext-pack` for `check-bundle.js`, `make ext-pot-check` for `check-pot.js` |
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
