PAGE: landing
SCREENSHOT: audit-1-landing-desktop.png (mobile: audit-1-landing-mobile.png)

CURRENT STATE:
- Layout description (what's on screen, left to right, top to bottom)
  - Full-screen dark hero with centered badge, large headline, supporting paragraph, single primary CTA, then stacked marketing sections ("Three steps", product/comparison stats, final CTA).
  - A persistent Next.js issue badge appears bottom-left and occasionally an issue overlay panel appears.
- Colors used
  - Near-black background, white primary text, amber/yellow accent for key words and CTA, muted gray secondary text.
- Typography (font sizes, weights)
  - Very large bold H1 on hero, medium-weight section headers, regular body copy; strong contrast between headline and supporting text.
- Spacing and density
  - Desktop spacing is generous and readable; mobile is overly constrained with massive headline wrapping and poor above-the-fold balance.
- Components visible
  - Badge/pill, primary CTA button, section headings, three-step cards/blocks, comparison columns, stat counters, footer-like trust copy, dev issue badge.

BEGINNER CONFUSION POINTS:
- List every word, label, or number a non-trader won't understand
  - "Jupiter Prediction Markets", "Black-Scholes probability model", "first-mover alerts", "paper trading win rate", "markets analyzed".
- List every element that's purpose isn't immediately obvious
  - Why there are two "Get Early Access" interactive instances in snapshot.
  - The meaning/method of "0% paper trading win rate" and "0+ markets analyzed" placeholders.
- List anything that looks broken or empty
  - Hydration error overlay present in snapshot and issue badge visible.
  - Multiple numeric stats showing zero/placeholder values.

DATA ISSUES:
- What data is missing or wrong
  - KPI numbers appear as placeholders (0+, 0%, etc.) with no loading rationale.
  - No evidence source for claims (scan frequency, speed, model quality).
- What should be showing but isn't
  - Real baseline demo metrics, timestamped "last updated", and trust context (sample alerts or model confidence examples).

ENHANCEMENT OPPORTUNITIES:
- Specific UI improvements with exact component descriptions
  - Replace static KPI strip with `MetricCard` components including value, delta, and "sample/demo" label.
  - Add a short "What you get in first 24 hours" 3-bullet onboarding block under hero CTA.
- What information hierarchy should change
  - Move plain-English explanation above technical claim blocks; defer model terminology below fold.
- What should be added, removed, or reworded
  - Remove/reduce technical jargon in hero and comparison.
  - Add visible disclaimer for simulated data if metrics are mock.
- Exact copy suggestions (current → replacement)
  - "Black-Scholes probability model" → "AI odds model (explained in plain English)"
  - "First-mover alerts within minutes" → "Get notified quickly when new opportunities appear"
  - "0% Paper trading win rate" → "Performance data coming soon (demo mode)"

PRIORITY: High

---

PAGE: login
SCREENSHOT: audit-2-login-desktop.png (mobile: audit-2-login-mobile.png)

CURRENT STATE:
- Layout description (what's on screen, left to right, top to bottom)
  - Centered auth card with logo, app name, subtitle, one "Connect Wallet" button, Phantom install notice, three tiny reassurance bullets, and explanatory paragraph.
- Colors used
  - Same dark/amber palette as landing; amber used for warning/info strip and links.
- Typography (font sizes, weights)
  - Medium-bold product name, small subtitle/body text, very small helper bullets near unreadable on mobile.
- Spacing and density
  - Desktop spacing is acceptable; mobile shows large unused right-side canvas and cramped card text near lower fold.
- Components visible
  - Auth card, primary button, inline warning/notice panel, link, icon bullets, dev issue badge.

BEGINNER CONFUSION POINTS:
- List every word, label, or number a non-trader won't understand
  - "Phantom", "wallet", "$1,000 paper USDC".
- List every element that's purpose isn't immediately obvious
  - Whether "Connect Wallet" is mandatory for trying demo mode.
  - Why install prompt appears before user action.
- List anything that looks broken or empty
  - Right side of viewport appears empty/unused at many sizes.
  - No alternate sign-in path when wallet extension is unavailable.

DATA ISSUES:
- What data is missing or wrong
  - No status indicator for wallet detection (installed/not installed/checking).
  - No explanation of why wallet auth is required for paper trading.
- What should be showing but isn't
  - Fallback options: "Continue with read-only demo", "How wallet login works", clear eligibility states.

ENHANCEMENT OPPORTUNITIES:
- Specific UI improvements with exact component descriptions
  - Add `WalletStatusRow` (Detected/Not detected) under CTA.
  - Add `SecondaryActionButton` for "View demo dashboard (read-only)".
- What information hierarchy should change
  - Move "No password needed / paper trading..." above Phantom install warning to reduce anxiety.
- What should be added, removed, or reworded
  - Replace install-only framing with optional path and explanation.
- Exact copy suggestions (current → replacement)
  - "Install Phantom to continue" → "To place paper bets, connect a Solana wallet (Phantom recommended)"
  - "Connect Wallet" → "Connect wallet to start demo"
  - "No password. No email." → "No password or email required"

PRIORITY: High

---

PAGE: dashboard
SCREENSHOT: audit-3-dashboard-desktop-v2.png (mobile: audit-3-dashboard-mobile.png)

CURRENT STATE:
- Layout description (what's on screen, left to right, top to bottom)
  - Route title indicates dashboard, but rendered UI transitions to login card and/or "Redirecting to login..." state.
- Colors used
  - Same dark theme as login, no dashboard-specific visual identity visible.
- Typography (font sizes, weights)
  - Only small redirect text or login-card typography visible.
- Spacing and density
  - Feels like an abrupt state swap; no structured loading shell.
- Components visible
  - Redirect text, login card, wallet CTA, install prompt, dev badge.

BEGINNER CONFUSION POINTS:
- List every word, label, or number a non-trader won't understand
  - "Redirecting to login..." without explanation of why.
- List every element that's purpose isn't immediately obvious
  - Whether redirect is expected, failed auth, or app error.
- List anything that looks broken or empty
  - No actual dashboard components render.
  - Route/title mismatch vs visible content.

DATA ISSUES:
- What data is missing or wrong
  - No portfolio, alerts, performance, positions, or balance data.
  - No auth-state diagnostics (expired token vs missing wallet vs backend error).
- What should be showing but isn't
  - Dashboard skeleton/loading and explicit access-state messaging.

ENHANCEMENT OPPORTUNITIES:
- Specific UI improvements with exact component descriptions
  - Add `AuthGateState` component with three clear modes: loading, unauthenticated, session-expired.
  - Add dashboard skeleton (`Topbar`, `KpiCards`, `RecentAlertsTable`) while auth resolves.
- What information hierarchy should change
  - Show reason + next step before forcing redirect.
- What should be added, removed, or reworded
  - Add stable CTA pair: "Connect wallet" + "Back to landing".
- Exact copy suggestions (current → replacement)
  - "Redirecting to login..." → "Your session isn't active. Connect your wallet to open your dashboard."

PRIORITY: High

---

PAGE: dashboard/alerts
SCREENSHOT: audit-4-alerts-desktop.png (mobile: audit-4-alerts-mobile.png)

CURRENT STATE:
- Layout description (what's on screen, left to right, top to bottom)
  - Alerts route reports title "Alerts" but renders redirect-to-login state and then login card.
- Colors used
  - Dark + amber auth palette; no alert-specific UI shown.
- Typography (font sizes, weights)
  - Redirect text + login card text only.
- Spacing and density
  - Sparse intermediate state, then centered card.
- Components visible
  - Redirect text/login card, wallet CTA, Phantom notice.

BEGINNER CONFUSION POINTS:
- List every word, label, or number a non-trader won't understand
  - "Alerts" context is missing, so users cannot map what an alert is.
- List every element that's purpose isn't immediately obvious
  - Why "Alerts" page does not show any alert list or explanation.
- List anything that looks broken or empty
  - Core route content absent.
  - No empty-state message specific to alerts.

DATA ISSUES:
- What data is missing or wrong
  - No alert feed, timestamps, confidence, market names, or alert types.
- What should be showing but isn't
  - At minimum: "No alerts yet" with onboarding instructions and notification setup state.

ENHANCEMENT OPPORTUNITIES:
- Specific UI improvements with exact component descriptions
  - Add `AlertsEmptyState` card with icon, short explanation, and setup CTA.
  - Add `AlertsTable` headers even when empty to teach users expected data.
- What information hierarchy should change
  - Put "How alerts work" above the list area for first-time users.
- What should be added, removed, or reworded
  - Add state-specific copy when blocked by auth.
- Exact copy suggestions (current → replacement)
  - "Redirecting to login..." → "Sign in to view your alert feed and notification history."

PRIORITY: High

---

PAGE: dashboard/bets
SCREENSHOT: audit-5-bets-desktop.png (mobile: audit-5-bets-mobile.png)

CURRENT STATE:
- Layout description (what's on screen, left to right, top to bottom)
  - Dedicated 404 page with "404 | This page could not be found." centered on dark background.
- Colors used
  - Black background, white text, subtle divider.
- Typography (font sizes, weights)
  - Large "404" and medium supporting sentence.
- Spacing and density
  - Extremely sparse; no recovery actions.
- Components visible
  - 404 headline/subtext only, plus dev issue badge.

BEGINNER CONFUSION POINTS:
- List every word, label, or number a non-trader won't understand
  - None; message is generic.
- List every element that's purpose isn't immediately obvious
  - User has no action path (no home/dashboard link).
- List anything that looks broken or empty
  - Route requested by product flow is missing entirely.

DATA ISSUES:
- What data is missing or wrong
  - Missing bets module/route; no historical or active bet data.
- What should be showing but isn't
  - Bets table, filters, P/L summary, and detail drawer.

ENHANCEMENT OPPORTUNITIES:
- Specific UI improvements with exact component descriptions
  - Replace generic 404 with `RouteNotReadyState` component including CTA buttons.
  - Add `BackToDashboardButton` and `GoToAlertsButton`.
- What information hierarchy should change
  - Show actionable next step first, technical route status second.
- What should be added, removed, or reworded
  - Add clear statement whether feature is removed, renamed, or not launched.
- Exact copy suggestions (current → replacement)
  - "This page could not be found." → "Bets page is not available yet. Go to Dashboard or Alerts."

PRIORITY: High

---

PAGE: dashboard/settings
SCREENSHOT: audit-6-settings-desktop.png (mobile: audit-6-settings-mobile.png)

CURRENT STATE:
- Layout description (what's on screen, left to right, top to bottom)
  - Settings route title appears, then state redirects to login card; no settings sections rendered.
- Colors used
  - Same auth dark/amber palette.
- Typography (font sizes, weights)
  - Redirect text/login typography only.
- Spacing and density
  - Single-card auth layout, no settings information density.
- Components visible
  - Redirect/login card elements, wallet button, install note.

BEGINNER CONFUSION POINTS:
- List every word, label, or number a non-trader won't understand
  - "Settings" with no visible settings categories.
- List every element that's purpose isn't immediately obvious
  - Whether access is denied, session expired, or route broken.
- List anything that looks broken or empty
  - Entire settings surface missing.

DATA ISSUES:
- What data is missing or wrong
  - No profile, notification, risk, or wallet preference data.
- What should be showing but isn't
  - Settings nav/tabs and persisted preferences.

ENHANCEMENT OPPORTUNITIES:
- Specific UI improvements with exact component descriptions
  - Add `SettingsSkeleton` with placeholders for account, alert preferences, and risk controls.
  - Add `SessionExpiredBanner` with reconnect CTA and reason text.
- What information hierarchy should change
  - Prioritize "why you're seeing this" over immediate redirect.
- What should be added, removed, or reworded
  - Keep user on route and show reconnect panel instead of abrupt swap.
- Exact copy suggestions (current → replacement)
  - "Redirecting to login..." → "Your session has ended. Reconnect your wallet to manage settings."

PRIORITY: High

---

# 1. CURRENT STATE SUMMARY

Landing page is visually polished in dark/amber branding and communicates value proposition clearly at a high level, but it leaks implementation issues (hydration warning badge) and relies on jargon and placeholder metrics that reduce trust for new users.

Login page presents a clean single-card wallet-first flow, but it lacks fallback paths, clear prerequisite explanation, and readable mobile hierarchy. It assumes users understand wallet tooling and does not teach why wallet auth is required.

Dashboard route does not render actual dashboard content during this audit. It oscillates between redirect text and login card state, creating a route/title mismatch and preventing product validation for the core app experience.

Alerts route similarly fails to render alert-specific content and falls back to auth redirect state. No empty state, no sample list, and no instructional context are provided.

Bets route returns a hard 404 with no recovery action. This appears to be either an unimplemented route or stale navigation target and is high-impact because it breaks expected user flow.

Settings route displays redirect-to-login behavior rather than settings UI. It provides no guidance about what failed or how to restore access beyond a generic wallet reconnect path.

# 2. TOP 10 HIGHEST IMPACT CHANGES

1. Fix authenticated route gating so `/dashboard`, `/dashboard/alerts`, and `/dashboard/settings` render intended content after valid session checks.
2. Restore or remove `/dashboard/bets` from navigation; avoid exposing dead routes.
3. Resolve hydration/runtime errors visible on landing (issue badge/overlay) before production demos.
4. Add explicit auth-state UX (`loading`, `session expired`, `unauthenticated`) instead of abrupt route swaps.
5. Add beginner-safe copy replacing core jargon across hero, comparison, and alerts explanations.
6. Replace placeholder KPI values with real, demo-labeled, or hidden-until-available metrics.
7. Improve mobile layout at 375px: reduce hero headline scale and prevent oversized empty/right-side canvas.
8. Add route-specific empty states (especially Alerts) that explain next action.
9. Add fallback access path on login (read-only demo or "learn first" flow) for users without Phantom installed.
10. Provide consistent recovery CTAs on all error/blocked states (Back to Dashboard, Go to Login, Contact/Help).

# 3. COMPONENT INVENTORY

- `HeroBadge` (NightAgent early access pill)
- `PrimaryCTAButton` ("Get Early Access", "Connect Wallet")
- `SectionHeading` / `Subheading`
- `FeatureStepCard` (Scan/Analyze/Alert blocks)
- `ComparisonColumn` (Manual vs NightAgent)
- `KpiStatBlock` (Markets analyzed, win rate, alert delivery)
- `AuthCard`
- `InlineNoticePanel` (Phantom install notice)
- `BenefitBulletList` (No password, paper trading, keys remain in wallet)
- `RedirectingMessage` ("Redirecting to login...")
- `NotFoundState` (404 page)
- `DevIssueBadge` (Next.js issue badge/overlay, non-product UI but visible)

# 4. COLOR & TYPOGRAPHY AUDIT

- Primary palette appears consistent: near-black background, off-white text, amber accent for emphasis and actions.
- Visual inconsistency appears from debug overlay elements that break brand presentation.
- Typography hierarchy is strong on desktop (large H1, medium section heads, muted body), but mobile heading scale is too aggressive and harms readability.
- Card copy on login uses too-small text for mobile; informational/legal-style text is visually de-prioritized beyond usability.
- Missing semantic text styling for system states (error/warning/info) beyond generic amber block.

# 5. COPY AUDIT

Jargon and replacements:
- "Jupiter Prediction Markets" → "Prediction markets on Jupiter (where people trade on outcomes)"
- "Black-Scholes probability model" → "AI odds model"
- "First-mover alerts" → "Early opportunity alerts"
- "Paper USDC" → "Demo balance"
- "Paper trading win rate" → "Demo performance"
- "Markets analyzed" (without context) → "Markets scanned recently"
- "Connect Wallet" (without why) → "Connect wallet to access your demo dashboard"
- "Redirecting to login..." → "Your session is not active. Please reconnect your wallet."

# 6. BLANK/BROKEN STATES

- Landing: visible hydration/debug issue signal and placeholder metric values.
- Dashboard: no dashboard content rendered; redirect/login fallback shown instead.
- Alerts: no alerts UI rendered; redirect/login fallback shown instead.
- Bets: hard 404 with no recovery CTA.
- Settings: no settings UI rendered; redirect/login fallback shown instead.
- Cross-route: debug/issue badge visible in multiple screenshots, reducing production readiness impression.

# 7. MOBILE ISSUES

- At 375px, landing hero headline wraps into overly tall blocks and dominates viewport, pushing key explanatory text and CTA context below fold.
- Several mobile screenshots show large unused canvas area, suggesting responsive container constraints or viewport scaling issues.
- Login card helper text and reassurance bullets are too small and low-contrast for quick scanning.
- Route recovery/error states lack mobile-optimized action buttons and guidance.
- 404 page is readable but offers no mobile action path.

Notes:
- Cookie requested for auth: `nightagent_token=...` was provided, but the available browser MCP toolset in this environment does not expose a cookie-set/import API. Authenticated pages were therefore audited as rendered (redirect/login/404 states), and this blocker should be removed in tooling for a full in-app dashboard QA pass.
