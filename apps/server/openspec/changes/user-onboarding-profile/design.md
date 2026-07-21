# Design: User Onboarding Profile

## Technical Approach

Extend the existing User model with a `profileComplete` flag rather than creating a separate Profile model. This avoids duplication, maintains referential integrity, and aligns with the existing `PUT /api/auth/profile` endpoint. Add Supabase Storage integration for avatar uploads and enforce profile completion via middleware.

## Architecture Decisions

### Decision: Extend User Model vs Create Profile Model

**Choice**: Add `profileComplete` boolean to User model  
**Alternatives considered**: Separate Profile model with userId reference  
**Rationale**: User model already contains `name`, `lastName`, `birthdate`, `avatarUrl`. Separate model creates duplication and requires joins for simple reads. The existing `PUT /api/auth/profile` endpoint already updates these fields.

### Decision: Server-Side Avatar Upload

**Choice**: Client uploads to server, server uploads to Supabase Storage  
**Alternatives considered**: Client uploads directly to Supabase using anon key  
**Rationale**: Server-side upload enables validation (type, size), sanitization, and path control. Prevents client-side bypass of restrictions. Supabase anon key remains private.

### Decision: Middleware Chain Order

**Choice**: `authenticate()` → `requireCompleteProfile()` → protected routes  
**Alternatives considered**: Check profile inside each controller  
**Rationale**: Centralized enforcement prevents accidental bypass. Onboarding route excluded from `requireCompleteProfile` to avoid deadlock.

### Decision: Profile Completion Flag Strategy

**Choice**: Boolean flag set during onboarding, migrated for existing users  
**Alternatives considered**: Computed flag based on field presence  
**Rationale**: Computed flag requires database query on every request. Boolean flag is O(1) read. Migration sets flag for existing users with complete profiles.

## Data Flow

```
New User Flow:
┌─────────┐    ┌──────────┐    ┌────────────┐    ┌─────────────┐
│ Register │───▶│ Confirm  │───▶│ Onboarding │───▶│   Home      │
│          │    │  Email   │    │  Screen    │    │  (Profile)  │
└─────────┘    └──────────┘    └────────────┘    └─────────────┘
                    │                │                    │
                    ▼                ▼                    ▼
              isActive=true   profileComplete=true   Full Access

Existing User Flow:
┌────────────────┐    ┌─────────────┐
│ Login (no      │───▶│ Middleware  │
│ birthdate)     │    │ blocks     │
└────────────────┘    └────────────┘
                           │
                           ▼
                      Redirect to
                      onboarding
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/models/User.ts` | Modify | Add `profileComplete: boolean` field |
| `src/controllers/AuthController.ts` | Modify | Add `onboarding()` method, enhance `session()` |
| `src/controllers/UserController.ts` | Modify | Add `uploadAvatar()` method |
| `src/middleware/auth.ts` | Modify | Add `requireCompleteProfile()` middleware |
| `src/routes/authRoute.ts` | Modify | Add onboarding route |
| `src/routes/userRoute.ts` | Modify | Add avatar upload route |
| `src/utils/supabase.ts` | Create | Supabase Storage client helper |
| `src/config/supabase.ts` | Create | Supabase config validation |
| `package.json` | Modify | Add `@supabase/supabase-js` dependency |
| `src/migrations/add-profile-complete.ts` | Create | Migration script for existing users |

## Interfaces / Contracts

### API Endpoints

```typescript
// Onboarding endpoint
POST /api/auth/onboarding
Body: {
  fullName: string;      // 2-50 chars, min 2 words
  birthdate: Date;       // Required, format: YYYY-MM-DD
  avatarUrl?: string;    // Optional, Supabase URL after upload
}
Response: { message: string; user: IUser }

// Avatar upload endpoint
POST /api/users/avatar
Body: FormData { avatar: File }
Response: { avatarUrl: string }

// Enhanced session endpoint
GET /api/auth/session
Response: {
  _id: string;
  name: string;
  lastName: string;
  email: string;
  role: string;
  profileComplete: boolean;  // NEW
  // ... other fields
}
```

### User Model Extension

```typescript
interface IUser extends Document {
  // ... existing fields
  profileComplete: boolean;  // NEW - default: false
}
```

### Supabase Config

```typescript
// src/config/supabase.ts
interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Profile completion logic | Mock User model, test flag updates |
| Integration | Onboarding endpoint | Supertest with test database |
| Integration | Avatar upload | Mock Supabase client |
| E2E | Full onboarding flow | Test registration → confirm → onboarding → home |

## Migration / Rollout

### Migration Script
```typescript
// src/migrations/add-profile-complete.ts
// 1. Add profileComplete field to User schema
// 2. Set profileComplete: true for users with:
//    - name AND lastName AND birthdate present
// 3. Set profileComplete: false for users without birthdate
```

### Rollout Steps
1. Deploy code with new field (default: false)
2. Run migration script
3. Enable `requireCompleteProfile` middleware
4. Monitor for false negatives (users blocked incorrectly)

## Open Questions

- [ ] Should we support social login (Google) onboarding flow?
- [ ] What's the maximum file size for avatars? (Proposal says 2MB)
- [ ] Should we generate thumbnails for avatars?
- [ ] Do we need rate limiting on avatar uploads?
