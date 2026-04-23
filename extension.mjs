// Extension: lazypm
// Lazy PR manager with two modes:
// 1. PR mode: pulls a PR, fixes build warnings/errors/suggestions,
//    and optionally resolves merge conflicts, PR review comments, and
//    reviewer feedback (yolo mode). Creates a new clean PR and closes the original.
// 2. PM mode: given a person's name, queries WorkIQ for their recent content
//    change requests, then creates a PR implementing those changes.

import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

const PR_URL_PATTERN = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/i;
const FLAGS = /\b(yolo|#sign-off)\b/gi;

/**
 * Check if a GitHub repo is private. Returns true if private, false if public.
 * Returns null if the check fails (treat as unsafe / block).
 */
async function isRepoPrivate(owner, repo) {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const headers = { "Accept": "application/vnd.github.v3+json", "User-Agent": "lazypm-extension" };
    if (token) headers["Authorization"] = `token ${token}`;

    try {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
        if (!res.ok) return null;
        const data = await res.json();
        return data.private === true;
    } catch {
        return null;
    }
}

// Auto-update paths (derived from this file's location)
const __filename = fileURLToPath(import.meta.url);
const EXTENSION_DIR = dirname(__filename);
const COPILOT_DIR = join(EXTENSION_DIR, "..", "..");
const SKILL_DIR = join(COPILOT_DIR, "skills", "lazypm");
const VERSION_FILE = join(EXTENSION_DIR, ".version");
const REPO_OWNER = "jonburchel";
const REPO_NAME = "lazypm";
const REPO_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/main`;
const REPO_DIR = "F:\\home\\lazypm";

/**
 * Check for a newer version on GitHub. Notifies the user if one is found.
 * Runs fire-and-forget at startup; never blocks or throws.
 */
async function checkForUpdates(session) {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const headers = { "Accept": "application/vnd.github.v3+json", "User-Agent": "lazypm-extension" };
    if (token) headers["Authorization"] = `token ${token}`;

    const res = await fetch(REPO_API_URL, { headers });
    if (!res.ok) return;
    const data = await res.json();
    const remoteSha = data.sha;

    let localSha = "";
    try {
        localSha = (await readFile(VERSION_FILE, "utf-8")).trim();
    } catch {
        // No version file yet (first load). Seed it with the current remote SHA.
        await writeFile(VERSION_FILE, remoteSha, "utf-8");
        return;
    }

    if (remoteSha !== localSha) {
        const shortSha = remoteSha.slice(0, 7);
        const commitMsg = (data.commit?.message || "").split("\n")[0];
        await session.log(`⚡ lazypm update available (${shortSha}: ${commitMsg}). Run "lazypm update" to install.`);
    }
}

const SAFETY_PREAMBLE = `
## CRITICAL SAFETY RULE — PRIVATE REPOS ONLY

**NEVER push to, create PRs in, or modify public GitHub repositories.**

Before pushing or creating a PR, verify the target repo is private:
\`gh api repos/{owner}/{repo} --jq .private\`

If the result is NOT "true", STOP immediately and tell the user.
This is a hard safety gate. No exceptions.
`;

const BASIC_WORKFLOW = `
You are executing the **lazypm** workflow in **basic mode**. Follow these steps precisely:

${SAFETY_PREAMBLE}

## Step 1: Read the original PR
- Use the GitHub MCP tools to get the PR details, changed files, diff, and build comments.
- Check the PR's \`mergeable_state\` to determine if there are merge conflicts.
- Identify the build report comment from "learn-build-service-prod[bot]" that contains warnings, errors, or suggestions (if any).
- Parse ALL issues from the build report (file-not-found, docs-link-absolute, etc.).
- **If there are merge conflicts**, stop and tell the user: "This PR has merge conflicts. Use \`lazypm <URL> yolo\` to resolve conflicts, address review comments, and fix build issues."

## Step 2: Create a new branch and apply changes
- Check F:\\git and F:\\home for an existing clone of the target repo. Use an existing clone if found; only clone fresh if neither location has one.
- Fetch the latest main and create a new branch named "fix/<descriptive-name>" from origin/main.
- Fetch the PR author's fork/branch and cherry-pick their commit(s) with --no-commit.
- **If cherry-pick has conflicts**, stop and tell the user to use yolo mode. Do NOT attempt to resolve conflicts in basic mode.

## Step 3: Fix all build issues
If the build report from Step 1 contained warnings, errors, or suggestions, fix them now.
For each issue found:
- **file-not-found** (missing images): Comment out the image reference using HTML comments (<!-- ... -->).
- **docs-link-absolute** (absolute learn.microsoft.com links): Convert to relative links by removing "https://learn.microsoft.com" prefix, keeping the path starting with /.
- **Other warnings/errors**: Apply the appropriate fix based on the validation documentation linked in the build report.
If there were no build issues, skip this step.

## Step 4: Commit and push
- Stage and commit with a descriptive message that credits the original PR author as Co-authored-by.
- Push to the upstream repo (MicrosoftDocs or whichever org the original PR targets).

## Step 5: Create the new PR
- Create a PR targeting the same base branch as the original.
- In the body, describe the original changes AND any build fixes applied.
- Reference the original PR number with "Supersedes #NNNN".
- Credit the original author as Co-authored-by in the body.

## Step 6: Wait for build
- Wait 3 minutes, then check the PR comments for the build report.
- If the build passes clean (no warnings, errors, or suggestions), proceed to Step 7.
- If issues remain, fix them and force-push. Repeat until clean.

## Step 7: Close original PR and finalize
- Close the original PR with a comment explaining it was superseded by the new PR.
- Remove the "do-not-merge" label from the new PR if present.
- **If the user passed #sign-off**: Add a "#sign-off" comment on the new PR to merge it.
- **If #sign-off was NOT passed**: Do NOT add a sign-off comment. Just share the new PR link and let the user know they can sign off manually when ready.
- Share the new PR link with the user.

## Step 8: Clean up
- Remove any temporary git remotes added.
- Switch back to the main branch locally.
`;

const YOLO_WORKFLOW = `
You are executing the **lazypm** workflow in **yolo mode**. This mode handles everything: build fixes, merge conflicts, AND PR review/reviewer feedback. Follow these steps precisely:

${SAFETY_PREAMBLE}

## Step 1: Read the original PR
- Use the GitHub MCP tools to get the PR details, changed files, diff, and build comments.
- Check the PR's \`mergeable_state\` to determine if there are merge conflicts.
- Identify the build report comment from "learn-build-service-prod[bot]" that contains warnings, errors, or suggestions (if any).
- Parse ALL issues from the build report (file-not-found, docs-link-absolute, etc.).
- **Get all PR review comments and reviewer comments.** Use get_review_comments to get inline review threads, and get_comments for general conversation comments. Focus on comments from human reviewers (not bots). Identify actionable feedback: requested changes, suggestions, questions that imply changes needed.

## Step 2: Create a new branch and apply changes
- Check F:\\git and F:\\home for an existing clone of the target repo. Use an existing clone if found; only clone fresh if neither location has one.
- Fetch the latest main and create a new branch named "fix/<descriptive-name>" from origin/main.
- Fetch the PR author's fork/branch and cherry-pick their commit(s) with --no-commit.
- **If cherry-pick has conflicts:** Resolve them (see Step 2a). If cherry-pick applies cleanly, skip to Step 3.

### Step 2a: Resolve merge conflicts
When cherry-pick produces conflicts:
1. Run \`git diff --name-only --diff-filter=U\` to list conflicted files.
2. For each conflicted file, open it and look for conflict markers (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`).
3. Use the PR diff (from Step 1) to understand the author's **intent**, i.e. what they were trying to change.
4. Compare the author's intended changes against the current state of the file on main.
5. Resolve each conflict using this principle: **favor main by default.** Changes that landed on main after the PR was opened should be preserved. Only override main's content when the original PR commits explicitly changed that specific text. In other words, only apply the author's changes to lines they actually modified; keep everything else as main has it. Do NOT revert upstream changes that the author never touched.
6. After resolving, run \`git add <file>\` for each resolved file.
7. Verify no conflict markers remain: \`git grep -rn "<<<<<<< " -- "*.md"\` (should return nothing).

## Step 3: Fix all build issues
If the build report from Step 1 contained warnings, errors, or suggestions, fix them now.
For each issue found:
- **file-not-found** (missing images): Comment out the image reference using HTML comments (<!-- ... -->).
- **docs-link-absolute** (absolute learn.microsoft.com links): Convert to relative links by removing "https://learn.microsoft.com" prefix, keeping the path starting with /.
- **Other warnings/errors**: Apply the appropriate fix based on the validation documentation linked in the build report.
If there were no build issues, skip this step.

## Step 4: Address PR review feedback
Review ALL comments collected in Step 1 and address each one:
- **Inline code suggestions**: Apply the suggested change if it's reasonable and consistent with the PR's intent.
- **Requested changes**: Implement the requested modifications.
- **Questions from reviewers**: If the question implies a change is needed (e.g., "Should this be X instead?"), make the change. If it's a genuine question about intent, note it for the PR description.
- **Style/formatting feedback**: Apply it.
- **Conflicting feedback**: Use your best judgment; favor the most recent or most senior reviewer's guidance. Note any unresolved conflicts in the PR description.

For each comment addressed, track what was done so it can be documented in the new PR body.

## Step 5: Commit and push
- Stage and commit with a descriptive message that credits the original PR author as Co-authored-by.
- Mention in the commit message what was resolved: conflicts, build fixes, review feedback, or all of the above.
- Push to the upstream repo (MicrosoftDocs or whichever org the original PR targets).

## Step 6: Create the new PR
- Create a PR targeting the same base branch as the original.
- In the body, describe the original changes AND all fixes applied:
  - Build fixes (if any)
  - Merge conflict resolutions (if any)
  - Review feedback addressed (list each comment and how it was resolved)
- Reference the original PR number with "Supersedes #NNNN".
- Credit the original author as Co-authored-by in the body.

## Step 7: Wait for build
- Wait 3 minutes, then check the PR comments for the build report.
- If the build passes clean (no warnings, errors, or suggestions), proceed to Step 8.
- If issues remain, fix them and force-push. Repeat until clean.

## Step 8: Close original PR and finalize
- Close the original PR with a comment explaining it was superseded by the new PR, summarizing what was fixed.
- Remove the "do-not-merge" label from the new PR if present.
- **Yolo mode NEVER auto-signs-off.** Conflict resolutions and review feedback changes always require human review. Do NOT add a "#sign-off" comment regardless of flags.
- Share the new PR link and tell the user to review the changes before signing off manually.

## Step 9: Clean up
- Remove any temporary git remotes added.
- Switch back to the main branch locally.
`;

