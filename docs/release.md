# Releasing

A release is a `vX.Y.Z` tag on `main` with a GitHub release that carries the packed extension,
`monmux@leinardi.github.io.shell-extension.zip`. Publishing on [extensions.gnome.org](https://extensions.gnome.org) is a separate,
manual step.

## Cutting a release

1. Dispatch the **Release** workflow (`.github/workflows/release.yaml`) from `main`. Leave the version empty to derive it from
   the Conventional Commits since the last release tag, or pass one (`1.2.0` or `v1.2.0`). Tick *dry run* first to see what it
   would do: it resolves the version and prints the plan, and changes nothing.
    - A derived version follows the bump table in [`CONTRIBUTING.md`](../CONTRIBUTING.md#branches-commits-and-pull-requests).
      With nothing but "none" commits since the last tag, the run fails with "nothing to bump".
    - **The first release needs an explicit version** (e.g. `0.1.0`): with no release tag yet there is nothing to derive from.
2. The workflow runs three jobs:
    - `guard` fails a dispatch from any other branch before anything is built;
    - `build` installs the same toolchain as CI, runs `make verify` (lint, type-check, tests, translation template, schema, and
      `ext-pack` with its bundle check), and uploads the zip;
    - `release` calls
      [`simple-tag-and-release`](https://github.com/leinardi/gh-reusable-workflows/blob/main/.github/workflows/simple-tag-and-release.md),
      which creates the release as a draft, attaches the zip, publishes it with notes listing the merged pull requests, and moves
      the `vMAJOR` and `latest` tags.

Release tags are immutable: a tag is never moved or deleted, so a fix ships as a new version.

## When something fails

Use **Re-run failed jobs**, not *Re-run all jobs*. The `release` job finishes whatever a previous attempt left behind (a draft,
missing assets, an unpublished release), and it compares the zip it attaches with one already on the release. A re-run of
`build` packs a new zip whose bytes differ (the archive records file times), and `simple-tag-and-release` refuses to replace an
attached asset with different content. A re-run of only the failed jobs reuses the zip the first `build` uploaded.

## Publishing on extensions.gnome.org

This stays manual: it needs the maintainer's login, and every upload goes through a human review there.

1. Download `monmux@leinardi.github.io.shell-extension.zip` from the GitHub release.
2. Upload it at <https://extensions.gnome.org/upload/>.
3. Wait for the review. extensions.gnome.org assigns the extension's `version` number on upload, which is why
   `src/metadata.json` carries none; do not add one.

The zip carries `schemas/*.gschema.xml` and no compiled schema, which is correct: extensions.gnome.org compiles it on upload (see
`ext-pack` in `.mk/extension.mk`).
