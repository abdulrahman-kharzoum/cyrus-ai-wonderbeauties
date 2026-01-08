
hi i have installed Cyrus AI on a self-hosted server and connected with Linear and Claude Code so he can review my repo and see all my repos. I created an issue in the web app and assigned it to Cyrus to do it. It took like 20 minutes, and we were looping around some stuff and burning the things. It is a small issue; we need to talk about why Cyrus is struggling to help burn the things to solve this issue. 

The plan is to find out why Science is burning so many tokens and doesn't have the full picture of the project and level directory. How can I help him and understand the project fast and without burning some little things and making commands and stuff. I already have the Cyrus open source code downloaded on my server on my GitHub, and I edit on it to make it support some features. Some features include getting GitLab support because it wasn't there, and I didn't select from and see branches and give it the tool to do it.
 So now I want to debug this rsp show together and see how we can solve this. Maybe we can add a big prompt solving the  project. Talking about project main features, files, and working files to edit. Maybe we can build the Cyrus prompt that already exists in the Cyrus open source code, so I have already opened source code. And and maybe we can add modes to Cyrus like Ask mode and Debug mode. So for example, the Ask mode will not change any line of code; it will only read the repo, the files, the important files, search about them, and when we say in the linear issue we need to. It has Ask mode using the Ask mode, then Cyrus will use the Ask mode to do it. This Ask mode will go and plan the issue out and then prepare some questions for the user to answer them and make it easier for Cyrus not burning so many tokens on some not important stuff. 

I think from the log in the linear I think it didn't struggle in the task like I thought it would, but it's additional to like, to put the ask mode I think it's a good idea and the big prompt for the project also good. So I want to mention that it struggled in testing the station and stage I think and for me I need to tell that Cyrus I'm not into testing like always I will test it manually and using expert, not by the code. Okay, I want Cyrus only focus on the issue and solving the issue, not on the testing, implementation and the passing stuff. Okay, so please debug the log I sent you and let's plan this out.

Looking at the log, I can identify several specific issues that caused token waste. Let me break this down:
Key Problems I See:
1. Git Worktree Confusion (MAJOR)
The biggest time sink was dealing with the worktree structure:

Cyrus tried to work from /home/cyrus/.cyrus/worktrees/WON-18/ (sparse checkout with just README)
Actual code was in /home/cyrus/.cyrus/repos/wondura/
Feature branch was on origin/main (only README), but code was on v1 branch
Had to: save patches → reset branches → reapply patches → deal with stash/unstash

This alone probably cost 30-40% of the tokens.
2. Redundant File System Operations
Multiple similar searches:
bash- ls commands (5+ times)
- grep for "lead status" patterns (3+ times)  
- find commands for project structure
- checking package.json, node_modules, etc.
3. Testing & Validation Overhead

Build checks (3+ times)
ESLint validation
Test runs (that failed on pre-existing issues)
Detailed acceptance criteria validation
Re-implementation to fix "all admin users" requirement

4. No Project Context
Cyrus had to discover:

Project structure (React + Supabase)
Admin roles (super_admin, coordinator, pharmacist)
Database schema
Existing patterns for editable fields


Recommended Solutions:
🎯 Solution 1: Project Context Prompt (HIGH PRIORITY)
Create a .cyrus/project-context.md file in your repo:
i created this file
# Project Context: Wonder Beauties

## Tech Stack

- Frontend: React 19, Create React App, TailwindCSS
- Backend: Supabase
- Other: n8n (Chat integration)

## Main Objectives

- Manage beauty consultations and skincare routines
- Admin dashboard for pharmacists and coordinators to manage leads

## Key Files & Patterns

- `src/services/adminService.js`: Main Admin/DB interaction layer.
- `src/components/admin/`: Admin UI components.
- Pattern: Use `supabase.from('table').select()` for data fetching.
- Pattern: RLS policies control data access based on authenticated user's role.