const PM_WORKFLOW = `
You are executing the **lazypm** workflow in **PM mode**. A person's name has been provided.
Your job is to find their recent content change requests and implement them as a PR.

${SAFETY_PREAMBLE}

**This is a two-phase workflow. You MUST stop after Phase 1 and wait for user confirmation before proceeding to Phase 2. Do NOT skip the confirmation step.**

---

## Phase 1: Discover and Confirm

### Step 1: Query WorkIQ for the PM's requests
Use the \`workiq-ask_work_iq\` tool to search for recent messages from this person.

**First query** (direct messages): Ask WorkIQ something like:
"What did [Name] ask me or discuss with me today? Show me the full conversation and any specific requests they made about content changes, documentation updates, or edits."

**Second query** (only if the first returned nothing actionable): Widen the search:
"Did [Name] send any messages in channels or group chats today that mentioned documentation changes, content updates, or requests for edits? Include any messages where they asked someone to make changes to docs or articles."

Focus on **actionable content change requests**: remove a section, change wording, remove preview terminology, update a prerequisite, fix a description, etc.

### Step 2: Present findings and STOP
Present what you found to the user:
- Quote the specific requests with context
- Identify which files/pages/repos are affected (from URLs, page titles, or file references in the conversation)
- List each discrete change to be made

**You MUST use the ask_user tool here to get explicit confirmation before proceeding.**
Ask the user to confirm:
1. Are these the right changes?
2. Which repo should be targeted? (If you can confidently infer from URLs or file paths mentioned, suggest it, but still confirm.)

**DO NOT proceed to Phase 2 until the user confirms. This is a hard gate.**

---

## Phase 2: Implement (only after user confirmation)

### Step 3: Set up the branch
- Check F:\\git and F:\\home for an existing clone of the target repo. Use an existing clone if found; only clone fresh if neither location has one.
- Fetch the latest from upstream (the org repo, e.g. MicrosoftDocs). Identify the repo's **default branch** (do not assume "main"; check via \`git remote show upstream\` or \`git remote show origin\`, or GitHub API).
- Create a new branch from the latest default branch. Name it descriptively based on the changes (e.g., "remove-xmla-prereq", "update-preview-terminology").

### Step 4: Make the requested changes
- Read the files that need to be modified.
- Apply each change the PM requested. Be precise and surgical.
- If removing a section that contains image references, also delete the orphaned image files.
- If the changes affect shared includes (files in an \`includes/\` directory), understand the blast radius: those changes affect all pages that reference the include.
- Update \`ms.date\` in YAML front matter of changed files to today's date (MM/DD/YYYY format).
- If a page's \`description\` metadata references content that was removed, update it too.

### Step 5: Commit and push
- Stage only the files you changed (plus any deleted images).
- Commit with a clear message describing what was changed and why.
- Include the trailer: \`Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>\`
- Push the branch.

### Step 6: Create the PR
- Create a PR against the default branch of the upstream repo.
- Title: a concise description of the changes.
- Body should include:
  - **Summary**: What changes were made and why
  - **Attribution**: "Per [PM Name]'s request" with context on what they asked for
  - **Changes**: A bulleted list of each specific change made
  - **Impact**: Note any cross-cutting effects (shared includes, etc.)

### Step 7: Wait for build and fix issues
- Wait 3 minutes, then check the PR for build report comments.
- If the build has warnings, errors, or suggestions, fix them and force-push. Repeat until the build is clean.
- If a build issue cannot be fixed, tell the user.

### Step 8: Report to the user
- Share the PR URL.
- Summarize what was done.
- Suggest the user send the PR link to the PM for review/approval.
- Note: PM mode never auto-merges. The user must review and sign off manually.

### Step 9: Clean up
- Remove any temporary git remotes added.
- Switch back to the default branch locally.
`;

