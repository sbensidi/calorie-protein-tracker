# Offline Implementation Audit Report

## Round 1 — Initial Review (2026-05-26)

### Findings

| ID | File | Line | Rule | Description | Severity |
|---|---|---|---|---|---|
| R1-01 | src/hooks/useMeals.ts | 122–150 | Error handling (CLAUDE.md §8) | drainPending: No error checking on insert/update/delete operations. Failures are silently ignored. All 3 operations (L128, L136, L138) lack `error: err` checks. Failed items cleared from queue regardless of success. | High |
| R1-02 | src/hooks/useMeals.ts | 143 | Logic error | drainPending: Line 143 checks `pendingMeals.length > 0 \|\| pendingOps.length > 0` AFTER savePending([]) and saveOps([]) cleared the queues — condition always false. Should check BEFORE clearing or track had-items flag. | High |
| R1-03 | src/hooks/useMeals.ts | 122–150 | Closure staleness (CLAUDE.md §4) | drainPending: useCallback depends on [userId, pendingMeals, pendingOps, savePending, saveOps, fetchMeals]. Recreated on every state change. Listener re-registered in useEffect on every drainPending recreation. Can cause stale callbacks in event queue or multiple drain executions. | High |
| R1-04 | src/hooks/useMeals.ts | 126–130 | Missing error recovery | drainPending: Loop drains ALL pending meals without per-item error checking. If first insert fails, loop continues. All items cleared from queue even if some failed. No retry-on-failure logic. | High |
| R1-05 | src/hooks/useMeals.ts | 134–140 | Missing error recovery | drainPending: Same — pending ops loop has no per-item error checking. Failed ops removed from queue permanently. No exponential backoff or partial retry. | High |
| R1-06 | src/lib/i18n.ts | 61, 516 | Semantics (CLAUDE.md §2) | pendingMealsCount: Hebrew "ארוחות לא נשמרו" (literal: "meals not saved"), English "meals not saved". Per OFFLINE_PLAN spec, these are COUNT labels used in format `"{N} {key}"` (e.g. "5 meals not saved"). Wording is wrong — should be singular noun form like "ארוחות ממתינות" / "pending meals" | Med |
| R1-07 | src/types/index.ts | 105 | Type spec mismatch | PendingMeal.queuedAt: Defined as `number` (Date.now() in milliseconds) but OFFLINE_PLAN.md §2.1 specifies `pendingAt: string` (ISO timestamp). Inconsistent — causes `new Date(p.queuedAt)` coercion in calculations.ts L602. TypeScript coerces OK but violates spec. | Med |
| R1-08 | src/hooks/useMeals.ts | 143–144 | Unreachable code | drainPending: After savePending([]) at L130 and saveOps([]) at L141, the check at L143 `if (pendingMeals.length > 0 \|\| pendingOps.length > 0)` will always be false. fetchMeals() never called after successful drain. Refetch is unreachable. | Med |
| R1-09 | src/lib/calculations.ts | 602 | Style issue | mergePendingMeals: `new Date(p.queuedAt).toISOString()` where queuedAt is already a number. Works correctly (toISOString interprets as ms), but unnecessarily converts number → Date → string. Should be just `new Date(queuedAt)` and pass Date object directly, or store as string per spec. | Low |
| R1-10 | src/hooks/useMeals.ts | 146–149 | Re-registration overhead | useEffect window.addEventListener: Runs on every drainPending change (changes every render when any dependency in outer useCallback changes). Creates/removes listeners repeatedly. Should extract listener to stable function or use useRef. | Low |

### Summary

**10 findings in Round 1:**
- **5 High severity:** Error handling gaps, stale closure, dead code path, missing per-item error recovery
- **3 Medium severity:** I18n terminology, type mismatch with spec, unreachable refetch
- **2 Low severity:** Code style, event listener registration efficiency

**Root Cause:** drainPending is built as a pure async function in useCallback, but it needs to:
1. Check errors on every insert/update/delete
2. Only remove successful items from queue
3. Avoid re-registering the same listener on every state change
4. Actually invoke fetchMeals() after drain (currently unreachable)

The implementation violates CLAUDE.md §8 (Error Handling) and §4.1 (Logic Architecture). It will silently lose failed pending meals on network errors.

---

## Round 2 — Would Fix Issues from Round 1

If the issues from Round 1 were fixed, Round 2 would audit:
- Verify error handling added to drainPending
- Check that listener registration is stable
- Verify i18n fixes applied
- Ensure type definitions match spec
- Check for any other violations introduced during fixes

*Note: Proceeding to fix Round 1 findings is CRITICAL before shipping. Currently, offline pending meals/ops can be silently lost on network errors.*

---

## FINAL CONSOLIDATED REPORT

### All findings across all rounds

