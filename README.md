<div align="center">
  <img src="assets/logo.svg" width="96" height="96" alt="pi-keys logo">
  <h1>pi-keys</h1>
  <p><strong>Rotate to the next API key when a request fails, so one exhausted key does not end the run — while Pi keeps ownership of retries.</strong></p>
</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a>
</p>

`pi-keys` turns ordinary environment credentials into a key pool for [Pi](https://github.com/earendil-works/pi). It keeps the key that works and advances only after a failed assistant response. Pi's existing retry, backoff, cancellation, and conversation-recovery behavior is left untouched.

## Quick start

```bash
export OPENAI_API_KEY=key-a
export OPENAI_API_KEYS=key-a,key-b,key-c
pi -e ./index.js
```

Or install the extension into Pi:

```bash
pi install /absolute/path/to/pi-keys
```

That is the whole setup: no runtime dependencies, no build step, and no separate rotation configuration file.

## What it can do now

- **One pool per provider.** Every `*_API_KEYS` variable defines a comma-separated pool for its matching `*_API_KEY`. `OPENAI_API_KEY` pairs with `OPENAI_API_KEYS`, `ACME_API_KEY` with `ACME_API_KEYS`, and so on.
- **Custom providers work unchanged.** If an existing Pi provider configuration references the singular variable, the pool applies to it:

  ```json
  { "apiKey": "$ACME_API_KEY" }
  ```

- **Keeps the successful key.** Rotation happens only on an assistant `error`. Successful responses, aborted requests, and tool errors do not rotate.
- **Same provider, same endpoint.** The extension changes credentials, not routing; it never picks another provider or model.
- **No hidden state.** Nothing is written to credential files, no keys are logged, and the rotation cursor is the resolved key itself.
- **Zero runtime dependencies.** One small extension file, exercised by a unit test and an opt-in end-to-end smoke test.

### Input contract

The extension trusts these caller guarantees; it does not validate or repair them:

- Every pool contains nonempty, distinct keys (surrounding whitespace is trimmed).
- Keys do not appear in different pools.
- The singular variable exists and initially equals the pool's first key.
- The model actually authenticates through that environment variable. Do not override it with `--api-key`, stored `/login` credentials, or a literal configured key.

### Retry settings

Configure Pi's existing retry settings, for example:

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 1000000,
    "baseDelayMs": 2000,
    "maxAgentDelayMs": 60000,
    "provider": { "maxRetries": 0 }
  }
}
```

This is a large finite budget, not an infinite-retry guarantee. Pi resets its agent retry count after a successful assistant response. Pi delays between individual attempts, not only after exhausting a pool. Provider-internal retries are disabled so failures reach Pi and rotation happens before its next attempt.

## Limits

- **Rotation does not make an error retryable.** Pi's classifier recognizes common rate-limit, server, and transport errors, but not every 4xx/5xx. In Pi 1.1.0, quota/billing phrases including `insufficient_quota`, `quota exceeded`, and `billing` explicitly prevent automatic retry, even in a 429 response. A larger budget does not change classification. The extension still rotates on such a failure, but Pi may end the run. It does not rewrite errors to bypass that policy.
- **Context overflow remains Pi's responsibility.** The extension rotates on any assistant `error`, including one Pi subsequently handles with compaction.
- **Overlapping calls are not coordinated.** Requests sharing a pool are not tracked while in flight: the hook resolves authentication after failure rather than recording the credential each request actually used. Ordinary sequential agent requests are the supported path.
- **Some provider extensions are out of scope.** Arbitrary provider extensions that capture a key once, ignore Pi authentication, or put it exclusively in custom headers are not guaranteed to work.
- **No outer-process recovery.** The extension does not extend a workflow timeout, choose alternative providers or models, or recover a terminated process.

## Architecture

```text
index.js — one extension, no dependencies
│
├─ initialisation
│    scan process.env for *_API_KEYS
│    build key → pool lookup
│
└─ message_end (assistant, stopReason === "error")
     ├─ find the physical provider/model in Pi's model registry
     ├─ resolve its credential with getApiKeyAndHeaders()
     ├─ if the key belongs to a pool, advance
     │    process.env[<PROVIDER>_API_KEY] = next key
     └─ return without replacing the message or scheduling work
```

Pi decides what happens next. The resolved key doubles as the rotation cursor, so no independent index or provider mapping can become stale. Initialisation does not change the singular variable. Environment changes are local to the Pi process and its subsequently spawned children, not the parent shell.

Built-in environment auth and custom `models.json` environment references resolve keys at request time in the tested Pi version, so no registry refresh or cache clearing is necessary.

## How to develop

```bash
npm test                    # unit test: rotation, cursor, non-error messages
PI_KEYS_SMOKE=1 npm test    # opt-in end-to-end test with real Pi retries
```

The smoke test requires `pi` on `PATH`. It creates isolated temporary settings and a local fake OpenAI-compatible server, with dummy keys only. It verifies real Pi retries after alternating 429/500 failures, including a full pool cycle, for both a built-in provider and a custom `models.json` provider. It makes no external API calls. Tests have bounded execution and remove temporary configuration afterward.

Verified against Pi 1.1.0. Broader provider coverage and indefinite quota recovery are not claimed.

## How to contribute

Bug reports and focused pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md); the short version is: keep the extension dependency-free, leave retry policy to Pi, and add a test for any behavior change.

## Roadmap

**Implemented**

- Environment pool discovery for any `*_API_KEY` / `*_API_KEYS` pair, with wrap-around rotation.
- Support for built-in providers and custom `models.json` providers that reference an environment variable.
- Unit coverage for rotation, cursor behavior, and non-error messages.
- Opt-in end-to-end smoke test covering real Pi retries after 429/500 responses and a complete pool cycle.
- No filesystem writes, no key logging, and no separate state to keep in sync.

**Planned and explicitly not claimed yet**

- Coordination for overlapping in-flight requests sharing one pool.
- A broader provider matrix beyond the built-in provider and the custom `models.json` path.
- Clearer behavior when Pi's classifier refuses to retry quota or billing failures; this depends on Pi policy, and the extension does not force it.

The future vision is deliberately small: key pools should behave like one durable credential, with no daemon, no state file, and no extra configuration. As Pi's extension API grows, `pi-keys` should stay a compact adapter that defers all scheduling, retry, and recovery decisions to Pi.

## License

Licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
