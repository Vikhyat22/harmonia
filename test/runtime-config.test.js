import test from 'node:test';
import assert from 'node:assert/strict';
import { isHttpServerEnabled, isMessageContentIntentEnabled } from '../src/utils/runtimeConfig.js';

test('message content intent flag defaults to disabled', () => {
  const previous = process.env.ENABLE_MESSAGE_CONTENT_INTENT;
  delete process.env.ENABLE_MESSAGE_CONTENT_INTENT;

  assert.equal(isMessageContentIntentEnabled(), false);

  if (previous === undefined) {
    delete process.env.ENABLE_MESSAGE_CONTENT_INTENT;
  } else {
    process.env.ENABLE_MESSAGE_CONTENT_INTENT = previous;
  }
});

test('message content intent flag accepts common truthy values', () => {
  const previous = process.env.ENABLE_MESSAGE_CONTENT_INTENT;
  process.env.ENABLE_MESSAGE_CONTENT_INTENT = 'yes';

  assert.equal(isMessageContentIntentEnabled(), true);

  if (previous === undefined) {
    delete process.env.ENABLE_MESSAGE_CONTENT_INTENT;
  } else {
    process.env.ENABLE_MESSAGE_CONTENT_INTENT = previous;
  }
});

test('http server flag defaults to enabled outside worker dynos', () => {
  const previousHttp = process.env.ENABLE_HTTP_SERVER;
  const previousDyno = process.env.DYNO;
  delete process.env.ENABLE_HTTP_SERVER;
  delete process.env.DYNO;

  assert.equal(isHttpServerEnabled(), true);

  if (previousHttp === undefined) {
    delete process.env.ENABLE_HTTP_SERVER;
  } else {
    process.env.ENABLE_HTTP_SERVER = previousHttp;
  }

  if (previousDyno === undefined) {
    delete process.env.DYNO;
  } else {
    process.env.DYNO = previousDyno;
  }
});

test('http server flag defaults to disabled on Heroku worker dynos', () => {
  const previousHttp = process.env.ENABLE_HTTP_SERVER;
  const previousDyno = process.env.DYNO;
  delete process.env.ENABLE_HTTP_SERVER;
  process.env.DYNO = 'worker.1';

  assert.equal(isHttpServerEnabled(), false);

  if (previousHttp === undefined) {
    delete process.env.ENABLE_HTTP_SERVER;
  } else {
    process.env.ENABLE_HTTP_SERVER = previousHttp;
  }

  if (previousDyno === undefined) {
    delete process.env.DYNO;
  } else {
    process.env.DYNO = previousDyno;
  }
});

test('http server flag accepts explicit truthy override', () => {
  const previousHttp = process.env.ENABLE_HTTP_SERVER;
  const previousDyno = process.env.DYNO;
  process.env.ENABLE_HTTP_SERVER = 'true';
  process.env.DYNO = 'worker.1';

  assert.equal(isHttpServerEnabled(), true);

  if (previousHttp === undefined) {
    delete process.env.ENABLE_HTTP_SERVER;
  } else {
    process.env.ENABLE_HTTP_SERVER = previousHttp;
  }

  if (previousDyno === undefined) {
    delete process.env.DYNO;
  } else {
    process.env.DYNO = previousDyno;
  }
});
