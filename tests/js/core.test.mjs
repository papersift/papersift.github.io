import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractSearchTerms, fetchResults } from '../../js/core.js';
import { installFetchMock } from './fixtures.mjs';

// fetchResults() -> loadPapers() calls fetch(); stub it once for the whole file.
installFetchMock();

const titlesOf = (results) => results.map((r) => r.title).sort();
const search = async (q) => titlesOf((await fetchResults(q)).results);

const P1 = 'Deep CNN Segmentation of MRI Scans';
const P2 = 'Calibration of Deep Neural Network Models';
const P6 = 'Graph Neural Networks for Chemistry';
const P7 = 'Knowledge Distillation for Medical Classification';
const P8 = 'Distillation of Domain Knowledge into Classification Pipelines';
const P9 = 'Out-of-Distribution Detection Benchmarks';

// Parser tests pass their own author-name vocabulary; fetchResults() builds the
// real one from the loaded papers.
const NAMES = new Set(['aleksei', 'tuilpin', 'abhishek', 'singh', 'sambyal', 'smith', 'lee']);
const parse = (q) => extractSearchTerms(q, NAMES).groups;
const P = (phrase) => ({ phrase });
const A = (...author) => ({ author });

describe('extractSearchTerms', () => {
  test('words joined by spaces form one phrase', () => {
    const r = extractSearchTerms('knowledge distillation', NAMES);
    assert.deepEqual(r.groups, [[P('knowledge distillation')]]);
    assert.deepEqual(r.terms, ['knowledge distillation']);
    assert.deepEqual(r.authorSubTerms, []);
  });

  test('"or" splits into alternative groups', () => {
    assert.deepEqual(parse('classification or calibration'), [[P('classification')], [P('calibration')]]);
  });

  test('"and" puts terms in the same group', () => {
    assert.deepEqual(parse('classification and calibration'), [[P('classification'), P('calibration')]]);
  });

  test('"and" binds tighter than "or"', () => {
    assert.deepEqual(parse('graph or classification and calibration'),
      [[P('graph')], [P('classification'), P('calibration')]]);
  });

  test('"and"/"or" inside a word are not operators', () => {
    assert.deepEqual(parse('android or order'), [[P('android')], [P('order')]]);
  });

  test('commas and semicolons carry no meaning', () => {
    assert.deepEqual(parse('cnn, transformer'), [[P('cnn transformer')]]);
    assert.deepEqual(parse('author: abhishek and sambyal; and calibration'),
      parse('author: abhishek and sambyal and calibration'));
  });

  test('an author name keeps its words together', () => {
    const r = extractSearchTerms('author: aleksei tuilpin or abhishek sambyal', NAMES);
    assert.deepEqual(r.groups, [[A('aleksei', 'tuilpin')], [A('abhishek', 'sambyal')]]);
    assert.deepEqual(r.authorSubTerms, ['aleksei', 'tuilpin', 'abhishek', 'sambyal']);
    assert.deepEqual(r.terms, []);
  });

  test('"and" between author names requires both', () => {
    assert.deepEqual(parse('author: aleksei tuilpin and abhishek sambyal'),
      [[A('aleksei', 'tuilpin'), A('abhishek', 'sambyal')]]);
  });

  test('after author:, words that are not anyone\'s name are read as topics', () => {
    assert.deepEqual(parse('author: abhishek and smith and calibration'),
      [[A('abhishek'), A('smith'), P('calibration')]]);
    assert.deepEqual(parse('author: sambyal or graph neural networks'),
      [[A('sambyal')], [P('graph neural networks')]]);
  });

  test('topics may come before author:', () => {
    assert.deepEqual(parse('calibration and author: sambyal'), [[P('calibration'), A('sambyal')]]);
  });

  test('names are only names after author:', () => {
    assert.deepEqual(parse('sambyal'), [[P('sambyal')]]);
  });

  test('empty query yields nothing', () => {
    assert.deepEqual(extractSearchTerms('   ', NAMES), { groups: [], terms: [], authorSubTerms: [] });
  });

  test('single-character terms are dropped', () => {
    assert.deepEqual(parse('a or cnn'), [[P('cnn')]]);
  });
});

