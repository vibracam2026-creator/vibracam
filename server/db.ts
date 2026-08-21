import { and, desc, eq, gt, inArray, isNull, like, lt, ne, or, sql } from "drizzle-orm";
import "dotenv/config";
import { randomBytes } from "crypto";
import { drizzle } from "drizzle-orm/mysql2";
import {
  accountTokens,
  authSessions,
  passkeys,
  passkeyChallenges,
  comments,
  chatGroups,
  chatGroupMembers,
  chatGroupMessages,
  follows,
  friendRequests,
  groupMembers,
  groupPosts,
  groups,
  interests,
  localCredentials,
  messages,
  messageReactions,
  notifications,
  postLikes,
  postShares,
  posts,
  productImages,
  products,
  privacySettings,
  reels,
  reelLikes,
  reelViews,
  stories,
  storyInteractions,
  storyPollVotes,
  storyQuestions,
  reports,
  userInterests,
  userBlocks,
  users,
  calls,
  randomCallQueue,
  liveStreams,
  liveStreamViewers,
  liveStreamChatMessages,
  liveStreamReactions,
  contentModerationChecks,
  parentalConsents,
  minorRestrictions,
  channels,
  channelSubscribers,
  channelPosts,
  voiceSpaces,
  voiceSpaceParticipants,
  bots,
  botRules,
  accountPreferences,
  accountProfileDetails,
  accountVerification,
  verificationRequests,
  adminAuditLogs,
  twoFactorSettings,
  linkedApps,
  accountActivity,
  type InsertUser,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { emitRealtime } from "./realtime";

let database: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!database && ENV.databaseUrl) database = drizzle(ENV.databaseUrl);
  return database;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة حاليًا.");
  return db;
}

/** يمنع تسريب البريد والهاتف وتاريخ الميلاد ومعرّف الدخول في الاستجابات العامة. */
export function toPublicUser(user: typeof users.$inferSelect) {
  const { openId, email, phoneNumber, dateOfBirth, loginMethod, role, lastSignedIn, ...publicUser } = user;
  return publicUser;
}

export async function upsertUser(user: InsertUser) {
  const db = await requireDb();
  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  const fields = ["name", "username", "email", "loginMethod", "avatarUrl", "avatarKey", "bio", "country", "role"] as const;
  for (const field of fields) {
    if (user[field] !== undefined) {
      (values as Record<string, unknown>)[field] = user[field];
      updateSet[field] = user[field];
    }
  }
  if (user.openId === ENV.ownerOpenId && user.role === undefined) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({
    set: updateSet,
  });
  return getUserByOpenId(user.openId);
}


export async function ensureOwnerAdmin() {
  const ownerEmail = (ENV.ownerEmail || "").trim().toLowerCase();
  if (!ownerEmail) return;
  const database = await requireDb();
  await database.update(users).set({ role: "admin" }).where(sql`LOWER(${users.email}) = ${ownerEmail}`);
}
export async function getUserByOpenId(openId: string) {
  const db = await requireDb();
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export async function getUserByEmail(email: string) {
  const db = await requireDb();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return undefined;
  return (await db.select().from(users).where(sql`LOWER(${users.email}) = ${normalizedEmail}`).limit(1))[0];
}

export async function getUserById(id: number) {
  const db = await requireDb();
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
}

export async function getUserByUsername(username: string) {
  const db = await requireDb();
  return (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
}

export async function getLocalAccountByEmail(email: string) {
  const db = await requireDb();
  return (await db
    .select({ user: users, credential: localCredentials })
    .from(localCredentials)
    .innerJoin(users, eq(localCredentials.userId, users.id))
    .where(eq(localCredentials.email, email))
    .limit(1))[0];
}

export async function getLocalCredentialByEmail(email: string) {
  const db = await requireDb();
  return (await db.select().from(localCredentials).where(eq(localCredentials.email, email)).limit(1))[0];
}

export async function deleteLocalCredentialById(id: number) {
  const db = await requireDb();
  await db.delete(localCredentials).where(eq(localCredentials.id, id));
}

export async function createAccountToken(input: { userId: number; tokenHash: string; purpose: "email_verification" | "password_reset"; expiresAt: Date }) {
  const db = await requireDb();
  await db.insert(accountTokens).values(input);
}

export async function getActiveAccountToken(tokenHash: string, purpose: "email_verification" | "password_reset") {
  const db = await requireDb();
  return (await db.select().from(accountTokens).where(and(eq(accountTokens.tokenHash, tokenHash), eq(accountTokens.purpose, purpose), isNull(accountTokens.usedAt), gt(accountTokens.expiresAt, new Date()))).limit(1))[0];
}

export async function consumeAccountToken(tokenId: number) {
  const db = await requireDb();
  await db.update(accountTokens).set({ usedAt: new Date() }).where(and(eq(accountTokens.id, tokenId), isNull(accountTokens.usedAt)));
}

export async function createPasskeyChallenge(input: { userId: number; flow: "registration" | "authentication"; origin: string; challenge: string; expiresAt: Date }) {
  const db = await requireDb();
  if (input.flow === "registration") await db.delete(passkeyChallenges).where(and(eq(passkeyChallenges.userId, input.userId), eq(passkeyChallenges.flow, input.flow)));
  else await db.delete(passkeyChallenges).where(and(eq(passkeyChallenges.flow, "authentication"), lt(passkeyChallenges.expiresAt, new Date())));
  const inserted = await db.insert(passkeyChallenges).values(input);
  return Number(inserted[0].insertId);
}

export async function getActivePasskeyChallenge(userId: number, flow: "registration" | "authentication") {
  const db = await requireDb();
  return (await db.select().from(passkeyChallenges).where(and(eq(passkeyChallenges.userId, userId), eq(passkeyChallenges.flow, flow), gt(passkeyChallenges.expiresAt, new Date()))).orderBy(desc(passkeyChallenges.createdAt)).limit(1))[0];
}

export async function getActivePasskeyChallengeByValue(challenge: string, flow: "authentication") {
  const db = await requireDb();
  return (await db.select().from(passkeyChallenges).where(and(eq(passkeyChallenges.challenge, challenge), eq(passkeyChallenges.flow, flow), gt(passkeyChallenges.expiresAt, new Date()))).limit(1))[0];
}

export async function consumePasskeyChallenge(id: number) {
  const db = await requireDb();
  await db.delete(passkeyChallenges).where(eq(passkeyChallenges.id, id));
}

export async function listPasskeys(userId: number) {
  const db = await requireDb();
  return db.select({ id: passkeys.id, credentialId: passkeys.credentialId, transports: passkeys.transports, deviceType: passkeys.deviceType, backedUp: passkeys.backedUp, createdAt: passkeys.createdAt }).from(passkeys).where(eq(passkeys.userId, userId)).orderBy(desc(passkeys.createdAt));
}

export async function getPasskeyByCredentialId(credentialId: string) {
  const db = await requireDb();
  return (await db.select().from(passkeys).where(eq(passkeys.credentialId, credentialId)).limit(1))[0];
}

export async function createPasskey(input: { userId: number; credentialId: string; publicKey: string; counter: number; transports?: string | null; deviceType?: string | null; backedUp: boolean }) {
  const db = await requireDb();
  await db.insert(passkeys).values(input);
}

export async function updatePasskeyCounter(id: number, counter: number) {
  const db = await requireDb();
  await db.update(passkeys).set({ counter }).where(eq(passkeys.id, id));
}

export async function deletePasskey(userId: number, passkeyId: number) {
  const db = await requireDb();
  await db.delete(passkeys).where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)));
}

export async function getUserIdByPasskeyCredential(credentialId: string) {
  const db = await requireDb();
  return (await db.select({ userId: passkeys.userId }).from(passkeys).where(eq(passkeys.credentialId, credentialId)).limit(1))[0]?.userId;
}

export async function markEmailVerified(userId: number) {
  const db = await requireDb();
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  return getUserById(userId);
}

export async function updateLocalPassword(userId: number, passwordHash: string) {
  const db = await requireDb();
  await db.update(localCredentials).set({ passwordHash }).where(eq(localCredentials.userId, userId));
}

export async function createAuthSession(input: { userId: number; sessionHash: string; userAgent?: string | null; expiresAt: Date }) {
  const db = await requireDb();
  await db.insert(authSessions).values(input).onDuplicateKeyUpdate({ set: { lastActiveAt: new Date(), expiresAt: input.expiresAt, revokedAt: null } });
}

export async function getActiveAuthSession(sessionHash: string) {
  const db = await requireDb();
  return (await db.select().from(authSessions).where(and(eq(authSessions.sessionHash, sessionHash), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date()))).limit(1))[0];
}

export async function touchAuthSession(sessionHash: string) {
  const db = await requireDb();
  await db.update(authSessions).set({ lastActiveAt: new Date() }).where(and(eq(authSessions.sessionHash, sessionHash), isNull(authSessions.revokedAt)));
}

export async function listAuthSessions(userId: number) {
  const db = await requireDb();
  return db.select().from(authSessions).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date()))).orderBy(desc(authSessions.lastActiveAt));
}

export async function revokeAuthSession(userId: number, sessionId: number) {
  const db = await requireDb();
  await db.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
}

export async function revokeOtherAuthSessions(userId: number, currentSessionHash: string) {
  const db = await requireDb();
  await db.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt), sql`${authSessions.sessionHash} <> ${currentSessionHash}`));
}

export async function revokeAllAuthSessions(userId: number, exceptSessionHash?: string) {
  const db = await requireDb();
  const predicates = [eq(authSessions.userId, userId), isNull(authSessions.revokedAt)];
  if (exceptSessionHash) predicates.push(sql`${authSessions.sessionHash} <> ${exceptSessionHash}` as any);
  await db.update(authSessions).set({ revokedAt: new Date() }).where(and(...predicates));
}

export async function revokeAuthSessionByHash(sessionHash: string) {
  const db = await requireDb();
  await db.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.sessionHash, sessionHash), isNull(authSessions.revokedAt)));
}

export async function createLocalAccount(input: { openId: string; name: string; firstName: string; lastName: string; username: string; email: string; passwordHash: string; dateOfBirth: string; country: string; city: string; timeZone?: string | null; defaultCurrency?: string | null; role?: "user" | "moderator" | "admin" }) {
  const db = await requireDb();
  const now = new Date();
  const userId = await db.transaction(async tx => {
    const createdUser = await tx.insert(users).values({
      openId: input.openId,
      name: input.name,
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      email: input.email,
      loginMethod: "email",
      dateOfBirth: input.dateOfBirth,
      country: input.country,
      city: input.city,
      timeZone: input.timeZone ?? null,
      defaultCurrency: input.defaultCurrency ?? "SAR",
      role: input.role ?? "user",
      lastSignedIn: now,
    });
    const id = Number(createdUser[0].insertId);
    await tx.insert(localCredentials).values({ userId: id, email: input.email, passwordHash: input.passwordHash });
    return id;
  });
  return getUserById(userId);
}

export async function touchLocalUser(userId: number) {
  const db = await requireDb();
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

export async function updateProfile(
  userId: number,
  input: Partial<Pick<InsertUser, "name" | "firstName" | "lastName" | "username" | "bio" | "country" | "city" | "dateOfBirth" | "gender" | "phoneNumber" | "websiteUrl" | "socialLinks" | "timeZone" | "defaultCurrency" | "avatarUrl" | "avatarKey" | "coverUrl" | "coverKey">>
) {
  const db = await requireDb();
  await db.update(users).set(input).where(eq(users.id, userId));
  return getUserById(userId);
}

export async function getPrivacySettings(userId: number) {
  const db = await requireDb();
  const existing = (await db.select().from(privacySettings).where(eq(privacySettings.userId, userId)).limit(1))[0];
  if (existing) return existing;
  await db.insert(privacySettings).values({ userId }).onDuplicateKeyUpdate({ set: { userId } });
  return (await db.select().from(privacySettings).where(eq(privacySettings.userId, userId)).limit(1))[0];
}

export async function updatePrivacySettings(userId: number, input: Partial<Pick<typeof privacySettings.$inferInsert, "profileVisibility" | "showCity" | "showWebsite" | "showSocialLinks" | "showFollowers" | "showFollowing" | "showPosts">>) {
  const db = await requireDb();
  await db.insert(privacySettings).values({ userId, ...input }).onDuplicateKeyUpdate({ set: input });
  return getPrivacySettings(userId);
}

export async function isUserBlockedBetween(firstUserId: number, secondUserId: number) {
  const db = await requireDb();
  return Boolean((await db.select().from(userBlocks).where(or(and(eq(userBlocks.blockerId, firstUserId), eq(userBlocks.blockedId, secondUserId)), and(eq(userBlocks.blockerId, secondUserId), eq(userBlocks.blockedId, firstUserId)))).limit(1))[0]);
}

export async function blockUser(blockerId: number, blockedId: number) {
  if (blockerId === blockedId) throw new Error("لا يمكنك حظر حسابك الشخصي.");
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.insert(userBlocks).values({ blockerId, blockedId }).onDuplicateKeyUpdate({ set: { blockerId } });
    await tx.delete(follows).where(or(and(eq(follows.followerId, blockerId), eq(follows.followingId, blockedId)), and(eq(follows.followerId, blockedId), eq(follows.followingId, blockerId))));
  });
}

export async function unblockUser(blockerId: number, blockedId: number) {
  const db = await requireDb();
  await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
}

export async function listBlockedUsers(blockerId: number) {
  const db = await requireDb();
  return (await db.select({ user: users }).from(userBlocks).innerJoin(users, eq(userBlocks.blockedId, users.id)).where(eq(userBlocks.blockerId, blockerId))).map(row => ({ user: toPublicUser(row.user) }));
}

export async function createReport(input: { reporterId: number; targetType: "user" | "post" | "product" | "message"; targetId: number; reason: "spam" | "harassment" | "blackmail" | "inappropriate_content" | "fraud" | "phishing" | "counterfeit" | "hate_speech" | "violence" | "impersonation" | "fake_account" | "misinformation" | "copyright" | "trademark" | "technical_issue" | "malicious_reporting" | "other"; details?: string | null }) {
  const db = await requireDb();
  const inserted = await db.insert(reports).values(input);
  return Number(inserted[0].insertId);
}

export async function searchUsers(query: string, interestIds: number[] = []) {
  const db = await requireDb();
  const term = `%${query.trim()}%`;
  const base = query.trim()
    ? db
        .select()
        .from(users)
        .where(or(like(users.name, term), like(users.username, term), like(users.country, term)))
        .limit(30)
    : db.select().from(users).limit(30);
  const found = await base;
  if (!interestIds.length) return found.map(toPublicUser);
  const matches = await db
    .select({ userId: userInterests.userId })
    .from(userInterests)
    .where(inArray(userInterests.interestId, interestIds));
  const accepted = new Set(matches.map(row => row.userId));
  return found.filter(user => accepted.has(user.id)).map(toPublicUser);
}

