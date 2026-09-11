# monmux — GNOME Shell extension

Switch a supported monitor between its video inputs from the GNOME top panel.

The panel menu lists the attached displays and, under each one, the inputs that
[`monmux`](https://github.com/leinardi/monmux) will actually write. Picking one switches the monitor. Inputs that `monmux`
knows about but has no hardware evidence for are shown greyed out, with a link explaining how to test and report that model,
so the menu says *why* something is unavailable instead of hiding it.

`monmux` is a separate command-line tool and it takes every decision: it identifies each attached monitor against a built-in
catalog of models and refuses anything it cannot positively identify, or that the catalog does not explicitly enable for that
model. This extension runs it, renders what it reports, and reports back what it said. It re-implements none of that policy,
and it can enable nothing `monmux` refuses.

## Status

**In development. Not yet on extensions.gnome.org.** The panel menu is built and needs `monmux` 0.6.0 or newer. It has been
exercised in a nested GNOME Shell against a fake `monmux`, and not yet against a real monitor: that is the checklist in
[`docs/testing.md`](docs/testing.md).

Shipped:

- one section per attached display, with its inputs as menu items
- greyed-out inputs for models the catalog records but has not write-enabled, with a "test and report this monitor" link
- a notification per switch: sent, refused with the reason and a troubleshooting link, or "the write status is unknown"
- the installed `monmux` version in the menu, and a prompt with an install link when `monmux` is missing or too old
- a refresh on menu open and on monitor hotplug
- a dry-run switch in the menu, which has `monmux` print the command instead of running it
- [serial targeting](#serial-targeting) for more than one supported monitor, off by default and not hardware-verified

Planned:

- a preferences window with a diagnostics page (`monmux doctor`) and per-display keyboard shortcuts
- translations

There is no "current input" marker anywhere, and there will not be one: `monmux` never asks a monitor which input it is on, so
the extension has nothing truthful to show.

## Serial targeting

With two or more supported monitors attached, `monmux` will not pick one on its own, so a click ends in a
`multiple-candidates` refusal. Turn on **Serial targeting** in the extension's preferences, and the menu reads the monitors'
serial numbers with `monmux info --show-serial`, so that a click is pinned to the monitor it was made under with
`monmux switch … --serial`.

- It is off by default, and while it is off `--show-serial` is never passed.
- The serials are kept in memory to pin a click. They are never shown in the menu, in a notification or in the log.
- A monitor with no readable serial is left unpinned. Without a `serial:` pin in `monmux`'s configuration file, `monmux` then
  refuses that click as it would without the setting; with one, the click goes to the pinned monitor, which may not be the one
  it was made under.
- `--serial` wins over that `serial:` pin. A pinned click targets the monitor it was made under, whatever the file says; an
  unpinned click — one supported monitor, a monitor with no readable serial, or the setting off — leaves the file's pin in
  force.

**Not hardware-verified.** It has only been exercised against the fake `monmux`, and it stays marked that way until somebody
with two supported monitors has tried it.

## Requirements

- GNOME Shell 46, 47, 48, 49 or 50
- [`monmux`](https://github.com/leinardi/monmux), installed and working from a terminal — start with `monmux doctor`
- a monitor `monmux` supports. It supports few, deliberately: an input is write-enabled only after somebody with that monitor
  in front of them switched it and wrote down what happened.

## Install from source

```sh
git clone https://github.com/leinardi/gnome-shell-extension-monmux.git
cd gnome-shell-extension-monmux
make ext-deps          # npm ci
make ext-pack          # dist/monmux@leinardi.github.io.shell-extension.zip
make ext-install
```

GNOME Shell only picks up a new extension after a restart: on Wayland log out and back in, on X11 press <kbd>Alt</kbd> +
<kbd>F2</kbd> and type `r`. Then:

```sh
gnome-extensions enable monmux@leinardi.github.io
```

## Reporting a monitor

The supported-monitor catalog lives in `monmux`, not here. If your monitor is not listed, or one of its inputs is greyed out,
the procedure is [docs/adding-a-monitor.md](https://github.com/leinardi/monmux/blob/main/docs/adding-a-monitor.md) in that
repository.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md). One rule stands out and is absolute: **no AI agent switches a monitor** — not by running
`monmux switch`, and not by clicking an input in a Shell that can reach the real binary. Only a human does that, by hand. The
test suite and `make ext-nested` see a fake `monmux` and nothing else — [docs/testing.md](docs/testing.md).

## Licence

GPL-2.0-or-later. See [LICENSE](LICENSE).