describe('fetchResults: keyword and/or', () => {
  test('"or" returns papers with either term', async () => {
    assert.deepEqual(await search('classification or calibration'), [P2, P7, P8].sort());
  });

  test('"and" returns papers with both terms in title or abstract', async () => {
    // P7 has "classification" in the title and "calibration" in the abstract
    assert.deepEqual(await search('classification and calibration'), [P7]);
  });

  test('a multi-word keyword is an exact phrase', async () => {
    assert.deepEqual(await search('knowledge distillation'), [P7]);
    // with "and" the words may appear anywhere, so P8 matches too
    assert.deepEqual(await search('knowledge and distillation'), [P7, P8].sort());
  });

  test('"and" binds tighter than "or"', async () => {
    assert.deepEqual(await search('graph or classification and calibration'), [P6, P7].sort());
  });

  test('cnn and/or transformer', async () => {
    assert.deepEqual(await search('cnn and transformer'), [
      P1,
      'Transformer Networks for Visual Recognition',
    ].sort());
    assert.deepEqual(await search('cnn or transformer'), [
      P1,
      'Transformer Networks for Visual Recognition',
      'Federated Learning Survey with CNN Backbones',
    ].sort());
  });
});

describe('fetchResults: author search', () => {
  test('author: <name> returns only papers whose authors field contains the name', async () => {
    assert.deepEqual(await search('author: smith'), [P1, P2].sort());
    // the "smith" distractor (word appears in title/abstract, not authors) must be excluded
    assert.ok(!(await search('author: smith')).includes("Extending Smith's Loss Function for Robust Training"));
  });

  test('"or" between names returns papers by either author', async () => {
    assert.deepEqual(await search('author: aleksei tuilpin or abhishek sambyal'), [P7, P8].sort());
  });

  test('"and" between names returns only co-authored papers', async () => {
    assert.deepEqual(await search('author: aleksei tuilpin and abhishek sambyal'), [P7]);
    assert.deepEqual(await search('author: smith and lee'), [P1]);
  });

  test('a full name must belong to one author, but middle names may be skipped', async () => {
    // P9 has "Abhishek Kumar" and "Priya Sambyal" - two different people
    assert.deepEqual(await search('author: abhishek sambyal'), [P7]);
    // every word of a full name is required, all on the same author
    assert.deepEqual(await search('author: abhishek singh sambyal'), [P7]);
    assert.deepEqual(await search('author: abhishek kumar sambyal'), []);
    assert.deepEqual(await search('author: jane lee'), []);
    // a partial name still matches every author containing it
    assert.deepEqual(await search('author: sambyal'), [P7, P9].sort());
  });

  test('BibTeX-style "Last, First and Last, First" author lists are split per person', async () => {
    assert.deepEqual(await search('author: aleksei tuilpin and alice doe'), [P8]);
    // "tuilpin" and "doe" are two different people, so as one name they match nothing
    assert.deepEqual(await search('author: tuilpin doe'), []);
  });

  test('authors and topics combine with plain "and", in either order', async () => {
    assert.deepEqual(await search('author: smith and segmentation'), [P1]);
    assert.deepEqual(await search('segmentation and author: smith'), [P1]);
    assert.deepEqual(await search('author: smith and lee and molecule'), []);
    // two authors and a topic, all required
    assert.deepEqual(await search('author: abhishek sambyal and aleksei tuilpin and calibration'), [P7]);
    assert.deepEqual(await search('author: aleksei tuilpin and classification'), [P7, P8].sort());
  });

  test('"or" can mix authors and topics', async () => {
    assert.deepEqual(await search('author: sambyal or graph'), [P6, P7, P9].sort());
    // author: stays on across "or", so the second "aleksei tuilpin" is a name too
    assert.deepEqual(await search('author: aleksei tuilpin and calibration or aleksei tuilpin and distillation'),
      [P7, P8].sort());
  });

  test('a plain keyword query does not match on author names', async () => {
    // "smith" only appears in fixture authors for papers 1 and 2; a keyword-only
    // search must not surface them since keywords match title+abstract only.
    assert.deepEqual(await search('smith'), ["Extending Smith's Loss Function for Robust Training"]);
  });
});

describe('fetchResults: keyword matches title and abstract fields', () => {
  test('a term appearing only in the title still matches', async () => {
    const { results } = await fetchResults('graph');
    assert.equal(results.length, 1);
    assert.equal(results[0].title, P6);
    assert.equal(results[0].score, 10); // WEIGHTS.TITLE only
  });

  test('a term appearing only in the abstract still matches', async () => {
    const { results } = await fetchResults('molecule');
    assert.equal(results.length, 1);
    assert.equal(results[0].title, P6);
    assert.equal(results[0].score, 5); // WEIGHTS.ABSTRACT only
  });
});
