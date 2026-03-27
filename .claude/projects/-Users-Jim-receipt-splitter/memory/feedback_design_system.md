---
name: Tablink Design System Consistency
description: All UI redesigns must follow the same cohesive design language — no visual elements that break from the established system
type: feedback
---

All screens must share one cohesive visual language. Do not introduce new visual vocabulary per-screen.

**Why:** User flagged that the floating pill tab bar and sign-in's different surface opacities broke from the home screen's established aesthetic. Every screen is part of the same redesign.

**How to apply:** When redesigning any Tablink screen, follow these established tokens:

- **Surfaces**: `colors.surface` bg + `rgba(255, 255, 255, 0.05)` border + borderRadius 12
- **Dividers**: `rgba(255, 255, 255, 0.06)` 1px lines
- **Navigation indicators**: 2px green underline (not pills, not background highlights)
- **Shadows**: none, except FAB colored glow
- **Press feedback**: `opacity: 0.7`
- **CTA buttons**: `colors.primary` bg, `#000` text, weight 700, borderRadius 12
- **Disabled states**: `colors.surface` bg with standard border, `colors.muted` text
- **Typography**: weight 800 for brand/headings, 600-700 for labels, uppercase + letterSpacing for small labels
- **Animations**: Reanimated FadeInDown with stagger
- **Layout**: flat, edge-to-edge — no floating elements besides FAB

Reference the `SKILL.md` at `.claude/skills/frontend-design/SKILL.md` for overarching design philosophy.
