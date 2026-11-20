# vonChat Firestore Security Specification

## 1. Data Invariants

1. **PII Isolation**: User email addresses and private preferences reside strictly in `/users/{userId}` and `/users/{userId}/contacts/{contactUid}` (`allow list: if false`, `allow get` owner-only). Public member cards in `/presence/{userId}` never store emails and disable `list`. Exact-email discovery uses `/email_directory/{emailHash}` keyed by SHA-256 of normalized lowercase email with `allow list: if false`.
2. **Canonical 1-on-1 Conversations**: A conversation in `/conversations/{conversationId}` always has two distinct, valid, immutable participants (`participantA < participantB`) and deterministic ID `participantA + '_' + participantB`. Both participants must exist in `/presence/{uid}` at creation.
3. **Master Gate Membership**: Subcollections (`/conversations/{conversationId}/participants/{participantId}`, `/messages/{messageId}`, `/reactions/{reactionId}`) validate parent conversation membership via `get()` on `create`, `get`, and `delete`.
4. **Zero-Cost, Enforced List Queries**: `allow list` rules never invoke `get()` or `exists()`, and always constrain `resource.data.participantA == request.auth.uid || resource.data.participantB == request.auth.uid`.
5. **Identity & Temporal Integrity**: All `uid`, `sender_id`, `user_id`, and `created_by` fields must equal `request.auth.uid` on create. `createdAt` and `updatedAt` must equal `request.time`, and `createdAt` is immutable on update.
6. **Strict Schema & Key Allowlisting**: Every document enforces `keys().hasAll(...)` and `keys().hasOnly(...)` inside `isValid[Entity]`, plus `.size()` limits on all strings and `isValidId()` regex checks on all single-document path IDs.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Identity Spoofing on Message**: Authenticated as `userA`, attempt to create `/conversations/userA_userB/messages/msg1` with `sender_id: "userB"`. Expected: `PERMISSION_DENIED`.
2. **Ghost / Shadow Field Injection on User Profile**: Authenticated as `userA`, attempt to update `/users/userA` with `{ is_online: true, isAdmin: true, updatedAt: serverTimestamp() }`. Expected: `PERMISSION_DENIED`.
3. **PII Email Scraping (`list` on `/users`)**: Authenticated as `userA`, attempt `list` query on `/users`. Expected: `PERMISSION_DENIED`.
4. **PII Cross-User `get` on `/users/{userB}`**: Authenticated as `userA`, attempt `get` on `/users/userB`. Expected: `PERMISSION_DENIED`.
5. **Client Timestamp Forgery**: Authenticated as `userA`, attempt to create `/conversations/userA_userB/messages/msg2` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`. Expected: `PERMISSION_DENIED`.
6. **Immutable Participant Hijack**: Authenticated as `userA`, attempt to update `/conversations/userA_userB` modifying `participantB` to `"userC"`. Expected: `PERMISSION_DENIED`.
7. **ID Poisoning (Oversized/Unsafe Path ID)**: Authenticated as `userA`, attempt to write `/conversations/userA_userB/messages/${"a".repeat(200)}` or `../evil`. Expected: `PERMISSION_DENIED`.
8. **Content Resource Exhaustion**: Authenticated as `userA`, attempt to create a message with `content` length `4001` characters (exceeds `maxLength: 4000`). Expected: `PERMISSION_DENIED`.
9. **Unauthorized Conversation Snooping (`list` without member filter)**: Authenticated as `userC` (non-member), attempt `list` on `/conversations` or `get` on `/conversations/userA_userB`. Expected: `PERMISSION_DENIED`.
10. **Orphaned Reaction Against Non-Existent Message**: Authenticated as `userA`, attempt to create `/conversations/userA_userB/reactions/rx1` pointing to `message_id: "missing_msg"`. Expected: `PERMISSION_DENIED`.
11. **Cross-User Reaction Deletion**: Authenticated as `userA`, attempt to delete `/conversations/userA_userB/reactions/rx_userB` owned by `userB`. Expected: `PERMISSION_DENIED`.
12. **Directory Poisoning (`email_directory`)**: Authenticated as `userA`, attempt to create or overwrite `/email_directory/<hash>` claiming `uid: "userB"`. Expected: `PERMISSION_DENIED`.
