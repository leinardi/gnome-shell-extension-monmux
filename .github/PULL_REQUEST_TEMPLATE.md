<!-- markdownlint-disable MD041 -->
<!--
Any HTML comment will be stripped when the markdown is rendered, so you don't need to delete them.
-->

## Summary

<!-- Short description of what this PR does. -->

## Scope: this repository is only the GNOME Shell extension

Anything that changes what may be written to which monitor belongs to [leinardi/monmux](https://github.com/leinardi/monmux)
instead. This extension renders monmux's decisions and takes none of them.

| Change | Where it belongs |
| --- | --- |
| Indicator, menu, notifications, preferences, stylesheet | here |
| `src/lib/**`, the subprocess wrapper, the JSON and exit-code mapping | here |
| Packaging, `metadata.json`, schemas, translations, GNOME Shell version support | here |
| Repository tooling: Makefile, hooks, CI, docs, skills | here |
| A catalog entry, or write-enabling a model or an input | [monmux](https://github.com/leinardi/monmux) |
| A new `monmux` flag, subcommand, or output format | [monmux](https://github.com/leinardi/monmux) |
| Identification, refusal reasons, exit codes, ddcutil or m1ddc behaviour | [monmux](https://github.com/leinardi/monmux) |

- [ ] This PR changes only the extension. Anything it needs from monmux is already released, or is linked here as a separate
  monmux pull request

## Pull request checklist

- [ ] I am targeting the `main` branch
- [ ] I have **rebased** this branch on top of the destination branch
- [ ] I have executed `make check` locally *before creating the commit* and it has run successfully
- [ ] I have executed `make verify` locally and it has run successfully
- [ ] I have performed a self-review of my own code
- [ ] There are no `WIP` commits in this PR

## Monitor writes

- [ ] No hardware run — a click that switches an input, or any other command that writes to a monitor — in this pull request was
  performed by an AI agent — [AGENTS.md](../AGENTS.md)
- [ ] Any hardware behaviour this PR claims was verified by a human, by hand, and the Summary above says what was switched and
  what happened

## Extension hygiene

- [ ] Everything created in `enable()` is destroyed in `disable()`: widgets, signal handler ids, timeout and idle sources,
  notification sources, cancellables
- [ ] No new subprocess outside `src/lib/monmux.js`, and it spawns `monmux` from `PATH` through an argv array, asynchronously
- [ ] Every new user-visible string is wrapped in `_()`
- [ ] No GTK in `extension.js`, no St/Clutter in `prefs.js`
- [ ] No monmux policy re-implemented here: no guessing at a monitor, no retrying a refusal, no raw VCP value, no "current
  input" marker

## Type of changes

<!-- Tick all that apply: -->

- [ ] 🐛 Bug fix
- [ ] ✨ New feature
- [ ] 🔧 Refactoring
- [ ] 📜 Docs
- [ ] 🌍 Translations
- [ ] 🧰 CI / tooling / infra
- [ ] Other (describe in Summary)
