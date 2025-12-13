# Troubleshooting Guide

> **Note**: ClearAuth requires explicit configuration. The library does not read environment variables automatically. All configuration must be passed to `createClearAuth()` directly.

## Configuration Issues

### "appId is required" or "apiKey is required"

**Cause**: You didn't pass the required configuration to `createClearAuth()`.

**Solution**: Pass all required configuration explicitly:

**Node.js / Next.js:**
```ts
import { createClearAuth } from "clearauth"

export const auth = createClearAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
  },
  isProduction: process.env.NODE_ENV === "production",
})
```

**Cloudflare Workers:**
```ts
export function createAuth(env: Env) {
  return createClearAuth({
    secret: env.BETTER_AUTH_SECRET,
    database: {
      appId: env.MECH_APP_ID,
      apiKey: env.MECH_API_KEY,
    },
    isProduction: true,
  })
}
```

### "Invalid UUID for appId"

**Cause**: The `appId` is not a valid UUID.

**Solution**: Verify the UUID format. Valid format: `550e8400-e29b-41d4-a716-446655440000`

### "Invalid URL: ..."

**Cause**: The `baseUrl` is not a valid URL (if you provided one).

**Solution**: Ensure it's a valid HTTP/HTTPS URL:
```ts
createClearAuth({
  database: {
    appId: "...",
    apiKey: "...",
    baseUrl: "https://storage.mechdna.net", // optional, this is the default
  }
})
```

---

## Authentication Issues

### "Mech SQL request failed with status 401"

**Cause**: Your API key is invalid, expired, or incorrect.

**Solution**:
1. Verify the `apiKey` you're passing to `createClearAuth()` is correct
2. Check if the key has been rotated on the Mech side
3. Generate a new API key from the Mech Storage dashboard
4. Ensure you're using the right app ID

**Example:**
```ts
createClearAuth({
  database: {
    appId: "your-correct-app-id",
    apiKey: "your-valid-api-key", // Make sure this is current
  }
})
```

### "Mech SQL request failed with status 403"

**Cause**: Your API key doesn't have permission for this operation.

**Solution**:
1. Check that your API key has the necessary permissions
2. Verify you're using the correct app ID
3. Contact Mech support if permissions are correct

---

## Network Issues

### "Mech SQL request failed with status 404"

**Cause**: The app or schema doesn't exist, or the URL is incorrect.

**Solution**:
1. Verify the `appId` you're passing is correct
2. Verify the `appSchemaId` (if provided) is correct
3. Verify the `baseUrl` (if provided) is correct
4. Ensure the app exists in Mech Storage

### "Mech SQL request failed with status 500"

**Cause**: Mech Storage server error.

**Solution**:
1. Check Mech Storage status page
2. Retry the request (automatic retry happens up to 2 times by default)
3. Contact Mech support if the issue persists

### "Mech SQL request failed with status 503"

**Cause**: Mech Storage is temporarily unavailable.

**Solution**:
1. Wait a few seconds and retry
2. Automatic retry logic will kick in (up to 2 times by default)
3. Check Mech Storage status page

### "Query timed out after 30000ms"

**Cause**: The query took longer than 30 seconds.

**Solution**:
1. Optimize your SQL query (add indexes, reduce data size)
2. Increase the timeout:
   ```ts
   createClearAuth({
     database: {
       appId: "...",
       apiKey: "...",
       timeout: 60000, // 60 seconds
     }
   })
   ```
3. Break the query into smaller parts

---

## Rate Limiting

### "Rate limit exceeded. Retry after Xms"

**Cause**: You've exceeded the rate limit for Mech Storage API.

**Solution**:
1. Automatic retry logic will wait and retry
2. Reduce the frequency of requests
3. Batch multiple queries into fewer requests
4. Contact Mech support if you need a higher rate limit

---

## Cloudflare Pages Issues

### OAuth providers not working (secrets exist but are empty)

**Symptom:** OAuth sign-in returns "OAuth not configured" even though secrets are set.