export async function getProfileWithCounts(userId: number, viewerId?: number) {
  const db = await requireDb();
  const user = await getUserById(userId);
  if (!user) return undefined;
  const [followers] = await db.select({ count: sql<number>`count(*)` }).from(follows).where(eq(follows.followingId, userId));
  const [following] = await db.select({ count: sql<number>`count(*)` }).from(follows).where(eq(follows.followerId, userId));
  const [postCount] = await db.select({ count: sql<number>`count(*)` }).from(posts).where(eq(posts.userId, userId));
  const isFollowing = viewerId
    ? Boolean((await db.select().from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.followingId, userId))).limit(1))[0])
    : false;
  const userTags = await db
    .select({ id: interests.id, name: interests.name })
    .from(userInterests)
    .innerJoin(interests, eq(userInterests.interestId, interests.id))
    .where(eq(userInterests.userId, userId));
  const isOwner = viewerId === userId;
  const privacy = isOwner ? undefined : await getPrivacySettings(userId);
  const canViewProfile = isOwner || privacy?.profileVisibility === "public" || (privacy?.profileVisibility === "followers" && isFollowing);
  const publicUser = toPublicUser(user);
  const profile = isOwner ? user : {
    ...publicUser,
    bio: canViewProfile ? publicUser.bio : null,
    coverUrl: canViewProfile ? publicUser.coverUrl : null,
    city: canViewProfile && privacy?.showCity ? publicUser.city : null,
    websiteUrl: canViewProfile && privacy?.showWebsite ? publicUser.websiteUrl : null,
    socialLinks: canViewProfile && privacy?.showSocialLinks ? publicUser.socialLinks : null,
  };
  return {
    ...profile,
    followersCount: isOwner || (canViewProfile && privacy?.showFollowers) ? Number(followers?.count ?? 0) : 0,
    followingCount: isOwner || (canViewProfile && privacy?.showFollowing) ? Number(following?.count ?? 0) : 0,
    postsCount: isOwner || (canViewProfile && privacy?.showPosts) ? Number(postCount?.count ?? 0) : 0,
    contentVisible: isOwner || Boolean(canViewProfile && privacy?.showPosts),
    isFollowing,
    interests: canViewProfile ? userTags : [],
  };
}

export async function isFollowingUser(followerId: number, followingId: number) {
  const db = await requireDb();
  return Boolean((await db.select({ id: follows.id }).from(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId))).limit(1))[0]);
}

export async function followUser(followerId: number, followingId: number) {
  const db = await requireDb();
  if (followerId === followingId) throw new Error("لا يمكنك متابعة حسابك الشخصي.");
  const existing = await db.select().from(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId))).limit(1);
  if (existing[0]) return false;
  await db.insert(follows).values({ followerId, followingId });
  return true;
}

export async function unfollowUser(followerId: number, followingId: number) {
  const db = await requireDb();
  await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
}

export async function listFollowers(userId: number, viewerId?: number) {
  const db = await requireDb();
  const privacy = await getPrivacySettings(userId);
  const isFollowing = viewerId ? Boolean((await db.select().from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.followingId, userId))).limit(1))[0]) : false;
  const canView = viewerId === userId || (privacy.showFollowers && (privacy.profileVisibility === "public" || (privacy.profileVisibility === "followers" && isFollowing)));
  if (!canView) return [];
  return (await db.select({ user: users }).from(follows).innerJoin(users, eq(follows.followerId, users.id)).where(eq(follows.followingId, userId))).map(row => ({ user: toPublicUser(row.user) }));
}

export async function listFollowing(userId: number, viewerId?: number) {
  const db = await requireDb();
  const privacy = await getPrivacySettings(userId);
  const isFollowing = viewerId ? Boolean((await db.select().from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.followingId, userId))).limit(1))[0]) : false;
  const canView = viewerId === userId || (privacy.showFollowing && (privacy.profileVisibility === "public" || (privacy.profileVisibility === "followers" && isFollowing)));
  if (!canView) return [];
  return (await db.select({ user: users }).from(follows).innerJoin(users, eq(follows.followingId, users.id)).where(eq(follows.followerId, userId))).map(row => ({ user: toPublicUser(row.user) }));
}

export async function getFriendRequestStatus(viewerId: number, otherUserId: number) {
  const db = await requireDb();
  const row = (await db.select().from(friendRequests).where(or(and(eq(friendRequests.senderId, viewerId), eq(friendRequests.receiverId, otherUserId)), and(eq(friendRequests.senderId, otherUserId), eq(friendRequests.receiverId, viewerId)))).orderBy(desc(friendRequests.createdAt)).limit(1))[0];
  if (!row) return { id: null as null, status: null as null, direction: null as null };
  return { id: row.id, status: row.status, direction: row.senderId === viewerId ? "outgoing" as const : "incoming" as const };
}

export async function listIncomingFriendRequests(userId: number) {
  const db = await requireDb();
  return (await db.select({ request: friendRequests, sender: users }).from(friendRequests).innerJoin(users, eq(friendRequests.senderId, users.id)).where(and(eq(friendRequests.receiverId, userId), eq(friendRequests.status, "pending"))).orderBy(desc(friendRequests.createdAt))).map(row => ({ request: row.request, user: toPublicUser(row.sender) }));
}

export async function listOutgoingFriendRequests(userId: number) {
  const db = await requireDb();
  return (await db.select({ request: friendRequests, receiver: users }).from(friendRequests).innerJoin(users, eq(friendRequests.receiverId, users.id)).where(and(eq(friendRequests.senderId, userId), eq(friendRequests.status, "pending"))).orderBy(desc(friendRequests.createdAt))).map(row => ({ request: row.request, user: toPublicUser(row.receiver) }));
}

export async function createFriendRequest(senderId: number, receiverId: number) {
  const db = await requireDb();
  if (senderId === receiverId) throw new Error("لا يمكنك إرسال طلب صداقة إلى حسابك الشخصي.");
  if (await isUserBlockedBetween(senderId, receiverId)) throw new Error("لا يمكنك إرسال طلب صداقة إلى هذا الحساب.");
  const existing = (await db.select().from(friendRequests).where(or(and(eq(friendRequests.senderId, senderId), eq(friendRequests.receiverId, receiverId)), and(eq(friendRequests.senderId, receiverId), eq(friendRequests.receiverId, senderId)))).orderBy(desc(friendRequests.createdAt)).limit(1))[0];
  if (existing?.status === "accepted") throw new Error("أنتما صديقان بالفعل.");
  if (existing?.status === "pending") return existing;
  const inserted = await db.insert(friendRequests).values({ senderId, receiverId, status: "pending" });
  return (await db.select().from(friendRequests).where(eq(friendRequests.id, Number(inserted[0].insertId))).limit(1))[0];
}

export async function respondToFriendRequest(userId: number, requestId: number, status: "accepted" | "rejected") {
  const db = await requireDb();
  const request = (await db.select().from(friendRequests).where(and(eq(friendRequests.id, requestId), eq(friendRequests.receiverId, userId), eq(friendRequests.status, "pending"))).limit(1))[0];
  if (!request) throw new Error("طلب الصداقة غير موجود أو تمت معالجته.");
  await db.transaction(async tx => {
    await tx.update(friendRequests).set({ status, respondedAt: new Date() }).where(eq(friendRequests.id, requestId));
    if (status === "accepted") {
      await tx.insert(follows).values([{ followerId: request.senderId, followingId: request.receiverId }, { followerId: request.receiverId, followingId: request.senderId }]).onDuplicateKeyUpdate({ set: { followingId: request.receiverId } });
    }
  });
  return { status, senderId: request.senderId };
}

export async function cancelFriendRequest(userId: number, requestId: number) {
  const db = await requireDb();
  const result = await db.update(friendRequests).set({ status: "canceled", respondedAt: new Date() }).where(and(eq(friendRequests.id, requestId), eq(friendRequests.senderId, userId), eq(friendRequests.status, "pending")));
  return result;
}

export async function removeFriend(userId: number, otherUserId: number) {
  const db = await requireDb();
  await db.delete(follows).where(or(and(eq(follows.followerId, userId), eq(follows.followingId, otherUserId)), and(eq(follows.followerId, otherUserId), eq(follows.followingId, userId))));
  await db.update(friendRequests).set({ status: "canceled", respondedAt: new Date() }).where(or(and(eq(friendRequests.senderId, userId), eq(friendRequests.receiverId, otherUserId), eq(friendRequests.status, "accepted")), and(eq(friendRequests.senderId, otherUserId), eq(friendRequests.receiverId, userId), eq(friendRequests.status, "accepted"))));
}

/** يحذف الحساب المحلي وكل البيانات المملوكة له في معاملة واحدة، مع حذف التفاعلات التي تركها على محتوى الآخرين. */
export async function deleteAccount(userId: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const ownedPostIds = (await tx.select({ id: posts.id }).from(posts).where(eq(posts.userId, userId))).map(row => row.id);
    const ownedProductIds = (await tx.select({ id: products.id }).from(products).where(eq(products.sellerId, userId))).map(row => row.id);
    const ownedReelIds = (await tx.select({ id: reels.id }).from(reels).where(eq(reels.userId, userId))).map(row => row.id);
    const ownedStoryIds = (await tx.select({ id: stories.id }).from(stories).where(eq(stories.userId, userId))).map(row => row.id);
    const ownedGroupIds = (await tx.select({ id: groups.id }).from(groups).where(eq(groups.ownerId, userId))).map(row => row.id);
    const ownedChatGroupIds = (await tx.select({ id: chatGroups.id }).from(chatGroups).where(eq(chatGroups.ownerId, userId))).map(row => row.id);
    const ownedChannelIds = (await tx.select({ id: channels.id }).from(channels).where(eq(channels.ownerId, userId))).map(row => row.id);
    const ownedSpaceIds = (await tx.select({ id: voiceSpaces.id }).from(voiceSpaces).where(eq(voiceSpaces.hostId, userId))).map(row => row.id);
    const ownedStreamIds = (await tx.select({ id: liveStreams.id }).from(liveStreams).where(eq(liveStreams.broadcasterId, userId))).map(row => row.id);
    const ownedInteractionIds = ownedStoryIds.length ? (await tx.select({ id: storyInteractions.id }).from(storyInteractions).where(inArray(storyInteractions.storyId, ownedStoryIds))).map(row => row.id) : [];
    const ownedDirectMessageIds = (await tx.select({ id: messages.id }).from(messages).where(or(eq(messages.senderId, userId), eq(messages.receiverId, userId)))).map(row => row.id);
    const ownedGroupMessageIds = ownedChatGroupIds.length ? (await tx.select({ id: chatGroupMessages.id }).from(chatGroupMessages).where(inArray(chatGroupMessages.chatGroupId, ownedChatGroupIds))).map(row => row.id) : [];
    const ownedBotIds = (await tx.select({ id: bots.id }).from(bots).where(eq(bots.ownerId, userId))).map(row => row.id);

    await tx.delete(reports).where(or(eq(reports.reporterId, userId), and(eq(reports.targetType, "user"), eq(reports.targetId, userId))));
    if (ownedPostIds.length) {
      await tx.delete(reports).where(and(eq(reports.targetType, "post"), inArray(reports.targetId, ownedPostIds)));
      await tx.delete(comments).where(inArray(comments.postId, ownedPostIds));
      await tx.delete(postLikes).where(inArray(postLikes.postId, ownedPostIds));
      await tx.delete(postShares).where(inArray(postShares.postId, ownedPostIds));
    }
    if (ownedProductIds.length) { await tx.delete(reports).where(and(eq(reports.targetType, "product"), inArray(reports.targetId, ownedProductIds))); await tx.delete(productImages).where(inArray(productImages.productId, ownedProductIds)); }
    if (ownedDirectMessageIds.length) { await tx.delete(reports).where(and(eq(reports.targetType, "message"), inArray(reports.targetId, ownedDirectMessageIds))); await tx.delete(messageReactions).where(inArray(messageReactions.messageId, ownedDirectMessageIds)); }
    if (ownedGroupMessageIds.length) await tx.delete(messageReactions).where(inArray(messageReactions.messageId, ownedGroupMessageIds));
    if (ownedInteractionIds.length) { await tx.delete(storyPollVotes).where(inArray(storyPollVotes.interactionId, ownedInteractionIds)); await tx.delete(storyQuestions).where(inArray(storyQuestions.interactionId, ownedInteractionIds)); await tx.delete(storyInteractions).where(inArray(storyInteractions.id, ownedInteractionIds)); }
    if (ownedStoryIds.length) await tx.delete(storyPollVotes).where(inArray(storyPollVotes.userId, [userId]));

    await tx.delete(postLikes).where(eq(postLikes.userId, userId));
    await tx.delete(postShares).where(eq(postShares.userId, userId));
    await tx.delete(comments).where(eq(comments.userId, userId));
    await tx.delete(reelLikes).where(eq(reelLikes.userId, userId));
    await tx.delete(reelViews).where(eq(reelViews.userId, userId));
    await tx.delete(storyQuestions).where(eq(storyQuestions.userId, userId));
    await tx.delete(storyPollVotes).where(eq(storyPollVotes.userId, userId));
    await tx.delete(messageReactions).where(eq(messageReactions.userId, userId));
    await tx.delete(messages).where(or(eq(messages.senderId, userId), eq(messages.receiverId, userId)));
    await tx.delete(chatGroupMessages).where(eq(chatGroupMessages.senderId, userId));
    await tx.delete(groupPosts).where(eq(groupPosts.userId, userId));
    await tx.delete(channelPosts).where(eq(channelPosts.authorId, userId));
    await tx.delete(liveStreamChatMessages).where(eq(liveStreamChatMessages.userId, userId));
    await tx.delete(liveStreamReactions).where(eq(liveStreamReactions.userId, userId));
    await tx.delete(liveStreamViewers).where(eq(liveStreamViewers.userId, userId));
    await tx.delete(voiceSpaceParticipants).where(eq(voiceSpaceParticipants.userId, userId));
    await tx.delete(calls).where(or(eq(calls.initiatorId, userId), eq(calls.receiverId, userId)));
    await tx.delete(randomCallQueue).where(eq(randomCallQueue.userId, userId));
    await tx.delete(notifications).where(or(eq(notifications.userId, userId), eq(notifications.actorId, userId)));
    await tx.delete(userInterests).where(eq(userInterests.userId, userId));
    await tx.delete(follows).where(or(eq(follows.followerId, userId), eq(follows.followingId, userId)));
    await tx.delete(friendRequests).where(or(eq(friendRequests.senderId, userId), eq(friendRequests.receiverId, userId)));
    await tx.delete(userBlocks).where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));
    await tx.delete(channelSubscribers).where(eq(channelSubscribers.userId, userId));
    await tx.delete(groupMembers).where(eq(groupMembers.userId, userId));
    await tx.delete(chatGroupMembers).where(eq(chatGroupMembers.userId, userId));
    await tx.delete(privacySettings).where(eq(privacySettings.userId, userId));
    await tx.delete(accountPreferences).where(eq(accountPreferences.userId, userId));
    await tx.delete(accountProfileDetails).where(eq(accountProfileDetails.userId, userId));
    await tx.delete(accountVerification).where(eq(accountVerification.userId, userId));
    await tx.delete(twoFactorSettings).where(eq(twoFactorSettings.userId, userId));
    await tx.delete(linkedApps).where(eq(linkedApps.userId, userId));
    await tx.delete(accountActivity).where(eq(accountActivity.userId, userId));
    await tx.delete(accountTokens).where(eq(accountTokens.userId, userId));
    await tx.delete(authSessions).where(eq(authSessions.userId, userId));
    await tx.delete(localCredentials).where(eq(localCredentials.userId, userId));
    await tx.delete(contentModerationChecks).where(eq(contentModerationChecks.userId, userId));
    await tx.delete(parentalConsents).where(eq(parentalConsents.userId, userId));
    await tx.delete(minorRestrictions).where(eq(minorRestrictions.userId, userId));

    if (ownedPostIds.length) await tx.delete(posts).where(inArray(posts.id, ownedPostIds));
    if (ownedProductIds.length) await tx.delete(products).where(inArray(products.id, ownedProductIds));
    if (ownedReelIds.length) { await tx.delete(reelLikes).where(inArray(reelLikes.reelId, ownedReelIds)); await tx.delete(reelViews).where(inArray(reelViews.reelId, ownedReelIds)); await tx.delete(reels).where(inArray(reels.id, ownedReelIds)); }
    if (ownedStoryIds.length) await tx.delete(stories).where(inArray(stories.id, ownedStoryIds));
    if (ownedChannelIds.length) { await tx.delete(channelPosts).where(inArray(channelPosts.channelId, ownedChannelIds)); await tx.delete(channelSubscribers).where(inArray(channelSubscribers.channelId, ownedChannelIds)); await tx.delete(bots).where(and(eq(bots.ownerId, userId), eq(bots.scope, "channel"))); await tx.delete(channels).where(inArray(channels.id, ownedChannelIds)); }
    if (ownedGroupIds.length) { await tx.delete(groupPosts).where(inArray(groupPosts.groupId, ownedGroupIds)); await tx.delete(groupMembers).where(inArray(groupMembers.groupId, ownedGroupIds)); await tx.delete(groups).where(inArray(groups.id, ownedGroupIds)); }
    if (ownedChatGroupIds.length) { await tx.delete(chatGroupMessages).where(inArray(chatGroupMessages.chatGroupId, ownedChatGroupIds)); await tx.delete(chatGroupMembers).where(inArray(chatGroupMembers.chatGroupId, ownedChatGroupIds)); await tx.delete(chatGroups).where(inArray(chatGroups.id, ownedChatGroupIds)); }
    if (ownedSpaceIds.length) { await tx.delete(voiceSpaceParticipants).where(inArray(voiceSpaceParticipants.spaceId, ownedSpaceIds)); await tx.delete(voiceSpaces).where(inArray(voiceSpaces.id, ownedSpaceIds)); }
    if (ownedStreamIds.length) { await tx.delete(liveStreamViewers).where(inArray(liveStreamViewers.streamId, ownedStreamIds)); await tx.delete(liveStreamChatMessages).where(inArray(liveStreamChatMessages.streamId, ownedStreamIds)); await tx.delete(liveStreamReactions).where(inArray(liveStreamReactions.streamId, ownedStreamIds)); await tx.delete(liveStreams).where(inArray(liveStreams.id, ownedStreamIds)); }
    if (ownedBotIds.length) { await tx.delete(botRules).where(inArray(botRules.botId, ownedBotIds)); await tx.delete(bots).where(inArray(bots.id, ownedBotIds)); }
    await tx.delete(users).where(eq(users.id, userId));
    return { deleted: true };
  });
}

