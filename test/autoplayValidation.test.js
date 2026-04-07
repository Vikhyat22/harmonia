import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeAutoplayLogReport,
  getPendingValidationRows,
  parseAutoplayLogReport,
} from '../src/lib/autoplayValidation.js';

test('parseAutoplayLogReport groups autoplay decisions with debug details', () => {
  const report = parseAutoplayLogReport(`
2026-04-03T09:58:22.288630+00:00 app[worker.1]: [Autoplay] mode=strict-original seed="Google Pay|Karma" winner="KR$NA - NO CAP (OFFICIAL VIDEO) | KALAMKAAR|Kalamkaar" source=yt-related total=56 reasons=+canonical +duration_close +diversity +reliable
2026-04-03T09:58:22.288645+00:00 app[worker.1]: [AutoplayDebug] seed=youtube:e7Oy127kmwg mode=strict-original
2026-04-03T09:58:22.288647+00:00 app[worker.1]: winner: KR$NA - NO CAP (OFFICIAL VIDEO) | KALAMKAAR|Kalamkaar total=56 provenance=yt-related reasons=+canonical +duration_close +diversity +reliable
2026-04-03T09:58:22.288700+00:00 app[worker.1]: rejected: Tony Montana|KARMA total=22 reasons=same_artist_streak
  `);

  assert.equal(report.decisions.length, 1);
  assert.equal(report.decisions[0].mode, 'strict-original');
  assert.equal(report.decisions[0].seedSource, 'youtube');
  assert.equal(report.decisions[0].winner.artist, 'Kalamkaar');
  assert.equal(report.decisions[0].rejected.length, 1);
});

test('analyzeAutoplayLogReport flags same-title drift in strict-original runs', () => {
  const report = analyzeAutoplayLogReport(`
2026-04-03T10:28:55.574108+00:00 app[worker.1]: [Autoplay] mode=strict-original seed="Bahut Pyar Karte Hai - Male Version|S. P. Balasubrahmanyam" winner="Ee Manase Se Se|S.P. Balasubrahmanyam" source=ytm-search total=27 reasons=+diversity +reliable
2026-04-03T10:28:55.574125+00:00 app[worker.1]: [AutoplayDebug] seed=spotify:6yTtUUlsBXN9h9ZxTxGWMS mode=strict-original
2026-04-03T10:28:55.574126+00:00 app[worker.1]: winner: Ee Manase Se Se|S.P. Balasubrahmanyam total=27 provenance=ytm-search reasons=+diversity +reliable
2026-04-03T10:29:21.734055+00:00 app[worker.1]: [Autoplay] mode=strict-original seed="Bahut Pyar Karte Hai - Male Version|S. P. Balasubrahmanyam" winner="Ee Manase|L V Revanth & REMIX" source=ytm-search total=27 reasons=+diversity +reliable
2026-04-03T10:29:21.734088+00:00 app[worker.1]: [AutoplayDebug] seed=spotify:6yTtUUlsBXN9h9ZxTxGWMS mode=strict-original
2026-04-03T10:29:21.734089+00:00 app[worker.1]: winner: Ee Manase|L V Revanth & REMIX total=27 provenance=ytm-search reasons=+diversity +reliable
2026-04-03T10:29:41.835280+00:00 app[worker.1]: [Autoplay] mode=strict-original seed="Bahut Pyar Karte Hai - Male Version|S. P. Balasubrahmanyam" winner="Ee Manase Audio Song | Tholiprema | Pawan Kalyan, Keerthi Reddy | Deva | A. Karunakaran|Lahari Music Telugu" source=ytm-search total=24 reasons=+diversity +reliable
2026-04-03T10:29:41.835324+00:00 app[worker.1]: [AutoplayDebug] seed=spotify:6yTtUUlsBXN9h9ZxTxGWMS mode=strict-original
2026-04-03T10:29:41.835326+00:00 app[worker.1]: winner: Ee Manase Audio Song | Tholiprema | Pawan Kalyan, Keerthi Reddy | Deva | A. Karunakaran|Lahari Music Telugu total=24 provenance=ytm-search reasons=+diversity +reliable
  `, {
    source: 'spotify',
    mode: 'strict-original',
  });

  assert.equal(report.verdict, 'fail');
  assert.match(report.issues.join('\n'), /repeated alternate title lane/i);
  assert.match(report.issues.join('\n'), /loose diversity\/reliable signals/i);
});

