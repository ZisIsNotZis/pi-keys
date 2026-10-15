import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

// Opt-in: requires a Pi installation, but no real credentials or external API.
test("real Pi re-reads keys on retries: builtin and models.json", {
  skip: !process.env.PI_KEYS_SMOKE,
  timeout: 60000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-keys-smoke-"));
  const keys = [];
  const server = createServer((request, response) => {
    request.resume();
    keys.push(request.headers.authorization);
    const attempt = keys.length;
    if (attempt < 5) {
      const limited = attempt % 2 === 1;
      response.writeHead(limited ? 429 : 500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: limited ? "rate limit" : "server error" } }));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end('data: {"id":"test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"success"},"finish_reason":null}]}\n\ndata: {"id":"test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  try {
    await writeFile(join(directory, "settings.json"), JSON.stringify({
      retry: { enabled: true, maxRetries: 5, baseDelayMs: 1, maxAgentDelayMs: 1, provider: { maxRetries: 0 } },
      cacheWarming: "off",
    }));
    for (const provider of ["openai", "rotation-test"]) {
      keys.length = 0;
      await writeFile(join(directory, "models.json"), JSON.stringify({ providers: {
        [provider]: {
          baseUrl, api: "openai-completions",
          ...(provider === "openai" ? {} : { apiKey: "$SMOKE_API_KEY" }),
          models: [{ id: "rotation-model", contextWindow: 32000, maxTokens: 100 }],
        },
      } }));
      const output = await new Promise((done, reject) => {
        const child = spawn("pi", ["--offline", "--no-extensions", "-e", resolve("index.js"),
          "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files",
          "--no-tools", "--no-session", "--no-approve", "--model", `${provider}/rotation-model`,
          "--thinking", "off", "--mode", "json", "-p", "Say success"], {
          cwd: directory,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            PATH: process.env.PATH, HOME: directory,
            PI_OFFLINE: "1", PI_CODING_AGENT_DIR: directory,
            OPENAI_API_KEY: "smoke-a", OPENAI_API_KEYS: "smoke-a,smoke-b,smoke-c",
            SMOKE_API_KEY: "custom-a", SMOKE_API_KEYS: "custom-a,custom-b,custom-c",
          },
        });
        let stdout = "", stderr = "";
        const deadline = setTimeout(() => child.kill("SIGKILL"), 20000);
        child.stdout.on("data", (data) => { stdout += data; });
        child.stderr.on("data", (data) => { stderr += data; });
        child.on("error", (error) => { clearTimeout(deadline); reject(error); });
        child.on("close", (code) => {
          clearTimeout(deadline);
          if (code !== 0) reject(new Error(`Pi exited ${code}; requests=${JSON.stringify(keys)}: ${stderr}\n${stdout}`));
          else done(stdout);
        });
      });
      const prefix = provider === "openai" ? "smoke" : "custom";
      assert.deepEqual(keys, ["a", "b", "c", "a", "b"].map((key) => `Bearer ${prefix}-${key}`), provider);
      assert.match(output, /success/);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    await rm(directory, { recursive: true, force: true });
  }
});
