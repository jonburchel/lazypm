---
name: lazypm
description: "lazypm <PR URL> [yolo] [#sign-off] | lazypm <Name> | lazypm update"
---

# LazyPM Skill

Two modes of operation:
1. **PR mode**: Fixes build issues on an existing PR, creates a clean new PR, and closes the original. In yolo mode, also resolves merge conflicts and addresses PR review/reviewer feedback.
2. **PM mode**: Given a PM's name, queries WorkIQ for their recent content change requests, then implements them as a new PR.

## Usage

When the user invokes lazypm, the extension's `onUserPromptSubmitted` hook handles the command.
The agent does not need to do anything special; just pass through the user's message.

| User says | What happens |
|---|---|
| `lazypm` | Shows usage and examples |
| `lazypm <PR URL>` | PR mode (basic): fixes build issues, creates new PR |
| `lazypm <PR URL> #sign-off` | PR mode (basic) + auto-merge after clean build |
| `lazypm <PR URL> yolo` | PR mode (yolo): fixes build + conflicts + review feedback (never auto-merges) |
| `lazypm <Name>` | PM mode: finds PM's requests via WorkIQ, implements as a new PR |
| `lazypm update` | Self-update: pulls the latest version from GitHub |

## Auto-update

On startup, lazypm checks GitHub for a newer version. If one is found, it logs a notification with the commit info. Run `lazypm update` to install it.

## Examples

```
lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456
lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456 #sign-off
lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456 yolo
lazypm Amir Jafari
lazypm Sarah
```
