---
name: lazypm
description: "lazypm <PR URL> [yolo] [#sign-off]"
---

# LazyPM Skill

Lazy PR manager: fixes build issues on a PR, creates a clean new PR, and closes the original.
In yolo mode, also resolves merge conflicts and addresses PR review/reviewer feedback.

## Usage

When the user invokes lazypm, the extension's `onUserPromptSubmitted` hook handles the command.
The agent does not need to do anything special; just pass through the user's message.

| User says | What happens |
|---|---|
| `lazypm` | Shows usage and examples |
| `lazypm <PR URL>` | Basic: fixes build issues, creates new PR |
| `lazypm <PR URL> #sign-off` | Basic + auto-merge after clean build |
| `lazypm <PR URL> yolo #sign-off` | Yolo: fixes build + conflicts + review feedback (never auto-merges) |

## Examples

```
lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456
lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456 #sign-off
lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456 yolo #sign-off
```
