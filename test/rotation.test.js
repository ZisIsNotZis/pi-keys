import assert from "node:assert/strict";
import { test } from "node:test";
import keyRotation from "../index.js";

const envName = "PI_KEYS_TEST_API_KEY";
const poolName = `${envName}S`;

test("rotation delegates policy to Pi and leaves other messages alone", async () => {
  const before = { key: process.env[envName], pool: process.env[poolName] };
  process.env[envName] = "test-a";
  process.env[poolName] = "test-a, test-b, test-c";
  try {
    let handler;
    keyRotation({ on(event, callback) {
      assert.equal(event, "message_end");
      handler = callback;
    } });
    let resolutions = 0;
    let resolvedKey;
    let found = true;
    let authOk = true;
    const ctx = { modelRegistry: {
      find(provider, id) {
        assert.equal(provider, "test-provider");
        assert.equal(id, "test-model");
        return found ? { provider, id } : undefined;
      },
      async getApiKeyAndHeaders() {
        resolutions++;
        return authOk
          ? { ok: true, apiKey: resolvedKey ?? process.env[envName] }
          : { ok: false, error: "unconfigured" };
      },
    } };
    const message = { role: "assistant", provider: "test-provider", model: "test-model", stopReason: "error" };
    assert.equal(process.env[envName], "test-a", "initialization preserves singular key");
    for (const key of ["test-b", "test-c", "test-a"]) {
      assert.equal(await handler({ message }, ctx), undefined, "no message rewriting");
      assert.equal(process.env[envName], key);
    }
    await handler({ message: { ...message, stopReason: "stop" } }, ctx);
    await handler({ message: { ...message, stopReason: "aborted" } }, ctx);
    await handler({ message: { role: "toolResult" } }, ctx);
    assert.equal(resolutions, 3);
    resolvedKey = "unmanaged-key";
    await handler({ message }, ctx);
    assert.equal(process.env[envName], "test-a");
    authOk = false;
    await handler({ message }, ctx);
    assert.equal(process.env[envName], "test-a");
    found = false;
    await handler({ message }, ctx);
    assert.equal(resolutions, 5);
  } finally {
    for (const [name, value] of [[envName, before.key], [poolName, before.pool]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
