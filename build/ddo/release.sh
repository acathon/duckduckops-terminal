#!/usr/bin/env bash
#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------

# Publishes the GitHub release `ddo-$VERSION` if it has none yet, with the files of the
# build in the current folder and SHA256SUMS.txt, and refreshes the notes of every
# released version from CHANGELOG.md. Run by .github/workflows/release.yml on main; branch
# builds run it with a stand-in `gh` to check it.
#
#   VERSION=0.4.1 GITHUB_REPOSITORY=owner/repo GITHUB_SHA=<commit> bash build/ddo/release.sh

set -eo pipefail

versions=($(grep -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md | tr -d '#[] '))
released() { gh release view "ddo-$1" >/dev/null 2>&1; }

# The notes of a release: its CHANGELOG.md section, then the sections of the older
# versions that were merged to main together with it and have no release of their own
body() {
	node build/ddo/releaseNotes.ts "$1"
	local found=
	for w in "${versions[@]}"; do
		if [ -n "$found" ]; then
			released "$w" && break
			echo
			echo "## Also in this release, from $w"
			echo
			node build/ddo/releaseNotes.ts "$w"
		elif [ "$w" = "$1" ]; then
			found=1
		fi
	done
	echo
	echo "---"
	# The files of this release: here before it is published, on GitHub after
	# (`gh release view` fails until the release exists)
	local assets
	assets="$(ls; gh release view "ddo-$1" --json assets --jq '.assets[].name' 2>/dev/null || true)"
	if grep -q "Setup-x64-$1.exe" <<<"$assets"; then
		echo "Install: run \`DuckDuckOps-Terminal-Setup-x64-$1.exe\` from the assets (no administrator rights needed), or extract \`DuckDuckOps-Terminal-win32-x64-$1.zip\` and run \`DuckDuckOps.exe\`."
	else
		echo "Install: download \`DuckDuckOps-Terminal-win32-x64-$1.zip\` from the assets, extract it and run \`DuckDuckOps.exe\`."
	fi
	if grep -q "SystemSetup-x64-$1.exe" <<<"$assets"; then
		echo "For IT: \`DuckDuckOps-Terminal-SystemSetup-x64-$1.exe\` installs for all users in Program Files and can be deployed silently; \`SHA256SUMS.txt\` has the file hashes. See [IT deployment](https://github.com/$GITHUB_REPOSITORY/blob/main/docs/it-deployment.md)."
	fi
	echo "Every change in every version: [CHANGELOG.md](https://github.com/$GITHUB_REPOSITORY/blob/main/CHANGELOG.md)."
}

# Publish this version if it has no release yet
if ! released "$VERSION"; then
	files=(DuckDuckOps-Terminal-*-"$VERSION".*)
	sha256sum "${files[@]}" > SHA256SUMS.txt
	body "$VERSION" > release-body.md
	gh release create "ddo-$VERSION" "${files[@]}" SHA256SUMS.txt \
		--target "$GITHUB_SHA" \
		--title "ddo-$VERSION" \
		--notes-file release-body.md
fi

# Keep the notes of every released version equal to its CHANGELOG.md section(s)
# (this also fixes releases that were published with generic notes)
for v in "${versions[@]}"; do
	if released "$v"; then
		body "$v" > release-body.md
		gh release edit "ddo-$v" --title "ddo-$v" --notes-file release-body.md
	fi
done
