---
name: gjs-style-guide
description: >
  GJS and GNOME Shell extension coding rules for gnome-shell-extension-monmux, as
  enforced by eslint-config-gnome, tsc --checkJs against the @girs types, and
  pre-commit. Covers formatting and braces, import groups and layer boundaries
  (src/lib, src/ui, extension.js, prefs.js), the enable()/disable() lifecycle,
  async and subprocess rules, gettext through reasons.js, console logging, JSDoc
  types, Shell 46 API compatibility, and the patterns extensions.gnome.org rejects.
  Use when writing, editing, or reviewing any .js file in this repository, before
  generating code rather than after lint fails.
---

# GJS Style Guide — gnome-shell-extension-monmux

Rules derived from `eslint.config.js` — which is `eslint-config-gnome`, the rule
set GNOME Shell itself is linted with, plus this repository's overrides — from
`tsconfig.json`, and from what reviewers on extensions.gnome.org (e.g.o) reject.

---

## 1. Formatting, the short list

| Rule | This repository |
| --- | --- |
| Indent | 4 spaces, never a tab (`no-tabs`) |
| Quotes | single, `avoidEscape` (`'it\'s'` → `"it's"` is allowed) |
| Semicolons | always |
| Object braces | `{foo}`, no inner spaces (`object-curly-spacing`) |
| Array brackets | `[foo]`, no inner spaces |
| Trailing commas | required in multi-line arrays, objects and **imports**; never in a function's arguments |
| Line endings | unix |
| Blank line at end | required |
| Padded blocks | forbidden — no blank line right after `{` or before `}` |

`comma-dangle` catching multi-line imports is the one that surprises people:

```js
import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
```

---

## 2. Braces: `curly: multi-or-nest, consistent`

A single-statement body has **no** braces, and goes on the next line
(`nonblock-statement-body-position: below`):

```js
// Wrong
if (!this._indicator) { return; }
if (!this._indicator) return;

// Right
if (!this._indicator)
    return;

// Right — a multi-line body keeps its braces
if (this._menuOpenId !== 0) {
    this._indicator?.menu.disconnect(this._menuOpenId);
    this._menuOpenId = 0;
}
```

`consistent` means an `if`/`else` pair either both have braces or neither does.

---

## 3. Import order and form

Three groups, separated by blank lines:

```js
import Clutter from 'gi://Clutter';                                    // 1. gi://, alphabetical
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';   // 2. resource:///

import {installMonmux} from '../lib/links.js';                         // 3. this repository
```

- Always the `.js` extension on a local import. GJS resolves no extensions.
- `gi://Gtk?version=4.0` in `prefs.js`: pin the version where two exist.
- **`prefs.js` never imports `resource:///org/gnome/shell/ui/…`**, and
  `extension.js` never imports GTK. The two run in different processes; an
  import that crosses over throws at load time, not at review time.
- **`src/lib/**` imports nothing from the Shell at all** — no `resource:///`, no
  `gi://St`, no `gi://Clutter`. `gi://GLib` and `gi://Gio` are fine. This is
  what lets the test suite run those modules under plain `gjs`, and it is why
  logic belongs there rather than inside a widget.

---

## 4. Classes and GObject

Prefer composition over subclassing a Shell widget: `MonmuxIndicator`
(`src/ui/indicator.js`) is a plain class that owns a `PanelMenu.Button` in
`this.button` rather than subclassing it, which keeps the type-checker away from
GObject's `_init`. Copy that shape.

When a GObject subclass is genuinely needed, register it, and do not indent the
body — the linter has an explicit exemption for this shape:

```js
const FooBox = GObject.registerClass(
class FooBox extends St.BoxLayout {
    _init(params) {
        super._init(params);
        // …
    }
});
```

- `_init()` for a `GObject.registerClass`ed class, `constructor()` for a plain
  one. Do not mix them.
- An `_init()` whose whole body is `super._init(...)` is an error
  (`no-restricted-syntax`); delete it.
- Private members carry a leading underscore: `this._indicator`,
  `_onMenuOpened()`. There is no other privacy convention here.
