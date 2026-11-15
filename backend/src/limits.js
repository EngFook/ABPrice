// Coarse daily limits stored in Workers KV, to cap abuse and total spend.
// KV is eventually consistent, so a burst can slip slightly past a limit; that is acceptable here.

const TWO_DAYS = 60 * 60 * 48;

export function dayKey(now) {
  return now.toISOString().slice(0, 10); // UTC date
}

/**
 * Counts one request for this device and for the whole service.
 * Returns { ok: true } or { ok: false, code } when a limit is reached.
 * Without a KV binding (local development) every request is allowed.
 */
export async function checkAndCount(kv, { deviceId, perDevice, global, now }) {
  if (!kv) return { ok: true };
  const day = dayKey(now);
  const deviceKey = `d:${day}:${deviceId}`;
  const globalKey = `g:${day}`;
  const [deviceCount, globalCount] = (await Promise.all([kv.get(deviceKey), kv.get(globalKey)])).map(
    value => Number(value) || 0,
  );
  if (deviceCount >= perDevice) return { ok: false, code: "device_daily_limit" };
  if (globalCount >= global) return { ok: false, code: "service_daily_limit" };
  await Promise.all([
    kv.put(deviceKey, String(deviceCount + 1), { expirationTtl: TWO_DAYS }),
    kv.put(globalKey, String(globalCount + 1), { expirationTtl: TWO_DAYS }),
  ]);
  return { ok: true };
}
