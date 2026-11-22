# Better Hosteling — landing page

AI-powered SaaS that finds the profit hiding in your hostel.

A single-page, no-build landing page: a full-screen background video with the
app's home screen previewed on top, plus the headline and tagline.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The landing page markup |
| `styles.css` | All styling (design tokens at the top) |
| `assets/bg.mp4` | Background video (cropped + compressed, ~560 KB) |
| `assets/bg-poster.jpg` | Poster frame shown before the video loads |

## Run locally

No build step. Serve the folder with any static server, e.g.:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly works too, but a server is recommended so the
video and fonts load reliably.)

## Deploy

Works as-is on any static host — GitHub Pages, Netlify, Vercel, Cloudflare Pages.
For GitHub Pages: Settings → Pages → deploy from the `main` branch, root folder.

## Editing the content

- **Headline / tagline:** the `.copy` block in `index.html`.
- **App preview numbers and tiles:** the `.phone` block in `index.html`.
- **Colors:** the `:root` design tokens at the top of `styles.css`.
- **Background video:** replace `assets/bg.mp4` (and its poster).