export async function createPost(input: { userId: number; content: string; mediaUrl?: string | null; mediaKey?: string | null; mediaType?: "image" | "video" | null }) {
  const db = await requireDb();
  const inserted = await db.insert(posts).values(input);
  return getPostById(Number(inserted[0].insertId));
}

export async function updatePost(postId: number, userId: number, input: { content: string; mediaUrl?: string | null; mediaKey?: string | null; mediaType?: "image" | "video" | null }) {
  const db = await requireDb();
  await db.update(posts).set(input).where(and(eq(posts.id, postId), eq(posts.userId, userId)));
  return getPostById(postId, userId);
}

export async function deletePost(postId: number, userId: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const owned = (await tx.select().from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1))[0];
    if (!owned) throw new Error("لا تملك صلاحية حذف هذا المنشور.");
    await tx.delete(comments).where(eq(comments.postId, postId));
    await tx.delete(postLikes).where(eq(postLikes.postId, postId));
    await tx.delete(postShares).where(eq(postShares.postId, postId));
    await tx.delete(posts).where(eq(posts.id, postId));
  });
}

/** حذف إداري للمنشور (منظومة الأمان) دون تحقق من الملكية. */
export async function forceDeletePost(postId: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.delete(comments).where(eq(comments.postId, postId));
    await tx.delete(postLikes).where(eq(postLikes.postId, postId));
    await tx.delete(postShares).where(eq(postShares.postId, postId));
    await tx.delete(posts).where(eq(posts.id, postId));
  });
}

export async function getPostById(postId: number, viewerId?: number) {
  const db = await requireDb();
  const row = await db.select({ post: posts, author: users }).from(posts).innerJoin(users, eq(posts.userId, users.id)).where(eq(posts.id, postId)).limit(1);
  if (!row[0]) return undefined;
  const liked = viewerId ? Boolean((await db.select().from(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, viewerId))).limit(1))[0]) : false;
  return { ...row[0].post, author: toPublicUser(row[0].author), liked };
}

export async function listFeed(viewerId?: number, userId?: number, cursor?: number, limit = 20, feedType: "all" | "following" = "all") {
  const db = await requireDb();
  
  let conditions = [];
  if (userId) conditions.push(eq(posts.userId, userId));
  if (cursor) conditions.push(lt(posts.id, cursor));
  
  if (feedType === "following" && viewerId) {
    const followedUsers = await db.select({ followingId: follows.followingId }).from(follows).where(eq(follows.followerId, viewerId));
    const followedIds = followedUsers.map(f => f.followingId);
    followedIds.push(viewerId);
    if (followedIds.length > 0) {
      conditions.push(inArray(posts.userId, followedIds));
    }
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const rows = await db
    .select({ post: posts, author: users })
    .from(posts)
    .innerJoin(users, eq(posts.userId, users.id))
    .where(whereClause)
    .orderBy(desc(posts.id))
    .limit(limit + 1);
    
  const hasNextPage = rows.length > limit;
  const items = hasNextPage ? rows.slice(0, limit) : rows;
  const nextCursor = hasNextPage ? items[items.length - 1].post.id : undefined;
  
  const ids = items.map(row => row.post.id);
  const likedIds = viewerId && ids.length
    ? new Set((await db.select({ postId: postLikes.postId }).from(postLikes).where(and(eq(postLikes.userId, viewerId), inArray(postLikes.postId, ids)))).map(row => row.postId))
    : new Set<number>();
    
  const visibleRows = (await Promise.all(items.map(async row => {
    if (viewerId === row.author.id) return row;
    if (viewerId && await isUserBlockedBetween(viewerId, row.author.id)) return undefined;
    const privacy = await getPrivacySettings(row.author.id);
    if (!privacy.showPosts) return undefined;
    if (privacy.profileVisibility === "private") return undefined;
    if (privacy.profileVisibility === "followers") {
      if (!viewerId) return undefined;
      const followsAuthor = Boolean((await db.select().from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.followingId, row.author.id))).limit(1))[0]);
      if (!followsAuthor) return undefined;
    }
    return row;
  }))).filter((row): row is typeof items[number] => Boolean(row));
  
  const postsWithMeta = visibleRows.map(row => ({ ...row.post, author: toPublicUser(row.author), liked: likedIds.has(row.post.id) }));
  
  return {
    items: postsWithMeta,
    nextCursor,
  };
}

export async function toggleLike(postId: number, userId: number) {
  const db = await requireDb();
  const existing = await db.select().from(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId))).limit(1);
  if (existing[0]) {
    await db.delete(postLikes).where(eq(postLikes.id, existing[0].id));
    await db.update(posts).set({ likesCount: sql`GREATEST(${posts.likesCount} - 1, 0)` }).where(eq(posts.id, postId));
    return { liked: false };
  }
  await db.insert(postLikes).values({ postId, userId });
  await db.update(posts).set({ likesCount: sql`${posts.likesCount} + 1` }).where(eq(posts.id, postId));
  return { liked: true };
}

export async function sharePost(postId: number, userId: number) {
  const db = await requireDb();
  const existing = await db.select().from(postShares).where(and(eq(postShares.postId, postId), eq(postShares.userId, userId))).limit(1);
  if (existing[0]) return false;
  await db.insert(postShares).values({ postId, userId });
  await db.update(posts).set({ sharesCount: sql`${posts.sharesCount} + 1` }).where(eq(posts.id, postId));
  return true;
}

export async function addComment(postId: number, userId: number, content: string) {
  const db = await requireDb();
  const inserted = await db.insert(comments).values({ postId, userId, content });
  await db.update(posts).set({ commentsCount: sql`${posts.commentsCount} + 1` }).where(eq(posts.id, postId));
  return Number(inserted[0].insertId);
}

export async function listComments(postId: number) {
  const db = await requireDb();
  return db.select({ comment: comments, author: users }).from(comments).innerJoin(users, eq(comments.userId, users.id)).where(eq(comments.postId, postId)).orderBy(desc(comments.createdAt));
}

export async function saveMessage(senderId: number, receiverId: number, content: string, media?: { kind: "text" | "gif" | "sticker" | "audio"; mediaUrl?: string | null; mediaKey?: string | null }, replyToId?: number | null) {
  const db = await requireDb();
  if (replyToId) {
    const parent = (await db.select().from(messages).where(and(eq(messages.id, replyToId), or(and(eq(messages.senderId, senderId), eq(messages.receiverId, receiverId)), and(eq(messages.senderId, receiverId), eq(messages.receiverId, senderId))))).limit(1))[0];
    if (!parent) throw new Error("لا يمكن الرد على رسالة خارج هذه المحادثة.");
  }
  const inserted = await db.insert(messages).values({ senderId, receiverId, content, kind: media?.kind ?? "text", mediaUrl: media?.mediaUrl ?? null, mediaKey: media?.mediaKey ?? null, replyToId: replyToId ?? null });
  return (await db.select().from(messages).where(eq(messages.id, Number(inserted[0].insertId))).limit(1))[0];
}

export async function updateDirectMessage(messageId: number, userId: number, content: string) {
  const db = await requireDb();
  const message = (await db.select().from(messages).where(and(eq(messages.id, messageId), eq(messages.senderId, userId), isNull(messages.deletedAt))).limit(1))[0];
  if (!message) throw new Error("لا يمكنك تعديل هذه الرسالة.");
  await db.update(messages).set({ content, editedAt: new Date() }).where(eq(messages.id, messageId));
  const updated = (await db.select().from(messages).where(eq(messages.id, messageId)).limit(1))[0];
  if (updated) {
    emitRealtime(updated.senderId, "message:updated", updated);
    if (updated.receiverId !== updated.senderId) emitRealtime(updated.receiverId, "message:updated", updated);
  }
  return updated;
}

export async function deleteDirectMessage(messageId: number, userId: number) {
  const db = await requireDb();
  const message = (await db.select().from(messages).where(and(eq(messages.id, messageId), eq(messages.senderId, userId), isNull(messages.deletedAt))).limit(1))[0];
  if (!message) throw new Error("لا يمكنك حذف هذه الرسالة.");
  const deletedAt = new Date();
  await db.update(messages).set({ content: "", mediaUrl: null, mediaKey: null, kind: "text", deletedAt, editedAt: null }).where(eq(messages.id, messageId));
  const event = { ...message, content: "", mediaUrl: null, mediaKey: null, kind: "text" as const, deletedAt, editedAt: null };
  emitRealtime(message.senderId, "message:deleted", event);
  if (message.receiverId !== message.senderId) emitRealtime(message.receiverId, "message:deleted", event);
  return { success: true };
}

export async function listMessages(userId: number, peerId: number) {
  const db = await requireDb();
  const rows = await db.select().from(messages).where(or(and(eq(messages.senderId, userId), eq(messages.receiverId, peerId)), and(eq(messages.senderId, peerId), eq(messages.receiverId, userId)))).orderBy(messages.createdAt).limit(100);
  if (!rows.length) return [];
  const reactionRows = await db.select().from(messageReactions).where(inArray(messageReactions.messageId, rows.map(row => row.id)));
  return rows.map(message => ({ ...message, reactions: reactionRows.filter(reaction => reaction.messageId === message.id) }));
}

export async function toggleMessageReaction(messageId: number, userId: number, emoji: string) {
  const db = await requireDb();
  const message = (await db.select().from(messages).where(and(eq(messages.id, messageId), or(eq(messages.senderId, userId), eq(messages.receiverId, userId)))).limit(1))[0];
  if (!message) throw new Error("لا يمكنك التفاعل مع هذه الرسالة.");
  const existing = (await db.select().from(messageReactions).where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId), eq(messageReactions.emoji, emoji))).limit(1))[0];
  if (existing) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing.id));
    const event = { messageId, userId, emoji, active: false };
    emitRealtime(message.senderId, "message:reaction", event);
    if (message.receiverId !== message.senderId) emitRealtime(message.receiverId, "message:reaction", event);
    return { active: false };
  }
  await db.insert(messageReactions).values({ messageId, userId, emoji });
  const event = { messageId, userId, emoji, active: true };
  emitRealtime(message.senderId, "message:reaction", event);
  if (message.receiverId !== message.senderId) emitRealtime(message.receiverId, "message:reaction", event);
  return { active: true };
}

export async function markConversationRead(userId: number, peerId: number) {
  const db = await requireDb();
  await db.update(messages).set({ isRead: true }).where(and(eq(messages.senderId, peerId), eq(messages.receiverId, userId), eq(messages.isRead, false)));
}

export async function listConversations(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(messages).where(or(eq(messages.senderId, userId), eq(messages.receiverId, userId))).orderBy(desc(messages.createdAt)).limit(250);
  const latestByPeer = new Map<number, typeof rows[number]>();
  const unreadByPeer = new Map<number, number>();
  for (const message of rows) {
    const peerId = message.senderId === userId ? message.receiverId : message.senderId;
    if (!latestByPeer.has(peerId)) latestByPeer.set(peerId, message);
    if (message.senderId === peerId && !message.isRead) unreadByPeer.set(peerId, (unreadByPeer.get(peerId) ?? 0) + 1);
  }
  const peerIds = Array.from(latestByPeer.keys());
  if (!peerIds.length) return [];
  const people = await db.select().from(users).where(inArray(users.id, peerIds));
  const byId = new Map(people.map(person => [person.id, person]));
  return peerIds.map(peerId => ({ user: byId.get(peerId), lastMessage: latestByPeer.get(peerId)!, unreadCount: unreadByPeer.get(peerId) ?? 0 })).filter((row): row is { user: typeof people[number]; lastMessage: typeof rows[number]; unreadCount: number } => Boolean(row.user));
}

