import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Admin users table
export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("admin"), // admin, super_admin
  permissions: jsonb("permissions").notNull().default(sql`'{"all": true}'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Admin activity logs table
export const adminLogs = pgTable("admin_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // create_file, delete_file, create_message, delete_message, etc.
  entityType: text("entity_type").notNull(), // file, message, user, forum
  entityId: varchar("entity_id").notNull(),
  details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Forums table
export const forums = pgTable("forums", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  isPublic: boolean("is_public").notNull().default(true),
  creatorId: varchar("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  keywords: text("keywords"), // comma-separated tags for SEO
  ogImage: text("og_image"), // URL for social media preview
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Forum members (for tracking who has access to private forums)
export const forumMembers = pgTable("forum_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  forumId: varchar("forum_id").notNull().references(() => forums.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // member, moderator, admin
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

// Access requests (for private forums)
export const accessRequests = pgTable("access_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  forumId: varchar("forum_id").notNull().references(() => forums.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
});

// Messages table
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  forumId: varchar("forum_id").notNull().references(() => forums.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Admin tracking fields
  isAdminCreated: boolean("is_admin_created").notNull().default(false),
  adminCreatedBy: varchar("admin_created_by"), // admin user ID who created this
  adminNotes: text("admin_notes"), // internal admin notes
});

// Comments table (for nested comments on messages, files, and other comments)
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(), // 'message', 'file', or 'comment'
  entityId: varchar("entity_id").notNull(), // ID of the message, file, or comment being commented on
  parentId: varchar("parent_id"), // For nested replies - will be set up as self-reference in relations
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Tags table (for SEO and categorization)
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color").default("#6b7280"), // Hex color for UI display
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Junction tables for many-to-many relationships
export const fileTags = pgTable("file_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messageTags = pgTable("message_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const forumTags = pgTable("forum_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  forumId: varchar("forum_id").notNull().references(() => forums.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// File metadata table
export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  forumId: varchar("forum_id").notNull().references(() => forums.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(), // in bytes
  mimeType: text("mime_type"),
  thumbnail: text("thumbnail"), // base64 encoded thumbnail for images
  adminThumbnailUrl: text("admin_thumbnail_url"), // custom thumbnail URL provided by admin
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  keywords: text("keywords"), // comma-separated tags for SEO
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  // Admin tracking fields
  isAdminCreated: boolean("is_admin_created").notNull().default(false),
  adminCreatedBy: varchar("admin_created_by"), // admin user ID who created this
  directDownloadUrl: text("direct_download_url"), // direct URL for admin-created files
  adminNotes: text("admin_notes"), // internal admin notes
});

// File chunks table (for distributed storage across Dropbox accounts)
export const fileChunks = pgTable("file_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  chunkSize: integer("chunk_size").notNull(), // in bytes
  checksum: text("checksum"), // SHA256 hash for integrity verification
  dropboxAccountId: integer("dropbox_account_id").notNull(), // which Dropbox account (0, 1, 2, etc.)
  dropboxPath: text("dropbox_path"), // legacy path in Dropbox (for backward compatibility)
  dropboxFileId: text("dropbox_file_id"), // Dropbox file ID for retrieval
  downloadUrl: text("download_url"), // Permanent download URL for the chunk
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

// Partial uploads table (for resumable uploads)
export const partialUploads = pgTable("partial_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  forumId: varchar("forum_id").notNull().references(() => forums.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(), // in bytes
  mimeType: text("mime_type"),
  checksum: text("checksum").notNull(), // SHA256 hash of entire file for integrity
  totalChunks: integer("total_chunks").notNull(),
  uploadedChunks: jsonb("uploaded_chunks").notNull().default(sql`'[]'::jsonb`), // array of uploaded chunk indices
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Database shard metadata (for tracking which Neon DB to use)
export const dbShardMetadata = pgTable("db_shard_metadata", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shardId: integer("shard_id").notNull().unique(), // 0, 1, 2, etc.
  currentSize: integer("current_size").notNull().default(0), // in bytes
  maxSize: integer("max_size").notNull().default(524288000), // 500MB in bytes
  isActive: boolean("is_active").notNull().default(true),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

// Dropbox account usage tracking (for monitoring storage)
export const dropboxAccountUsage = pgTable("dropbox_account_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: integer("account_id").notNull().unique(), // 0, 1, 2, etc.
  currentSize: integer("current_size").notNull().default(0), // in bytes
  maxSize: integer("max_size").notNull().default(1932735283), // 1.8GB in bytes
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

// Search analytics table for tracking user searches and generating popular searches
export const searchAnalytics = pgTable("search_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  query: text("query").notNull(), // The search query
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }), // Optional - for logged in users
  resultsCount: integer("results_count").notNull().default(0), // Number of results returned
  searchedAt: timestamp("searched_at").notNull().defaultNow(),
  sessionId: text("session_id"), // For tracking anonymous users
});

// Popular searches cache table
export const popularSearches = pgTable("popular_searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  query: text("query").notNull().unique(), // The popular search term
  searchCount: integer("search_count").notNull().default(1), // Total times this query was searched
  lastSearched: timestamp("last_searched").notNull().defaultNow(),
  category: text("category").notNull().default("general"), // "tag", "creator", "general"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  forums: many(forums),
  forumMembers: many(forumMembers),
  messages: many(messages),
  comments: many(comments),
  files: many(files),
  accessRequests: many(accessRequests),
  partialUploads: many(partialUploads),
}));

export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  logs: many(adminLogs),
}));

export const adminLogsRelations = relations(adminLogs, ({ one }) => ({
  admin: one(adminUsers, {
    fields: [adminLogs.adminId],
    references: [adminUsers.id],
  }),
}));

export const forumsRelations = relations(forums, ({ one, many }) => ({
  creator: one(users, {
    fields: [forums.creatorId],
    references: [users.id],
  }),
  members: many(forumMembers),
  messages: many(messages),
  files: many(files),
  accessRequests: many(accessRequests),
  partialUploads: many(partialUploads),
}));

export const forumMembersRelations = relations(forumMembers, ({ one }) => ({
  forum: one(forums, {
    fields: [forumMembers.forumId],
    references: [forums.id],
  }),
  user: one(users, {
    fields: [forumMembers.userId],
    references: [users.id],
  }),
}));

export const accessRequestsRelations = relations(accessRequests, ({ one }) => ({
  forum: one(forums, {
    fields: [accessRequests.forumId],
    references: [forums.id],
  }),
  user: one(users, {
    fields: [accessRequests.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  forum: one(forums, {
    fields: [messages.forumId],
    references: [forums.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
  }),
  replies: many(comments),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  fileTags: many(fileTags),
  messageTags: many(messageTags),
  forumTags: many(forumTags),
}));

export const fileTagsRelations = relations(fileTags, ({ one }) => ({
  file: one(files, {
    fields: [fileTags.fileId],
    references: [files.id],
  }),
  tag: one(tags, {
    fields: [fileTags.tagId],
    references: [tags.id],
  }),
}));

export const messageTagsRelations = relations(messageTags, ({ one }) => ({
  message: one(messages, {
    fields: [messageTags.messageId],
    references: [messages.id],
  }),
  tag: one(tags, {
    fields: [messageTags.tagId],
    references: [tags.id],
  }),
}));

export const forumTagsRelations = relations(forumTags, ({ one }) => ({
  forum: one(forums, {
    fields: [forumTags.forumId],
    references: [forums.id],
  }),
  tag: one(tags, {
    fields: [forumTags.tagId],
    references: [tags.id],
  }),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  forum: one(forums, {
    fields: [files.forumId],
    references: [forums.id],
  }),
  user: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
  chunks: many(fileChunks),
}));

export const fileChunksRelations = relations(fileChunks, ({ one }) => ({
  file: one(files, {
    fields: [fileChunks.fileId],
    references: [files.id],
  }),
}));

export const partialUploadsRelations = relations(partialUploads, ({ one }) => ({
  forum: one(forums, {
    fields: [partialUploads.forumId],
    references: [forums.id],
  }),
  user: one(users, {
    fields: [partialUploads.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
}).extend({
  email: z.string().email("Invalid email address"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const insertForumSchema = createInsertSchema(forums).omit({
  id: true,
  creatorId: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Forum name is required"),
  description: z.string().optional(),
  isPublic: z.boolean().default(true),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  forumId: z.string(),
  content: z.string().min(1, "Message cannot be empty"),
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  entityType: z.enum(["message", "file", "comment"]),
  entityId: z.string(),
  parentId: z.string().optional(),
  content: z.string().min(1, "Comment cannot be empty"),
});

export const insertAccessRequestSchema = createInsertSchema(accessRequests).omit({
  id: true,
  userId: true,
  status: true,
  requestedAt: true,
  resolvedAt: true,
}).extend({
  forumId: z.string(),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Forum = typeof forums.$inferSelect;
export type InsertForum = z.infer<typeof insertForumSchema>;

export type ForumMember = typeof forumMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type AccessRequest = typeof accessRequests.$inferSelect;
export type InsertAccessRequest = z.infer<typeof insertAccessRequestSchema>;

export type File = typeof files.$inferSelect;
export type FileChunk = typeof fileChunks.$inferSelect;
export type PartialUpload = typeof partialUploads.$inferSelect;

export type Tag = typeof tags.$inferSelect;

export type DBShardMetadata = typeof dbShardMetadata.$inferSelect;
export type SearchAnalytics = typeof searchAnalytics.$inferSelect;
export type PopularSearch = typeof popularSearches.$inferSelect;

// Extended types with relations for frontend use
export type ForumWithCreator = Forum & {
  creator: User;
  memberCount?: number;
  hasAccess?: boolean;
  requestStatus?: string | null;
  requestId?: string | null;
};

export type MessageWithUser = Message & {
  user: User;
  commentCount?: number;
};

export type CommentWithUser = Comment & {
  user: User;
  replies?: CommentWithUser[];
};

export type AccessRequestWithUser = AccessRequest & {
  user: User;
};

export type FileWithChunks = File & {
  chunks: FileChunk[];
  user: User;
  commentCount?: number;
};

export type ForumMemberWithUser = ForumMember & {
  user: User;
};

// Admin types
export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminLog = typeof adminLogs.$inferSelect;

export type AdminUserWithLogs = AdminUser & {
  logs: AdminLog[];
};

export type FileWithAdmin = File & {
  user: User;
  chunks: FileChunk[];
  isAdminFile: boolean;
  adminCreator?: AdminUser;
};

export type MessageWithAdmin = Message & {
  user: User;
  isAdminMessage: boolean;
  adminCreator?: AdminUser;
};