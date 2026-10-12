# Release checklist

BlackWire's canonical runtime is Node.js 22.5 or newer. The npm package ships the compiled application directly; the PyPI package ships a Python console launcher plus self-contained JavaScript bundles and still requires Node 22.5+ on the user's `PATH`.

## Before tagging

1. Confirm `.blackwire/` is ignored and no credentials appear in tracked files.
2. Update the version in `package.json` and `src/version.ts`.
3. Update `CHANGELOG.md`.
4. Run `npm ci` and `npm run release:check`.
5. Run `npm run bundle:pypi` and the Python launcher tests.
6. Inspect `npm pack --dry-run --json`.
7. Build and inspect the PyPI wheel and source distribution.
8. Test both generated packages in clean temporary environments.

## Publish npm

```bash
npm login
npm publish
```

Use npm trusted publishing or a narrowly scoped automation token when configuring CI publishing. Never commit a registry token.

## Create the GitHub release

```bash
git tag -s v0.1.0 -m "BlackWire v0.1.0"
git push origin v0.1.0
```

The release workflow verifies the version, runs the release checks, packs the npm tarball, and attaches it to the GitHub release.

## PyPI

Build the self-contained launcher package:

```bash
npm run release:pypi
python -m build --outdir pypi-dist
python -m twine check pypi-dist/*
python -m twine upload pypi-dist/*
```

The launcher never downloads npm packages at installation time or runtime. It locates the user's installed `node`, verifies the minimum version, and runs the bundled CLI. Do not publish until both `blackwire` names are reserved under accounts you control; registry availability can change at any time.