const UPDATE_WORKFLOW = `
You are executing the **lazypm update** workflow. Pull the latest version from GitHub and update the installed extension files.

## Steps

1. Navigate to the lazypm repo at ${REPO_DIR.replace(/\\/g, "\\\\")}.
   - If the directory does not exist, clone the repo first:
     \`git clone https://github.com/${REPO_OWNER}/${REPO_NAME}.git "${REPO_DIR.replace(/\\/g, "\\\\")}"\`
   - If it exists, run \`git pull origin main\` to get the latest.

2. Copy the updated files to the installed locations:
   - \`extension.mjs\` and \`README.md\` to: \`${EXTENSION_DIR.replace(/\\/g, "\\\\")}\`
   - \`SKILL.md\` to: \`${SKILL_DIR.replace(/\\/g, "\\\\")}\`

3. Get the current HEAD commit SHA: \`git rev-parse HEAD\`
   Write that SHA (and nothing else) to: \`${VERSION_FILE.replace(/\\/g, "\\\\")}\`

4. Reload extensions using the \`extensions_reload\` tool.

5. Confirm to the user that lazypm has been updated, showing the new commit SHA and message.
`;

const USAGE_TEXT = [
    "lazypm: Lazy PR manager. Two modes of operation:",
    "",
    "  PR mode:  Fix build issues on an existing PR, create a clean new PR,",
    "            close the original. Yolo mode also resolves merge conflicts",
    "            and addresses PR review/reviewer comments.",
    "",
    "  PM mode:  Given a PM's name, find their recent content change requests",
    "            via WorkIQ and implement them as a new PR.",
    "",
    "Usage:",
    "  lazypm <PR URL>                  Fix build issues, create new PR",
    "  lazypm <PR URL> #sign-off        Same + auto-merge after clean build",
    "  lazypm <PR URL> yolo             Fix build + conflicts + review feedback",
    "                                   (never auto-merges; human review required)",
    "  lazypm <Name>                    PM mode: find and implement their requests",
    "  lazypm update                    Update lazypm to the latest version",
    "",
    "Examples:",
    "  lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456",
    "  lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456 #sign-off",
    "  lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456 yolo",
    "  lazypm Amir Jafari",
].join("\n");

