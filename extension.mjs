// Extension: lazypm
// Lazy PR manager - pulls a PR, fixes build warnings/errors/suggestions
// and/or merge conflicts, creates a new clean PR, closes the original,
// and signs off.

import { approveAll } from "@github/copilot-sdk";
import { joinSession } from "@github/copilot-sdk/extension";

// Matches: lazypm <GitHub PR URL> [#sign-off]
// Also matches: lazypm (no URL, will prompt the agent to ask)
const LAZYPM_PATTERN = /^\s*lazypm(?:\s+(https:\/\/github\.com\/[^\s]+\/pull\/\d+))?(?:\s+(#sign-off))?\s*$/i;

const WORKFLOW_INSTRUCTIONS = `
You are executing the **lazypm** workflow. Follow these steps precisely:

## Step 1: Read the original PR
- Use the GitHub MCP tools to get the PR details, changed files, diff, and build comments.
- Check the PR's \`mergeable_state\` to determine if there are merge conflicts.
- Identify the build report comment from "learn-build-service-prod[bot]" that contains warnings, errors, or suggestions (if any).
- Parse ALL issues from the build report (file-not-found, docs-link-absolute, etc.).

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
5. Resolve each conflict by applying the author's intended changes to the current main content. Prefer the author's new content, but keep any unrelated upstream changes that happened since the PR was opened.
6. After resolving, run \`git add <file>\` for each resolved file.
7. Verify no conflict markers remain: \`git grep -rn "<<<<<<< " -- "*.md"\` (should return nothing).

## Step 3: Fix all build issues
If the build report from Step 1 contained warnings, errors, or suggestions, fix them now.
For each issue found:
- **file-not-found** (missing images): Comment out the image reference using HTML comments (<!-- ... -->).
- **docs-link-absolute** (absolute learn.microsoft.com links): Convert to relative links by removing "https://learn.microsoft.com" prefix, keeping the path starting with /.
- **Other warnings/errors**: Apply the appropriate fix based on the validation documentation linked in the build report.
If there were no build issues, skip this step.

## Step 4: Commit and push
- Stage and commit with a descriptive message that credits the original PR author as Co-authored-by.
- If merge conflicts were resolved, mention that in the commit message.
- Push to the upstream repo (MicrosoftDocs or whichever org the original PR targets).

## Step 5: Create the new PR
- Create a PR targeting the same base branch as the original.
- In the body, describe the original changes AND any fixes applied (build fixes, conflict resolution, or both).
- Reference the original PR number with "Supersedes #NNNN".
- Credit the original author as Co-authored-by in the body.

## Step 6: Wait for build
- Wait 3 minutes, then check the PR comments for the build report.
- If the build passes clean (no warnings, errors, or suggestions), proceed to Step 7.
- If issues remain, fix them and force-push. Repeat until clean.

## Step 7: Close original PR and finalize
- Close the original PR with a comment explaining it was superseded by the new PR.
- Remove the "do-not-merge" label from the new PR if present.
- **Only if the user passed #sign-off**: Add a "#sign-off" comment on the new PR to merge it.
- **If #sign-off was NOT passed**: Do NOT add a sign-off comment. Just share the new PR link and let the user know they can sign off manually when ready.
- Share the new PR link with the user.

## Step 8: Clean up
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
            const signOff = !!match[2];

            if (!prUrl) {
                return {
                    modifiedPrompt: "The user invoked the lazypm command but did not provide a PR URL. Ask them for the GitHub PR URL they want you to process.",
                    additionalContext: "The lazypm command format: lazypm <PR URL> [#sign-off]. The #sign-off flag is optional and controls whether to auto-merge.",
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

            await session.log(`lazypm: Processing PR #${prNumber} from ${owner}/${repo}${signOff ? " (with sign-off)" : ""}`);

            return {
                modifiedPrompt: `Execute the lazypm workflow for PR #${prNumber} in ${owner}/${repo}. PR URL: ${prUrl}. Sign-off: ${signOff ? "YES" : "NO"}.`,
                additionalContext: WORKFLOW_INSTRUCTIONS,
            };
        },
    },
    tools: [],
});

await session.log("lazypm extension loaded. Usage: lazypm <PR URL> [#sign-off]");
