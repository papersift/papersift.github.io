let papersCache = null;
let loadingPromise = null;
let nameWords = null; // every word that appears in some author's name, for telling names from topics

/**
 * Search field weights for relevance scoring.
 */
const WEIGHTS = {
  TITLE: 10,
  ABSTRACT: 5,
  AUTHOR_MATCH: 100 // High priority for explicit author prefix search
};

/**
 * Load papers from the static JSON file.
 * Returns a promise that resolves when loading is complete.
 */
async function loadPapers() {
  if (papersCache) return papersCache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const configRes = await fetch('data/config.json');
      if (!configRes.ok) throw new Error(`Failed to load config: ${configRes.status}`);
      const config = await configRes.json();

      // Data is split into one file per conference (keeps individual files
      // under hosting size limits and lets the browser fetch them in parallel).
      const perConference = await Promise.all(
        config.conferences.map(async ({ id }) => {
          const res = await fetch(`data/${id}.json`);
          if (!res.ok) throw new Error(`Failed to load ${id} data: ${res.status}`);
          return res.json();
        })
      );
      const data = perConference.flat();

      // Pre-process for performance
      const words = new Set();
      for (const p of data) {
        const t = (p.title || '').toLowerCase();
        const a = (p.authors || '').toLowerCase();
        const abs = (p.abstract || '').toLowerCase();
        p._searchable = {
          title: t, abstract: abs, venue: (p.venue || '').toLowerCase(),
          // One entry per author, so a name never spans two people. Most sources list
          // "First Last, First Last"; some ECCV/MICCAI use BibTeX-style "Last, First and Last, First".
          authorList: /\sand\s/.test(a) ? a.split(/\s+and\s+/) : a.split(/\s*,\s*/)
        };
        for (const w of nameTokens(a)) words.add(w);
      }
      nameWords = words;
      papersCache = data;
      return papersCache;
    } catch (err) {
      loadingPromise = null;
      throw err;
    }
  })();

  return loadingPromise;
}

/** Split a lowercased name (or name-like input) into its letter/digit words. */
const nameTokens = s => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Extract the boolean structure of a query: OR-groups of AND-ed units, where
 * each unit is a topic `{ phrase }` or an author `{ author: [words] }`.
 * 'and' binds tighter than 'or'; words joined by spaces stay one unit.
 * After 'author:', a unit is read as a name when all its words occur in some
 * author's name (`names`, built from the archive), otherwise as a topic - so
 * "author: doe and smith and calibration" is two names and one topic.
 * Commas and semicolons carry no meaning.
 */
export function extractSearchTerms(query, names = nameWords) {
  const q = ` ${query.toLowerCase().replace(/[,;]/g, ' ')} `;
  const isName = words => !names || words.every(w => nameTokens(w).every(t => names.has(t)));

  let authorMode = false;
  const toUnits = text => {
    const at = text.indexOf('author:');
    if (at >= 0) {
      const head = toUnits(text.slice(0, at));
      authorMode = true;
      return [...head, ...toUnits(text.slice(at + 7))];
    }
    const t = text.trim().replace(/\s+/g, ' ');
    if (t.length < 2) return [];
    const words = t.split(' ');
    return [authorMode && isName(words) ? { author: words } : { phrase: t }];
  };

  const groups = q.split(/\s+or\s+/)
    .map(g => ` ${g} `.split(/\s+and\s+/).flatMap(toUnits))
    .filter(g => g.length);

  // Flat lists for highlighting matches in the rendered cards.
  const units = groups.flat();
  const terms = [...new Set(units.filter(u => u.phrase).map(u => u.phrase))];
  const authorSubTerms = [...new Set(units.filter(u => u.author).flatMap(u => u.author))];

  return { groups, terms, authorSubTerms };
}

/**
 * Fetch search results (client-side).
 * @returns {Promise<{results: Array, activeVenues: Set, activeYears: Set, parsed: Object}>}
 */
export async function fetchResults(query, venue = '', year = '') {
  const papers = await loadPapers();
  const parsed = extractSearchTerms(query);
  const { groups, terms } = parsed;

  const venueSet = venue && (Array.isArray(venue) ? venue.length > 0 : true) 
    ? (Array.isArray(venue) ? venue : [venue]).map(v => v.toLowerCase()) 
    : null;
  const yearSet = year && (Array.isArray(year) ? year.length > 0 : true)
    ? new Set((Array.isArray(year) ? year : [year]).map(String)) 
    : null;

  const results = [];
  const activeVenues = new Set();
  const activeYears = new Set();
  const hasQuery = groups.length > 0;
  const authorUnits = groups.flat().filter(u => u.author);

  // Precompile one word-boundary regex per phrase; its words may be separated by any whitespace.
  const escapeRegExp = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const termRegexes = terms.map(term => new RegExp(`\\b${term.split(' ').map(escapeRegExp).join('\\s+')}\\b`));
  // A name matches when a single author on the paper contains all of its words.
  const hasName = (list, name) => list.some(a => name.every(w => a.includes(w)));

  for (let i = 0, len = papers.length; i < len; i++) {
    const p = papers[i];
    const searchable = p._searchable;
    
    // 1. Venue/Year filtering
    if (venueSet && !venueSet.some(v => searchable.venue.includes(v))) continue;
    if (yearSet && !yearSet.has(String(p.year))) continue;

    // 2. Search matching and Scoring
    let score = 0;
    
    // Some OR-group must have every unit satisfied: each name on the paper,
    // each phrase in its title/abstract.
    if (hasQuery) {
      const matched = new Set();
      for (let j = 0; j < termRegexes.length; j++) {
        const regex = termRegexes[j];
        const inTitle = regex.test(searchable.title), inAbstract = regex.test(searchable.abstract);
        if (!inTitle && !inAbstract) continue;
        matched.add(terms[j]);
        if (inTitle)    score += WEIGHTS.TITLE;
        if (inAbstract) score += WEIGHTS.ABSTRACT;
      }
      const list = searchable.authorList;
      if (!groups.some(g => g.every(u => u.author ? hasName(list, u.author) : matched.has(u.phrase)))) continue;
      if (authorUnits.some(u => hasName(list, u.author))) score += WEIGHTS.AUTHOR_MATCH;
    }
    else if (!venueSet && !yearSet) continue;

    results.push({ ...p, score });
    
    // Track facets. Venue strings are always "{ConferenceId} {year}", so the
    // id is just the first word - this scales to new conferences automatically.
    const confId = searchable.venue.split(' ')[0];
    if (confId) activeVenues.add(confId);
    if (p.year) activeYears.add(String(p.year));
  }

  // Optimized sort: Year (desc), then Score (desc)
  results.sort((a, b) => (b.year - a.year) || (b.score - a.score));
  
  return { results, activeVenues, activeYears, parsed };
}
const STORAGE_KEY = 'medsearch_recent';
const MAX_RECENT  = 4;

export const DEFAULTS = ['mri', 'classification', 'calibration'];

/** Returns true only if every word in the query is 2+ alphabetic characters. */
const isValidQuery = query =>
  query.trim().split(/\s+/).every(w => /^[a-zA-Z]{2,}$/.test(w));

/** Read the stored recent-search list (newest first). */
export function getRecent() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

/** Prepend a query to history, deduplicating and capping at MAX_RECENT. */
export function saveRecent(query) {
  if (!isValidQuery(query)) return;
  const updated = [query, ...getRecent().filter(q => q !== query)].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