/**
 * Parse the lazypm command from user input.
 * Returns null if input doesn't start with "lazypm", or a parsed command object.
 */
function parseLazypmCommand(prompt) {
    const trimmed = prompt.trim();
    if (!/^lazypm\b/i.test(trimmed)) return null;

    const rest = trimmed.replace(/^lazypm\s*/i, "").trim();

    // No arguments: show usage
    if (!rest) return { mode: "usage" };

    // Check for update command
    if (/^update$/i.test(rest)) return { mode: "update" };

    // Extract flags
    const flags = new Set();
    const withoutFlags = rest.replace(FLAGS, (flag) => {
        flags.add(flag.toLowerCase());
        return "";
    }).trim();

    // Check for PR URL
    const urlMatch = withoutFlags.match(PR_URL_PATTERN);
    if (urlMatch) {
        const prUrl = urlMatch[0];
        const parsed = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
        if (!parsed) return { mode: "invalid_url", url: prUrl };

        const yolo = flags.has("yolo");
        const signOff = flags.has("#sign-off") && !yolo;
        return {
            mode: yolo ? "yolo" : "basic",
            prUrl,
            owner: parsed[1],
            repo: parsed[2],
            prNumber: parsed[3],
            signOff,
        };
    }

    // Remaining text is a PM name (reject flags that don't apply)
    if (!withoutFlags) return { mode: "usage" };
    if (flags.has("yolo") || flags.has("#sign-off")) {
        return {
            mode: "pm_invalid_flags",
            name: withoutFlags,
            flags: [...flags],
        };
    }

    return { mode: "pm", name: withoutFlags };
}

