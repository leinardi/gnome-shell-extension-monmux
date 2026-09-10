// SPDX-License-Identifier: GPL-2.0-or-later
//
// Ambient declarations for the GJS runtime and for the modules GNOME Shell
// serves from resource:///org/gnome/shell/. Without these, `tsc --checkJs`
// cannot resolve a single `gi://` or `resource:///` import.
//
// @girs/gnome-shell is pinned to 50, not to 46, and AGENTS.md says why: the 46
// types are a generation of @girs that no longer installs alongside the current
// core packages. So a clean type-check here does not mean an API exists in
// Shell 46 — check that yourself before using one.

import '@girs/gjs';
import '@girs/gjs/dom';
import '@girs/gnome-shell/ambient';
import '@girs/gnome-shell/extensions/global';
