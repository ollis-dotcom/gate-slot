# Gate-Slot

**Online dock slot booking for small and mid-sized warehouses.**

Trucks arriving all at once in the morning, dispatchers on the phone, a paper log at the gate — Gate-Slot replaces that with a simple web app. Carriers book a time slot at a receiving zone through a public link; the warehouse sees the day's schedule and checks trucks in and out at the gate.

Live product: [gate-slot.com](https://gate-slot.com)

> **License:** [Business Source License 1.1](LICENSE). You are welcome to read the code, run it locally, and experiment with it. Production use (including offering it as a hosted service) requires a commercial license from the author. On 2030-10-31 the code converts to Apache 2.0.

## Features

**For carriers (no account needed)**
- Public booking page per warehouse (`/book/<warehouse-slug>`), shareable as a link or QR code
- Live availability grid by date, zone and time
- Self-service: change or cancel a booking with email + booking ID
- Email confirmation with booking details

**For the warehouse**
- Dashboard with the daily schedule and status tracking: confirmed → on site → departed / no-show
- Manual bookings (for phone orders), editing, deleting and swapping slots
- Check-in scanner: first scan marks arrival, second scan marks departure, with timestamps
- Receiving zones, slot length, working hours and booking limits
- Reserved windows for specific companies, matched by the carrier's email
- Multiple users per warehouse, CSV export
- Interface in Russian, English and German

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router, TypeScript), Tailwind CSS
- [Supabase](https://supabase.com/): PostgreSQL, Auth, Row Level Security
- [Resend](https://resend.com/) for transactional email
- Deployed on Vercel

## Architecture notes

- All database tables have **Row Level Security enabled**; data is accessed only through server-side API routes (`app/api/*`), which check warehouse membership before returning anything.
- Public endpoints return only slot occupancy (date, zone, time, status) — no personal data and no booking IDs.
- The Supabase service-role key is used only on the server and never reaches the browser.

## Running locally

Requirements: Node.js 18+, a free Supabase project.

```bash
git clone https://github.com/ollis-dotcom/gate-slot.git
cd gate-slot
npm install
cp .env.example .env.local   # then fill in your Supabase keys
```

Set up the database in the Supabase SQL editor:
1. Run `supabase/schema.sql`
2. Then run the files in `supabase/migrations/` in date order

In Supabase → Authentication → Providers → Email, you may want to turn off "Confirm email" for local testing.

```bash
npm run dev
```

Open http://localhost:3000, register a warehouse, and use the booking link from the dashboard.

Email sending is optional: without `RESEND_API_KEY` the app works, it just doesn't send emails.

## Project structure

```
app/            pages and API routes (Next.js App Router)
  api/          server endpoints: bookings, warehouses, scan, auth, ...
  book/[slug]/  public carrier booking page
  dashboard/    warehouse dashboard
components/     shared UI components
lib/            Supabase clients, business logic, i18n
supabase/       database schema and migrations
```

## Feedback

This is a working product in its pilot phase. If you work in logistics and have thoughts on how dock scheduling works at your site — or want to try Gate-Slot at your warehouse — I'd be glad to hear from you: open an issue or reach out on [LinkedIn](https://www.linkedin.com/in/oleg-lisovskii).

## Author

Oleg Lisovskii — logistics engineer.

© 2026 Oleg Lisovskii. Licensed under the [Business Source License 1.1](LICENSE).
