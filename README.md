# Better Hosteling — marketing site

AI-powered SaaS that finds the profit hiding in your hostel. A no-build static
site (plain HTML/CSS/JS) you can deploy anywhere.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Landing page — background video, headline, pulsing hostel emblem |
| `how-it-works.html` | How the app works (3 steps) + in-app screen previews |
| `waitlist.html` | "Get early access" email signup, wired to Supabase |
| `styles.css` | All styling (design tokens at the top) |
| `assets/bg.mp4` | Background video (~560 KB) |
| `assets/bg-poster.jpg` | Poster frame before the video loads |
# HostelUp — marketing site

AI-powered SaaS that finds the profit hiding in your hostel. A single-page,
no-build static site (plain HTML/CSS/JS).

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole site: hero → how it works → app preview → waitlist |
| `styles.css` | All styling (design tokens at the top) |
| `assets/bg.mp4` | Hero background video |
| `assets/house.jpg` | The glowing-hostel centerpiece illustration |
| `assets/bg-poster.jpg` | Video poster frame |
| `sitemap.xml`, `robots.txt` | SEO |

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy

Works as-is on GitHub Pages, Netlify, Vercel, Cloudflare Pages.
GitHub Pages: Settings → Pages → deploy from `main`, root folder.

## Waitlist database (Supabase)

The signup form writes to a Supabase table. Why Supabase: it's a real Postgres
database with a browser-safe API and a free tier, the anon key is meant to be
public when paired with a Row-Level-Security policy, and you'll reuse the same
database for the app itself.

**1. Create the table and policy** — in your Supabase project, open the SQL
editor and run:

```sql
create table public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text,
  created_at timestamptz not null default now()
);

-- Lock the table down, then allow ONLY anonymous inserts (no reads).
alter table public.waitlist enable row level security;

create policy "anon can join waitlist"
  on public.waitlist for insert
  to anon
  with check (true);
```

With no `select` policy, visitors can add their email but cannot read the list;
you view signups from the Supabase dashboard.

**2. Add your keys** — in `waitlist.html`, replace the two placeholders near the
bottom with the values from Project Settings → API:

```js
const SUPABASE_URL = "https://xxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJ...";   // the "anon public" key, NOT service_role
```

Until the keys are filled in, the form validates the email and shows a notice
instead of saving — so the page is safe to ship before the database is live.

### Alternatives considered

- **Netlify Forms / Formspree** — zero-code, but only email you submissions; not
  a database you can build the product on.
- **Firebase (Firestore)** — fine, but NoSQL; Postgres suits financial data better.

## Editing content

- **Headline / tagline / emblem:** `index.html`.
- **Steps and app previews:** `how-it-works.html`.
- **Colors:** the `:root` design tokens at the top of `styles.css`.
python3 -m http.server 8000   # http://localhost:8000
```

## Deploy (GitHub Pages)

Settings → Pages → Source: **Deploy from a branch** → **main** / **(root)** → Save.
Live at `https://reem1213.github.io/EF-HostelApp/`.

## Waitlist database (Supabase)

The signup form writes to a Supabase table. **1.** Run this SQL in your Supabase
project:

```sql
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text,
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
create policy "anon can join waitlist" on public.waitlist
  for insert to anon with check (true);
```

**2.** In `index.html`, replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` (near the
bottom) with your project URL and the **anon public** key. Until then the form
shows a notice instead of saving, so it's safe to ship.

## Editing

- Headline, tagline, centerpiece image: top of `index.html`.
- Steps, app previews, waitlist copy: the sections in `index.html`.
- Colors: the `:root` tokens in `styles.css`.
