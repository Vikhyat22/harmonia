import test from 'node:test';
import assert from 'node:assert/strict';
import { getHostingInfo, getHostingWarnings } from '../src/utils/hosting.js';

test('hosting helpers detect Render-style environment variables', () => {
  const previousServiceId = process.env.RENDER_SERVICE_ID;
  const previousExternalUrl = process.env.RENDER_EXTERNAL_URL;

  process.env.RENDER_SERVICE_ID = 'srv-123';
  process.env.RENDER_EXTERNAL_URL = 'https://example.onrender.com';

  const info = getHostingInfo();

  assert.equal(info.isRender, true);
  assert.equal(info.platform, 'render');
  assert.equal(info.renderServiceId, 'srv-123');
  assert.equal(info.renderExternalUrl, 'https://example.onrender.com');
  assert.match(getHostingWarnings()[0], /free tier/i);

  if (previousServiceId === undefined) {
    delete process.env.RENDER_SERVICE_ID;
  } else {
    process.env.RENDER_SERVICE_ID = previousServiceId;
  }

  if (previousExternalUrl === undefined) {
    delete process.env.RENDER_EXTERNAL_URL;
  } else {
    process.env.RENDER_EXTERNAL_URL = previousExternalUrl;
  }
});

test('hosting helpers detect Heroku worker dynos', () => {
  const previousDyno = process.env.DYNO;
  const previousApp = process.env.HEROKU_APP_NAME;

  process.env.DYNO = 'worker.1';
  process.env.HEROKU_APP_NAME = 'harmonia-prod';

  const info = getHostingInfo();

  assert.equal(info.isHeroku, true);
  assert.equal(info.platform, 'heroku');
  assert.equal(info.herokuAppName, 'harmonia-prod');
  assert.equal(info.herokuDyno, 'worker.1');
  assert.match(getHostingWarnings().at(-1), /http health/i);

  if (previousDyno === undefined) {
    delete process.env.DYNO;
  } else {
    process.env.DYNO = previousDyno;
  }

  if (previousApp === undefined) {
    delete process.env.HEROKU_APP_NAME;
  } else {
    process.env.HEROKU_APP_NAME = previousApp;
  }
});
