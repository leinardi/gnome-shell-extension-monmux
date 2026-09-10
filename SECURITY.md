# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[security advisories](https://github.com/leinardi/gnome-shell-extension-monmux/security/advisories/new) rather than in a public
issue.

Include what you did, what happened, and the output of `monmux info` and `monmux doctor` if it is relevant. Both redact serial
numbers, serial strings, raw EDID hex and display UUIDs by default, so their output is safe to paste.

If the issue is in what `monmux` itself decides or writes, it belongs to [leinardi/monmux](https://github.com/leinardi/monmux)
and its [security policy](https://github.com/leinardi/monmux/security/policy).

## Security model

This extension runs inside `gnome-shell`, which means its code runs with the full privileges of the user's graphical session.
That is the reason for the rules below, and none of them is a matter of taste:

- **It spawns exactly one program: `monmux`, resolved from `PATH`, through an argv array.** Never a shell string, never an
  absolute path, and never a path taken from a setting, a schema key or an environment variable. A configurable binary path
  would turn a panel menu into a way to run an arbitrary program as the user, and would be a privilege-escalation vector every
  time a `PATH` entry is writable by someone else.
- **It decides nothing about hardware.** Which monitor may be written to and which input is enabled for it are `monmux`'s
  decisions, taken against evidence in its built-in catalog. This extension renders them. It cannot enable an input the catalog
  refuses, and it has no code path that produces a raw VCP code or value.
- **It never claims a write happened that may not have.** Exit code `2` from `monmux` means nothing was written; exit code `1`
  means the status is unknown and is reported in those words.
- **It shows no private identifier by default.** `monmux` redacts serial numbers, serial strings, EDID hex and display UUIDs
  unless `--show-serial` is passed, and nothing here undoes that or writes one to the journal.
- **It makes no network request and collects no telemetry.** There is no code that opens a socket.

The tool it runs is a trust boundary, not a mitigated threat: this extension cannot tell a genuine `monmux` from a maliciously
replaced binary with the same name earlier on `PATH`. `monmux` applies the same reasoning to `ddcutil` and `m1ddc` —
[its security document](https://github.com/leinardi/monmux/blob/main/docs/security.md) has the details.

## Supported versions

The latest release only. A fix ships as a new release; there are no patch releases for older versions, and no version is
supported once a newer one exists. `main` is development, not a supported version.
