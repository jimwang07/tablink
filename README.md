# Tablink Monorepo

This pnpm + Turborepo workspace hosts the Tablink mobile app and guest web experience.

## Structure

- `apps/mobile` – Expo React Native app for hosts to scan receipts, manage claims, and share tablinks.
- `apps/guest-web` – Next.js site serving the public tablink flow for guests to claim items.
- `packages/*` – Reserved for shared utilities (types, Supabase SDK wrappers, design tokens) as they emerge.

## Commands

Use pnpm from the repository root:

```bash
pnpm install
pnpm dev      # runs `turbo run dev`
pnpm build    # builds all apps
pnpm lint     # lints all apps
```

Run project-specific scripts with Turbo:

```bash
pnpm turbo run dev --filter @tablink/mobile
pnpm turbo run dev --filter @tablink/guest-web
```

## Next Steps

- Define shared packages (e.g., Supabase client, data contracts, design tokens).
- Configure CI and EAS workflows targeting this workspace layout.
- Flesh out architecture tasks for the mobile host flow and guest web claim experience.
