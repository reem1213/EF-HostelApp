# Better Hosteling — marketing site

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
