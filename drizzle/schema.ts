import {
  boolean,
  date,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 160 }),
    firstName: varchar("firstName", { length: 80 }),
    lastName: varchar("lastName", { length: 80 }),
    username: varchar("username", { length: 64 }),
    email: varchar("email", { length: 320 }),
    emailVerifiedAt: timestamp("emailVerifiedAt"),
    loginMethod: varchar("loginMethod", { length: 64 }),
    avatarUrl: text("avatarUrl"),
    avatarKey: varchar("avatarKey", { length: 512 }),
    coverUrl: text("coverUrl"),
    coverKey: varchar("coverKey", { length: 512 }),
    bio: text("bio"),
    country: varchar("country", { length: 96 }),
    city: varchar("city", { length: 120 }),
    dateOfBirth: date("dateOfBirth", { mode: "string" }),
    gender: mysqlEnum("gender", ["male", "female", "non_binary", "prefer_not_to_say"]),
    phoneNumber: varchar("phoneNumber", { length: 32 }),
    websiteUrl: varchar("websiteUrl", { length: 500 }),
    socialLinks: text("socialLinks"),
    timeZone: varchar("timeZone", { length: 64 }),
    defaultCurrency: varchar("defaultCurrency", { length: 8 }).default("SAR"),
    role: mysqlEnum("role", ["user", "moderator", "admin"]).default("user").notNull(),
    verificationType: mysqlEnum("verificationType", ["none", "identity", "creator", "business", "seller", "official"]).default("none").notNull(),
    verificationBadge: varchar("verificationBadge", { length: 120 }),
    verificationExpiresAt: timestamp("verificationExpiresAt"),
    verifiedAt: timestamp("verifiedAt"),
    isCreator: mysqlEnum("isCreator", ["no", "yes"]).default("no").notNull(),
    punishmentLevel: int("punishmentLevel").default(0).notNull(),
    punishmentUntil: timestamp("punishmentUntil"),
    banned: mysqlEnum("banned", ["no", "yes"]).default("no").notNull(),
    earnings: varchar("earnings", { length: 32 }).default("0.00").notNull(),
    followersCount: int("followersCount").default(0).notNull(),
    state: varchar("state", { length: 120 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [uniqueIndex("users_username_unique").on(table.username)]
);

/** بيانات اعتماد الحسابات المحلية منفصلة عن ملف المستخدم العام. */
export const localCredentials = mysqlTable(
  "localCredentials",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    passwordHash: varchar("passwordHash", { length: 512 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("local_credentials_email_idx").on(table.email)]
);

/** رموز أحادية الاستخدام لتأكيد البريد واستعادة كلمة المرور، تحفظ كتجزئة فقط. */
export const accountTokens = mysqlTable(
  "accountTokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
    purpose: mysqlEnum("purpose", ["email_verification", "password_reset"]).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("account_tokens_user_purpose_idx").on(table.userId, table.purpose), index("account_tokens_expires_idx").on(table.expiresAt)]
);

/** سجل الجلسات المحلية الموثوقة؛ يخزن تجزئة رمز الجلسة فقط ولا يخزن الرمز الخام. */
export const authSessions = mysqlTable(
  "authSessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    sessionHash: varchar("sessionHash", { length: 128 }).notNull().unique(),
    userAgent: varchar("userAgent", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  table => [index("auth_sessions_user_active_idx").on(table.userId, table.revokedAt), index("auth_sessions_expires_idx").on(table.expiresAt)]
);

/** تفضيلات ظهور بيانات الملف والعلاقات والمحتوى. */
export const passkeys = mysqlTable(
  "passkeys",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    credentialId: varchar("credentialId", { length: 512 }).notNull().unique(),
    publicKey: text("publicKey").notNull(),
    counter: int("counter").default(0).notNull(),
    transports: varchar("transports", { length: 255 }),
    deviceType: varchar("deviceType", { length: 32 }),
    backedUp: boolean("backedUp").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("passkeys_user_idx").on(table.userId)]
);

export const passkeyChallenges = mysqlTable(
  "passkeyChallenges",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    flow: mysqlEnum("flow", ["registration", "authentication"]).notNull(),
    origin: varchar("origin", { length: 512 }).notNull(),
    challenge: varchar("challenge", { length: 512 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("passkey_challenges_lookup_idx").on(table.userId, table.flow, table.expiresAt)]
);

export const privacySettings = mysqlTable("privacySettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  profileVisibility: mysqlEnum("profileVisibility", ["public", "followers", "private"]).default("public").notNull(),
  showCity: boolean("showCity").default(true).notNull(),
  showWebsite: boolean("showWebsite").default(true).notNull(),
  showSocialLinks: boolean("showSocialLinks").default(true).notNull(),
  showFollowers: boolean("showFollowers").default(true).notNull(),
  showFollowing: boolean("showFollowing").default(true).notNull(),
  showPosts: boolean("showPosts").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** تمنع العلاقة المحظورة التفاعل والرسائل والمتابعة بين الحسابين. */
export const userBlocks = mysqlTable(
  "userBlocks",
  {
    id: int("id").autoincrement().primaryKey(),
    blockerId: int("blockerId").notNull(),
    blockedId: int("blockedId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("user_blocks_pair_unique").on(table.blockerId, table.blockedId), index("user_blocks_blocked_idx").on(table.blockedId)]
);

export const reports = mysqlTable(
  "reports",
  {
    id: int("id").autoincrement().primaryKey(),
    reporterId: int("reporterId").notNull(),
    targetType: mysqlEnum("targetType", ["user", "post", "product", "message"]).notNull(),
    targetId: int("targetId").notNull(),
    reason: mysqlEnum("reason", ["spam", "harassment", "blackmail", "inappropriate_content", "fraud", "phishing", "counterfeit", "hate_speech", "violence", "impersonation", "fake_account", "misinformation", "copyright", "trademark", "technical_issue", "malicious_reporting", "other"]).notNull(),
    details: varchar("details", { length: 1000 }),
    status: mysqlEnum("status", ["open", "reviewed", "closed"]).default("open").notNull(),
    moderatedBy: mysqlEnum("moderatedBy", ["ai", "manual", "none"]).default("none").notNull(),
    aiVerdict: mysqlEnum("aiVerdict", ["substantiated", "partially_substantiated", "unsubstantiated"]),
    aiConfidence: int("aiConfidence"),
    actionTaken: mysqlEnum("actionTaken", ["no_action", "warn", "hide", "delete", "suspend"]).default("no_action").notNull(),
    resolutionDetails: varchar("resolutionDetails", { length: 1000 }),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("reports_target_idx").on(table.targetType, table.targetId), index("reports_status_created_idx").on(table.status, table.createdAt)]
);

/** سجل فحوصات الذكاء الاصطناعي للمحتوى المرسل (رسائل، منشورات، بث، إلخ). */
export const contentModerationChecks = mysqlTable(
  "contentModerationChecks",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    contentType: mysqlEnum("contentType", ["message", "chatGroupMessage", "liveChat", "post", "comment", "story", "reel", "product", "groupPost", "liveTitle", "username"]).notNull(),
    contentId: int("contentId").notNull(),
    contentPreview: text("contentPreview"),
    verdict: mysqlEnum("verdict", ["safe", "sexual", "nsfw", "harmful"]).notNull(),
    categories: varchar("categories", { length: 500 }),
    confidence: int("confidence"),
    actionTaken: mysqlEnum("actionTaken", ["allowed", "blocked", "deleted", "warned"]).default("allowed").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("cm_checks_user_created_idx").on(table.userId, table.createdAt), index("cm_checks_verdict_idx").on(table.verdict)]
);

/** موافقة الوالدين وبيانات الولي للتحقق العمري من مستخدمي القاصرين. */
export const parentalConsents = mysqlTable(
  "parentalConsents",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique(),
    guardianEmail: varchar("guardianEmail", { length: 320 }).notNull(),
    guardianName: varchar("guardianName", { length: 160 }),
    relationship: varchar("relationship", { length: 64 }),
    consentStatus: mysqlEnum("consentStatus", ["pending", "requested", "granted", "denied"]).default("pending").notNull(),
    consentTokenHash: varchar("consentTokenHash", { length: 128 }).unique(),
    consentExpiresAt: timestamp("consentExpiresAt"),
    grantedAt: timestamp("grantedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("parental_consents_status_idx").on(table.consentStatus)]
);

/** تقييدات الحسابات القاصرة قبل حصولها على موافقة الولي. */
export const minorRestrictions = mysqlTable(
  "minorRestrictions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique(),
    accountStatus: mysqlEnum("accountStatus", ["under_review", "parental_pending", "parental_approved", "suspended"]).default("under_review").notNull(),
    restrictedUntil: timestamp("restrictedUntil"),
    restrictionReason: varchar("restrictionReason", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("minor_restrictions_status_idx").on(table.accountStatus)]
);

export const follows = mysqlTable(
  "follows",
  {
    id: int("id").autoincrement().primaryKey(),
    followerId: int("followerId").notNull(),
    followingId: int("followingId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("follows_pair_unique").on(table.followerId, table.followingId),
    index("follows_following_idx").on(table.followingId),
  ]
);

/** طلبات الصداقة المنفصلة عن المتابعة؛ لا تُعد العلاقة مقبولة إلا بعد موافقة المستقبل. */
export const friendRequests = mysqlTable(
  "friendRequests",
  {
    id: int("id").autoincrement().primaryKey(),
    senderId: int("senderId").notNull(),
    receiverId: int("receiverId").notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "rejected", "canceled"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    respondedAt: timestamp("respondedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("friend_requests_receiver_status_idx").on(table.receiverId, table.status), index("friend_requests_sender_status_idx").on(table.senderId, table.status)]
);

export const interests = mysqlTable("interests", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const userInterests = mysqlTable(
  "userInterests",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    interestId: int("interestId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("user_interests_pair_unique").on(table.userId, table.interestId)]
);

export const groups = mysqlTable(
  "groups",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull().unique(),
    description: varchar("description", { length: 1000 }),
    privacy: mysqlEnum("privacy", ["public", "private"]).default("public").notNull(),
    avatarUrl: text("avatarUrl"),
    avatarKey: varchar("avatarKey", { length: 512 }),
    coverUrl: text("coverUrl"),
    coverKey: varchar("coverKey", { length: 512 }),
    memberCount: int("memberCount").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("groups_owner_created_idx").on(table.ownerId, table.createdAt), index("groups_privacy_created_idx").on(table.privacy, table.createdAt)]
);

export const groupMembers = mysqlTable(
  "groupMembers",
  {
    id: int("id").autoincrement().primaryKey(),
    groupId: int("groupId").notNull(),
    userId: int("userId").notNull(),
    role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
    status: mysqlEnum("status", ["active", "pending"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("group_members_pair_unique").on(table.groupId, table.userId), index("group_members_user_idx").on(table.userId, table.status)]
);

export const groupPosts = mysqlTable(
  "groupPosts",
  {
    id: int("id").autoincrement().primaryKey(),
    groupId: int("groupId").notNull(),
    userId: int("userId").notNull(),
    content: text("content").notNull(),
    mediaUrl: text("mediaUrl"),
    mediaKey: varchar("mediaKey", { length: 512 }),
    mediaType: mysqlEnum("mediaType", ["image", "video"]),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("group_posts_group_created_idx").on(table.groupId, table.createdAt), index("group_posts_user_idx").on(table.userId)]
);

export const posts = mysqlTable(
  "posts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    content: text("content").notNull(),
    mediaUrl: text("mediaUrl"),
    mediaKey: varchar("mediaKey", { length: 512 }),
    mediaType: mysqlEnum("mediaType", ["image", "video"]),
    likesCount: int("likesCount").default(0).notNull(),
    commentsCount: int("commentsCount").default(0).notNull(),
    sharesCount: int("sharesCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("posts_user_created_idx").on(table.userId, table.createdAt)]
);

export const postLikes = mysqlTable(
  "postLikes",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("postId").notNull(),
    userId: int("userId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("post_likes_pair_unique").on(table.postId, table.userId)]
);

export const postShares = mysqlTable(
  "postShares",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("postId").notNull(),
    userId: int("userId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("post_shares_pair_unique").on(table.postId, table.userId)]
);

export const comments = mysqlTable(
  "comments",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("postId").notNull(),
    userId: int("userId").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("comments_post_created_idx").on(table.postId, table.createdAt)]
);

export const messages = mysqlTable(
  "messages",
  {
    id: int("id").autoincrement().primaryKey(),
    senderId: int("senderId").notNull(),
    receiverId: int("receiverId").notNull(),
    content: text("content").notNull(),
    kind: mysqlEnum("kind", ["text", "gif", "sticker", "audio"]).default("text").notNull(),
    mediaUrl: text("mediaUrl"),
    mediaKey: varchar("mediaKey", { length: 512 }),
    replyToId: int("replyToId"),
    editedAt: timestamp("editedAt"),
    deletedAt: timestamp("deletedAt"),
    isRead: boolean("isRead").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("messages_pair_created_idx").on(table.senderId, table.receiverId, table.createdAt)]
);

export const chatGroups = mysqlTable("chatGroups", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  avatarUrl: text("avatarUrl"),
  avatarKey: varchar("avatarKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const chatGroupMembers = mysqlTable("chatGroupMembers", {
  id: int("id").autoincrement().primaryKey(),
  chatGroupId: int("chatGroupId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
  lastReadAt: timestamp("lastReadAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("chat_group_members_pair_unique").on(table.chatGroupId, table.userId), index("chat_group_members_user_idx").on(table.userId)]);

export const chatGroupMessages = mysqlTable("chatGroupMessages", {
  id: int("id").autoincrement().primaryKey(),
  chatGroupId: int("chatGroupId").notNull(),
  senderId: int("senderId").notNull(),
  content: text("content").notNull(),
  kind: mysqlEnum("kind", ["text", "gif", "sticker", "audio"]).default("text").notNull(),
  mediaUrl: text("mediaUrl"),
  mediaKey: varchar("mediaKey", { length: 512 }),
  replyToId: int("replyToId"),
  editedAt: timestamp("editedAt"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("chat_group_messages_group_created_idx").on(table.chatGroupId, table.createdAt)]);

export const messageReactions = mysqlTable(
  "messageReactions",
  {
    id: int("id").autoincrement().primaryKey(),
    messageId: int("messageId").notNull(),
    userId: int("userId").notNull(),
    emoji: varchar("emoji", { length: 24 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("message_reactions_unique").on(table.messageId, table.userId, table.emoji), index("message_reactions_message_idx").on(table.messageId)]
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    actorId: int("actorId"),
    type: mysqlEnum("type", ["like", "comment", "follow", "message", "share", "call", "live", "moderation"]).notNull(),
    entityId: int("entityId"),
    message: varchar("message", { length: 255 }).notNull(),
    isRead: boolean("isRead").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("notifications_user_created_idx").on(table.userId, table.createdAt)]
);

export const stories = mysqlTable(
  "stories",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    mediaUrl: text("mediaUrl").notNull(),
    mediaKey: varchar("mediaKey", { length: 512 }),
    mediaType: mysqlEnum("mediaType", ["image", "video"]).notNull(),
    caption: varchar("caption", { length: 320 }),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("stories_expires_idx").on(table.expiresAt)]
);

/** استطلاعات وأسئلة القصص التفاعلية (polls / questions). */
export const storyInteractions = mysqlTable(
  "storyInteractions",
  {
    id: int("id").autoincrement().primaryKey(),
    storyId: int("storyId").notNull(),
    kind: mysqlEnum("kind", ["poll", "question"]).default("poll").notNull(),
    prompt: varchar("prompt", { length: 300 }).notNull(),
    options: varchar("options", { length: 500 }),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("story_interactions_story_idx").on(table.storyId)]
);

/** تصويت المستخدمين على استطلاعات القصص. */
export const storyPollVotes = mysqlTable(
  "storyPollVotes",
  {
    id: int("id").autoincrement().primaryKey(),
    interactionId: int("interactionId").notNull(),
    userId: int("userId").notNull(),
    optionIndex: int("optionIndex").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("story_poll_votes_unique").on(table.interactionId, table.userId)]
);

/** أسئلة الجمهور على القصص. */
export const storyQuestions = mysqlTable(
  "storyQuestions",
  {
    id: int("id").autoincrement().primaryKey(),
    interactionId: int("interactionId").notNull(),
    userId: int("userId").notNull(),
    question: varchar("question", { length: 500 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("story_questions_interaction_idx").on(table.interactionId)]
);

/** القنوات العامة لصناع المحتوى والجهات الرسمية. */
export const channels = mysqlTable(
  "channels",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull().unique(),
    description: varchar("description", { length: 1000 }),
    avatarUrl: text("avatarUrl"),
    avatarKey: varchar("avatarKey", { length: 512 }),
    subscriberCount: int("subscriberCount").default(0).notNull(),
    isOfficial: mysqlEnum("isOfficial", ["no", "yes"]).default("no").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("channels_owner_idx").on(table.ownerId)]
);

/** اشتراكات المستخدمين في القنوات. */
export const channelSubscribers = mysqlTable(
  "channelSubscribers",
  {
    id: int("id").autoincrement().primaryKey(),
    channelId: int("channelId").notNull(),
    userId: int("userId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("channel_subscribers_unique").on(table.channelId, table.userId), index("channel_subscribers_user_idx").on(table.userId)]
);

/** منشورات القناة (تُوزع على المشتركين). */
export const channelPosts = mysqlTable(
  "channelPosts",
  {
    id: int("id").autoincrement().primaryKey(),
    channelId: int("channelId").notNull(),
    authorId: int("authorId").notNull(),
    content: text("content").notNull(),
    mediaUrl: text("mediaUrl"),
    mediaKey: varchar("mediaKey", { length: 512 }),
    mediaType: mysqlEnum("mediaType", ["image", "video"]),
    viewsCount: int("viewsCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("channel_posts_channel_created_idx").on(table.channelId, table.createdAt)]
);

/** المساحات الصوتية المباشرة (Rooms/Spaces). */
export const voiceSpaces = mysqlTable(
  "voiceSpaces",
  {
    id: int("id").autoincrement().primaryKey(),
    hostId: int("hostId").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    topic: varchar("topic", { length: 300 }),
    status: mysqlEnum("status", ["live", "ended"]).default("live").notNull(),
    listenerCount: int("listenerCount").default(0).notNull(),
    startedAt: timestamp("startedAt").notNull(),
    endedAt: timestamp("endedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("voice_spaces_status_idx").on(table.status)]
);

/** حضور المساحات الصوتية. */
export const voiceSpaceParticipants = mysqlTable(
  "voiceSpaceParticipants",
  {
    id: int("id").autoincrement().primaryKey(),
    spaceId: int("spaceId").notNull(),
    userId: int("userId").notNull(),
    isSpeaker: mysqlEnum("isSpeaker", ["no", "yes"]).default("no").notNull(),
    socketId: varchar("socketId", { length: 64 }).notNull(),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  },
  table => [index("voice_space_participants_space_idx").on(table.spaceId)]
);

/** البوتات الآلية للمجموعات والدردشات والقنوات. */
export const bots = mysqlTable(
  "bots",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    scope: mysqlEnum("scope", ["chatGroup", "channel"]).default("chatGroup").notNull(),
    scopeId: int("scopeId").notNull(),
    isActive: mysqlEnum("isActive", ["no", "yes"]).default("yes").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("bots_scope_idx").on(table.scope, table.scopeId)]
);

/** قواعد ردود البوتات الآلية (trigger → response). */
export const botRules = mysqlTable(
  "botRules",
  {
    id: int("id").autoincrement().primaryKey(),
    botId: int("botId").notNull(),
    trigger: varchar("triggerWord", { length: 120 }).notNull(),
    response: text("response").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("bot_rules_bot_idx").on(table.botId)]
);

export const reels = mysqlTable(
  "reels",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    videoUrl: text("videoUrl").notNull(),
    videoKey: varchar("videoKey", { length: 512 }),
    caption: varchar("caption", { length: 500 }),
    likesCount: int("likesCount").default(0).notNull(),
    viewsCount: int("viewsCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("reels_created_idx").on(table.createdAt)]
);

export const reelLikes = mysqlTable(
  "reelLikes",
  {
    id: int("id").autoincrement().primaryKey(),
    reelId: int("reelId").notNull(),
    userId: int("userId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("reel_likes_pair_unique").on(table.reelId, table.userId)]
);

export const reelViews = mysqlTable(
  "reelViews",
  {
    id: int("id").autoincrement().primaryKey(),
    reelId: int("reelId").notNull(),
    userId: int("userId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("reel_views_pair_unique").on(table.reelId, table.userId)]
);

export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    sellerId: int("sellerId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    price: int("price").notNull(),
    currency: varchar("currency", { length: 8 }).default("SAR").notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    condition: mysqlEnum("condition", ["new", "like_new", "good", "fair"]).default("new").notNull(),
    location: varchar("location", { length: 120 }),
    status: mysqlEnum("status", ["active", "sold", "archived"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("products_active_created_idx").on(table.status, table.createdAt)]
);

/** سجل المكالمات المباشرة (فردية وعشوائية) مع المدة والحالة. */
export const calls = mysqlTable(
  "calls",
  {
    id: int("id").autoincrement().primaryKey(),
    initiatorId: int("initiatorId").notNull(),
    receiverId: int("receiverId"),
    kind: mysqlEnum("kind", ["video", "audio"]).default("video").notNull(),
    isRandom: boolean("isRandom").default(false).notNull(),
    status: mysqlEnum("status", ["incoming", "ongoing", "ended", "missed", "rejected"]).default("incoming").notNull(),
    startedAt: timestamp("startedAt"),
    endedAt: timestamp("endedAt"),
    durationSeconds: int("durationSeconds").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("calls_initiator_created_idx").on(table.initiatorId, table.createdAt), index("calls_receiver_created_idx").on(table.receiverId, table.createdAt)]
);

/** قائمة انتظار المكالمات العشوائية، كل صف يمثل طالب انتظار واحد نشط. */
export const randomCallQueue = mysqlTable(
  "randomCallQueue",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique(),
    kind: mysqlEnum("kind", ["video", "audio"]).default("video").notNull(),
    preferredGender: mysqlEnum("preferredGender", ["any", "male", "female"]).default("any").notNull(),
    status: mysqlEnum("status", ["waiting", "matched", "cancelled"]).default("waiting").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("random_call_queue_status_idx").on(table.status, table.expiresAt)]
);

/** البث المباشر مع حالة البث وعدد المشاهدين ومدة البث. */
export const liveStreams = mysqlTable(
  "liveStreams",
  {
    id: int("id").autoincrement().primaryKey(),
    broadcasterId: int("broadcasterId").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    status: mysqlEnum("status", ["live", "ended", "cancelled"]).default("live").notNull(),
    recordingUrl: text("recordingUrl"),
    recordingKey: varchar("recordingKey", { length: 512 }),
    recordingSavedAt: timestamp("recordingSavedAt"),
    viewerCount: int("viewerCount").default(0).notNull(),
    totalViews: int("totalViews").default(0).notNull(),
    startedAt: timestamp("startedAt").notNull(),
    endedAt: timestamp("endedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("live_streams_status_created_idx").on(table.status, table.createdAt), index("live_streams_broadcaster_idx").on(table.broadcasterId)]
);

/** مشاهدات البث المباشر الحالية والنشطة. */
export const liveStreamViewers = mysqlTable(
  "liveStreamViewers",
  {
    id: int("id").autoincrement().primaryKey(),
    streamId: int("streamId").notNull(),
    userId: int("userId").notNull(),
    socketId: varchar("socketId", { length: 64 }).notNull(),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  },
  table => [index("live_stream_viewers_stream_idx").on(table.streamId, table.socketId)]
);

/** دردشة البث المباشر مع دعم الأنواع الغنية. */
export const liveStreamChatMessages = mysqlTable(
  "liveStreamChatMessages",
  {
    id: int("id").autoincrement().primaryKey(),
    streamId: int("streamId").notNull(),
    userId: int("userId").notNull(),
    content: varchar("content", { length: 500 }).notNull(),
    kind: mysqlEnum("kind", ["text", "gif", "sticker"]).default("text").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("live_stream_chat_stream_created_idx").on(table.streamId, table.createdAt)]
);

/** تفاعلات البث المباشر (الإعجاب والقلب وغيرها). */
export const liveStreamReactions = mysqlTable(
  "liveStreamReactions",
  {
    id: int("id").autoincrement().primaryKey(),
    streamId: int("streamId").notNull(),
    userId: int("userId").notNull(),
    emoji: varchar("emoji", { length: 24 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("live_stream_reactions_stream_idx").on(table.streamId, table.createdAt)]
);

export const productImages = mysqlTable(
  "productImages",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    imageUrl: text("imageUrl").notNull(),
    imageKey: varchar("imageKey", { length: 512 }),
    position: int("position").default(0).notNull(),
  },
  table => [index("product_images_product_idx").on(table.productId)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;


/** إعدادات مركز الحسابات والتفضيلات الشخصية. */
export const accountPreferences = mysqlTable("accountPreferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  notifyEmail: boolean("notifyEmail").default(true).notNull(),
  notifyPhone: boolean("notifyPhone").default(false).notNull(),
  showReactionCounts: boolean("showReactionCounts").default(true).notNull(),
  darkMode: boolean("darkMode").default(true).notNull(),
  translatePosts: boolean("translatePosts").default(false).notNull(),
  friendRequestsScope: mysqlEnum("friendRequestsScope", ["everyone", "followers", "no_one"]).default("everyone").notNull(),
  searchByEmail: boolean("searchByEmail").default(true).notNull(),
  searchByPhone: boolean("searchByPhone").default(false).notNull(),
  defaultPostAudience: mysqlEnum("defaultPostAudience", ["public", "followers", "private"]).default("public").notNull(),
  defaultStoryAudience: mysqlEnum("defaultStoryAudience", ["public", "followers", "private"]).default("public").notNull(),
  publicComments: boolean("publicComments").default(true).notNull(),
  publicFollowers: boolean("publicFollowers").default(true).notNull(),
  soundEnabled: boolean("soundEnabled").default(true).notNull(),
  lastSeenVisibility: mysqlEnum("lastSeenVisibility", ["everyone", "contacts", "no_one"]).default("everyone").notNull(),
  onlineVisibility: mysqlEnum("onlineVisibility", ["everyone", "contacts", "no_one"]).default("everyone").notNull(),
  readReceipts: boolean("readReceipts").default(true).notNull(),
  groupAddPolicy: mysqlEnum("groupAddPolicy", ["everyone", "contacts", "no_one"]).default("everyone").notNull(),
  liveLocationSharing: boolean("liveLocationSharing").default(false).notNull(),
  securityNotifications: boolean("securityNotifications").default(true).notNull(),
  chatFontSize: mysqlEnum("chatFontSize", ["small", "medium", "large"]).default("medium").notNull(),
  chatWallpaper: varchar("chatWallpaper", { length: 120 }).default("violet-night").notNull(),
  individualMessageTone: varchar("individualMessageTone", { length: 80 }).default("soft-pop").notNull(),
  groupMessageTone: varchar("groupMessageTone", { length: 80 }).default("group-bell").notNull(),
  vibrationEnabled: boolean("vibrationEnabled").default(true).notNull(),
  notificationPreview: boolean("notificationPreview").default(true).notNull(),
  autoDownloadMedia: mysqlEnum("autoDownloadMedia", ["always", "wifi", "never"]).default("wifi").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** تفاصيل العمل والتعليم وأماكن الإقامة التي يمكن التحكم في ظهورها. */
export const accountProfileDetails = mysqlTable("accountProfileDetails", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  workplace: varchar("workplace", { length: 160 }),
  education: varchar("education", { length: 200 }),
  residences: text("residences"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** طلبات توثيق الحساب وإعدادات الإعلانات السياسية. */
export const accountVerification = mysqlTable("accountVerification", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  identityStatus: mysqlEnum("identityStatus", ["not_requested", "pending", "approved", "rejected"]).default("not_requested").notNull(),
  identityNote: varchar("identityNote", { length: 500 }),
  politicalAdsEnabled: boolean("politicalAdsEnabled").default(false).notNull(),
  requestedAt: timestamp("requestedAt"),
  reviewedAt: timestamp("reviewedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** إعداد المصادقة الثنائية؛ لا يُعاد السر الخام في الاستعلامات العامة. */
export const twoFactorSettings = mysqlTable("twoFactorSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  method: mysqlEnum("method", ["authenticator"]).default("authenticator").notNull(),
  secret: varchar("secret", { length: 128 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** طلبات توثيق الهوية والشارات، مع مسارات مراجعة واستئناف واضحة. */
export const verificationRequests = mysqlTable("verificationRequests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  requestType: mysqlEnum("requestType", ["identity", "creator", "business", "seller", "official"]).default("identity").notNull(),
  status: mysqlEnum("status", ["pending", "needs_more_info", "approved", "rejected", "revoked", "appealed"]).default("pending").notNull(),
  legalName: varchar("legalName", { length: 180 }),
  country: varchar("country", { length: 96 }),
  note: text("note"),
  documentUrl: text("documentUrl"),
  selfieUrl: text("selfieUrl"),
  businessUrl: varchar("businessUrl", { length: 500 }),
  badgeLabel: varchar("badgeLabel", { length: 120 }),
  reviewerId: int("reviewerId"),
  decisionNote: text("decisionNote"),
  appealNote: text("appealNote"),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
  expiresAt: timestamp("expiresAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("verification_requests_status_idx").on(table.status, table.requestedAt), index("verification_requests_user_idx").on(table.userId, table.status)]);

/** سجل تدقيق غير قابل للإخفاء لإجراءات المالك والمشرفين. */
export const adminAuditLogs = mysqlTable("adminAuditLogs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  targetType: varchar("targetType", { length: 80 }),
  targetId: int("targetId"),
  reason: text("reason"),
  metadata: text("metadata"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("admin_audit_admin_idx").on(table.adminId, table.createdAt), index("admin_audit_target_idx").on(table.targetType, table.targetId, table.createdAt)]);

/** التطبيقات ومواقع الويب المرتبطة بحساب VibraCam. */
export const linkedApps = mysqlTable("linkedApps", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  appName: varchar("appName", { length: 160 }).notNull(),
  websiteUrl: varchar("websiteUrl", { length: 500 }),
  scopes: varchar("scopes", { length: 500 }),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
}, table => [index("linked_apps_user_idx").on(table.userId, table.revokedAt)]);

/** سجل قابل للعرض لنشاطات الحساب الحساسة والإدارية. */
export const accountActivity = mysqlTable("accountActivity", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 160 }).notNull(),
  entityType: varchar("entityType", { length: 80 }),
  entityId: int("entityId"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("account_activity_user_idx").on(table.userId, table.createdAt)]);
