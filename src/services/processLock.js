import { promises as fs } from 'fs';
import path from 'path';

const LOCK_PATH = path.join(process.cwd(), '.bot.lock');

export async function acquireProcessLock() {
  try {
    const handle = await fs.open(LOCK_PATH, 'wx');
    await handle.writeFile(`${process.pid}\n`, 'utf8');
    await handle.close();

    const cleanup = async () => {
      await fs.unlink(LOCK_PATH).catch(() => {});
    };

    process.on('exit', cleanup);
    process.on('SIGINT', async () => {
      await cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await cleanup();
      process.exit(0);
    });

    return { success: true, release: cleanup };
  } catch {
    return {
      success: false,
      error: 'Another local bot instance appears to be running in this workspace. Stop it first or remove .bot.lock if it is stale.'
    };
  }
}
