# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Default-Deny Catch-All**: Every path not explicitly matched under `/commanders/{commanderId}`, `/structures/{structureId}`, or `/units/{unitId}` is strictly denied (`allow read, write: if false;`).
2. **Verified Authentication & Admin Identity**: All write operations require a signed-in user with a verified email (`request.auth != null && request.auth.token.email_verified == true`) or a verified admin (`request.auth.token.email == 'ahmedahmedlandmod@gmail.com' && request.auth.token.email_verified == true` or existence in `/admins/$(request.auth.uid)`).
3. **Path Variable & ID Hardening**: All document IDs (`commanderId`, `structureId`, `unitId`) must match `^[a-zA-Z0-9_\-]+$` with length between 1 and 128 characters.
4. **Commander Profile Ownership**: A `/commanders/{commanderId}` document can only be created or updated when `commanderId == request.auth.uid` and `incoming().ownerId == request.auth.uid`. No PII (emails, phone numbers, addresses) is permitted in the schema.
5. **Relational Existence (`Global Consistency Invariant`)**: A `/structures/{structureId}` or `/units/{unitId}` document cannot be created unless the owning commander profile `/commanders/$(request.auth.uid)` already exists (`exists(...)`), and `incoming().ownerId == request.auth.uid`.
6. **Immutability & Temporal Integrity**:
   - On `create`: `createdAt == request.time && updatedAt == request.time`.
   - On `update`: `ownerId == existing().ownerId && createdAt == existing().createdAt && updatedAt == request.time`.
7. **Strict Key Allowlisting (`Anti-Update-Gap`)**:
   - Every `create` enforces `hasAll` and `hasOnly` for exact schema fields.
   - Every `update` wraps logic inside `isValid[Entity](incoming())` and uses action-specific `affectedKeys().hasOnly(...)`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Identity Spoofing on Commander Create)**: Authenticated user `uid_alice` attempts to create `/commanders/uid_bob` with `ownerId: "uid_bob"`.
2. **Payload 2 (Unverified Email Write)**: User with `email_verified: false` attempts to create `/commanders/uid_unverified`.
3. **Payload 3 (Shadow / Ghost Field Injection)**: User creates `/commanders/uid_alice` with an undeclared field `isSuperAdmin: true`.
4. **Payload 4 (Resource Value Poisoning / Negative Gold)**: User updates `/commanders/uid_alice` with `gold: -999999` or `gold: "infinite"`.
5. **Payload 5 (Timestamp Forgery on Create)**: User creates `/structures/str_1` with a client-forged past timestamp `createdAt: Timestamp(2020, 1, 1)` instead of `request.time`.
6. **Payload 6 (Orphaned Structure Without Commander Profile)**: User `uid_no_profile` attempts to create `/structures/str_orphan` before creating `/commanders/uid_no_profile`.
7. **Payload 7 (Invalid Structure Evolution Tier)**: User attempts to update `/structures/str_1` with `level: 99` (outside allowed `1..3`).
8. **Payload 8 (Hostile Structure Takeover / Owner Mutation)**: User `uid_mallory` attempts to update `ownerId` on `/structures/str_alice` or modify another player's structure.
9. **Payload 9 (ID Poisoning Attack)**: User attempts to create `/structures/invalid$id!with*spaces` violating `isValidId`.
10. **Payload 10 (String Boundary Overflow / Denial of Wallet)**: User sends a 5,000-character string in `displayName` or `factionName`.
11. **Payload 11 (Immutable `createdAt` Mutation on Update)**: User updates `/units/unt_1` while mutating `createdAt` along with `x` and `z`.
12. **Payload 12 (Invalid Enum on Unit Creation)**: User creates `/units/unt_dragon` with `kind: "dragon"` instead of `['worker', 'infantry', 'knight']`.