- `camelCase` for everything except GObject property names, which keep their
  `snake_case` (`icon_name`, `style_class`) — the `camelcase` rule is set to
  `properties: 'never'` for exactly that.

---

## 5. The extension lifecycle

This is what e.g.o reviewers reject extensions over, and it is the `AGENTS.md`
invariant "Everything created in `enable()` dies in `disable()`".

```js
export default class MonmuxExtension extends Extension {
    enable() {
        this._indicator = new MonmuxIndicator({/* … */});
        Main.panel.addToStatusArea(this.uuid, this._indicator.button);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
```

- **Nothing created in a constructor.** The Shell builds the extension object
  once and keeps it across enable/disable cycles. A constructor only declares
  fields (`null`, `0`); anything it creates survives a `disable()` and leaks into
  the next `enable()`.
- Everything `enable()` creates, `disable()` destroys: widgets (`destroy()`),
  signal handlers (`disconnect(id)`), `GLib` sources (`GLib.Source.remove(id)`),
  notification sources, and any in-flight subprocess (`cancellable.cancel()`).
- Null every reference you dropped, so a leak shows up as a null dereference
  rather than as a widget that is still on screen.
- `disable()` runs on the lock screen too. It has to work with the session in
  any state, and it must not throw.

---

## 6. Asynchronous work

- **Never block the Shell's main loop.** No `Gio.Subprocess.communicate_utf8()`,
  no `GLib.spawn_sync`, no synchronous file read on a path that might be slow.
  Every frame the Shell misses is visible.
- **Never `Gio._promisify`.** It patches a shared prototype for every extension
  in the process, at import time. Wrap the `_async`/`_finish` pair in a local
  `Promise`, as `communicate()` in `src/lib/monmux.js` does.
- Every async call that outlives a menu takes a `Gio.Cancellable`, and
  `disable()` cancels it. A callback that fires after `disable()` and touches a
  destroyed widget crashes the Shell.
- A cancelled call rejects with `Gio.IOErrorEnum.CANCELLED`; catch it and return
  quietly rather than reporting it as a failure to the user.
- `require-await` is on: an `async` function with no `await` is an error.
- `no-await-in-loop` is on. Collect the promises and `await Promise.all(…)`.

---

## 7. Subprocesses