export async function listUnifiedMessageInbox(userId: number) {
  const db = await requireDb();
  const [direct, groupsList, channelsList] = await Promise.all([
    listConversations(userId),
    listChatGroups(userId),
    listChannels(userId),
  ]);

  const directItems = direct.map(({ user, lastMessage, unreadCount }) => ({
    kind: "direct" as const,
    id: user.id,
    title: user.name || user.username || "مستخدم VibraCam",
    subtitle: "محادثة مباشرة",
    avatarUrl: user.avatarUrl,
    preview: lastMessage.content || (lastMessage.kind === "gif" ? "GIF" : "وسائط"),
    timestamp: lastMessage.createdAt,
    unreadCount,
    href: `/messages/${user.id}`,
  }));

  const groupItems = await Promise.all(groupsList.map(async ({ group, membership, unreadCount }) => {
    const latest = (await db.select().from(chatGroupMessages).where(eq(chatGroupMessages.chatGroupId, group.id)).orderBy(desc(chatGroupMessages.createdAt)).limit(1))[0];
    return {
      kind: "group" as const,
      id: group.id,
      title: group.name,
      subtitle: membership.role === "owner" ? "محادثة جماعية · مالك" : "محادثة جماعية",
      avatarUrl: group.avatarUrl,
      preview: latest?.content || "ابدأ محادثة جماعية",
      timestamp: latest?.createdAt ?? group.updatedAt,
      unreadCount,
      href: `/messages/groups/${group.id}`,
    };
  }));

  const followedChannels = channelsList.filter(channel => channel.subscribed || channel.ownerId === userId);
  const channelItems = await Promise.all(followedChannels.map(async channel => {
    const latest = (await db.select().from(channelPosts).where(eq(channelPosts.channelId, channel.id)).orderBy(desc(channelPosts.createdAt)).limit(1))[0];
    return {
      kind: "channel" as const,
      id: channel.id,
      title: channel.name,
      subtitle: channel.ownerId === userId ? "قناتك" : "قناة مشترَك بها",
      avatarUrl: channel.avatarUrl,
      preview: latest?.content || "لا توجد منشورات بعد",
      timestamp: latest?.createdAt ?? channel.createdAt,
      unreadCount: 0,
      href: `/channels?channel=${channel.id}`,
    };
  }));

  return [...directItems, ...groupItems, ...channelItems].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export async function createNotification(input: { userId: number; actorId?: number; type: "like" | "comment" | "follow" | "message" | "share" | "call" | "live" | "moderation"; entityId?: number; message: string }) {
  const db = await requireDb();
  if (input.actorId === input.userId) return;
  await db.insert(notifications).values(input);
  emitRealtime(input.userId, "notification:new", { ...input, createdAt: new Date() });
}

export async function sendAdminNotification(input: { userId: number; actorId: number; message: string }) {
  const db = await requireDb();
  await db.insert(notifications).values({ userId: input.userId, actorId: input.actorId, type: "moderation", message: input.message.slice(0, 255) });
  emitRealtime(input.userId, "notification:new", { ...input, type: "moderation", createdAt: new Date() });
}

export async function broadcastAdminNotification(input: { actorId: number; message: string; audience: "all" | "verified" | "active" }) {
  const db = await requireDb();
  const condition = input.audience === "verified" ? ne(users.verificationType, "none") : input.audience === "active" ? eq(users.banned, "no") : undefined;
  const recipients = condition ? await db.select({ id: users.id }).from(users).where(condition) : await db.select({ id: users.id }).from(users);
  if (!recipients.length) return { recipients: 0 };
  await db.insert(notifications).values(recipients.map(recipient => ({ userId: recipient.id, actorId: input.actorId, type: "moderation" as const, message: input.message.slice(0, 255) })));
  for (const recipient of recipients) emitRealtime(recipient.id, "notification:new", { userId: recipient.id, actorId: input.actorId, type: "moderation", message: input.message.slice(0, 255), createdAt: new Date() });
  return { recipients: recipients.length };
}

export async function listNotifications(userId: number) {
  const db = await requireDb();
  return db.select({ notification: notifications, actor: users }).from(notifications).leftJoin(users, eq(notifications.actorId, users.id)).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function markNotificationRead(userId: number, notificationId: number) {
  const db = await requireDb();
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await requireDb();
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
}

export async function listStories() {
  const db = await requireDb();
  return db.select({ story: stories, author: users }).from(stories).innerJoin(users, eq(stories.userId, users.id)).where(gt(stories.expiresAt, new Date())).orderBy(desc(stories.createdAt)).limit(50);
}

export async function createStory(input: { userId: number; mediaUrl: string; mediaKey?: string | null; mediaType: "image" | "video"; caption?: string | null }) {
  const db = await requireDb();
  await db.insert(stories).values({ ...input, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
}

export async function listReels(viewerId?: number, userId?: number) {
  const db = await requireDb();
  const rows = await db.select({ reel: reels, author: users }).from(reels).innerJoin(users, eq(reels.userId, users.id)).where(userId ? eq(reels.userId, userId) : undefined).orderBy(desc(reels.createdAt)).limit(50);
  const ids = rows.map(row => row.reel.id);
  const likedIds = viewerId && ids.length ? new Set((await db.select({ reelId: reelLikes.reelId }).from(reelLikes).where(and(eq(reelLikes.userId, viewerId), inArray(reelLikes.reelId, ids)))).map(row => row.reelId)) : new Set<number>();
  const visibleRows = (await Promise.all(rows.map(async row => {
    if (viewerId === row.author.id) return row;
    if (viewerId && await isUserBlockedBetween(viewerId, row.author.id)) return undefined;
    const privacy = await getPrivacySettings(row.author.id);
    if (!privacy.showPosts || privacy.profileVisibility === "private") return undefined;
    if (privacy.profileVisibility === "followers") {
      if (!viewerId) return undefined;
      const followsAuthor = Boolean((await db.select().from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.followingId, row.author.id))).limit(1))[0]);
      if (!followsAuthor) return undefined;
    }
    return row;
  }))).filter((row): row is typeof rows[number] => Boolean(row));
  return visibleRows.map(row => ({ ...row, liked: likedIds.has(row.reel.id) }));
}

export async function getReelById(reelId: number) {
  const db = await requireDb();
  return (await db.select().from(reels).where(eq(reels.id, reelId)).limit(1))[0];
}

export async function toggleReelLike(reelId: number, userId: number) {
  const db = await requireDb();
  const existing = await db.select().from(reelLikes).where(and(eq(reelLikes.reelId, reelId), eq(reelLikes.userId, userId))).limit(1);
  if (existing[0]) {
    await db.delete(reelLikes).where(eq(reelLikes.id, existing[0].id));
    await db.update(reels).set({ likesCount: sql`GREATEST(${reels.likesCount} - 1, 0)` }).where(eq(reels.id, reelId));
    return { liked: false };
  }
  await db.insert(reelLikes).values({ reelId, userId });
  await db.update(reels).set({ likesCount: sql`${reels.likesCount} + 1` }).where(eq(reels.id, reelId));
  return { liked: true };
}

export async function recordReelView(reelId: number, userId: number) {
  const db = await requireDb();
  const existing = await db.select().from(reelViews).where(and(eq(reelViews.reelId, reelId), eq(reelViews.userId, userId))).limit(1);
  if (existing[0]) return { counted: false };
  await db.insert(reelViews).values({ reelId, userId });
  await db.update(reels).set({ viewsCount: sql`${reels.viewsCount} + 1` }).where(eq(reels.id, reelId));
  return { counted: true };
}

export async function createReel(input: { userId: number; videoUrl: string; videoKey?: string | null; caption?: string | null }) {
  const db = await requireDb();
  await db.insert(reels).values(input);
}

export async function listProducts(category?: string, sellerId?: number, viewerId?: number) {
  const db = await requireDb();
  const rows = await db.select({ product: products, seller: users }).from(products).innerJoin(users, eq(products.sellerId, users.id)).where(and(eq(products.status, "active"), category ? eq(products.category, category) : undefined, sellerId ? eq(products.sellerId, sellerId) : undefined)).orderBy(desc(products.createdAt)).limit(50);
  const visibleRows = (await Promise.all(rows.map(async row => {
    if (viewerId === row.seller.id) return row;
    if (viewerId && await isUserBlockedBetween(viewerId, row.seller.id)) return undefined;
    const privacy = await getPrivacySettings(row.seller.id);
    if (!privacy.showPosts || privacy.profileVisibility === "private") return undefined;
    if (privacy.profileVisibility === "followers") {
      if (!viewerId) return undefined;
      const followsSeller = Boolean((await db.select().from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.followingId, row.seller.id))).limit(1))[0]);
      if (!followsSeller) return undefined;
    }
    return row;
  }))).filter((row): row is typeof rows[number] => Boolean(row));
  return Promise.all(visibleRows.map(async row => ({ ...row.product, seller: row.seller, images: await db.select().from(productImages).where(eq(productImages.productId, row.product.id)).orderBy(productImages.position) })));
}

export async function createProduct(input: { sellerId: number; title: string; description?: string | null; price: number; category: string; condition: "new" | "like_new" | "good" | "fair"; location?: string | null; images: { url: string; key?: string | null }[] }) {
  const db = await requireDb();
  const inserted = await db.insert(products).values({ sellerId: input.sellerId, title: input.title, description: input.description, price: input.price, category: input.category, condition: input.condition, location: input.location });
  const productId = Number(inserted[0].insertId);
  if (input.images.length) await db.insert(productImages).values(input.images.map((image, position) => ({ productId, imageUrl: image.url, imageKey: image.key, position })));
  return productId;
}

export async function updateProduct(productId: number, sellerId: number, input: Partial<{ title: string; description: string | null; price: number; category: string; condition: "new" | "like_new" | "good" | "fair"; location: string | null; status: "active" | "sold" | "archived" }>) {
  const db = await requireDb();
  const owned = (await db.select().from(products).where(and(eq(products.id, productId), eq(products.sellerId, sellerId))).limit(1))[0];
  if (!owned) throw new Error("لا تملك صلاحية تعديل هذا المنتج.");
  await db.update(products).set(input).where(eq(products.id, productId));
}

/** حذف إداري للمنتج (منظومة الأمان) دون تحقق من الملكية. */
export async function forceDeleteProduct(productId: number) {
  const db = await requireDb();
  await db.delete(products).where(eq(products.id, productId));
}

export async function deleteProduct(productId: number, sellerId: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const owned = (await tx.select().from(products).where(and(eq(products.id, productId), eq(products.sellerId, sellerId))).limit(1))[0];
    if (!owned) throw new Error("لا تملك صلاحية حذف هذا المنتج.");
    await tx.delete(productImages).where(eq(productImages.productId, productId));
    await tx.delete(products).where(eq(products.id, productId));
  });
}

export async function listGroups(viewerId?: number) {
  const db = await requireDb();
  const rows = await db.select({ group: groups, owner: users }).from(groups).innerJoin(users, eq(groups.ownerId, users.id)).orderBy(desc(groups.createdAt)).limit(50);
  return Promise.all(rows.map(async row => {
    const membership = viewerId ? (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, row.group.id), eq(groupMembers.userId, viewerId))).limit(1))[0] : undefined;
    if (row.group.privacy === "private" && !membership) return undefined;
    return { ...row.group, owner: toPublicUser(row.owner), membership };
  })).then(rows => rows.filter(Boolean));
}

export async function getGroupById(groupId: number, viewerId?: number) {
  const db = await requireDb();
  const row = (await db.select({ group: groups, owner: users }).from(groups).innerJoin(users, eq(groups.ownerId, users.id)).where(eq(groups.id, groupId)).limit(1))[0];
  if (!row) return undefined;
  const membership = viewerId ? (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewerId))).limit(1))[0] : undefined;
  if (row.group.privacy === "private" && !membership) return { ...row.group, owner: toPublicUser(row.owner), membership: undefined, restricted: true };
  return { ...row.group, owner: toPublicUser(row.owner), membership, restricted: false };
}

export async function createGroup(input: { ownerId: number; name: string; slug: string; description?: string | null; privacy: "public" | "private"; avatarUrl?: string | null; avatarKey?: string | null; coverUrl?: string | null; coverKey?: string | null }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const inserted = await tx.insert(groups).values(input);
    const groupId = Number(inserted[0].insertId);
    await tx.insert(groupMembers).values({ groupId, userId: input.ownerId, role: "owner", status: "active" });
    return groupId;
  });
}

export async function joinGroup(groupId: number, userId: number) {
  const db = await requireDb();
  const group = (await db.select().from(groups).where(eq(groups.id, groupId)).limit(1))[0];
  if (!group) throw new Error("المجموعة غير موجودة.");
  const status = group.privacy === "private" ? "pending" as const : "active" as const;
  const existing = (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).limit(1))[0];
  if (existing?.status === "active" || (existing?.status === "pending" && status === "pending")) return existing.status;
  if (existing) await db.update(groupMembers).set({ status }).where(eq(groupMembers.id, existing.id));
  else await db.insert(groupMembers).values({ groupId, userId, status });
  if (status === "active") await db.update(groups).set({ memberCount: sql`${groups.memberCount} + 1` }).where(eq(groups.id, groupId));
  return status;
}

export async function leaveGroup(groupId: number, userId: number) {
  const db = await requireDb(); const member = (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).limit(1))[0];
  if (!member) return; if (member.role === "owner") throw new Error("لا يمكن لمالك المجموعة مغادرتها قبل نقل الملكية.");
  await db.delete(groupMembers).where(eq(groupMembers.id, member.id)); if (member.status === "active") await db.update(groups).set({ memberCount: sql`GREATEST(${groups.memberCount} - 1, 1)` }).where(eq(groups.id, groupId));
}

export async function cancelGroupJoin(groupId: number, userId: number) {
  const db = await requireDb();
  await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId), eq(groupMembers.status, "pending")));
}

export async function updateGroup(groupId: number, ownerId: number, input: { name?: string; slug?: string; description?: string | null; privacy?: "public" | "private"; avatarUrl?: string | null; avatarKey?: string | null; coverUrl?: string | null; coverKey?: string | null }) {
  const db = await requireDb();
  const owned = (await db.select().from(groups).where(and(eq(groups.id, groupId), eq(groups.ownerId, ownerId))).limit(1))[0];
  if (!owned) throw new Error("لا تملك صلاحية تعديل المجموعة.");
  await db.update(groups).set(input).where(eq(groups.id, groupId));
  return getGroupById(groupId, ownerId);
}

export async function listGroupMembers(groupId: number) {
  const db = await requireDb();
  const rows = await db.select({ member: groupMembers, user: users }).from(groupMembers).innerJoin(users, eq(groupMembers.userId, users.id)).where(eq(groupMembers.groupId, groupId)).orderBy(groupMembers.createdAt);
  return rows.map(row => ({ member: row.member, user: toPublicUser(row.user) }));
}

export async function approveGroupMember(groupId: number, actorId: number, memberId: number) {
  const db = await requireDb(); const actor = (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, actorId), inArray(groupMembers.role, ["owner", "admin"]), eq(groupMembers.status, "active"))).limit(1))[0];
  if (!actor) throw new Error("لا تملك صلاحية إدارة الأعضاء."); const member = (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.id, memberId), eq(groupMembers.status, "pending"))).limit(1))[0]; if (!member) throw new Error("طلب الانضمام غير موجود.");
  await db.update(groupMembers).set({ status: "active" }).where(eq(groupMembers.id, memberId)); await db.update(groups).set({ memberCount: sql`${groups.memberCount} + 1` }).where(eq(groups.id, groupId));
}

export async function rejectGroupMember(groupId: number, actorId: number, memberId: number) {
  const db = await requireDb(); const actor = (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, actorId), inArray(groupMembers.role, ["owner", "admin"]), eq(groupMembers.status, "active"))).limit(1))[0]; if (!actor) throw new Error("لا تملك صلاحية إدارة الأعضاء.");
  await db.delete(groupMembers).where(and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId), eq(groupMembers.status, "pending")));
}

export async function removeGroupMember(groupId: number, actorId: number, memberId: number) {
  const db = await requireDb(); const actor = (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, actorId), inArray(groupMembers.role, ["owner", "admin"]), eq(groupMembers.status, "active"))).limit(1))[0]; const target = (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.id, memberId))).limit(1))[0]; if (!actor || !target || target.role === "owner" || (actor.role === "admin" && target.role === "admin")) throw new Error("لا تملك صلاحية إزالة هذا العضو.");
  await db.delete(groupMembers).where(eq(groupMembers.id, memberId)); if (target.status === "active") await db.update(groups).set({ memberCount: sql`GREATEST(${groups.memberCount} - 1, 1)` }).where(eq(groups.id, groupId));
}

export async function setGroupMemberRole(groupId: number, actorId: number, memberId: number, role: "admin" | "member") {
  const db = await requireDb(); const actor = (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, actorId), eq(groupMembers.role, "owner"), eq(groupMembers.status, "active"))).limit(1))[0]; if (!actor) throw new Error("فقط مالك المجموعة يمكنه تغيير الأدوار.");
  await db.update(groupMembers).set({ role }).where(and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active"), sql`${groupMembers.role} <> 'owner'`));
}

export async function transferGroupOwnership(groupId: number, ownerId: number, newOwnerId: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const owner = (await tx.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, ownerId), eq(groupMembers.role, "owner"), eq(groupMembers.status, "active"))).limit(1))[0];
    const target = (await tx.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, newOwnerId), eq(groupMembers.status, "active"))).limit(1))[0];
    if (!owner || !target) throw new Error("يجب أن يكون المالك الجديد عضوًا نشطًا في المجموعة.");
    await tx.update(groupMembers).set({ role: "member" }).where(eq(groupMembers.id, owner.id));
    await tx.update(groupMembers).set({ role: "owner" }).where(eq(groupMembers.id, target.id));
    await tx.update(groups).set({ ownerId: newOwnerId }).where(eq(groups.id, groupId));
  });
}

export async function deleteGroup(groupId: number, ownerId: number) {
  const db = await requireDb(); await db.transaction(async tx => { const group = (await tx.select().from(groups).where(and(eq(groups.id, groupId), eq(groups.ownerId, ownerId))).limit(1))[0]; if (!group) throw new Error("لا تملك صلاحية حذف المجموعة."); await tx.delete(groupPosts).where(eq(groupPosts.groupId, groupId)); await tx.delete(groupMembers).where(eq(groupMembers.groupId, groupId)); await tx.delete(groups).where(eq(groups.id, groupId)); });
}

