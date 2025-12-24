# Express API with ClearAuth

Simple Express API with ClearAuth authentication.

## Setup

```bash
npm install
```

Create `.env`:

```bash
AUTH_SECRET=your-secret-key-at-least-32-characters
MECH_APP_ID=your-mech-app-id
MECH_API_KEY=your-mech-api-key

# Optional: OAuth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## Run

```bash
npm run dev
```

## Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/register` | POST | Register |
| `/api/auth/login` | POST | Login |
| `/api/auth/logout` | POST | Logout |
| `/api/auth/session` | GET | Get session |
| `/api/auth/oauth/github` | GET | GitHub OAuth |
| `/api/auth/oauth/google` | GET | Google OAuth |
| `/api/me` | GET | Get current user (protected) |
| `/health` | GET | Health check |
