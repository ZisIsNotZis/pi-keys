# pi-keys

Minimal environment API-key rotation for Pi. Keep the successful key; advance on a failed assistant response. Pi owns retries, backoff, cancellation, and conversation recovery.

## Usage

```bash
export OPENAI_API_KEY=key-a
export OPENAI_API_KEYS=key-a,key-b,key-c
pi -e ./index.js
```

Or install the package with `pi install /absolute/path/to/pi-keys`.

Every `*_API_KEYS` variable defines a comma-separated pool for its corresponding `*_API_KEY`. Custom providers work too when their existing Pi configuration references the singular variable:

```json
{ "apiKey": "$ACME_API_KEY" }
```

That is ordinary provider configuration, not a separate rotation configuration file.

### Input contract

The extension trusts these caller guarantees; it does not validate or repair them:

- Every pool contains nonempty, distinct keys (surrounding whitespace is trimmed).
- Keys do not appear in different pools.
- The singular variable exists and initially equals the pool's first key.
- The model actually authenticates through that environment variable. Do not override it with `--api-key`, stored `/login` credentials, or a literal configured key.

## Retry settings

Configure Pi's existing settings, for example:

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

**Rotation does not make an error retryable.** Pi's classifier recognizes common rate-limit, server, and transport errors, but not every 4xx/5xx. In Pi 1.1.0, quota/billing phrases including `insufficient_quota`, `quota exceeded`, and `billing` explicitly prevent automatic retry, even in a 429 response. A larger budget does not change classification. The extension still rotates on such a failure, but Pi may end the run. It does not rewrite errors to bypass that policy.

Context overflow remains Pi's responsibility; the extension rotates on any assistant `error`, including one Pi subsequently handles with compaction. Successful responses, aborted requests, and tool errors do not rotate.

## How it works

At extension initialization, build a key-to-pool lookup from the environment. On `message_end` for an assistant error:

1. Find the failed message's physical provider/model through Pi's public model registry.
2. Resolve its credential through `getApiKeyAndHeaders()`.
3. If the key belongs to a pool, set the singular environment variable to the next key, wrapping at the end.
4. Return without replacing the message or scheduling work. Pi decides what happens next.

The resolved key is also the rotation cursor, so no independent index or provider mapping can become stale. Initialization does not change the singular variable. Nothing is written to credential files, and the extension does not log keys. Environment changes are local to the Pi process (and subsequently spawned children), not the parent shell.

Built-in environment auth and custom `models.json` environment references resolve keys at request time in the tested Pi version. No registry refresh or cache clearing is necessary. Arbitrary provider extensions that capture a key once, ignore Pi authentication, or put it exclusively in custom headers are not guaranteed to work.

This extension rotates credentials within the same provider/endpoint. It does not choose alternative providers or models. It does not extend an outer workflow timeout or recover a terminated process. Overlapping model calls sharing a pool are not coordinated: the hook resolves authentication after failure, rather than recording the credential each request actually used. Ordinary sequential agent requests are the supported path.

## Development

No runtime dependencies, build step, or Pi source changes.

```bash
npm test
PI_KEYS_SMOKE=1 npm test
```

The opt-in smoke test requires `pi` on `PATH`. It creates isolated temporary settings and a local fake OpenAI-compatible server, with dummy keys only. It verifies real Pi retries after alternating 429/500 failures, including a full pool cycle, for both a built-in provider and a custom `models.json` provider. It makes no external API calls. Tests have bounded execution and remove temporary configuration afterward.

Verified against Pi 1.1.0. Broader provider coverage and indefinite quota recovery are not claimed.