export async function listGroupPosts(groupId: number, viewerId?: number) {
  const group = await getGroupById(groupId, viewerId); if (!group || group.restricted) return [];
  const db = await requireDb(); return db.select({ post: groupPosts, author: users }).from(groupPosts).innerJoin(users, eq(groupPosts.userId, users.id)).where(eq(groupPosts.groupId, groupId)).orderBy(desc(groupPosts.createdAt)).limit(50);
}

export async function createGroupPost(input: { groupId: number; userId: number; content: string; mediaUrl?: string | null; mediaKey?: string | null; mediaType?: "image" | "video" | null }) {
  const db = await requireDb(); const member = (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, input.userId), eq(groupMembers.status, "active"))).limit(1))[0]; if (!member) throw new Error("يجب أن تكون عضوًا نشطًا للنشر في المجموعة.");
  const inserted = await db.insert(groupPosts).values(input); return Number(inserted[0].insertId);
}

export async function createChatGroup(ownerId: number, name: string, memberIds: number[]) {
  const db = await requireDb(); return db.transaction(async tx => { const inserted = await tx.insert(chatGroups).values({ ownerId, name }); const chatGroupId = Number(inserted[0].insertId); const ids = Array.from(new Set([ownerId, ...memberIds])); await tx.insert(chatGroupMembers).values(ids.map(userId => ({ chatGroupId, userId, role: userId === ownerId ? "owner" as const : "member" as const }))); return chatGroupId; });
}

export async function listChatGroups(userId: number) {
  const db = await requireDb();
  const rows = await db.select({ group: chatGroups, membership: chatGroupMembers }).from(chatGroupMembers).innerJoin(chatGroups, eq(chatGroupMembers.chatGroupId, chatGroups.id)).where(eq(chatGroupMembers.userId, userId)).orderBy(desc(chatGroups.updatedAt));
  return Promise.all(rows.map(async row => {
    const unreadRows = await db.select({ count: sql<number>`count(*)` }).from(chatGroupMessages).where(and(eq(chatGroupMessages.chatGroupId, row.group.id), ne(chatGroupMessages.senderId, userId), gt(chatGroupMessages.createdAt, row.membership.lastReadAt ?? new Date(0)), isNull(chatGroupMessages.deletedAt)));
    return { ...row, unreadCount: Number(unreadRows[0]?.count ?? 0) };
  }));
}

export async function listChatGroupMessages(chatGroupId: number, userId: number) {
  const db = await requireDb();
  const member = (await db.select().from(chatGroupMembers).where(and(eq(chatGroupMembers.chatGroupId, chatGroupId), eq(chatGroupMembers.userId, userId))).limit(1))[0];
  if (!member) throw new Error("لا تملك صلاحية عرض هذه المحادثة.");
  await db.update(chatGroupMembers).set({ lastReadAt: new Date() }).where(eq(chatGroupMembers.id, member.id));
  return db.select({ message: chatGroupMessages, sender: users }).from(chatGroupMessages).innerJoin(users, eq(chatGroupMessages.senderId, users.id)).where(eq(chatGroupMessages.chatGroupId, chatGroupId)).orderBy(chatGroupMessages.createdAt).limit(100);
}

export async function sendChatGroupMessage(input: { chatGroupId: number; senderId: number; content: string; kind?: "text" | "gif" | "sticker" | "audio"; mediaUrl?: string | null; mediaKey?: string | null; replyToId?: number | null }) {
  const db = await requireDb();
  const member = (await db.select().from(chatGroupMembers).where(and(eq(chatGroupMembers.chatGroupId, input.chatGroupId), eq(chatGroupMembers.userId, input.senderId))).limit(1))[0];
  if (!member) throw new Error("يجب أن تكون عضوًا في المحادثة للإرسال.");
  if (input.replyToId) {
    const parent = (await db.select().from(chatGroupMessages).where(and(eq(chatGroupMessages.id, input.replyToId), eq(chatGroupMessages.chatGroupId, input.chatGroupId))).limit(1))[0];
    if (!parent) throw new Error("لا يمكن الرد على رسالة خارج هذه المحادثة.");
  }
  const inserted = await db.insert(chatGroupMessages).values(input);
  await db.update(chatGroups).set({ updatedAt: new Date() }).where(eq(chatGroups.id, input.chatGroupId));
  return Number(inserted[0].insertId);
}

async function emitChatGroupEvent(chatGroupId: number, event: string, payload: unknown) {
  const db = await requireDb();
  const members = await db.select({ userId: chatGroupMembers.userId }).from(chatGroupMembers).where(eq(chatGroupMembers.chatGroupId, chatGroupId));
  for (const member of members) emitRealtime(member.userId, event, payload);
}

export async function updateChatGroupMessage(messageId: number, userId: number, content: string) {
  const db = await requireDb();
  const row = (await db.select({ message: chatGroupMessages, membership: chatGroupMembers }).from(chatGroupMessages).innerJoin(chatGroupMembers, and(eq(chatGroupMembers.chatGroupId, chatGroupMessages.chatGroupId), eq(chatGroupMembers.userId, userId))).where(and(eq(chatGroupMessages.id, messageId), eq(chatGroupMessages.senderId, userId), isNull(chatGroupMessages.deletedAt))).limit(1))[0];
  if (!row) throw new Error("لا يمكنك تعديل هذه الرسالة.");
  await db.update(chatGroupMessages).set({ content, editedAt: new Date() }).where(eq(chatGroupMessages.id, messageId));
  const updated = (await db.select().from(chatGroupMessages).where(eq(chatGroupMessages.id, messageId)).limit(1))[0];
  if (updated) await emitChatGroupEvent(updated.chatGroupId, "chatGroup:messageUpdated", updated);
  return updated;
}

export async function deleteChatGroupMessage(messageId: number, userId: number) {
  const db = await requireDb();
  const row = (await db.select({ message: chatGroupMessages, membership: chatGroupMembers }).from(chatGroupMessages).innerJoin(chatGroupMembers, and(eq(chatGroupMembers.chatGroupId, chatGroupMessages.chatGroupId), eq(chatGroupMembers.userId, userId))).where(and(eq(chatGroupMessages.id, messageId), eq(chatGroupMessages.senderId, userId), isNull(chatGroupMessages.deletedAt))).limit(1))[0];
  if (!row) throw new Error("لا يمكنك حذف هذه الرسالة.");
  const deletedAt = new Date();
  await db.update(chatGroupMessages).set({ content: "", mediaUrl: null, mediaKey: null, kind: "text", deletedAt, editedAt: null }).where(eq(chatGroupMessages.id, messageId));
  await emitChatGroupEvent(row.message.chatGroupId, "chatGroup:messageDeleted", { ...row.message, content: "", mediaUrl: null, mediaKey: null, kind: "text" as const, deletedAt, editedAt: null });
  return { success: true };
}

export async function listInterests() {
  const db = await requireDb();
  return db.select().from(interests).orderBy(interests.name);
}

export async function setUserInterests(userId: number, interestIds: number[]) {
  const db = await requireDb();
  await db.delete(userInterests).where(eq(userInterests.userId, userId));
  if (interestIds.length) await db.insert(userInterests).values(interestIds.map(interestId => ({ userId, interestId })));
}


export async function getChatGroupById(chatGroupId: number, userId: number) {
  const db = await requireDb();
  const row = (await db.select({ group: chatGroups, membership: chatGroupMembers }).from(chatGroupMembers).innerJoin(chatGroups, eq(chatGroupMembers.chatGroupId, chatGroups.id)).where(and(eq(chatGroupMembers.chatGroupId, chatGroupId), eq(chatGroupMembers.userId, userId))).limit(1))[0];
  if (!row) throw new Error("لا تملك صلاحية عرض هذه المحادثة.");
  return { ...row.group, membership: row.membership, members: await listChatGroupMembers(chatGroupId) };
}

export async function listChatGroupMembers(chatGroupId: number) {
  const db = await requireDb();
  const rows = await db.select({ member: chatGroupMembers, user: users }).from(chatGroupMembers).innerJoin(users, eq(chatGroupMembers.userId, users.id)).where(eq(chatGroupMembers.chatGroupId, chatGroupId)).orderBy(chatGroupMembers.createdAt);
  return rows.map(row => ({ member: row.member, user: toPublicUser(row.user) }));
}

async function getChatGroupModerator(chatGroupId: number, actorId: number) {
  const db = await requireDb();
  return (await db.select().from(chatGroupMembers).where(and(eq(chatGroupMembers.chatGroupId, chatGroupId), eq(chatGroupMembers.userId, actorId), inArray(chatGroupMembers.role, ["owner", "admin"]))).limit(1))[0];
}

export async function updateChatGroup(chatGroupId: number, ownerId: number, input: { name?: string; avatarUrl?: string | null; avatarKey?: string | null }) {
  const db = await requireDb();
  const owner = (await db.select().from(chatGroups).where(and(eq(chatGroups.id, chatGroupId), eq(chatGroups.ownerId, ownerId))).limit(1))[0];
  if (!owner) throw new Error("فقط مالك المحادثة يمكنه تعديلها.");
  await db.update(chatGroups).set(input).where(eq(chatGroups.id, chatGroupId));
}

export async function addChatGroupMember(chatGroupId: number, actorId: number, userId: number) {
  const db = await requireDb();
  if (!(await getChatGroupModerator(chatGroupId, actorId))) throw new Error("لا تملك صلاحية إضافة أعضاء.");
  if (!(await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1))[0]) throw new Error("المستخدم غير موجود.");
  const existing = (await db.select().from(chatGroupMembers).where(and(eq(chatGroupMembers.chatGroupId, chatGroupId), eq(chatGroupMembers.userId, userId))).limit(1))[0];
  if (!existing) await db.insert(chatGroupMembers).values({ chatGroupId, userId, role: "member" });
}

export async function removeChatGroupMember(chatGroupId: number, actorId: number, memberId: number) {
  const db = await requireDb();
  const actor = await getChatGroupModerator(chatGroupId, actorId);
  const target = (await db.select().from(chatGroupMembers).where(and(eq(chatGroupMembers.chatGroupId, chatGroupId), eq(chatGroupMembers.id, memberId))).limit(1))[0];
  if (!actor || !target || target.role === "owner" || (actor.role === "admin" && target.role === "admin")) throw new Error("لا تملك صلاحية إزالة هذا العضو.");
  await db.delete(chatGroupMembers).where(eq(chatGroupMembers.id, memberId));
}

export async function setChatGroupMemberRole(chatGroupId: number, ownerId: number, memberId: number, role: "admin" | "member") {
  const db = await requireDb();
  const owner = (await db.select().from(chatGroupMembers).where(and(eq(chatGroupMembers.chatGroupId, chatGroupId), eq(chatGroupMembers.userId, ownerId), eq(chatGroupMembers.role, "owner"))).limit(1))[0];
  if (!owner) throw new Error("فقط مالك المحادثة يمكنه تغيير الأدوار.");
  await db.update(chatGroupMembers).set({ role }).where(and(eq(chatGroupMembers.id, memberId), eq(chatGroupMembers.chatGroupId, chatGroupId), sql`${chatGroupMembers.role} <> 'owner'`));
}

export async function leaveChatGroup(chatGroupId: number, userId: number) {
  const db = await requireDb();
  const member = (await db.select().from(chatGroupMembers).where(and(eq(chatGroupMembers.chatGroupId, chatGroupId), eq(chatGroupMembers.userId, userId))).limit(1))[0];
  if (!member) return;
  if (member.role === "owner") throw new Error("انقل الملكية قبل مغادرة المحادثة.");
  await db.delete(chatGroupMembers).where(eq(chatGroupMembers.id, member.id));
}

export async function deleteChatGroup(chatGroupId: number, ownerId: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const group = (await tx.select().from(chatGroups).where(and(eq(chatGroups.id, chatGroupId), eq(chatGroups.ownerId, ownerId))).limit(1))[0];
    if (!group) throw new Error("فقط مالك المحادثة يمكنه حذفها.");
    await tx.delete(chatGroupMessages).where(eq(chatGroupMessages.chatGroupId, chatGroupId));
    await tx.delete(chatGroupMembers).where(eq(chatGroupMembers.chatGroupId, chatGroupId));
    await tx.delete(chatGroups).where(eq(chatGroups.id, chatGroupId));
  });
}


export async function transferChatGroupOwnership(chatGroupId: number, ownerId: number, newOwnerId: number) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const owner = (await tx.select().from(chatGroupMembers).where(and(eq(chatGroupMembers.chatGroupId, chatGroupId), eq(chatGroupMembers.userId, ownerId), eq(chatGroupMembers.role, "owner"))).limit(1))[0];
    const target = (await tx.select().from(chatGroupMembers).where(and(eq(chatGroupMembers.chatGroupId, chatGroupId), eq(chatGroupMembers.userId, newOwnerId))).limit(1))[0];
    if (!owner || !target) throw new Error("يجب أن يكون المالك الجديد عضوًا في المحادثة.");
    await tx.update(chatGroupMembers).set({ role: "member" }).where(eq(chatGroupMembers.id, owner.id));
    await tx.update(chatGroupMembers).set({ role: "owner" }).where(eq(chatGroupMembers.id, target.id));
    await tx.update(chatGroups).set({ ownerId: newOwnerId }).where(eq(chatGroups.id, chatGroupId));
  });
}


// ============================================================
// المكالمات المباشرة (فردية وعشوائية)
// ============================================================

export async function createCallRecord(initiatorId: number, receiverId: number | null, kind: "video" | "audio", isRandom: boolean) {
  const db = await requireDb();
  const inserted = await db.insert(calls).values({ initiatorId, receiverId, kind, isRandom, status: "incoming", startedAt: new Date() });
  return Number(inserted[0].insertId);
}

export async function updateCallStatus(callId: number, status: "ongoing" | "ended" | "missed" | "rejected", durationSeconds?: number) {
  const db = await requireDb();
  const updates: Record<string, unknown> = { status };
  if (durationSeconds !== undefined) updates.durationSeconds = durationSeconds;
  if (status === "ended" || status === "missed" || status === "rejected") updates.endedAt = new Date();
  if (status === "missed" || status === "rejected") updates.startedAt = null;
  await db.update(calls).set(updates).where(eq(calls.id, callId));
}

export async function listUserCalls(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(calls).where(or(eq(calls.initiatorId, userId), eq(calls.receiverId, userId))).orderBy(desc(calls.createdAt)).limit(50);
  const peerIds = Array.from(new Set(rows.map(row => (row.initiatorId === userId ? row.receiverId : row.initiatorId)).filter((id): id is number => typeof id === "number")));
  if (!peerIds.length) return [];
  const peers = await db.select().from(users).where(inArray(users.id, peerIds));
  const peerById = new Map(peers.map(user => [user.id, user]));
  return rows.map(row => ({ call: row, peer: peerById.get(row.initiatorId === userId ? row.receiverId! : row.initiatorId) }));
}

// قائمة انتظار المكالمات العشوائية

const RANDOM_CALL_WAIT_MS = 1000 * 60 * 5; // تنتهي قائمة الانتظار بعد خمس دقائق

export async function joinRandomCallQueue(userId: number, kind: "video" | "audio", preferredGender: "any" | "male" | "female" = "any") {
  const db = await requireDb();
  await db.insert(randomCallQueue).values({ userId, kind, preferredGender, expiresAt: new Date(Date.now() + RANDOM_CALL_WAIT_MS) }).onDuplicateKeyUpdate({ set: { status: "waiting", expiresAt: new Date(Date.now() + RANDOM_CALL_WAIT_MS), kind, preferredGender } });
}

export async function leaveRandomCallQueue(userId: number) {
  const db = await requireDb();
  await db.delete(randomCallQueue).where(eq(randomCallQueue.userId, userId));
}