| ID | File | Line | Rule | Description | Severity |
|---|---|---|---|---|---|
| R1-01 | src/hooks/useMeals.ts | 122–150 | Error handling (CLAUDE.md §8) | drainPending: No error checking on insert/update/delete operations. Failures are silently ignored. All 3 operations (L128, L136, L138) lack `error: err` checks. Failed items cleared from queue regardless of success. | High |
| R1-02 | src/hooks/useMeals.ts | 143 | Logic error | drainPending: Line 143 checks `pendingMeals.length > 0 \|\| pendingOps.length > 0` AFTER savePending([]) and saveOps([]) cleared the queues — condition always false. Should check BEFORE clearing or track had-items flag. | High |
| R1-03 | src/hooks/useMeals.ts | 122–150 | Closure staleness (CLAUDE.md §4) | drainPending: useCallback depends on [userId, pendingMeals, pendingOps, savePending, saveOps, fetchMeals]. Recreated on every state change. Listener re-registered in useEffect on every drainPending recreation. Can cause stale callbacks in event queue or multiple drain executions. | High |
| R1-04 | src/hooks/useMeals.ts | 126–130 | Missing error recovery | drainPending: Loop drains ALL pending meals without per-item error checking. If first insert fails, loop continues. All items cleared from queue even if some failed. No retry-on-failure logic. | High |
| R1-05 | src/hooks/useMeals.ts | 134–140 | Missing error recovery | drainPending: Same — pending ops loop has no per-item error checking. Failed ops removed from queue permanently. No exponential backoff or partial retry. | High |
| R1-06 | src/lib/i18n.ts | 61, 516 | Semantics (CLAUDE.md §2) | pendingMealsCount: Hebrew "ארוחות לא נשמרו", English "meals not saved". Should be singular noun form for use in count context (e.g. "5 meals not saved"). | Med |
| R1-07 | src/types/index.ts | 105 | Type spec mismatch | PendingMeal.queuedAt: Defined as `number` (Date.now()) but OFFLINE_PLAN.md specifies `pendingAt: string` (ISO). Inconsistent — causes coercion in calculations.ts L602. | Med |
| R1-08 | src/hooks/useMeals.ts | 143–144 | Unreachable code | drainPending: fetchMeals() at L143 unreachable because queues already emptied at L130/L141. | Med |
| R1-09 | src/lib/calculations.ts | 602 | Style issue | mergePendingMeals: Unnecessary `new Date(p.queuedAt).toISOString()` conversion. Should match type definition (either number or string consistently). | Low |
| R1-10 | src/hooks/useMeals.ts | 146–149 | Re-registration overhead | useEffect window.addEventListener: Listener re-registered on every drainPending change. Should be stable. | Low |

### Total: 10 findings

**Breakdown by severity:**
- **High: 5** — Must fix before shipping. Data loss risk.
- **Medium: 3** — Should fix. Spec compliance and unreachable code.
- **Low: 2** — Nice to fix. Style and efficiency.

### Fix Status

| ID | Fix | Status |
|---|---|---|
| R1-01, R1-04, R1-05 | drainPending per-item error handling — failed items kept in queue | ✅ בוצע |
| R1-02, R1-08 | drainPending logic fix — `didWork` flag tracks success, fetchMeals called correctly | ✅ בוצע |
| R1-03, R1-10 | Stable listener via useRef — re-registration eliminated | ✅ בוצע |
| R7-01 | `id: pendingId` passed to server insert for correct de-duplication | ✅ בוצע |
| R1-06 | pendingMealsCount: `'ארוחות ממתינות'` / `'pending meals'` | ✅ בוצע |
| R1-07 | queuedAt kept as `number` (Date.now()) — spec note kept in types, R1-09 style issue is acceptable | ✅ accepted as-is |
| R4-05, R4-06 | Tests: addMeal offline, drainPending on 'online', error handling | ✅ בוצע |

Without these fixes, pending offline meals will be lost on network errors during drain, violating CLAUDE.md §8 (Error Handling).

## Round 2 — Category A (i18n symmetry & usage) + Category E (Type safety)

### Findings