Only `src/lib/monmux.js` spawns anything (`AGENTS.md` invariant "One
subprocess, one way"):

```js
const proc = Gio.Subprocess.new(
    [PROGRAM, ...argv],
    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
```

- An **argv array**, always. Never a shell string, never a command assembled by
  concatenation, never `/bin/sh -c`.
- `PROGRAM` is `'monmux'`, unqualified, resolved from `PATH`. Never an absolute path, and
  never a path from a setting: a configurable binary path turns a menu into a
  way to run an arbitrary program.
- Read the exit code through `src/lib/exitCode.js`. Nothing else interprets a
  number from a process.

---

## 8. Strings and gettext

- **Extension-side text comes only from `src/lib/reasons.js`.** `extension.js`
  builds it with the extension's own gettext
  (`new Reasons(message => this.gettext(message))`) and hands it to `src/ui/`,
  which has no sentences of its own. `reasons.js` takes gettext as a parameter
  rather than importing it, so it stays loadable under plain `gjs`.
- **`prefs.js` imports `gettext as _`** from
  `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js`.
- The argument to `_()` is a plain string literal: `scripts/check-pot.js` runs
  xgettext with `--keyword=_` only, so a template literal, a variable,
  `ngettext()` or `C_()` is never extracted.
- Placeholders are named (`{version}`), filled after translation, and explained
  to translators in a `// Translators:` comment directly above the entry.
- Outside a translatable string, `prefer-template` is on: build with a template
  literal, never with `+`.
- Do not wrap a string that no user sees — a log line, a D-Bus name, a `PATH`
  entry.
- After changing a user-visible string, run `make ext-pot` and commit what it
  changed in `po/`; `make ext-pot-check` fails otherwise.

---

## 9. Logging

- `console.log()`, `console.warn()`, `console.error()` — never `log()`,
  `logError()` or `printerr()` in extension code; the old ones are what a
  reviewer greps for.
- Prefix nothing by hand: the Shell already attributes the message to the
  extension.
- Never log a serial, a serial string, EDID hex or a display UUID — the journal
  is world-readable on most systems, and `monmux` redacts by default precisely
  so that nothing downstream has to remember to.

---

## 10. Types: `tsc --checkJs`

`tsconfig.json` runs the type-checker over `src/**` and `tests/**` in `strict`
mode against `@girs/gnome-shell`, **pinned to 50**.

- Every exported function needs a JSDoc block with `@param` and `@returns`
  types (`jsdoc/require-jsdoc`, `publicOnly: {esm: true}`). Without the types,
  `strict` reads the parameters as implicit `any` and fails.
- **`make ext-typecheck` does not prove an API exists in Shell 46**: the types
  are pinned to 50 (`AGENTS.md`, "Style"). Before using a Shell, GTK or Adwaita
  API, check its "since" version in the GNOME documentation; `shell-version` in
  `metadata.json` promises 46 and nothing checks that promise mechanically.
- `@ts-expect-error` needs a comment saying why, and it is the last resort.

---

## 11. Deprecated, and rejected on sight by e.g.o

| Never | Instead |
| --- | --- |
| `Lang.Class`, `Lang.bind`, `Lang.copyProperties` | ES6 classes, arrow functions, `Object.assign()` |
| `Mainloop.timeout_add(…)` | `GLib.timeout_add(GLib.PRIORITY_DEFAULT, …)`, removed in `disable()` |
| `ByteArray.toString(…)` | `TextDecoder`, or `communicate_utf8_async` |
| `imports.gi.…`, `imports.ui.…` | `import … from 'gi://…'` / `'resource:///…'` |
| `log()`, `logError()` | `console.log()`, `console.error()` |
| Minified or bundled JavaScript in the zip | plain, readable sources |
| Any network access, any telemetry | neither exists here |

---

## 12. File header and comments

- Every `.js` file under `src/`, `tests/` and `scripts/` starts with the GPL
  header from `.idea/copyright/GPL_2_0_or_later.xml`; copy it from any existing
  file.
- Comments explain **why**, not what.
- `spaced-comment` is on: `// text`, not `//text`.
- No `FIXME` in committed code. `TODO` is allowed when it names what and when.

---

## Lint loop

1. `make ext-lint-fix` to apply the automatic fixes.
2. `make ext-lint ext-typecheck ext-test`; fix every finding and re-run until
   clean.
3. If a user-visible string changed: `make ext-pot`, then `make ext-pot-check`.
4. `git status` — check what the fixers and `make ext-pot` rewrote.

---

## Quick checklist before submitting JavaScript

- [ ] 4-space indent, single quotes, semicolons, trailing commas in multi-line literals **and imports**
- [ ] Single-statement `if` body unbraced, on the next line
- [ ] Imports grouped `gi://` / `resource:///` / local, each with its `.js` extension
- [ ] Nothing built in a constructor; everything `enable()` creates is destroyed in `disable()`
- [ ] Every signal id, `GLib` source and `Gio.Cancellable` released in `disable()`
- [ ] No synchronous subprocess, no synchronous I/O on the main loop
- [ ] Any new spawn lives in `src/lib/monmux.js`, argv array, `monmux` from `PATH`
- [ ] `src/lib/**` imports nothing from the Shell
- [ ] Every extension-side sentence comes from `reasons.js`; prefs strings in `_()`; `po/` regenerated
- [ ] `console.*`, never `log()`; nothing logged that `monmux` redacts
- [ ] JSDoc with types on every export; `make ext-typecheck` clean
- [ ] Any Shell, GTK or Adwaita API new to this repository checked against its "since" version — the types are pinned to 50 and prove nothing about 46
- [ ] GPL header at the top of the file
- [ ] No `Gio._promisify`; a Shell widget is owned, not subclassed
