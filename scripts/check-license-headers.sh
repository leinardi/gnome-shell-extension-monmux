#!/usr/bin/env bash
#
# This file is part of the monmux GNOME Shell extension.
#
# Copyright (c) 2026 Roberto Leinardi
#
# The monmux GNOME Shell extension is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 2 of the License, or
# (at your option) any later version.
#
# The monmux GNOME Shell extension is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
# Licence header checker.
#
# The extension is GPL-2.0-or-later, the licence extensions.gnome.org expects, and every source
# file says so in its own header: the notice in .idea/copyright/GPL_2_0_or_later.xml. This fails
# on any tracked source file whose first lines do not carry that notice with the "either version 2
# of the License, or (at your option) any later version" grant, so a header copied from a
# GPL-2.0-only or GPL-3.0 project, or from another project altogether, is caught as surely as a
# missing one. The comment syntax is the file's own (/* */ in JavaScript and TypeScript, # in shell
# and make); only the wording is checked.
#
# Governed: JavaScript and TypeScript, shell scripts (by extension, or by a #! line on a file with
# none, like tests/bin/monmux), the Makefile and the repo-local .mk fragments. Exempt: the
# make-common files the bootstrap fetches (make-common's, under its MIT licence: the snippets
# named in the Makefile's MK_COMMON_FILES, and scripts/bootstrap-mk-common.sh). The translation
# template and translations under po/ are generated and are not code, and neither is any YAML,
# JSON or Markdown, so none of them is governed.

set -euo pipefail

usage() {
	cat <<'USAGE'
Usage: scripts/check-license-headers.sh

Checks every tracked source file for the GPL-2.0-or-later header and lists the files that lack
it. Run from anywhere inside the repository.
USAGE
}

if [[ $# -gt 0 ]]; then
	usage >&2
	exit 2
fi

cd "$(git rev-parse --show-toplevel)"

# How many leading lines the header must sit in: a shebang and a comment opener precede it.
HEADER_WINDOW=25

REQUIRED_LINES=(
	"This file is part of the monmux GNOME Shell extension."
	"The monmux GNOME Shell extension is free software: you can redistribute it and/or modify"
	"it under the terms of the GNU General Public License as published by"
	"the Free Software Foundation, either version 2 of the License, or"
	"(at your option) any later version."
)
# The year is the file's first commit; a range (2026-2027) is allowed too.
COPYRIGHT_RE='Copyright \(c\) [0-9]{4}(-[0-9]{4})? Roberto Leinardi$'

# make-common's files, not this repository's.
EXEMPT_PATHS=(
	"scripts/bootstrap-mk-common.sh"
)

# The shared make fragments, read from the Makefile so the list cannot drift from what the
# bootstrap actually fetches.
mk_common_files() {
	sed -n 's/^MK_COMMON_FILES[[:space:]]*:=[[:space:]]*//p' Makefile
}

is_governed() {
	local path="$1" base
	base="${path##*/}"

	case "${path}" in
	*.js | *.mjs | *.cjs | *.ts | *.mts | *.cts | *.sh | .mk/*.mk)
		return 0
		;;
	esac

	case "${base}" in
	Makefile)
		return 0
		;;
	*.*)
		return 1
		;;
	esac

	# A file with no extension is a script when it starts with #!.
	[[ "$(head -c 2 -- "${path}")" == "#!" ]]
}

is_exempt() {
	local path="$1" entry

	for entry in "${EXEMPT_PATHS[@]}"; do
		if [[ ${path} == "${entry}" ]]; then
			return 0
		fi
	done

	for entry in ${COMMON_FILES}; do
		if [[ ${path} == ".mk/${entry}" ]]; then
			return 0
		fi
	done

	return 1
}

has_header() {
	local path="$1" head line
	head="$(head -n "${HEADER_WINDOW}" -- "${path}")"

	for line in "${REQUIRED_LINES[@]}"; do
		if ! grep -qF -- "${line}" <<<"${head}"; then
			return 1
		fi
	done

	grep -qE -- "${COPYRIGHT_RE}" <<<"${head}"
}

COMMON_FILES="$(mk_common_files)"
if [[ -z ${COMMON_FILES} ]]; then
	echo "Could not read MK_COMMON_FILES from the Makefile." >&2
	exit 1
fi

missing=()
checked=0

while IFS= read -r -d '' path; do
	# A tracked file deleted in the working tree, or a symlink to a directory (.claude/skills), is
	# not this check's concern.
	if [[ ! -f ${path} ]]; then
		continue
	fi

	if ! is_governed "${path}" || is_exempt "${path}"; then
		continue
	fi

	checked=$((checked + 1))

	if ! has_header "${path}"; then
		missing+=("${path}")
	fi
done < <(git ls-files -z)

if [[ ${#missing[@]} -gt 0 ]]; then
	echo "These files lack the GPL-2.0-or-later header:" >&2
	printf '  %s\n' "${missing[@]}" >&2
	echo "Copy the header from any file in src/ (IntelliJ: the \"GPL 2.0 or later\" copyright" >&2
	echo "profile), with the year of the file's first commit." >&2
	exit 1
fi

echo "License headers: ${checked} files checked, all carry the GPL-2.0-or-later header."