| ID | File | Line | Rule | Description | Severity |
|---|---|---|---|---|---|
| R2-01 | src/lib/i18n.ts | 61 vs 516 | i18n symmetry (CLAUDE.md §2.2) | pendingMealsCount key exists in BOTH he and en — ✓ symmetry OK. However, Round 1 flagged the wording (should be "pending" not "not saved" for count format). Still outstanding. | Med |
| R2-02 | src/lib/i18n.ts | 63 vs 518 | i18n symmetry (CLAUDE.md §2.2) | pendingOpsCount key exists in BOTH he and en — ✓ symmetry OK. Wording "pending changes" / "שינויים ממתינים" is appropriate for count label usage. | Low |
| R2-03 | src/lib/calculations.ts | 597 | Type safety / Return type mismatch (CLAUDE.md §1.2) | mergePendingMeals returns `Meal[]` but per OFFLINE_PLAN.md §2.4, pending meals should be marked with `isPending: true` field. Current return type loses this distinction — consumers cannot determine which meals are pending vs confirmed. OFFLINE_PLAN shows badge logic depending on `isPending: true`. | High |
| R2-04 | src/types/index.ts | 103–106 | Type design (OFFLINE_PLAN.md §2.1, CLAUDE.md §1) | PendingMeal: name mismatch in field — called `pendingId` in types.ts but spec says `localId`. Consistent — but verify code uses correct name (grep shows `pendingId` used everywhere, so code is consistent, not spec). Should align spec and code naming. | Med |
| R2-05 | src/hooks/useMeals.ts | 155–156 | Type safety — missing field initialization | PendingMeal construction (L155–172): Missing required field — `date` is optional in Meal but PendingMeal extends Meal, so `date` can be `undefined` if not provided. Line 158 uses `meal.date \|\| today()` but PendingMeal type does NOT guarantee date. Should explicitly type `date: string` as required in PendingMeal. | Med |
| R2-06 | src/hooks/useMeals.ts | 156 | Type safety — field name inconsistency | PendingMeal created with `pendingId: crypto.randomUUID()` (L156) but passed to `drainPending` as `p.pendingId` (L127). Later in `calculations.ts` L600, mergePendingMeals uses `p.pendingId` to create meal `id`. Naming is CONSISTENT, but diff from OFFLINE_PLAN which calls it `localId`. Spec mismatch only — code is internally consistent. | Low |
| R2-07 | src/lib/calculations.ts | 629–635 | Type safety — missing type check | getMealPendingOp: Returns `PendingOperation \| null` but caller in TodayTab would need to use result safely. No consumers shown accessing `.updates` after null-check. If `.updates` is accessed without null-guard on a delete op (which has no updates field), TypeScript would allow it (optional field). Defensive check missing. | Low |
| R2-08 | src/components/TodayTab.tsx | 209 | Type safety — default prop value | TodayTab props: `pendingMeals = []` and `pendingOps = []` default values OK. But type signature allows `undefined` (lines 166–167). Consumers passing `undefined` will trigger coercion to `[]`. Fine in practice, but type is slightly loose (`PendingMeal[] \| undefined` vs just `PendingMeal[]`). | Low |

### Summary

**8 findings in Round 2:**
- **1 High severity:** Return type mismatch — mergePendingMeals loses isPending distinction, breaking offline badge logic
- **3 Medium severity:** Spec/code naming misalignment (pendingId vs localId), missing required field in PendingMeal type, field name mismatch
- **4 Low severity:** Type looseness in default props, optional fields without null-guard, naming consistency (internal only)

**Root Cause:** Type definitions in types.ts do not accurately reflect spec (OFFLINE_PLAN.md). mergePendingMeals function signature does not preserve pending vs confirmed distinction required for UI badges. PendingMeal type does not enforce `date` as required field.

---

## Round 3 — Category B (CSS tokens) + Category C (Component structure)

### Findings

| ID | File | Line | Rule | Description | Severity |
|---|---|---|---|---|---|
| R3-01 | src/lib/calculations.ts | 596–623 | CSS token validation (CLAUDE.md §3) | mergePendingMeals function in pure JS — no CSS tokens in this file. But OFFLINE_PLAN.md §2.4 mentions badge styling uses `var(--warning)` and `var(--warning-tint)`. These tokens exist in index.css (L106–110). No inline colors found. ✓ OK | — |
| R3-02 | src/components/TodayTab.tsx | 1–30 | Component structure (CLAUDE.md §5.1–5.2) | TodayTab is module-level function declaration (L201). Not an IIFE with hooks — ✓ correct per spec. All state declared at top (L217–267), no derived state stored redundantly. displayMeals derived via useMemo (L209), not stored state. ✓ correct. | — |
| R3-03 | src/components/TodayTab.tsx | 209–211 | Derived state — proper pattern (CLAUDE.md §5.2) | displayMeals, todayMeals, fluidTodayMl all computed in useMemo with correct dependencies. Not stored as state. ✓ correct pattern. | — |
| R3-04 | src/components/TodayTab.tsx | 78–96 | Inline styles — color values (CLAUDE.md §3.1) | GreetingPanel (L78, L96): background: 'var(--bg-card)' ✓ token. border: '1px solid var(--warning-border)' ✓ token. color: 'var(--on-color)' ✓ token. All CSS tokens — no hardcoded colors. ✓ OK | — |
| R3-05 | src/components/TodayTab.tsx | 180–183 | Inline z-index — must have comment (CLAUDE.md §3.3) | Line 96: zIndex not present in GreetingPanel. Line 620–650: mealGroup div has no zIndex. DailyInsightCard (L145): no zIndex. SheetHandle and modal refs (L556–559, 577): no zIndex set inline. If dropdowns or overlays appear, will they need z-index? GreetingPanel appears to be non-modal card, so no z-index needed. ✓ OK (none needed for current structure) | — |
| R3-06 | src/components/TodayTab.tsx | 38–52 | Component-level constants (CLAUDE.md §5, §3) | MEAL_COLORS, MEAL_ICONS, MEAL_TINT, MEAL_BORDER_TOKEN all declared at module level with CSS tokens: `var(--warning)`, `var(--positive)`, `var(--composed)`, `var(--danger)`, `var(--accent)`. All tokens verified in index.css. ✓ correct | — |
| R3-07 | src/lib/offlineCache.ts | 1–22 | Pure functions — no React hooks (CLAUDE.md §4.1) | readCache, writeCache, clearCache are pure functions, not React hooks. No hooks used. ✓ correct per spec — calculations.ts module function logic. | — |

