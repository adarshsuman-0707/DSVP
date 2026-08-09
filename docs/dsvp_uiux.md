**UI/UX Design Document**

*Data Structure Visualization Platform (DSVP)*

Version 1.0 · 2026

1\. Design Principles

-   Split-screen focus: code and its live visualization are always
    visible together --- no tab switching, no context loss.

-   Clarity over decoration: the visualization canvas uses restrained
    color and motion so the data structure itself stays the focal point.

-   Immediate feedback: parse/runtime errors from the interpreter
    surface inline in the editor gutter, not buried in a separate
    console.

-   Progressive disclosure for monetization: premium modules stay
    visible in the catalog (locked, dimmed) rather than hidden, so
    upgrade paths feel earned, not hidden.

-   Consistency across structures: every visualizer (array, tree, graph,
    etc.) reuses the same playback bar, color language, and interaction
    pattern so skills transfer between modules.

2\. Color Palette & Typography

2.1 Palette

![](media/4f0738c2154bc12a69f0cbed81530836de8484a9.png){width="6.458333333333333in"
height="1.0104166666666667in"}

*Core palette --- primary/secondary drive chrome and controls;
success/danger/accent drive visualization state.*

  -----------------------------------------------------------------------
  **Token**          **Hex**         **Usage**
  ------------------ --------------- ------------------------------------
  Primary            #1F4E79         Top bar, headings, primary buttons

  Secondary          #2E74B5         Links, secondary buttons, default
                                     node/element fill

  Success            #4CAF50         Newly inserted elements, active
                                     pointer, completed progress

  Danger             #E15759         Deletions (fade-out), error states,
                                     destructive actions

  Accent             #F2A93B         Premium badges, upgrade CTAs,
                                     warnings

  Surface            #DCE6F1 /       Card backgrounds, locked-module
                     #F7F7F7         surfaces
  -----------------------------------------------------------------------

2.2 Typography

  ------------------------------------------------------------------------
  **Role**                  **Font**                     **Size / Weight**
  ------------------------- ---------------------------- -----------------
  UI text (body)            Inter / system sans-serif    14px regular

  Headings                  Inter                        20--32px,
                                                         semibold/bold

  Code editor               JetBrains Mono / Consolas    13--14px
                            (Monaco default)             

  Micro-labels (badges,     Inter                        11px medium,
  timestamps)                                            uppercase for
                                                         badges
  ------------------------------------------------------------------------

2.3 Motion

-   Structural transitions (insert/delete/rotate) animate over
    300--500ms with ease-in-out, matching a walking pace a learner can
    follow.

-   Playback speed control (0.5x--4x) scales this duration directly
    rather than skipping frames, so the same visual language holds at
    every speed.

-   Active-element highlight uses a persistent color state (not a
    blinking animation) to avoid distracting from the transition itself.

3\. Screen Wireframes

3.1 Workspace (core screen)

The primary screen learners spend nearly all their time on. Left panel
is the Monaco editor (dark theme default) with the current trace line
highlighted; right panel is the visualization canvas with an
always-visible playback bar.

![](media/20156c9e6f91dd16283af9448c5d5d5e791919ac.png){width="6.458333333333333in"
height="4.0in"}

*Workspace --- split-screen editor (left) and synchronized linked-list
visualization (right) with playback controls.*

Key interaction notes

-   Language and structure selectors sit in the top bar so switching
    context never requires leaving the screen.

-   The currently executing line is highlighted in the editor
    gutter/background, updating automatically as the playback pointer
    moves.

-   The active pointer/variable in the visualization (e.g. \'cur\' in a
    linked-list traversal) is called out with a label and a distinct
    border color, matching the success color token.

-   The playback bar shows a scrubbable progress line plus step counter
    ('Step 3 of 7'), so a learner can jump to any point in the trace,
    not just step sequentially.

-   Inline warnings (e.g. unsupported syntax in the client-side language
    subset) appear directly below the editor rather than as a blocking
    modal.

