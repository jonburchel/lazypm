# lazypm

A Copilot CLI extension that automates the "fix a PR's build issues and/or merge conflicts, then re-submit" workflow.

## Usage

```
lazypm <PR URL>                  # Fix build issues, create new PR, close original
lazypm <PR URL> #sign-off        # Same + auto-merge after clean build
lazypm <PR URL> yolo #sign-off   # Fix build + resolve conflicts + address review feedback
```

If you omit the PR URL, it shows usage and examples.

## Modes

### Basic mode (default)
Fixes build warnings, errors, and suggestions. If the PR has merge conflicts, it stops and tells you to use yolo mode instead.

### Yolo mode
Does everything basic mode does, plus:
- **Resolves merge conflicts** by cherry-picking the author's changes onto current main
- **Addresses PR review comments** (inline suggestions, requested changes, reviewer feedback)
- **Never auto-merges**, even though `#sign-off` is required in the command. The `#sign-off` keyword serves as an acknowledgment that you understand yolo mode makes judgment calls on conflicts and review feedback. You must review and sign off manually.

## What it does

1. Reads the original PR, its build report, and checks for merge conflicts
2. Creates a new branch from main and cherry-picks the PR's commits
3. *(yolo)* Resolves any merge conflicts by applying the author's intended changes to current main
4. Fixes all build warnings/errors/suggestions (missing images, absolute links, etc.)
5. *(yolo)* Addresses PR review comments and reviewer feedback
6. Commits (crediting the original author), pushes, and creates a new PR
7. Waits for the build to pass clean
8. Closes the original PR with a link to the new one
9. *(basic only)* Optionally signs off to merge if `#sign-off` is passed

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
lazypm https://github.com/yourorg/your-repo/pull/123 yolo #sign-off
```