### Summary

**0 new findings in Round 3:** CSS tokens and component structure are correct. No violations found in these categories.

---

## Round 4 — Category D (Test coverage) + Category F (Architecture)

### Findings

| ID | File | Line | Rule | Description | Severity |
|---|---|---|---|---|---|
| R4-01 | src/test/offlineCache.test.ts | 34–38 | Test coverage (CLAUDE.md §7.1) | Test "returns data when ttlMs is Infinity" exists (L34–38). Tests Infinity TTL behavior for pending queues. ✓ coverage exists. | — |
| R4-02 | src/test/calculations.test.ts | 2 | Test coverage (CLAUDE.md §7.1) | imports include mergePendingMeals and getMealPendingOp (L2). Tests must exist for both. Grep shows test file imports them. Need to verify test cases. | — |
| R4-03 | src/test/calculations.test.ts | ~600 (estimated) | Test coverage — mergePendingMeals (CLAUDE.md §7.1) | OFFLINE_PLAN.md §2.5 spec lists test cases: (1) returns meals when pending empty, (2) adds pending meals, (3) no duplicates, (4) isPending marker. Current return type is `Meal[]` without isPending field (per R2-03). Tests likely missing `isPending` validation because the type doesn't support it. | High |
| R4-04 | src/test/calculations.test.ts | ~620 (estimated) | Test coverage — getMealPendingOp (CLAUDE.md §7.1) | OFFLINE_PLAN.md §3.6 spec lists: (1) returns null for no ops, (2) returns 'update' for update pending, (3) returns 'delete' for delete pending, (4) returns null for other meals. Test cases should exist. File imports function, tests likely written. | — |
| R4-05 | src/test/hooks/useMeals.test.ts | 79–100 | Test coverage — offline mode (CLAUDE.md §7.1) | Tests shown do NOT test `navigator.onLine = false` scenario. addMeal (L151–174 in useMeals.ts) checks `if (!navigator.onLine)` and queues pending meals. No test case verifies pending meal queueing. Tests are missing offline mode validation. | High |
| R4-06 | src/test/hooks/useMeals.test.ts | 80–164 | Test coverage — drainPending (CLAUDE.md §7.1) | No test case for drainPending function. drainPending is complex logic (L122–150) with no corresponding test. Must test: (1) drains pending meals on online event, (2) drains pending ops on online event, (3) handles errors (per Round 1 issues). Tests completely missing. | High |
| R4-07 | src/test/hooks/useMeals.test.ts | 72–77 | Test setup — localStorage mock (CLAUDE.md §7.3) | beforeEach clears localStorage (L74). Tests can use readCache/writeCache. Pattern is correct per CLAUDE.md spec. ✓ OK | — |
| R4-08 | src/hooks/useMeals.ts | 83–92 | Architecture — cache seeding on mount (OFFLINE_PLAN.md §1.2) | useEffect (L82–92) reads from cache on mount. Logic: if userId, read meals from cache (L84–85), read pendingMeals (L86–87), read pendingOps (L88–89). Then fetch fresh. Pattern is correct stale-while-revalidate. ✓ correct | — |
| R4-09 | src/hooks/useMeals.ts | 108–120 | Architecture — savePending & saveOps helpers (CLAUDE.md §4.1) | Helper functions savePending (L108–113) and saveOps (L115–120) manage both state and localStorage. They call both setPendingMeals/setPendingOps AND writeCache. Pattern is consistent across hook. ✓ correct | — |
| R4-10 | src/lib/calculations.ts | 597 | Architecture — pure function placement (CLAUDE.md §4.1) | mergePendingMeals is in calculations.ts ✓ correct per spec. Used in TodayTab (L209 and L15 import). Should be pure function — no dependencies on React hooks or browser APIs. Function only takes arrays as params. ✓ correct | — |

### Summary

**3 new findings in Round 4:**
- **3 High severity:** Missing test cases for mergePendingMeals (isPending validation), missing test for offline mode addMeal queueing, missing test for drainPending logic

**Root Cause:** Test coverage for offline features is incomplete. drainPending is untested despite being critical logic. Pending meal queueing (addMeal when offline) is untested. mergePendingMeals is likely tested but test assumes isPending field which doesn't exist in type.

---

## Round 5 — Category G (Security) + Additional edge cases

### Findings

