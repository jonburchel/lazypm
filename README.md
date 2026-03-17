# lazypm

A Copilot CLI extension that automates the "fix a PR's build issues and/or merge conflicts, then re-submit" workflow.

## Usage

```
lazypm <PR URL>              # Fix build, create new PR, close original (no merge)
lazypm <PR URL> #sign-off    # Same as above, plus auto-merge via #sign-off comment
```

If you omit the PR URL, it shows usage and examples.

## What it does

1. Reads the original PR, its build report, and checks for merge conflicts
2. Creates a new branch from main and cherry-picks the PR's commits
3. Resolves any merge conflicts by applying the author's intended changes to current main
4. Fixes all build warnings/errors/suggestions (missing images, absolute links, etc.)
5. Commits (crediting the original author), pushes, and creates a new PR
6. Waits for the build to pass clean
7. Closes the original PR with a link to the new one
8. Optionally signs off to merge (only if `#sign-off` is passed)

## Installation

Copy the extension and skill files to these locations:

```
~/.copilot/extensions/lazypm/extension.mjs   # Extension (required)
~/.copilot/skills/lazypm/SKILL.md            # Skill definition (for /lazypm slash command)
```

Or for a single project, put the extension in `.github/extensions/lazypm/`.

The CLI auto-discovers extensions on startup. Run `/clear` to reload after installing.

## Examples

```
# Fix build issues, create clean PR, let me review before merging
lazypm https://github.com/yourorg/your-repo/pull/123

# Fix build issues, create clean PR, and auto-merge
lazypm https://github.com/yourorg/your-repo/pull/123 #sign-off
```
