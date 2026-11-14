# QəbulFit Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: Every document outside explicitly permitted collections must be denied read and write access (`match /{document=**} { allow read, write: if false; }`).
2. **PII Isolation**: User email addresses must NEVER be stored on `/users/{userId}`. Email PII lives strictly under `/users/{userId}/private/info` and is readable/writable only by the owning user (`request.auth.uid == userId`) or a verified admin.
3. **Zero Privilege Escalation**: Users creating their own `/users/{userId}` document must set `role == 'user'` and cannot self-assign `role == 'admin'`. Users cannot read or mutate `/admins/{userId}` unless they are already an admin.
4. **Verified Email Requirement**: All authenticated write operations require `request.auth.token.email_verified == true`.
5. **Answer Key Isolation**: Verified answer keys (`/questionAnswers/{questionId}`), answer-key PDFs (`/answerKeyFiles/{fileId}`), and answer-key review entries (`/answerKeyFiles/{fileId}/entries/{entryId}`) are strictly admin-only (`isAdmin()`) for both reads and writes.
6. **Master Gate & Atomicity on Subcollections**:
   - `/users/{userId}/attempts/{attemptId}` requires parent `/users/{userId}` to exist (`exists(...)`), enforces `userId == request.auth.uid`, and locks terminal state (`status == 'submitted'`) against any subsequent updates or tampering.
   - `/answerKeyFiles/{fileId}/entries/{entryId}` requires parent `/answerKeyFiles/{fileId}` to exist (`exists(...)`) and validates `answerKeyFileId == fileId`.
7. **Temporal & Field Immutability**: `createdAt == request.time` on creation and `createdAt` is immutable on update; `updatedAt == request.time` on updates; `uid` / `userId` ownership fields are immutable after creation.
8. **Strict Key & Size Guards**: Every `create` enforces `hasAll` + `hasOnly`; every `update` enforces `affectedKeys().hasOnly(...)` + full schema validation (`isValid*`); every document ID matches `^[a-zA-Z0-9_\-]+$` (length `<= 128`); every string enforces explicit `.size()` bounds; array lengths are strictly capped.
9. **No Blanket List Delegation**: Public catalog reads (`subjects`, `topics`, `examFiles`, `questions`) explicitly require `resource.data.visibility == 'public'` in both `get` and `list` rules.

## 2. The "Dirty Dozen" Attack Payloads (Expected: `PERMISSION_DENIED`)
1. **Self-Assigned Admin Escalation**: Unprivileged user attempts `create /users/{uid}` with `{ uid, displayName: "Attacker", role: "admin", createdAt: serverTimestamp, updatedAt: serverTimestamp }`.
2. **Shadow / Ghost Field Injection**: User attempts `create /users/{uid}` with valid keys plus `{ isAdmin: true }`.
3. **Cross-User PII Snooping**: Authenticated user `userB` attempts `get /users/userA/private/info`.
4. **Unverified Email Spoof Admin**: User with `email: "tygali346@gmail.com"` and `email_verified: false` attempts `get /questionAnswers/1` or `write /questions/1`.
5. **Answer Key Leak Read**: Standard authenticated user attempts `get` or `list` on `/questionAnswers` or `/answerKeyFiles`.
6. **Public Collection Tampering**: Standard authenticated user attempts `create` or `update` on `/questions/1` or `/subjects/informatika`.
7. **Orphaned Attempt Write**: User attempts `create /users/{uid}/attempts/att1` before `/users/{uid}` exists, or sets `userId: "otherUser"`.
8. **Terminal State Attempt Tampering**: User attempts `update /users/{uid}/attempts/att1` to alter `correctCount` or `scorePercent` after `status == 'submitted'`.
9. **Client-Forged Timestamp**: User attempts `create /users/{uid}/attempts/att1` with backdated `createdAt` instead of `request.time`.
10. **ID Poisoning / Oversized Path ID**: Attacker attempts `create /users/bad$id!...` or 500-char document ID violating `isValidId()`.
11. **Value / Type Poisoning on Update**: User attempts `update /users/{uid}` setting `displayName` to an integer `12345` or a 10KB string exceeding `maxLength: 120`.
12. **Blanket User List Scraping**: Standard user attempts `list /users` or `list /users/{otherUid}/attempts`.