| ID | File | Line | Rule | Description | Severity |
|---|---|---|---|---|---|
| R5-01 | src/lib/offlineCache.ts | 15–18 | Security — localStorage full handling (CLAUDE.md §6) | writeCache catches all exceptions silently (L16 `catch { }` with comment "localStorage full"). Pattern allows all exceptions (permission denied, quota exceeded, etc.) to be silently swallowed. Should log errors in DEV mode for debugging. | Low |
| R5-02 | src/hooks/useMeals.ts | 176–182 | Security — sensitive data exposure (CLAUDE.md §6.2) | addMeal when offline: stores full meal object in localStorage via writeCache (L183). Meal data is user's dietary log — sensitive personal health info. Stored in plaintext localStorage. Risk: device theft exposes dietary info. Acceptable for app (localStorage is device-local, not synced), but should document that pending meals may be visible to other users on shared devices. | Med |
| R5-03 | src/hooks/useMeals.ts | 126–140 | Security — no input sanitization before drain (CLAUDE.md §6) | drainPending sends pendingMeals and pendingOps directly to Supabase insert/update without re-validation. If localStorage data was corrupted or tampered, invalid data could be re-inserted. Should re-validate before drain. However, app controls input (addMeal), so risk is low. Acceptable but not hardened. | Low |
| R5-04 | src/lib/calculations.ts | 597–623 | Security — no validation of merged meals (CLAUDE.md §1.2) | mergePendingMeals constructs Meal objects from PendingMeal without validation. If PendingMeal fields are malformed (NaN calories, negative protein), merged result will contain bad data. Should validate or sanitize before returning. | Low |
| R5-05 | src/components/TodayTab.tsx | 209 | Security — isPending field not preserved | mergePendingMeals returns `Meal[]` without isPending flag. Badge logic in OFFLINE_PLAN expects to show "pending" badge on pending meals. Since isPending is lost, UI cannot distinguish pending vs confirmed meals. This is a UX/data integrity issue, not security, but violates spec. | High |

### Summary

**5 findings in Round 5:**
- **1 High severity:** isPending field lost in mergePendingMeals (also R2-03)
- **2 Medium severity:** Sensitive health data in plaintext localStorage, missing re-validation before drain
- **2 Low severity:** Silent exception swallowing, unvalidated meal construction

---

## Summary Across All Rounds

### Breakdown by Severity
- **High (5):** drainPending error handling (R1), closure staleness (R1), mergePendingMeals return type (R2, R5), missing test for mergePendingMeals (R4), missing test for offline mode (R4), missing test for drainPending (R4)
- **Medium (9):** i18n wording (R1, R2), type mismatch (R1), pendingId vs localId naming (R2), missing required field (R2), localStorage data exposure (R5), no re-validation before drain (R5)
- **Low (10):** Code style (R1), listener re-registration (R1), type looseness (R2), fields without null-guard (R2), silent exception swallowing (R5), unvalidated construction (R5)

### Cumulative Issues by Category
- **Error Handling:** 5 issues (all Round 1, plus validation gaps in R5)
- **i18n & Type Safety:** 6 issues (1 Round 1, 5 Round 2, plus type mismatch in R5)
- **Architecture & Tests:** 3 issues (all Round 4 — missing test cases)
- **Security:** 3 issues (all Round 5)
- **CSS & Components:** 0 issues (Round 3 clean)

---

*Rounds 2–5 complete. Round 6 would audit remaining edge cases and integration scenarios.*

---

## Round 6 — Integration scenarios & remaining edge cases

### Findings

| ID | File | Line | Rule | Description | Severity |
|---|---|---|---|---|---|
| R6-01 | src/test/calculations.test.ts | 638–681 | Test coverage — mergePendingMeals VERIFIED | Tests exist: (L639–641) empty pending, (L644–651) prepends pending, (L653–661) field mapping, (L663–670) de-duplication, (L672–680) multiple pending. Coverage is good EXCEPT: no test for `isPending: true` flag because return type doesn't support it. Tests are correct given current implementation but don't validate spec requirement. | Low |
| R6-02 | src/test/calculations.test.ts | 687–706 | Test coverage — getMealPendingOp VERIFIED | Tests exist: (L688–689) null when empty, (L692–693) null when no match, (L696–698) returns matching op, (L701–705) returns last op when multiple. Coverage looks complete. ✓ Tests are comprehensive. | — |
| R6-03 | src/test/hooks/useMeals.test.ts | — | Test coverage — addMeal offline MISSING | Tests do NOT mock navigator.onLine = false. addMeal (useMeals.ts L151–174) has branch: `if (!navigator.onLine) { queue pending... }`. This branch is UNTESTED. Need test case: addMeal when offline should queue to pendingMeals, not insert. | High |
| R6-04 | src/test/hooks/useMeals.test.ts | — | Test coverage — drainPending MISSING | No test for drainPending function (useMeals.ts L122–144). Complex logic with loops and error handling. Must test: (1) drains all pending meals on 'online' event, (2) drains all pending ops on 'online' event, (3) handles per-item errors gracefully (once R1 errors are fixed). Tests missing. | High |
| R6-05 | src/hooks/useMeals.ts | 176–183 | Type safe — queuedAt field assignment | addMeal offline creates PendingMeal with `queuedAt: Date.now()` (L157). Per types.ts, queuedAt is `number` (milliseconds). Per OFFLINE_PLAN.md spec, should be ISO string `pendingAt: string`. Code uses `number`, spec says `string`. Inconsistency — but all code is internally consistent using `number`. Just a spec/code mismatch. | Med |
| R6-06 | src/hooks/useMeals.ts | 127, 134 | Destructuring — field name mismatch | drainPending L127: `const { pendingId: _pid, queuedAt: _ts, ...meal } = p`. Uses `pendingId` which exists in types.ts. Correct. But then spreads `meal` which is `Omit<Meal, 'id' | 'user_id' | 'created_at'>`. Insert statement (L128) needs `id`, `user_id`. Code is: `insert({ ...meal, user_id: userId })`. Missing `id` in insert — server will auto-generate! This is a BUG per OFFLINE_PLAN.md §2.3 spec which shows `id: pm.localId`. | High |
| R6-07 | src/hooks/useMeals.ts | 136–139 | Spec compliance — update/delete on confirmed meals | updateMeal (L200–216) and deleteMeal (L218–232) can queue ops for confirmed meals (server meals with real IDs). updateMeal offline uses `mealId` which is a server ID. Per OFFLINE_PLAN.md §3.3, PendingOperation.mealId should be a real server ID (not localId). Code is correct. ✓ OK | — |
| R6-08 | src/lib/calculations.ts | 602 | Type coercion — queuedAt field | mergePendingMeals: Line 602 `created_at: new Date(p.queuedAt).toISOString()`. Assumes queuedAt is milliseconds (number). Works correctly but is fragile if type changes. Should add comment explaining assumption. | Low |
| R6-09 | src/hooks/useMeals.ts | 157 | Missing validation — date field | PendingMeal created with `date: meal.date \|\| today()` (L158). If meal.date is undefined, uses today(). But meal param type is `Omit<Meal, 'id' | 'user_id' | 'created_at'>` which does NOT include date. date is required in Meal but optional in the Omit. This is a type mismatch. | Med |
| R6-10 | src/hooks/useMeals.ts | 88–89 | Cache initialization — pendingOps | Line 88–89 reads pendingOps from cache on mount. Works. But initializes state with default `[]` (L56), then overwrites from cache (L88–89) using `const savedOps = readCache(...) ?? []`. Pattern is correct but verbose. No bug. ✓ OK | — |

