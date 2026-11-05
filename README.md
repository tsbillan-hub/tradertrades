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

**One click:** [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftsbillan-hub%2Ftradertrades&project-name=tradertrades-site&repository-name=tradertrades-site&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22public%22%7D%5D)

The button makes the project, a Neon database and a Blob store in one go. Nothing has to be typed in: without
`APP_SECRET` the site makes one from the database address, and without Stripe it runs in preview mode (test checkout,
emails shown on screen). Set your own `APP_SECRET` and `ADMIN_EMAILS` before real launch.

1. Push this code to a GitHub repository.
2. Sign in at [vercel.com](https://vercel.com) with GitHub and choose **Add New → Project**, then import the repository. Keep the default settings.
3. Before the first deploy (or right after it), open the project's **Storage** tab:
   - Add **Neon** (Postgres). It sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you.
   - Add **Blob**. It sets `BLOB_READ_WRITE_TOKEN`, which is needed for uploads.
4. In **Settings → Environment Variables**, add:
   - `APP_SECRET`: any long random text (40+ characters). Keep it secret and don't change it later, or 2-step sign in will need setting up again.
   - `ADMIN_EMAILS`: your email address. Accounts with this email get the admin panel.
   - `DEMO_MODE`: `1` while you're testing (test checkout without Stripe, email links shown on screen). Remove it before real launch.
   - `CRON_SECRET`: any long random text. Vercel sends it to the daily upkeep job (renewals, refund deadlines, payout holds, clean-up), which runs at 07:00 UTC from `vercel.json`.
5. Deploy (or **Redeploy**). Database migrations run automatically during the build, and so do two starting sets of content: the directory listings (`scripts/seed-directory.ts`) and the example creator page, @tris (`scripts/seed-example.ts`).

Optional services, each switched on by adding its keys: Resend (`RESEND_API_KEY`, `EMAIL_FROM`) for real emails, Stripe (see below) for real payments, Daily (`DAILY_API_KEY`) for video calls, and Anthropic (`ANTHROPIC_API_KEY`) for extra content checks.

## The example creator page (@tris)

The first deploy adds @tris: a sample account with the A+ setup video and three example listings (a community, a course and chart review calls). Its pages say it's an example, its listings show a Sample label and can't be bought, and nobody can sign in to it. Search engines aren't told about it.

To take the username for a real account: sign in with an email listed in `ADMIN_EMAILS`, open **Admin → Accounts → @tris** (Admin is in the menu under your profile picture) and choose **Remove sample account**. That deletes it with its listings and files, and frees the username for anyone to sign up with, or to pick in **Settings → Account**. Once removed it isn't added back. To skip it on a new site, set `SEED_EXAMPLE=0` before the first deploy.

## Switch on real payments (Stripe)

Sellers are paid through Stripe Connect (Express accounts). Each sale is a destination charge: the buyer pays, Stripe sends the seller their share, and TraderTrades keeps its fee plus the card fee as the application fee. Memberships are Stripe subscriptions with an application fee percent that drops from the first-sale rate to the repeat rate after the first paid invoice.

1. In the Stripe dashboard, turn on **Connect** and choose Express accounts.
2. Add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
3. Under **Developers → Webhooks**, add an endpoint for `https://YOUR-DOMAIN/api/stripe/webhook` that listens to **Your account** and **Connected accounts**, with these events:
   - `checkout.session.completed`, `checkout.session.async_payment_succeeded`
   - `invoice.paid`, `invoice.payment_failed`
   - `customer.subscription.updated`, `customer.subscription.deleted`
   - `refund.created`, `charge.dispute.created`
   - `account.updated`

   Put its signing secret in `STRIPE_WEBHOOK_SECRET`. If Stripe makes you create a separate endpoint for connected accounts, put that one's secret in `STRIPE_CONNECT_WEBHOOK_SECRET`.
4. Remove `DEMO_MODE` before taking real money.

Fees live in `src/lib/fees.ts`: 0% on buyers who come through the seller's own link, 30% on the first purchase of a buyer TraderTrades finds, 5% on that buyer's repeat purchases, plus the card fee (2.9% + 30¢) passed through. New sellers' payouts wait 14 days for their first 60 days, then 7 days. Refunds give the buyer their money back and return our fee to the seller in proportion; the card fee isn't returned.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Generate the Prisma client, run migrations on Vercel, build |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create and apply a migration locally |
| `npm run db:seed-directory` | Add or refresh the starting directory listings (claimed listings are left alone) |
| `npm run db:seed-example` | Add the example creator page, @tris, unless it exists or was removed |
