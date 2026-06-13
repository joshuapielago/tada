# TaDa! — Homepage prototypes

Six explorations for the new TaDa! web platform: a home (a "base pin") for HTML
decks **and** a global gallery of the most beautiful ones — pushing visitors to
upload their own deck fast.

## Run

```bash
node web/server.js        # http://localhost:4173
node web/server.js 5000   # custom port (or set PORT)
```

Open `http://localhost:4173/` for the **launcher** — flip through all six
prototypes in one window, or open any of them full-screen:

| # | Prototype | Idea |
|---|-----------|------|
| 1 | **Spotlight Gallery** (`/01-spotlight/`) | Big featured deck + airy Pinterest-style wall with category filters. |
| 2 | **Magic Drop** (`/02-magic-drop/`) | Upload-first. A giant friendly drop zone, wand + confetti, community reel below. |
| 3 | **Editorial Curated** (`/03-editorial/`) | Warm magazine. "Deck of the day", editors' picks, curated collections. |
| 4 | **Living Mosaic** (`/04-mosaic/`) | Immersive auto-scrolling wall of decks behind a glassy hero with search. |
| 5 | **Playful Bento** (`/05-bento/`) | Modern bento grid mixing hero, a bold upload tile, featured + thumbnails. |
| 6 | **Quiet Light** (`/06-minimal/`) | Ultra-minimal: one big idea, one beautiful auto-playing carousel. |

## How it's built

- **Zero dependencies.** Plain Node static server (`server.js`), plain HTML/CSS/JS.
- **Shared brand** in `shared/brand.css` — tokens pulled straight from the product
  icon and product deck (plum, paper, cream, coral, mint, yellow, violet; rounded
  friendly display type).
- **The gallery is real.** `shared/decks.js` defines ~14 "world's best" decks and
  `shared/decks.css` renders each as an actual 16:9 HTML slide. Every measurement
  inside a slide uses container-query units (`cqw`), so the same markup is crisp
  as a tiny thumbnail or a full hero — which *is* the TaDa! product story.

All six share the same north star: see beautiful decks immediately, feel human
and light, and make "upload your deck" the easiest thing on the page.