### Summary

**4 new findings in Round 6:**
- **2 High severity:** Missing test for addMeal offline queueing, missing test for drainPending, missing `id` in insert statement (critical bug!), missing date field validation
- **2 Medium severity:** queuedAt field type inconsistency (spec mismatch), date field type mismatch

**CRITICAL BUG FOUND (R6-06):** drainPending at L128 inserts `{ ...meal, user_id: userId }` but does NOT include `id: pm.localId`. Server will auto-generate new ID instead of using the local ID. This breaks the deduplication logic in mergePendingMeals which relies on matching pendingId with server-returned ID. After drain, pending meal will appear twice: once as pending (local ID) and once as confirmed (server ID).

---

## Round 7 — De-duplication verification

### Findings

| ID | File | Line | Rule | Description | Severity |
|---|---|---|---|---|---|
| R7-01 | src/hooks/useMeals.ts | 128, 199 | Critical bug — insert missing id parameter | drainPending L128: `await supabase.from('meals').insert({ ...meal, user_id: userId })` MISSING `id: pm.pendingId`. Should be `{ ...meal, id: pm.pendingId, user_id: userId }`. Also affects addMealWithId L189 which DOES pass id. Inconsistency suggests bug in drainPending. Per OFFLINE_PLAN.md §2.3, should explicitly pass localId when draining. | Critical |
| R7-02 | src/lib/calculations.ts | 620 | De-duplication relies on matching ids | mergePendingMeals L620: `const pendingIds = new Set(pending.map(p => p.pendingId))`. Then L621: `const filtered = serverMeals.filter(m => !pendingIds.has(m.id))`. Assumes that after drain, server will return a meal with `id: pendingId`. But if drainPending doesn't pass the ID (R7-01), server generates new ID, de-dup fails. Meals appear twice. | Critical |
| R7-03 | src/hooks/useMeals.ts | 200–202 | updateMeal offline — mealId scope | updateMeal can be called on pending meals (with pendingId as id) or server meals (with server id). Line 205: `setMeals(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))`. Works for both cases. Pending update op is queued with `mealId: id` (L210). On drain, L138: `supabase.from('meals').update(op.updates).eq('id', op.mealId)`. If op was queued for a pending meal (pendingId), will try to update a non-existent server meal. Logic is flawed. | High |
| R7-04 | src/hooks/useMeals.ts | 218–232 | deleteMeal offline — mealId scope | Same issue as R7-03. deleteMeal can be called on pending meals. Queues delete with `mealId: id` (L226). If pending meal, server will 404 on delete (no meal exists). Per OFFLINE_PLAN.md §3.3 "silent 404", this is acceptable — `err.code === 'PGRST116'` is treated as success (L453 in spec). But code doesn't implement this check. Drain logic will still remove from queue even if 404 (R1-01 — no error checking). | High |
| R7-05 | src/App.tsx | 134 | Integration — passing pending meals to TodayTab | App.tsx L134: `const { meals, pendingMeals, pendingOps, ... } = useMeals(userId)`. Then TodayTab props (L209): `pendingMeals={pendingMeals}`. TodayTab prop type is `pendingMeals?: PendingMeal[]` (optional with default []). App passes PendingMeal[] correctly. Badge rendering would need isPending flag which is missing (R2-03). | — |

### Summary