test('analyzeAutoplayLogReport passes a cleaner strict-original sample', () => {
  const report = analyzeAutoplayLogReport(`
2026-04-03T09:58:22.288630+00:00 app[worker.1]: [Autoplay] mode=strict-original seed="Google Pay|Karma" winner="KR$NA - NO CAP (OFFICIAL VIDEO) | KALAMKAAR|Kalamkaar" source=yt-related total=56 reasons=+canonical +duration_close +diversity +reliable
2026-04-03T09:58:22.288645+00:00 app[worker.1]: [AutoplayDebug] seed=youtube:e7Oy127kmwg mode=strict-original
2026-04-03T09:58:22.288647+00:00 app[worker.1]: winner: KR$NA - NO CAP (OFFICIAL VIDEO) | KALAMKAAR|Kalamkaar total=56 provenance=yt-related reasons=+canonical +duration_close +diversity +reliable
2026-04-03T09:58:43.314029+00:00 app[worker.1]: [Autoplay] mode=strict-original seed="Google Pay|Karma" winner="Panther X Raga - Galat Karam (Official Music Video)|Panther" source=yt-related total=56 reasons=+canonical +duration_close +diversity +reliable
2026-04-03T09:58:43.314045+00:00 app[worker.1]: [AutoplayDebug] seed=youtube:e7Oy127kmwg mode=strict-original
2026-04-03T09:58:43.314054+00:00 app[worker.1]: winner: Panther X Raga - Galat Karam (Official Music Video)|Panther total=56 provenance=yt-related reasons=+canonical +duration_close +diversity +reliable
2026-04-03T09:58:50.699971+00:00 app[worker.1]: [Autoplay] mode=strict-original seed="Google Pay|Karma" winner="KR$NA - I Guess | Official Music Video|KRSNA" source=yt-related total=52 reasons=+canonical +diversity +reliable
2026-04-03T09:58:50.700064+00:00 app[worker.1]: [AutoplayDebug] seed=youtube:e7Oy127kmwg mode=strict-original
2026-04-03T09:58:50.700083+00:00 app[worker.1]: winner: KR$NA - I Guess | Official Music Video|KRSNA total=52 provenance=yt-related reasons=+canonical +diversity +reliable
  `, {
    source: 'youtube',
    mode: 'strict-original',
  });

  assert.equal(report.verdict, 'pass');
});

test('analyzeAutoplayLogReport fails radio title-lane fixation across repeated reuploads', () => {
  const report = analyzeAutoplayLogReport(`
2026-04-04T07:07:13.508860+00:00 app[worker.1]: [Autoplay] mode=radio seed="Shape of You|Ed Sheeran" winner="Ed Sheeran - Perfect (Official Music Video)|Bad Boy Edd" source=ytm-search total=50 reasons=+canonical +diversity +reliable
2026-04-04T07:07:13.508883+00:00 app[worker.1]: [AutoplayDebug] seed=spotify:7qiZfU4dY1lWllzX7mPBI3 mode=radio
2026-04-04T07:07:13.508893+00:00 app[worker.1]: winner: Ed Sheeran - Perfect (Official Music Video)|Bad Boy Edd total=50 provenance=ytm-search reasons=+canonical +diversity +reliable
2026-04-04T07:07:37.478807+00:00 app[worker.1]: [Autoplay] mode=radio seed="Shape of You|Ed Sheeran" winner="Ed Sheeran - Perfect|LatinHype" source=ytm-search total=42 reasons=+diversity +reliable
2026-04-04T07:07:37.478831+00:00 app[worker.1]: [AutoplayDebug] seed=spotify:7qiZfU4dY1lWllzX7mPBI3 mode=radio
2026-04-04T07:07:37.478846+00:00 app[worker.1]: winner: Ed Sheeran - Perfect|LatinHype total=42 provenance=ytm-search reasons=+diversity +reliable
2026-04-04T07:08:53.740952+00:00 app[worker.1]: [Autoplay] mode=radio seed="Shape of You|Ed Sheeran" winner="Ed Sheeran - Perfect (Lyrics)|7clouds" source=ytm-search total=17 reasons=+diversity +reliable
2026-04-04T07:08:53.740974+00:00 app[worker.1]: [AutoplayDebug] seed=spotify:7qiZfU4dY1lWllzX7mPBI3 mode=radio
2026-04-04T07:08:53.740995+00:00 app[worker.1]: winner: Ed Sheeran - Perfect (Lyrics)|7clouds total=17 provenance=ytm-search reasons=+diversity +reliable
  `, {
    source: 'spotify',
    mode: 'radio',
  });

  assert.equal(report.verdict, 'fail');
  assert.match(report.issues.join('\n'), /repeated alternate title lane/i);
  assert.match(report.issues.join('\n'), /common variant pattern/i);
});

test('getPendingValidationRows returns unchecked matrix entries', () => {
  const rows = getPendingValidationRows(`
### Spotify Seeds
- [ ] \`strict-original\`
- [x] \`artist-continuity\`
### YouTube / YouTube Music Seeds
- [ ] \`radio\`
  `);

  assert.deepEqual(rows, [
    { section: 'Spotify Seeds', mode: 'strict-original', done: false },
    { section: 'YouTube / YouTube Music Seeds', mode: 'radio', done: false },
  ]);
});
