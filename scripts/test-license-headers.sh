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
# Tests scripts/check-license-headers.sh offline, in a scratch repository: the
# check must pass on a tree whose governed files carry the GPL-2.0-or-later
# header, and fail, naming the file, on each way a header can be missing or
# wrong.
#
# check() takes each condition as a single-quoted string and evals it when the
# check runs, so the expansions inside are meant to be deferred (SC2016), and
# the linter cannot see that STATUS, read only inside them, is used (SC2034).
# shellcheck disable=SC2016,SC2034

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SCRIPT="$ROOT/scripts/check-license-headers.sh"

# A git hook exports GIT_DIR, GIT_INDEX_FILE and friends; the scratch repository
# must not inherit them, or `git add` below would write into the real index.
while IFS= read -r var; do
	unset "$var"
done < <(env | sed -n 's/^\(GIT_[A-Z_]*\)=.*/\1/p')

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

R="$WORK/repo"
mkdir -p "$R/scripts" "$R/.mk" "$R/src" "$R/tests/bin" "$R/po"
git init -q "$R"
cp "$SCRIPT" "$R/scripts/check-license-headers.sh"

# The header as the shell files carry it (lines 2-18 of the checker), with the
# year of the file under test, and the same notice as the JavaScript files carry
# it, in a block comment.
header() { sed -n '2,18p' "$SCRIPT" | sed "s/Copyright (c) [0-9-]* /Copyright (c) $1 /"; }
js_header() { printf '/*\n'; header "$1" | sed 's/^#/ */'; printf ' */\n'; }

printf 'MK_COMMON_FILES := help.mk\nMK_LOCAL_FILES := local.mk\n' >"$R/Makefile.body"
{ header 2026; printf '\n'; cat "$R/Makefile.body"; } >"$R/Makefile"
rm "$R/Makefile.body"
{ header 2025-2026; printf '\nifndef X\nendif\n'; } >"$R/.mk/local.mk"
{ js_header 2026; printf '\nexport const x = 1;\n'; } >"$R/src/a.js"
{ js_header 2026; printf '\nexport {};\n'; } >"$R/ambient.d.ts"
{ printf '#!/usr/bin/env bash\n'; header 2026; printf '\nexit 0\n'; } >"$R/tests/bin/fake"
# make-common's files carry its MIT header, not this one.
printf 'ifndef HELP\nendif\n' >"$R/.mk/help.mk"
printf '#!/usr/bin/env bash\n' >"$R/scripts/bootstrap-mk-common.sh"
# Not code: never governed.
printf 'msgid ""\n' >"$R/po/x.pot"
printf '{}\n' >"$R/src/metadata.json"
printf 'key: value\n' >"$R/config.yaml"
printf '# Title\n' >"$R/README.md"
printf 'en\n' >"$R/po/LINGUAS"
git -C "$R" add -A

PASS=0
FAIL=0
run() {
	STATUS=0
	(cd "$R" && scripts/check-license-headers.sh) >"$WORK/out" 2>&1 || STATUS=$?
}
check() {
	if eval "$2"; then
		PASS=$((PASS + 1))
		echo "ok   - $1"
	else
		FAIL=$((FAIL + 1))
		echo "FAIL - $1"
		while IFS= read -r line; do printf '       %s\n' "$line"; done <"$WORK/out"
	fi
}
# Adds a tracked file, runs the check, and removes the file again.
with_file() {
	printf '%s' "$2" >"$R/$1"
	git -C "$R" add -- "$1"
	run
	git -C "$R" rm -q --cached -- "$1"
	rm -f -- "$R/$1"
}

run
check "a tree with every header passes (make-common files, po/, JSON, YAML and Markdown are not governed)" \
	'[ "$STATUS" -eq 0 ] && grep -q "6 files checked" "$WORK/out"'

with_file .mk/bare.mk $'ifndef X\nendif\n'
check "a repo-local snippet without a header fails and is named" '[ "$STATUS" -eq 1 ] && grep -qx "  .mk/bare.mk" "$WORK/out"'

with_file src/bare.js $'export const y = 2;\n'
check "a JavaScript file without a header fails" '[ "$STATUS" -eq 1 ] && grep -qx "  src/bare.js" "$WORK/out"'

with_file src/spdx.js $'// SPDX-License-Identifier: GPL-2.0-or-later\nexport const y = 2;\n'
check "an SPDX line alone is not the header" '[ "$STATUS" -eq 1 ] && grep -qx "  src/spdx.js" "$WORK/out"'

with_file tests/bin/bare $'#!/bin/sh\nexit 0\n'
check "an extensionless #! script without a header fails" '[ "$STATUS" -eq 1 ] && grep -qx "  tests/bin/bare" "$WORK/out"'

with_file src/other.js "$(js_header 2026 | sed 's/Roberto Leinardi/Someone Else/')"
check "a header with another copyright holder fails" '[ "$STATUS" -eq 1 ] && grep -qx "  src/other.js" "$WORK/out"'

with_file src/gpl3.js "$(js_header 2026 | sed 's/either version 2 of/either version 3 of/')"
check "a GPL-3.0-or-later header fails" '[ "$STATUS" -eq 1 ] && grep -qx "  src/gpl3.js" "$WORK/out"'

with_file src/only.js "$(js_header 2026 | grep -v 'at your option')"
check "a GPL-2.0-only header (no later-version grant) fails" '[ "$STATUS" -eq 1 ] && grep -qx "  src/only.js" "$WORK/out"'

with_file scripts/late.sh "$(printf '#!/usr/bin/env bash\n'; for _ in $(seq 1 25); do echo "#"; done; header 2026)"
check "a header below the first 25 lines fails" '[ "$STATUS" -eq 1 ] && grep -qx "  scripts/late.sh" "$WORK/out"'

with_file NOTES $'plain text, no shebang\n'
check "an extensionless file without #! is not governed" '[ "$STATUS" -eq 0 ]'

printf 'echo untracked\n' >"$R/scripts/untracked.sh"
run
check "an untracked file is not checked" '[ "$STATUS" -eq 0 ]'
rm -f "$R/scripts/untracked.sh"

rm -f "$R/src/a.js"
run
check "a tracked file deleted in the working tree is skipped" '[ "$STATUS" -eq 0 ]'

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
