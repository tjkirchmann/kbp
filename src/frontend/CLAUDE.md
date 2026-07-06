# Frontend — Playwright UI Testing & Design Review

This project has a **Playwright MCP server** configured at the agent harness level. No repo install
is needed — the browser is available as tool calls in any session.

---

## Prerequisites

The app must be running before any browser work:

```bash
make up   # starts frontend (:5173), backend (:8000), db, workers
```

Confirm it's live before navigating:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
# expect: 200
```

---

## When to use Playwright

| Situation                              | What to do                                             |
| -------------------------------------- | ------------------------------------------------------ |
| Just built or changed a UI component   | Screenshot + snapshot it before calling it done        |
| Reviewing a page against `DESIGN.md`   | Navigate, screenshot, compare visually                 |
| Verifying a user flow works end-to-end | Navigate through the steps, snapshot each state        |
| Checking responsive behaviour          | Resize the viewport, re-screenshot                     |
| Debugging a layout bug                 | Screenshot to see the actual render, not just the code |
| Catching regressions after a refactor  | Screenshot before and after                            |

---

## Core workflow

### 1. Navigate to a page

```
playwright_browser_navigate({ url: "http://localhost:5173" })
```

### 2. Take a screenshot — read it back immediately

Screenshots are only useful if you read them back so the model can see them:

```
playwright_browser_take_screenshot()   # captures to .playwright-mcp/*.png
read({ path: ".playwright-mcp/<filename>.png" })  # read it into context
```

**Always read the screenshot after taking it.** The file on disk is not automatically
visible — you must explicitly read it into context.

### 3. Accessibility snapshot

For structure and interaction checks (doesn't require image support):

```
playwright_browser_snapshot()
```

Returns the full accessibility tree — headings, buttons, links, form fields, with
refs you can use for click/fill/select actions.

---

## Design review checklist

When reviewing a page against `DESIGN.md`, check:

- **Background**: warm tan graph-paper grid visible (not overridden by a white/grey wrapper)
- **Cards**: outer panels use `bg-card border border-border rounded-xl shadow-sm`
- **Typography**: Geist Sans, correct weight/size hierarchy
- **Colors**: semantic classes only (`bg-primary`, `text-muted-foreground`, etc.) — no raw hex or Tailwind color utilities like `bg-zinc-800`
- **Icons**: Lucide only, `size-4` inline / `size-5` standalone
- **No dark variants**: no `dark:` classes anywhere
- **Spacing**: consistent padding — panels `p-6`, inner content `p-4`

If anything looks off in the screenshot, grep the source for the raw value before fixing.

---

## Interacting with pages

Use refs from the accessibility snapshot to drive interactions:

```
playwright_browser_click({ ref: "e12" })                  # click by ref
playwright_browser_fill_form([{ ref: "e7", value: "..." }]) # fill a form
playwright_browser_select_option({ ref: "e9", values: ["Alabama"] })
playwright_browser_press_key({ key: "Enter" })
```

After each interaction, take a fresh screenshot or snapshot to see the new state.

---

## Network & console inspection

```
playwright_browser_network_requests()    # all requests since page load
playwright_browser_console_messages()   # console.log / errors / warnings
```

Useful for confirming API calls fired, checking for 401s, or catching JS errors
that don't surface visually.

---

## Viewport / responsive testing

```
playwright_browser_resize({ width: 375, height: 812 })   # iPhone 14
playwright_browser_resize({ width: 1280, height: 800 })  # desktop default
```

KBP is desktop-first but the picks page should be usable on mobile. Screenshot
both after resizing.

---

## Practical example — reviewing a new page

```
1. make up
2. playwright_browser_navigate({ url: "http://localhost:5173/picks" })
3. playwright_browser_take_screenshot()
4. read({ path: ".playwright-mcp/<latest>.png" })   ← look at it
5. playwright_browser_snapshot()                     ← check structure
6. Cross-reference with DESIGN.md — flag anything off
7. playwright_browser_navigate({ url: "http://localhost:5173/leaderboard" })
8. Repeat 3–6
```

---

## Notes

- Screenshots save to `.playwright-mcp/` (gitignored — don't commit them)
- The browser session persists across tool calls in a conversation — no need to
  re-navigate after every action
- Clerk auth gates most pages; to review authenticated views, navigate to the
  sign-in page first and complete the flow via `playwright_browser_fill_form` +
  `playwright_browser_click`
