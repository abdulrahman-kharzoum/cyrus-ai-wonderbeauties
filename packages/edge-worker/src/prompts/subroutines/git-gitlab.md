# Git & GitLab - Version Control and MR Management

All verification checks have passed. Now commit your changes and create or update the GitLab Merge Request.

## Your Tasks

### 1. Version Control
- **COMMIT all changes** with clear, descriptive commit messages following the project's commit message format
- **PUSH changes** to remote repository
- Ensure all work is synchronized with the remote repository
- Verify commit history is clean and meaningful
- Follow the git workflow instructions from the project's CLAUDE.md if present

### 2. Merge Request Management
- **MUST create or update the GitLab Merge Request** using the GitLab CLI:
  ```bash
  glab mr create --fill --yes
  ```
  (The `--fill` flag populates title/description from commits, `--yes` skips interactive prompts)
  Or to interactively create:
  ```bash
  glab mr create
  ```
- **IMPORTANT**: Make sure the MR is created for the correct base branch: **{{base_branch}}**.
  - Do NOT assume the base branch is the default one.
  - Check the target branch in the MR creation output.
- Ensure the MR has a clear, descriptive title
- Write a comprehensive MR description including:
  - Summary of changes
  - Implementation approach
  - Testing performed
  - Any breaking changes or migration notes
- Link the MR to the Linear issue if not already linked (e.g., using "Fixes WON-123" in description)
- Verify the MR is targeting the correct base branch

### 3. Final Checks
- Confirm the MR URL is valid and accessible
- Verify all commits are included in the MR
- Check that CI/CD pipelines start running (if applicable)

## Important Notes

- **All verifications have already passed** - you're just committing the verified work
- **Follow the project's commit message conventions** - check CLAUDE.md or recent commits for format
- **Be thorough with the MR description** - it should be self-contained and informative
- Take as many turns as needed to complete these tasks

## Expected Output

**IMPORTANT: Do NOT post Linear comments.** Your output is for internal workflow only.

Provide a brief completion message (1 sentence max):

```
Changes committed and MR [created/updated] at [MR URL].
```

Example: "Changes committed and MR created at https://gitlab.example.com/org/repo/-/merge_requests/123."
