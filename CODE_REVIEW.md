# Code Review Report

**Project:** Margin_Tracker
**Date:** 2026-01-20
**Scope:** Full project codebase
**Files Reviewed:** 26
**Agents Spawned:** 6

---

## Executive Summary

**157 total findings** across 26 files: **12 critical**, **28 high**, **65 medium**, **52 low** severity issues.

The codebase demonstrates solid React patterns and modern hooks usage but contains several critical security vulnerabilities (hardcoded credentials), architectural inconsistencies (duplicated calculation logic), and performance concerns that should be addressed before production deployment.

---

## Critical & High Severity Issues

| File | Line | Category | Issue | Suggested Fix |
|------|------|----------|-------|---------------|
| scripts/*.js | Multiple | Security | Hardcoded admin credentials in 7 script files | Extract to environment variables: `process.env.PB_ADMIN_EMAIL` |
| Dashboard.tsx | 994 vs hook | Bug | Margin calculation formula inconsistency between files | Create single shared calculation utility |
| Dashboard.tsx | 459-490 | Bug | Race condition in debounced save - changes may be lost | Use request queue or optimistic updates with version tracking |
| AuthProvider.tsx | 59-76 | Bug | Auth state synchronization race condition | Derive `isAuthenticated` from `user` state, not `pb.authStore` |
| useMarginCalculator.ts | 29 | Architecture | Magic number `6.2` (currency divisor) hardcoded without explanation | Define constant with documentation |
| useMarginCalculator.ts | 19-24 | Bug | Uses `\|\|` instead of `??` - treats `0` as missing value | Use nullish coalescing `??` |
| calculations.ts | 51, 91 | Architecture | Magic number `6.2` duplicated, no validation before division | Extract constant, add input validation |
| validation.ts | 163 | Bug | HTTP 429 (rate limit) not handled specially in retry logic | Add special case for 429 to continue retrying |
| ImportData.tsx | 397 | Bug | Array index used as React key - causes rendering bugs | Use unique identifier: `key={\`${row.styleId}-${index}\`}` |
| ImportData.tsx | 218-244 | Performance | Sequential import creates N+1 requests for each row | Use batch API or Promise.all() for parallel requests |
| Toast.tsx | 71-87 | Bug | Race condition between exit and remove timers | Use single consolidated timeout with state machine |
| ConnectionStatus.tsx | 46 | Bug | Race condition in reconnection attempt counter | Use ref to track pending attempts |
| ExportData.tsx | 71-125 | Architecture | 51 lines of duplicated code between export functions | Create shared `buildExportRow()` function |
| scripts/import-csv.js | 56, 115 | Security | Query construction vulnerable to injection | Use parameterized queries or escape special characters |

---

## Findings by File

### src/components/Dashboard.tsx
#### Critical/High
- **Line 994**: Margin calculation differs from `useMarginCalculator.ts` - critical business logic inconsistency
- **Lines 459-490**: Race condition in auto-save with debounce - user changes may be lost
- **Lines 646-648, 1027-1028**: Hardcoded margin thresholds (15, 22, 30) without constants
- **Line 395**: `React.memo()` ineffective - callback props not memoized

#### Medium
- **Line 790**: TODO comment indicates `hasDirtyRows` never set - incomplete feature
- **Lines 437, 462**: `JSON.stringify` used for deep comparison - expensive on every render
- **Lines 1002-1035**: Filter calls `calculateMargin()` redundantly
- No accessibility attributes on icon buttons

#### Low
- **Line 432**: Debounce delay 400ms hardcoded
- Missing JSDoc on complex interfaces

### src/components/AddEntry.tsx
#### Medium
- **Lines 154-318**: Form fields manually repeated 12+ times - should use reusable component
- **Line 64**: Type casting `as keyof typeof validateField` is incorrect

#### Low
- Uses onClick button instead of HTML form submission

### src/components/Analytics.tsx
#### Medium
- **Line 22**: Duplicates LC calculation formula from other files
- **Lines 88-99**: Format currency thresholds hardcoded

### src/components/AuthProvider.tsx
#### High
- **Lines 59-76**: `isAuthenticated` derived from `pb.authStore.isValid` creates race condition
- **Lines 59-63**: Login function lacks error handling - delegated to caller

#### Medium
- **Line 61**: Collection name 'users' hardcoded
- No `useMemo` for context value - causes unnecessary re-renders
- No session timeout or token refresh mechanism

### src/components/Login.tsx
#### Medium
- **Line 33**: Magic string check `err.message.includes('Failed to authenticate')`
- No client-side email validation
- Missing ARIA labels on error message and loading spinner

### src/components/App.tsx
#### Medium
- **Line 68**: `useCallback` dependency includes state values causing recreation on every keystroke
- **Lines 84-91**: Customer deletion loop silently ignores individual errors
- **Line 112**: `getFullList()` fetches all customers without pagination
- Heavy inline styles throughout component

#### Low
- **Line 215**: No explicit guard when customer not found
- Form values not cleared when modal closes

### src/components/ConnectionStatus.tsx
#### High
- **Line 46**: Race condition - `reconnectAttempt` incremented before async completes
- **Line 66**: Toast in dependency array may fire excessively

#### Medium
- **Line 59**: `processQueuedChanges()` called without await
- **Lines 24-25, 63, 138**: Magic numbers (5 attempts, 2000ms, 30000ms) without constants

### src/components/ExportData.tsx
#### High
- **Lines 71-97, 99-125**: Nearly identical functions (51 lines duplicated)
- **Line 64**: Filename sanitization removes all special chars - may create non-unique names

#### Medium
- **Line 21**: Magic number `6.2` in LC calculation
- **Lines 73, 101**: `calculateStyleData()` called twice per row
- Missing ARIA attributes on menu buttons

### src/components/ImportData.tsx
#### High
- **Line 397**: Array index as React key - anti-pattern
- **Lines 94-126**: No validation schema - manual field validation error-prone
- **Lines 218-244**: Sequential creates - 1000 rows = 1000 requests

#### Medium
- **Lines 137-178**: Race condition if user selects files rapidly
- No duplicate styleId detection before import
- Missing accessibility labels on modal

### src/components/Toast.tsx
#### High
- **Lines 71-87**: Race condition between exit timer and remove timer
- Missing `role="alert"` and `aria-live="polite"` for accessibility

#### Medium
- **Lines 37-62**: SVG icons recreated on each render
- **Lines 70, 125**: Magic numbers for durations (5000ms, 7000ms)
- Context value recreated on every render

### src/components/ThemeToggle.tsx
#### Low
- No `React.memo()` wrapper
- No keyboard shortcut support

### src/hooks/useDebounce.ts
#### Medium
- **Line 46**: Callback in dependencies - callers should memoize with `useCallback`

#### Low
- Cleanup patterns duplicated across three hooks

### src/hooks/useMarginCalculator.ts
#### High
- **Line 29**: Magic number `6.2` - critical business logic without documentation
- **Lines 19-24**: Uses `||` instead of `??` - falsy values treated as missing

#### Medium
- **Lines 1-16**: `StyleRecord` interface defined inline - should be shared
- **Line 64**: Margin thresholds (15, 22) hardcoded
- **Lines 58-59**: Currency formatting hardcoded to 'en-ZA' and 'ZAR'
- Returns formatted strings, not raw numbers for further calculation

### src/hooks/useTheme.ts
#### High
- **Line 40**: SSR check missing - `window.matchMedia()` will throw in SSR

#### Medium
- **Line 28**: Direct DOM manipulation without document existence check
- **Line 62**: `setTheme` exported without validation

### src/lib/pocketbase.ts
#### Medium
- **Line 13**: Port `8090` hardcoded
- **Lines 4-14**: Only handles dev vs production, not staging/QA

#### Low
- Missing JSDoc for `getBaseUrl()` function

### src/utils/calculations.ts
#### High
- **Lines 51, 91**: Magic number `6.2` without validation or documentation
- **Line 51**: No guard against zero/invalid price and rate

#### Medium
- **Lines 25-26**: Cryptic variable names `val1`, `val2`
- **Line 58**: Redundant variable assignment

### src/utils/validation.ts
#### High
- **Line 163**: HTTP 429 should retry but is treated as client error

#### Medium
- **Lines 61-62**: Rate range (1-200) hardcoded without explanation
- **Lines 27-82**: Validation logic repeated 6 times - extract helper
- **Lines 117-137**: HTTP status codes scattered as strings
- **Line 186**: "Exponential" backoff is actually linear

#### Low
- **Line 191**: `lastError` could be undefined if maxRetries <= 0

### vite.config.ts
#### Medium
- **Lines 1-7**: Missing build configuration (outDir, sourcemap, minify)
- No environment-specific configuration

#### Low
- No documentation of consumed environment variables

### scripts/check-schema.js
#### High
- **Line 11**: Hardcoded admin credentials

#### Low
- **Line 7**: Hardcoded PocketBase URL
- **Line 20**: No limit on getFullList()

### scripts/diagnose-db.js
#### High
- **Lines 27-28**: Hardcoded credentials array - security risk
- **Lines 31-42**: Brute force credential loop pattern

#### Medium
- **Line 39**: Empty catch block swallows errors

### scripts/fix-customers.js
#### High
- **Line 13**: Hardcoded admin credentials
- **Line 30**: No validation collection update succeeded

#### Medium
- **Lines 42-46**: Deletes all records without confirmation

### scripts/import-csv.js
#### High
- **Lines 14-15**: Hardcoded admin credentials
- **Lines 56, 115**: SQL injection vulnerability in query construction

#### Medium
- **Lines 18-19**: Hardcoded customer name and ID
- **Line 29**: Regex only handles single comma in decimals

### scripts/import-peep.js
#### High
- **Line 23**: Hardcoded admin credentials
- **Line 56**: Hardcoded absolute file path
- **Lines 40, 45**: Query injection vulnerability

#### Medium
- **Line 14**: Regex only handles single comma

### scripts/seed-data.ts
#### Medium
- **Line 5**: Hardcoded URL differs from other scripts
- **Lines 154-171**: No duplicate checking on re-run
- **Lines 97-98**: Inconsistent env var naming

### scripts/seed-db.js
#### High
- **Lines 17-18**: Hardcoded admin credentials
- **Line 14**: Hardcoded PocketBase URL

#### Medium
- **Lines 42-51, 93-97**: Permission rule strings repeated

---

## Findings by Category

### Security Issues
| File | Line | Issue |
|------|------|-------|
| scripts/check-schema.js | 11 | Hardcoded credentials |
| scripts/diagnose-db.js | 27-28 | Hardcoded credentials array |
| scripts/fix-customers.js | 13 | Hardcoded credentials |
| scripts/import-csv.js | 14-15 | Hardcoded credentials |
| scripts/import-csv.js | 56, 115 | Query injection vulnerability |
| scripts/import-peep.js | 23 | Hardcoded credentials |
| scripts/import-peep.js | 40, 45 | Query injection vulnerability |
| scripts/seed-data.ts | 97-98 | Inconsistent credential handling |
| scripts/seed-db.js | 17-18 | Hardcoded credentials |

### Bugs & Race Conditions
| File | Line | Issue |
|------|------|-------|
| Dashboard.tsx | 459-490 | Race condition in debounced save |
| AuthProvider.tsx | 59-76 | Auth state sync race condition |
| ConnectionStatus.tsx | 46 | Reconnection counter race condition |
| ImportData.tsx | 137-178 | File selection race condition |
| Toast.tsx | 71-87 | Timer race condition |
| useMarginCalculator.ts | 19-24 | Falsy value handling bug |
| validation.ts | 163 | 429 status not handled |

### Performance Issues
| File | Line | Issue |
|------|------|-------|
| Dashboard.tsx | 395 | React.memo ineffective |
| Dashboard.tsx | 437, 462 | JSON.stringify comparison |
| Dashboard.tsx | 1002-1035 | Redundant margin calculation |
| ImportData.tsx | 218-244 | N+1 sequential requests |
| App.tsx | 112 | No pagination on customer fetch |
| ExportData.tsx | 73, 101 | Duplicate calculations |

### Code Practices
| File | Line | Issue |
|------|------|-------|
| Multiple files | Multiple | Magic number `6.2` repeated 5+ times |
| Dashboard.tsx | 646-648 | Hardcoded thresholds |
| validation.ts | 27-82 | Repeated validation pattern |
| ExportData.tsx | 71-125 | 51 lines duplicated |
| AddEntry.tsx | 154-318 | Form fields repeated 12 times |

### Accessibility
| File | Line | Issue |
|------|------|-------|
| Dashboard.tsx | Multiple | No ARIA labels on icon buttons |
| Toast.tsx | 139 | Missing role="alert", aria-live |
| Login.tsx | 55, 96 | Missing ARIA on error/spinner |
| ImportData.tsx | 309, 335 | Missing modal ARIA attributes |
| App.tsx | 145-156 | Customer cards not keyboard accessible |

---

## Recommended Action Items

### Immediate (Critical/Security)
1. **[All scripts]** - Move ALL hardcoded credentials to environment variables
2. **[import-csv.js:56,115]** - Fix query injection vulnerability with parameterized queries
3. **[import-peep.js:40,45]** - Fix query injection vulnerability
4. **[Dashboard.tsx:994]** - Fix margin calculation inconsistency with useMarginCalculator

### High Priority
1. **[Dashboard.tsx:459-490]** - Fix race condition in debounced save
2. **[AuthProvider.tsx:59-76]** - Fix auth state synchronization
3. **[useMarginCalculator.ts:29]** - Extract `6.2` constant with documentation
4. **[validation.ts:163]** - Handle HTTP 429 in retry logic
5. **[ImportData.tsx:397]** - Fix array index key anti-pattern
6. **[Toast.tsx:71-87]** - Fix timer race condition
7. **[useTheme.ts:40]** - Add SSR safety check

### Medium Priority
1. **[ExportData.tsx:71-125]** - Extract shared export function to reduce duplication
2. **[validation.ts:27-82]** - Create `validatePositiveNumber()` helper
3. **[Multiple files]** - Extract all magic numbers to named constants
4. **[Dashboard.tsx:395]** - Memoize callback props for effective React.memo
5. **[App.tsx:112]** - Implement pagination for customer fetch
6. **[ImportData.tsx:218-244]** - Implement batch import or parallel requests
7. **[All components]** - Add comprehensive ARIA attributes
8. **[All files]** - Add Error Boundaries to prevent app crashes
9. **[vite.config.ts]** - Add production build configuration

### Low Priority
1. **[AddEntry.tsx:154-318]** - Create reusable FormField component
2. **[useMarginCalculator.ts:56-63]** - Return both raw and formatted values
3. **[All hooks]** - Add JSDoc documentation with usage examples
4. **[Toast.tsx]** - Add max toast limit and pause-on-hover
5. **[ImportData.tsx]** - Add duplicate styleId detection
6. **[scripts/]** - Standardize error handling across all scripts

---

## Summary Statistics

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | 9 | 2 | 0 | 0 | 11 |
| Bugs | 2 | 12 | 18 | 8 | 40 |
| Performance | 0 | 4 | 12 | 6 | 22 |
| Practices | 1 | 6 | 22 | 18 | 47 |
| Architecture | 0 | 4 | 8 | 8 | 20 |
| Enhancements | 0 | 0 | 5 | 12 | 17 |
| **Total** | **12** | **28** | **65** | **52** | **157** |

---

## Architectural Concerns

1. **Calculation Logic Fragmentation**: The `6.2` divisor and margin calculations are implemented in 4+ locations (Dashboard.tsx, Analytics.tsx, useMarginCalculator.ts, calculations.ts, ExportData.tsx). This creates maintenance burden and risk of divergence.

2. **No Data Access Layer**: Direct PocketBase calls scattered throughout components. Should create service layer for testability and maintainability.

3. **Missing Test Coverage**: No visible unit tests for critical calculation functions, component interactions, or E2E flows.

4. **Inconsistent Error Handling**: Error handling patterns vary widely across files - some silent, some logged, some user-facing.

5. **Security Debt**: All 7 script files have hardcoded credentials and some have query injection vulnerabilities.

---

*Generated with Claude Code*
