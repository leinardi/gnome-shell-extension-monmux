/*
 * This file is part of the monmux GNOME Shell extension.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * The monmux GNOME Shell extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * The monmux GNOME Shell extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

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