export async function markQueueMatched(userId: number) {
  const db = await requireDb();
  await db.update(randomCallQueue).set({ status: "matched" }).where(eq(randomCallQueue.userId, userId));
}

/** إيجاد أول طالب انتظار آخر نشط وصالحة صلاحيته، ثم تعليم كليهما بمطابقة. */
export async function findRandomCallPartner(requesterId: number, requesterGender: "any" | "male" | "female" = "any") {
  const db = await requireDb();
  // عند طلب جنس محدد: نحاول أولًا إيجاد منتظر يطابق الجنس المفضل
  const partner = requesterGender !== "any"
    ? (await db.select({ entry: randomCallQueue, user: users }).from(randomCallQueue).innerJoin(users, eq(randomCallQueue.userId, users.id)).where(and(eq(randomCallQueue.status, "waiting"), eq(users.gender, requesterGender), ne(randomCallQueue.userId, requesterId), gt(randomCallQueue.expiresAt, new Date()))).limit(1))[0]
    : null;
  const finalEntry = partner?.entry ?? (await db.select().from(randomCallQueue).where(and(eq(randomCallQueue.status, "waiting"), eq(randomCallQueue.kind, "video"), ne(randomCallQueue.userId, requesterId), gt(randomCallQueue.expiresAt, new Date()))).limit(1))[0]
    ?? (await db.select().from(randomCallQueue).where(and(eq(randomCallQueue.status, "waiting"), ne(randomCallQueue.userId, requesterId), gt(randomCallQueue.expiresAt, new Date()))).limit(1))[0];
  if (!finalEntry) return null;
  await markQueueMatched(finalEntry.userId);
  await markQueueMatched(requesterId);
  return finalEntry;
}

export async function cleanupExpiredQueueEntries() {
  const db = await requireDb();
  await db.delete(randomCallQueue).where(or(eq(randomCallQueue.status, "matched"), lt(randomCallQueue.expiresAt, new Date())));
}

export async function getQueueEntry(userId: number) {
  const db = await requireDb();
  return (await db.select().from(randomCallQueue).where(eq(randomCallQueue.userId, userId)).limit(1))[0];
}

// ============================================================
// البث المباشر
// ============================================================

export async function createLiveStream(broadcasterId: number, title: string) {
  const db = await requireDb();
  const inserted = await db.insert(liveStreams).values({ broadcasterId, title, startedAt: new Date() });
  return Number(inserted[0].insertId);
}

export async function getLiveStreamById(streamId: number, viewerId?: number) {
  const db = await requireDb();
  const row = (await db
    .select({ stream: liveStreams, broadcaster: users })
    .from(liveStreams)
    .innerJoin(users, eq(liveStreams.broadcasterId, users.id))
    .where(eq(liveStreams.id, streamId))
    .limit(1))[0];
  if (!row) return undefined;
  if (viewerId && viewerId !== row.stream.broadcasterId && await isUserBlockedBetween(viewerId, row.stream.broadcasterId)) return undefined;
  return row;
}

export async function listLiveStreams(viewerId?: number) {
  const db = await requireDb();
  const rows = await db.select({ stream: liveStreams, broadcaster: users }).from(liveStreams).innerJoin(users, eq(liveStreams.broadcasterId, users.id)).where(eq(liveStreams.status, "live")).orderBy(desc(liveStreams.startedAt)).limit(30);
  const result: { stream: typeof liveStreams.$inferSelect; broadcaster: typeof users.$inferSelect }[] = [];
  for (const row of rows) {
    if (viewerId && viewerId !== row.stream.broadcasterId && await isUserBlockedBetween(viewerId, row.stream.broadcasterId)) continue;
    result.push(row);
  }
  return result;
}

export async function endLiveStream(streamId: number, broadcasterId: number) {
  const db = await requireDb();
  await db.update(liveStreams).set({ status: "ended", endedAt: new Date() }).where(and(eq(liveStreams.id, streamId), eq(liveStreams.broadcasterId, broadcasterId), eq(liveStreams.status, "live")));
  await db.delete(liveStreamViewers).where(eq(liveStreamViewers.streamId, streamId));
}

export async function cancelLiveStream(streamId: number, broadcasterId: number) {
  const db = await requireDb();
  const stream = (await db.select().from(liveStreams).where(and(eq(liveStreams.id, streamId), eq(liveStreams.broadcasterId, broadcasterId), eq(liveStreams.status, "live"))).limit(1))[0];
  if (!stream) throw new Error("البث غير موجود أو انتهى بالفعل.");
  await db.update(liveStreams).set({ status: "cancelled", endedAt: new Date(), viewerCount: 0 }).where(eq(liveStreams.id, streamId));
  await db.delete(liveStreamViewers).where(eq(liveStreamViewers.streamId, streamId));
  return { cancelled: true };
}

export async function listLiveStreamHistory(broadcasterId: number) {
  const db = await requireDb();
  return db.select().from(liveStreams).where(and(eq(liveStreams.broadcasterId, broadcasterId), or(eq(liveStreams.status, "ended"), eq(liveStreams.status, "cancelled")))).orderBy(desc(liveStreams.createdAt)).limit(50);
}

export async function saveLiveRecording(streamId: number, broadcasterId: number, recordingUrl: string, recordingKey: string | null) {
  const db = await requireDb();
  const result = await db.update(liveStreams).set({ recordingUrl, recordingKey, recordingSavedAt: new Date() }).where(and(eq(liveStreams.id, streamId), eq(liveStreams.broadcasterId, broadcasterId), eq(liveStreams.status, "ended")));
  if (!Number(result[0]?.affectedRows ?? 0)) throw new Error("لا يمكن حفظ تسجيل بث غير منتهٍ.");
  return (await db.select().from(liveStreams).where(eq(liveStreams.id, streamId)).limit(1))[0];
}

export async function getOwnedLiveStream(streamId: number, broadcasterId: number) {
  const db = await requireDb();
  return (await db.select().from(liveStreams).where(and(eq(liveStreams.id, streamId), eq(liveStreams.broadcasterId, broadcasterId))).limit(1))[0];
}

export async function deleteLiveStream(streamId: number, broadcasterId: number) {
  const db = await requireDb();
  const stream = await getOwnedLiveStream(streamId, broadcasterId);
  if (!stream) throw new Error("البث غير موجود.");
  if (stream.status === "live") throw new Error("أنه البث أولًا قبل حذفه.");
  await db.delete(liveStreamViewers).where(eq(liveStreamViewers.streamId, streamId));
  await db.delete(liveStreamChatMessages).where(eq(liveStreamChatMessages.streamId, streamId));
  await db.delete(liveStreamReactions).where(eq(liveStreamReactions.streamId, streamId));
  await db.delete(liveStreams).where(eq(liveStreams.id, streamId));
  return { deleted: true, recordingKey: stream.recordingKey };
}

export async function joinStreamRoom(streamId: number, userId: number, socketId: string) {
  const db = await requireDb();
  await db.delete(liveStreamViewers).where(and(eq(liveStreamViewers.streamId, streamId), eq(liveStreamViewers.userId, userId)));
  await db.insert(liveStreamViewers).values({ streamId, userId, socketId });
  const viewerCount = await db.select({ count: sql<number>`count(*)` }).from(liveStreamViewers).where(eq(liveStreamViewers.streamId, streamId));
  const count = Number(viewerCount[0]?.count ?? 0);
  await db.update(liveStreams).set({ viewerCount: count, totalViews: sql`${liveStreams.totalViews} + 1` }).where(eq(liveStreams.id, streamId));
  return count;
}

export async function leaveStreamRoom(streamId: number, socketId: string) {
  const db = await requireDb();
  await db.delete(liveStreamViewers).where(and(eq(liveStreamViewers.streamId, streamId), eq(liveStreamViewers.socketId, socketId)));
  const viewerCount = await db.select({ count: sql<number>`count(*)` }).from(liveStreamViewers).where(eq(liveStreamViewers.streamId, streamId));
  const count = Number(viewerCount[0]?.count ?? 0);
  await db.update(liveStreams).set({ viewerCount: count }).where(eq(liveStreams.id, streamId));
  return count;
}

export async function listStreamViewers(streamId: number) {
  const db = await requireDb();
  const rows = await db.select({ viewer: users }).from(liveStreamViewers).innerJoin(users, eq(liveStreamViewers.userId, users.id)).where(eq(liveStreamViewers.streamId, streamId)).limit(200);
  return rows.map(row => toPublicUser(row.viewer));
}

export async function sendStreamChatMessage(streamId: number, userId: number, content: string, kind: "text" | "gif" | "sticker" = "text") {
  const db = await requireDb();
  const inserted = await db.insert(liveStreamChatMessages).values({ streamId, userId, content, kind });
  const message = (await db.select({ message: liveStreamChatMessages, user: users }).from(liveStreamChatMessages).innerJoin(users, eq(liveStreamChatMessages.userId, users.id)).where(eq(liveStreamChatMessages.id, Number(inserted[0].insertId))).limit(1))[0];
  if (!message) return undefined;
  return { ...message.message, user: toPublicUser(message.user) };
}

export async function listStreamChatMessages(streamId: number) {
  const db = await requireDb();
  const rows = await db.select({ message: liveStreamChatMessages, user: users }).from(liveStreamChatMessages).innerJoin(users, eq(liveStreamChatMessages.userId, users.id)).where(eq(liveStreamChatMessages.streamId, streamId)).orderBy(desc(liveStreamChatMessages.createdAt)).limit(80);
  return rows.map(row => ({ ...row.message, user: toPublicUser(row.user) })).reverse();
}

export async function pruneOldStreamChat(streamId: number) {
  const db = await requireDb();
  await db.delete(liveStreamChatMessages).where(and(eq(liveStreamChatMessages.streamId, streamId), lt(liveStreamChatMessages.createdAt, new Date(Date.now() - 1000 * 60 * 60 * 6))));
}

export async function addStreamReaction(streamId: number, userId: number, emoji: string) {
  const db = await requireDb();
  await db.insert(liveStreamReactions).values({ streamId, userId, emoji });
  await db.delete(liveStreamReactions).where(lt(liveStreamReactions.createdAt, new Date(Date.now() - 1000 * 30)));
}

export async function getUserLiveStream(broadcasterId: number) {
  const db = await requireDb();
  return (await db.select().from(liveStreams).where(and(eq(liveStreams.broadcasterId, broadcasterId), eq(liveStreams.status, "live"))).limit(1))[0];
}

// ============================================================
// منظومة الأمان بالذكاء الاصطناعي (بلاغات + فحوصات محتوى + تحقق عمري)
// ============================================================

export async function listOpenReports() {
  const db = await requireDb();
  return db.select().from(reports).where(eq(reports.status, "open")).orderBy(desc(reports.createdAt)).limit(100);
}

