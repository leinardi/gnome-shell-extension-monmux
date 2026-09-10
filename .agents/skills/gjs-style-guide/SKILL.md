---
name: gjs-style-guide
description: >
  Project-specific GJS and GNOME Shell extension coding rules for
  gnome-shell-extension-monmux. Apply whenever writing, editing, or reviewing
  any .js file in this repository — new modules, new files, bug fixes,
  refactors, test additions. The rules here are enforced by
  eslint-config-gnome, by `tsc --checkJs` against the @girs types, and by
  the pre-commit hooks. Violations require manual fixup after the fact, so
  internalise them up-front instead. Use this skill proactively: consult it
  before generating JavaScript, not after lint fails.
---

# GJS Style Guide — gnome-shell-extension-monmux

Rules derived from `eslint.config.js` — which is `eslint-config-gnome`, the rule
set GNOME Shell itself is linted with, plus this repository's overrides — from
`tsconfig.json`, and from what reviewers on extensions.gnome.org reject.

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
    Extension,
    gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';
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
if (!this._indicator) {
    this._indicator = new MonmuxIndicator();
    Main.panel.addToStatusArea(this.uuid, this._indicator);
}
```

`consistent` means an `if`/`else` pair either both have braces or neither does.

---

## 3. Import order and form

Three groups, separated by blank lines:

```js
import GObject from 'gi://GObject';          // 1. gi:// — GObject first, then alphabetical
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';   // 2. resource:///
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {outcomeForExitCode} from './lib/exitCode.js';             // 3. this repository
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

Widgets are registered, and the body is not indented — the linter has an
explicit exemption for this shape because it is meant to become a decorator:

```js
const MonmuxIndicator = GObject.registerClass(
class MonmuxIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'monmux');
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

This is what e.g.o reviewers reject extensions over, and it is invariant 4 in
`AGENTS.md`.

```js
export default class MonmuxExtension extends Extension {
    enable() {
        this._indicator = new MonmuxIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
```

- **Nothing in a constructor.** The Shell builds the extension object once and
  keeps it across enable/disable cycles. Anything a constructor creates survives
  a `disable()` and leaks into the next `enable()`.
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
- Promisify once, at module scope, before any call:

  ```js
  Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
  ```

- Every async call that outlives a menu takes a `Gio.Cancellable`, and
  `disable()` cancels it. A callback that fires after `disable()` and touches a
  destroyed widget crashes the Shell.
- A cancelled call rejects with `Gio.IOErrorEnum.CANCELLED`; catch it and return
  quietly rather than reporting it as a failure to the user.
- `require-await` is on: an `async` function with no `await` is an error.
- `no-await-in-loop` is on. Collect the promises and `await Promise.all(…)`.

---

## 7. Subprocesses

Only `src/lib/monmux.js` spawns anything (`AGENTS.md`, invariant 2):

```js
const proc = Gio.Subprocess.new(
    ['monmux', 'info', '--json'],
    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
```

- An **argv array**, always. Never a shell string, never a command assembled by
  concatenation, never `/bin/sh -c`.
- `'monmux'` unqualified, resolved from `PATH`. Never an absolute path, and
  never a path from a setting: a configurable binary path turns a menu into a
  way to run an arbitrary program.
- Read the exit code through `src/lib/exitCode.js`. Nothing else interprets a
  number from a process.

---

## 8. Strings and gettext

Every user-visible string:

```js
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
// in prefs.js:
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const label = _('Switch to DisplayPort');
```

- `_()` for a plain string, `ngettext()` for a count, `C_()` when the same word
  needs two translations in two contexts.
- `prefer-template` is on: build with a template literal, never with `+`.
- Do not wrap a string that no user sees — a log line, a D-Bus name, a `PATH`
  entry. Translating those is noise for the translator and a bug waiting for the
  first locale that renders one differently.

---

## 9. Logging

- `console.log()`, `console.warn()`, `console.error()` — never `log()`,
  `logError()` or `printerr()` in extension code. GJS 1.73 made the console
  object the supported path, and the old ones are what a reviewer greps for.
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
- **The type-checker does not tell you whether an API exists in Shell 46.** The
  46 types are a 2024 generation of `@girs` that does not install alongside the
  current `@girs` core packages — `AGENTS.md` has the detail. Before using a
  Shell or GTK API, read its "since" version in the GNOME documentation
  yourself; `shell-version` in `metadata.json` promises 46 and nothing checks
  that promise mechanically.
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

## 12. Comments

- Explain **why**, not what. A comment that restates the line above it is noise;
  a comment explaining why a check exists is the reason nobody deletes it in six
  months.
- `spaced-comment` is on: `// text`, not `//text`.
- No `FIXME` in committed code. `TODO` is allowed when it names what and when.

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
- [ ] Every user-visible string in `_()`
- [ ] `console.*`, never `log()`; nothing logged that `monmux` redacts
- [ ] JSDoc with types on every export; `make ext-typecheck` clean
- [ ] Any Shell, GTK or Adwaita API new to this repository checked against its "since" version — the types are pinned to 50 and prove nothing about 46
- [ ] GPL header at the top of the file
