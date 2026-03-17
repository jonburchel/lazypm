---
name: lazypm
description: "lazypm <PR URL> [#sign-off]"
---

# LazyPM Skill

Lazy PR manager: pulls a PR, fixes build warnings/errors/suggestions
and/or merge conflicts, creates a new clean PR, closes the original, and signs off.

## Usage

When the user invokes lazypm, the extension's `onUserPromptSubmitted` hook handles the command.
The agent does not need to do anything special; just pass through the user's message.

| User says | What happens |
|---|---|
| `lazypm` | Shows usage and examples |
| `lazypm <PR URL>` | Processes the PR: fixes build issues and conflicts, creates new PR |
| `lazypm <PR URL> #sign-off` | Same as above, but auto-merges if no conflicts were resolved |

## Examples

```
lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456
lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456 #sign-off
```
