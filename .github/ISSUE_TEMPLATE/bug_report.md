---
name: Bug report
about: Report a bug in the GNOME Shell extension
title: "[Bug]: "
labels: ["bug"]
assignees: []
---
<!--
monmux redacts serial numbers, serial strings, raw EDID hex and macOS display
UUIDs in every output by default, so `monmux info` and `monmux doctor` are safe
to paste. Do not paste `--show-serial` output: it prints exactly what the
redaction exists to keep out of a public issue.
-->

## Step 1: Is this the extension, or is it monmux?

This repository is **only** the GNOME Shell extension: the panel indicator, its menu, its notifications, its preferences
window, and its packaging. Everything about which monitor may be switched, and how, belongs to
[leinardi/monmux](https://github.com/leinardi/monmux) — the extension takes none of those decisions and cannot change them.

**The test:** run the same thing in a terminal. If it fails there too, it is a monmux issue.

| Symptom | Where it belongs |
| --- | --- |
| The indicator is missing, the menu is empty, wrong, or does not update | here |
| Clicking an input does nothing, or reports something different from what the CLI reports | here |
| A notification says the wrong thing, or shows something that should be redacted | here |
| The preferences window fails to open, or a shortcut does not work | here |
| The extension fails to install, enable, or breaks on a GNOME Shell version | here |
| A translation is missing or wrong | here |
| `monmux switch …` fails or refuses in a terminal | [monmux](https://github.com/leinardi/monmux/issues/new/choose) |
| A monitor is not detected, not identified, or identified as the wrong model | [monmux](https://github.com/leinardi/monmux/issues/new/choose) |
| An input is greyed out, or your monitor is not in the catalog | [monmux monitor report](https://github.com/leinardi/monmux/issues/new?template=monitor_report.md) |
| `monmux doctor` reports a failing check — ddcutil, m1ddc, permissions, `/dev/i2c-*` | [monmux](https://github.com/leinardi/monmux/issues/new/choose) |
| The monitor switched but came back, or switched to the wrong input | [monmux](https://github.com/leinardi/monmux/issues/new/choose) |

* [ ] I have run the equivalent `monmux` command in a terminal, and it behaved **differently** from the extension — or the
  problem has nothing to do with switching at all.
* [ ] I have checked that there are no duplicate active or recent issues describing this problem.
* [ ] I am using the latest release of the extension, or have reproduced this on `main`.

## Step 2: Describe your environment

* GNOME Shell version (`gnome-shell --version`): `?`
* Session type (Wayland or X11): `?`
* Distribution and version: `?`
* Extension version (`gnome-extensions info monmux@leinardi.github.io`): `?`
* `monmux version`: `?`
* Installed the extension from (extensions.gnome.org, `make ext-install`, distribution package): `?`

<!--
The two reports below are asked for because the extension renders them: a menu
that shows the wrong thing is often a report that already said something
unexpected. Both redact by default.
-->

### `monmux doctor`

```text
<paste here; it redacts by default>
```

### `monmux info`

```text
<paste here; it redacts by default>
```

## Step 3: Describe the problem

### What you did in the panel menu

<!-- Which display, which input, and what the menu looked like before you clicked. -->

*

### The same thing from a terminal

<!--
The exact command and its output, so the two can be compared. If the problem is
not about switching, say so and remove this block.
-->

```sh
$
```

* Exit code: `?`

### Observed results

<!-- What happened in the extension? Include the notification text, including the refusal message if there was one. -->

```text
```

### Expected results

<!-- What did you expect to happen? -->

*

### Shell log

<!--
Run this in a terminal, reproduce the problem, then paste the lines it printed:

    journalctl -f -o cat /usr/bin/gnome-shell
-->

```text
```

### Anything else

<!-- Screenshots of the menu, whether the monitor changed input, what the OSD showed, and anything else that helps. -->

*
