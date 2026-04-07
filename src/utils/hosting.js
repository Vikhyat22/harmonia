export function getHostingInfo() {
  const isRender = Boolean(
    process.env.RENDER ||
    process.env.RENDER_SERVICE_ID ||
    process.env.RENDER_INSTANCE_ID
  );
  const isHeroku = Boolean(process.env.DYNO || process.env.HEROKU_APP_NAME);

  return {
    platform: isRender ? 'render' : isHeroku ? 'heroku' : 'unknown',
    isHeroku,
    isRender,
    renderServiceId: process.env.RENDER_SERVICE_ID ?? null,
    renderInstanceId: process.env.RENDER_INSTANCE_ID ?? null,
    renderExternalUrl: process.env.RENDER_EXTERNAL_URL ?? null,
    renderRegion: process.env.RENDER_REGION ?? null,
    herokuAppName: process.env.HEROKU_APP_NAME ?? null,
    herokuDyno: process.env.DYNO ?? null
  };
}

export function getHostingWarnings() {
  const hosting = getHostingInfo();
  const warnings = [];

  if (hosting.isRender) {
    warnings.push(
      'If this service is on Render free tier, idle suspension can disconnect the Discord gateway.'
    );
  }

  if (hosting.isHeroku && hosting.herokuDyno?.startsWith('worker.')) {
    warnings.push(
      'HTTP health and dashboard routes are disabled by default on Heroku worker dynos unless ENABLE_HTTP_SERVER=true.'
    );
  }

  return warnings;
}
