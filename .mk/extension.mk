ifndef MK_LOCAL_EXTENSION_INCLUDED
MK_LOCAL_EXTENSION_INCLUDED := 1

# Repo-local targets for a GNOME Shell extension.
#
# Every check runs through an npm script rather than through the tool directly,
# so the IDE, the pre-commit hooks, these targets and CI all run the same
# command with the same arguments. When a check changes, it changes in
# package.json and everything follows.
#
# No target here runs the real monmux. `ext-nested` puts tests/bin first on PATH,
# which is what makes it safe for an agent to start: a click inside that Shell
# reaches the fake, never a monitor. A nested session against the real binary is
# a command a human types, documented in docs/testing.md.

EXT_UUID  ?= monmux@leinardi.github.io
EXT_SRC   ?= src
DIST_DIR  ?= dist
EXT_ZIP   := $(DIST_DIR)/$(EXT_UUID).shell-extension.zip
EXT_INSTALL_DIR := $(or $(XDG_DATA_HOME),$(HOME)/.local/share)/gnome-shell/extensions/$(EXT_UUID)
PO_DIR    ?= po
POT_FILE  := $(PO_DIR)/gnome-shell-extension-monmux.pot

.PHONY: ext-deps
ext-deps: ## Install the node toolchain from package-lock.json
	@npm ci

.PHONY: ext-lint
ext-lint: ## Run ESLint over the JavaScript
	@npm run lint

.PHONY: ext-lint-fix
ext-lint-fix: ## Run ESLint with --fix
	@npm run lint:fix

.PHONY: ext-typecheck
ext-typecheck: ## Type-check the JavaScript with tsc --checkJs
	@npm run typecheck

.PHONY: ext-test
ext-test: ## Run the gjs test suite against the fake monmux
	@npm run test

.PHONY: ext-schemas
ext-schemas: ## Compile the GSettings schema
	@glib-compile-schemas --strict $(EXT_SRC)/schemas

.PHONY: ext-pot
ext-pot: ## Regenerate the translation template
	@mkdir -p $(PO_DIR)
	@xgettext --from-code=UTF-8 \
	  --add-comments=Translators \
	  --keyword=_ --keyword=C_:1c,2 --keyword=N_ --keyword=ngettext:1,2 \
	  --package-name=gnome-shell-extension-monmux \
	  --copyright-holder="Roberto Leinardi" \
	  --output=$(POT_FILE) \
	  $$(find $(EXT_SRC) -name '*.js' | sort)

# The zip carries schemas/*.gschema.xml and no schemas/gschemas.compiled, and
# that is correct: `gnome-extensions pack` never puts one in — not even with
# --schema= — because whoever installs the bundle compiles it. `gnome-extensions
# install` runs `glib-compile-schemas --strict` over the extracted tree, and
# extensions.gnome.org does the same on upload. Every extension installed on this
# machine shows the pair, XML plus compiled, in its schemas/ directory.
#
# So do not "fix" this by adding a compiled blob to the bundle: it would be a
# binary in a source zip that e.g.o reviewers read, and it would go stale against
# the XML next to it. ext-install asserts the compile actually happened instead.
.PHONY: ext-pack
ext-pack: ext-schemas ## Build dist/<uuid>.shell-extension.zip
	@mkdir -p $(DIST_DIR)
	@gnome-extensions pack $(EXT_SRC) \
	  --extra-source=lib \
	  $(if $(wildcard $(PO_DIR)),--podir=../$(PO_DIR),) \
	  --force \
	  --out-dir=$(DIST_DIR)
	@node scripts/check-bundle.js $(EXT_ZIP)

.PHONY: ext-install
ext-install: ## Install the packed zip into the current user's session
	@gnome-extensions install --force $(EXT_ZIP)
	@if [ ! -f "$(EXT_INSTALL_DIR)/schemas/gschemas.compiled" ]; then \
	  echo "ext-install: $(EXT_INSTALL_DIR)/schemas/gschemas.compiled is missing."; \
	  echo "ext-install: the installer did not compile the schema, so getSettings() will fail."; \
	  echo "ext-install: compile it by hand with: glib-compile-schemas $(EXT_INSTALL_DIR)/schemas"; \
	  exit 1; \
	fi
	@echo ""
	@echo "Installed $(EXT_UUID)."
	@echo "GNOME Shell only picks up a new or changed extension after a restart:"
	@echo "  Wayland: log out and back in."
	@echo "  X11:     Alt+F2, then 'r'."
	@echo "Then: gnome-extensions enable $(EXT_UUID)"

# G_MESSAGES_DEBUG names two log domains rather than `all`. `all` turns on
# debug-level output for every library in the process, and dconf alone then
# prints a watch/unwatch line per settings path per extension - hundreds of them
# around startup and teardown, which is exactly when this session is worth
# reading. The warnings this target exists to surface are not debug-level and
# print either way; naming the domains only adds this extension's own
# console.debug() back. Override it when you need somebody else's library:
# make ext-nested G_MESSAGES_DEBUG=all
G_MESSAGES_DEBUG ?= GNOME Shell Gjs

.PHONY: ext-nested
ext-nested: ## Start a nested GNOME Shell that can only see the fake monmux
	@PATH="$(REPO_ROOT)/tests/bin:$$PATH" \
	  G_MESSAGES_DEBUG="$(G_MESSAGES_DEBUG)" \
	  dbus-run-session -- gnome-shell --devkit --wayland

.PHONY: ext-logs
ext-logs: ## Follow the GNOME Shell log
	@journalctl -f -o cat /usr/bin/gnome-shell

.PHONY: verify
verify: ext-lint ext-typecheck ext-test ext-schemas ext-pack ## Everything CI runs, in one target

endif  # MK_LOCAL_EXTENSION_INCLUDED
