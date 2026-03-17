// Extension: lazypm
// Lazy PR manager - pulls a PR, fixes build warnings/errors/suggestions,
// and optionally resolves merge conflicts, PR review comments, and
// reviewer feedback (yolo mode). Creates a new clean PR and closes the original.

import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";

// Matches: lazypm <GitHub PR URL> [yolo] [#sign-off]
// Also matches: lazypm (no URL, shows usage)
const LAZYPM_PATTERN = /^\s*lazypm(?:\s+(https:\/\/github\.com\/[^\s]+\/pull\/\d+))?(?:\s+(yolo))?(?:\s+(#sign-off))?\s*$/i;

const BASIC_WORKFLOW = `
You are executing the **lazypm** workflow in **basic mode**. Follow these steps precisely:

## Step 1: Read the original PR
- Use the GitHub MCP tools to get the PR details, changed files, diff, and build comments.
- Check the PR's \`mergeable_state\` to determine if there are merge conflicts.
- Identify the build report comment from "learn-build-service-prod[bot]" that contains warnings, errors, or suggestions (if any).
- Parse ALL issues from the build report (file-not-found, docs-link-absolute, etc.).
- **If there are merge conflicts**, stop and tell the user: "This PR has merge conflicts. Use \`lazypm <URL> yolo #sign-off\` to resolve conflicts, address review comments, and fix build issues."

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

const session = await joinSession({
    onPermissionRequest: approveAll,
    hooks: {
        onUserPromptSubmitted: async (input) => {
            const match = input.prompt.match(LAZYPM_PATTERN);
            if (!match) return;

            const prUrl = match[1];
            const yolo = !!match[2];
            const signOff = !!match[3];

            if (!prUrl) {
                return {
                    modifiedPrompt: "Display the usage for the lazypm extension to the user.",
                    additionalContext: [
                        "lazypm: Lazy PR manager. Fixes build issues on a PR, creates a clean new PR,",
                        "closes the original. In yolo mode, also resolves merge conflicts and addresses",
                        "PR review/reviewer comments.",
                        "",
                        "Usage: lazypm <PR URL> [yolo] [#sign-off]",
                        "",
                        "Modes:",
                        "  lazypm <URL>                  Basic: fix build issues only",
                        "  lazypm <URL> #sign-off        Basic + auto-merge after clean build",
                        "  lazypm <URL> yolo #sign-off   Yolo: fix build + conflicts + review feedback",
                        "                                (never auto-merges; human review required)",
                        "",
                        "The yolo keyword requires #sign-off as an acknowledgment of risk,",
                        "but yolo mode never actually auto-merges.",
                        "",
                        "Examples:",
                        "  lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456",
                        "  lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456 #sign-off",
                        "  lazypm https://github.com/MicrosoftDocs/azure-docs/pull/456 yolo #sign-off",
                    ].join("\n"),
                };
            }

            if (yolo && !signOff) {
                return {
                    modifiedPrompt: "Tell the user that yolo mode requires #sign-off as an acknowledgment.",
                    additionalContext: "The user used `lazypm <URL> yolo` but forgot `#sign-off`. "
                        + "Yolo mode requires `#sign-off` at the end as an acknowledgment of risk "
                        + "(it won't actually auto-merge). Correct syntax: `lazypm <URL> yolo #sign-off`",
                };
            }

            // Parse owner, repo, PR number from URL
            const urlMatch = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
            if (!urlMatch) {
                return {
                    modifiedPrompt: "The user provided an invalid PR URL for lazypm. Ask them to provide a valid GitHub PR URL.",
                    additionalContext: `Invalid URL provided: ${prUrl}. Expected format: https://github.com/owner/repo/pull/NUMBER`,
                };
            }

            const [, owner, repo, prNumber] = urlMatch;

            await session.log(`lazypm: Processing PR #${prNumber} from ${owner}/${repo}${yolo ? " (YOLO mode)" : ""}${signOff && !yolo ? " (with sign-off)" : ""}`);

            const mode = yolo ? "yolo" : "basic";
            return {
                modifiedPrompt: `Execute the lazypm workflow for PR #${prNumber} in ${owner}/${repo}. PR URL: ${prUrl}. Mode: ${mode}. Sign-off: ${signOff && !yolo ? "YES" : "NO"}.`,
                additionalContext: yolo ? YOLO_WORKFLOW : BASIC_WORKFLOW,
            };
        },
    },
    tools: [],
});

await session.log("lazypm extension loaded. Usage: lazypm <PR URL> [yolo] [#sign-off]");
