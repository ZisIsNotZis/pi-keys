/** Rotate environment-backed credentials; Pi owns retry policy and timing. */
export default function keyRotation(pi) {
  const poolsByKey = new Map();
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.endsWith("_API_KEYS") || !value) continue;
    const pool = {
      envName: name.slice(0, -1),
      keys: value.split(",").map((key) => key.trim()),
    };
    for (const key of pool.keys) poolsByKey.set(key, pool);
  }

  pi.on("message_end", async ({ message }, ctx) => {
    if (message.role !== "assistant" || message.stopReason !== "error") return;
    const model = ctx.modelRegistry.find(message.provider, message.model);
    if (!model) return;
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok || !auth.apiKey) return;
    const pool = poolsByKey.get(auth.apiKey);
    if (!pool) return;
    const index = pool.keys.indexOf(auth.apiKey);
    process.env[pool.envName] = pool.keys[(index + 1) % pool.keys.length];
  });
}