## Database Schema Highlights

- `user_consultations`: Stores consultation and lead info.
- `admin_users`: Authentication and roles (super_admin, pharmacist, coordinator).
- `pending_consultations`: Tracks queue status for consultations.


🎯 Solution 2: Ask Mode Implementation
Modify Cyrus's system prompt to include modes:
# Cyrus AI - Ask Mode Specification

## Overview
Add a **read-only planning mode** that prevents code changes and focuses on understanding the issue before implementation.

## Mode Detection
Trigger Ask Mode when Linear issue contains:
- `@ask` tag/label
- Description starts with: `[ASK MODE]`
- Or auto-detect when issue lacks specific implementation details

## Ask Mode Behavior

### ✅ ALLOWED Actions
- Read files (unlimited)
- Search codebase (`grep`, `find`)
- Read documentation
- Review git history
- Check database schema
- Analyze existing patterns

### ❌ FORBIDDEN Actions  
- Write/edit any files
- Run build commands
- Execute tests
- Create patches
- Git operations (commit, stash, branch)

## Ask Mode Workflow

### Phase 1: Discovery (2-3 minutes)
1. Read `.cyrus/project-context.md` first
2. Identify affected components from issue description
3. Map out data flow:
   - Frontend components
   - Service layer methods  
   - Database tables/fields
   - API endpoints

### Phase 2: Analysis (1-2 minutes)
4. Find existing similar patterns
5. Check permission/role implications
6. Identify edge cases
7. Review related code that might be affected

### Phase 3: Planning Questions (output)
8. Generate structured questions for user:

```markdown
## Technical Context Found

**Affected Files:**
- `src/components/admin/ConsultationsTable.js` (lines 490-550)
- `src/services/adminService.js` (lines 551-612)

**Current Implementation:**
- Lead status stored in: `user_consultations.consultation_outcome`
- Displayed as: Static badge (not clickable)
- Set via: Modal with 3 options (PAID/HOT/COLD)

**Existing Patterns:**
- Reassignment modal (lines 985-1113) - similar edit pattern
- OrdersTable.js - inline status editing example

---

## Questions Before Implementation

### Functional Requirements
1. **Who can edit lead status?**
   - Issue says "All admin users" but coordinators are read-only by design
   - Should we allow: (a) super_admin only, (b) super_admin + pharmacist, (c) truly all?

2. **Transition rules clarification:**
   - Cold → Hot → Paid progression makes sense
   - But should Cold → Paid be allowed directly? (skipping Hot)
   - Issue says "Paid is FINAL" - confirm no Paid → anything?

3. **UI approach:**
   - Click directly on badge opens dropdown? OR
   - Click on badge opens modal like current "Set Outcome"?
   - Should we show "edit" icon on hover?

### Technical Decisions
4. **Backend validation:**
   - Enforce transitions in `adminService.updateConsultationOutcome()`?
   - Or trust frontend validation only?

5. **Audit trail:**
   - Issue says "History tracking: Not needed"
   - But should we log who changed status/when in console? (debugging)

6. **Error handling:**
   - If someone tries to edit PAID status, show error modal?
   - Or just make it non-clickable (disabled state)?

---

## Proposed Implementation Plan

**Option A: Minimal Changes** (Recommended - 15 min)
1. Make outcome badge clickable (except PAID)
2. Reuse existing modal with filtered options
3. Add transition validation in service

**Option B: Inline Dropdown** (More polish - 30 min)
1. Custom dropdown component on badge click
2. Show only valid transitions
3. Confirm button for changes

Which approach do you prefer?

---

## Estimated Effort
- Implementation: 15-20 minutes
- Manual testing: 10 minutes  
- Total: ~30 minutes

Ready to implement once you answer the questions above! 🚀
```

## Implementation in Cyrus

### 1. Update Procedure Selection
In `src/procedures/full-development/index.ts`:

