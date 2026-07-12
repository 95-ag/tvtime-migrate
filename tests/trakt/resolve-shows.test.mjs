import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle, yearFromTitle, pickMatch } from '../../trakt/resolve-shows.mjs';

describe('normalizeTitle', () => {
  it('strips a trailing (YYYY) year suffix', () => {
    assert.equal(normalizeTitle('Some Show (2020)'), 'some show');
  });
  it('normalizes curly apostrophes and quotes to straight', () => {
    assert.equal(normalizeTitle('Please Don’t'), "please don't");
    assert.equal(normalizeTitle('“Quoted” Show'), '"quoted" show');
  });
  it('collapses whitespace and lowercases', () => {
    assert.equal(normalizeTitle('  The   Show  '), 'the show');
  });
  it('handles null/undefined/empty', () => {
    assert.equal(normalizeTitle(null), '');
    assert.equal(normalizeTitle(undefined), '');
    assert.equal(normalizeTitle(''), '');
  });
});

describe('yearFromTitle', () => {
  it('extracts a trailing (YYYY)', () => {
    assert.equal(yearFromTitle('Some Show (2020)'), 2020);
  });
  it('returns null when no trailing year', () => {
    assert.equal(yearFromTitle('Some Show'), null);
  });
  it('handles null/undefined', () => {
    assert.equal(yearFromTitle(null), null);
    assert.equal(yearFromTitle(undefined), null);
  });
});

describe('pickMatch', () => {
  it('matches exact title + year within tolerance of 1', () => {
    const candidates = [{ title: 'Some Show', year: 2020, ids: { trakt: 1 } }];
    assert.deepEqual(pickMatch('Some Show (2020)', candidates), candidates[0]);
    // off-by-one year tolerance (release-date rounding)
    const candidatesOff = [{ title: 'Some Show', year: 2021, ids: { trakt: 1 } }];
    assert.deepEqual(pickMatch('Some Show (2020)', candidatesOff), candidatesOff[0]);
  });

  it('matches a unique exact-title candidate when our title carries no year', () => {
    const candidates = [{ title: 'Some Show', year: 2020, ids: { trakt: 1 } }];
    assert.deepEqual(pickMatch('Some Show', candidates), candidates[0]);
  });

  it('rejects when the candidate title has changed entirely, even if superficially plausible', () => {
    const candidates = [{ title: 'Hidden Love for You', year: 2022, ids: { trakt: 5 } }];
    assert.equal(pickMatch("You Can't Hide Your Heart (2022)", candidates), null);
  });

  it('returns null when ambiguous — two exact-title candidates, different years, no our-year to disambiguate', () => {
    const candidates = [
      { title: 'Some Show', year: 2010, ids: { trakt: 1 } },
      { title: 'Some Show', year: 2020, ids: { trakt: 2 } },
    ];
    assert.equal(pickMatch('Some Show', candidates), null);
  });

  it('returns null when our year has no candidate within tolerance', () => {
    const candidates = [{ title: 'Some Show', year: 2010, ids: { trakt: 1 } }];
    assert.equal(pickMatch('Some Show (2020)', candidates), null);
  });

  it('returns null when there are no candidates', () => {
    assert.equal(pickMatch('Some Show', []), null);
    assert.equal(pickMatch('Some Show', undefined), null);
  });

  it('matches across curly-apostrophe normalization', () => {
    const candidates = [{ title: "Please Don't Stop", year: 2019, ids: { trakt: 9 } }];
    assert.deepEqual(pickMatch('Please Don’t Stop (2019)', candidates), candidates[0]);
  });

  it('rejects a non-exact (partial) title match', () => {
    const candidates = [{ title: 'Some Show: The Sequel', year: 2020, ids: { trakt: 1 } }];
    assert.equal(pickMatch('Some Show (2020)', candidates), null);
  });
});