3.2 Module Catalog

A browsable grid of all modules. Free modules show live progress bars;
premium modules remain visible but visually recede (muted background,
lock icon) to signal availability without blocking discovery.

![](media/08e5bb0e2615edd6d6d47a55f676ac0b4d9a1c6e.png){width="6.458333333333333in"
height="3.6145833333333335in"}

*Module catalog --- free modules (top row, with progress) and premium
modules (bottom row, locked).*

-   Filter chips (All / Free / Premium) let users narrow the grid
    without a page reload.

-   Tapping a locked premium card opens the pricing/checkout flow rather
    than the workspace.

3.3 Admin Analytics Dashboard

Admin\'s landing screen. Left rail provides navigation to Users,
Modules, Payments, and Settings; the main area surfaces the KPIs an
admin needs at a glance before drilling into any single area.

![](media/eea297190133dc49347a56ef3c5b04f59994c7a4.png){width="6.458333333333333in"
height="3.6145833333333335in"}

*Admin dashboard --- KPI cards, module popularity chart, conversion
funnel, and recent signups.*

-   KPI cards use tinted (not saturated) backgrounds so four cards can
    sit side-by-side without competing for attention.

-   The conversion funnel chart doubles as a navigation aid --- each
    stage can be clicked to filter the Users table to that segment.

4\. Component Library

  -----------------------------------------------------------------------
  **Component**      **States**                    **Notes**
  ------------------ ----------------------------- ----------------------
  Language selector  default, open, disabled       Locked during active
                     (mid-execution)               playback to avoid
                                                   trace/language
                                                   mismatches

  Structure selector default, open, locked-premium Premium entries show
                                                   lock icon + tooltip on
                                                   hover

  Playback bar       playing, paused, at-start,    Scrub handle snaps to
                     at-end, dragging              discrete trace steps,
                                                   not continuous time

  Visualization node default, active/current,      Shared shape/style
                     inserted (enter animation),   contract across all
                     removed (exit animation),     structure renderers
                     error                         

  Module card        free-in-progress,             Progress bar only
                     free-complete,                rendered for
                     premium-locked,               accessible modules
                     premium-unlocked              

  Editor error       hidden, single-error,         Non-blocking; sits
  banner             multi-error (expandable)      below editor, never a
                                                   modal

  Admin KPI card     default, loading (skeleton),  Skeleton shimmer while
                     error                         analytics query
                                                   resolves
  -----------------------------------------------------------------------

5\. Responsive Behavior

5.1 Breakpoints

  ------------------------------------------------------------------------
  **Breakpoint**   **Width**          **Layout Change**
  ---------------- ------------------ ------------------------------------
  Desktop          ≥ 1200px           Full split-screen workspace as
                                      designed

  Tablet           768-- 1199px       Split-screen retained but panels
                                      narrow; playback bar controls
                                      collapse to icon-only

  Mobile           \< 768px           Workspace becomes tabbed (Code /
                                      Visualize) instead of split; editing
                                      on mobile is view/step-focused, not
                                      primary authoring surface
  ------------------------------------------------------------------------

5.2 Accessibility

-   Color is never the sole indicator of state ---
    inserted/removed/active elements also carry a label or icon.

-   Playback controls are fully keyboard-operable (space = play/pause,
    arrow keys = step) and screen-reader labeled.

-   Minimum contrast ratio of 4.5:1 maintained between text and
    background across all defined color tokens.

6\. Next Steps for High-Fidelity Design

-   Translate these wireframes into high-fidelity mockups (Figma) using
    the palette and type scale defined here.

-   Prototype the playback-bar scrubbing interaction to validate
    step-snapping feel before frontend implementation.

-   User-test the locked-premium card treatment to confirm it drives
    upgrades without feeling punitive.

-   Extend the component library with dark-mode tokens for the
    visualization canvas to match the editor\'s default dark theme.
