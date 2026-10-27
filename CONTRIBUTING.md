# Contributing to pi-keys

Thanks for taking a look. `pi-keys` is intentionally small: one extension file, no runtime dependencies, and no build step. Changes that keep it that way are the easiest to accept.

## Set up

```bash
git clone https://github.com/ZisIsNotZis/pi-keys.git
cd pi-keys
npm test
```

There is no install step: the package has no dependencies. The unit test uses Node's built-in test runner.

## Run the smoke test

```bash
PI_KEYS_SMOKE=1 npm test
```

This is opt-in and requires `pi` on `PATH`. It starts a local fake OpenAI-compatible server, uses dummy keys, and makes no external API calls. Temporary Pi settings are created in a temporary directory and removed afterward.

## Changing rotation behavior

- **Pi owns retry policy.** Do not schedule retries, alter backoff, rewrite errors, or replace messages from the extension.
- **Never log or persist keys.** Environment changes should stay in the Pi process and its children.
- **Keep the resolved key as the cursor.** Do not add a parallel index or provider mapping that can drift.
- **Add a test for every behavior change.** Unit coverage is expected; use the smoke test when the change depends on real Pi retry behavior.

## Pull requests

- Keep commits focused and use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Update both `README.md` and `README.zh-CN.md` when user-facing behavior or setup changes.
- State the Pi version you tested against. Do not add benchmarks or compatibility claims that are not measured.
- Describe what changed and what remains unsupported.

## License

By contributing, you agree that your contribution is licensed under the GNU Affero General Public License v3.0, the same license as this project.