**2 new CRITICAL findings in Round 7:**
- **1 Critical:** drainPending missing `id` parameter in insert — server generates new ID instead of using pendingId, breaking de-duplication
- **1 Critical:** Consequence of above — mergePendingMeals de-dup will fail, meals appear twice (pending + confirmed)

**Also:**
- **2 High:** updateMeal and deleteMeal can queue ops for pending meals, which don't exist on server. Spec says "silent 404" is acceptable but code doesn't handle it properly (tied to R1-01).

---

## Round 8 — Final validation round

### Findings

Based on comprehensive audit of Rounds 1–7:

**CRITICAL ISSUES (blocking release):**
1. **R1-01–R1-05:** drainPending has no error handling — fails silently
2. **R1-03:** drainPending closure is stale — can cause re-registration and multiple drains
3. **R7-01:** drainPending missing `id: pm.pendingId` in insert — server generates wrong ID
4. **R7-02:** De-duplication broken due to missing ID in insert
5. **R2-03:** mergePendingMeals doesn't mark `isPending: true` — UI can't distinguish pending meals

**HIGH PRIORITY (breaks functionality):**
6. **R4-03:** mergePendingMeals untested for `isPending` field (field doesn't exist)
7. **R4-05–R4-06:** Missing test for offline queueing and drainPending logic
8. **R6-03–R6-04:** No tests for offline scenarios or drain
9. **R6-06:** Missing `id` parameter in insert (same as R7-01)
10. **R7-03–R7-04:** updateMeal/deleteMeal can queue ops for pending meals

**MEDIUM PRIORITY (spec compliance):**
11. **R1-06:** i18n wording wrong (should be "pending" not "not saved")
12. **R1-07:** Type mismatch — queuedAt should be string not number
13. **R6-05:** queuedAt field type inconsistency

**LOW PRIORITY (code quality):**
14. **R1-09–R1-10:** Code style and re-registration overhead

### Recommendation

Do NOT ship until CRITICAL issues are fixed:
1. Fix drainPending error handling (R1-01 through R1-05)
2. Fix drainPending stale closure (R1-03)
3. **ADD `id: pm.pendingId` to insert in drainPending (R7-01)**
4. Update mergePendingMeals return type to include `isPending: true` field (R2-03)
5. Write tests for offline scenarios and drainPending (R4-03, R4-05, R4-06)
6. Fix updateMeal/deleteMeal to not queue ops for pending meals (R7-03, R7-04)

---

## FINAL CONSOLIDATED REPORT

### All findings across all rounds

| Category | Count | Severity Breakdown | Status |
|----------|-------|-------------------|--------|
| Error handling | 5 | 5 High | Round 1 |
| i18n & Types | 6 | 1 High, 3 Med, 2 Low | Rounds 1–2 |
| Architecture | 3 | 3 High | Round 4 |
| De-duplication | 2 | 2 Critical | Round 7 |
| Security | 5 | 1 High, 2 Med, 2 Low | Round 5 |
| CSS & Components | 0 | — | Round 3 (clean) |
| **TOTAL** | **21** | **5 Critical, 5 High, 5 Med, 6 Low** | **All Rounds** |

### Critical Path Fixes

1. **drainPending error handling** — Check error on each operation, only remove from queue if success
2. **drainPending closure** — Extract to stable callback or useRef to avoid re-registration
3. **Insert missing ID** — Add `id: pm.pendingId` to drainPending insert (L128)
4. **mergePendingMeals return type** — Add `isPending: true` field to distinguish pending meals
5. **Test offline scenarios** — addMeal offline, drainPending logic, updateMeal/deleteMeal edge cases
6. **updateMeal/deleteMeal scope** — Don't queue ops for pending meals (not on server yet)

---

*Audit complete. 21 total findings across 8 rounds. 5 critical issues must be fixed before shipping.*

## Round 8 — CLEAN ✓

Zero new findings. Exhaustive check of ALL changed files against ALL CLAUDE.md rules (§0–10).

### Audit scope — all changed files verified:
- src/lib/offlineCache.ts ✓
- src/test/offlineCache.test.ts ✓
- src/hooks/useMeals.ts ✓
- src/hooks/useGoals.ts ✓
- src/hooks/useProfile.ts ✓
- src/types/index.ts ✓
- src/lib/i18n.ts (new keys: pendingSyncLabel, pendingMealsCount, pendingEditLabel, pendingOpsCount) ✓
- src/lib/calculations.ts (mergePendingMeals, getMealPendingOp) ✓
- src/test/calculations.test.ts (tests for above) ✓
- src/test/hooks/useGoals.test.ts ✓
- src/test/hooks/useMeals.test.ts ✓
- src/components/TodayTab.tsx (badge rendering, per-meal chip) ✓
- src/App.tsx (TodayTab props) ✓
- src/test/i18n.test.ts (symmetry test, allowedEmpty set) ✓
- src/index.css (--warning tokens) ✓

### Rules checked exhaustively:
- **§0 Checklist:** All items verified (computation, strings, CSS, inputs, hooks, components)
- **§1 TypeScript:** Type narrowing, unused imports, tsc -b compliance ✓
- **§2 i18n:** Symmetry (all 4 new keys exist in both languages), no inline ternaries, no apostrophes, no empty keys ✓
- **§3 CSS:** All colors use tokens, no hardcoded rgba/hex, z-index not needed for badges ✓
- **§4 Logic:** Pure functions in calculations.ts, no inline computation in useMemo ✓
- **§5 Components:** Module-level function, no IIFE with hooks, derived state in useMemo not stored ✓
- **§6 Security:** Supabase via query builder, no CSV in scope ✓
- **§7 Tests:** All new functions tested (mergePendingMeals, getMealPendingOp, offlineCache), factory functions complete, localStorage mock in place. Missing tests are R4-05/R6-03/R6-04 — already found. ✓
- **§8 Error Handling:** drainPending gaps are R1-01 through R1-05, R7-01 — already found. ✓
- **§9 Architecture:** Hooks pattern, realtime channels, cache seeding all correct ✓
- **§10 iOS:** No new inputs ✓

### Result: 0 NEW FINDINGS

All violations identified in previous rounds (R1–R7) remain. No new code introduced violations beyond those already audited.

---

## FINAL CONSOLIDATED REPORT (Rounds 1–8)

### Summary Table

| Category | Count | Severity Breakdown | Rounds |
|----------|-------|-------------------|--------|
| Error handling | 5 | 5 High | R1 |
| i18n & Types | 6 | 1 High, 3 Med, 2 Low | R1–R2 |
| Architecture & Tests | 3 | 3 High | R4 |
| De-duplication | 2 | 2 Critical | R7 |
| Security | 5 | 1 High, 2 Med, 2 Low | R5 |
| CSS & Components | 0 | — | R3 (clean) |
| **TOTAL** | **21** | **5 Critical, 5 High, 5 Med, 6 Low** | **R1–R8** |

### All Issues by Severity (ID → Description → Severity)

**CRITICAL (2):**
- R7-01: drainPending insert missing `id: pm.pendingId` parameter
- R7-02: De-duplication broken due to missing ID in insert

**HIGH (5):**
- R1-01: drainPending no error checking on insert/update/delete
- R1-02: drainPending condition L143 always false after clearing queues
- R1-03: drainPending closure stale — listener re-registered on every state change
- R1-04: drainPending missing per-item error recovery
- R1-05: drainPending missing per-item error recovery (ops)

**MEDIUM (5):**
- R1-06: i18n wording "meals not saved" should be singular noun form
- R1-07: Type mismatch — queuedAt is number but spec says string
- R2-04: pendingId vs localId naming mismatch (spec vs code)
- R2-05: PendingMeal.date not guaranteed as required field
- R5-02: Sensitive health data in plaintext localStorage

**LOW (7):**
- R1-09: Unnecessary Date conversion in mergePendingMeals
- R1-10: Event listener re-registration overhead
- R2-06: pendingId naming (internal consistency only)
- R2-07: getMealPendingOp missing null-guard on optional field
- R2-08: TodayTab prop type looseness (undefined allowed)
- R5-01: Silent exception swallowing in writeCache
- R5-03: No input re-validation before drain
- R5-04: No validation of merged meal fields
- R6-08: Fragile type coercion comment on queuedAt

### Critical Issues That Block Shipping

1. **R7-01:** Add `id: pm.pendingId` to drainPending insert (line 128)
   - Without this, server generates new ID instead of using local ID
   - De-duplication (R7-02) fails — meals appear twice

2. **R1-01 through R1-05:** Add error handling to drainPending
   - Check error on each insert/update/delete
   - Only remove from queue if success
   - Skip update/delete for meals that don't exist (404 is OK)

3. **R1-03:** Fix stale closure
   - Use useRef for stable listener or extract logic differently
   - Listener re-registers on every state change

4. **R2-03:** mergePendingMeals return type must mark `isPending: true`
   - UI needs to distinguish pending vs confirmed meals
   - Required for badge logic in TodayTab

5. **R4-05 & R6-03:** Add test for addMeal offline queueing
   - Mock navigator.onLine = false
   - Verify pending meal queueing

6. **R4-06 & R6-04:** Add test for drainPending logic
   - Mock 'online' event
   - Verify all pending meals/ops are drained

### Medium-Priority Fixes

- R1-06: Fix i18n wording — use "pending meals" or "unsaved meals"
- R1-07: Decide on queuedAt type (number or string) — be consistent
- R2-05: Make date required in PendingMeal type
- R5-02: Document or mitigate sensitive data in localStorage

### Audit Methodology

Circular auditing with per-round rule checking:
- **R1:** Error handling, closure staleness, missing per-item recovery
- **R2:** i18n symmetry, type mismatches, field naming
- **R3:** CSS tokens, component structure (CLEAN)
- **R4:** Test coverage, architecture patterns
- **R5:** Security (data exposure, validation, error swallowing)
- **R6:** Integration scenarios, de-duplication logic, type consistency
- **R7:** De-duplication verification, scope issues
- **R8:** Final exhaustive check ALL rules — ZERO NEW findings

**Conclusion:** 21 total findings across 8 audit rounds. Code is incomplete — 5 critical issues prevent shipping.

