# lazypm

A Copilot CLI extension with two modes: fix and re-submit existing PRs, or fulfill PM content change requests from scratch.

## Usage

```
lazypm <PR URL>                  # Fix build issues, create new PR, close original
lazypm <PR URL> #sign-off        # Same + auto-merge after clean build
lazypm <PR URL> yolo             # Fix build + resolve conflicts + address review feedback
lazypm <Name>                    # PM mode: find and implement their requests
lazypm update                    # Self-update to the latest version
```

If you omit arguments, it shows usage and examples.

## Modes

### PR mode: Basic (default)
Fixes build warnings, errors, and suggestions. If the PR has merge conflicts, it stops and tells you to use yolo mode instead.

### PR mode: Yolo
Does everything basic mode does, plus:
- **Resolves merge conflicts** by cherry-picking the author's changes onto current main
- **Addresses PR review comments** (inline suggestions, requested changes, reviewer feedback)
- **Never auto-merges.** You must review and sign off manually after inspecting the changes.

### PM mode
Given a person's name, uses WorkIQ (Microsoft 365 Copilot) to find their recent content change requests, then implements them as a new PR:
- Queries direct messages first, then widens to channels if needed
- Presents findings and asks for confirmation before making changes
- Creates a branch from the latest default branch of the target repo
- Makes the requested changes, commits with attribution, and creates a PR
- Waits for a clean build, fixing any issues
- Reports the PR URL so you can send it to the PM

PM mode does not support `yolo` or `#sign-off` flags. Changes always require manual review.

## Auto-update

On startup, lazypm checks GitHub for a newer version by comparing the installed commit SHA against the latest on `main`. If an update is available, it logs a notification with the commit info and message. Run `lazypm update` to pull the latest code, copy it to the installed locations, and reload.

## What it does

### PR mode workflow
1. Reads the original PR, its build report, and checks for merge conflicts
2. Creates a new branch from main and cherry-picks the PR's commits
3. *(yolo)* Resolves any merge conflicts by applying the author's intended changes to current main
4. Fixes all build warnings/errors/suggestions (missing images, absolute links, etc.)
5. *(yolo)* Addresses PR review comments and reviewer feedback
6. Commits (crediting the original author), pushes, and creates a new PR
7. Waits for the build to pass clean
8. Closes the original PR with a link to the new one
9. *(basic only)* Optionally signs off to merge if `#sign-off` is passed

### PM mode workflow
1. Queries WorkIQ for the named person's recent messages to you
2. Identifies actionable content change requests (remove sections, update wording, etc.)
3. Presents findings and waits for your confirmation
4. Creates a branch from the target repo's latest default branch
5. Makes the requested changes with full attribution to the PM
6. Pushes, creates a PR with a detailed description
7. Waits for the build to pass clean (fixes issues if needed)
8. Reports the PR URL for you to share with the PM

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
# Fix build issues only, let me review before merging
lazypm https://github.com/yourorg/your-repo/pull/123

# Fix build issues, create clean PR, and auto-merge
lazypm https://github.com/yourorg/your-repo/pull/123 #sign-off

# Fix everything: build, conflicts, review comments (requires manual review)
lazypm https://github.com/yourorg/your-repo/pull/123 yolo

# Find and implement a PM's recent content change requests
lazypm Amir Jafari
```