export async function listAdminUsers(query = "", limit = 50) {
  const db = await requireDb();
  const normalized = query.trim();
  const columns = {
    id: users.id,
    name: users.name,
    username: users.username,
    email: users.email,
    role: users.role,
    banned: users.banned,
    punishmentLevel: users.punishmentLevel,
    punishmentUntil: users.punishmentUntil,
    emailVerifiedAt: users.emailVerifiedAt,
    isCreator: users.isCreator,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  };
  if (!normalized) return db.select(columns).from(users).orderBy(desc(users.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
  const pattern = `%${normalized}%`;
  return db.select(columns).from(users).where(or(like(users.name, pattern), like(users.username, pattern), like(users.email, pattern))).orderBy(desc(users.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
}

export async function updateAdminUserRole(userId: number, role: "user" | "moderator" | "admin") {
  const db = await requireDb();
  await db.update(users).set({ role }).where(eq(users.id, userId));
  return getUserById(userId);
}

export async function setAdminUserBan(userId: number, banned: boolean) {
  const db = await requireDb();
  await db.update(users).set({ banned: banned ? "yes" : "no", punishmentLevel: banned ? 4 : 0, punishmentUntil: null }).where(eq(users.id, userId));
  return getUserById(userId);
}

export async function getAdminAnalytics(days = 30) {
  const db = await requireDb();
  const safeDays = Math.min(Math.max(Math.floor(days), 7), 90);
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const [newUsers, newPosts, newComments, newMessages, newLikes, newReports, newProducts, newGroups, newNotifications, activeToday, blockedContent, openReports, topPosts] = await Promise.all([
    db.select({ id: users.id }).from(users).where(gt(users.createdAt, since)),
    db.select({ id: posts.id }).from(posts).where(gt(posts.createdAt, since)),
    db.select({ id: comments.id }).from(comments).where(gt(comments.createdAt, since)),
    db.select({ id: messages.id }).from(messages).where(gt(messages.createdAt, since)),
    db.select({ id: postLikes.id }).from(postLikes).where(gt(postLikes.createdAt, since)),
    db.select({ id: reports.id }).from(reports).where(gt(reports.createdAt, since)),
    db.select({ id: products.id }).from(products).where(gt(products.createdAt, since)),
    db.select({ id: groups.id }).from(groups).where(gt(groups.createdAt, since)),
    db.select({ id: notifications.id }).from(notifications).where(gt(notifications.createdAt, since)),
    db.select({ id: users.id }).from(users).where(gt(users.lastSignedIn, dayStart)),
    db.select({ id: contentModerationChecks.id }).from(contentModerationChecks).where(and(gt(contentModerationChecks.createdAt, since), eq(contentModerationChecks.actionTaken, "blocked"))),
    db.select({ id: reports.id }).from(reports).where(eq(reports.status, "open")),
    db.select({ id: posts.id, content: posts.content, likesCount: posts.likesCount, commentsCount: posts.commentsCount, createdAt: posts.createdAt }).from(posts).orderBy(desc(posts.likesCount), desc(posts.createdAt)).limit(5),
  ]);
  return { rangeDays: safeDays, since, newUsers: newUsers.length, newPosts: newPosts.length, newComments: newComments.length, newMessages: newMessages.length, newLikes: newLikes.length, newReports: newReports.length, newProducts: newProducts.length, newGroups: newGroups.length, newNotifications: newNotifications.length, activeToday: activeToday.length, blockedContent: blockedContent.length, openReports: openReports.length, topPosts };
}

export async function getAdminStats() {
  const db = await requireDb();
  const [usersRows, reportsRows, moderationRows, verificationRows, bannedRows, verifiedRows] = await Promise.all([
    db.select({ id: users.id }).from(users),
    db.select({ id: reports.id }).from(reports).where(eq(reports.status, "open")),
    db.select({ id: contentModerationChecks.id }).from(contentModerationChecks).where(eq(contentModerationChecks.actionTaken, "blocked")),
    db.select({ id: verificationRequests.id }).from(verificationRequests).where(or(eq(verificationRequests.status, "pending"), eq(verificationRequests.status, "appealed"))),
    db.select({ id: users.id }).from(users).where(eq(users.banned, "yes")),
    db.select({ id: users.id }).from(users).where(ne(users.verificationType, "none")),
  ]);
  return { users: usersRows.length, openReports: reportsRows.length, blockedContent: moderationRows.length, pendingVerification: verificationRows.length, bannedUsers: bannedRows.length, verifiedUsers: verifiedRows.length };
}

export async function listAdminVerificationRequests(status: "all" | "pending" | "needs_more_info" | "approved" | "rejected" | "revoked" | "appealed" = "pending", limit = 100) {
  const db = await requireDb();
  const columns = { id: verificationRequests.id, userId: verificationRequests.userId, name: users.name, username: users.username, email: users.email, avatarUrl: users.avatarUrl, requestType: verificationRequests.requestType, status: verificationRequests.status, legalName: verificationRequests.legalName, country: verificationRequests.country, note: verificationRequests.note, documentUrl: verificationRequests.documentUrl, selfieUrl: verificationRequests.selfieUrl, businessUrl: verificationRequests.businessUrl, badgeLabel: verificationRequests.badgeLabel, reviewerId: verificationRequests.reviewerId, decisionNote: verificationRequests.decisionNote, appealNote: verificationRequests.appealNote, requestedAt: verificationRequests.requestedAt, reviewedAt: verificationRequests.reviewedAt, expiresAt: verificationRequests.expiresAt };
  const query = db.select(columns).from(verificationRequests).leftJoin(users, eq(users.id, verificationRequests.userId)).orderBy(desc(verificationRequests.requestedAt)).limit(Math.min(Math.max(limit, 1), 200));
  return status === "all" ? query : query.where(eq(verificationRequests.status, status));
}

export async function reviewVerificationRequest(input: { requestId: number; reviewerId: number; status: "needs_more_info" | "approved" | "rejected" | "revoked"; verificationType?: "none" | "identity" | "creator" | "business" | "seller" | "official"; badgeLabel?: string | null; decisionNote?: string | null; expiresAt?: Date | null }) {
  const db = await requireDb();
  const request = (await db.select().from(verificationRequests).where(eq(verificationRequests.id, input.requestId)).limit(1))[0];
  if (!request) return null;
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(verificationRequests).set({ status: input.status, reviewerId: input.reviewerId, decisionNote: input.decisionNote ?? null, badgeLabel: input.badgeLabel ?? request.badgeLabel ?? null, reviewedAt: now, expiresAt: input.expiresAt ?? request.expiresAt ?? null }).where(eq(verificationRequests.id, input.requestId));
    if (input.status === "approved") await tx.update(users).set({ verificationType: input.verificationType ?? request.requestType, verificationBadge: input.badgeLabel ?? request.badgeLabel ?? "موثّق", verifiedAt: now, verificationExpiresAt: input.expiresAt ?? null }).where(eq(users.id, request.userId));
    if (input.status === "rejected" || input.status === "revoked") await tx.update(users).set({ verificationType: "none", verificationBadge: null, verifiedAt: null, verificationExpiresAt: null }).where(eq(users.id, request.userId));
  });
  return (await db.select().from(verificationRequests).where(eq(verificationRequests.id, input.requestId)).limit(1))[0] ?? null;
}

export async function writeAdminAuditLog(input: { adminId: number; action: string; targetType?: string | null; targetId?: number | null; reason?: string | null; metadata?: unknown; ipAddress?: string | null; userAgent?: string | null }) {
  const db = await requireDb();
  await db.insert(adminAuditLogs).values({ adminId: input.adminId, action: input.action, targetType: input.targetType ?? null, targetId: input.targetId ?? null, reason: input.reason ?? null, metadata: input.metadata ? JSON.stringify(input.metadata) : null, ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null });
}

export async function listAdminAuditLogs(limit = 100) {
  const db = await requireDb();
  return db.select({ id: adminAuditLogs.id, adminId: adminAuditLogs.adminId, adminName: users.name, adminUsername: users.username, action: adminAuditLogs.action, targetType: adminAuditLogs.targetType, targetId: adminAuditLogs.targetId, reason: adminAuditLogs.reason, metadata: adminAuditLogs.metadata, ipAddress: adminAuditLogs.ipAddress, createdAt: adminAuditLogs.createdAt }).from(adminAuditLogs).leftJoin(users, eq(users.id, adminAuditLogs.adminId)).orderBy(desc(adminAuditLogs.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
}

export async function resolveReport(reportId: number, input: { status: "reviewed" | "closed"; moderatedBy: "ai" | "manual"; aiVerdict?: "substantiated" | "partially_substantiated" | "unsubstantiated" | null; aiConfidence?: number | null; actionTaken: "no_action" | "warn" | "hide" | "delete" | "suspend"; resolutionDetails?: string | null }) {
  const db = await requireDb();
  await db.update(reports).set({ ...input, resolvedAt: new Date() }).where(eq(reports.id, reportId));
}

export async function createModerationCheck(input: { userId: number; contentType: "message" | "chatGroupMessage" | "liveChat" | "post" | "comment" | "story" | "reel" | "product" | "groupPost" | "liveTitle" | "username"; contentId: number; contentPreview?: string | null; verdict: "safe" | "sexual" | "nsfw" | "harmful"; categories?: string | null; confidence?: number | null; actionTaken: "allowed" | "blocked" | "deleted" | "warned" }) {
  const db = await requireDb();
  await db.insert(contentModerationChecks).values(input);
}

export async function listModerationChecks(userId: number) {
  const db = await requireDb();
  return db.select().from(contentModerationChecks).where(eq(contentModerationChecks.userId, userId)).orderBy(desc(contentModerationChecks.createdAt)).limit(50);
}

export async function getMessageById(messageId: number) {
  const db = await requireDb();
  return (await db.select().from(messages).where(eq(messages.id, messageId)).limit(1))[0] ?? null;
}

export async function deleteMessage(messageId: number) {
  const db = await requireDb();
  await db.update(messages).set({ content: "[حُذفت الرسالة تلقائيًا لمخالفتها معايير المجتمع]", kind: "text" as const }).where(eq(messages.id, messageId));
}

export async function getProductById(productId: number) {
  const db = await requireDb();
  const rows = await db.select().from(products).innerJoin(users, eq(products.sellerId, users.id)).where(eq(products.id, productId)).limit(1);
  if (!rows[0]) return null;
  return { ...rows[0].products, seller: toPublicUser(rows[0].users) };
}

// --- التحقق العمري ورعاية الوالدين ---

export async function createMinorRestriction(userId: number, reason?: string | null) {
  const db = await requireDb();
  await db.insert(minorRestrictions).values({ userId, accountStatus: "parental_pending", restrictionReason: reason ?? "حساب القاصر يتطلب موافقة الوالدين" }).onDuplicateKeyUpdate({ set: { accountStatus: "parental_pending", restrictionReason: reason ?? "حساب القاصر يتطلب موافقة الوالدين", updatedAt: new Date() } });
}

export async function updateMinorRestriction(userId: number, accountStatus: "under_review" | "parental_pending" | "parental_approved" | "suspended", reason?: string | null) {
  const db = await requireDb();
  await db.update(minorRestrictions).set({ accountStatus, restrictionReason: reason, updatedAt: new Date() }).where(eq(minorRestrictions.userId, userId));
}

export async function getMinorRestriction(userId: number) {
  const db = await requireDb();
  return (await db.select().from(minorRestrictions).where(eq(minorRestrictions.userId, userId)).limit(1))[0] ?? null;
}

export async function createParentalConsent(userId: number, guardianEmail: string, guardianName?: string | null, relationship?: string | null) {
  const db = await requireDb();
  const token = randomBytes(32).toString("base64url");
  const { createHash } = await import("crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.insert(parentalConsents).values({
    userId,
    guardianEmail,
    guardianName,
    relationship,
    consentStatus: "requested",
    consentTokenHash: tokenHash,
    consentExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
  }).onDuplicateKeyUpdate({ set: { guardianEmail, consentStatus: "requested", consentTokenHash: tokenHash, consentExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), updatedAt: new Date() } });
  return { userId, token };
}

export async function resolveParentalConsent(token: string, decision: "granted" | "denied") {
  const db = await requireDb();
  const { createHash } = await import("crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = (await db.select().from(parentalConsents).where(and(eq(parentalConsents.consentTokenHash, tokenHash), eq(parentalConsents.consentStatus, "requested"), gt(parentalConsents.consentExpiresAt, new Date()))).limit(1))[0];
  if (!record) return { ok: false, message: "رابط الموافقة غير صالح أو منتهي الصلاحية" };
  await db.update(parentalConsents).set({ consentStatus: decision, grantedAt: decision === "granted" ? new Date() : null, updatedAt: new Date() }).where(eq(parentalConsents.id, record.id));
  await updateMinorRestriction(record.userId, decision === "granted" ? "parental_approved" : "suspended", decision === "granted" ? "وافق الولي على تشغيل الحساب تحت الإشراف" : "رفض الولي الموافقة؛ عُلّق الحساب");
  return { ok: true, message: decision === "granted" ? "تمت الموافقة وتم تفعيل الحساب تحت الإشراف الأبوي" : "تم رفض الموافقة وتعليق الحساب" };
}

export async function getParentalConsent(userId: number) {
  const db = await requireDb();
  return (await db.select().from(parentalConsents).where(eq(parentalConsents.userId, userId)).limit(1))[0] ?? null;
}

/** هل المستخدم نشط غير مقيّد: لا قيود، أو مقيّد بموافقة أبوية معتمدة */
export async function isAccountActive(userId: number): Promise<{ active: boolean; status?: "parental_pending" | "suspended" }> {
  const restriction = await getMinorRestriction(userId);
  if (!restriction) return { active: true };
  if (restriction.accountStatus === "parental_approved") return { active: true };
  if (restriction.accountStatus === "parental_pending") return { active: false, status: "parental_pending" };
  return { active: false, status: "suspended" };
}

// ===== القنوات والبوتات والمساحات الصوتية والعقوبات =====

export async function isChannelSubscriber(channelId: number, userId: number) {
  const db = await requireDb();
  const [row] = await db.select({ id: channelSubscribers.id }).from(channelSubscribers).where(and(eq(channelSubscribers.channelId, channelId), eq(channelSubscribers.userId, userId))).limit(1);
  return !!row;
}

export async function createChannel(ownerId: number, name: string, description?: string | null) {
  const db = await requireDb();
  const slug = `${name.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, "-").replace(/-+/g, "-")}-${Date.now().toString(36)}`;
  const inserted = await db.insert(channels).values({ ownerId, name, slug: slug.slice(0, 160), description }).execute();
  return Number(inserted[0].insertId);
}

export async function listChannels(viewerId?: number) {
  const db = await requireDb();
  const list = await db.select({ id: channels.id, name: channels.name, slug: channels.slug, description: channels.description, avatarUrl: channels.avatarUrl, subscriberCount: channels.subscriberCount, isOfficial: channels.isOfficial, ownerId: channels.ownerId, createdAt: channels.createdAt }).from(channels).orderBy(desc(channels.subscriberCount), desc(channels.createdAt)).limit(200);
  if (!viewerId) return list.map(channel => ({ ...channel, subscribed: false }));
  const subs = await db.select({ channelId: channelSubscribers.channelId }).from(channelSubscribers).where(and(eq(channelSubscribers.userId, viewerId), inArray(channelSubscribers.channelId, list.map(channel => channel.id))));
  const subIds = new Set(subs.map(sub => sub.channelId));
  return list.map(channel => ({ ...channel, subscribed: subIds.has(channel.id) }));
}

export async function getChannelById(channelId: number) {
  const db = await requireDb();
  return (await db.select().from(channels).where(eq(channels.id, channelId)).limit(1))[0] ?? null;
}

export async function subscribeChannel(channelId: number, userId: number) {
  const db = await requireDb();
  const existing = (await db.select({ id: channelSubscribers.id }).from(channelSubscribers).where(and(eq(channelSubscribers.channelId, channelId), eq(channelSubscribers.userId, userId))).limit(1))[0];
  if (!existing) {
    await db.insert(channelSubscribers).values({ channelId, userId });
    await db.update(channels).set({ subscriberCount: sql`${channels.subscriberCount} + 1` }).where(eq(channels.id, channelId));
  }
  const channel = await getChannelById(channelId);
  const owner = await getUserById(channel?.ownerId ?? 0);
  return { channel, owner };
}

export async function unsubscribeChannel(channelId: number, userId: number) {
  const db = await requireDb();
  await db.delete(channelSubscribers).where(and(eq(channelSubscribers.channelId, channelId), eq(channelSubscribers.userId, userId)));
  await db.update(channels).set({ subscriberCount: sql`GREATEST(${channels.subscriberCount} - 1, 0)` }).where(eq(channels.id, channelId));
}

export async function createChannelPost(channelId: number, authorId: number, content: string, mediaUrl?: string | null, mediaType?: "image" | "video" | null) {
  const db = await requireDb();
  const inserted = await db.insert(channelPosts).values({ channelId, authorId, content, mediaUrl, mediaType: mediaType ?? null }).execute();
  return Number(inserted[0].insertId);
}

export async function listChannelPosts(channelId: number) {
  const db = await requireDb();
  return db.select({ id: channelPosts.id, channelId: channelPosts.channelId, authorId: channelPosts.authorId, content: channelPosts.content, mediaUrl: channelPosts.mediaUrl, mediaType: channelPosts.mediaType, viewsCount: channelPosts.viewsCount, createdAt: channelPosts.createdAt }).from(channelPosts).where(eq(channelPosts.channelId, channelId)).orderBy(desc(channelPosts.createdAt)).limit(50);
}

export async function markChannelPostViewed(postId: number) {
  const db = await requireDb();
  await db.update(channelPosts).set({ viewsCount: sql`${channelPosts.viewsCount} + 1` }).where(eq(channelPosts.id, postId));
}

export async function deleteChannelPost(postId: number, actorId: number) {
  const db = await requireDb();
  const post = (await db.select().from(channelPosts).where(eq(channelPosts.id, postId)).limit(1))[0];
  if (!post) return false;
  const channel = await getChannelById(post.channelId);
  if (post.authorId !== actorId && channel?.ownerId !== actorId) return false;
  await db.delete(channelPosts).where(eq(channelPosts.id, postId));
  return true;
}

/** حذف إداري لمنشور قناة بعد حكم الاعتدال الآلي أو المراجعة البشرية. */
export async function forceDeleteChannelPost(postId: number) {
  const db = await requireDb();
  const result = await db.delete(channelPosts).where(eq(channelPosts.id, postId));
  return Number(result[0]?.affectedRows ?? 0) > 0;
}

/** حذف إداري لمنشور مجموعة بعد حكم الاعتدال الآلي أو المراجعة البشرية. */
export async function forceDeleteGroupPost(postId: number) {
  const db = await requireDb();
  const result = await db.delete(groupPosts).where(eq(groupPosts.id, postId));
  return Number(result[0]?.affectedRows ?? 0) > 0;
}

export async function deleteChannel(channelId: number, ownerId: number) {
  const db = await requireDb();
  await db.delete(channelSubscribers).where(eq(channelSubscribers.channelId, channelId));
  await db.delete(channelPosts).where(eq(channelPosts.channelId, channelId));
  await db.delete(bots).where(and(eq(bots.scope, "channel"), eq(bots.scopeId, channelId)));
  await db.delete(channels).where(and(eq(channels.id, channelId), eq(channels.ownerId, ownerId)));
}

export async function createBot(ownerId: number, scope: "chatGroup" | "channel", scopeId: number, name: string) {
  const db = await requireDb();
  const inserted = await db.insert(bots).values({ ownerId, scope, scopeId, name }).execute();
  return Number(inserted[0].insertId);
}

export async function listBots(scope: "chatGroup" | "channel", scopeId: number) {
  const db = await requireDb();
  return db.select().from(bots).where(and(eq(bots.scope, scope), eq(bots.scopeId, scopeId)));
}

export async function deleteBot(botId: number, ownerId: number) {
  const db = await requireDb();
  await db.delete(botRules).where(eq(botRules.botId, botId));
  await db.delete(bots).where(and(eq(bots.id, botId), eq(bots.ownerId, ownerId)));
}

export async function addBotRule(botId: number, triggerWord: string, response: string) {
  const db = await requireDb();
  await db.insert(botRules).values({ botId, trigger: triggerWord, response }).execute();
}

export async function deleteBotRule(ruleId: number, botId: number) {
  const db = await requireDb();
  await db.delete(botRules).where(and(eq(botRules.id, ruleId), eq(botRules.botId, botId)));
}

export async function getBotById(botId: number) {
  const db = await requireDb();
  return (await db.select().from(bots).where(eq(bots.id, botId)).limit(1))[0] ?? null;
}

export async function listBotRules(botId: number) {
  const db = await requireDb();
  return db.select().from(botRules).where(eq(botRules.botId, botId));
}

export async function matchBotResponse(scope: "chatGroup" | "channel", scopeId: number, text: string) {
  const db = await requireDb();
  const botsList = await db.select().from(bots).where(and(eq(bots.scope, scope), eq(bots.scopeId, scopeId), eq(bots.isActive, "yes")));
  if (!botsList.length) return null;
  const lower = text.toLowerCase();
  for (const bot of botsList) {
    const rules = await db.select().from(botRules).where(eq(botRules.botId, bot.id));
    for (const rule of rules) {
      if (lower.includes(rule.trigger.toLowerCase())) return { botId: bot.id, botOwnerId: bot.ownerId, response: rule.response };
    }
  }
  return null;
}

export async function createVoiceSpace(hostId: number, title: string, topic?: string | null) {
  const db = await requireDb();
  const inserted = await db.insert(voiceSpaces).values({ hostId, title, topic, startedAt: new Date() }).execute();
  return Number(inserted[0].insertId);
}

export async function listVoiceSpaces() {
  const db = await requireDb();
  return db.select().from(voiceSpaces).where(eq(voiceSpaces.status, "live")).orderBy(desc(voiceSpaces.listenerCount), desc(voiceSpaces.startedAt)).limit(100);
}

export async function getVoiceSpaceById(spaceId: number) {
  const db = await requireDb();
  return (await db.select().from(voiceSpaces).where(and(eq(voiceSpaces.id, spaceId), eq(voiceSpaces.status, "live"))).limit(1))[0] ?? null;
}

export async function joinVoiceSpace(spaceId: number, userId: number, socketId: string, isSpeaker = false) {
  const db = await requireDb();
  await db.insert(voiceSpaceParticipants).values({ spaceId, userId, socketId, isSpeaker: isSpeaker ? "yes" : "no" }).onDuplicateKeyUpdate({ set: { socketId, isSpeaker: isSpeaker ? "yes" : "no" } });
  const [count] = await db.select({ count: sql<number>`count(*)` }).from(voiceSpaceParticipants).where(eq(voiceSpaceParticipants.spaceId, spaceId));
  await db.update(voiceSpaces).set({ listenerCount: count?.count ?? 0 }).where(eq(voiceSpaces.id, spaceId));
}

export async function leaveVoiceSpace(spaceId: number, socketId: string) {
  const db = await requireDb();
  await db.delete(voiceSpaceParticipants).where(and(eq(voiceSpaceParticipants.spaceId, spaceId), eq(voiceSpaceParticipants.socketId, socketId)));
  const [count] = await db.select({ count: sql<number>`count(*)` }).from(voiceSpaceParticipants).where(eq(voiceSpaceParticipants.spaceId, spaceId));
  await db.update(voiceSpaces).set({ listenerCount: count?.count ?? 0 }).where(eq(voiceSpaces.id, spaceId));
}

export async function leaveVoiceSpaceByUser(spaceId: number, userId: number) {
  const db = await requireDb();
  await db.delete(voiceSpaceParticipants).where(and(eq(voiceSpaceParticipants.spaceId, spaceId), eq(voiceSpaceParticipants.userId, userId)));
  const [count] = await db.select({ count: sql<number>`count(*)` }).from(voiceSpaceParticipants).where(eq(voiceSpaceParticipants.spaceId, spaceId));
  await db.update(voiceSpaces).set({ listenerCount: count?.count ?? 0 }).where(eq(voiceSpaces.id, spaceId));
}

export async function setParticipantSpeaker(spaceId: number, userId: number, isSpeaker: boolean) {
  const db = await requireDb();
  await db.update(voiceSpaceParticipants).set({ isSpeaker: isSpeaker ? "yes" : "no" }).where(and(eq(voiceSpaceParticipants.spaceId, spaceId), eq(voiceSpaceParticipants.userId, userId)));
}

export async function listSpaceParticipants(spaceId: number) {
  const db = await requireDb();
  const rows = await db.select({ id: voiceSpaceParticipants.id, userId: voiceSpaceParticipants.userId, isSpeaker: voiceSpaceParticipants.isSpeaker, socketId: voiceSpaceParticipants.socketId }).from(voiceSpaceParticipants).where(eq(voiceSpaceParticipants.spaceId, spaceId));
  const userIds = rows.map(row => row.userId);
  let names: Record<number, { name: string | null; username: string | null; avatarUrl: string | null }> = {};
  if (userIds.length) {
    const profiles = await db.select({ id: users.id, name: users.name, username: users.username, avatarUrl: users.avatarUrl }).from(users).where(inArray(users.id, userIds));
    names = Object.fromEntries(profiles.map(profile => [profile.id, { name: profile.name, username: profile.username, avatarUrl: profile.avatarUrl }]));
  }
  return rows.map(row => ({ ...row, userName: names[row.userId]?.name ?? null, userUsername: names[row.userId]?.username ?? null, avatarUrl: names[row.userId]?.avatarUrl ?? null }));
}

export async function endVoiceSpace(spaceId: number, hostId: number) {
  const db = await requireDb();
  await db.update(voiceSpaces).set({ status: "ended", endedAt: new Date() }).where(and(eq(voiceSpaces.id, spaceId), eq(voiceSpaces.hostId, hostId)));
  await db.delete(voiceSpaceParticipants).where(eq(voiceSpaceParticipants.spaceId, spaceId));
}

export async function applyPunishment(userId: number, level: 1 | 2 | 3 | 4) {
  const db = await requireDb();
  const until = level === 2 ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) : level === 3 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
  await db.update(users).set({ punishmentLevel: level, punishmentUntil: until, banned: level === 4 ? "yes" : "no" }).where(eq(users.id, userId));
}

export async function warnUser(userId: number, adminId: number, reason: string) {
  await sendAdminNotification({ userId, actorId: adminId, message: `تنبيه إداري: ${reason}` });
  return { success: true };
}

export async function notifyUser(reporterId: number, message: string) {
  const db = await requireDb();
  await db.insert(notifications).values({ userId: reporterId, type: "moderation", message }).catch(() => undefined);
}

export async function toggleCreatorStatus(userId: number, enable: boolean) {
  const db = await requireDb();
  await db.update(users).set({ isCreator: enable ? "yes" : "no" }).where(eq(users.id, userId));
  const [user] = await db.select({ isCreator: users.isCreator }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.isCreator ?? "no";
}

export async function updateLocation(userId: number, input: { country?: string | null; state?: string | null; city?: string | null }) {
  const db = await requireDb();
  const set: Record<string, unknown> = {};
  if (input.country !== undefined) set.country = input.country;
  if (input.state !== undefined) set.state = input.state;
  if (input.city !== undefined) set.city = input.city;
  if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, userId));
  return getUserById(userId);
}


export async function getAccountPreferences(userId: number) {
  const db = await requireDb();
  const existing = (await db.select().from(accountPreferences).where(eq(accountPreferences.userId, userId)).limit(1))[0];
  if (existing) return existing;
  await db.insert(accountPreferences).values({ userId }).onDuplicateKeyUpdate({ set: { userId } });
  return (await db.select().from(accountPreferences).where(eq(accountPreferences.userId, userId)).limit(1))[0];
}

export async function updateAccountPreferences(userId: number, input: Partial<Pick<typeof accountPreferences.$inferInsert, "notifyEmail" | "notifyPhone" | "showReactionCounts" | "darkMode" | "translatePosts" | "friendRequestsScope" | "searchByEmail" | "searchByPhone" | "defaultPostAudience" | "defaultStoryAudience" | "publicComments" | "publicFollowers" | "soundEnabled" | "lastSeenVisibility" | "onlineVisibility" | "readReceipts" | "groupAddPolicy" | "liveLocationSharing" | "securityNotifications" | "chatFontSize" | "chatWallpaper" | "individualMessageTone" | "groupMessageTone" | "vibrationEnabled" | "notificationPreview" | "autoDownloadMedia">>) {
  const db = await requireDb();
  await db.insert(accountPreferences).values({ userId, ...input }).onDuplicateKeyUpdate({ set: input });
  return getAccountPreferences(userId);
}

export async function getAccountProfileDetails(userId: number) {
  const db = await requireDb();
  const existing = (await db.select().from(accountProfileDetails).where(eq(accountProfileDetails.userId, userId)).limit(1))[0];
  if (existing) return existing;
  await db.insert(accountProfileDetails).values({ userId }).onDuplicateKeyUpdate({ set: { userId } });
  return (await db.select().from(accountProfileDetails).where(eq(accountProfileDetails.userId, userId)).limit(1))[0];
}

export async function updateAccountProfileDetails(userId: number, input: Partial<Pick<typeof accountProfileDetails.$inferInsert, "workplace" | "education" | "residences">>) {
  const db = await requireDb();
  await db.insert(accountProfileDetails).values({ userId, ...input }).onDuplicateKeyUpdate({ set: input });
  return getAccountProfileDetails(userId);
}

export async function getAccountVerification(userId: number) {
  const db = await requireDb();
  const existing = (await db.select().from(accountVerification).where(eq(accountVerification.userId, userId)).limit(1))[0];
  if (existing) return existing;
  await db.insert(accountVerification).values({ userId }).onDuplicateKeyUpdate({ set: { userId } });
  return (await db.select().from(accountVerification).where(eq(accountVerification.userId, userId)).limit(1))[0];
}

export async function getLatestVerificationRequest(userId: number) {
  const db = await requireDb();
  return (await db.select().from(verificationRequests).where(eq(verificationRequests.userId, userId)).orderBy(desc(verificationRequests.requestedAt)).limit(1))[0] ?? null;
}

export async function appealVerificationRequest(userId: number, requestId: number, appealNote: string) {
  const db = await requireDb();
  const request = (await db.select().from(verificationRequests).where(and(eq(verificationRequests.id, requestId), eq(verificationRequests.userId, userId))).limit(1))[0];
  if (!request) return null;
  if (!["rejected", "needs_more_info", "revoked"].includes(request.status)) throw new Error("لا يمكن استئناف هذا الطلب في حالته الحالية.");
  await db.update(verificationRequests).set({ status: "appealed", appealNote, requestedAt: new Date() }).where(eq(verificationRequests.id, requestId));
  await db.insert(accountVerification).values({ userId, identityStatus: "pending", identityNote: appealNote, requestedAt: new Date() }).onDuplicateKeyUpdate({ set: { identityStatus: "pending", identityNote: appealNote, requestedAt: new Date() } });
  return getLatestVerificationRequest(userId);
}

export async function requestAccountVerification(userId: number, note?: string | null, details?: { requestType?: "identity" | "creator" | "business" | "seller" | "official"; legalName?: string | null; country?: string | null; businessUrl?: string | null; documentUrl?: string | null; selfieUrl?: string | null }) {
  const db = await requireDb();
  const now = new Date();
  await db.insert(accountVerification).values({ userId, identityStatus: "pending", identityNote: note ?? null, requestedAt: now }).onDuplicateKeyUpdate({ set: { identityStatus: "pending", identityNote: note ?? null, requestedAt: now } });
  await db.insert(verificationRequests).values({ userId, requestType: details?.requestType ?? "identity", status: "pending", legalName: details?.legalName ?? null, country: details?.country ?? null, businessUrl: details?.businessUrl ?? null, documentUrl: details?.documentUrl ?? null, selfieUrl: details?.selfieUrl ?? null, note: note ?? null, requestedAt: now });
  return getAccountVerification(userId);
}

export async function updatePoliticalAdsPreference(userId: number, enabled: boolean) {
  const db = await requireDb();
  await db.insert(accountVerification).values({ userId, politicalAdsEnabled: enabled }).onDuplicateKeyUpdate({ set: { politicalAdsEnabled: enabled } });
  return getAccountVerification(userId);
}

export async function getTwoFactorStatus(userId: number) {
  const db = await requireDb();
  const row = (await db.select({ id: twoFactorSettings.id, userId: twoFactorSettings.userId, enabled: twoFactorSettings.enabled, method: twoFactorSettings.method, updatedAt: twoFactorSettings.updatedAt }).from(twoFactorSettings).where(eq(twoFactorSettings.userId, userId)).limit(1))[0];
  return row ?? { id: null, userId, enabled: false, method: "authenticator" as const, updatedAt: null };
}

export async function saveTwoFactorSetup(userId: number, secret: string) {
  const db = await requireDb();
  await db.insert(twoFactorSettings).values({ userId, enabled: false, method: "authenticator", secret }).onDuplicateKeyUpdate({ set: { enabled: false, method: "authenticator", secret } });
  return getTwoFactorStatus(userId);
}

export async function enableTwoFactor(userId: number) {
  const db = await requireDb();
  await db.update(twoFactorSettings).set({ enabled: true }).where(eq(twoFactorSettings.userId, userId));
  return getTwoFactorStatus(userId);
}

export async function disableTwoFactor(userId: number) {
  const db = await requireDb();
  await db.update(twoFactorSettings).set({ enabled: false, secret: null }).where(eq(twoFactorSettings.userId, userId));
  return getTwoFactorStatus(userId);
}

export async function listLinkedApps(userId: number) {
  const db = await requireDb();
  return db.select({ id: linkedApps.id, appName: linkedApps.appName, websiteUrl: linkedApps.websiteUrl, scopes: linkedApps.scopes, connectedAt: linkedApps.connectedAt }).from(linkedApps).where(and(eq(linkedApps.userId, userId), isNull(linkedApps.revokedAt))).orderBy(desc(linkedApps.connectedAt));
}

export async function revokeLinkedApp(userId: number, appId: number) {
  const db = await requireDb();
  await db.update(linkedApps).set({ revokedAt: new Date() }).where(and(eq(linkedApps.id, appId), eq(linkedApps.userId, userId), isNull(linkedApps.revokedAt)));
}

export async function logAccountActivity(userId: number, action: string, entityType?: string | null, entityId?: number | null, metadata?: unknown) {
  const db = await requireDb();
  await db.insert(accountActivity).values({ userId, action, entityType: entityType ?? null, entityId: entityId ?? null, metadata: metadata ? JSON.stringify(metadata) : null });
}

export async function listAccountActivity(userId: number) {
  const db = await requireDb();
  return db.select().from(accountActivity).where(eq(accountActivity.userId, userId)).orderBy(desc(accountActivity.createdAt)).limit(100);
}

export async function exportAccountData(userId: number) {
  const db = await requireDb();
  const user = await getUserById(userId);
  const credentials = (await db.select({ email: localCredentials.email, createdAt: localCredentials.createdAt, updatedAt: localCredentials.updatedAt }).from(localCredentials).where(eq(localCredentials.userId, userId)).limit(1))[0] ?? null;
  const [preferences, profileDetails, verification, privacy, sessions, blocks, apps, activity] = await Promise.all([
    getAccountPreferences(userId), getAccountProfileDetails(userId), getAccountVerification(userId), getPrivacySettings(userId), listAuthSessions(userId), listBlockedUsers(userId), listLinkedApps(userId), listAccountActivity(userId),
  ]);
  return { exportedAt: new Date().toISOString(), user, credentials, preferences, profileDetails, verification: verification ? { ...verification, identityNote: verification.identityNote } : null, privacy, sessions: sessions.map(session => ({ id: session.id, userAgent: session.userAgent, createdAt: session.createdAt, lastActiveAt: session.lastActiveAt, expiresAt: session.expiresAt, current: false })), blocks, apps, activity };
}


export async function updateAccountEmail(userId: number, email: string) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.update(users).set({ email, emailVerifiedAt: null }).where(eq(users.id, userId));
    await tx.update(localCredentials).set({ email }).where(eq(localCredentials.userId, userId));
  });
  return getUserById(userId);
}


export async function getTwoFactorAuthSecret(userId: number) {
  const db = await requireDb();
  return (await db.select({ enabled: twoFactorSettings.enabled, secret: twoFactorSettings.secret }).from(twoFactorSettings).where(eq(twoFactorSettings.userId, userId)).limit(1))[0] ?? null;
}