**Cause:** Secrets were set with empty or falsy values (likely piped empty strings when using `wrangler pages secret put`).

**Debugging:**
Add debug output to check if secrets exist:
```ts
// In your auth handler
console.log({
  envKeys: Object.keys(env),
  hasGitHubId: !!env.GITHUB_CLIENT_ID,
  hasGitHubSecret: !!env.GITHUB_CLIENT_SECRET,
})
```

If `envKeys` includes the secret names but `hasGitHubId` is `false`, the secrets exist but have empty values.

**Solution:** Re-set the secrets with actual values:
```bash
# Set GitHub OAuth credentials
echo "your_actual_github_client_id" | wrangler pages secret put GITHUB_CLIENT_ID --project-name=your-project
echo "your_actual_github_client_secret" | wrangler pages secret put GITHUB_CLIENT_SECRET --project-name=your-project

# Set Google OAuth credentials
echo "your_actual_google_client_id" | wrangler pages secret put GOOGLE_CLIENT_ID --project-name=your-project
echo "your_actual_google_client_secret" | wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=your-project
```

Then redeploy:
```bash
wrangler pages deploy dist --project-name=your-project
```

**Where to get OAuth credentials:**
- **GitHub:** https://github.com/settings/developers
- **Google:** https://console.cloud.google.com/apis/credentials

**Don't forget to set redirect URIs:**
- GitHub: `https://yourdomain.com/api/auth/callback/github`
- Google: `https://yourdomain.com/api/auth/callback/google`

---

## Better Auth Issues

### "secret is required"

**Cause**: You didn't pass the `secret` parameter to `createClearAuth()`.

**Solution**: Generate and pass a strong secret:

**Node.js / Next.js (.env.local):**
```bash
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
```

Then pass it explicitly:
```ts
createClearAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  database: { /* ... */ }
})
```

**Cloudflare Workers:**
```bash
wrangler secret put BETTER_AUTH_SECRET
# Enter your secret when prompted
```

Then use it:
```ts
createClearAuth({
  secret: env.BETTER_AUTH_SECRET,
  database: { /* ... */ }
})
```

### "Cannot use default secret in production"

**Cause**: You're using the default/placeholder secret in production.

**Solution**: Generate a strong secret (minimum 32 characters) and ensure `isProduction` is set correctly:
```ts
createClearAuth({
  secret: env.BETTER_AUTH_SECRET, // Must be a real secret
  isProduction: true, // This triggers the validation
  database: { /* ... */ }
})
```

---

## Debugging

### Enable debug logging

Pass a custom logger to see detailed logs:

```ts
import { createClearAuth } from "clearauth"

const auth = createClearAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  database: {
    appId: process.env.MECH_APP_ID!,
    apiKey: process.env.MECH_API_KEY!,
    logger: {
      debug: (msg, data) => console.log('[DEBUG]', msg, data),
      error: (msg, err) => console.error('[ERROR]', msg, err),
    }
  },
})
```

### Verify your configuration

**Node.js / Next.js:**
```bash
# Check your environment variables
echo "MECH_APP_ID: $MECH_APP_ID"
echo "MECH_API_KEY: ${MECH_API_KEY:0:10}..." # only show first 10 chars
echo "BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:0:10}..." # only show first 10 chars
```

**Cloudflare Workers:**
```bash
# List your secrets (won't show values)
wrangler secret list
```

### Test the Mech SQL client directly

```ts
import { MechSqlClient } from "clearauth"

const client = new MechSqlClient({
  appId: "your-app-id",
  apiKey: "your-api-key",
})

const result = await client.execute("SELECT 1 as test")
console.log(result) // Should print: { rows: [{ test: 1 }], rowCount: 1 }
```

If this works, the issue is likely with Better Auth configuration.

---

## Getting Help

1. Check this troubleshooting guide
2. Review the [README.md](./README.md) and [examples](./examples/)
3. Check the [GitHub issues](https://github.com/dundas/clearauth/issues)
4. Contact Mech support at support@mechdna.net