const session = await joinSession({
    onPermissionRequest: approveAll,
    hooks: {
        onUserPromptSubmitted: async (input) => {
            const cmd = parseLazypmCommand(input.prompt);
            if (!cmd) return;

            switch (cmd.mode) {
                case "usage":
                    return {
                        modifiedPrompt: "Display the usage for the lazypm extension to the user.",
                        additionalContext: USAGE_TEXT,
                    };

                case "invalid_url":
                    return {
                        modifiedPrompt: "The user provided an invalid PR URL for lazypm. Ask them to provide a valid GitHub PR URL.",
                        additionalContext: `Invalid URL provided: ${cmd.url}. Expected format: https://github.com/owner/repo/pull/NUMBER`,
                    };

                case "pm_invalid_flags":
                    return {
                        modifiedPrompt: "Tell the user that PM mode does not support yolo or #sign-off flags.",
                        additionalContext: [
                            `The user tried: lazypm ${cmd.name} ${cmd.flags.join(" ")}`,
                            "",
                            "PM mode does not support yolo or #sign-off flags.",
                            "yolo and #sign-off only apply to PR mode (with a GitHub PR URL).",
                            "PM mode always requires manual review before merging.",
                            "",
                            "Correct usage: lazypm <Name>",
                            `Example: lazypm ${cmd.name}`,
                        ].join("\n"),
                    };

                case "basic":
                case "yolo": {
                    const isPrivate = await isRepoPrivate(cmd.owner, cmd.repo);
                    if (isPrivate === false) {
                        return {
                            modifiedPrompt: "Tell the user that lazypm BLOCKED this operation because the target repo is public.",
                            additionalContext: `BLOCKED: ${cmd.owner}/${cmd.repo} is a PUBLIC repository. lazypm only operates on private repos. Never push to or create PRs in public repositories.`,
                        };
                    }
                    if (isPrivate === null) {
                        return {
                            modifiedPrompt: "Tell the user that lazypm could not verify the repo's visibility and blocked the operation as a precaution.",
                            additionalContext: `BLOCKED: Could not verify whether ${cmd.owner}/${cmd.repo} is private. lazypm requires confirmation that a repo is private before proceeding. Check your GitHub token and try again.`,
                        };
                    }
                    await session.log(`lazypm: Processing PR #${cmd.prNumber} from ${cmd.owner}/${cmd.repo}${cmd.mode === "yolo" ? " (YOLO mode)" : ""}${cmd.signOff ? " (with sign-off)" : ""}`);
                    return {
                        modifiedPrompt: `Execute the lazypm workflow for PR #${cmd.prNumber} in ${cmd.owner}/${cmd.repo}. PR URL: ${cmd.prUrl}. Mode: ${cmd.mode}. Sign-off: ${cmd.signOff ? "YES" : "NO"}.`,
                        additionalContext: cmd.mode === "yolo" ? YOLO_WORKFLOW : BASIC_WORKFLOW,
                    };
                }

                case "pm": {
                    await session.log(`lazypm: PM mode — looking up requests from ${cmd.name}`);
                    return {
                        modifiedPrompt: `Execute the lazypm PM workflow. Find and implement recent content change requests from: ${cmd.name}`,
                        additionalContext: PM_WORKFLOW,
                    };
                }

                case "update": {
                    await session.log("lazypm: Updating to latest version...");
                    return {
                        modifiedPrompt: "Execute the lazypm update workflow. Pull the latest version and update installed files.",
                        additionalContext: UPDATE_WORKFLOW,
                    };
                }
            }
        },
    },
    tools: [],
});

await session.log("lazypm loaded. Usage: /lazypm <PR URL> [yolo] [#sign-off] | /lazypm <Name> | /lazypm update");

// Fire-and-forget update check (never blocks startup)
checkForUpdates(session).catch(() => {});
