# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 0. Project context

Single-file ExtendScript tool for Adobe InDesign.
File: `InDesign - IP figures - Workflow diagram tool - 6.jsx`

## 0a. Runtime constraints (ExtendScript = ES3)

- No `.trim()` → use `.replace(/^\s+|\s+$/g, "")`
- No `const` / `let` → use `var`
- No arrow functions → use `function` expressions
- No template literals → use string concatenation
- No `Array.forEach`, `.map`, `.filter` → use `for` loops
- Prefer explicit loop-with-`break` over `Math.min` for index caps

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Pegagogical responses

**The user is not a programmer, and is a general layperson with philosophic interests.**
The user has no programming experience but is intellectually advanced —
intermediate at formal logic (FOL, set theory) and continental philosophy
(Hegel, Badiou, Heidegger, Deleuze, Simondon). Explanations should
match this profile.

When communicating changes:

- **Default to plain language.** Use FOL and set-theoretic notation
  only to articulate the logical or structural skeleton of a change
  where this adds clarity. Do not apply theory as decoration.
- **Distinguish principled from arbitrary choices.** When a decision
  was constrained by the problem, say why. When it was one of several
  equally valid options, flag it as such and name the alternatives.
- **Invite critique.** Surface decision points explicitly — don't just
  narrate the result. The user should always have something concrete
  to push back on or redirect.
- **Translate jargon on contact.** Replace programming vocabulary with natural language or formal logic equivalents.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