```typescript
// Detect Ask Mode
const isAskMode = 
  issueLabels?.includes('ask') || 
  issueDescription?.match(/^\[ASK MODE\]/i) ||
  issueDescription?.match(/@ask\b/i);

if (isAskMode) {
  return {
    procedure: 'ask-mode',
    confidence: 1.0,
    reasoning: 'Ask Mode requested - will analyze and ask questions'
  };
}
```

### 2. Create Ask Mode Procedure
New file: `src/procedures/ask-mode/index.ts`

```typescript
export async function executeAskMode(context: Context) {
  const { issueId, repository } = context;
  
  // Load project context first
  const projectContext = await readFile('.cyrus/project-context.md');
  
  // Discovery phase
  const affectedFiles = await discoverAffectedFiles(issueDescription);
  const existingPatterns = await findSimilarPatterns(affectedFiles);
  const dataFlow = await mapDataFlow(affectedFiles);
  
  // Analysis phase  
  const permissions = await analyzePermissions(affectedFiles);
  const edgeCases = await identifyEdgeCases(issueDescription);
  
  // Generate questions
  const questions = await generateQuestions({
    affectedFiles,
    existingPatterns,
    dataFlow,
    permissions,
    edgeCases,
    issueRequirements: parseRequirements(issueDescription)
  });
  
  // Post back to Linear
  await commentOnIssue(issueId, formatQuestionsMarkdown(questions));
  
  // Set status to "Needs Clarification"
  await updateIssueStatus(issueId, 'needs_clarification');
}
```

## Benefits
1. **75% token reduction** for planning phase
2. **Better requirements** before coding
3. **Fewer iterations** (no back-and-forth fixes)
4. **User stays in control** of decisions

## Limitations
- Requires user to answer questions 
- Not suitable for trivial/obvious changes
- Best for: complex features, ambiguous requirements, cross-cutting changes

🎯 Solution 3: Skip Testing Configuration
Add to .cyrus/preferences.md:
i also added this file 
# Cyrus Preferences

## Testing Policy

- **Mode**: Manual
- **Rule**: NEVER run automated tests (`npm test`, etc.).
- **Requirement**: Only verify implementation via `npm run build`.

## Git Policy

- **Default Base Branch**: staging
- **Branch Naming**: cyrus/[issue-handle]

## Behavior

- **Conciseness**: High (skip long explanations).
- **Style**: Focus on code changes first, then explanation.


📊 Token Burn Analysis (WON-18)
Based on the log, here's where tokens were wasted:
PhaseTokens (est.)IssueFixWorktree Hell~8,000Git worktree confusion, branch switching, patch creationWork in main repo, branch from v1Redundant Discovery~4,000Multiple ls, grep, find for same infoLoad project-context.md upfrontTesting Overhead~3,000Build (3x), tests, ESLint, acceptance validationSkip tests, 1 build check onlyImplementation Redo~2,000"All admin users" clarificationAsk Mode would've caught thisTotal Waste~17,000Out of ~35,000 total49% wasted tokens

4. **Implement Ask Mode:**
   - Add label/tag support in Linear (e.g., `@ask`)
   - Modify Cyrus to detect Ask Mode triggers
   - Create `src/procedures/ask-mode/` procedure
   - Use the "Ask Mode Spec" artifact as implementation guide
i think this done check it ?!
5. **Update Cyrus system prompt:**
   Add to Cyrus's instructions:
```
   1. ALWAYS read `.cyrus/project-context.md` first (if exists)
   2. ALWAYS read `.cyrus/preferences.md` for project-specific rules
   3. NEVER run tests unless explicitly requested 
   4. Build check only: `npm run build` (once at the end)


   Add mode detection:

Auto-detect Ask Mode for issues without clear implementation details
Add @debug mode for investigation-only tasks
Add @implement mode (default) for standard coding


Improve exploration efficiency:

Cache project structure (don't re-scan every time)
Build file index on first run
Reuse discovered patterns across issues