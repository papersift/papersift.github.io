# 📰 PaperSift

A high-performance, monochromatic research search engine for AI/ML and medical imaging researchers. PaperSift provides sub-millisecond access to a large corpus of papers from major conferences and journals including NeurIPS, ICML, CVPR, ICCV, ECCV, AAAI, IJCAI, MICCAI, MIDL, ISBI, ICLR, and TMI.

## ✨ Key Features

- **⚡ Instant Search**: Client-side filtering of a large paper corpus with negligible latency.
- **📚 Extensive Archive**: Full historical proceedings across 12 conferences and journals — see [Conference Coverage](#-conference-coverage) below.
- **🎨 Newsprint Aesthetic**: A clean, monochromatic interface optimized for focus.
- **🌓 Adaptive Themes**: Automatic Light/Dark mode transitions based on local sunrise/sunset.
- **🔢 LaTeX Support**: Integrated KaTeX for rendering complex mathematical abstracts.
- **🚀 Static Architecture**: Optimized for GitHub Pages with zero-server dependency in production.
- **ℹ️ About Page**: [`about.html`](https://abhisheksambyal.com/papersift/about.html) explains the tool, its search syntax, and its live coverage table (generated from `data/config.json`, so the numbers never go stale).

## 📚 Conference Coverage

| Conference | Years | Source | Abstracts |
|---|---|---|---|
| NeurIPS | 1987+ | papers.nips.cc | ✅ Full |
| ICML | 2013+ | proceedings.mlr.press | ✅ Full |
| CVPR | 2013+ | openaccess.thecvf.com | ✅ Full |
| ICCV | 2013+ (odd years) | openaccess.thecvf.com | ✅ Full |
| ECCV | 2018+ (even years) | ecva.net | ✅ Full |
| AAAI | 2020+ | ojs.aaai.org (OAI-PMH) | ⚠️ Best-effort — the OAI feed's pagination has been unreliable under sustained load; coverage may be incomplete for some years |
| IJCAI | 2017+ | ijcai.org | ✅ Full |
| MICCAI | 2018+ | papers.miccai.org (2024+), DBLP (earlier) | ✅ Full for 2024+; DBLP-only years have no abstracts (Springer doesn't expose them, and its site blocks scraping) |
| MIDL | 2019+ | DBLP + PMLR | ✅ Full for 2019-2024 with abstracts (OpenReview's API/site requires a JS bot-challenge that blocks automated fetching, so listings and abstracts are sourced from DBLP and the PMLR proceedings pages instead); DBLP has no MIDL 2018 entries at all, and 2025+ hasn't been indexed there yet |
| ISBI | 2004+ | DBLP + OpenAlex | ✅ Full (abstracts backfilled via OpenAlex, which has strong coverage for IEEE-published papers) |
| TMI | 1992+ | DBLP + OpenAlex | ✅ Full (abstracts backfilled via OpenAlex, same as ISBI) |
| ICLR | 2013+ | iclr.cc (2018+), DBLP + OpenAlex (2013-2017) | ✅ Full for 2018+ — same OpenReview bot-challenge as MIDL, but iclr.cc's own conference site (its Schedule pages for 2018-2019, its virtual site for 2020+) has the authoritative accepted-paper listing with abstracts, sidestepping OpenReview and OpenAlex entirely; ~81% abstract coverage (some detail pages have none to scrape). 2013-2017 fall back to DBLP + best-effort OpenAlex title search, since iclr.cc doesn't have a scrapable listing that far back and OpenAlex now meters its API with a tiny free daily budget |

---

## 🔍 Search Syntax

Queries use two explicit operators, `and` and `or`. Keywords are matched against paper
**titles** and **abstracts**; the `author:` prefix matches author names instead.

| Write | Meaning |
|---|---|
| a space | joins words into one unit: an exact **phrase** for keywords, one person's **name** for authors |
| `and` | both sides must match |
| `or` | either side may match (`and` groups first: `a or b and c` = `a`, or `b` with `c`) |
| `author:` | from here on, words that are someone's name are read as authors; the rest stay topics |

Commas and semicolons have no special meaning. Name detection uses every word that appears in an
author name in the archive, so a topic that is also a surname (e.g. `gan`, `brain`) is read as a
name after `author:` — put it before `author:` to keep it a topic: `gan and author: hinton`.

### Keyword Search
- `knowledge distillation` — Papers containing that exact phrase.
- `classification and calibration` — Papers mentioning both words anywhere in the title/abstract.
- `classification or calibration` — Papers mentioning either word.

### Author Search
- `author: sambyal` — Papers with an author whose name contains "sambyal".
- `author: abhishek sambyal` — Papers by that one person (a middle name in between is fine).
- `author: aleksei tiulpin or abhishek sambyal` — Papers by either person.
- `author: aleksei tiulpin and abhishek sambyal` — Papers co-authored by both.
- `author: abhishek and bathula and calibration` — Calibration papers co-authored by both.
- `author: hinton and deep learning` — Papers by Hinton containing the phrase "deep learning".
- `calibration and author: sambyal` — Topic first; either order works.

---

## 🛠️ Installation & Development

### Local Development
The site is fully static, so any static file server works. From the repo root:
```bash
python3 -m http.server 8000
```
Then open <http://localhost:8000>. Opening `index.html` directly (`file://`) won't work: the page
uses ES modules and `fetch()`es `data/*.json`, which browsers block for local files.

`python3 server.py` also serves the site, plus an optional Python JSON API (`/api/search`); the
static site doesn't use that API.

### Data Synchronization
The database is maintained via a unified synchronization pipeline.

**Sync missing records:**
```bash
python3 scripts/sync.py
```

**Full rebuild from scratch:**
```bash
python3 scripts/sync.py --full
```

### Coverage stats (automated)

The About page's table reads the `stats` block in `data/config.json`. No manual step:
[`.github/workflows/refresh-stats.yml`](.github/workflows/refresh-stats.yml) rebuilds it
weekly (Mondays 06:17 UTC), on any push touching `data/*.json`, or on demand, and commits
only when the numbers actually move.

> **⚠️** GitHub runs `schedule` triggers only from the default branch (`main`), while the
> site ships from `static-website`. Until this workflow reaches `main` — or
> `static-website` becomes the default — only the push and manual triggers fire. The job
> checks out `static-website` either way.

Local equivalent, if ever needed: `python3 scripts/export_static.py --stats-only`

---

### Testing

Covers both search implementations in this repo:

- `tests/js/` — tests `js/core.js` (`extractSearchTerms`, `fetchResults`), the real
  client-side search used by the static site. This is where `author:`, `and`/`or`,
  phrase matching, and title/abstract keyword matching are actually implemented.
- `tests/python/` — tests `api/search.py` (`run_search`), used only by the local-dev
  server (`server.py`). It's a simpler implicit-AND matcher with no `author:` prefix
  and no real OR support; several tests there intentionally pin down that narrower
  behavior (see comments in `tests/python/test_search.py`) rather than asserting
  something the code doesn't do.

Both suites run against small fixture datasets, not the real scraped conference
data, so they're fast, deterministic, and don't touch the network.

#### Running

```sh
# JS (Node's built-in test runner, no install needed)
node --test tests/js/*.test.mjs
# or: npm test

# Python (stdlib unittest, no install needed)
python3 -m unittest discover -s tests/python -v
```

Re-run both after any change to `js/core.js` or `api/search.py` to confirm
author search, author+keyword search, AND search, OR search, and title/abstract
keyword matching still behave as expected.

---

## 🏗️ Technical Architecture

PaperSift is built as a **Static Web Application**. Search indexing and filtering are performed entirely in the browser using per-conference JSON indexes, fetched in parallel and merged client-side.

- **`js/`**: Core search logic and rendering engine.
- **`data/`**: Minified production index, split one file per conference (`data/{id}.json`, e.g. `data/cvpr.json`) to stay under hosting file-size limits, plus `data/config.json` listing the available conferences/years.
- **`api/`**: Backend ingestion logic and configuration.
- **`scripts/`**: Maintenance utilities for data sync and site generation.

## 🚢 Deployment

Optimized for **GitHub Pages**. Since all search operations are client-side, the project requires no live backend server in production.

---

## 📜 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for the full text.

---

*Designed for researchers, by researchers.*
