---
name: Feature request
about: Suggest an improvement to the GNOME Shell extension
title: "[Feature]: "
labels: ["enhancement"]
assignees: []
---
## Step 1: Is this the extension, or is it monmux?

This repository is **only** the GNOME Shell extension: the panel indicator, its menu, its notifications, its preferences
window, and its packaging. What may be written to which monitor is decided by
[leinardi/monmux](https://github.com/leinardi/monmux), against evidence recorded in its catalog. The extension renders those
decisions and cannot widen them, so a request to switch something monmux refuses is a request to monmux.

| Request | Where it belongs |
| --- | --- |
| Something about the menu, the indicator, the icon, or how a display is labelled | here |
| Notifications, wording, or what is shown after a switch | here |
| Preferences, keyboard shortcuts, per-display settings | here |
| GNOME Shell version support, packaging, extensions.gnome.org | here |
| Translations and localisation | here |
| Support for a monitor, or write-enabling one of its inputs | [monmux monitor report](https://github.com/leinardi/monmux/issues/new?template=monitor_report.md) |
| A new flag, output format, or behaviour of the `monmux` command | [monmux](https://github.com/leinardi/monmux/issues/new/choose) |
| Anything about identification, refusal reasons, or exit codes | [monmux](https://github.com/leinardi/monmux/issues/new/choose) |
| A ddcutil or m1ddc capability the CLI does not expose yet | [monmux](https://github.com/leinardi/monmux/issues/new/choose) |

* [ ] This is about the extension's user interface or behaviour, not about what monmux decides.
* [ ] I have checked the existing issues to confirm this feature has not already been requested.
* [ ] This is **not** a request for the extension to work around a monmux refusal, to guess at a monitor, to expose a raw VCP
  code or value, or to show which input a monitor is currently on. Those are refused by design —
  [AGENTS.md](https://github.com/leinardi/gnome-shell-extension-monmux/blob/main/AGENTS.md).

---

## 1. Summary

<!-- Short, clear summary of the feature or improvement. -->

*

---

## 2. Problem / Motivation

<!-- What problem does this feature solve? What's the pain point or limitation today? -->

*

---

## 3. Proposed solution

<!-- Describe how you imagine this feature working. Be as specific as possible. -->

* **High-level description:**
    *

* **Example usage / scenario:**
    *

---

## 4. Alternatives considered

<!-- Have you tried or considered other approaches or workarounds? Why are they not sufficient? -->

*

---

## 5. Impact and scope

* **Who benefits from this feature?** (e.g., all users, specific GNOME Shell versions, specific setups)
* **Does it need anything from monmux that does not exist yet?** If so, link the monmux issue.
* **Does this introduce any breaking changes or require migration?**

*

---

## 6. Additional context

<!-- Add any other context, links, mockups, or references that help clarify the request. -->

*

---

## 7. Optional: Pseudo-code / configuration sketch

<!-- If applicable, include a rough example of how this might look in code, config, or UI. -->

```text
# Example (replace with your own sketch)
```
