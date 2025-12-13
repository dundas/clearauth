# Installation Guide

## Install from npm

### Quick Install

```bash
npm install clearauth arctic @node-rs/argon2 oslo kysely
```

### Using package.json

Add the following to your `package.json`:

```json
{
  "dependencies": {
    "clearauth": "^0.3.0",
    "arctic": "^3.0.0",
    "@node-rs/argon2": "^2.0.0",
    "oslo": "^1.2.0",
    "kysely": "^0.27.3"
  }
}
```

Then run:
```bash
npm install
```

### Using Yarn

```bash
yarn add clearauth arctic @node-rs/argon2 oslo kysely
```

### Using pnpm

```bash
pnpm add clearauth arctic @node-rs/argon2 oslo kysely
```

### Using Bun

```bash
bun add clearauth arctic @node-rs/argon2 oslo kysely
```

## Platform-Specific Dependencies

### Next.js

```bash
npm install clearauth arctic @node-rs/argon2 oslo kysely react
```

### Cloudflare Workers/Pages

```bash
npm install clearauth arctic @node-rs/argon2 oslo kysely
```

> **Note:** Argon2 requires Node.js bindings and won't work in Cloudflare Workers. Password hashing should be done in a separate Node.js service or use bcrypt as an alternative.

### Node.js (Express/Fastify)

With Express:
```bash
npm install clearauth arctic @node-rs/argon2 oslo kysely express
```

With Fastify:
```bash
npm install clearauth arctic @node-rs/argon2 oslo kysely fastify
```

## Verification

After installation, verify the package is installed:

```bash
npm list clearauth
```

You should see:

```
└── clearauth@0.3.0
```

## TypeScript Support

TypeScript types are included automatically. No additional `@types` package needed.

## Updating

To update to the latest version:

```bash
npm update clearauth
```

Or update to a specific version:

```bash
npm install clearauth@0.3.0
```

## Migrating from v0.2.0 (Better Auth)

If you're upgrading from v0.2.0 which used Better Auth:

1. **Uninstall Better Auth:**
```bash
npm uninstall better-auth
```

2. **Install new dependencies:**
```bash
npm install arctic @node-rs/argon2 oslo
```

3. **Update imports:**

Replace imports from `@mech/auth` with `clearauth`.

3. **Update your code** - See [CHANGELOG.md](./CHANGELOG.md) for migration guide

## Troubleshooting

### "Package not found"

Make sure you're using the correct npm package name:
```bash
npm install clearauth
```

Not:
```bash
npm install @mech/auth  # ❌ Old package name (use clearauth)
```

### Permission Issues

If you encounter permission errors, try:

```bash
npm install clearauth --legacy-peer-deps
```

### Corporate Firewall/Proxy

If you're behind a corporate firewall that blocks GitHub:

1. Ask your IT team to whitelist `github.com`
2. Or download the repository and install locally:

```bash
git clone https://github.com/dundas/mech-auth.git
cd your-project
npm install ../path/to/mech-auth
```

### Argon2 Build Errors

If you get build errors for @node-rs/argon2:

1. Make sure you have a C++ compiler installed:
   - **macOS:** `xcode-select --install`
   - **Ubuntu/Debian:** `sudo apt-get install build-essential`
   - **Windows:** Install Visual Studio Build Tools

2. Or use pre-built binaries (recommended):
```bash
npm install @node-rs/argon2 --ignore-scripts=false
```

## Next Steps

After installation, see:
- [README.md](./README.md) - Quick start guide
- [CHANGELOG.md](./CHANGELOG.md) - Migration guide from v0.2.0
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Comprehensive deployment guide
