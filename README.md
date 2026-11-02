# TraderTrades

The marketplace built for traders: communities, courses, mentoring, alert rooms, indicators and downloads from trading creators, plus a directory of prop firms, brokers and trading tools.

Built with Next.js 16 (App Router), React 19, Tailwind CSS 4, Prisma 7 and Postgres.

## Run it on your computer

1. Install Node.js 22 and Postgres 16.
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `APP_SECRET`.
3. Install and set up the database:

   ```bash
   npm install
   npx prisma migrate dev
   npm run dev
   ```

4. Open http://localhost:3000.

With no email service connected, emails are saved instead of sent. In preview mode (`DEMO_MODE=1`, the default outside production) the "confirm your email" page shows a link to open the saved email.

## Put it online (Vercel)

1. Push this code to a GitHub repository.
2. Sign in at [vercel.com](https://vercel.com) with GitHub and choose **Add New → Project**, then import the repository. Keep the default settings.
3. Before the first deploy (or right after it), open the project's **Storage** tab:
   - Add **Neon** (Postgres). It sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you.
   - Add **Blob**. It sets `BLOB_READ_WRITE_TOKEN`, which is needed for uploads.
4. In **Settings → Environment Variables**, add:
   - `APP_SECRET`: any long random text (40+ characters). Keep it secret and don't change it later, or 2-step sign in will need setting up again.
   - `ADMIN_EMAILS`: your email address. Accounts with this email get the admin panel.
   - `DEMO_MODE`: `1` while you're testing (test checkout without Stripe, email links shown on screen). Remove it before real launch.
5. Deploy (or **Redeploy**). Database migrations run automatically during the build.

Optional services, each switched on by adding its keys: Resend (`RESEND_API_KEY`, `EMAIL_FROM`) for real emails, Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) for real payments, Daily (`DAILY_API_KEY`) for video calls, and Anthropic (`ANTHROPIC_API_KEY`) for extra content checks.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Generate the Prisma client, run migrations on Vercel, build |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create and apply a migration locally |
