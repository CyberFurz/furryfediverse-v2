# FurryFediverse

A platform for discovering and learning about Fediverse instances, with native support for Fediverse login via a custom Better-Auth adapter.

## Tech Stack

- **Framework**: Astro 6 (SSR mode with Node.js adapter)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Better-Auth with custom Fediverse adapter
- **Styling**: Tailwind CSS 4
- **UI Components**: React 19
- **Fediverse Integration**: Megalodon (Mastodon/Pleroma/Pixelfed/Firefish/GoToSocial API client)

## Architecture

### Custom Fediverse Auth Adapter

This project implements a custom authentication flow that allows users to sign up and log in using their existing Fediverse accounts, rather than creating yet another username/password combination.

#### How It Works

1. **Platform Detection**: Supports Mastodon, Pleroma/Akkoma, Pixelfed, Firefish/Iceshrimp, and GoToSocial via the megalodon library.

2. **OAuth Flow**: When a user initiates Fediverse login:
   - The server registers a new application with the target instance
   - An OAuth authorization URL is generated with a cryptographically secure state token
   - The state is stored in the database (`AuthFlowState` model) with a 10-minute TTL
   - User is redirected to the instance's OAuth authorization page

3. **Callback & Profile Linking**: After the user authorizes:
   - The callback endpoint validates the state token and exchanges the code for an access token
   - Profile data is fetched (avatar, header, bio, follower counts, custom emoji)
   - Profile images are downloaded and cached locally
   - A `LinkedProfile` record is created linking the Fediverse account to the user

4. **Password Derivation** (`src/lib/fediverse-auth.ts`): Instead of storing sensitive OAuth tokens as passwords, a deterministic derived password is generated:
   ```typescript
   deriveFediversePassword({ platform, instanceDomain, externalAccountId })
   // Returns: `ffv2-fedi-${hmac_digest}-${hmac_digest}`
   ```
   This allows the standard Better-Auth email/password flow to authenticate Fediverse users by generating the same password hash that was used during account creation.

5. **Multi-Account Linking**: Users can link multiple Fediverse accounts across different platforms to a single account, enabling a unified identity.

#### Key Files

| File | Purpose |
|------|---------|
| `src/lib/fediverse-auth.ts` | Password derivation using HMAC-SHA256 |
| `src/lib/auth-flow-state.ts` | Secure state token management with TTL |
| `src/lib/auth.ts` | Better-Auth configuration with Prisma adapter |
| `src/lib/social/providers/index.ts` | Fediverse platform configurations |
| `src/pages/api/auth/link/start.ts` | Initiates OAuth flow |
| `src/pages/api/auth/link/callback.ts` | Handles OAuth callback |
| `src/pages/api/auth/fediverse-signup/complete.ts` | Completes Fediverse sign-up |

#### Auth Flow Modes

The Fediverse auth can operate in three modes:

- **register**: Creates a new account linked to the Fediverse profile
- **login**: Authenticates an existing user via their linked Fediverse account
- **link**: Links a Fediverse account to an already-logged-in user

### Database Models

#### Core Models

- **User** — Better-Auth user with role-based access control (admin, reviewer, user)
- **Session** — Active user sessions with IP/User-Agent tracking
- **Account** — OAuth provider accounts (credential-based for Fediverse derived passwords)
- **LinkedProfile** — Fediverse accounts linked to users, includes profile sync data
- **LinkedProfileHashtag** — Cached hashtag subscriptions per linked profile

#### Application Models

- **Instance** — Fediverse instances with metadata (user count, instance type, registration status)
- **InstanceApiKey** — API keys for verifying instances
- **Article** — Published articles (how-to, self-hosting guides)
- **ArticleDraft** — Draft articles pending review

## API Reference

### Authentication

All auth endpoints are under `/api/auth/` and use Better-Auth's REST API (`/[...all].ts`).

#### Fediverse Auth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/link/start` | POST | Initiates Fediverse OAuth flow |
| `/api/auth/link/callback` | GET | OAuth callback handler |
| `/api/auth/fediverse-signup/complete` | POST | Completes Fediverse account registration |

#### Linked Accounts

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/linked-accounts` | GET | List user's linked Fediverse accounts |
| `/api/auth/linked-accounts/[id]` | DELETE | Unlink a Fediverse account |
| `/api/auth/linked-accounts/[id]/sync` | POST | Manually sync profile data |
| `/api/auth/linked-accounts/sync-all` | POST | Sync all linked profiles |
| `/api/auth/linked-accounts/[id]/hashtags` | GET | List subscribed hashtags |
| `/api/auth/linked-accounts/[id]/hashtags/[tagId]` | DELETE | Unsubscribe from hashtag |

### Instances

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/instances` | GET | List verified instances (search, filter by type) |
| `/api/instances/add` | POST | Submit a new instance (requires auth) |
| `/api/instances/[id]` | GET | Get instance details |
| `/api/instances/[id]/refresh` | POST | Refresh instance metadata |
| `/api/instances/refresh-all` | POST | Refresh all instances (admin) |
| `/api/instances/verify/[apiKey]` | GET | Verify instance via API key |
| `/api/instances/images/[filename]` | GET | Serve cached instance thumbnails |

### Articles

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/learn` | GET | List published articles |
| `/api/learn` | POST | Submit new article draft (auth required) |
| `/api/learn/articles/[id]` | GET | Get article by ID |
| `/api/learn/my-drafts` | GET | List user's drafts |
| `/api/learn/images/[filename]` | GET | Serve cached article images |

### Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/instances` | GET | List all instances (admin) |
| `/api/admin/actions` | POST | User management (ban, unban, roles) |

## Development

### Prerequisites

- Node.js >= 22.12.0
- pnpm
- Docker (for PostgreSQL)

### Setup

```sh
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
# Edit .env with your configuration

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Start development server
pnpm dev
```

### Dev Container

The project includes a Dev Container configuration with Node.js 22, all native dependencies, and PostgreSQL 16:

1. Open VS Code in the project folder
2. Press `Ctrl+Shift+P` → **Dev Containers: Reopen in Container**
3. The container builds automatically

### Commands

| Command | Action |
|---------|--------|
| `pnpm dev` | Start dev server at localhost:4321 |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:push` | Push schema changes |
| `pnpm db:migrate` | Create and apply migrations |

## Deployment

```sh
# Build and run with Docker
docker compose up --build
```

The production Dockerfile uses a multi-stage build with the Node.js adapter for SSR.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Secret for deriving Fediverse passwords |
| `AUTH_SECRET` | Fallback secret for password derivation |
| `SITE_URL` | Public site URL (for OAuth redirect URIs) |
| `SMTP_HOST` | SMTP server for transactional emails |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
