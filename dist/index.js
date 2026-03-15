var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  accessRequests: () => accessRequests,
  accessRequestsRelations: () => accessRequestsRelations,
  adminLogs: () => adminLogs,
  adminLogsRelations: () => adminLogsRelations,
  adminUsers: () => adminUsers,
  adminUsersRelations: () => adminUsersRelations,
  comments: () => comments,
  commentsRelations: () => commentsRelations,
  dbShardMetadata: () => dbShardMetadata,
  dropboxAccountUsage: () => dropboxAccountUsage,
  fileChunks: () => fileChunks,
  fileChunksRelations: () => fileChunksRelations,
  fileTags: () => fileTags,
  fileTagsRelations: () => fileTagsRelations,
  files: () => files,
  filesRelations: () => filesRelations,
  forumMembers: () => forumMembers,
  forumMembersRelations: () => forumMembersRelations,
  forumTags: () => forumTags,
  forumTagsRelations: () => forumTagsRelations,
  forums: () => forums,
  forumsRelations: () => forumsRelations,
  insertAccessRequestSchema: () => insertAccessRequestSchema,
  insertCommentSchema: () => insertCommentSchema,
  insertForumSchema: () => insertForumSchema,
  insertMessageSchema: () => insertMessageSchema,
  insertUserSchema: () => insertUserSchema,
  messageTags: () => messageTags,
  messageTagsRelations: () => messageTagsRelations,
  messages: () => messages,
  messagesRelations: () => messagesRelations,
  partialUploads: () => partialUploads,
  partialUploadsRelations: () => partialUploadsRelations,
  popularSearches: () => popularSearches,
  searchAnalytics: () => searchAnalytics,
  tags: () => tags,
  tagsRelations: () => tagsRelations,
  users: () => users,
  usersRelations: () => usersRelations
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users, adminUsers, adminLogs, forums, forumMembers, accessRequests, messages, comments, tags, fileTags, messageTags, forumTags, files, fileChunks, partialUploads, dbShardMetadata, dropboxAccountUsage, searchAnalytics, popularSearches, usersRelations, adminUsersRelations, adminLogsRelations, forumsRelations, forumMembersRelations, accessRequestsRelations, messagesRelations, commentsRelations, tagsRelations, fileTagsRelations, messageTagsRelations, forumTagsRelations, filesRelations, fileChunksRelations, partialUploadsRelations, insertUserSchema, insertForumSchema, insertMessageSchema, insertCommentSchema, insertAccessRequestSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    users = pgTable("users", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      username: text("username").notNull().unique(),
      email: text("email").notNull().unique(),
      password: text("password").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    adminUsers = pgTable("admin_users", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      username: text("username").notNull().unique(),
      email: text("email").notNull().unique(),
      password: text("password").notNull(),
      role: text("role").notNull().default("admin"),
      // admin, super_admin
      permissions: jsonb("permissions").notNull().default(sql`'{"all": true}'::jsonb`),
      isActive: boolean("is_active").notNull().default(true),
      lastLoginAt: timestamp("last_login_at"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    adminLogs = pgTable("admin_logs", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      adminId: varchar("admin_id").notNull(),
      action: text("action").notNull(),
      // create_file, delete_file, create_message, delete_message, etc.
      entityType: text("entity_type").notNull(),
      // file, message, user, forum
      entityId: varchar("entity_id").notNull(),
      details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
      ipAddress: text("ip_address"),
      userAgent: text("user_agent"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    forums = pgTable("forums", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      description: text("description"),
      isPublic: boolean("is_public").notNull().default(true),
      creatorId: varchar("creator_id").notNull(),
      metaTitle: text("meta_title"),
      metaDescription: text("meta_description"),
      keywords: text("keywords"),
      // comma-separated tags for SEO
      ogImage: text("og_image"),
      // URL for social media preview
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    forumMembers = pgTable("forum_members", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      forumId: varchar("forum_id").notNull(),
      userId: varchar("user_id").notNull(),
      role: text("role").notNull().default("member"),
      // member, moderator, admin
      joinedAt: timestamp("joined_at").notNull().defaultNow()
    });
    accessRequests = pgTable("access_requests", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      forumId: varchar("forum_id").notNull(),
      userId: varchar("user_id").notNull(),
      status: text("status").notNull().default("pending"),
      // pending, approved, rejected
      requestedAt: timestamp("requested_at").notNull().defaultNow(),
      resolvedAt: timestamp("resolved_at"),
      resolvedBy: varchar("resolved_by")
    });
    messages = pgTable("messages", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      forumId: varchar("forum_id").notNull(),
      userId: varchar("user_id").notNull(),
      content: text("content").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      // Admin tracking fields
      isAdminCreated: boolean("is_admin_created").notNull().default(false),
      adminCreatedBy: varchar("admin_created_by"),
      // admin user ID who created this
      adminNotes: text("admin_notes")
      // internal admin notes
    });
    comments = pgTable("comments", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull(),
      entityType: text("entity_type").notNull(),
      // 'message', 'file', or 'comment'
      entityId: varchar("entity_id").notNull(),
      // ID of the message, file, or comment being commented on
      parentId: varchar("parent_id"),
      // For nested replies - will be set up as self-reference in relations
      content: text("content").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    tags = pgTable("tags", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull().unique(),
      description: text("description"),
      color: text("color").default("#6b7280"),
      // Hex color for UI display
      forumId: varchar("forum_id"),
      // Forum scope for ownership and permissions
      createdBy: varchar("created_by"),
      // User who created the tag
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    fileTags = pgTable("file_tags", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      fileId: varchar("file_id").notNull(),
      tagId: varchar("tag_id").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    messageTags = pgTable("message_tags", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      messageId: varchar("message_id").notNull(),
      tagId: varchar("tag_id").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    forumTags = pgTable("forum_tags", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      forumId: varchar("forum_id").notNull(),
      tagId: varchar("tag_id").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    files = pgTable("files", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      forumId: varchar("forum_id").notNull(),
      userId: varchar("user_id").notNull(),
      fileName: text("file_name").notNull(),
      fileSize: integer("file_size").notNull(),
      // in bytes
      mimeType: text("mime_type"),
      thumbnail: text("thumbnail"),
      // base64 encoded thumbnail for images
      adminThumbnailUrl: text("admin_thumbnail_url"),
      // custom thumbnail URL provided by admin
      metaTitle: text("meta_title"),
      metaDescription: text("meta_description"),
      keywords: text("keywords"),
      // comma-separated tags for SEO
      uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
      // Admin tracking fields
      isAdminCreated: boolean("is_admin_created").notNull().default(false),
      adminCreatedBy: varchar("admin_created_by"),
      // admin user ID who created this
      directDownloadUrl: text("direct_download_url"),
      // direct URL for admin-created files
      adminNotes: text("admin_notes")
      // internal admin notes
    });
    fileChunks = pgTable("file_chunks", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      fileId: varchar("file_id").notNull(),
      chunkIndex: integer("chunk_index").notNull(),
      chunkSize: integer("chunk_size").notNull(),
      // in bytes
      checksum: text("checksum"),
      // SHA256 hash for integrity verification
      dropboxAccountId: integer("dropbox_account_id").notNull(),
      // which Dropbox account (0, 1, 2, etc.)
      dropboxPath: text("dropbox_path"),
      // legacy path in Dropbox (for backward compatibility)
      dropboxFileId: text("dropbox_file_id"),
      // Dropbox file ID for retrieval
      downloadUrl: text("download_url"),
      // Permanent download URL for the chunk
      uploadedAt: timestamp("uploaded_at").notNull().defaultNow()
    });
    partialUploads = pgTable("partial_uploads", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      forumId: varchar("forum_id").notNull(),
      userId: varchar("user_id").notNull(),
      fileName: text("file_name").notNull(),
      fileSize: integer("file_size").notNull(),
      // in bytes
      mimeType: text("mime_type"),
      checksum: text("checksum").notNull(),
      // SHA256 hash of entire file for integrity
      totalChunks: integer("total_chunks").notNull(),
      uploadedChunks: jsonb("uploaded_chunks").notNull().default(sql`'[]'::jsonb`),
      // array of uploaded chunk indices
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    dbShardMetadata = pgTable("db_shard_metadata", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      shardId: integer("shard_id").notNull().unique(),
      // 0, 1, 2, etc.
      currentSize: integer("current_size").notNull().default(0),
      // in bytes
      maxSize: integer("max_size").notNull().default(524288e3),
      // 500MB in bytes
      isActive: boolean("is_active").notNull().default(true),
      lastUpdated: timestamp("last_updated").notNull().defaultNow()
    });
    dropboxAccountUsage = pgTable("dropbox_account_usage", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      accountId: integer("account_id").notNull().unique(),
      // 0, 1, 2, etc.
      currentSize: integer("current_size").notNull().default(0),
      // in bytes
      maxSize: integer("max_size").notNull().default(1932735283),
      // 1.8GB in bytes
      lastUpdated: timestamp("last_updated").notNull().defaultNow()
    });
    searchAnalytics = pgTable("search_analytics", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      query: text("query").notNull(),
      // The search query
      userId: varchar("user_id"),
      // Optional - for logged in users
      resultsCount: integer("results_count").notNull().default(0),
      // Number of results returned
      searchedAt: timestamp("searched_at").notNull().defaultNow(),
      sessionId: text("session_id")
      // For tracking anonymous users
    });
    popularSearches = pgTable("popular_searches", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      query: text("query").notNull().unique(),
      // The popular search term
      searchCount: integer("search_count").notNull().default(1),
      // Total times this query was searched
      lastSearched: timestamp("last_searched").notNull().defaultNow(),
      category: text("category").notNull().default("general"),
      // "tag", "creator", "general"
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    usersRelations = relations(users, ({ many }) => ({
      forums: many(forums),
      forumMembers: many(forumMembers),
      messages: many(messages),
      comments: many(comments),
      files: many(files),
      accessRequests: many(accessRequests),
      partialUploads: many(partialUploads)
    }));
    adminUsersRelations = relations(adminUsers, ({ many }) => ({
      logs: many(adminLogs)
    }));
    adminLogsRelations = relations(adminLogs, ({ one }) => ({
      admin: one(adminUsers, {
        fields: [adminLogs.adminId],
        references: [adminUsers.id]
      })
    }));
    forumsRelations = relations(forums, ({ one, many }) => ({
      creator: one(users, {
        fields: [forums.creatorId],
        references: [users.id]
      }),
      members: many(forumMembers),
      messages: many(messages),
      files: many(files),
      accessRequests: many(accessRequests),
      partialUploads: many(partialUploads)
    }));
    forumMembersRelations = relations(forumMembers, ({ one }) => ({
      forum: one(forums, {
        fields: [forumMembers.forumId],
        references: [forums.id]
      }),
      user: one(users, {
        fields: [forumMembers.userId],
        references: [users.id]
      })
    }));
    accessRequestsRelations = relations(accessRequests, ({ one }) => ({
      forum: one(forums, {
        fields: [accessRequests.forumId],
        references: [forums.id]
      }),
      user: one(users, {
        fields: [accessRequests.userId],
        references: [users.id]
      })
    }));
    messagesRelations = relations(messages, ({ one }) => ({
      forum: one(forums, {
        fields: [messages.forumId],
        references: [forums.id]
      }),
      user: one(users, {
        fields: [messages.userId],
        references: [users.id]
      })
    }));
    commentsRelations = relations(comments, ({ one, many }) => ({
      user: one(users, {
        fields: [comments.userId],
        references: [users.id]
      }),
      parent: one(comments, {
        fields: [comments.parentId],
        references: [comments.id]
      }),
      replies: many(comments)
    }));
    tagsRelations = relations(tags, ({ many }) => ({
      fileTags: many(fileTags),
      messageTags: many(messageTags),
      forumTags: many(forumTags)
    }));
    fileTagsRelations = relations(fileTags, ({ one }) => ({
      file: one(files, {
        fields: [fileTags.fileId],
        references: [files.id]
      }),
      tag: one(tags, {
        fields: [fileTags.tagId],
        references: [tags.id]
      })
    }));
    messageTagsRelations = relations(messageTags, ({ one }) => ({
      message: one(messages, {
        fields: [messageTags.messageId],
        references: [messages.id]
      }),
      tag: one(tags, {
        fields: [messageTags.tagId],
        references: [tags.id]
      })
    }));
    forumTagsRelations = relations(forumTags, ({ one }) => ({
      forum: one(forums, {
        fields: [forumTags.forumId],
        references: [forums.id]
      }),
      tag: one(tags, {
        fields: [forumTags.tagId],
        references: [tags.id]
      })
    }));
    filesRelations = relations(files, ({ one, many }) => ({
      forum: one(forums, {
        fields: [files.forumId],
        references: [forums.id]
      }),
      user: one(users, {
        fields: [files.userId],
        references: [users.id]
      }),
      chunks: many(fileChunks)
    }));
    fileChunksRelations = relations(fileChunks, ({ one }) => ({
      file: one(files, {
        fields: [fileChunks.fileId],
        references: [files.id]
      })
    }));
    partialUploadsRelations = relations(partialUploads, ({ one }) => ({
      forum: one(forums, {
        fields: [partialUploads.forumId],
        references: [forums.id]
      }),
      user: one(users, {
        fields: [partialUploads.userId],
        references: [users.id]
      })
    }));
    insertUserSchema = createInsertSchema(users).pick({
      username: true,
      email: true,
      password: true
    }).extend({
      email: z.string().email("Invalid email address"),
      username: z.string().min(3, "Username must be at least 3 characters"),
      password: z.string().min(6, "Password must be at least 6 characters")
    });
    insertForumSchema = createInsertSchema(forums).omit({
      id: true,
      creatorId: true,
      createdAt: true
    }).extend({
      name: z.string().min(1, "Forum name is required"),
      description: z.string().optional(),
      isPublic: z.boolean().default(true)
    });
    insertMessageSchema = createInsertSchema(messages).omit({
      id: true,
      userId: true,
      createdAt: true
    }).extend({
      forumId: z.string(),
      content: z.string().min(1, "Message cannot be empty")
    });
    insertCommentSchema = createInsertSchema(comments).omit({
      id: true,
      userId: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      entityType: z.enum(["message", "file", "comment"]),
      entityId: z.string(),
      parentId: z.string().optional(),
      content: z.string().min(1, "Comment cannot be empty")
    });
    insertAccessRequestSchema = createInsertSchema(accessRequests).omit({
      id: true,
      userId: true,
      status: true,
      requestedAt: true,
      resolvedAt: true
    }).extend({
      forumId: z.string()
    });
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  db: () => db,
  dbManager: () => dbManager,
  pool: () => pool
});
import dotenv from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { eq } from "drizzle-orm";
async function retryWithBackoff(operation, maxRetries = 3, baseDelay = 1e3, operationName = "operation") {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if ((error.code === "ETIMEDOUT" || error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.message?.includes("WebSocket") || error.message?.includes("connection") || error.message?.includes("timeout")) && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, error.message);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      } else {
        break;
      }
    }
  }
  console.error(`${operationName} failed after ${maxRetries + 1} attempts:`, lastError);
  throw lastError;
}
var parseDatabaseUrls, DatabaseManager, dbManager, db, pool;
var init_db = __esm({
  "server/db.ts"() {
    init_schema();
    dotenv.config();
    neonConfig.webSocketConstructor = ws;
    parseDatabaseUrls = () => {
      const dbUrl = process.env.DATABASE_URL || "";
      const urls = dbUrl.split(",").map((url) => url.trim()).filter(Boolean);
      if (urls.length === 0) {
        throw new Error("DATABASE_URL must be set with at least one database connection string");
      }
      return urls;
    };
    DatabaseManager = class {
      instances = [];
      currentWriteIndex = 0;
      constructor() {
        this.initialize();
      }
      async initialize() {
        const urls = parseDatabaseUrls();
        this.instances = urls.map((url, index) => {
          const pool2 = new Pool({
            connectionString: url,
            connectionTimeoutMillis: 1e4,
            // 10 seconds
            idleTimeoutMillis: 3e4,
            // 30 seconds
            max: 10,
            // Maximum number of connections
            allowExitOnIdle: true
          });
          const db3 = drizzle({ client: pool2, schema: schema_exports });
          return {
            id: index,
            pool: pool2,
            db: db3,
            url
          };
        });
        console.log(`Initialized ${this.instances.length} Neon database connections for distributed storage`);
        setTimeout(() => {
          this.initializeShardMetadata().then(() => {
            setInterval(() => {
              this.optimizeShardSelection().catch((error) => {
                console.error("Shard optimization error:", error);
              });
            }, 30 * 60 * 1e3);
            this.optimizeShardSelection().catch((error) => {
              console.error("Initial shard optimization error:", error);
            });
          }).catch((error) => {
            console.error("Failed to initialize shard metadata:", error);
          });
        }, 1e3);
      }
      getAllInstances() {
        return this.instances;
      }
      getPrimaryInstance() {
        return this.instances[0];
      }
      getInstanceForWrite() {
        if (this.instances.length === 1) {
          return this.instances[0];
        }
        const instance = this.instances[this.currentWriteIndex];
        this.currentWriteIndex = (this.currentWriteIndex + 1) % this.instances.length;
        return instance;
      }
      async getInstanceByLeastUsed() {
        if (this.instances.length === 1) {
          return this.instances[0];
        }
        try {
          const usagePromises = this.instances.map(async (instance) => {
            try {
              const [metadata] = await retryWithBackoff(
                () => instance.db.select().from(dbShardMetadata).where(eq(dbShardMetadata.shardId, instance.id)).limit(1),
                3,
                1e3,
                `Metadata query for shard ${instance.id}`
              );
              const maxSize = metadata?.maxSize || 524288e3;
              const isActive = metadata?.isActive !== false;
              let currentSize = 0;
              try {
                const sizeResult = await retryWithBackoff(
                  () => instance.pool.query(`
                SELECT pg_database_size(current_database()) as db_size_bytes
              `),
                  3,
                  1e3,
                  `Size query for shard ${instance.id}`
                );
                if (sizeResult.rows && sizeResult.rows.length > 0) {
                  currentSize = parseInt(sizeResult.rows[0].db_size_bytes) || 0;
                }
              } catch (sizeError) {
                console.warn(`Error getting real-time size for shard ${instance.id}, using metadata:`, sizeError);
                currentSize = metadata?.currentSize || 0;
              }
              return {
                instance,
                usage: currentSize,
                maxSize,
                utilizationPercent: currentSize / maxSize * 100,
                isActive,
                availableSpace: maxSize - currentSize
              };
            } catch (error) {
              console.warn(`Error fetching metadata for shard ${instance.id}:`, error);
              return {
                instance,
                usage: 0,
                maxSize: 524288e3,
                utilizationPercent: 0,
                isActive: true,
                availableSpace: 524288e3
              };
            }
          });
          const usageData = await Promise.all(usagePromises);
          const activeShards = usageData.filter(
            (data) => data.isActive && data.utilizationPercent < 95
            // Leave 5% buffer
          );
          if (activeShards.length === 0) {
            console.warn("All shards are full or inactive, using least full active shard");
            const leastFull = usageData.filter((data) => data.isActive).sort((a, b) => a.utilizationPercent - b.utilizationPercent)[0];
            return leastFull?.instance || this.instances[0];
          }
          const leastUsed = activeShards.sort((a, b) => b.availableSpace - a.availableSpace)[0];
          console.log(`Selected shard ${leastUsed.instance.id} with ${this.formatBytes(leastUsed.availableSpace)} available`);
          return leastUsed.instance;
        } catch (error) {
          console.warn("Error fetching DB usage, using round-robin:", error);
          return this.getInstanceForWrite();
        }
      }
      async executeOnAllInstances(queryFn) {
        const results = await Promise.allSettled(
          this.instances.map(async (instance) => {
            try {
              return await retryWithBackoff(
                () => queryFn(instance.db),
                3,
                1e3,
                `Query on instance ${instance.id}`
              );
            } catch (error) {
              console.error(`\u274C Database query failed on instance ${instance.id}:`, error);
              return [];
            }
          })
        );
        return results.filter((result) => result.status === "fulfilled").map((result) => result.value).flat();
      }
      async getInstanceForUser(userId) {
        for (const instance of this.instances) {
          try {
            const [user] = await retryWithBackoff(
              () => instance.db.select().from(users).where(eq(users.id, userId)).limit(1),
              3,
              1e3,
              `Find user ${userId} on instance ${instance.id}`
            );
            if (user) {
              return instance;
            }
          } catch (error) {
            console.warn(`Error checking user ${userId} on instance ${instance.id}:`, error);
          }
        }
        return null;
      }
      async updateShardMetadata(shardId, sizeChange) {
        const instance = this.instances.find((i) => i.id === shardId);
        if (!instance) return;
        try {
          const [existing] = await retryWithBackoff(
            () => instance.db.select().from(dbShardMetadata).where(eq(dbShardMetadata.shardId, shardId)).limit(1),
            3,
            1e3,
            `Select metadata for shard ${shardId}`
          );
          if (existing) {
            await retryWithBackoff(
              () => instance.db.update(dbShardMetadata).set({
                currentSize: Math.max(0, existing.currentSize + sizeChange),
                lastUpdated: /* @__PURE__ */ new Date()
              }).where(eq(dbShardMetadata.shardId, shardId)),
              3,
              1e3,
              `Update metadata for shard ${shardId}`
            );
          } else {
            await retryWithBackoff(
              () => instance.db.insert(dbShardMetadata).values({
                shardId,
                currentSize: Math.max(0, sizeChange),
                isActive: true,
                lastUpdated: /* @__PURE__ */ new Date()
              }).onConflictDoNothing(),
              3,
              1e3,
              `Insert metadata for shard ${shardId}`
            );
          }
        } catch (error) {
          console.error(`Error updating shard metadata for shard ${shardId}:`, error);
        }
      }
      async verifyCapacity(estimatedBytes) {
        if (this.instances.length === 0) {
          return { success: false, message: "No database connections available" };
        }
        try {
          const capacityChecks = await Promise.all(
            this.instances.map(async (instance) => {
              try {
                const [metadata] = await instance.db.select().from(dbShardMetadata).where(eq(dbShardMetadata.shardId, instance.id)).limit(1);
                const maxSize = metadata?.maxSize || 524288e3;
                const isActive = metadata?.isActive !== false;
                let currentSize = 0;
                try {
                  const sizeResult = await instance.pool.query(`
                SELECT pg_database_size(current_database()) as db_size_bytes
              `);
                  if (sizeResult.rows && sizeResult.rows.length > 0) {
                    currentSize = parseInt(sizeResult.rows[0].db_size_bytes) || 0;
                  }
                } catch (sizeError) {
                  console.warn(`Error getting real-time database size for shard ${instance.id}, using metadata:`, sizeError);
                  currentSize = metadata?.currentSize || 0;
                }
                const available = maxSize - currentSize;
                const utilizationPercent = currentSize / maxSize * 100;
                return {
                  shardId: instance.id,
                  currentSize,
                  maxSize,
                  available,
                  utilizationPercent,
                  isActive,
                  canFit: available >= estimatedBytes && isActive && utilizationPercent < 95,
                  fitWithBuffer: available >= estimatedBytes * 1.2
                  // 20% buffer for growth
                };
              } catch (error) {
                console.warn(`Error checking capacity for shard ${instance.id}:`, error);
                return {
                  shardId: instance.id,
                  currentSize: 0,
                  maxSize: 524288e3,
                  available: 524288e3,
                  utilizationPercent: 0,
                  isActive: true,
                  canFit: true,
                  fitWithBuffer: true
                };
              }
            })
          );
          const viableShards = capacityChecks.filter((check) => check.canFit);
          const bufferedShards = capacityChecks.filter((check) => check.fitWithBuffer);
          const recommendedShard = bufferedShards.length > 0 ? bufferedShards.sort((a, b) => b.available - a.available)[0] : viableShards.length > 0 ? viableShards.sort((a, b) => b.available - a.available)[0] : null;
          if (!recommendedShard) {
            const totalAvailable = capacityChecks.reduce((sum, check) => sum + check.available, 0);
            const activeShards = capacityChecks.filter((check) => check.isActive);
            return {
              success: false,
              message: `Insufficient database capacity. Need ${this.formatBytes(estimatedBytes)}, have ${this.formatBytes(totalAvailable)} available across ${activeShards.length} active shards`
            };
          }
          const bufferWarning = !bufferedShards.some((s) => s.shardId === recommendedShard.shardId) ? " (Warning: Low buffer space)" : "";
          return {
            success: true,
            message: `Sufficient capacity available on shard ${recommendedShard.shardId}${bufferWarning}`,
            recommendedShard: recommendedShard.shardId
          };
        } catch (error) {
          console.warn("Error checking database capacity:", error);
          return {
            success: false,
            message: `Capacity check failed: ${error instanceof Error ? error.message : "Unknown error"}`
          };
        }
      }
      formatBytes(bytes) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
      }
      getInstanceCount() {
        return this.instances.length;
      }
      getInstanceById(shardId) {
        return this.instances.find((instance) => instance.id === shardId);
      }
      async getBestInstanceForData(estimatedBytes) {
        const capacityCheck = await this.verifyCapacity(estimatedBytes);
        if (!capacityCheck.success) {
          throw new Error(capacityCheck.message);
        }
        if (capacityCheck.recommendedShard !== void 0) {
          const instance = this.getInstanceById(capacityCheck.recommendedShard);
          if (instance) {
            return instance;
          }
        }
        return this.getInstanceByLeastUsed();
      }
      async initializeShardMetadata() {
        console.log("Initializing shard metadata...");
        for (const instance of this.instances) {
          try {
            const [existing] = await retryWithBackoff(
              () => instance.db.select().from(dbShardMetadata).where(eq(dbShardMetadata.shardId, instance.id)).limit(1),
              3,
              1e3,
              `Check metadata for shard ${instance.id}`
            );
            if (!existing) {
              await retryWithBackoff(
                () => instance.db.insert(dbShardMetadata).values({
                  shardId: instance.id,
                  currentSize: 0,
                  maxSize: 524288e3,
                  // 500MB
                  isActive: true,
                  lastUpdated: /* @__PURE__ */ new Date()
                }).onConflictDoNothing(),
                3,
                1e3,
                `Insert metadata for shard ${instance.id}`
              );
              console.log(`Initialized metadata for shard ${instance.id}`);
            } else {
              console.log(`Shard ${instance.id} metadata already exists - size: ${this.formatBytes(existing.currentSize)}`);
            }
          } catch (error) {
            console.error(`Error initializing metadata for shard ${instance.id}:`, error);
          }
        }
      }
      async getShardStatistics() {
        const stats = await Promise.all(
          this.instances.map(async (instance) => {
            try {
              const [metadata] = await retryWithBackoff(
                () => instance.db.select().from(dbShardMetadata).where(eq(dbShardMetadata.shardId, instance.id)).limit(1),
                3,
                1e3,
                `Get metadata for shard ${instance.id}`
              );
              const maxSize = metadata?.maxSize || 524288e3;
              const isActive = metadata?.isActive !== false;
              let currentSize = 0;
              try {
                const sizeResult = await retryWithBackoff(
                  () => instance.pool.query(`
                SELECT 
                  pg_database_size(current_database()) as db_size_bytes,
                  current_database() as db_name
              `),
                  3,
                  1e3,
                  `Get size for shard ${instance.id}`
                );
                if (sizeResult.rows && sizeResult.rows.length > 0) {
                  currentSize = parseInt(sizeResult.rows[0].db_size_bytes) || 0;
                }
              } catch (sizeError) {
                console.error(`Error getting database size for shard ${instance.id}:`, sizeError);
                currentSize = metadata?.currentSize || 0;
              }
              return {
                shardId: instance.id,
                currentSize,
                maxSize,
                utilizationPercent: currentSize / maxSize * 100,
                isActive,
                availableSpace: maxSize - currentSize
              };
            } catch (error) {
              console.error(`Error getting shard statistics for shard ${instance.id}:`, error);
              return {
                shardId: instance.id,
                currentSize: 0,
                maxSize: 524288e3,
                utilizationPercent: 0,
                isActive: true,
                availableSpace: 524288e3
              };
            }
          })
        );
        return stats;
      }
      async rebalanceShards() {
        try {
          const stats = await this.getShardStatistics();
          const overUtilizedShards = stats.filter((stat) => stat.utilizationPercent > 85);
          const underUtilizedShards = stats.filter((stat) => stat.utilizationPercent < 50 && stat.isActive);
          if (overUtilizedShards.length === 0) {
            return {
              success: true,
              message: "No shards require rebalancing"
            };
          }
          if (underUtilizedShards.length === 0) {
            return {
              success: false,
              message: "No available shards for rebalancing"
            };
          }
          let totalMoved = 0;
          console.log(`Rebalancing needed: ${overUtilizedShards.length} over-utilized shards`);
          console.log(`Available targets: ${underUtilizedShards.length} under-utilized shards`);
          return {
            success: true,
            message: `Rebalancing analysis complete. ${overUtilizedShards.length} shards over 85% capacity, ${underUtilizedShards.length} shards available for migration`,
            movedRecords: totalMoved
          };
        } catch (error) {
          return {
            success: false,
            message: `Rebalancing failed: ${error instanceof Error ? error.message : "Unknown error"}`
          };
        }
      }
      async optimizeShardSelection() {
        try {
          const stats = await this.getShardStatistics();
          console.log("\n\u{1F4CA} Database Shard Status:");
          stats.forEach((stat) => {
            const status = stat.utilizationPercent > 90 ? "\u{1F534} CRITICAL" : stat.utilizationPercent > 75 ? "\u{1F7E1} WARNING" : stat.utilizationPercent > 50 ? "\u{1F7E2} GOOD" : "\u{1F535} LIGHT";
            console.log(`  Shard ${stat.shardId}: ${status} ${stat.utilizationPercent.toFixed(1)}% (${this.formatBytes(stat.currentSize)}/${this.formatBytes(stat.maxSize)})`);
          });
          for (const stat of stats) {
            if (stat.utilizationPercent > 95 && stat.isActive) {
              console.log(`\u26A0\uFE0F  Marking shard ${stat.shardId} as inactive (${stat.utilizationPercent.toFixed(1)}% full)`);
              const instance = this.getInstanceById(stat.shardId);
              if (instance) {
                await retryWithBackoff(
                  () => instance.db.update(dbShardMetadata).set({ isActive: false, lastUpdated: /* @__PURE__ */ new Date() }).where(eq(dbShardMetadata.shardId, stat.shardId)),
                  3,
                  1e3,
                  `Deactivate shard ${stat.shardId}`
                );
              }
            } else if (stat.utilizationPercent < 80 && !stat.isActive) {
              console.log(`\u2705 Reactivating shard ${stat.shardId} (${stat.utilizationPercent.toFixed(1)}% full)`);
              const instance = this.getInstanceById(stat.shardId);
              if (instance) {
                await retryWithBackoff(
                  () => instance.db.update(dbShardMetadata).set({ isActive: true, lastUpdated: /* @__PURE__ */ new Date() }).where(eq(dbShardMetadata.shardId, stat.shardId)),
                  3,
                  1e3,
                  `Reactivate shard ${stat.shardId}`
                );
              }
            }
          }
        } catch (error) {
          console.error("Error optimizing shard selection:", error);
        }
      }
      /**
       * Update file chunk record with upload completion details
       */
      async updateFileChunk(chunkData) {
        try {
          const instance = this.getInstanceForWrite();
          if (!globalThis.chunkTracker) {
            globalThis.chunkTracker = /* @__PURE__ */ new Map();
          }
          const chunkKey = `${chunkData.fileId}_${chunkData.chunkIndex}`;
          globalThis.chunkTracker.set(chunkKey, {
            ...chunkData,
            updatedAt: /* @__PURE__ */ new Date()
          });
          console.log(`\u{1F4BE} Updated chunk ${chunkData.chunkIndex} for file ${chunkData.fileId}`);
        } catch (error) {
          console.error(`\u274C Failed to update file chunk:`, error.message);
          throw error;
        }
      }
      /**
       * Mark a file chunk as failed
       */
      async markChunkFailed(chunkData) {
        try {
          const instance = this.getInstanceForWrite();
          if (!globalThis.chunkTracker) {
            globalThis.chunkTracker = /* @__PURE__ */ new Map();
          }
          const chunkKey = `${chunkData.fileId}_${chunkData.chunkIndex}`;
          const existingChunk = globalThis.chunkTracker.get(chunkKey);
          globalThis.chunkTracker.set(chunkKey, {
            ...existingChunk,
            fileId: chunkData.fileId,
            chunkIndex: chunkData.chunkIndex,
            status: "failed",
            errorMessage: chunkData.errorMessage,
            attempts: chunkData.attempts,
            updatedAt: /* @__PURE__ */ new Date()
          });
          console.log(`\u274C Marked chunk ${chunkData.chunkIndex} as failed for file ${chunkData.fileId}`);
        } catch (error) {
          console.log(`\u274C Failed to mark chunk as failed:`, error.message);
          throw error;
        }
      }
      async checkHealth() {
        const results = await Promise.allSettled(
          this.instances.map(async (instance) => {
            try {
              await retryWithBackoff(
                () => instance.pool.query("SELECT 1"),
                2,
                500,
                `Health check for instance ${instance.id}`
              );
              return { instanceId: instance.id, healthy: true };
            } catch (error) {
              console.warn(`Health check failed for instance ${instance.id}:`, error);
              return { instanceId: instance.id, healthy: false, error: error instanceof Error ? error.message : "Unknown error" };
            }
          })
        );
        const details = results.map(
          (result) => result.status === "fulfilled" ? result.value : { instanceId: -1, healthy: false, error: "Promise rejected" }
        );
        const healthy = details.every((detail) => detail.healthy);
        return { healthy, details };
      }
    };
    dbManager = new DatabaseManager();
    db = dbManager.getPrimaryInstance().db;
    pool = dbManager.getPrimaryInstance().pool;
  }
});

// server/dropbox-manager.ts
import { Dropbox } from "dropbox";
import crypto from "crypto";
var DropboxManager, dropboxManager;
var init_dropbox_manager = __esm({
  "server/dropbox-manager.ts"() {
    DropboxManager = class {
      accounts = [];
      clients = /* @__PURE__ */ new Map();
      CHUNK_SIZE = 4 * 1024 * 1024;
      // 4MB chunks
      MAX_RETRIES = 3;
      currentAccountIndex = 0;
      reservations = /* @__PURE__ */ new Map();
      // Active reservations
      RESERVATION_TTL = 5 * 60 * 1e3;
      // 5 minutes
      accountLocks = /* @__PURE__ */ new Map();
      // Prevent concurrent modifications
      // Default retry configuration (can be overridden by environment variables)
      DEFAULT_RETRY_CONFIG = {
        maxRetries: parseInt(process.env.DROPBOX_RETRY_MAX || "5"),
        waitForAvailability: (process.env.DROPBOX_WAIT_FOR_AVAILABILITY || "true") === "true",
        waitTimeoutMs: parseInt(process.env.DROPBOX_WAIT_TIMEOUT_MS || "300000"),
        // 5 minutes default
        exponentialBackoff: (process.env.DROPBOX_EXPONENTIAL_BACKOFF || "true") === "true"
      };
      constructor() {
        this.initializeAccounts();
      }
      initializeAccounts() {
        const appKeys = (process.env.DROPBOX_APP_KEY || "").split(",").map((k) => k.trim()).filter(Boolean);
        const appSecrets = (process.env.DROPBOX_APP_SECRET || "").split(",").map((s) => s.trim()).filter(Boolean);
        const refreshTokens = (process.env.DROPBOX_REFRESH_TOKEN || "").split(",").map((t) => t.trim()).filter(Boolean);
        if (appKeys.length !== appSecrets.length || appKeys.length !== refreshTokens.length) {
          console.warn("Dropbox credential arrays have mismatched lengths");
          const minLength = Math.min(appKeys.length, appSecrets.length, refreshTokens.length);
          appKeys.length = minLength;
          appSecrets.length = minLength;
          refreshTokens.length = minLength;
        }
        if (appKeys.length === 0) {
          console.warn("No Dropbox accounts configured. File uploads will fail.");
          return;
        }
        const maxSizeBytes = 1.8 * 1024 * 1024 * 1024;
        this.accounts = appKeys.map((appKey, index) => ({
          id: index,
          appKey,
          appSecret: appSecrets[index],
          refreshToken: refreshTokens[index],
          maxSizeBytes,
          currentSizeBytes: 0,
          reservedBytes: 0
        }));
        this.accounts.forEach((account) => {
          const dbx = new Dropbox({
            clientId: account.appKey,
            clientSecret: account.appSecret,
            refreshToken: account.refreshToken
          });
          this.clients.set(account.id, dbx);
        });
        console.log(`Initialized ${this.accounts.length} Dropbox accounts for distributed file storage`);
        this.fetchActualUsage();
        this.startReservationCleanup();
      }
      async fetchActualUsage() {
        for (const account of this.accounts) {
          try {
            const client = this.clients.get(account.id);
            if (client) {
              const spaceUsage = await client.usersGetSpaceUsage();
              if (spaceUsage && spaceUsage.result && "used" in spaceUsage.result) {
                account.currentSizeBytes = spaceUsage.result.used || 0;
                console.log(`Dropbox account ${account.id}: ${this.formatBytes(account.currentSizeBytes)} / ${this.formatBytes(account.maxSizeBytes)}`);
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch space usage for Dropbox account ${account.id}:`, error);
          }
        }
      }
      getAccountCount() {
        return this.accounts.length;
      }
      startReservationCleanup() {
        setInterval(() => {
          this.cleanupExpiredReservations();
        }, 60 * 1e3);
      }
      cleanupExpiredReservations() {
        const now = Date.now();
        const expired = Array.from(this.reservations.entries()).filter(([_, reservation]) => reservation.expiresAt <= now);
        for (const [id, reservation] of expired) {
          console.log(`Cleaning up expired reservation ${id} for ${this.formatBytes(reservation.bytes)} on account ${reservation.accountId}`);
          const account = this.accounts.find((a) => a.id === reservation.accountId);
          if (account) {
            account.reservedBytes = Math.max(0, account.reservedBytes - reservation.bytes);
          }
          this.reservations.delete(id);
        }
        if (expired.length > 0) {
          console.log(`Cleaned up ${expired.length} expired reservations`);
        }
      }
      async waitForStorageAvailability(bytes, timeoutMs = 3e5) {
        const startTime = Date.now();
        const checkInterval = 5e3;
        while (Date.now() - startTime < timeoutMs) {
          this.cleanupExpiredReservations();
          let availableAccount = null;
          for (const account of this.accounts) {
            const totalUsed = account.currentSizeBytes + account.reservedBytes;
            const available = account.maxSizeBytes - totalUsed;
            if (available >= bytes) {
              availableAccount = account;
              break;
            }
          }
          if (availableAccount) {
            console.log(`\u2705 Storage became available on account ${availableAccount.id} after waiting ${Date.now() - startTime}ms`);
            return true;
          }
          const timeWaited = Date.now() - startTime;
          const timeRemaining = timeoutMs - timeWaited;
          console.log(`\u23F3 Waiting for ${this.formatBytes(bytes)} storage... (${Math.round(timeWaited / 1e3)}s elapsed, ${Math.round(timeRemaining / 1e3)}s remaining)`);
          await new Promise((resolve) => setTimeout(resolve, checkInterval));
        }
        console.log(`\u26A0\uFE0F Timeout waiting for ${this.formatBytes(bytes)} storage after ${timeoutMs / 1e3}s`);
        return false;
      }
      generateReservationId() {
        return crypto.randomBytes(16).toString("hex");
      }
      async acquireAccountLock(accountId) {
        const existingLock = this.accountLocks.get(accountId);
        if (existingLock) {
          await existingLock;
        }
        let resolveLock;
        const lockPromise = new Promise((resolve) => {
          resolveLock = resolve;
        });
        this.accountLocks.set(accountId, lockPromise);
        return () => {
          resolveLock();
          this.accountLocks.delete(accountId);
        };
      }
      async reserveStorageWithRetry(bytes, options = {}) {
        const {
          maxRetries = 5,
          waitForAvailability = true,
          waitTimeoutMs = 3e5,
          // 5 minutes
          exponentialBackoff = true
        } = options;
        let lastError = "";
        let totalWaitTime = 0;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const result = await this.reserveStorage(bytes);
            if (result.success) {
              if (attempt > 0) {
                console.log(`\u2705 Storage reservation succeeded on attempt ${attempt + 1} after ${totalWaitTime}ms total wait time`);
              }
              const finalResult = {
                ...result,
                retriesUsed: attempt,
                waitTimeUsed: totalWaitTime
              };
              console.log(`\u{1F4CB} Reservation success details: accountId=${finalResult.accountId}, reservationId=${finalResult.reservationId}, success=${finalResult.success}`);
              return finalResult;
            }
            lastError = result.message;
            if (attempt === maxRetries) {
              break;
            }
            console.log(`\u{1F4E6} Storage reservation failed (attempt ${attempt + 1}/${maxRetries + 1})`);
            console.log(`   Reason: ${result.message}`);
            if (waitForAvailability && result.message.includes("Insufficient storage")) {
              console.log(`\u23F3 Waiting for storage to become available...`);
              const waitStart = Date.now();
              const storageAvailable = await this.waitForStorageAvailability(bytes, Math.min(waitTimeoutMs, 6e4));
              const waitDuration = Date.now() - waitStart;
              totalWaitTime += waitDuration;
              if (storageAvailable) {
                console.log(`\u2705 Storage became available, retrying immediately...`);
                continue;
              } else {
                console.log(`\u26A0\uFE0F Storage did not become available within timeout, using exponential backoff...`);
              }
            }
            let delay = 1e3;
            if (exponentialBackoff) {
              delay = Math.min(1e3 * Math.pow(2, attempt), 16e3);
            }
            console.log(`   Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            totalWaitTime += delay;
            this.cleanupExpiredReservations();
          } catch (error) {
            lastError = error.message;
            console.error(`\u274C Storage reservation error on attempt ${attempt + 1}:`, error.message);
            if (attempt === maxRetries) {
              break;
            }
            const delay = exponentialBackoff ? Math.min(1e3 * Math.pow(2, attempt), 16e3) : 2e3;
            await new Promise((resolve) => setTimeout(resolve, delay));
            totalWaitTime += delay;
          }
        }
        return {
          success: false,
          message: `Failed to reserve storage after ${maxRetries + 1} attempts and ${Math.round(totalWaitTime / 1e3)}s total wait time. Last error: ${lastError}`,
          retriesUsed: maxRetries + 1,
          waitTimeUsed: totalWaitTime
        };
      }
      async reserveStorage(bytes) {
        this.cleanupExpiredReservations();
        const candidateAccounts = this.accounts.map((account) => {
          const totalUsed = account.currentSizeBytes + account.reservedBytes;
          const available = account.maxSizeBytes - totalUsed;
          return { account, available };
        }).filter((item) => item.available >= bytes).sort((a, b) => b.available - a.available);
        if (candidateAccounts.length === 0) {
          const totalAvailable = this.accounts.reduce((sum, acc) => {
            const totalUsed = acc.currentSizeBytes + acc.reservedBytes;
            return sum + Math.max(0, acc.maxSizeBytes - totalUsed);
          }, 0);
          console.log(`\u{1F4CA} Storage Status Summary:`);
          this.accounts.forEach((acc, index) => {
            const totalUsed = acc.currentSizeBytes + acc.reservedBytes;
            const available = acc.maxSizeBytes - totalUsed;
            const percentUsed = (totalUsed / acc.maxSizeBytes * 100).toFixed(1);
            console.log(`   Account ${index}: ${this.formatBytes(available)} available (${percentUsed}% used)`);
          });
          return {
            success: false,
            message: `Insufficient storage: need ${this.formatBytes(bytes)}, have ${this.formatBytes(totalAvailable)} available across all accounts. Consider cleaning up old files or adding more Dropbox accounts.`
          };
        }
        for (const { account } of candidateAccounts) {
          const releaseLock = await this.acquireAccountLock(account.id);
          try {
            const totalUsed = account.currentSizeBytes + account.reservedBytes;
            const available = account.maxSizeBytes - totalUsed;
            if (available < bytes) {
              console.log(`\u26A0\uFE0F Account ${account.id} no longer has sufficient space after lock acquisition, trying next...`);
              continue;
            }
            const reservationId = this.generateReservationId();
            const now = Date.now();
            const reservation = {
              id: reservationId,
              accountId: account.id,
              bytes,
              timestamp: now,
              expiresAt: now + this.RESERVATION_TTL
            };
            account.reservedBytes += bytes;
            this.reservations.set(reservationId, reservation);
            console.log(`Reserved ${this.formatBytes(bytes)} on account ${account.id} (reservation: ${reservationId})`);
            return {
              success: true,
              reservationId,
              accountId: account.id,
              message: `Reserved ${this.formatBytes(bytes)} on account ${account.id}`
            };
          } finally {
            releaseLock();
          }
        }
        return {
          success: false,
          message: `Failed to reserve storage: all accounts with sufficient space became unavailable during lock acquisition`
        };
      }
      async confirmReservation(reservationId, actualBytes) {
        const reservation = this.reservations.get(reservationId);
        if (!reservation) {
          return {
            success: false,
            message: `Reservation ${reservationId} not found or expired`
          };
        }
        if (Date.now() > reservation.expiresAt) {
          this.cleanupExpiredReservations();
          return {
            success: false,
            message: `Reservation ${reservationId} has expired`
          };
        }
        const account = this.accounts.find((a) => a.id === reservation.accountId);
        if (!account) {
          return {
            success: false,
            message: `Account ${reservation.accountId} not found`
          };
        }
        const releaseLock = await this.acquireAccountLock(account.id);
        try {
          account.reservedBytes = Math.max(0, account.reservedBytes - reservation.bytes);
          account.currentSizeBytes += actualBytes;
          this.reservations.delete(reservationId);
          console.log(`Confirmed reservation ${reservationId}: ${this.formatBytes(actualBytes)} now used on account ${account.id}`);
          return {
            success: true,
            message: `Confirmed upload of ${this.formatBytes(actualBytes)} to account ${account.id}`
          };
        } finally {
          releaseLock();
        }
      }
      async cancelReservation(reservationId) {
        const reservation = this.reservations.get(reservationId);
        if (!reservation) {
          return {
            success: true,
            // Already gone, that's fine
            message: `Reservation ${reservationId} not found (may have already expired)`
          };
        }
        const account = this.accounts.find((a) => a.id === reservation.accountId);
        if (account) {
          const releaseLock = await this.acquireAccountLock(account.id);
          try {
            account.reservedBytes = Math.max(0, account.reservedBytes - reservation.bytes);
            console.log(`Cancelled reservation ${reservationId}: released ${this.formatBytes(reservation.bytes)} on account ${account.id}`);
          } finally {
            releaseLock();
          }
        }
        this.reservations.delete(reservationId);
        return {
          success: true,
          message: `Cancelled reservation ${reservationId}`
        };
      }
      findBestAccount(requiredBytes) {
        if (this.accounts.length === 0) return null;
        this.cleanupExpiredReservations();
        const availableAccounts = this.accounts.filter((account) => {
          const totalUsed = account.currentSizeBytes + account.reservedBytes;
          return account.maxSizeBytes - totalUsed >= requiredBytes;
        }).sort((a, b) => {
          const aUsed = a.currentSizeBytes + a.reservedBytes;
          const bUsed = b.currentSizeBytes + b.reservedBytes;
          return aUsed - bUsed;
        });
        return availableAccounts.length > 0 ? availableAccounts[0].id : null;
      }
      findBestAccountWithReservation(requiredBytes) {
        return this.reserveStorage(requiredBytes);
      }
      getNextAccountRoundRobin() {
        if (this.accounts.length === 0) return null;
        const accountId = this.currentAccountIndex;
        this.currentAccountIndex = (this.currentAccountIndex + 1) % this.accounts.length;
        return accountId;
      }
      async verifyCapacity(totalBytesNeeded) {
        if (this.accounts.length === 0) {
          return { success: false, message: "No Dropbox accounts configured" };
        }
        this.cleanupExpiredReservations();
        const chunkSize = this.CHUNK_SIZE;
        const numChunks = Math.ceil(totalBytesNeeded / chunkSize);
        const simulatedUsage = /* @__PURE__ */ new Map();
        this.accounts.forEach((acc) => {
          const totalUsed = acc.currentSizeBytes + acc.reservedBytes;
          simulatedUsage.set(acc.id, totalUsed);
        });
        const requiredAccounts = /* @__PURE__ */ new Set();
        const simulatedReservations = [];
        for (let i = 0; i < numChunks; i++) {
          const chunkBytes = Math.min(chunkSize, totalBytesNeeded - i * chunkSize);
          let allocatedAccountId = null;
          let minUsage = Infinity;
          for (const account of this.accounts) {
            const simulated = simulatedUsage.get(account.id) || 0;
            const available = account.maxSizeBytes - simulated;
            if (available >= chunkBytes && simulated < minUsage) {
              minUsage = simulated;
              allocatedAccountId = account.id;
            }
          }
          if (allocatedAccountId === null) {
            const totalAvailable = Array.from(simulatedUsage.entries()).reduce((sum, [id, used]) => {
              const account = this.accounts.find((a) => a.id === id);
              return sum + (account ? account.maxSizeBytes - used : 0);
            }, 0);
            for (const reservationId of simulatedReservations) {
              await this.cancelReservation(reservationId);
            }
            return {
              success: false,
              message: `Insufficient storage space at chunk ${i + 1}/${numChunks}. Need ${this.formatBytes(totalBytesNeeded)}, have ${this.formatBytes(totalAvailable)} available`
            };
          }
          simulatedUsage.set(allocatedAccountId, (simulatedUsage.get(allocatedAccountId) || 0) + chunkBytes);
          requiredAccounts.add(allocatedAccountId);
        }
        return {
          success: true,
          message: `File can be distributed across ${requiredAccounts.size} Dropbox account(s)`
        };
      }
      async verifyCapacityWithReservations(totalBytesNeeded) {
        if (this.accounts.length === 0) {
          return { success: false, message: "No Dropbox accounts configured" };
        }
        const chunkSize = this.CHUNK_SIZE;
        const numChunks = Math.ceil(totalBytesNeeded / chunkSize);
        const reservationIds = [];
        try {
          for (let i = 0; i < numChunks; i++) {
            const chunkBytes = Math.min(chunkSize, totalBytesNeeded - i * chunkSize);
            const reservation = await this.reserveStorage(chunkBytes);
            if (!reservation.success) {
              for (const id of reservationIds) {
                await this.cancelReservation(id);
              }
              return {
                success: false,
                message: `Failed to reserve space for chunk ${i + 1}/${numChunks}: ${reservation.message}`
              };
            }
            reservationIds.push(reservation.reservationId);
          }
          return {
            success: true,
            message: `Successfully reserved space for ${numChunks} chunks across multiple accounts`,
            reservationIds
          };
        } catch (error) {
          for (const id of reservationIds) {
            await this.cancelReservation(id);
          }
          throw error;
        }
      }
      getClient(accountId) {
        return this.clients.get(accountId);
      }
      computeChecksum(buffer) {
        return crypto.createHash("sha256").update(buffer).digest("hex");
      }
      async uploadChunkWithRetry(accountId, chunkData, filePath, reservationId, retryCount = 0) {
        const client = this.getClient(accountId);
        if (!client) {
          throw new Error(`Dropbox account ${accountId} not found`);
        }
        const checksum = this.computeChecksum(chunkData);
        try {
          const response = await client.filesUpload({
            path: filePath,
            contents: chunkData,
            mode: { ".tag": "add" },
            autorename: true
          });
          const verifyResponse = await client.filesGetMetadata({ path: response.result.path_lower || filePath });
          if ("size" in verifyResponse.result && verifyResponse.result.size !== chunkData.length) {
            throw new Error("Uploaded file size mismatch");
          }
          if (reservationId) {
            const confirmResult = await this.confirmReservation(reservationId, chunkData.length);
            if (!confirmResult.success) {
              console.warn(`Failed to confirm reservation ${reservationId}: ${confirmResult.message}`);
              this.updateAccountUsage(accountId, chunkData.length);
            }
          } else {
            this.updateAccountUsage(accountId, chunkData.length);
          }
          const downloadUrl = await this.createPermanentDownloadUrl(accountId, response.result.path_display || filePath);
          return {
            dropboxFileId: response.result.id,
            dropboxPath: response.result.path_display || filePath,
            downloadUrl,
            checksum
          };
        } catch (error) {
          console.error(`Dropbox upload error (attempt ${retryCount + 1}/${this.MAX_RETRIES}):`, error);
          if (retryCount < this.MAX_RETRIES - 1) {
            const delay = Math.pow(2, retryCount) * 1e3;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return this.uploadChunkWithRetry(accountId, chunkData, filePath, reservationId, retryCount + 1);
          }
          throw new Error(`Failed to upload chunk after ${this.MAX_RETRIES} attempts`);
        }
      }
      async downloadChunk(accountId, path9) {
        const client = this.getClient(accountId);
        if (!client) {
          throw new Error(`Dropbox account ${accountId} not found`);
        }
        const normalizedPath = path9.startsWith("/") ? path9 : `/${path9}`;
        try {
          const response = await client.filesDownload({ path: normalizedPath });
          if ("fileBinary" in response.result && response.result.fileBinary) {
            return Buffer.from(response.result.fileBinary);
          }
          throw new Error("No file data in response");
        } catch (error) {
          console.error("Dropbox download error:", error);
          throw new Error("Failed to download chunk from Dropbox");
        }
      }
      async getTemporaryLink(accountId, path9) {
        const client = this.getClient(accountId);
        if (!client) {
          throw new Error(`Dropbox account ${accountId} not found`);
        }
        const normalizedPath = path9.startsWith("/") ? path9 : `/${path9}`;
        try {
          const response = await client.filesGetTemporaryLink({ path: normalizedPath });
          return response.result.link;
        } catch (error) {
          console.error("Dropbox getTemporaryLink error:", error);
          throw new Error("Failed to get temporary link from Dropbox");
        }
      }
      async deleteChunk(accountId, path9) {
        const client = this.getClient(accountId);
        if (!client) {
          console.warn(`Dropbox account ${accountId} not found for deletion`);
          return;
        }
        const normalizedPath = path9.startsWith("/") ? path9 : `/${path9}`;
        try {
          await client.filesDeleteV2({ path: normalizedPath });
        } catch (error) {
          try {
            const errAny = error;
            const status = errAny?.status;
            const summary = errAny?.error?.error_summary || errAny?.error_summary || "";
            if (status === 409 && /path_lookup\/not_found/i.test(summary)) {
              console.log(`Dropbox delete: path not found (already deleted): ${path9}`);
              return;
            }
            if (status === 429 || status >= 500 && status < 600) {
              for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
                const delay = Math.pow(2, attempt) * 250;
                await new Promise((resolve) => setTimeout(resolve, delay));
                try {
                  await client.filesDeleteV2({ path: normalizedPath });
                  return;
                } catch (retryErr) {
                  if (attempt === this.MAX_RETRIES) {
                    console.error(`Dropbox delete error after ${this.MAX_RETRIES} attempts:`, retryErr);
                  }
                }
              }
              return;
            }
            console.error("Dropbox delete error:", error);
          } catch (innerErr) {
            console.error("Dropbox delete error (unexpected shape):", error, innerErr);
          }
        }
      }
      updateAccountUsage(accountId, sizeChange) {
        const account = this.accounts.find((a) => a.id === accountId);
        if (account) {
          account.currentSizeBytes = Math.max(0, account.currentSizeBytes + sizeChange);
        }
      }
      async uploadChunkStreaming(chunkData, chunkIndex, checksum, originalName) {
        const accountId = this.getNextAccountRoundRobin();
        if (accountId === null) {
          throw new Error("No Dropbox accounts available");
        }
        const filePath = `/forums/streaming/${originalName}/chunk_${chunkIndex}`;
        const result = await this.uploadChunkWithRetry(accountId, chunkData, filePath);
        return {
          ...result,
          accountId
        };
      }
      getChunkSize() {
        return this.CHUNK_SIZE;
      }
      getAllAccounts() {
        return this.accounts;
      }
      getAccountStatusWithReservations() {
        this.cleanupExpiredReservations();
        return this.accounts.map((account) => {
          const totalUsed = account.currentSizeBytes + account.reservedBytes;
          const available = Math.max(0, account.maxSizeBytes - totalUsed);
          const utilizationPercent = totalUsed / account.maxSizeBytes * 100;
          const reservationCount = Array.from(this.reservations.values()).filter((r) => r.accountId === account.id).length;
          return {
            id: account.id,
            currentSizeBytes: account.currentSizeBytes,
            reservedBytes: account.reservedBytes,
            maxSizeBytes: account.maxSizeBytes,
            availableBytes: available,
            utilizationPercent,
            reservationCount
          };
        });
      }
      getReservationInfo(reservationId) {
        return this.reservations.get(reservationId) || null;
      }
      getAllActiveReservations() {
        this.cleanupExpiredReservations();
        return Array.from(this.reservations.values());
      }
      /**
       * Create a permanent download URL for a file in Dropbox using shared link method
       */
      async createPermanentDownloadUrl(accountId, filePath) {
        const client = this.getClient(accountId);
        if (!client) {
          throw new Error(`Dropbox account ${accountId} not found`);
        }
        try {
          const response = await client.sharingCreateSharedLinkWithSettings({
            path: filePath,
            settings: {
              requested_visibility: { ".tag": "public" },
              audience: { ".tag": "public" },
              access: { ".tag": "viewer" }
            }
          });
          if (response.result && response.result.url) {
            let downloadUrl = response.result.url.replace("dl=0", "dl=1");
            downloadUrl = downloadUrl.replace("www.dropbox.com", "dl.dropboxusercontent.com");
            console.log(`\u{1F4CB} Generated permanent shared link for account ${accountId}: ${downloadUrl.substring(0, 80)}...`);
            return downloadUrl;
          }
          throw new Error("Could not generate shared link");
        } catch (error) {
          if (error?.error?.error?.[".tag"] === "shared_link_already_exists") {
            try {
              const listResponse = await client.sharingListSharedLinks({
                path: filePath,
                direct_only: true
              });
              if (listResponse.result.links.length > 0) {
                let downloadUrl = listResponse.result.links[0].url.replace("dl=0", "dl=1");
                downloadUrl = downloadUrl.replace("www.dropbox.com", "dl.dropboxusercontent.com");
                console.log(`\u{1F4CB} Retrieved existing shared link for account ${accountId}: ${downloadUrl.substring(0, 80)}...`);
                return downloadUrl;
              }
            } catch (listError) {
              console.error(`Failed to list existing shared links for account ${accountId}:`, listError);
            }
          }
          console.error(`Failed to create permanent download URL for account ${accountId}:`, error);
          try {
            const tempLinkResponse = await client.filesGetTemporaryLink({ path: filePath });
            if (tempLinkResponse.result && tempLinkResponse.result.link) {
              const tempLink = tempLinkResponse.result.link;
              console.log(`\u{1F4CB} Using temporary link (fallback) for account ${accountId}: ${filePath}`);
              return tempLink;
            }
          } catch (tempError) {
            console.error(`Failed to create temporary link fallback for account ${accountId}:`, tempError);
          }
          const encodedPath = encodeURIComponent(filePath);
          const fallbackUrl = `https://www.dropbox.com/s/fallback${Date.now()}${accountId}/${encodedPath}?dl=1`;
          console.log(`\u{1F4CB} Using constructed fallback URL for account ${accountId}: ${fallbackUrl}`);
          return fallbackUrl;
        }
      }
      formatBytes(bytes) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
      }
    };
    dropboxManager = new DropboxManager();
  }
});

// server/storage.ts
import session from "express-session";
import connectPg from "connect-pg-simple";
import fs from "fs";
import path from "path";
import { eq as eq2, and, desc, sql as sql2, inArray, or, ilike, exists, isNotNull } from "drizzle-orm";
var PostgresSessionStore, DatabaseStorage, storage;
var init_storage = __esm({
  "server/storage.ts"() {
    init_schema();
    init_db();
    init_dropbox_manager();
    PostgresSessionStore = connectPg(session);
    DatabaseStorage = class {
      sessionStore;
      constructor() {
        this.sessionStore = new PostgresSessionStore({
          pool,
          createTableIfMissing: true,
          errorLog: (err) => {
            console.error("\u{1F534} Session Store Database Error:", {
              message: err.message,
              stack: err.stack,
              code: err.code,
              errno: err.errno,
              syscall: err.syscall,
              hostname: err.hostname,
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              process: {
                pid: process.pid,
                memory: process.memoryUsage(),
                uptime: process.uptime()
              }
            });
          }
        });
      }
      // Helper method to find the shard where a user exists
      async findUserShard(userId) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            const [user] = await instance.db.select().from(users).where(eq2(users.id, userId)).limit(1);
            if (user) {
              return { instance, user };
            }
          } catch (error) {
            console.error(`Error checking user in shard ${instance.id}:`, error);
            continue;
          }
        }
        throw new Error(`User ${userId} not found in any database shard`);
      }
      // Helper to ensure forum exists in target shard without creator dependency issues
      async ensureForumInShard(targetInstance, forumId, safeCreatorId) {
        try {
          const [existingForum] = await targetInstance.db.select().from(forums).where(eq2(forums.id, forumId)).limit(1);
          if (existingForum) return;
          const { forum: originalForum } = await this.findForumShard(forumId);
          await targetInstance.db.insert(forums).values({
            id: originalForum.id,
            name: originalForum.name,
            description: originalForum.description,
            isPublic: originalForum.isPublic,
            creatorId: safeCreatorId,
            // Use safe creator to prevent FK cascade
            metaTitle: originalForum.metaTitle,
            metaDescription: originalForum.metaDescription,
            keywords: originalForum.keywords,
            ogImage: originalForum.ogImage,
            createdAt: originalForum.createdAt
          }).onConflictDoNothing();
        } catch (error) {
          console.error(`Error ensuring forum in shard:`, error);
        }
      }
      // Helper to ensure user exists in target shard
      async ensureUserInShard(targetInstance, userId) {
        try {
          const [existingUser] = await targetInstance.db.select().from(users).where(eq2(users.id, userId)).limit(1);
          if (existingUser) return;
          const { user: originalUser } = await this.findUserShard(userId);
          await targetInstance.db.insert(users).values({
            id: originalUser.id,
            username: originalUser.username,
            email: originalUser.email,
            avatar: originalUser.avatar,
            createdAt: originalUser.createdAt
          }).onConflictDoNothing();
        } catch (error) {
          console.error(`Error ensuring user in shard:`, error);
        }
      }
      // Helper method to find the shard where a forum exists
      async findForumShard(forumId) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            const [forum] = await instance.db.select().from(forums).where(eq2(forums.id, forumId)).limit(1);
            if (forum) {
              return { instance, forum };
            }
          } catch (error) {
            console.error(`Error checking forum in shard ${instance.id}:`, error);
            continue;
          }
        }
        throw new Error(`Forum ${forumId} not found in any database shard`);
      }
      // Helper method to find the shard where a file exists
      async findFileShard(fileId) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            const [file] = await instance.db.select().from(files).where(eq2(files.id, fileId)).limit(1);
            if (file) {
              return { instance, file };
            }
          } catch (error) {
            console.error(`Error checking file in shard ${instance.id}:`, error);
            continue;
          }
        }
        throw new Error(`File ${fileId} not found in any database shard`);
      }
      // Helper method to handle cross-shard relationships intelligently
      async findShardForAccessRequest(userId, forumId) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            const [user2] = await instance.db.select().from(users).where(eq2(users.id, userId)).limit(1);
            const [forum2] = await instance.db.select().from(forums).where(eq2(forums.id, forumId)).limit(1);
            if (user2 && forum2) {
              return { instance, user: user2, forum: forum2 };
            }
          } catch (error) {
            console.error(`Error checking user and forum in shard ${instance.id}:`, error);
            continue;
          }
        }
        if (instances.length === 1) {
          const instance = instances[0];
          try {
            const [user2] = await instance.db.select().from(users).where(eq2(users.id, userId)).limit(1);
            const [forum2] = await instance.db.select().from(forums).where(eq2(forums.id, forumId)).limit(1);
            if (user2 && forum2) {
              return { instance, user: user2, forum: forum2 };
            } else {
              throw new Error(`User ${userId} or Forum ${forumId} not found in database`);
            }
          } catch (error) {
            console.error(`Error in single shard lookup:`, error);
            throw new Error(`Unable to find user ${userId} or forum ${forumId} in database`);
          }
        }
        let userInstance = null;
        let user = null;
        let forumInstance = null;
        let forum = null;
        for (const instance of instances) {
          try {
            if (!user) {
              const [foundUser] = await instance.db.select().from(users).where(eq2(users.id, userId)).limit(1);
              if (foundUser) {
                user = foundUser;
                userInstance = instance;
              }
            }
            if (!forum) {
              const [foundForum] = await instance.db.select().from(forums).where(eq2(forums.id, forumId)).limit(1);
              if (foundForum) {
                forum = foundForum;
                forumInstance = instance;
              }
            }
            if (user && forum) break;
          } catch (error) {
            console.error(`Error searching in shard ${instance.id}:`, error);
            continue;
          }
        }
        if (!user || !forum) {
          throw new Error(`User ${userId} or Forum ${forumId} not found in any database shard`);
        }
        return { instance: userInstance, user, forum };
      }
      async getUser(id) {
        try {
          if (!id || typeof id !== "string") {
            console.log(`\u26A0\uFE0F Invalid user ID provided to getUser: ${id}`);
            return void 0;
          }
          const allResults = await dbManager.executeOnAllInstances(async (database) => {
            try {
              const [user2] = await database.select().from(users).where(eq2(users.id, id));
              return user2 ? [user2] : [];
            } catch (dbError) {
              console.error(`\u274C Database error in getUser for ID ${id}:`, dbError);
              return [];
            }
          });
          const user = allResults[0] || void 0;
          if (user && !this.logThrottle) {
            this.logThrottle = /* @__PURE__ */ new Map();
          }
          if (user) {
            const lastLog = this.logThrottle?.get(`user-found-${user.id}`) || 0;
            if (Date.now() - lastLog > 3e4) {
              console.log(`\u2705 User found: ${user.username} (${user.id})`);
              this.logThrottle?.set(`user-found-${user.id}`, Date.now());
            }
          } else {
            console.log(`\u26A0\uFE0F No user found for ID: ${id}`);
          }
          return user;
        } catch (error) {
          console.error(`\u274C Error in getUser for ID ${id}:`, error);
          return void 0;
        }
      }
      async getUserByUsername(username) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          const [user] = await database.select().from(users).where(eq2(users.username, username));
          return user ? [user] : [];
        });
        return allResults[0] || void 0;
      }
      async getUserByEmail(email) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          const [user] = await database.select().from(users).where(eq2(users.email, email));
          return user ? [user] : [];
        });
        return allResults[0] || void 0;
      }
      async createUser(insertUser) {
        const estimatedSize = 500;
        const instance = await dbManager.getBestInstanceForData(estimatedSize);
        const [user] = await instance.db.insert(users).values(insertUser).returning();
        await dbManager.updateShardMetadata(instance.id, estimatedSize);
        return user;
      }
      async getForums() {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          return await database.select({
            id: forums.id,
            name: forums.name,
            description: forums.description,
            isPublic: forums.isPublic,
            creatorId: forums.creatorId,
            metaTitle: forums.metaTitle,
            metaDescription: forums.metaDescription,
            keywords: forums.keywords,
            ogImage: forums.ogImage,
            createdAt: forums.createdAt,
            creator: users
          }).from(forums).leftJoin(users, eq2(forums.creatorId, users.id));
        });
        const uniqueForumsMap = /* @__PURE__ */ new Map();
        allResults.filter((result) => result.creator !== null).forEach((result) => {
          if (!uniqueForumsMap.has(result.id)) {
            uniqueForumsMap.set(result.id, result);
          }
        });
        const results = Array.from(uniqueForumsMap.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const forumsWithMembers = await Promise.all(
          results.map(async (result) => {
            const memberCounts = await dbManager.executeOnAllInstances(async (database) => {
              const [count] = await database.select({ count: sql2`count(*)::int` }).from(forumMembers).where(eq2(forumMembers.forumId, result.id));
              return count ? [count.count || 0] : [0];
            });
            const totalCount = memberCounts.reduce((sum, count) => sum + count, 0);
            return {
              ...result,
              creator: result.creator,
              memberCount: totalCount
            };
          })
        );
        return forumsWithMembers;
      }
      async getForumById(id) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          const [forum] = await database.select().from(forums).where(eq2(forums.id, id));
          return forum ? [forum] : [];
        });
        return allResults[0] || void 0;
      }
      async createForum(insertForum, creatorId) {
        const userInstance = await dbManager.getInstanceForUser(creatorId);
        if (!userInstance) {
          throw new Error(`User ${creatorId} not found in any database instance`);
        }
        const existingForums = await dbManager.executeOnAllInstances(async (database) => {
          const [forum2] = await database.select().from(forums).where(eq2(forums.name, insertForum.name));
          return forum2 ? [forum2] : [];
        });
        if (existingForums.length > 0) {
          throw new Error(`Forum with name "${insertForum.name}" already exists`);
        }
        const estimatedSize = 1e3 + (insertForum.description?.length || 0) * 2;
        const [forum] = await userInstance.db.insert(forums).values({ ...insertForum, creatorId }).returning();
        await userInstance.db.insert(forumMembers).values({ forumId: forum.id, userId: creatorId });
        await dbManager.updateShardMetadata(userInstance.id, estimatedSize);
        return forum;
      }
      async getForumMembers(forumId) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          return await database.select({
            id: forumMembers.id,
            forumId: forumMembers.forumId,
            userId: forumMembers.userId,
            role: forumMembers.role,
            joinedAt: forumMembers.joinedAt,
            user: users
          }).from(forumMembers).leftJoin(users, eq2(forumMembers.userId, users.id)).where(eq2(forumMembers.forumId, forumId)).orderBy(forumMembers.joinedAt);
        });
        return allResults.filter((result) => result.user !== null).map((result) => ({
          ...result,
          user: result.user
        }));
      }
      async addForumMember(forumId, userId) {
        const instances = dbManager.getAllInstances();
        const primaryInstance = instances[0];
        try {
          const [member] = await primaryInstance.db.insert(forumMembers).values({ forumId, userId }).returning();
          return member;
        } catch (error) {
          if (error?.code === "23503") {
            const { instance: userInstance } = await this.findUserShard(userId);
            try {
              const [member] = await userInstance.db.insert(forumMembers).values({ forumId, userId }).returning();
              return member;
            } catch (userShardError) {
              if (userShardError?.code === "23503" && userShardError?.constraint?.includes("forum_id")) {
                await this.ensureForumInShard(userInstance, forumId, userId);
                const [member] = await userInstance.db.insert(forumMembers).values({ forumId, userId }).returning();
                return member;
              }
              throw userShardError;
            }
          }
          throw error;
        }
      }
      async isForumMember(forumId, userId) {
        const results = await dbManager.executeOnAllInstances(async (database) => {
          const [member] = await database.select().from(forumMembers).where(and(
            eq2(forumMembers.forumId, forumId),
            eq2(forumMembers.userId, userId)
          ));
          return member ? [member] : [];
        });
        return results.length > 0;
      }
      async getMessages(forumId) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          return await database.select({
            id: messages.id,
            forumId: messages.forumId,
            userId: messages.userId,
            content: messages.content,
            createdAt: messages.createdAt,
            user: users,
            commentCount: sql2`
            (WITH RECURSIVE comment_tree AS (
              -- Base case: direct comments on the message
              SELECT id, entity_type, entity_id, parent_id
              FROM ${comments}
              WHERE entity_type = 'message' AND entity_id = ${messages.id}
              
              UNION ALL
              
              -- Recursive case: replies to comments in the tree
              SELECT c.id, c.entity_type, c.entity_id, c.parent_id
              FROM ${comments} c
              INNER JOIN comment_tree ct ON c.entity_type = 'comment' AND c.entity_id = ct.id
            )
            SELECT count(*) FROM comment_tree)
          `.as("commentCount")
          }).from(messages).leftJoin(users, eq2(messages.userId, users.id)).where(eq2(messages.forumId, forumId));
        });
        const uniqueMessagesMap = /* @__PURE__ */ new Map();
        allResults.filter((result) => result.user !== null).forEach((result) => {
          if (!uniqueMessagesMap.has(result.id)) {
            uniqueMessagesMap.set(result.id, result);
          }
        });
        const validResults = Array.from(uniqueMessagesMap.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return validResults.map((result) => ({
          ...result,
          user: result.user,
          commentCount: result.commentCount || 0
        }));
      }
      async getMessageById(id) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          const [message] = await database.select().from(messages).where(eq2(messages.id, id));
          return message ? [message] : [];
        });
        return allResults[0] || void 0;
      }
      async createMessage(insertMessage, userId) {
        const { instance: userInstance, user } = await this.findUserShard(userId);
        await this.ensureForumInShard(userInstance, insertMessage.forumId, userId);
        const estimatedSize = 500 + insertMessage.content.length * 2;
        try {
          const [message] = await userInstance.db.insert(messages).values({ ...insertMessage, userId }).returning();
          await dbManager.updateShardMetadata(userInstance.id, estimatedSize);
          return { ...message, user };
        } catch (error) {
          console.error("Failed to create message on user shard:", error);
          throw error;
        }
      }
      async getComments(entityType, entityId) {
        let allComments = [];
        const fetchLevel = async (type, ids) => {
          return await dbManager.executeOnAllInstances(async (database) => {
            return await database.select({
              id: comments.id,
              userId: comments.userId,
              entityType: comments.entityType,
              entityId: comments.entityId,
              parentId: comments.parentId,
              content: comments.content,
              createdAt: comments.createdAt,
              updatedAt: comments.updatedAt,
              user: users
            }).from(comments).leftJoin(users, eq2(comments.userId, users.id)).where(and(
              eq2(comments.entityType, type),
              Array.isArray(ids) ? inArray(comments.entityId, ids) : eq2(comments.entityId, ids)
            ));
          });
        };
        const rootResults = await fetchLevel(entityType, entityId);
        allComments = [...rootResults];
        let currentParentIds = rootResults.map((c) => c.id);
        let depth = 0;
        while (currentParentIds.length > 0 && depth < 10) {
          const replies = await fetchLevel("comment", currentParentIds);
          if (replies.length === 0) break;
          allComments = [...allComments, ...replies];
          currentParentIds = replies.map((c) => c.id);
          depth++;
        }
        const validResults = allComments.filter((result) => result.user !== null).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const commentMap = /* @__PURE__ */ new Map();
        const rootComments = [];
        validResults.forEach((result) => {
          if (!commentMap.has(result.id)) {
            const comment = {
              ...result,
              user: result.user,
              replies: []
            };
            commentMap.set(comment.id, comment);
          }
        });
        commentMap.forEach((comment) => {
          if (comment.parentId) {
            const parent = commentMap.get(comment.parentId);
            if (parent) {
              parent.replies.push(comment);
            }
          } else {
            if (comment.entityType === entityType && comment.entityId === entityId) {
              rootComments.push(comment);
            }
          }
        });
        return rootComments;
      }
      async getCommentById(id) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          const [comment] = await database.select({
            id: comments.id,
            userId: comments.userId,
            entityType: comments.entityType,
            entityId: comments.entityId,
            parentId: comments.parentId,
            content: comments.content,
            createdAt: comments.createdAt,
            updatedAt: comments.updatedAt,
            user: users
          }).from(comments).leftJoin(users, eq2(comments.userId, users.id)).where(eq2(comments.id, id));
          return comment ? [comment] : [];
        });
        const result = allResults[0];
        if (!result || !result.user) return void 0;
        return {
          ...result,
          user: result.user
        };
      }
      async createComment(insertComment, userId) {
        let forumId = void 0;
        if (insertComment.entityType === "message") {
          const message = await this.getMessageById(insertComment.entityId);
          if (message) forumId = message.forumId;
        } else if (insertComment.entityType === "file") {
          const file = await this.getFileById(insertComment.entityId);
          if (file) forumId = file.forumId;
        } else if (insertComment.entityType === "comment") {
          let parent = await this.getCommentById(insertComment.entityId);
          while (parent && parent.entityType === "comment") {
            parent = await this.getCommentById(parent.entityId);
          }
          if (parent && parent.entityType === "message") {
            const message = await this.getMessageById(parent.entityId);
            if (message) forumId = message.forumId;
          } else if (parent && parent.entityType === "file") {
            const file = await this.getFileById(parent.entityId);
            if (file) forumId = file.forumId;
          }
        }
        if (!forumId) throw new Error("Unable to determine forum for comment");
        const { instance: forumInstance, forum } = await this.findForumShard(forumId);
        await this.ensureUserInShard(forumInstance, userId);
        await this.ensureForumInShard(forumInstance, forumId, forum.creatorId);
        try {
          const [comment] = await forumInstance.db.insert(comments).values({ ...insertComment, userId }).returning();
          const [user] = await forumInstance.db.select().from(users).where(eq2(users.id, userId)).limit(1);
          return { ...comment, user };
        } catch (error) {
          console.error("Failed to create comment on forum shard:", error);
          throw error;
        }
      }
      async updateComment(id, content, userId) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            const [comment] = await instance.db.update(comments).set({ content, updatedAt: /* @__PURE__ */ new Date() }).where(and(
              eq2(comments.id, id),
              eq2(comments.userId, userId)
            )).returning();
            if (comment) {
              const user = await this.getUser(comment.userId);
              return {
                ...comment,
                user
              };
            }
          } catch (error) {
            console.error(`Error updating comment in instance ${instance.id}:`, error);
          }
        }
        return void 0;
      }
      async deleteComment(id) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            await instance.db.delete(comments).where(eq2(comments.parentId, id));
            await instance.db.delete(comments).where(eq2(comments.id, id));
          } catch (error) {
            console.error(`Error deleting comment from instance ${instance.id}:`, error);
          }
        }
      }
      async getFiles(forumId, limit, offset) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          let query = database.select({
            id: files.id,
            forumId: files.forumId,
            userId: files.userId,
            fileName: files.fileName,
            fileSize: files.fileSize,
            mimeType: files.mimeType,
            thumbnail: files.thumbnail,
            adminThumbnailUrl: files.adminThumbnailUrl,
            metaTitle: files.metaTitle,
            metaDescription: files.metaDescription,
            keywords: files.keywords,
            uploadedAt: files.uploadedAt,
            isAdminCreated: files.isAdminCreated,
            adminCreatedBy: files.adminCreatedBy,
            directDownloadUrl: files.directDownloadUrl,
            adminNotes: files.adminNotes,
            user: users,
            commentCount: sql2`
            (WITH RECURSIVE comment_tree AS (
              -- Base case: direct comments on the file
              SELECT id, entity_type, entity_id, parent_id
              FROM ${comments}
              WHERE entity_type = 'file' AND entity_id = ${files.id}

              UNION ALL

              -- Recursive case: replies to comments in the tree
              SELECT c.id, c.entity_type, c.entity_id, c.parent_id
              FROM ${comments} c
              INNER JOIN comment_tree ct ON c.entity_type = 'comment' AND c.entity_id = ct.id
            )
            SELECT count(*) FROM comment_tree)
          `.as("commentCount")
          }).from(files).leftJoin(users, eq2(files.userId, users.id)).where(eq2(files.forumId, forumId)).orderBy(desc(files.uploadedAt));
          if (limit) {
            query = query.limit(limit);
          }
          if (offset) {
            query = query.offset(offset);
          }
          return await query;
        });
        const filesWithChunks = await Promise.all(
          allResults.map(async (file) => {
            const chunks = await dbManager.executeOnAllInstances(async (database) => {
              return await database.select().from(fileChunks).where(eq2(fileChunks.fileId, file.id));
            });
            const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
            return {
              ...file,
              user: file.user,
              chunks: sortedChunks,
              commentCount: file.commentCount || 0
            };
          })
        );
        return filesWithChunks;
      }
      async getFilesCount(forumId) {
        const counts = await dbManager.executeOnAllInstances(async (database) => {
          const [row] = await database.select({ count: sql2`count(*)::int` }).from(files).where(eq2(files.forumId, forumId));
          return row ? [row.count || 0] : [0];
        });
        const normalCount = counts.reduce((acc, c) => acc + (Number(c) || 0), 0);
        return { total: normalCount };
      }
      async getFileById(id) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          const [file2] = await database.select({
            id: files.id,
            forumId: files.forumId,
            userId: files.userId,
            fileName: files.fileName,
            fileSize: files.fileSize,
            mimeType: files.mimeType,
            thumbnail: files.thumbnail,
            adminThumbnailUrl: files.adminThumbnailUrl,
            metaTitle: files.metaTitle,
            metaDescription: files.metaDescription,
            keywords: files.keywords,
            uploadedAt: files.uploadedAt,
            isAdminCreated: files.isAdminCreated,
            adminCreatedBy: files.adminCreatedBy,
            directDownloadUrl: files.directDownloadUrl,
            adminNotes: files.adminNotes,
            user: users
          }).from(files).leftJoin(users, eq2(files.userId, users.id)).where(eq2(files.id, id));
          return file2 ? [file2] : [];
        });
        const file = allResults[0];
        if (!file) return void 0;
        const chunks = await dbManager.executeOnAllInstances(async (database) => {
          return await database.select().from(fileChunks).where(eq2(fileChunks.fileId, id));
        });
        const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
        return {
          ...file,
          user: file.user,
          chunks: sortedChunks
        };
      }
      async createFile(forumId, userId, fileName, fileSize, mimeType, thumbnail, options) {
        const instances = dbManager.getAllInstances();
        const estimatedSize = 500 + fileName.length * 2;
        const primaryInstance = instances[0];
        try {
          const [file] = await primaryInstance.db.insert(files).values({
            forumId,
            userId,
            fileName,
            fileSize,
            mimeType,
            thumbnail,
            isAdminCreated: options?.isAdminCreated ?? false,
            adminNotes: options?.adminNotes,
            metaTitle: options?.metaTitle,
            metaDescription: options?.metaDescription,
            keywords: options?.keywords
          }).returning();
          await dbManager.updateShardMetadata(primaryInstance.id, estimatedSize);
          return file;
        } catch (error) {
          if (error?.code === "23503") {
            const { instance: userInstance } = await this.findUserShard(userId);
            try {
              const [file] = await userInstance.db.insert(files).values({
                forumId,
                userId,
                fileName,
                fileSize,
                mimeType,
                thumbnail,
                isAdminCreated: options?.isAdminCreated ?? false,
                adminNotes: options?.adminNotes,
                metaTitle: options?.metaTitle,
                metaDescription: options?.metaDescription,
                keywords: options?.keywords
              }).returning();
              await dbManager.updateShardMetadata(userInstance.id, estimatedSize);
              return file;
            } catch (userShardError) {
              if (userShardError?.code === "23503" && userShardError?.constraint?.includes("forum_id")) {
                await this.ensureForumInShard(userInstance, forumId, userId);
                const [file] = await userInstance.db.insert(files).values({
                  forumId,
                  userId,
                  fileName,
                  fileSize,
                  mimeType,
                  thumbnail,
                  isAdminCreated: options?.isAdminCreated ?? false,
                  adminNotes: options?.adminNotes,
                  metaTitle: options?.metaTitle,
                  metaDescription: options?.metaDescription,
                  keywords: options?.keywords
                }).returning();
                await dbManager.updateShardMetadata(userInstance.id, estimatedSize);
                return file;
              }
              throw userShardError;
            }
          }
          throw error;
        }
      }
      async createFileChunk(fileId, chunkIndex, chunkSize, checksum, dropboxAccountId, dropboxPath, dropboxFileId, downloadUrl) {
        try {
          let targetInstance;
          try {
            const { instance } = await this.findFileShard(fileId);
            targetInstance = instance;
          } catch (e) {
            console.warn(`createFileChunk: file ${fileId} not found in any shard, attempting to locate and copy to write shard`);
            const instances = dbManager.getAllInstances();
            let sourceFile = null;
            for (const inst of instances) {
              try {
                const [f] = await inst.db.select().from(files).where(eq2(files.id, fileId)).limit(1);
                if (f) {
                  sourceFile = f;
                  break;
                }
              } catch (err) {
              }
            }
            targetInstance = dbManager.getInstanceForWrite();
            if (sourceFile) {
              try {
                await this.ensureUserInShard(targetInstance, sourceFile.userId);
              } catch (err) {
                console.warn("Failed to ensure user in target shard while copying file:", err);
              }
              try {
                await this.ensureForumInShard(targetInstance, sourceFile.forumId, sourceFile.userId);
              } catch (err) {
                console.warn("Failed to ensure forum in target shard while copying file:", err);
              }
              try {
                await targetInstance.db.insert(files).values({
                  id: sourceFile.id,
                  forumId: sourceFile.forumId,
                  userId: sourceFile.userId,
                  fileName: sourceFile.fileName,
                  fileSize: sourceFile.fileSize,
                  mimeType: sourceFile.mimeType,
                  thumbnail: sourceFile.thumbnail,
                  adminThumbnailUrl: sourceFile.adminThumbnailUrl,
                  metaTitle: sourceFile.metaTitle,
                  metaDescription: sourceFile.metaDescription,
                  keywords: sourceFile.keywords,
                  uploadedAt: sourceFile.uploadedAt,
                  isAdminCreated: sourceFile.isAdminCreated,
                  adminCreatedBy: sourceFile.adminCreatedBy,
                  directDownloadUrl: sourceFile.directDownloadUrl,
                  adminNotes: sourceFile.adminNotes
                }).onConflictDoNothing();
                console.log(`createFileChunk: copied file ${fileId} into target shard ${targetInstance.id}`);
              } catch (err) {
                console.warn("Failed to copy file into target shard:", err);
              }
            } else {
              console.warn(`createFileChunk: file ${fileId} not found in any shard and cannot be copied`);
            }
          }
          try {
            const [chunk] = await targetInstance.db.insert(fileChunks).values({
              fileId,
              chunkIndex,
              chunkSize,
              checksum,
              dropboxAccountId,
              dropboxPath,
              dropboxFileId,
              downloadUrl
            }).returning();
            return chunk;
          } catch (err) {
            if (err?.code === "23503") {
              console.warn("FK violation inserting chunk, attempting to copy file metadata and retrying");
              const instances = dbManager.getAllInstances();
              let sourceFile = null;
              for (const inst of instances) {
                try {
                  const [f] = await inst.db.select().from(files).where(eq2(files.id, fileId)).limit(1);
                  if (f) {
                    sourceFile = f;
                    break;
                  }
                } catch (e) {
                }
              }
              if (sourceFile) {
                try {
                  await this.ensureUserInShard(targetInstance, sourceFile.userId);
                  await this.ensureForumInShard(targetInstance, sourceFile.forumId, sourceFile.userId);
                  await targetInstance.db.insert(files).values({
                    id: sourceFile.id,
                    forumId: sourceFile.forumId,
                    userId: sourceFile.userId,
                    fileName: sourceFile.fileName,
                    fileSize: sourceFile.fileSize,
                    mimeType: sourceFile.mimeType,
                    thumbnail: sourceFile.thumbnail,
                    adminThumbnailUrl: sourceFile.adminThumbnailUrl,
                    metaTitle: sourceFile.metaTitle,
                    metaDescription: sourceFile.metaDescription,
                    keywords: sourceFile.keywords,
                    uploadedAt: sourceFile.uploadedAt,
                    isAdminCreated: sourceFile.isAdminCreated,
                    adminCreatedBy: sourceFile.adminCreatedBy,
                    directDownloadUrl: sourceFile.directDownloadUrl,
                    adminNotes: sourceFile.adminNotes
                  }).onConflictDoNothing();
                  const [chunk] = await targetInstance.db.insert(fileChunks).values({
                    fileId,
                    chunkIndex,
                    chunkSize,
                    checksum,
                    dropboxAccountId,
                    dropboxPath,
                    dropboxFileId,
                    downloadUrl
                  }).returning();
                  return chunk;
                } catch (retryErr) {
                  console.error("Retry after copying file failed", retryErr);
                  throw retryErr;
                }
              }
            }
            throw err;
          }
        } catch (err) {
          console.error("Failed to create file chunk", err);
          throw err;
        }
      }
      async getTags(includeExtracted = false, forumId) {
        console.log(`[Tags] getTags() called (includeExtracted=${includeExtracted}, forumId=${forumId || "all"})`);
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          if (forumId) {
            return await database.select().from(tags).where(eq2(tags.forumId, forumId)).orderBy(tags.name);
          }
          return await database.select().from(tags).orderBy(tags.name);
        });
        const uniqueTags = /* @__PURE__ */ new Map();
        allResults.forEach((tag) => {
          if (!uniqueTags.has(tag.id)) {
            uniqueTags.set(tag.id, tag);
          }
        });
        console.log(`[Tags] Returning ${uniqueTags.size} tags from normal databases only`);
        if (includeExtracted) {
          console.log("[Tags] includeExtracted requested but ignored to avoid loading extracted Neon tags");
        }
        return Array.from(uniqueTags.values());
      }
      async createPartialUpload(forumId, userId, fileName, fileSize, mimeType, checksum, totalChunks) {
        try {
          const instances = dbManager.getAllInstances();
          const primaryInstance = instances[0];
          const [partialUpload] = await primaryInstance.db.insert(partialUploads).values({
            forumId,
            userId,
            fileName,
            fileSize,
            mimeType,
            checksum,
            totalChunks,
            uploadedChunks: []
          }).returning();
          if (partialUpload) return partialUpload;
        } catch (error) {
          if (error?.code === "23503") {
            const { instance: userInstance } = await this.findUserShard(userId);
            try {
              const [partialUpload] = await userInstance.db.insert(partialUploads).values({
                forumId,
                userId,
                fileName,
                fileSize,
                mimeType,
                checksum,
                totalChunks,
                uploadedChunks: []
              }).returning();
              return partialUpload;
            } catch (userShardError) {
              if (userShardError?.code === "23503" && userShardError?.constraint?.includes("forum_id")) {
                await this.ensureForumInShard(userInstance, forumId, userId);
                const [partialUpload] = await userInstance.db.insert(partialUploads).values({
                  forumId,
                  userId,
                  fileName,
                  fileSize,
                  mimeType,
                  checksum,
                  totalChunks,
                  uploadedChunks: []
                }).returning();
                return partialUpload;
              }
              throw userShardError;
            }
          }
          throw error;
        }
      }
      async getPartialUploadByChecksum(checksum, userId) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          const [partialUpload] = await database.select().from(partialUploads).where(and(
            eq2(partialUploads.checksum, checksum),
            eq2(partialUploads.userId, userId)
          ));
          return partialUpload ? [partialUpload] : [];
        });
        return allResults[0] || void 0;
      }
      async updatePartialUploadChunks(id, uploadedChunks) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            const [partialUpload] = await instance.db.update(partialUploads).set({
              uploadedChunks,
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq2(partialUploads.id, id)).returning();
            if (partialUpload) return partialUpload;
          } catch (error) {
            console.error(`Error updating partial upload in instance ${instance.id}:`, error);
          }
        }
        throw new Error("Failed to update partial upload");
      }
      async deletePartialUpload(id) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            await instance.db.delete(partialUploads).where(eq2(partialUploads.id, id));
          } catch (error) {
            console.error(`Error deleting partial upload from instance ${instance.id}:`, error);
          }
        }
      }
      async getPartialUploadsByUser(userId) {
        return await dbManager.executeOnAllInstances(async (database) => {
          return await database.select().from(partialUploads).where(eq2(partialUploads.userId, userId)).orderBy(desc(partialUploads.updatedAt));
        });
      }
      async getPartialUploadById(id) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          return await database.select().from(partialUploads).where(eq2(partialUploads.id, id));
        });
        return allResults[0] || void 0;
      }
      async getAccessRequests(forumId) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          return await database.select({
            id: accessRequests.id,
            forumId: accessRequests.forumId,
            userId: accessRequests.userId,
            status: accessRequests.status,
            requestedAt: accessRequests.requestedAt,
            resolvedAt: accessRequests.resolvedAt,
            resolvedBy: accessRequests.resolvedBy,
            user: users
          }).from(accessRequests).leftJoin(users, eq2(accessRequests.userId, users.id)).where(eq2(accessRequests.forumId, forumId)).orderBy(desc(accessRequests.requestedAt));
        });
        return allResults.filter((result) => result.user !== null).map((result) => ({
          ...result,
          user: result.user
        }));
      }
      async createAccessRequest(insertRequest, userId) {
        const instances = dbManager.getAllInstances();
        const primaryInstance = instances[0];
        try {
          const [request] = await primaryInstance.db.insert(accessRequests).values({ ...insertRequest, userId }).returning();
          return request;
        } catch (error) {
          if (error?.code === "23503") {
            console.log(`Foreign key constraint in primary shard, attempting cross-shard resolution...`);
            const { instance: userInstance } = await this.findUserShard(userId);
            try {
              const [request] = await userInstance.db.insert(accessRequests).values({ ...insertRequest, userId }).returning();
              return request;
            } catch (userShardError) {
              if (userShardError?.code === "23503" && userShardError?.constraint?.includes("forum_id")) {
                const { forum: originalForum } = await this.findForumShard(insertRequest.forumId);
                const safeCreatorId = userId;
                await userInstance.db.insert(forums).values({
                  id: originalForum.id,
                  name: originalForum.name,
                  description: originalForum.description,
                  isPublic: originalForum.isPublic,
                  creatorId: safeCreatorId,
                  // Safe creator to avoid FK cascade
                  metaTitle: originalForum.metaTitle,
                  metaDescription: originalForum.metaDescription,
                  keywords: originalForum.keywords,
                  ogImage: originalForum.ogImage,
                  createdAt: originalForum.createdAt
                }).onConflictDoNothing();
                const [request] = await userInstance.db.insert(accessRequests).values({ ...insertRequest, userId }).returning();
                return request;
              }
              throw userShardError;
            }
          }
          throw error;
        }
      }
      async updateAccessRequest(id, status) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            const [request] = await instance.db.update(accessRequests).set({ status, resolvedAt: /* @__PURE__ */ new Date() }).where(eq2(accessRequests.id, id)).returning();
            if (request) return request;
          } catch (error) {
            console.error(`Error updating access request in instance ${instance.id}:`, error);
          }
        }
        return void 0;
      }
      async getAccessRequestByUser(forumId, userId) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          const [request] = await database.select().from(accessRequests).where(and(
            eq2(accessRequests.forumId, forumId),
            eq2(accessRequests.userId, userId)
          ));
          return request ? [request] : [];
        });
        return allResults[0] || void 0;
      }
      async getPendingAccessRequestsCount(userId) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          const [count] = await database.select({ count: sql2`count(*)` }).from(accessRequests).innerJoin(forums, eq2(accessRequests.forumId, forums.id)).where(and(
            eq2(forums.creatorId, userId),
            eq2(accessRequests.status, "pending")
          ));
          return count ? [count.count] : [0];
        });
        return allResults.reduce((total, count) => total + count, 0);
      }
      async getUserForums(userId) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          return await database.select({
            id: forums.id,
            name: forums.name,
            description: forums.description,
            isPublic: forums.isPublic,
            creatorId: forums.creatorId,
            metaTitle: forums.metaTitle,
            metaDescription: forums.metaDescription,
            keywords: forums.keywords,
            ogImage: forums.ogImage,
            createdAt: forums.createdAt,
            creator: users
          }).from(forums).leftJoin(users, eq2(forums.creatorId, users.id)).where(eq2(forums.creatorId, userId));
        });
        const results = allResults.filter((result) => result.creator !== null).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const forumsWithMembers = await Promise.all(
          results.map(async (result) => {
            const memberCounts = await dbManager.executeOnAllInstances(async (database) => {
              const [count] = await database.select({ count: sql2`count(*)::int` }).from(forumMembers).where(eq2(forumMembers.forumId, result.id));
              return count ? [count.count || 0] : [0];
            });
            const totalCount = memberCounts.reduce((sum, count) => sum + count, 0);
            return {
              ...result,
              creator: result.creator,
              memberCount: totalCount
            };
          })
        );
        return forumsWithMembers;
      }
      async deleteForum(forumId) {
        console.log(`Starting cascade deletion for forum ${forumId}...`);
        const allFiles = await this.getFiles(forumId);
        console.log(`Found ${allFiles.length} files to delete`);
        for (const file of allFiles) {
          for (const chunk of file.chunks) {
            try {
              await dropboxManager.deleteChunk(chunk.dropboxAccountId, chunk.dropboxPath);
              dropboxManager.updateAccountUsage(chunk.dropboxAccountId, -chunk.chunkSize);
            } catch (error) {
              console.error(`Error deleting chunk ${chunk.id} from Dropbox:`, error);
            }
          }
        }
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            await instance.db.delete(fileTags).where(sql2`file_id IN (SELECT id FROM files WHERE forum_id = ${forumId})`);
            await instance.db.delete(messageTags).where(sql2`message_id IN (SELECT id FROM messages WHERE forum_id = ${forumId})`);
            await instance.db.delete(forumTags).where(eq2(forumTags.forumId, forumId));
            console.log(`Deleted forum-related tag assignments from instance ${instance.id}`);
          } catch (error) {
            console.error(`Error deleting tag assignments from instance ${instance.id}:`, error);
          }
          try {
            await instance.db.delete(tags).where(eq2(tags.forumId, forumId));
            console.log(`Deleted forum-scoped tags from instance ${instance.id}`);
          } catch (error) {
            console.error(`Error deleting forum-scoped tags from instance ${instance.id}:`, error);
          }
          try {
            await instance.db.delete(fileChunks).where(sql2`file_id IN (SELECT id FROM files WHERE forum_id = ${forumId})`);
            console.log(`Deleted file chunks from instance ${instance.id}`);
          } catch (error) {
            console.error(`Error deleting chunks from instance ${instance.id}:`, error);
          }
          try {
            await instance.db.delete(files).where(eq2(files.forumId, forumId));
            console.log(`Deleted files from instance ${instance.id}`);
          } catch (error) {
            console.error(`Error deleting files from instance ${instance.id}:`, error);
          }
          try {
            await instance.db.delete(messages).where(eq2(messages.forumId, forumId));
            console.log(`Deleted messages from instance ${instance.id}`);
          } catch (error) {
            console.error(`Error deleting messages from instance ${instance.id}:`, error);
          }
          try {
            await instance.db.delete(partialUploads).where(eq2(partialUploads.forumId, forumId));
            console.log(`Deleted partial uploads from instance ${instance.id}`);
          } catch (error) {
            console.error(`Error deleting partial uploads from instance ${instance.id}:`, error);
          }
          try {
            await instance.db.delete(accessRequests).where(eq2(accessRequests.forumId, forumId));
            console.log(`Deleted access requests from instance ${instance.id}`);
          } catch (error) {
            console.error(`Error deleting access requests from instance ${instance.id}:`, error);
          }
          try {
            await instance.db.delete(forumMembers).where(eq2(forumMembers.forumId, forumId));
            console.log(`Deleted forum members from instance ${instance.id}`);
          } catch (error) {
            console.error(`Error deleting forum members from instance ${instance.id}:`, error);
          }
          try {
            await instance.db.delete(forums).where(eq2(forums.id, forumId));
            console.log(`Deleted forum from instance ${instance.id}`);
          } catch (error) {
            console.error(`Error deleting forum from instance ${instance.id}:`, error);
          }
        }
        console.log(`Cascade deletion completed for forum ${forumId}`);
      }
      async deleteFile(id) {
        try {
          const file = await this.getFileById(id);
          if (!file) {
            console.warn(`deleteFile: file ${id} not found`);
            return;
          }
          for (const chunk of file.chunks) {
            try {
              if (chunk.dropboxPath) {
                await dropboxManager.deleteChunk(chunk.dropboxAccountId, chunk.dropboxPath);
                dropboxManager.updateAccountUsage(chunk.dropboxAccountId, -chunk.chunkSize);
              }
            } catch (error) {
              console.error(`Error deleting chunk ${chunk.id} from Dropbox:`, error);
            }
          }
          const instances = dbManager.getAllInstances();
          for (const instance of instances) {
            try {
              await instance.db.delete(fileChunks).where(eq2(fileChunks.fileId, id));
            } catch (error) {
              console.error(`Error deleting file chunks from instance ${instance.id}:`, error);
            }
            try {
              await instance.db.delete(fileTags).where(eq2(fileTags.fileId, id));
            } catch (error) {
              console.error(`Error deleting file tags from instance ${instance.id}:`, error);
            }
            try {
              await instance.db.delete(files).where(eq2(files.id, id));
            } catch (error) {
              console.error(`Error deleting file from instance ${instance.id}:`, error);
            }
          }
          try {
            const hlsDir = path.join(process.cwd(), "storage", "hls", id);
            if (fs.existsSync(hlsDir)) {
              fs.rmSync(hlsDir, { recursive: true, force: true });
              console.log(`[Storage] Deleted HLS directory: ${hlsDir}`);
            }
          } catch (error) {
            console.error("Error deleting HLS directory for file", id, error);
          }
          console.log(`deleteFile: completed deletion for file ${id}`);
        } catch (error) {
          console.error("deleteFile: unexpected error", error);
          throw error;
        }
      }
      // Tag methods
      async createTag(tagData) {
        const instances = dbManager.getAllInstances();
        const primaryInstance = instances[0];
        const [tag] = await primaryInstance.db.insert(tags).values(tagData).returning();
        return tag;
      }
      async getTagById(id) {
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          const [tag] = await database.select().from(tags).where(eq2(tags.id, id));
          return tag ? [tag] : [];
        });
        return allResults[0] || void 0;
      }
      async updateTag(id, updates) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            const [tag] = await instance.db.update(tags).set(updates).where(eq2(tags.id, id)).returning();
            if (tag) return tag;
          } catch (error) {
            console.error(`Error updating tag in instance ${instance.id}:`, error);
          }
        }
        return void 0;
      }
      async deleteTag(id) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            await instance.db.delete(fileTags).where(eq2(fileTags.tagId, id));
            await instance.db.delete(messageTags).where(eq2(messageTags.tagId, id));
            await instance.db.delete(forumTags).where(eq2(forumTags.tagId, id));
            await instance.db.delete(tags).where(eq2(tags.id, id));
          } catch (error) {
            console.error(`Error deleting tag from instance ${instance.id}:`, error);
          }
        }
      }
      async getEntityTags(entityType, entityId) {
        let table;
        let entityColumn;
        switch (entityType) {
          case "file":
            table = fileTags;
            entityColumn = fileTags.fileId;
            break;
          case "message":
            table = messageTags;
            entityColumn = messageTags.messageId;
            break;
          case "forum":
            table = forumTags;
            entityColumn = forumTags.forumId;
            break;
          default:
            return [];
        }
        const allResults = await dbManager.executeOnAllInstances(async (database) => {
          return await database.select({
            id: tags.id,
            name: tags.name,
            description: tags.description,
            color: tags.color,
            createdAt: tags.createdAt
          }).from(table).innerJoin(tags, eq2(table.tagId, tags.id)).where(eq2(entityColumn, entityId)).orderBy(tags.name);
        });
        return allResults;
      }
      async assignTagsToEntity(entityType, entityId, tagIds) {
        if (entityType === "file" || entityType === "message") {
          try {
            const entityInstance = await this.findEntityShard(entityType, entityId);
            if (entityInstance) {
              let forumId;
              if (entityType === "file") {
                const [result] = await entityInstance.db.select({ forumId: files.forumId }).from(files).where(eq2(files.id, entityId));
                forumId = result?.forumId;
              } else {
                const [result] = await entityInstance.db.select({ forumId: messages.forumId }).from(messages).where(eq2(messages.id, entityId));
                forumId = result?.forumId;
              }
              if (forumId) {
                console.log(`Propagating tags to parent forum ${forumId}`);
                await this.assignTagsToEntity("forum", forumId, tagIds);
              }
            }
          } catch (error) {
            console.error("Error propagating tags to parent forum:", error);
          }
        }
        const assignments = [];
        for (const tagId of tagIds) {
          let table;
          let values;
          switch (entityType) {
            case "file":
              table = fileTags;
              values = { fileId: entityId, tagId };
              break;
            case "message":
              table = messageTags;
              values = { messageId: entityId, tagId };
              break;
            case "forum":
              table = forumTags;
              values = { forumId: entityId, tagId };
              break;
            default:
              continue;
          }
          const entityInstance = await this.findEntityShard(entityType, entityId);
          const tagInstance = await this.findTagShard(tagId);
          if (!entityInstance || !tagInstance) {
            console.error(`Cannot assign tag ${tagId} to ${entityType} ${entityId}: entity or tag not found`);
            continue;
          }
          let targetInstance = entityInstance;
          const tagExistsInEntityShard = await this.checkTagExistsInShard(entityInstance, tagId);
          if (!tagExistsInEntityShard) {
            await this.copyTagToShard(tagInstance, entityInstance, tagId);
          }
          try {
            const result = await targetInstance.db.insert(table).values(values).onConflictDoNothing().returning();
            if (result && result.length > 0) {
              assignments.push(result[0]);
            }
          } catch (error) {
            console.error(`Error assigning tag ${tagId} to ${entityType} ${entityId}:`, error);
          }
        }
        return assignments;
      }
      async removeTagFromEntity(entityType, entityId, tagId) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            let table;
            let entityColumn;
            switch (entityType) {
              case "file":
                table = fileTags;
                entityColumn = fileTags.fileId;
                break;
              case "message":
                table = messageTags;
                entityColumn = messageTags.messageId;
                break;
              case "forum":
                table = forumTags;
                entityColumn = forumTags.forumId;
                break;
              default:
                continue;
            }
            await instance.db.delete(table).where(and(
              eq2(entityColumn, entityId),
              eq2(table.tagId, tagId)
            ));
          } catch (error) {
            console.error(`Error removing tag from instance ${instance.id}:`, error);
          }
        }
      }
      // SEO methods
      async updateForumSEOMetadata(forumId) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            const [forum] = await instance.db.select().from(forums).where(eq2(forums.id, forumId));
            if (!forum) continue;
            const forumTagsResult = await instance.db.select({
              id: tags.id,
              name: tags.name,
              description: tags.description,
              color: tags.color,
              createdAt: tags.createdAt
            }).from(forumTags).innerJoin(tags, eq2(forumTags.tagId, tags.id)).where(eq2(forumTags.forumId, forumId)).orderBy(tags.name);
            const tagNames = forumTagsResult.map((tag) => tag.name).join(", ");
            const metaTitle = forum.name.length + tagNames.length + 3 <= 60 ? `${forum.name} - ${tagNames}` : forum.name;
            const baseDescription = forum.description || `Join the discussion in ${forum.name}`;
            const metaDescription = baseDescription.length + tagNames.length + 10 <= 160 ? `${baseDescription}. Tags: ${tagNames}` : baseDescription;
            const keywords = tagNames;
            await instance.db.update(forums).set({
              metaTitle: metaTitle.substring(0, 60),
              metaDescription: metaDescription.substring(0, 160),
              keywords
            }).where(eq2(forums.id, forumId));
          } catch (error) {
            console.error(`Error updating forum SEO metadata in instance ${instance.id}:`, error);
          }
        }
      }
      async updateFileSEOMetadata(fileId) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            const [file] = await instance.db.select({
              id: files.id,
              forumId: files.forumId,
              userId: files.userId,
              fileName: files.fileName,
              metaTitle: files.metaTitle,
              metaDescription: files.metaDescription,
              keywords: files.keywords
            }).from(files).where(eq2(files.id, fileId));
            if (!file) continue;
            const fileTagsResult = await instance.db.select({
              id: tags.id,
              name: tags.name,
              description: tags.description,
              color: tags.color,
              createdAt: tags.createdAt
            }).from(fileTags).innerJoin(tags, eq2(fileTags.tagId, tags.id)).where(eq2(fileTags.fileId, fileId)).orderBy(tags.name);
            const tagNames = fileTagsResult.map((tag) => tag.name).join(", ");
            const fileNameWithoutExt = file.fileName.replace(/\.[^/.]+$/, "");
            const metaTitle = fileNameWithoutExt.length + tagNames.length + 3 <= 60 ? `${fileNameWithoutExt} - ${tagNames}` : fileNameWithoutExt;
            const baseDescription = `File: ${file.fileName}`;
            const metaDescription = baseDescription.length + tagNames.length + 10 <= 160 ? `${baseDescription}. Tags: ${tagNames}` : baseDescription;
            const keywords = tagNames;
            await instance.db.update(files).set({
              metaTitle: metaTitle.substring(0, 60),
              metaDescription: metaDescription.substring(0, 160),
              keywords
            }).where(eq2(files.id, fileId));
          } catch (error) {
            console.error(`Error updating file SEO metadata in instance ${instance.id}:`, error);
          }
        }
      }
      // Helper methods for cross-shard tag management
      async findEntityShard(entityType, entityId) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            let result;
            switch (entityType) {
              case "file":
                result = await instance.db.select({ id: files.id }).from(files).where(eq2(files.id, entityId)).limit(1);
                break;
              case "message":
                result = await instance.db.select({ id: messages.id }).from(messages).where(eq2(messages.id, entityId)).limit(1);
                break;
              case "forum":
                result = await instance.db.select({ id: forums.id }).from(forums).where(eq2(forums.id, entityId)).limit(1);
                break;
              default:
                continue;
            }
            if (result && result.length > 0) {
              return instance;
            }
          } catch (error) {
          }
        }
        return null;
      }
      async findTagShard(tagId) {
        const instances = dbManager.getAllInstances();
        for (const instance of instances) {
          try {
            const result = await instance.db.select({ id: tags.id }).from(tags).where(eq2(tags.id, tagId)).limit(1);
            if (result && result.length > 0) {
              return instance;
            }
          } catch (error) {
          }
        }
        return null;
      }
      async checkTagExistsInShard(instance, tagId) {
        try {
          const result = await instance.db.select({ id: tags.id }).from(tags).where(eq2(tags.id, tagId)).limit(1);
          return result && result.length > 0;
        } catch (error) {
          return false;
        }
      }
      async copyTagToShard(sourceInstance, targetInstance, tagId) {
        try {
          const tagResult = await sourceInstance.db.select().from(tags).where(eq2(tags.id, tagId)).limit(1);
          if (tagResult && tagResult.length > 0) {
            const tag = tagResult[0];
            await targetInstance.db.insert(tags).values(tag).onConflictDoNothing();
          }
        } catch (error) {
          console.error(`Error copying tag ${tagId} to target shard:`, error);
        }
      }
      // Search Analytics methods
      async trackSearch(params) {
        const { query, userId, resultsCount, sessionId } = params;
        try {
          const instances = dbManager.getAllInstances();
          const primaryInstance = instances[0];
          let userIdToInsert = null;
          if (userId) {
            try {
              const uRes = await primaryInstance.db.select({ id: users.id }).from(users).where(eq2(users.id, userId)).limit(1);
              if (uRes && uRes.length > 0) userIdToInsert = userId;
            } catch (e) {
              userIdToInsert = null;
            }
          }
          try {
            await primaryInstance.db.insert(searchAnalytics).values({
              query: query.toLowerCase().trim(),
              userId: userIdToInsert,
              resultsCount,
              sessionId
            });
          } catch (err) {
            console.warn("[Search] Primary analytics insert failed, retrying without userId", err?.message || err);
            try {
              await primaryInstance.db.insert(searchAnalytics).values({
                query: query.toLowerCase().trim(),
                userId: null,
                resultsCount,
                sessionId
              });
            } catch (e) {
              console.warn("[Search] Failed to insert analytics without userId", e?.message || e);
            }
          }
          const normalizedQuery = query.toLowerCase().trim();
          const existingPopular = await primaryInstance.db.select().from(popularSearches).where(eq2(popularSearches.query, normalizedQuery)).limit(1);
          if (existingPopular.length > 0) {
            await primaryInstance.db.update(popularSearches).set({
              searchCount: sql2`search_count + 1`,
              lastSearched: /* @__PURE__ */ new Date(),
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq2(popularSearches.query, normalizedQuery));
          } else {
            if (normalizedQuery.length >= 2 && /\w/.test(normalizedQuery)) {
              let category = "general";
              if (normalizedQuery.startsWith("#")) {
                category = "tag";
              } else if (normalizedQuery.includes("by ")) {
                category = "creator";
              }
              await primaryInstance.db.insert(popularSearches).values({
                query: normalizedQuery,
                searchCount: 1,
                category,
                lastSearched: /* @__PURE__ */ new Date()
              }).onConflictDoNothing();
            }
          }
          if (Math.random() < 0.01) {
            await this.cleanupPopularSearches(primaryInstance);
          }
        } catch (error) {
          console.error("Error tracking search:", error);
        }
      }
      async getPopularSearches(limit = 10) {
        try {
          const instances = dbManager.getAllInstances();
          const primaryInstance = instances[0];
          const result = await primaryInstance.db.select().from(popularSearches).where(sql2`search_count >= 5`).orderBy(desc(popularSearches.searchCount), desc(popularSearches.lastSearched)).limit(Math.min(limit, 50));
          return result;
        } catch (error) {
          console.error("Error getting popular searches:", error);
          return [];
        }
      }
      // Cleanup method to maintain only top 100 popular searches
      async cleanupPopularSearches(instance) {
        try {
          const countResult = await instance.db.select({ count: sql2`cast(count(*) as int)` }).from(popularSearches);
          const totalCount = countResult[0]?.count || 0;
          if (totalCount > 100) {
            console.log(`\u{1F9F9} Cleaning up popular searches: ${totalCount} entries, keeping top 100`);
            const threshold = await instance.db.select({ searchCount: popularSearches.searchCount }).from(popularSearches).orderBy(desc(popularSearches.searchCount), desc(popularSearches.lastSearched)).limit(1).offset(99);
            if (threshold.length > 0) {
              const minSearchCount = threshold[0].searchCount;
              const deletedCount = await instance.db.delete(popularSearches).where(sql2`search_count < ${minSearchCount} OR (search_count = ${minSearchCount} AND id NOT IN (
              SELECT id FROM popular_searches 
              WHERE search_count >= ${minSearchCount}
              ORDER BY search_count DESC, last_searched DESC 
              LIMIT 100
            ))`);
              console.log(`\u2705 Cleaned up ${deletedCount} less popular searches, maintained top 100`);
            }
          }
        } catch (error) {
          console.error("Error cleaning up popular searches:", error);
        }
      }
      async getSearchAnalyticsStats() {
        try {
          const instances = dbManager.getAllInstances();
          const primaryInstance = instances[0];
          const totalSearchesResult = await primaryInstance.db.select({ count: sql2`cast(count(*) as int)` }).from(searchAnalytics);
          const popularSearchesResult = await primaryInstance.db.select({ count: sql2`cast(count(*) as int)` }).from(popularSearches).where(sql2`search_count >= 5`);
          const topSearches = await primaryInstance.db.select().from(popularSearches);
          return { totalSearches: 0, popularSearches: 0, topSearches: [] };
        } catch (e) {
          throw e;
        }
      }
      async searchEntities(query, userId, forumId) {
        const lowercaseQuery = `%${query.toLowerCase()}%`;
        console.log(`[Search] Starting search across local databases for query "${query}"`);
        const results = await dbManager.executeOnAllInstances(async (database) => {
          console.log(`[Search] Searching local database instance for forums, files, and messages`);
          const forumResults = await database.select({
            forum: forums
          }).from(forums).leftJoin(forumMembers, and(
            eq2(forumMembers.forumId, forums.id),
            userId ? eq2(forumMembers.userId, userId) : sql2`1=0`
          )).where(and(
            or(
              eq2(forums.isPublic, true),
              userId ? eq2(forums.creatorId, userId) : sql2`1=0`,
              userId ? isNotNull(forumMembers.id) : sql2`1=0`
            ),
            or(
              ilike(forums.name, lowercaseQuery),
              ilike(forums.description, lowercaseQuery),
              exists(
                database.select().from(forumTags).innerJoin(tags, eq2(forumTags.tagId, tags.id)).where(and(
                  eq2(forumTags.forumId, forums.id),
                  ilike(tags.name, lowercaseQuery)
                ))
              )
            )
          )).limit(20);
          let fileQuery = database.select({
            file: files,
            user: users,
            forum: forums
          }).from(files).innerJoin(users, eq2(files.userId, users.id)).innerJoin(forums, eq2(files.forumId, forums.id)).leftJoin(forumMembers, and(
            eq2(forumMembers.forumId, forums.id),
            userId ? eq2(forumMembers.userId, userId) : sql2`1=0`
          ));
          if (forumId) {
            fileQuery = fileQuery.where(eq2(files.forumId, forumId));
          }
          fileQuery = fileQuery.where(and(
            or(
              eq2(forums.isPublic, true),
              userId ? eq2(forums.creatorId, userId) : sql2`1=0`,
              userId ? isNotNull(forumMembers.id) : sql2`1=0`
            ),
            or(
              ilike(files.fileName, lowercaseQuery),
              and(isNotNull(files.metaTitle), ilike(files.metaTitle, lowercaseQuery)),
              and(isNotNull(files.metaDescription), ilike(files.metaDescription, lowercaseQuery)),
              and(isNotNull(files.keywords), ilike(files.keywords, lowercaseQuery)),
              and(isNotNull(files.adminNotes), ilike(files.adminNotes, lowercaseQuery)),
              exists(
                database.select().from(fileTags).innerJoin(tags, eq2(fileTags.tagId, tags.id)).where(and(
                  eq2(fileTags.fileId, files.id),
                  ilike(tags.name, lowercaseQuery)
                ))
              )
            )
          )).limit(50);
          const fileResults = await fileQuery;
          let messageQuery = database.select({
            message: messages,
            user: users,
            forum: forums
          }).from(messages).innerJoin(users, eq2(messages.userId, users.id)).innerJoin(forums, eq2(messages.forumId, forums.id)).leftJoin(forumMembers, and(
            eq2(forumMembers.forumId, forums.id),
            userId ? eq2(forumMembers.userId, userId) : sql2`1=0`
          ));
          if (forumId) {
            messageQuery = messageQuery.where(eq2(messages.forumId, forumId));
          }
          messageQuery = messageQuery.where(and(
            or(
              eq2(forums.isPublic, true),
              userId ? eq2(forums.creatorId, userId) : sql2`1=0`,
              userId ? isNotNull(forumMembers.id) : sql2`1=0`
            ),
            or(
              ilike(messages.content, lowercaseQuery),
              exists(
                database.select().from(messageTags).innerJoin(tags, eq2(messageTags.tagId, tags.id)).where(and(
                  eq2(messageTags.messageId, messages.id),
                  ilike(tags.name, lowercaseQuery)
                ))
              )
            )
          )).limit(50);
          const messageResults = await messageQuery;
          const forumMapLocal = {};
          forumResults.forEach((r) => {
            forumMapLocal[r.forum.id] = r.forum;
          });
          fileResults.forEach((fr) => {
            if (fr.forum && !forumMapLocal[fr.forum.id]) forumMapLocal[fr.forum.id] = fr.forum;
          });
          messageResults.forEach((mr) => {
            if (mr.forum && !forumMapLocal[mr.forum.id]) forumMapLocal[mr.forum.id] = mr.forum;
          });
          return { forums: Object.values(forumMapLocal), files: fileResults, messages: messageResults };
        });
        console.log(`[Search] Merging results from ${results.length} database instances`);
        let mergedForums = results.flatMap((r) => r.forums);
        let mergedFiles = results.flatMap((r) => r.files).map((r) => ({ ...r.file, user: r.user, forum: r.forum }));
        const mergedMessages = results.flatMap((r) => r.messages).map((r) => ({ ...r.message, user: r.user, forum: r.forum }));
        const forumMap = {};
        mergedForums.forEach((f) => {
          forumMap[f.id] = f;
        });
        mergedFiles.forEach((f) => {
          if (f && f.forum && !forumMap[f.forum.id]) forumMap[f.forum.id] = f.forum;
        });
        mergedMessages.forEach((m) => {
          if (m && m.forum && !forumMap[m.forum.id]) forumMap[m.forum.id] = m.forum;
        });
        mergedForums = Object.values(forumMap);
        console.log(`[Search] Results for query "${query}":`);
        console.log(`[Search] - Forums: ${mergedForums.length}`);
        console.log(`[Search] - Files: ${mergedFiles.length}`);
        console.log(`[Search] - Messages: ${mergedMessages.length}`);
        return {
          forums: mergedForums,
          files: mergedFiles,
          messages: mergedMessages
        };
      }
      async resetAllUserData(userId) {
        console.log(`[Storage] Starting comprehensive data reset for user: ${userId}`);
        try {
          await dbManager.withReadWrite(async (db3) => {
            const partialUploadsToDelete = await db3.select().from(partialUploads).where(eq2(partialUploads.userId, userId));
            if (partialUploadsToDelete.length > 0) {
              await db3.delete(partialUploads).where(eq2(partialUploads.userId, userId));
              console.log(`[Storage] Deleted ${partialUploadsToDelete.length} partial uploads for user ${userId}`);
            }
            const accessRequestsToDelete = await db3.select().from(accessRequests).where(eq2(accessRequests.userId, userId));
            if (accessRequestsToDelete.length > 0) {
              await db3.delete(accessRequests).where(eq2(accessRequests.userId, userId));
              console.log(`[Storage] Deleted ${accessRequestsToDelete.length} access requests for user ${userId}`);
            }
            const membershipToDelete = await db3.select().from(forumMembers).where(eq2(forumMembers.userId, userId));
            if (membershipToDelete.length > 0) {
              await db3.delete(forumMembers).where(eq2(forumMembers.userId, userId));
              console.log(`[Storage] Removed user ${userId} from ${membershipToDelete.length} forums`);
            }
            await db3.delete(searchAnalytics).where(eq2(searchAnalytics.userId, userId));
            console.log(`[Storage] Cleared search analytics for user ${userId}`);
          });
          await this.cleanupUserHLSFiles(userId);
          await this.clearUserSessions(userId);
          await this.cleanupUserTemporaryFiles(userId);
          console.log(`[Storage] \u2705 Comprehensive data reset completed for user: ${userId}`);
        } catch (error) {
          console.error(`[Storage] \u274C Error during data reset for user ${userId}:`, error);
          throw error;
        }
      }
      async cleanupUserHLSFiles(userId) {
        try {
          const userFiles = await dbManager.withReadWrite(async (db3) => {
            return await db3.select().from(files).where(eq2(files.userId, userId));
          });
          for (const file of userFiles) {
            const hlsDir = path.join(process.cwd(), "storage", "hls", file.id);
            if (fs.existsSync(hlsDir)) {
              try {
                fs.rmSync(hlsDir, { recursive: true, force: true });
                console.log(`[Storage] Deleted HLS directory: ${hlsDir}`);
              } catch (error) {
                console.error(`[Storage] Error deleting HLS directory ${hlsDir}:`, error);
              }
            }
          }
          console.log(`[Storage] Cleaned up HLS files for ${userFiles.length} user files`);
        } catch (error) {
          console.error("[Storage] Error during HLS cleanup:", error);
        }
      }
      async clearUserSessions(userId) {
        try {
          const sessionStore = this.sessionStore;
          if (sessionStore && typeof sessionStore.all === "function") {
            sessionStore.all((err, sessions) => {
              if (err) {
                console.error("[Storage] Error getting sessions:", err);
                return;
              }
              if (sessions) {
                let clearedSessions = 0;
                Object.keys(sessions).forEach((sessionId) => {
                  const sessionData = sessions[sessionId];
                  if (sessionData?.passport?.user === userId) {
                    sessionStore.destroy(sessionId, (destroyErr) => {
                      if (destroyErr) {
                        console.error(`[Storage] Error destroying session ${sessionId}:`, destroyErr);
                      } else {
                        clearedSessions++;
                      }
                    });
                  }
                });
                console.log(`[Storage] Cleared ${clearedSessions} sessions for user ${userId}`);
              }
            });
          }
        } catch (error) {
          console.error("[Storage] Error during session cleanup:", error);
        }
      }
      async cleanupUserTemporaryFiles(userId) {
        try {
          const tempDir = path.join(process.cwd(), "temp");
          if (fs.existsSync(tempDir)) {
            const files2 = fs.readdirSync(tempDir);
            let cleanedFiles = 0;
            for (const file of files2) {
              if (file.includes(userId)) {
                const filePath = path.join(tempDir, file);
                try {
                  fs.unlinkSync(filePath);
                  cleanedFiles++;
                } catch (error) {
                  console.error(`[Storage] Error deleting temp file ${filePath}:`, error);
                }
              }
            }
            if (cleanedFiles > 0) {
              console.log(`[Storage] Cleaned up ${cleanedFiles} temporary files for user ${userId}`);
            }
          }
        } catch (error) {
          console.error("[Storage] Error during temp file cleanup:", error);
        }
      }
    };
    storage = new DatabaseStorage();
  }
});

// server/memory-optimizer.ts
var memory_optimizer_exports = {};
__export(memory_optimizer_exports, {
  ConnectionPool: () => ConnectionPool,
  MemoryOptimizer: () => MemoryOptimizer,
  StreamingFileProcessor: () => StreamingFileProcessor,
  connectionPool: () => connectionPool,
  globalStreamingProcessor: () => globalStreamingProcessor,
  memoryOptimizer: () => memoryOptimizer
});
import { Transform } from "stream";
import { EventEmitter as EventEmitter2 } from "events";
import crypto3 from "crypto";
var MemoryOptimizer, StreamingFileProcessor, ConnectionPool, memoryOptimizer, connectionPool, globalStreamingProcessor;
var init_memory_optimizer = __esm({
  "server/memory-optimizer.ts"() {
    MemoryOptimizer = class extends EventEmitter2 {
      connections = /* @__PURE__ */ new Map();
      monitoringInterval = null;
      gcInterval = null;
      config;
      memoryStats = [];
      MAX_MEMORY_STATS = 100;
      constructor(config = {}) {
        super();
        this.config = {
          maxMemoryMB: 450,
          // Render free tier limit
          warningThresholdMB: 350,
          // 80% of max
          checkInterval: 1e4,
          // 10 seconds
          gcThreshold: 0.8,
          // Trigger GC at 80% memory usage
          ...config
        };
        this.startMemoryMonitoring();
        this.setupGarbageCollection();
        this.setupProcessHandlers();
      }
      startMemoryMonitoring() {
        this.monitoringInterval = setInterval(() => {
          this.checkMemoryUsage();
        }, this.config.checkInterval);
        console.log("\u{1F50D} Memory monitoring started");
      }
      setupGarbageCollection() {
        this.gcInterval = setInterval(() => {
          const memUsage = process.memoryUsage();
          const memUsageMB = memUsage.rss / 1024 / 1024;
          if (memUsageMB > this.config.maxMemoryMB * this.config.gcThreshold) {
            if (global.gc) {
              console.log(`\u{1F5D1}\uFE0F  Forcing garbage collection (${memUsageMB.toFixed(1)}MB used)`);
              global.gc();
            }
          }
        }, 3e4);
      }
      setupProcessHandlers() {
        process.on("uncaughtException", (error) => {
          console.error("\u{1F4A5} Uncaught Exception:", error);
          this.emit("criticalError", error);
        });
        process.on("unhandledRejection", (reason, promise) => {
          console.error("\u{1F4A5} Unhandled Rejection at:", promise, "reason:", reason);
          this.emit("criticalError", reason);
        });
        process.on("warning", (warning) => {
          if (warning.name === "MaxListenersExceededWarning") {
            console.warn("\u26A0\uFE0F  Memory Warning:", warning.message);
            this.emit("memoryWarning", warning);
          }
        });
      }
      checkMemoryUsage() {
        const memUsage = process.memoryUsage();
        const memUsageMB = memUsage.rss / 1024 / 1024;
        this.memoryStats.push({ timestamp: /* @__PURE__ */ new Date(), usage: memUsage });
        if (this.memoryStats.length > this.MAX_MEMORY_STATS) {
          this.memoryStats.shift();
        }
        if (memUsageMB > this.config.maxMemoryMB) {
          console.error(`\u{1F6A8} CRITICAL: Memory usage ${memUsageMB.toFixed(1)}MB exceeds limit ${this.config.maxMemoryMB}MB`);
          this.emit("memoryExhaustion", { usage: memUsageMB, limit: this.config.maxMemoryMB });
          this.emergencyCleanup();
        } else if (memUsageMB > this.config.warningThresholdMB) {
          console.warn(`\u26A0\uFE0F  Memory usage ${memUsageMB.toFixed(1)}MB approaching limit ${this.config.maxMemoryMB}MB`);
          this.emit("memoryWarning", { usage: memUsageMB, threshold: this.config.warningThresholdMB });
          this.performCleanup();
        }
        if (Date.now() % 6e4 < this.config.checkInterval) {
          this.logMemoryStats();
        }
      }
      performCleanup() {
        console.log("\u{1F9F9} Performing memory cleanup...");
        const now = Date.now();
        const staleConnections = [];
        this.connections.forEach((conn, id) => {
          const idleTime = now - conn.lastActivity.getTime();
          if (idleTime > 3e5) {
            staleConnections.push(id);
          }
        });
        staleConnections.forEach((id) => {
          this.removeConnection(id);
        });
        if (this.memoryStats.length > 50) {
          this.memoryStats = this.memoryStats.slice(-50);
        }
        if (global.gc) {
          global.gc();
        }
        console.log(`\u2705 Cleaned up ${staleConnections.length} stale connections`);
      }
      emergencyCleanup() {
        console.log("\u{1F6A8} Performing emergency memory cleanup...");
        const connectionsToRemove = [];
        this.connections.forEach((conn, id) => {
          if (conn.type !== "websocket") {
            connectionsToRemove.push(id);
          }
        });
        connectionsToRemove.forEach((id) => {
          this.removeConnection(id);
        });
        this.memoryStats = this.memoryStats.slice(-10);
        if (global.gc) {
          for (let i = 0; i < 3; i++) {
            global.gc();
          }
        }
        this.checkDatabaseConnections();
        console.log(`\u{1F6A8} Emergency cleanup: removed ${connectionsToRemove.length} connections`);
      }
      async checkDatabaseConnections() {
        try {
          const { dbManager: dbManager2 } = await Promise.resolve().then(() => (init_db(), db_exports));
          const healthCheck = await dbManager2.checkHealth();
          if (healthCheck.healthy) {
            console.log("\u2705 All database connections are healthy");
          } else {
            console.warn("\u26A0\uFE0F Some database connections are unhealthy:", healthCheck.details);
          }
        } catch (error) {
          console.error("\u274C Failed to check database connections:", error);
        }
      }
      logMemoryStats() {
        const memUsage = process.memoryUsage();
        const memUsageMB = {
          rss: (memUsage.rss / 1024 / 1024).toFixed(1),
          heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(1),
          heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(1),
          external: (memUsage.external / 1024 / 1024).toFixed(1)
        };
        console.log("\u{1F4BE} Memory Stats:");
        console.log(`  RSS: ${memUsageMB.rss}MB | Heap Used: ${memUsageMB.heapUsed}MB | Heap Total: ${memUsageMB.heapTotal}MB | External: ${memUsageMB.external}MB`);
        console.log(`  Active Connections: ${this.connections.size} | Uptime: ${(process.uptime() / 60).toFixed(1)} min`);
      }
      trackConnection(id, type, userId) {
        const connection = {
          id,
          userId,
          type,
          memoryUsage: 0,
          startTime: /* @__PURE__ */ new Date(),
          lastActivity: /* @__PURE__ */ new Date()
        };
        this.connections.set(id, connection);
        this.updateConnectionMemory(id);
      }
      updateConnectionActivity(id) {
        const connection = this.connections.get(id);
        if (connection) {
          connection.lastActivity = /* @__PURE__ */ new Date();
          this.updateConnectionMemory(id);
        }
      }
      removeConnection(id) {
        this.connections.delete(id);
      }
      updateConnectionMemory(id) {
        const connection = this.connections.get(id);
        if (connection) {
          switch (connection.type) {
            case "upload":
              connection.memoryUsage = 8;
              break;
            case "websocket":
              connection.memoryUsage = 0.5;
              break;
            case "http":
              connection.memoryUsage = 0.1;
              break;
          }
        }
      }
      getMemoryStats() {
        const usage = process.memoryUsage();
        const usageMB = {
          rss: Math.round(usage.rss / 1024 / 1024),
          heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
          external: Math.round(usage.external / 1024 / 1024)
        };
        return {
          usage,
          usageMB,
          connections: this.connections.size,
          limit: this.config.maxMemoryMB,
          warningThreshold: this.config.warningThresholdMB
        };
      }
      getConnectionStats() {
        const stats = {
          total: this.connections.size,
          byType: { http: 0, websocket: 0, upload: 0 },
          totalMemoryUsage: 0
        };
        this.connections.forEach((conn) => {
          stats.byType[conn.type]++;
          stats.totalMemoryUsage += conn.memoryUsage;
        });
        return stats;
      }
      shutdown() {
        if (this.monitoringInterval) {
          clearInterval(this.monitoringInterval);
          this.monitoringInterval = null;
        }
        if (this.gcInterval) {
          clearInterval(this.gcInterval);
          this.gcInterval = null;
        }
        this.connections.clear();
        this.memoryStats = [];
        console.log("\u{1F50C} Memory optimizer shutdown complete");
      }
    };
    StreamingFileProcessor = class extends EventEmitter2 {
      chunkSize;
      maxConcurrentChunks;
      priorityChunks = /* @__PURE__ */ new Set();
      // Track priority chunks
      activeRequests = /* @__PURE__ */ new Map();
      // Track active chunk processing
      constructor(chunkSize = 4 * 1024 * 1024, maxConcurrentChunks = 3) {
        super();
        this.chunkSize = chunkSize;
        this.maxConcurrentChunks = maxConcurrentChunks;
      }
      /**
       * Mark specific chunk indices as priority - these will bypass the normal processing queue
       * and be processed immediately when encountered
       */
      setPriorityChunks(chunkIndices) {
        console.log(`[StreamingProcessor] Setting priority chunks: ${chunkIndices.join(", ")}`);
        this.priorityChunks.clear();
        chunkIndices.forEach((index) => this.priorityChunks.add(index));
      }
      /**
       * Clear all priority chunks
       */
      clearPriorityChunks() {
        console.log(`[StreamingProcessor] Clearing priority chunks`);
        this.priorityChunks.clear();
      }
      /**
       * Check if a chunk is marked as priority
       */
      isPriorityChunk(chunkIndex) {
        return this.priorityChunks.has(chunkIndex);
      }
      createChunkingStream() {
        let chunkIndex = 0;
        let buffer = Buffer.alloc(0);
        const chunkSize = this.chunkSize;
        return new Transform({
          objectMode: false,
          transform(chunk, encoding, callback) {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= chunkSize) {
              const chunkData = buffer.slice(0, chunkSize);
              buffer = buffer.slice(chunkSize);
              this.push({
                index: chunkIndex++,
                data: chunkData,
                size: chunkData.length,
                checksum: crypto3.createHash("sha256").update(chunkData).digest("hex")
              });
            }
            callback();
          },
          flush(callback) {
            if (buffer.length > 0) {
              this.push({
                index: chunkIndex,
                data: buffer,
                size: buffer.length,
                checksum: crypto3.createHash("sha256").update(buffer).digest("hex")
              });
            }
            callback();
          }
        });
      }
      async processFileStream(fileStream, processor) {
        return new Promise((resolve, reject) => {
          const chunkingStream = this.createChunkingStream();
          const processingQueue = [];
          let totalChunks = 0;
          chunkingStream.on("data", (chunk) => {
            totalChunks++;
            const isPriority = this.isPriorityChunk(chunk.index);
            if (isPriority) {
              console.log(`[StreamingProcessor] Processing priority chunk ${chunk.index} immediately, interrupting queue`);
              const priorityPromise = processor(chunk);
              this.activeRequests.set(chunk.index, priorityPromise);
              priorityPromise.finally(() => {
                this.activeRequests.delete(chunk.index);
                console.log(`[StreamingProcessor] Priority chunk ${chunk.index} processing completed`);
              });
              return;
            }
            if (processingQueue.length >= this.maxConcurrentChunks) {
              Promise.race(processingQueue).then(() => {
                const promise = processor(chunk);
                processingQueue.push(promise);
                promise.finally(() => {
                  const index = processingQueue.indexOf(promise);
                  if (index > -1) {
                    processingQueue.splice(index, 1);
                  }
                });
              });
            } else {
              const promise = processor(chunk);
              processingQueue.push(promise);
              promise.finally(() => {
                const index = processingQueue.indexOf(promise);
                if (index > -1) {
                  processingQueue.splice(index, 1);
                }
              });
            }
          });
          chunkingStream.on("end", async () => {
            await Promise.all([
              ...processingQueue,
              ...Array.from(this.activeRequests.values())
            ]);
            console.log(`[StreamingProcessor] All chunks processed: ${totalChunks} total, ${this.priorityChunks.size} priority`);
            this.emit("processingComplete", { totalChunks });
            resolve();
          });
          chunkingStream.on("error", (error) => {
            reject(error);
          });
          fileStream.pipe(chunkingStream);
        });
      }
    };
    ConnectionPool = class {
      connections = /* @__PURE__ */ new Map();
      maxConnections;
      connectionTimeout;
      cleanupInterval = null;
      constructor(maxConnections = 1e3, connectionTimeout = 3e5) {
        this.maxConnections = maxConnections;
        this.connectionTimeout = connectionTimeout;
        this.startCleanup();
      }
      startCleanup() {
        this.cleanupInterval = setInterval(() => {
          this.cleanupStaleConnections();
        }, 6e4);
      }
      cleanupStaleConnections() {
        const now = Date.now();
        const staleConnections = [];
        this.connections.forEach((conn, id) => {
          const lastActivity = conn.lastActivity || conn.startTime || 0;
          if (now - lastActivity > this.connectionTimeout) {
            staleConnections.push(id);
          }
        });
        staleConnections.forEach((id) => {
          const conn = this.connections.get(id);
          if (conn && conn.ws && conn.ws.readyState === 1) {
            conn.ws.close();
          }
          this.connections.delete(id);
        });
        if (staleConnections.length > 0) {
          console.log(`\u{1F9F9} Cleaned up ${staleConnections.length} stale WebSocket connections`);
        }
      }
      addConnection(id, connection) {
        if (this.connections.size >= this.maxConnections) {
          console.warn(`\u26A0\uFE0F  Connection pool full (${this.maxConnections}), rejecting connection`);
          return false;
        }
        connection.startTime = Date.now();
        connection.lastActivity = Date.now();
        this.connections.set(id, connection);
        return true;
      }
      updateActivity(id) {
        const connection = this.connections.get(id);
        if (connection) {
          connection.lastActivity = Date.now();
        }
      }
      removeConnection(id) {
        this.connections.delete(id);
      }
      getConnection(id) {
        return this.connections.get(id);
      }
      getAllConnections() {
        return this.connections;
      }
      getConnectionCount() {
        return this.connections.size;
      }
      shutdown() {
        this.connections.forEach((conn) => {
          if (conn.ws && conn.ws.readyState === 1) {
            conn.ws.close();
          }
        });
        this.connections.clear();
        if (this.cleanupInterval) {
          clearInterval(this.cleanupInterval);
          this.cleanupInterval = null;
        }
        console.log("\u{1F50C} Connection pool shutdown complete");
      }
    };
    memoryOptimizer = new MemoryOptimizer();
    connectionPool = new ConnectionPool();
    globalStreamingProcessor = new StreamingFileProcessor();
  }
});

// server/session-manager.ts
var session_manager_exports = {};
__export(session_manager_exports, {
  sessionManager: () => sessionManager,
  setupSessionRoutes: () => setupSessionRoutes
});
function setupSessionRoutes(app2) {
  app2.post("/api/session/initialize", (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required" });
      }
      const userId = req.session?.user?.id;
      const userAgent = req.get("User-Agent");
      const ipAddress = req.ip || req.connection.remoteAddress;
      const session3 = sessionManager.initializeSession(sessionId, userId, userAgent, ipAddress);
      res.json({
        success: true,
        sessionId: session3.sessionId,
        message: "Session initialized successfully"
      });
    } catch (error) {
      console.error("[SessionRoutes] Error initializing session:", error);
      res.status(500).json({ error: "Failed to initialize session" });
    }
  });
  app2.post("/api/session/heartbeat", (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required" });
      }
      const updated = sessionManager.updateHeartbeat(sessionId);
      if (updated) {
        res.json({ success: true, message: "Heartbeat updated" });
      } else {
        res.status(404).json({ error: "Session not found" });
      }
    } catch (error) {
      console.error("[SessionRoutes] Error updating heartbeat:", error);
      res.status(500).json({ error: "Failed to update heartbeat" });
    }
  });
  app2.post("/api/session/cleanup", async (req, res) => {
    try {
      const { sessionId, reason } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required" });
      }
      await sessionManager.cleanupSession(sessionId, reason || "client_request");
      res.json({ success: true, message: "Session cleaned up successfully" });
    } catch (error) {
      console.error("[SessionRoutes] Error cleaning up session:", error);
      res.status(500).json({ error: "Failed to cleanup session" });
    }
  });
  app2.get("/api/session/stats", (req, res) => {
    try {
      const sessions = sessionManager.getAllSessions();
      const stats = {
        totalActiveSessions: sessions.size,
        sessions: Array.from(sessions.values()).map((session3) => ({
          sessionId: session3.sessionId,
          userId: session3.userId,
          lastHeartbeat: session3.lastHeartbeat,
          createdAt: session3.createdAt,
          userAgent: session3.userAgent,
          ipAddress: session3.ipAddress
        }))
      };
      res.json(stats);
    } catch (error) {
      console.error("[SessionRoutes] Error getting session stats:", error);
      res.status(500).json({ error: "Failed to get session stats" });
    }
  });
}
var SessionManager, sessionManager;
var init_session_manager = __esm({
  "server/session-manager.ts"() {
    init_storage();
    SessionManager = class {
      activeSessions = /* @__PURE__ */ new Map();
      cleanupInterval = null;
      SESSION_TIMEOUT = 5 * 60 * 1e3;
      // 5 minutes timeout
      constructor() {
        this.startCleanupTimer();
      }
      startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
          this.cleanupStaleSessions();
        }, 2 * 60 * 1e3);
        setInterval(() => {
          this.logSessionStatistics();
        }, 15 * 60 * 1e3);
        console.log("[SessionManager] Cleanup timers started");
      }
      logSessionStatistics() {
        const now = Date.now();
        const totalSessions = this.activeSessions.size;
        const staleSessions = Array.from(this.activeSessions.values()).filter((session3) => now - session3.lastHeartbeat.getTime() > this.SESSION_TIMEOUT).length;
        console.log(`[SessionManager] Session Stats - Total: ${totalSessions}, Stale: ${staleSessions}, Active: ${totalSessions - staleSessions}`);
        const memUsage = process.memoryUsage();
        console.log(`[SessionManager] Memory Usage - Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
      }
      // Public method to get session statistics
      getSessionStatistics() {
        const now = Date.now();
        const sessions = Array.from(this.activeSessions.values());
        return {
          totalSessions: sessions.length,
          activeSessions: sessions.filter((s) => now - s.lastHeartbeat.getTime() <= this.SESSION_TIMEOUT).length,
          staleSessions: sessions.filter((s) => now - s.lastHeartbeat.getTime() > this.SESSION_TIMEOUT).length,
          sessionsWithUsers: sessions.filter((s) => s.userId).length,
          oldestSession: sessions.length > 0 ? Math.max(...sessions.map((s) => now - s.createdAt.getTime())) : 0
        };
      }
      cleanupStaleSessions() {
        const now = /* @__PURE__ */ new Date();
        const staleSessionIds = [];
        this.activeSessions.forEach((session3, sessionId) => {
          const timeSinceLastHeartbeat = now.getTime() - session3.lastHeartbeat.getTime();
          if (timeSinceLastHeartbeat > this.SESSION_TIMEOUT) {
            staleSessionIds.push(sessionId);
          }
        });
        if (staleSessionIds.length > 0) {
          console.log(`[SessionManager] Cleaning up ${staleSessionIds.length} stale sessions`);
          for (const sessionId of staleSessionIds) {
            this.cleanupSession(sessionId, "timeout");
          }
        }
      }
      initializeSession(sessionId, userId, userAgent, ipAddress) {
        const session3 = {
          sessionId,
          userId,
          lastHeartbeat: /* @__PURE__ */ new Date(),
          createdAt: /* @__PURE__ */ new Date(),
          userAgent,
          ipAddress
        };
        this.activeSessions.set(sessionId, session3);
        console.log(`[SessionManager] Session initialized: ${sessionId} (user: ${userId || "anonymous"})`);
        return session3;
      }
      updateHeartbeat(sessionId) {
        const session3 = this.activeSessions.get(sessionId);
        if (session3) {
          session3.lastHeartbeat = /* @__PURE__ */ new Date();
          return true;
        }
        return false;
      }
      async cleanupSession(sessionId, reason) {
        const session3 = this.activeSessions.get(sessionId);
        if (!session3) {
          console.log(`[SessionManager] Session not found for cleanup: ${sessionId}`);
          return;
        }
        console.log(`[SessionManager] Cleaning up session ${sessionId} - reason: ${reason}`);
        try {
          await this.performStorageCleanup(session3);
          this.activeSessions.delete(sessionId);
          console.log(`[SessionManager] Session cleanup completed: ${sessionId}`);
        } catch (error) {
          console.error(`[SessionManager] Error during session cleanup: ${sessionId}`, error);
        }
      }
      async performStorageCleanup(session3) {
        try {
          if (session3.userId) {
            console.log(`[SessionManager] Cleaning up storage for user: ${session3.userId}`);
            const partialUploads2 = await storage.getPartialUploadsByUser(session3.userId);
            let cleanedPartialUploads = 0;
            for (const upload2 of partialUploads2) {
              const uploadAge = Date.now() - upload2.createdAt.getTime();
              const hasNoProgress = !upload2.uploadedChunks || upload2.uploadedChunks.length === 0;
              if (uploadAge > 2 * 60 * 60 * 1e3 || hasNoProgress) {
                try {
                  await storage.deletePartialUpload(upload2.id);
                  cleanedPartialUploads++;
                  console.log(`[SessionManager] Deleted partial upload: ${upload2.id} (age: ${Math.round(uploadAge / 6e4)}min)`);
                } catch (error) {
                  console.error(`[SessionManager] Error deleting partial upload ${upload2.id}:`, error);
                }
              }
            }
            if (cleanedPartialUploads > 0) {
              console.log(`[SessionManager] Cleaned up ${cleanedPartialUploads} partial uploads for user ${session3.userId}`);
            }
          }
          await this.cleanupTemporaryFiles(session3);
          await this.cleanupExpiredAccessRequests();
          this.triggerMemoryCleanup();
        } catch (error) {
          console.error("[SessionManager] Error during storage cleanup:", error);
        }
      }
      async cleanupTemporaryFiles(session3) {
        try {
          const fs6 = await import("fs").then((m) => m.promises);
          const path9 = await import("path");
          const tempDirs = [
            "./uploads/temp",
            "./storage/temp",
            "./temp"
          ];
          for (const tempDir of tempDirs) {
            try {
              const dirExists = await fs6.access(tempDir).then(() => true).catch(() => false);
              if (!dirExists) continue;
              const files2 = await fs6.readdir(tempDir);
              let cleanedFiles = 0;
              for (const file of files2) {
                try {
                  const filePath = path9.join(tempDir, file);
                  const stats = await fs6.stat(filePath);
                  const fileAge = Date.now() - stats.mtime.getTime();
                  if (fileAge > 60 * 60 * 1e3) {
                    await fs6.unlink(filePath);
                    cleanedFiles++;
                  }
                } catch (error) {
                  console.warn(`[SessionManager] Error processing temp file ${file}:`, error);
                }
              }
              if (cleanedFiles > 0) {
                console.log(`[SessionManager] Cleaned up ${cleanedFiles} temporary files from ${tempDir}`);
              }
            } catch (error) {
              console.warn(`[SessionManager] Error cleaning temp directory ${tempDir}:`, error);
            }
          }
        } catch (error) {
          console.error("[SessionManager] Error during temporary file cleanup:", error);
        }
      }
      async cleanupExpiredAccessRequests() {
        try {
          console.log("[SessionManager] Access request cleanup would happen here");
        } catch (error) {
          console.error("[SessionManager] Error during access request cleanup:", error);
        }
      }
      triggerMemoryCleanup() {
        try {
          if (global.gc) {
            global.gc();
            console.log("[SessionManager] Triggered garbage collection");
          }
          const memUsage = process.memoryUsage();
          console.log(`[SessionManager] Memory usage after cleanup: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        } catch (error) {
          console.warn("[SessionManager] Error during memory cleanup:", error);
        }
      }
      getActiveSessionCount() {
        return this.activeSessions.size;
      }
      getSessionInfo(sessionId) {
        return this.activeSessions.get(sessionId);
      }
      getAllSessions() {
        return new Map(this.activeSessions);
      }
      shutdown() {
        if (this.cleanupInterval) {
          clearInterval(this.cleanupInterval);
          this.cleanupInterval = null;
        }
        console.log(`[SessionManager] Shutting down, cleaning up ${this.activeSessions.size} active sessions`);
        const cleanupPromises = Array.from(this.activeSessions.keys()).map(
          (sessionId) => this.cleanupSession(sessionId, "server_shutdown")
        );
        return Promise.allSettled(cleanupPromises);
      }
    };
    sessionManager = new SessionManager();
    process.on("SIGTERM", () => {
      console.log("[SessionManager] Received SIGTERM, cleaning up sessions...");
      sessionManager.shutdown().then(() => {
        process.exit(0);
      });
    });
    process.on("SIGINT", () => {
      console.log("[SessionManager] Received SIGINT, cleaning up sessions...");
      sessionManager.shutdown().then(() => {
        process.exit(0);
      });
    });
  }
});

// server/cluster-manager.ts
var cluster_manager_exports = {};
__export(cluster_manager_exports, {
  ClusterManager: () => ClusterManager,
  clusterManager: () => clusterManager
});
import axios2 from "axios";
var ClusterManager, clusterManager;
var init_cluster_manager = __esm({
  "server/cluster-manager.ts"() {
    ClusterManager = class {
      workers = /* @__PURE__ */ new Map();
      healthCheckInterval = null;
      HEALTH_CHECK_INTERVAL = 3e4;
      // 30 seconds
      HEALTH_TIMEOUT = 1e4;
      // 10 seconds
      MAX_RESPONSE_TIME = 5e3;
      // 5 seconds
      roundRobinIndex = 0;
      constructor() {
        this.initializeWorkers();
        this.startHealthChecks();
      }
      initializeWorkers() {
        const workerUrls = (process.env.WORKER_SERVERS || "").split(",").map((url) => url.trim()).filter(Boolean);
        const uploadWorkers = (process.env.UPLOAD_WORKERS || "").split(",").map((url) => url.trim()).filter(Boolean);
        const chatWorkers = (process.env.CHAT_WORKERS || "").split(",").map((url) => url.trim()).filter(Boolean);
        console.log(`\u{1F50D} Direct environment parsing:`);
        console.log(`   Worker Servers: ${workerUrls.length} (${workerUrls.join(", ")})`);
        console.log(`   Upload Workers: ${uploadWorkers.length} (${uploadWorkers.join(", ")})`);
        console.log(`   Chat Workers: ${chatWorkers.length} (${chatWorkers.join(", ")})`);
        workerUrls.forEach((url, index) => {
          const worker = {
            id: `general-${index}`,
            url,
            type: "general",
            status: "unknown",
            lastHealthCheck: /* @__PURE__ */ new Date(),
            load: 0,
            connections: 0,
            memoryUsage: 0,
            responseTime: 0,
            capabilities: ["api", "websocket"],
            maxConnections: 1e3,
            maxMemory: 450
            // 450MB limit for Render free tier
          };
          this.workers.set(worker.id, worker);
        });
        uploadWorkers.forEach((url, index) => {
          const worker = {
            id: `upload-${index}`,
            url,
            type: "upload",
            status: "unknown",
            lastHealthCheck: /* @__PURE__ */ new Date(),
            load: 0,
            connections: 0,
            memoryUsage: 0,
            responseTime: 0,
            capabilities: ["file-upload", "stream-processing"],
            maxConnections: 100,
            // Lower for upload workers due to memory usage
            maxMemory: 400
            // More conservative for file processing
          };
          this.workers.set(worker.id, worker);
        });
        chatWorkers.forEach((url, index) => {
          const worker = {
            id: `chat-${index}`,
            url,
            type: "chat",
            status: "unknown",
            lastHealthCheck: /* @__PURE__ */ new Date(),
            load: 0,
            connections: 0,
            memoryUsage: 0,
            responseTime: 0,
            capabilities: ["websocket", "real-time"],
            maxConnections: 2e3,
            // Higher for chat workers
            maxMemory: 300
            // Lower memory footprint for chat
          };
          this.workers.set(worker.id, worker);
        });
        console.log(`\u{1F310} Initialized cluster with ${this.workers.size} worker servers:`);
        this.workers.forEach((worker) => {
          console.log(`  \u{1F4CD} ${worker.id} (${worker.type}): ${worker.url}`);
        });
      }
      startHealthChecks() {
        this.performHealthChecks();
        this.healthCheckInterval = setInterval(() => {
          this.performHealthChecks();
        }, this.HEALTH_CHECK_INTERVAL);
        console.log("\u{1F50D} Started health monitoring for cluster workers");
      }
      async performHealthChecks() {
        const healthPromises = Array.from(this.workers.values()).map(async (worker) => {
          try {
            const startTime = Date.now();
            const response = await axios2.get(`${worker.url}/api/health`, {
              timeout: this.HEALTH_TIMEOUT,
              headers: {
                "User-Agent": "ClusterManager/1.0"
              }
            });
            const responseTime = Date.now() - startTime;
            const healthData = response.data;
            worker.status = response.status === 200 ? "healthy" : "unhealthy";
            worker.lastHealthCheck = /* @__PURE__ */ new Date();
            worker.responseTime = responseTime;
            worker.memoryUsage = healthData.memory?.rss ? Math.round(healthData.memory.rss / 1024 / 1024) : 0;
            worker.connections = healthData.connections || 0;
            worker.load = this.calculateLoad(worker);
            if (worker.status === "unhealthy") {
              console.warn(`\u26A0\uFE0F  Worker ${worker.id} is unhealthy (${response.status})`);
            }
          } catch (error) {
            worker.status = "unhealthy";
            worker.lastHealthCheck = /* @__PURE__ */ new Date();
            worker.responseTime = this.HEALTH_TIMEOUT;
            console.error(`\u274C Health check failed for ${worker.id} (${worker.url}):`, {
              message: error.message,
              code: error.code,
              status: error.response?.status,
              timeout: error.timeout || false
            });
            if (Date.now() - worker.lastHealthCheck.getTime() > 3e5) {
              console.warn(`\u274C Worker ${worker.id} health check failed:`, error.message);
            }
          }
        });
        await Promise.allSettled(healthPromises);
        this.logClusterStatus();
      }
      calculateLoad(worker) {
        const connectionLoad = worker.connections / worker.maxConnections * 100;
        const memoryLoad = worker.memoryUsage / worker.maxMemory * 100;
        const responseLoad = Math.min(worker.responseTime / this.MAX_RESPONSE_TIME * 100, 100);
        return Math.round(connectionLoad * 0.4 + memoryLoad * 0.4 + responseLoad * 0.2);
      }
      logClusterStatus() {
        const metrics = this.getClusterMetrics();
        if (metrics.totalServers > 0) {
          if (metrics.healthyServers === 0) {
            console.error("\u{1F6A8} CRITICAL: No healthy workers in cluster!");
          } else if (metrics.healthyServers < metrics.totalServers) {
            console.warn(`\u26A0\uFE0F  Cluster degraded: ${metrics.healthyServers}/${metrics.totalServers} workers healthy`);
          }
        }
        if (Date.now() % 3e5 < this.HEALTH_CHECK_INTERVAL) {
          console.log("\u{1F4CA} Cluster Status:");
          console.log(`  \u{1F49A} Healthy: ${metrics.healthyServers}/${metrics.totalServers} workers`);
          console.log(`  \u{1F4C8} Average Load: ${metrics.totalLoad.toFixed(1)}%`);
          console.log(`  \u26A1 Average Response: ${metrics.averageResponseTime.toFixed(0)}ms`);
          console.log(`  \u{1F517} Total Connections: ${metrics.totalConnections}`);
          console.log(`  \u{1F4BE} Total Memory: ${metrics.totalMemoryUsage.toFixed(0)}MB`);
        }
      }
      getClusterMetrics() {
        const workers = Array.from(this.workers.values());
        const healthyWorkers = workers.filter((w) => w.status === "healthy");
        return {
          totalServers: workers.length,
          healthyServers: healthyWorkers.length,
          totalLoad: healthyWorkers.reduce((sum, w) => sum + w.load, 0) / Math.max(healthyWorkers.length, 1),
          averageResponseTime: healthyWorkers.reduce((sum, w) => sum + w.responseTime, 0) / Math.max(healthyWorkers.length, 1),
          totalConnections: healthyWorkers.reduce((sum, w) => sum + w.connections, 0),
          totalMemoryUsage: healthyWorkers.reduce((sum, w) => sum + w.memoryUsage, 0)
        };
      }
      getBestWorker(type = "general", capabilities = []) {
        const workers = Array.from(this.workers.values()).filter(
          (w) => w.status === "healthy" && (w.type === type || w.type === "general") && capabilities.every((cap) => w.capabilities.includes(cap))
        ).sort((a, b) => a.load - b.load);
        if (workers.length === 0) {
          console.warn(`No healthy workers available for type: ${type}`);
          return null;
        }
        return workers[0];
      }
      getRoundRobinWorker(type = "general") {
        const workers = Array.from(this.workers.values()).filter((w) => w.status === "healthy" && (w.type === type || w.type === "general"));
        if (workers.length === 0) {
          return null;
        }
        const worker = workers[this.roundRobinIndex % workers.length];
        this.roundRobinIndex++;
        return worker;
      }
      getAllWorkers() {
        return Array.from(this.workers.values());
      }
      getWorkerById(id) {
        return this.workers.get(id) || null;
      }
      async forwardRequest(worker, path9, method = "GET", data, headers) {
        try {
          const url = `${worker.url}${path9}`;
          const config = {
            method,
            url,
            timeout: 3e4,
            // 30 second timeout
            headers: {
              ...headers,
              "X-Forwarded-By": "ClusterManager",
              "X-Worker-Id": worker.id
            }
          };
          if (data && (method === "POST" || method === "PUT" || method === "PATCH")) {
            config.data = data;
          }
          const response = await axios2(config);
          return response.data;
        } catch (error) {
          console.error(`Request forwarding failed to worker ${worker.id}:`, error.message);
          if (error.response?.status >= 500 || error.code === "ECONNREFUSED") {
            worker.status = "unhealthy";
          }
          throw error;
        }
      }
      async broadcastToWorkers(path9, data, workerType) {
        const workers = Array.from(this.workers.values()).filter(
          (w) => w.status === "healthy" && (!workerType || w.type === workerType || w.type === "general")
        );
        const promises = workers.map(
          (worker) => this.forwardRequest(worker, path9, "POST", data).catch((error) => console.warn(`Broadcast failed to ${worker.id}:`, error.message))
        );
        await Promise.allSettled(promises);
      }
      addWorker(worker) {
        this.workers.set(worker.id, worker);
        console.log(`\u2795 Added worker ${worker.id} to cluster`);
      }
      removeWorker(workerId) {
        const removed = this.workers.delete(workerId);
        if (removed) {
          console.log(`\u2796 Removed worker ${workerId} from cluster`);
        }
        return removed;
      }
      shutdown() {
        if (this.healthCheckInterval) {
          clearInterval(this.healthCheckInterval);
          this.healthCheckInterval = null;
        }
        console.log("\u{1F50C} Cluster manager shutdown complete");
      }
      // Helper method to get worker statistics for monitoring
      getWorkerStats() {
        const stats = {};
        this.workers.forEach((worker, id) => {
          stats[id] = {
            url: worker.url,
            type: worker.type,
            status: worker.status,
            load: worker.load,
            connections: worker.connections,
            memoryUsage: worker.memoryUsage,
            responseTime: worker.responseTime,
            lastHealthCheck: worker.lastHealthCheck
          };
        });
        return stats;
      }
      // Load balancing strategies
      getWorkerByStrategy(strategy, type = "general") {
        switch (strategy) {
          case "least-load":
            return this.getBestWorker(type);
          case "round-robin":
            return this.getRoundRobinWorker(type);
          case "random":
            const workers = Array.from(this.workers.values()).filter((w) => w.status === "healthy" && (w.type === type || w.type === "general"));
            return workers.length > 0 ? workers[Math.floor(Math.random() * workers.length)] : null;
          default:
            return this.getBestWorker(type);
        }
      }
    };
    clusterManager = new ClusterManager();
  }
});

// server/load-balancer.ts
var load_balancer_exports = {};
__export(load_balancer_exports, {
  LoadBalancer: () => LoadBalancer,
  loadBalancer: () => loadBalancer
});
import crypto5 from "crypto";
import axios3 from "axios";
var LoadBalancer, loadBalancer;
var init_load_balancer = __esm({
  "server/load-balancer.ts"() {
    init_cluster_manager();
    LoadBalancer = class {
      config;
      requestMetrics = /* @__PURE__ */ new Map();
      circuitBreakers = /* @__PURE__ */ new Map();
      requestQueue = [];
      roundRobinCounters = /* @__PURE__ */ new Map();
      constructor(config = {}) {
        this.config = {
          strategy: "least-load",
          healthCheckInterval: 3e4,
          maxRetries: 3,
          retryDelay: 1e3,
          circuitBreakerThreshold: 5,
          circuitBreakerTimeout: 6e4,
          ...config
        };
        this.initializeMetrics();
        this.startMetricsCollection();
      }
      initializeMetrics() {
        clusterManager.getAllWorkers().forEach((worker) => {
          this.requestMetrics.set(worker.id, {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            requestsPerSecond: 0
          });
          this.circuitBreakers.set(worker.id, {
            state: "closed",
            failures: 0,
            lastFailure: /* @__PURE__ */ new Date(0),
            nextRetry: /* @__PURE__ */ new Date(0)
          });
        });
      }
      startMetricsCollection() {
        setInterval(() => {
          this.updateRequestsPerSecond();
          this.updateCircuitBreakers();
        }, 1e3);
        console.log("\u{1F4CA} Load balancer metrics collection started");
      }
      updateRequestsPerSecond() {
        const now = Date.now();
        this.requestMetrics.forEach((metrics, workerId) => {
          metrics.requestsPerSecond = metrics.totalRequests / (process.uptime() || 1);
        });
      }
      updateCircuitBreakers() {
        const now = /* @__PURE__ */ new Date();
        this.circuitBreakers.forEach((breaker, workerId) => {
          if (breaker.state === "open" && now >= breaker.nextRetry) {
            breaker.state = "half-open";
            console.log(`\u{1F504} Circuit breaker for worker ${workerId} moved to half-open`);
          }
          if (breaker.state === "closed" && now.getTime() - breaker.lastFailure.getTime() > 3e5) {
            breaker.failures = 0;
          }
        });
      }
      getLoadBalanceMiddleware() {
        return (req, res, next) => {
          this.handleRequest(req, res, next);
        };
      }
      async handleRequest(req, res, next) {
        const requestId = crypto5.randomUUID();
        const startTime = Date.now();
        try {
          const requestType = this.determineRequestType(req.path);
          const worker = await this.selectWorker(requestType, req);
          if (!worker) {
            res.status(503).json({
              error: "No available workers",
              requestId
            });
            return;
          }
          const breaker = this.circuitBreakers.get(worker.id);
          if (breaker?.state === "open") {
            throw new Error(`Circuit breaker open for worker ${worker.id}`);
          }
          await this.forwardRequest(worker, req, res, requestId);
          this.recordRequestSuccess(worker.id, Date.now() - startTime);
          if (breaker?.state === "half-open") {
            breaker.state = "closed";
            breaker.failures = 0;
            console.log(`\u2705 Circuit breaker for worker ${worker.id} closed`);
          }
        } catch (error) {
          console.error(`Request ${requestId} failed:`, error.message);
          const retryResult = await this.retryRequest(req, res, requestId, 0);
          if (!retryResult) {
            this.recordRequestFailure(requestId, error);
            res.status(503).json({
              error: "All workers unavailable",
              requestId,
              details: error.message
            });
          }
        }
      }
      determineRequestType(path9) {
        if (path9.includes("/files/upload") || path9.includes("/files/download")) {
          return "upload";
        }
        if (path9.includes("/messages") || path9.includes("/websocket")) {
          return "chat";
        }
        return "general";
      }
      async selectWorker(type, req) {
        const availableWorkers = clusterManager.getAllWorkers().filter(
          (w) => w.status === "healthy" && (w.type === type || w.type === "general") && this.circuitBreakers.get(w.id)?.state !== "open"
        );
        if (availableWorkers.length === 0) {
          return null;
        }
        switch (this.config.strategy) {
          case "round-robin":
            return this.selectRoundRobin(availableWorkers, type);
          case "least-connections":
            return this.selectLeastConnections(availableWorkers);
          case "least-load":
            return this.selectLeastLoad(availableWorkers);
          case "weighted":
            return this.selectWeighted(availableWorkers, req);
          default:
            return availableWorkers[0];
        }
      }
      selectRoundRobin(workers, type) {
        const counter = this.roundRobinCounters.get(type) || 0;
        const selectedWorker = workers[counter % workers.length];
        this.roundRobinCounters.set(type, counter + 1);
        return selectedWorker;
      }
      selectLeastConnections(workers) {
        return workers.reduce(
          (best, current) => current.connections < best.connections ? current : best
        );
      }
      selectLeastLoad(workers) {
        return workers.reduce(
          (best, current) => current.load < best.load ? current : best
        );
      }
      selectWeighted(workers, req) {
        const weightedWorkers = workers.map((worker) => {
          let weight = 100;
          weight = weight * (1 - worker.load / 100);
          weight = weight * (1 - Math.min(worker.responseTime / 5e3, 0.8));
          weight = weight * (1 - worker.memoryUsage / worker.maxMemory);
          const requestType = this.determineRequestType(req.path);
          const hasOptimalCapability = worker.capabilities.some((cap) => {
            if (requestType === "upload" && cap === "file-upload") return true;
            if (requestType === "chat" && cap === "real-time") return true;
            return false;
          });
          if (hasOptimalCapability) {
            weight = weight * 1.5;
          }
          return { worker, weight: Math.max(weight, 1) };
        });
        const totalWeight = weightedWorkers.reduce((sum, w) => sum + w.weight, 0);
        let random = Math.random() * totalWeight;
        for (const { worker, weight } of weightedWorkers) {
          random -= weight;
          if (random <= 0) {
            return worker;
          }
        }
        return weightedWorkers[0].worker;
      }
      async forwardRequest(worker, req, res, requestId) {
        try {
          const headers = {
            ...req.headers,
            "x-forwarded-for": req.ip,
            "x-forwarded-proto": req.protocol,
            "x-request-id": requestId,
            "x-worker-id": worker.id
          };
          const cleanHeaders = { ...headers };
          delete cleanHeaders["connection"];
          delete cleanHeaders["keep-alive"];
          delete cleanHeaders["proxy-authenticate"];
          delete cleanHeaders["proxy-authorization"];
          delete cleanHeaders["te"];
          delete cleanHeaders["trailers"];
          delete cleanHeaders["transfer-encoding"];
          delete cleanHeaders["upgrade"];
          const config = {
            method: req.method,
            url: `${worker.url}${req.path}`,
            params: req.query,
            headers: cleanHeaders,
            timeout: 3e4,
            validateStatus: () => true
            // Don't throw on any status code
          };
          if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
            config.data = req.body;
          }
          const response = await axios3(config);
          Object.entries(response.headers).forEach(([key, value]) => {
            if (key.toLowerCase() !== "transfer-encoding") {
              res.setHeader(key, value);
            }
          });
          res.status(response.status);
          if (response.data) {
            res.send(response.data);
          } else {
            res.end();
          }
        } catch (error) {
          console.error(`Error forwarding request to worker ${worker.id}:`, error.message);
          const breaker = this.circuitBreakers.get(worker.id);
          if (breaker) {
            breaker.failures++;
            breaker.lastFailure = /* @__PURE__ */ new Date();
            if (breaker.failures >= this.config.circuitBreakerThreshold) {
              breaker.state = "open";
              breaker.nextRetry = new Date(Date.now() + this.config.circuitBreakerTimeout);
              console.warn(`\u26A0\uFE0F  Circuit breaker opened for worker ${worker.id} (${breaker.failures} failures)`);
            }
          }
          throw error;
        }
      }
      async retryRequest(req, res, requestId, retryCount) {
        if (retryCount >= this.config.maxRetries) {
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay * Math.pow(2, retryCount)));
        try {
          const requestType = this.determineRequestType(req.path);
          const worker = await this.selectWorker(requestType, req);
          if (!worker) {
            return false;
          }
          await this.forwardRequest(worker, req, res, requestId);
          console.log(`\u2705 Request ${requestId} succeeded on retry ${retryCount + 1}`);
          return true;
        } catch (error) {
          console.warn(`Retry ${retryCount + 1} failed for request ${requestId}`);
          return this.retryRequest(req, res, requestId, retryCount + 1);
        }
      }
      recordRequestSuccess(workerId, responseTime) {
        const metrics = this.requestMetrics.get(workerId);
        if (metrics) {
          metrics.totalRequests++;
          metrics.successfulRequests++;
          metrics.averageResponseTime = (metrics.averageResponseTime * (metrics.successfulRequests - 1) + responseTime) / metrics.successfulRequests;
        }
      }
      recordRequestFailure(requestId, error) {
        console.error(`Request ${requestId} failed completely:`, error.message);
      }
      getMetrics() {
        let totalRequests = 0;
        let totalSuccessful = 0;
        let totalFailed = 0;
        let totalResponseTime = 0;
        let activeWorkers = 0;
        const workerMetrics = {};
        const circuitBreakerStatus = {};
        this.requestMetrics.forEach((metrics, workerId) => {
          workerMetrics[workerId] = { ...metrics };
          totalRequests += metrics.totalRequests;
          totalSuccessful += metrics.successfulRequests;
          totalFailed += metrics.failedRequests;
          if (metrics.totalRequests > 0) {
            totalResponseTime += metrics.averageResponseTime;
            activeWorkers++;
          }
        });
        this.circuitBreakers.forEach((breaker, workerId) => {
          circuitBreakerStatus[workerId] = {
            state: breaker.state,
            failures: breaker.failures,
            lastFailure: breaker.lastFailure
          };
        });
        return {
          strategy: this.config.strategy,
          totalRequests,
          successfulRequests: totalSuccessful,
          failedRequests: totalFailed,
          averageResponseTime: activeWorkers > 0 ? totalResponseTime / activeWorkers : 0,
          workerMetrics,
          circuitBreakers: circuitBreakerStatus
        };
      }
      updateStrategy(strategy) {
        this.config.strategy = strategy;
        console.log(`\u{1F504} Load balancing strategy changed to: ${strategy}`);
      }
      getHealthStatus() {
        const workers = clusterManager.getAllWorkers();
        const healthyWorkers = workers.filter((w) => w.status === "healthy").length;
        const openCircuitBreakers = Array.from(this.circuitBreakers.values()).filter((b) => b.state === "open").length;
        let status = "healthy";
        if (healthyWorkers === 0) {
          status = "unhealthy";
        } else if (healthyWorkers < workers.length * 0.7 || openCircuitBreakers > 0) {
          status = "degraded";
        }
        return {
          status,
          totalWorkers: workers.length,
          healthyWorkers,
          openCircuitBreakers
        };
      }
      shutdown() {
        this.requestMetrics.clear();
        this.circuitBreakers.clear();
        this.requestQueue.length = 0;
        this.roundRobinCounters.clear();
        console.log("\u{1F50C} Load balancer shutdown complete");
      }
    };
    loadBalancer = new LoadBalancer();
  }
});

// server/neon-manager.ts
var neon_manager_exports = {};
__export(neon_manager_exports, {
  default: () => neon_manager_default,
  getDbSizeBytes: () => getDbSizeBytes,
  getMainExtractedDb: () => getMainExtractedDb,
  getNeonDbUrls: () => getNeonDbUrls,
  importVideoMappingsFromJson: () => importVideoMappingsFromJson,
  importVideoMappingsIntoAllNeons: () => importVideoMappingsIntoAllNeons,
  importVideoMappingsToAll: () => importVideoMappingsToAll,
  replicateExtractedVideoMappings: () => replicateExtractedVideoMappings,
  setMainExtractedDb: () => setMainExtractedDb,
  tryReplicateToAnotherNeon: () => tryReplicateToAnotherNeon
});
import { Client } from "pg";
import fetch from "node-fetch";
import fs2 from "fs";
import path3 from "path";
async function getNeonDbUrls(opts) {
  const includeEnv = opts?.includeEnv !== false;
  const includeBackup = opts?.includeBackup !== false;
  const includeAirtable = opts?.includeAirtable !== false;
  const includeHardcoded = opts?.includeHardcoded !== false;
  const sources = {};
  let urls = [];
  if (includeBackup) {
    const backupStrings = process.env.BACKUP_STRINGS || "";
    if (backupStrings) {
      const backupUrls = backupStrings.split(",").map((u) => u.trim()).filter(Boolean);
      urls = urls.concat(backupUrls.filter((u) => !urls.includes(u)));
      backupUrls.forEach((u) => sources[u] = "backup");
      console.log("[NeonManager] Using BACKUP_STRINGS entries:", backupUrls.length);
    }
  }
  if (includeEnv) {
    const dbUrl = process.env.DATABASE_URL || "";
    if (dbUrl) {
      const envUrls = dbUrl.split(",").map((u) => u.trim()).filter(Boolean);
      urls = urls.concat(envUrls.filter((u) => !urls.includes(u)));
      envUrls.forEach((u) => sources[u] = "env");
      console.log("[NeonManager] process.env.DATABASE_URL entries:", envUrls.length);
    }
  }
  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const airtableBase = process.env.AIRTABLE_BASE_ID;
  const airtableTable = process.env.AIRTABLE_TABLE_ID;
  const skipAirtable = String(process.env.SKIP_AIRTABLE || "").toLowerCase() === "true";
  if (includeAirtable && !skipAirtable && airtableApiKey && airtableBase && airtableTable) {
    try {
      const res = await fetch(`https://api.airtable.com/v0/${airtableBase}/${airtableTable}`, {
        headers: { Authorization: `Bearer ${airtableApiKey}` }
      });
      if (res.ok) {
        const json = await res.json();
        const airtableUrls = (json.records || []).map((r) => (r.fields?.connectionstring || "").trim()).filter(Boolean);
        console.log("[NeonManager] Airtable returned", airtableUrls.length, "urls");
        airtableUrls.filter((u) => !urls.includes(u)).forEach((u) => {
          urls.push(u);
          sources[u] = "airtable";
        });
      }
    } catch (err) {
      console.warn("Failed to fetch Neon connection strings from Airtable", err);
    }
  }
  const hardcodedExtractedDb = process.env.HARDCODED_EXTRACTED_DB || "";
  if (includeHardcoded && hardcodedExtractedDb && !urls.includes(hardcodedExtractedDb)) {
    urls.push(hardcodedExtractedDb);
    sources[hardcodedExtractedDb] = "hardcoded";
  }
  console.log("[NeonManager] Final urls count:", urls.length);
  console.log("[NeonManager] Url sources sample:", Object.entries(sources).slice(0, 10));
  try {
    const { promises: fsp } = await import("fs");
    const metaPath = path3.resolve(process.cwd(), "meta", "extracted_main.json");
    if (fs2.existsSync(metaPath)) {
      const raw = await fsp.readFile(metaPath, "utf8");
      const json = JSON.parse(raw);
      const mainConn = json && json.main || "";
      if (mainConn && !urls.includes(mainConn)) {
        urls.unshift(mainConn);
      } else if (mainConn && urls.includes(mainConn)) {
        urls.splice(urls.indexOf(mainConn), 1);
        urls.unshift(mainConn);
      }
    }
  } catch (err) {
  }
  return urls;
}
async function importVideoMappingsToAll(jsonFilePath, options) {
  const results = [];
  const urls = await getNeonDbUrls();
  for (const url of urls) {
    try {
      console.log(`[NeonManager] Importing to ${url}`);
      const res = await importVideoMappingsFromJson(url, jsonFilePath);
      results.push({ url, ok: true, res });
    } catch (err) {
      console.warn(`[NeonManager] Import failed for ${url}`, err?.message || err);
      results.push({ url, ok: false, err: String(err?.message || err) });
    }
  }
  return results;
}
async function replicateExtractedVideoMappings(sourceConn, targetConn) {
  const src = new Client({ connectionString: sourceConn });
  const dst = new Client({ connectionString: targetConn });
  await src.connect();
  await dst.connect();
  try {
    const tableCheck = await dst.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_mappings');`);
    if (!tableCheck.rows[0].exists) {
      return { inserted: 0, skipped: 0 };
    }
    const targetRows = await dst.query("SELECT id FROM video_mappings");
    const targetIds = new Set(targetRows.rows.map((r) => String(r.id)));
    const batchSize = 200;
    let offset = 0;
    let inserted = 0;
    let skipped = 0;
    while (true) {
      const res = await src.query(`SELECT * FROM video_mappings ORDER BY id LIMIT ${batchSize} OFFSET ${offset}`);
      if (!res.rows || res.rows.length === 0) break;
      for (const row of res.rows) {
        const id = String(row.id);
        if (targetIds.has(id)) {
          skipped++;
          continue;
        }
        const cols = Object.keys(row).map((c) => '"' + c + '"').join(", ");
        const vals = Object.values(row);
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
        try {
          await dst.query(`INSERT INTO video_mappings (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
          inserted++;
          targetIds.add(id);
        } catch (e) {
          console.warn("Failed to insert row into target extracted DB", e.message || e);
        }
      }
      if (res.rows.length < batchSize) break;
      offset += batchSize;
    }
    return { inserted, skipped };
  } finally {
    await src.end();
    await dst.end();
  }
}
async function tryReplicateToAnotherNeon(thresholdBytes = 0) {
  const urls = await getNeonDbUrls();
  if (urls.length < 2) {
    console.warn("No additional Neon DBs available to replicate to");
    return;
  }
  const primary = urls[0];
  const target = urls.find((u) => u !== primary) || urls[1];
  try {
    const result = await replicateExtractedVideoMappings(primary, target);
    console.log(`[NeonManager] Replication done inserted=${result.inserted} skipped=${result.skipped}`);
  } catch (err) {
    console.warn("Neon replication failed", err);
  }
}
async function getDbSizeBytes(connString) {
  try {
    const { Client: Client2 } = await import("pg");
    const client = new Client2({ connectionString: connString });
    await client.connect();
    const res = await client.query(`SELECT pg_database_size(current_database()) as size`);
    await client.end();
    if (!res.rows || res.rows.length === 0) return null;
    return Number(res.rows[0].size || 0);
  } catch (err) {
    console.warn("Failed to get DB size for Neon server", err?.message || err);
    return null;
  }
}
async function getMainExtractedDb() {
  const envVal = process.env.HARDCODED_EXTRACTED_DB || null;
  if (envVal) return envVal;
  try {
    const { promises: fsp } = await import("fs");
    const metaPath = path3.resolve(process.cwd(), "meta", "extracted_main.json");
    if (!fs2.existsSync(metaPath)) return null;
    const raw = await fsp.readFile(metaPath, "utf8");
    const json = JSON.parse(raw);
    return json && json.main || null;
  } catch (err) {
    return null;
  }
}
async function setMainExtractedDb(connString) {
  try {
    const { promises: fsp } = await import("fs");
    const metaDir = path3.resolve(process.cwd(), "meta");
    if (!fs2.existsSync(metaDir)) await fsp.mkdir(metaDir, { recursive: true });
    const metaPath = path3.resolve(metaDir, "extracted_main.json");
    await fsp.writeFile(metaPath, JSON.stringify({ main: connString }), "utf8");
  } catch (err) {
    console.warn("Failed to persist main extracted DB selection", err?.message || err);
  }
}
async function importVideoMappingsFromJson(targetConn, jsonFilePath) {
  const { promises: fsp } = await import("fs");
  const path9 = jsonFilePath;
  const content = await fsp.readFile(path9, "utf-8");
  let rows;
  try {
    rows = JSON.parse(content);
    if (!Array.isArray(rows)) throw new Error("JSON root is not an array");
  } catch (err) {
    console.warn("Failed to parse json file for import", err?.message || err);
    throw err;
  }
  const dst = new Client({ connectionString: targetConn });
  await dst.connect();
  try {
    const tableCheck = await dst.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_mappings');`);
    if (!tableCheck.rows[0].exists) {
      console.log("[NeonManager] video_mappings table not found in target DB; attempting to create minimal schema");
      try {
        await dst.query(`CREATE TABLE IF NOT EXISTS video_mappings (
          id varchar(255) PRIMARY KEY,
          name text,
          video text,
          m3u8 text,
          image text,
          thumbnail text,
          url text,
          uploaddate timestamp,
          tags text,
          uploadedby text,
          size bigint,
          type text,
          duration numeric,
          last_updated timestamp,
          meta jsonb
        );`);
        console.log("[NeonManager] Created minimal video_mappings table in target DB");
      } catch (err) {
        console.warn("[NeonManager] Failed to create video_mappings table in target DB", err?.message || err);
        return { inserted: 0, skipped: rows.length || 0 };
      }
    }
    const batchSize = 200;
    let inserted = 0;
    let skipped = 0;
    const colRes = await dst.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'video_mappings'`);
    const allowedCols = new Set(colRes.rows.map((r) => r.column_name));
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      for (const row of batch) {
        const filteredKeys = Object.keys(row).filter((k) => allowedCols.has(k));
        if (filteredKeys.length === 0) {
          skipped++;
          continue;
        }
        const cols = filteredKeys.map((c) => '"' + c + '"').join(", ");
        const vals = filteredKeys.map((k) => row[k]);
        const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(", ");
        try {
          const res = await dst.query(`INSERT INTO video_mappings (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
          if (typeof res.rowCount === "number") {
            if (res.rowCount > 0) inserted += res.rowCount;
            else skipped++;
          } else {
            inserted++;
          }
        } catch (err) {
          skipped++;
          console.warn("Failed to insert row from json into target extracted DB", err?.message || err);
        }
      }
    }
    return { inserted, skipped };
  } finally {
    await dst.end();
  }
}
async function importVideoMappingsIntoAllNeons(jsonFilePath, opts) {
  const results = [];
  const { promises: fsp } = await import("fs");
  const raw = await fsp.readFile(jsonFilePath, "utf8");
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error("JSON root is not array");
  console.log("[NeonManager] importVideoMappingsIntoAllNeons: rows length:", rows.length);
  const urls = await getNeonDbUrls();
  console.log("[NeonManager] importVideoMappingsIntoAllNeons: will process urls count:", urls.length);
  for (const url of urls) {
    console.log(`[NeonManager] importVideoMappingsIntoAllNeons: processing ${url}`);
    try {
      const client = new Client({ connectionString: url });
      await client.connect();
      const tableCheck = await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_mappings');`);
      if (!tableCheck.rows[0].exists) {
        await client.query(`CREATE TABLE IF NOT EXISTS video_mappings (
          id varchar(255) PRIMARY KEY,
          name text,
          video text,
          m3u8 text,
          image text,
          thumbnail text,
          url text,
          uploaddate timestamp,
          tags text,
          uploadedby text,
          size bigint,
          type text,
          duration numeric,
          last_updated timestamp,
          meta jsonb
        );`);
      }
      const allIds = rows.map((r) => String(r.id));
      const chunkSize = 1e3;
      const existing = /* @__PURE__ */ new Set();
      for (let i = 0; i < allIds.length; i += chunkSize) {
        const chunk = allIds.slice(i, i + chunkSize);
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(", ");
        const res = await client.query(`SELECT id FROM video_mappings WHERE id IN (${placeholders})`, chunk);
        for (const r of res.rows) existing.add(String(r.id));
      }
      const colRes = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'video_mappings'`);
      const allowedCols = new Set(colRes.rows.map((r) => r.column_name));
      let inserted = 0;
      let skipped = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const batch = rows.slice(i, i + chunkSize);
        const toInsert = batch.filter((r) => !existing.has(String(r.id)));
        if (toInsert.length === 0) {
          skipped += batch.length;
          continue;
        }
        const cols = Object.keys(toInsert[0]).filter((k) => allowedCols.has(k));
        const colList = cols.map((c) => '"' + c + '"').join(", ");
        const values = [];
        const valuePlaceholders = [];
        toInsert.forEach((row, rowIdx) => {
          const rowPlaceholders = cols.map((_, colIdx) => `$${rowIdx * cols.length + colIdx + 1}`);
          valuePlaceholders.push(`(${rowPlaceholders.join(",")})`);
          cols.forEach((c) => values.push(row[c]));
        });
        const query = `INSERT INTO video_mappings (${colList}) VALUES ${valuePlaceholders.join(",")} ON CONFLICT DO NOTHING`;
        try {
          const r = await client.query(query, values);
          if (typeof r.rowCount === "number") inserted += r.rowCount;
          else inserted += toInsert.length;
        } catch (err) {
          console.warn(`[NeonManager] Failed inserting batch to ${url}`, err?.message || err);
          for (const row of toInsert) {
            const cols2 = Object.keys(row);
            const cols2List = cols2.map((c) => '"' + c + '"').join(", ");
            const vals = Object.values(row);
            const ph = vals.map((_, idx) => `$${idx + 1}`).join(", ");
            try {
              await client.query(`INSERT INTO video_mappings (${cols2List}) VALUES (${ph}) ON CONFLICT DO NOTHING`, vals);
              inserted++;
            } catch (e) {
              skipped++;
            }
          }
        }
      }
      await client.end();
      results.push({ url, inserted, skipped });
      console.log(`[NeonManager] importVideoMappingsIntoAllNeons: done ${url} inserted=${inserted} skipped=${skipped}`);
    } catch (err) {
      console.warn(`[NeonManager] Import to ${url} failed`, err?.message || err);
      if (!opts?.ignoreErrors) results.push({ url, inserted: 0, skipped: 0, error: String(err?.message || err) });
      else results.push({ url, inserted: 0, skipped: 0, error: String(err?.message || err) });
    }
  }
  return { perDb: results };
}
var neon_manager_default;
var init_neon_manager = __esm({
  "server/neon-manager.ts"() {
    neon_manager_default = { getNeonDbUrls, replicateExtractedVideoMappings, tryReplicateToAnotherNeon, getDbSizeBytes, importVideoMappingsFromJson, importVideoMappingsIntoAllNeons, getMainExtractedDb, setMainExtractedDb };
  }
});

// server/index.ts
import dotenv2 from "dotenv";
import express3 from "express";
import path8 from "path";
import { fileURLToPath } from "url";

// server/routes.ts
import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket as WebSocket2 } from "ws";
import multer2 from "multer";
import crypto6 from "crypto";
import path4 from "path";
import ffmpeg2 from "fluent-ffmpeg";
import { path as ffmpegPath2 } from "@ffmpeg-installer/ffmpeg";
import { path as ffprobePath2 } from "@ffprobe-installer/ffprobe";

// server/auth.ts
init_storage();
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session2 from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
var scryptAsync = promisify(scrypt);
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}
async function comparePasswords(supplied, stored) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = await scryptAsync(supplied, salt, 64);
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
function setupAuth(app2) {
  const sessionSettings = {
    secret: process.env.SESSION_SECRET || "default-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 1e3 * 60 * 60 * 24 * 7,
      // 1 week
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && process.env.HTTPS === "true",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax"
    },
    // Add session error handling
    genid: () => {
      return randomBytes(16).toString("hex");
    }
  };
  storage.sessionStore.on("error", (error) => {
    console.error("\u274C Session store error:", error);
  });
  storage.sessionStore.on("disconnect", () => {
    console.warn("\u26A0\uFE0F Session store disconnected");
  });
  storage.sessionStore.on("connect", () => {
    console.log("\u2705 Session store connected");
  });
  app2.set("trust proxy", 1);
  app2.use(session2(sessionSettings));
  app2.use(passport.initialize());
  app2.use(passport.session());
  app2.use((err, req, res, next) => {
    if (err && err.message && err.message.includes("Failed to deserialize user")) {
      console.log("\u{1F504} Clearing invalid session due to deserialization error");
      req.logout((logoutErr) => {
        if (logoutErr) {
          console.error("\u274C Error during logout after deserialization failure:", logoutErr);
        }
        req.session.destroy(() => {
          res.clearCookie("connect.sid");
          next();
        });
      });
    } else {
      next(err);
    }
  });
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !await comparePasswords(password, user.password)) {
          return done(null, false);
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );
  passport.serializeUser((user, done) => {
    if (!user || !user.id) {
      return done(new Error("User object is invalid for serialization"), false);
    }
    done(null, user.id);
  });
  passport.deserializeUser(async (id, done) => {
    try {
      if (!id || typeof id !== "string") {
        console.log(`\u26A0\uFE0F Invalid user ID in session: ${id}`);
        return done(null, false);
      }
      const user = await storage.getUser(id);
      if (!user) {
        console.log(`\u26A0\uFE0F User not found in database for ID: ${id}`);
        return done(null, false);
      }
      if (!global.authLogThrottle) global.authLogThrottle = /* @__PURE__ */ new Map();
      const lastLog = global.authLogThrottle.get(`user-deserialized-${user.id}`) || 0;
      if (Date.now() - lastLog > 3e4) {
        console.log(`\u2705 User deserialized successfully: ${user.username} (${user.id})`);
        global.authLogThrottle.set(`user-deserialized-${user.id}`, Date.now());
      }
      done(null, user);
    } catch (error) {
      console.error("\u274C Error during user deserialization:", error);
      done(null, false);
    }
  });
  app2.post("/api/register", async (req, res, next) => {
    try {
      console.log(`\u{1F510} Registration attempt for username: ${req.body.username}, email: ${req.body.email}`);
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log(`\u26A0\uFE0F Username ${req.body.username} already exists`);
        return res.status(400).json({ error: "Username already exists" });
      }
      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        console.log(`\u26A0\uFE0F Email ${req.body.email} already exists`);
        return res.status(400).json({ error: "Email already exists" });
      }
      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password)
      });
      console.log(`\u2705 User created successfully: ${user.username} (${user.id})`);
      req.login(user, (err) => {
        if (err) {
          console.error("\u274C Auto-login after registration failed:", err);
          return next(err);
        }
        console.log(`\u{1F510} User ${user.username} auto-logged in after registration`);
        res.status(201).json(user);
      });
    } catch (error) {
      console.error("\u274C Registration error:", error);
      next(error);
    }
  });
  app2.post("/api/login", (req, res, next) => {
    console.log(`\u{1F510} Login attempt for username: ${req.body.username}`);
    passport.authenticate("local", async (err, user, info) => {
      if (err) {
        console.error("\u274C Login error:", err);
        return next(err);
      }
      if (!user) {
        console.log(`\u26A0\uFE0F Login failed for username: ${req.body.username}`);
        return res.status(401).json({ error: "Invalid username or password" });
      }
      req.logIn(user, (err2) => {
        if (err2) {
          console.error("\u274C Session creation failed:", err2);
          return next(err2);
        }
        console.log(`\u2705 User ${user.username} (${user.id}) logged in successfully`);
        res.status(200).json(user);
      });
    })(req, res, next);
  });
  app2.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });
  app2.get("/api/user", (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        console.log("\u{1F510} User check: not authenticated");
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!req.user) {
        console.log("\u{1F510} User check: no user object in session");
        return res.status(401).json({ error: "Invalid session" });
      }
      console.log(`\u{1F510} User check: authenticated as ${req.user?.username} (${req.user?.id})`);
      res.json(req.user);
    } catch (error) {
      console.error("\u274C Error in /api/user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.use("/api", (err, req, res, next) => {
    if (err && (err.message?.includes("deserialize") || err.message?.includes("session") || err.message?.includes("passport"))) {
      console.log("\u{1F504} Clearing session due to authentication error:", err.message);
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.status(401).json({ error: "Session expired, please login again" });
      });
    } else {
      next(err);
    }
  });
  return sessionSettings;
}

// server/routes.ts
init_storage();
init_dropbox_manager();
init_db();
init_schema();
import { fromZodError } from "zod-validation-error";
import fetch2 from "node-fetch";
import fs3 from "fs";
import { eq as eq3, and as and2, or as or2, ilike as ilike2, exists as exists2, isNotNull as isNotNull2, sql as sql3 } from "drizzle-orm";

// server/distributed-chunk-manager.ts
import axios from "axios";
import crypto2 from "crypto";
var DistributedChunkManager = class {
  uploadServers = /* @__PURE__ */ new Map();
  pendingJobs = /* @__PURE__ */ new Map();
  activeJobs = /* @__PURE__ */ new Map();
  completedJobs = /* @__PURE__ */ new Map();
  MAX_CONCURRENT_JOBS_PER_SERVER = parseInt(process.env.MAX_JOBS_PER_SERVER || "5");
  JOB_TIMEOUT_MS = parseInt(process.env.JOB_TIMEOUT_MS || "300000");
  // 5 minutes
  SERVER_HEALTH_CHECK_INTERVAL = parseInt(process.env.SERVER_HEALTH_INTERVAL || "60000");
  // 1 minute
  MAX_UPLOAD_SERVERS = parseInt(process.env.MAX_UPLOAD_SERVERS || "50000");
  // Support up to 50k servers
  healthCheckInterval = null;
  jobMonitorInterval = null;
  constructor() {
    this.startHealthMonitoring();
    this.startJobMonitoring();
    this.loadUploadServers();
    this.performHealthChecks().catch((err) => {
      console.warn("Initial health check failed:", err?.message || err);
    });
  }
  /**
   * Load upload servers from environment variables and external sources
   */
  loadUploadServers() {
    console.log("\u{1F504} Loading upload servers...");
    const envServers = [
      ...(process.env.UPLOAD_WORKERS || "").split(",").filter(Boolean),
      ...(process.env.ADDITIONAL_UPLOAD_SERVERS || "").split(",").filter(Boolean),
      ...(process.env.MEGA_UPLOAD_FLEET || "").split(",").filter(Boolean)
    ];
    this.loadExternalServerList();
    let loadedCount = 0;
    envServers.forEach((url, index) => {
      if (loadedCount >= this.MAX_UPLOAD_SERVERS) {
        console.warn(`\u26A0\uFE0F Maximum server limit reached (${this.MAX_UPLOAD_SERVERS}), skipping remaining servers`);
        return;
      }
      const trimmedUrl = url.trim();
      if (trimmedUrl && this.isValidServerUrl(trimmedUrl)) {
        const serverId = this.generateServerId(trimmedUrl);
        this.uploadServers.set(serverId, {
          id: serverId,
          url: trimmedUrl,
          isActive: false,
          // Will be verified by health check
          currentJobs: 0,
          maxConcurrentJobs: this.MAX_CONCURRENT_JOBS_PER_SERVER,
          lastSeen: 0,
          lastHealthCheck: /* @__PURE__ */ new Date(),
          consecutiveFailures: 0,
          totalJobsCompleted: 0,
          averageUploadTime: 0,
          region: this.extractRegionFromUrl(trimmedUrl)
        });
        loadedCount++;
      }
    });
    console.log(`\u{1F4E1} Loaded ${this.uploadServers.size} upload servers for distributed processing`);
    if (this.uploadServers.size === 0) {
      console.warn("\u26A0\uFE0F No upload servers configured! Falling back to local processing.");
    }
  }
  /**
   * Load servers from external configuration file or API
   */
  async loadExternalServerList() {
    try {
      const externalListUrl = process.env.EXTERNAL_SERVER_LIST_URL;
      if (externalListUrl) {
        console.log("\u{1F310} Loading servers from external list...");
        const response = await axios.get(externalListUrl, { timeout: 1e4 });
        if (Array.isArray(response.data)) {
          response.data.forEach((serverConfig) => {
            if (typeof serverConfig === "string") {
              this.addServer(serverConfig);
            } else if (serverConfig.url) {
              this.addServer(serverConfig.url, {
                maxJobs: serverConfig.maxJobs,
                region: serverConfig.region
              });
            }
          });
        }
      }
    } catch (error) {
      console.warn("\u26A0\uFE0F Failed to load external server list:", error.message);
    }
  }
  /**
   * Add a single server to the pool
   */
  addServer(url, options = {}) {
    if (this.uploadServers.size >= this.MAX_UPLOAD_SERVERS) {
      console.warn(`\u26A0\uFE0F Cannot add server ${url}: Maximum limit (${this.MAX_UPLOAD_SERVERS}) reached`);
      return false;
    }
    if (!this.isValidServerUrl(url)) {
      console.warn(`\u26A0\uFE0F Invalid server URL: ${url}`);
      return false;
    }
    const serverId = this.generateServerId(url);
    if (this.uploadServers.has(serverId)) {
      console.warn(`\u26A0\uFE0F Server already exists: ${url}`);
      return false;
    }
    this.uploadServers.set(serverId, {
      id: serverId,
      url: url.trim(),
      isActive: false,
      currentJobs: 0,
      maxConcurrentJobs: options.maxJobs || this.MAX_CONCURRENT_JOBS_PER_SERVER,
      lastSeen: 0,
      lastHealthCheck: /* @__PURE__ */ new Date(),
      consecutiveFailures: 0,
      totalJobsCompleted: 0,
      averageUploadTime: 0,
      region: options.region || this.extractRegionFromUrl(url)
    });
    console.log(`\u2795 Added upload server: ${url} (${serverId})`);
    return true;
  }
  /**
   * Remove an upload server by ID
   */
  removeUploadServer(serverId) {
    const server = Array.from(this.uploadServers.values()).find((s) => s.id === serverId);
    if (!server) {
      console.warn(`\u26A0\uFE0F Upload server not found: ${serverId}`);
      return false;
    }
    this.uploadServers.delete(serverId);
    const jobsToReassign = Array.from(this.activeJobs.entries()).filter(([_, job]) => job.uploadServerId === serverId);
    for (const [jobId, job] of jobsToReassign) {
      console.log(`\u{1F504} Reassigning job ${jobId} from removed server ${serverId}`);
      job.uploadServerId = "";
      job.status = "pending";
      job.attempts++;
    }
    console.log(`\u2796 Removed upload server: ${serverId} (${server.url})`);
    return true;
  }
  /**
   * Add multiple servers in batch
   */
  addServersBatch(urls) {
    console.log(`\u{1F504} Adding ${urls.length} servers in batch...`);
    let added = 0;
    let skipped = 0;
    const errors = [];
    for (const url of urls) {
      try {
        if (this.addServer(url)) {
          added++;
        } else {
          skipped++;
        }
      } catch (error) {
        errors.push(`${url}: ${error.message}`);
        skipped++;
      }
    }
    console.log(`\u{1F4CA} Batch add complete: ${added} added, ${skipped} skipped, ${errors.length} errors`);
    return { added, skipped, errors };
  }
  /**
   * Process a file chunk by assigning it to an optimal upload server
   */
  async processChunk(chunkData) {
    try {
      const optimalServer = this.findOptimalServer(chunkData);
      if (!optimalServer) {
        return {
          success: false,
          message: "No available upload servers"
        };
      }
      const job = {
        id: this.generateJobId(),
        fileId: chunkData.metadata.fileId,
        chunkIndex: chunkData.metadata.chunkIndex,
        chunkSize: chunkData.buffer.length,
        uploadServerId: optimalServer.id,
        status: "pending",
        attempts: 0,
        maxAttempts: 3
      };
      this.pendingJobs.set(job.id, job);
      const assignment = await this.assignJobToServer(job, optimalServer, chunkData);
      if (assignment.success) {
        this.pendingJobs.delete(job.id);
        this.activeJobs.set(job.id, { ...job, status: "assigned", assignedAt: Date.now() });
        optimalServer.currentJobs++;
        return {
          success: true,
          jobId: job.id,
          assignedServer: optimalServer.url,
          message: `Chunk assigned to ${optimalServer.url}`
        };
      } else {
        this.pendingJobs.delete(job.id);
        return {
          success: false,
          message: assignment.message
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Chunk processing failed: ${error.message}`
      };
    }
  }
  // Round-robin counter for distributing chunks evenly across servers
  roundRobinIndex = 0;
  /**
   * Find the optimal server for uploading a chunk using round-robin distribution for parallel processing
   */
  findOptimalServer(chunkData) {
    const availableServers = Array.from(this.uploadServers.values()).filter(
      (server) => server.isActive && server.currentJobs < server.maxConcurrentJobs && server.consecutiveFailures < 5
    );
    if (availableServers.length === 0) {
      const totalServers = Array.from(this.uploadServers.values());
      if (totalServers.length === 0) return null;
      totalServers.sort((a, b) => {
        const failureDiff = a.consecutiveFailures - b.consecutiveFailures;
        if (failureDiff !== 0) return failureDiff;
        return a.currentJobs - b.currentJobs;
      });
      const fallback = totalServers[0];
      console.warn(`\u26A0\uFE0F Falling back to upload server ${fallback.url} despite it not being healthy`);
      return fallback;
    }
    const reliableServers = availableServers.filter((server) => server.consecutiveFailures === 0).sort((a, b) => a.currentJobs - b.currentJobs);
    if (reliableServers.length > 0) {
      const selectedServer2 = reliableServers[this.roundRobinIndex % reliableServers.length];
      this.roundRobinIndex = (this.roundRobinIndex + 1) % reliableServers.length;
      console.log(`\u{1F504} Round-robin selected server ${selectedServer2.id} (${selectedServer2.url}) - ${this.roundRobinIndex}/${reliableServers.length} servers`);
      return selectedServer2;
    }
    const selectedServer = availableServers[this.roundRobinIndex % availableServers.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % availableServers.length;
    console.log(`\u{1F504} Round-robin selected server ${selectedServer.id} (${selectedServer.url}) with ${selectedServer.consecutiveFailures} failures - ${this.roundRobinIndex}/${availableServers.length} servers`);
    return selectedServer;
  }
  /**
   * Assign a job to a specific upload server
   */
  async assignJobToServer(job, server, chunkData) {
    const maxRetries = 3;
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`\u{1F4E4} Assigning chunk ${job.chunkIndex} (job ${job.id}) to ${server.url} (attempt ${attempt}/${maxRetries})`);
        const effectiveChunk = chunkData || this.getStoredChunk(job.id);
        if (!effectiveChunk) {
          return { success: false, message: "Chunk data not found" };
        }
        const response = await axios.post(`${server.url}/api/upload/chunk`, {
          jobId: job.id,
          fileId: job.fileId,
          chunkIndex: job.chunkIndex,
          fileName: effectiveChunk.metadata.fileName,
          mimeType: effectiveChunk.metadata.mimeType,
          totalChunks: effectiveChunk.metadata.totalChunks,
          chunkData: effectiveChunk.buffer.toString("base64"),
          callbackUrl: `${this.getMainServerUrl()}/api/upload/callback`
        }, {
          // No timeout - let uploads complete naturally for 100% reliability
          timeout: 0,
          headers: {
            "Content-Type": "application/json",
            "X-Job-Assignment": "true",
            "X-Retry-Attempt": attempt.toString()
          }
        });
        if (response.status === 200) {
          console.log(`\u2705 Job ${job.id} assigned to ${server.url} on attempt ${attempt}`);
          server.consecutiveFailures = Math.max(0, server.consecutiveFailures - 1);
          return { success: true, message: "Job assigned successfully" };
        } else {
          lastError = new Error(`Server responded with ${response.status}`);
          console.warn(`\u26A0\uFE0F Job ${job.id} got status ${response.status} from ${server.url}, attempt ${attempt}/${maxRetries}`);
        }
      } catch (error) {
        lastError = error;
        console.warn(`\u26A0\uFE0F Failed to assign job ${job.id} to ${server.url} on attempt ${attempt}/${maxRetries}:`, error.message);
        if (attempt < maxRetries) {
          const delay = Math.min(1e3 * Math.pow(2, attempt - 1), 5e3);
          console.log(`\u23F3 Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    server.consecutiveFailures++;
    console.error(`\u274C Failed to assign job ${job.id} to ${server.url} after ${maxRetries} attempts:`, lastError?.message);
    return { success: false, message: `All ${maxRetries} attempts failed: ${lastError?.message}` };
  }
  /**
   * Handle job completion callback from upload server
   */
  async handleJobCompletion(jobId, result) {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      console.warn(`\u26A0\uFE0F Received callback for unknown job: ${jobId}`);
      return;
    }
    const server = this.uploadServers.get(job.uploadServerId);
    if (server) {
      server.currentJobs = Math.max(0, server.currentJobs - 1);
      if (result.success) {
        server.consecutiveFailures = 0;
        server.totalJobsCompleted++;
        if (result.uploadTime) {
          server.averageUploadTime = (server.averageUploadTime + result.uploadTime) / 2;
        }
      } else {
        server.consecutiveFailures++;
      }
    }
    job.status = result.success ? "completed" : "failed";
    job.completedAt = Date.now();
    job.dropboxAccountId = result.dropboxAccountId;
    job.dropboxFileId = result.dropboxFileId;
    job.errorMessage = result.errorMessage;
    this.activeJobs.delete(jobId);
    this.completedJobs.set(jobId, job);
    this.cleanupChunkStorage(jobId);
    await this.updateDatabaseWithChunk(job, result);
    console.log(`\u{1F4DD} Job ${jobId} completed: ${result.success ? "SUCCESS" : "FAILED"}`);
  }
  /**
   * Update database with chunk completion information
   */
  async updateDatabaseWithChunk(job, result) {
    try {
      const { dbManager: dbManager2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      if (result.success) {
        await dbManager2.updateFileChunk({
          fileId: job.fileId,
          chunkIndex: job.chunkIndex,
          dropboxAccountId: result.dropboxAccountId,
          dropboxFileId: result.dropboxFileId,
          status: "completed",
          uploadedAt: /* @__PURE__ */ new Date(),
          processingServerId: job.uploadServerId
        });
        console.log(`\u{1F4BE} Database updated for chunk ${job.chunkIndex} of file ${job.fileId}`);
      } else {
        await dbManager2.markChunkFailed({
          fileId: job.fileId,
          chunkIndex: job.chunkIndex,
          errorMessage: result.errorMessage,
          attempts: job.attempts + 1
        });
      }
    } catch (error) {
      console.error("\u274C Failed to update database:", error.message);
    }
  }
  // Utility methods
  generateServerId(url) {
    return crypto2.createHash("md5").update(url).digest("hex").substring(0, 8);
  }
  generateJobId() {
    return crypto2.randomBytes(16).toString("hex");
  }
  isValidServerUrl(url) {
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  }
  extractRegionFromUrl(url) {
    const patterns = [
      /\.(\w+)-\w+\.\w+\.com/,
      // AWS-style regions
      /(\w+)\d*\./
      // Generic region patterns
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return "unknown";
  }
  getMainServerUrl() {
    return process.env.MAIN_SERVER_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5000";
  }
  // Temporary storage methods (implement with Redis in production)
  chunkStorage = /* @__PURE__ */ new Map();
  chunkTTL = /* @__PURE__ */ new Map();
  storeChunkTemporarily(jobId, chunkData) {
    this.chunkStorage.set(jobId, chunkData);
    this.chunkTTL.set(jobId, Date.now() + 6e5);
  }
  getStoredChunk(jobId) {
    return this.chunkStorage.get(jobId) || null;
  }
  cleanupChunkStorage(jobId) {
    this.chunkStorage.delete(jobId);
    this.chunkTTL.delete(jobId);
  }
  // Health monitoring methods
  startHealthMonitoring() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.SERVER_HEALTH_CHECK_INTERVAL);
  }
  startJobMonitoring() {
    this.jobMonitorInterval = setInterval(() => {
      this.monitorJobs();
      this.cleanupExpiredChunks();
    }, 3e4);
  }
  async performHealthChecks() {
    const healthPromises = Array.from(this.uploadServers.values()).map(async (server) => {
      try {
        const response = await axios.get(`${server.url}/health`, {
          timeout: 15e3,
          // Increased timeout for health checks, but not unlimited
          headers: {
            "User-Agent": "DistributedChunkManager/1.0"
          }
        });
        if (response.status === 200) {
          const healthData = response.data;
          server.isActive = true;
          server.lastHealthCheck = /* @__PURE__ */ new Date();
          server.consecutiveFailures = 0;
          if (healthData.currentLoad !== void 0) {
            server.currentJobs = healthData.currentLoad;
          }
          if (healthData.capabilities) {
            server.maxConcurrentJobs = healthData.maxLoad || server.maxConcurrentJobs;
          }
          console.log(`\u2705 Upload server ${server.id} is healthy (load: ${server.currentJobs}/${server.maxConcurrentJobs})`);
        } else {
          this.markServerUnhealthy(server, `HTTP ${response.status}`);
        }
      } catch (error) {
        this.markServerUnhealthy(server, error.message);
      }
    });
    await Promise.allSettled(healthPromises);
    const activeCount = Array.from(this.uploadServers.values()).filter((s) => s.isActive).length;
    const totalCount = this.uploadServers.size;
    if (activeCount === 0 && totalCount > 0) {
      console.warn(`\u26A0\uFE0F No upload servers are healthy (0/${totalCount})`);
    } else if (activeCount < totalCount) {
      console.log(`\u{1F4CA} Upload servers health: ${activeCount}/${totalCount} healthy`);
    }
  }
  markServerUnhealthy(server, reason) {
    server.isActive = false;
    server.consecutiveFailures++;
    server.lastHealthCheck = /* @__PURE__ */ new Date();
    if (server.consecutiveFailures === 1) {
      console.warn(`\u26A0\uFE0F Upload server ${server.id} unhealthy: ${reason}`);
    } else if (server.consecutiveFailures >= 5) {
      console.error(`\u274C Upload server ${server.id} marked as failed (${server.consecutiveFailures} consecutive failures)`);
    }
  }
  monitorJobs() {
    const now = Date.now();
    Array.from(this.activeJobs.entries()).forEach(([jobId, job]) => {
      if (job.assignedAt && now - job.assignedAt > this.JOB_TIMEOUT_MS) {
        console.warn(`\u26A0\uFE0F Job ${jobId} timed out, reassigning...`);
        this.reassignTimedOutJob(job);
      }
    });
  }
  cleanupExpiredChunks() {
    const now = Date.now();
    Array.from(this.chunkTTL.entries()).forEach(([jobId, expiry]) => {
      if (now > expiry) {
        this.cleanupChunkStorage(jobId);
      }
    });
  }
  async reassignTimedOutJob(job) {
    job.attempts++;
    if (job.attempts < job.maxAttempts) {
      job.status = "pending";
      this.activeJobs.delete(job.id);
      this.pendingJobs.set(job.id, job);
      const server = this.uploadServers.get(job.uploadServerId);
      if (server) {
        server.currentJobs = Math.max(0, server.currentJobs - 1);
        server.consecutiveFailures++;
      }
    } else {
      job.status = "failed";
      job.errorMessage = "Maximum retry attempts exceeded";
      this.activeJobs.delete(job.id);
      this.completedJobs.set(job.id, job);
      this.cleanupChunkStorage(job.id);
    }
  }
  // Callback handling methods for progress updates
  updateJobStatus(jobId, update) {
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      if (update.status) {
        activeJob.status = update.status;
      }
      if (update.message) {
        activeJob.errorMessage = update.message;
      }
      if (update.status === "completed") {
        activeJob.completedAt = Date.now();
        this.completedJobs.set(jobId, activeJob);
        this.activeJobs.delete(jobId);
        console.log(`\u2705 Job ${jobId} marked as completed via callback`);
      } else if (update.status === "failed") {
        activeJob.status = "failed";
        console.log(`\u274C Job ${jobId} marked as failed via callback: ${update.message}`);
      }
      return;
    }
    const pendingJob = this.pendingJobs.get(jobId);
    if (pendingJob && update.status) {
      pendingJob.status = update.status;
      if (update.message) {
        pendingJob.errorMessage = update.message;
      }
    }
  }
  getFileProgress(fileId) {
    const allJobs = [
      ...Array.from(this.pendingJobs.values()),
      ...Array.from(this.activeJobs.values()),
      ...Array.from(this.completedJobs.values())
    ];
    const fileJobs = allJobs.filter((job) => job.fileId === fileId);
    if (fileJobs.length === 0) {
      return 0;
    }
    const completedJobs = fileJobs.filter((job) => job.status === "completed");
    return Math.round(completedJobs.length / fileJobs.length * 100);
  }
  getJobStatus(jobId) {
    return this.activeJobs.get(jobId) || this.pendingJobs.get(jobId) || this.completedJobs.get(jobId) || null;
  }
  getJobsByFile(fileId) {
    const allJobs = [
      ...Array.from(this.pendingJobs.values()),
      ...Array.from(this.activeJobs.values()),
      ...Array.from(this.completedJobs.values())
    ];
    return allJobs.filter((job) => job.fileId === fileId);
  }
  // Public API methods
  getStats() {
    const activeServers = Array.from(this.uploadServers.values()).filter((s) => s.isActive).length;
    const totalJobs = this.pendingJobs.size + this.activeJobs.size + this.completedJobs.size;
    return {
      totalServers: this.uploadServers.size,
      activeServers,
      pendingJobs: this.pendingJobs.size,
      activeJobs: this.activeJobs.size,
      completedJobs: this.completedJobs.size,
      totalJobs,
      memoryUsage: process.memoryUsage(),
      temporaryChunksStored: this.chunkStorage.size
    };
  }
  getUploadServers() {
    return this.uploadServers;
  }
  shutdown() {
    console.log("\u{1F6D1} Shutting down distributed chunk manager...");
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.jobMonitorInterval) {
      clearInterval(this.jobMonitorInterval);
    }
    this.chunkStorage.clear();
    this.chunkTTL.clear();
    console.log("\u2705 Distributed chunk manager shutdown complete");
  }
};
var distributedChunkManager = new DistributedChunkManager();

// server/priority-chunk-processor.ts
import { EventEmitter } from "events";
var PriorityChunkProcessor = class extends EventEmitter {
  activeProcessing = /* @__PURE__ */ new Map();
  abortControllers = /* @__PURE__ */ new Map();
  /**
   * Process a specific chunk immediately, cancelling other lower-priority tasks if needed
   */
  async processChunkImmediate(chunkId, chunkIndex, processor, options = {}) {
    const { priority = "high", cancelOthers = true, timeout = 3e4 } = options;
    console.log(`[PriorityProcessor] Processing chunk ${chunkIndex} (${chunkId}) with ${priority} priority`);
    if (priority === "high" && cancelOthers) {
      this.cancelLowerPriorityTasks();
    }
    const abortController = new AbortController();
    this.abortControllers.set(chunkId, abortController);
    let timeoutId;
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        console.log(`[PriorityProcessor] Timeout reached for chunk ${chunkIndex}, aborting`);
        abortController.abort();
      }, timeout);
    }
    try {
      const processingPromise = processor(abortController.signal);
      this.activeProcessing.set(chunkId, processingPromise);
      const result = await processingPromise;
      console.log(`[PriorityProcessor] Successfully processed chunk ${chunkIndex} (${chunkId})`);
      this.emit("chunkProcessed", { chunkId, chunkIndex, success: true });
      return result;
    } catch (error) {
      if (error.name === "AbortError" || abortController.signal.aborted) {
        console.log(`[PriorityProcessor] Chunk ${chunkIndex} processing was cancelled`);
        this.emit("chunkCancelled", { chunkId, chunkIndex });
      } else {
        console.error(`[PriorityProcessor] Error processing chunk ${chunkIndex}:`, error);
        this.emit("chunkError", { chunkId, chunkIndex, error });
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.activeProcessing.delete(chunkId);
      this.abortControllers.delete(chunkId);
    }
  }
  /**
   * Cancel all lower priority tasks to make room for high-priority requests
   */
  cancelLowerPriorityTasks() {
    const cancelled = [];
    Array.from(this.abortControllers.entries()).forEach(([chunkId, abortController]) => {
      if (!abortController.signal.aborted) {
        console.log(`[PriorityProcessor] Cancelling lower priority task: ${chunkId}`);
        abortController.abort();
        cancelled.push(chunkId);
      }
    });
    if (cancelled.length > 0) {
      console.log(`[PriorityProcessor] Cancelled ${cancelled.length} lower priority tasks: ${cancelled.join(", ")}`);
    }
  }
  /**
   * Cancel a specific chunk processing
   */
  cancelChunk(chunkId) {
    const abortController = this.abortControllers.get(chunkId);
    if (abortController && !abortController.signal.aborted) {
      console.log(`[PriorityProcessor] Manually cancelling chunk: ${chunkId}`);
      abortController.abort();
      return true;
    }
    return false;
  }
  /**
   * Cancel all active processing
   */
  cancelAll() {
    console.log(`[PriorityProcessor] Cancelling all active processing (${this.abortControllers.size} tasks)`);
    Array.from(this.abortControllers.entries()).forEach(([chunkId, abortController]) => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    });
    this.abortControllers.clear();
    this.activeProcessing.clear();
  }
  /**
   * Get status of active processing
   */
  getStatus() {
    return {
      activeCount: this.activeProcessing.size,
      activeChunks: Array.from(this.activeProcessing.keys())
    };
  }
};
var globalPriorityProcessor = new PriorityChunkProcessor();

// server/routes.ts
init_memory_optimizer();

// server/streaming-upload.ts
import multer from "multer";
import { Transform as Transform2 } from "stream";
import { createHash } from "crypto";
import { createReadStream, unlink } from "fs";
import { pipeline } from "stream/promises";
import path2 from "path";
import os from "os";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import { path as ffprobePath } from "@ffprobe-installer/ffprobe";
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
var ChunkProcessor = class extends Transform2 {
  constructor(chunkSize = 5 * 1024 * 1024, onChunk) {
    super();
    this.chunkSize = chunkSize;
    this.onChunk = onChunk;
  }
  chunkIndex = 0;
  hasher = createHash("sha256");
  chunks = [];
  totalSize = 0;
  _transform(chunk, encoding, callback) {
    this.hasher.update(chunk);
    this.chunks.push(chunk);
    this.totalSize += chunk.length;
    if (this.getBufferSize() >= this.chunkSize) {
      this.processChunk().then(() => callback()).catch((error) => callback(error));
    } else {
      callback();
    }
  }
  _flush(callback) {
    if (this.chunks.length > 0) {
      this.processChunk().then(() => callback()).catch((error) => callback(error));
    } else {
      callback();
    }
  }
  getBufferSize() {
    return this.chunks.reduce((size, chunk) => size + chunk.length, 0);
  }
  async processChunk() {
    const chunkData = Buffer.concat(this.chunks);
    const chunkInfo = {
      index: this.chunkIndex++,
      data: chunkData,
      checksum: createHash("sha256").update(chunkData).digest("hex"),
      size: chunkData.length
    };
    this.emit("chunk", chunkInfo);
    if (this.onChunk) {
      await this.onChunk(chunkInfo);
    }
    this.chunks = [];
  }
  getFileChecksum() {
    return this.hasher.digest("hex");
  }
  getTotalSize() {
    return this.totalSize;
  }
};
var streamingUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = os.tmpdir();
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `upload-${uniqueSuffix}-${file.originalname}`);
    }
  }),
  limits: {
    fileSize: 500 * 1024 * 1024,
    // 500MB max file size
    files: 10,
    // Max 10 files per request
    fieldSize: 50 * 1024 * 1024,
    // 50MB field size
    parts: 1e3
    // Max 1000 parts
  }
});
async function processStreamingUpload(filePath, originalName, forumId, userId, dropboxManager2, storage2, onProgress) {
  const startTime = Date.now();
  let uploadedChunks = 0;
  let totalChunks = 0;
  try {
    const uploadPromises = [];
    const processor = new ChunkProcessor(5 * 1024 * 1024);
    processor.on("chunk", async (chunkInfo) => {
      totalChunks++;
      const uploadPromise = dropboxManager2.uploadChunkStreaming(
        chunkInfo.data,
        chunkInfo.index,
        chunkInfo.checksum,
        originalName
      ).then((result) => {
        uploadedChunks++;
        if (onProgress) {
          const progress = Math.round(uploadedChunks / totalChunks * 100);
          onProgress(progress);
        }
        return {
          chunkIndex: chunkInfo.index,
          dropboxFileId: result.dropboxFileId,
          dropboxPath: result.dropboxPath,
          checksum: chunkInfo.checksum,
          size: chunkInfo.size,
          dropboxAccountId: result.accountId,
          downloadUrl: result.downloadUrl
        };
      });
      uploadPromises.push(uploadPromise);
    });
    const readStream = createReadStream(filePath);
    await pipeline(readStream, processor);
    const chunkResults = await Promise.all(uploadPromises);
    const fs6 = await import("fs/promises");
    const stats = await fs6.stat(filePath);
    let thumbnail;
    const mimeType = getMimeType(originalName);
    if (mimeType.startsWith("image/")) {
      try {
        const thumbnailBuffer = await sharp(filePath).resize(300, 300, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
        thumbnail = `data:${mimeType};base64,${thumbnailBuffer.toString("base64")}`;
        console.log(`\u2705 Generated thumbnail for ${originalName}`);
      } catch (error) {
        console.warn(`Failed to generate thumbnail for ${originalName}:`, error);
      }
    } else if (mimeType.startsWith("video/")) {
      try {
        const thumbnailBuffer = await generateVideoThumbnail(filePath);
        if (thumbnailBuffer) {
          thumbnail = `data:image/jpeg;base64,${thumbnailBuffer.toString("base64")}`;
          console.log(`\u2705 Generated video thumbnail for ${originalName}`);
        }
      } catch (error) {
        console.warn(`Failed to generate video thumbnail for ${originalName}:`, error);
      }
    }
    const fileRecord = await storage2.createFile(
      forumId,
      userId,
      path2.basename(originalName),
      stats.size,
      mimeType,
      thumbnail,
      {
        isAdminCreated: false,
        // Explicitly mark as user upload
        adminNotes: "Uploaded via User Portal",
        // Identifier for user uploads
        metaTitle: originalName,
        metaDescription: `File uploaded to forum`,
        keywords: path2.extname(originalName).slice(1)
      }
    );
    console.log(`\u2705 Created file record in database: ${fileRecord.id}`);
    for (const chunk of chunkResults) {
      try {
        await storage2.createFileChunk(
          fileRecord.id,
          chunk.chunkIndex,
          chunk.size,
          chunk.checksum,
          chunk.dropboxAccountId,
          chunk.dropboxPath,
          chunk.dropboxFileId,
          chunk.downloadUrl
        );
        console.log(`\u2705 Saved chunk ${chunk.chunkIndex} to database`);
      } catch (chunkError) {
        console.error(`\u274C Failed to save chunk ${chunk.chunkIndex} to database:`, chunkError);
        throw chunkError;
      }
    }
    return {
      fileId: fileRecord.id,
      checksum: processor.getFileChecksum(),
      totalSize: processor.getTotalSize(),
      chunkCount: chunkResults.length,
      uploadTime: Date.now() - startTime
    };
  } finally {
    try {
      await new Promise((resolve) => {
        unlink(filePath, () => resolve());
      });
    } catch (error) {
      console.warn(`Failed to cleanup temp file ${filePath}:`, error);
    }
  }
}
function getMimeType(filename) {
  const ext = path2.extname(filename).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".zip": "application/zip",
    ".rar": "application/x-rar-compressed"
  };
  return mimeTypes[ext] || "application/octet-stream";
}
var UploadProgressTracker = class {
  progressMap = /* @__PURE__ */ new Map();
  setProgress(uploadId, progress) {
    const current = this.progressMap.get(uploadId) || {
      progress: 0,
      status: "queued",
      startTime: /* @__PURE__ */ new Date()
    };
    this.progressMap.set(uploadId, { ...current, ...progress });
  }
  getProgress(uploadId) {
    return this.progressMap.get(uploadId) || null;
  }
  removeProgress(uploadId) {
    this.progressMap.delete(uploadId);
  }
  getAllProgress() {
    return new Map(this.progressMap);
  }
  // Cleanup old progress entries
  cleanup() {
    const now = Date.now();
    const entries = Array.from(this.progressMap.entries());
    for (const [uploadId, progress] of entries) {
      if (now - progress.startTime.getTime() > 36e5) {
        this.progressMap.delete(uploadId);
      }
    }
  }
};
async function generateVideoThumbnail(videoPath) {
  return new Promise((resolve, reject) => {
    const tempThumbnailPath = `${videoPath}.thumb.jpg`;
    ffmpeg(videoPath).screenshots({
      count: 1,
      folder: path2.dirname(videoPath),
      filename: path2.basename(tempThumbnailPath),
      timemarks: ["10%"],
      // Take thumbnail at 10% of video duration
      size: "300x300"
    }).on("end", async () => {
      try {
        const fs6 = await import("fs/promises");
        const thumbnailBuffer = await fs6.readFile(tempThumbnailPath);
        await fs6.unlink(tempThumbnailPath);
        resolve(thumbnailBuffer);
      } catch (error) {
        console.warn("Failed to read/cleanup video thumbnail:", error);
        resolve(null);
      }
    }).on("error", (error) => {
      console.warn("FFmpeg thumbnail generation failed:", error);
      resolve(null);
    });
  });
}
var TempFileManager = class {
  tempFiles = /* @__PURE__ */ new Set();
  addTempFile(filePath) {
    this.tempFiles.add(filePath);
  }
  async cleanupFile(filePath) {
    try {
      await new Promise((resolve, reject) => {
        unlink(filePath, (err) => {
          if (err && err.code !== "ENOENT") {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      this.tempFiles.delete(filePath);
    } catch (error) {
      console.warn(`Failed to cleanup temp file ${filePath}:`, error);
    }
  }
  async cleanupAll() {
    const cleanupPromises = Array.from(this.tempFiles).map(
      (filePath) => this.cleanupFile(filePath)
    );
    await Promise.allSettled(cleanupPromises);
  }
};
var tempFileManager = new TempFileManager();

// server/streaming-routes.ts
import { WebSocket } from "ws";
import crypto4 from "crypto";
var progressTracker = new UploadProgressTracker();
function registerStreamingUploadRoutes(app2, requireAuth, clients2, storage2, dropboxManager2) {
  app2.post("/api/files/upload-streaming", requireAuth, streamingUpload.single("file"), async (req, res, next) => {
    const uploadId = crypto4.randomUUID();
    let filePath = "";
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const { forumId, checksum } = req.body;
      if (!forumId) {
        return res.status(400).json({ error: "Forum ID required" });
      }
      const forum = await storage2.getForumById(forumId);
      if (!forum) {
        return res.status(404).json({ error: "Forum not found" });
      }
      if (!forum.isPublic) {
        const isMember = await storage2.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      filePath = req.file.path;
      const fileName = req.file.originalname;
      const fileSize = req.file.size;
      console.log(`\u{1F680} Starting streaming upload for ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB) - Upload ID: ${uploadId}`);
      console.log(`\u{1F4CA} Memory before upload: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
      tempFileManager.addTempFile(filePath);
      progressTracker.setProgress(uploadId, {
        progress: 0,
        status: "processing",
        startTime: /* @__PURE__ */ new Date(),
        totalBytes: fileSize,
        bytesUploaded: 0
      });
      const result = await processStreamingUpload(
        filePath,
        fileName,
        forumId,
        req.user.id,
        dropboxManager2,
        storage2,
        (progress) => {
          console.log(`[Server] Upload progress for ${fileName}: ${progress}% (${Math.round(progress / 100 * fileSize)}/${fileSize} bytes)`);
          progressTracker.setProgress(uploadId, {
            progress,
            bytesUploaded: Math.round(progress / 100 * fileSize)
          });
          clients2.forEach((client) => {
            if (client.ws.readyState === WebSocket.OPEN && client.forumId === forumId) {
              console.log(`[Server] Broadcasting upload_progress to client in forum ${forumId}: ${progress}%`);
              client.ws.send(JSON.stringify({
                type: "upload_progress",
                data: {
                  uploadId,
                  progress,
                  status: "processing",
                  fileName,
                  bytesUploaded: Math.round(progress / 100 * fileSize),
                  totalBytes: fileSize
                }
              }));
            }
          });
        }
      );
      progressTracker.setProgress(uploadId, {
        progress: 100,
        status: "completed",
        bytesUploaded: result.totalSize
      });
      clients2.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN && client.forumId === forumId) {
          client.ws.send(JSON.stringify({
            type: "upload_progress",
            data: {
              uploadId,
              progress: 100,
              status: "completed",
              fileName,
              bytesUploaded: result.totalSize,
              totalBytes: result.totalSize
            }
          }));
        }
      });
      const uploader = await storage2.getUser(req.user.id);
      clients2.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN && client.forumId === forumId) {
          client.ws.send(JSON.stringify({
            type: "file_uploaded",
            data: {
              id: result.fileId,
              filename: fileName,
              originalName: fileName,
              size: result.totalSize,
              uploadedBy: req.user.id,
              uploadedByName: uploader?.displayName || uploader?.username || null,
              uploader,
              forumId,
              checksum: result.checksum
            }
          }));
        }
      });
      console.log(`\u2705 Streaming upload completed for ${fileName} in ${result.uploadTime}ms`);
      console.log(`\u{1F4CA} Memory after upload: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
      res.json({
        success: true,
        fileId: result.fileId,
        uploadId,
        message: "File uploaded successfully using streaming",
        uploadTime: result.uploadTime,
        totalSize: result.totalSize,
        chunkCount: result.chunkCount,
        checksum: result.checksum,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB"
      });
    } catch (error) {
      console.error("Streaming upload error:", error);
      progressTracker.setProgress(uploadId, {
        status: "error",
        error: error?.message || error
      });
      clients2.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: "upload_error",
            data: {
              uploadId,
              error: error?.message || "Upload failed"
            }
          }));
        }
      });
      res.status(500).json({
        error: "Upload failed",
        message: error?.message || error,
        uploadId
      });
    } finally {
      if (filePath) {
        await tempFileManager.cleanupFile(filePath);
      }
      setTimeout(() => {
        progressTracker.removeProgress(uploadId);
      }, 3e5);
    }
  });
  app2.get("/api/files/upload-progress/:uploadId", requireAuth, async (req, res) => {
    const { uploadId } = req.params;
    const progress = progressTracker.getProgress(uploadId);
    if (!progress) {
      return res.status(404).json({ error: "Upload not found" });
    }
    res.json(progress);
  });
  app2.get("/api/cluster/status", requireAuth, async (req, res) => {
    res.json({
      clustered: false,
      message: "Single server mode - clustering disabled"
    });
  });
  app2.post("/api/admin/cleanup", requireAuth, async (req, res) => {
    try {
      await tempFileManager.cleanupAll();
      progressTracker.cleanup();
      res.json({
        success: true,
        message: "Cleanup completed",
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB"
      });
    } catch (error) {
      res.status(500).json({
        error: "Cleanup failed",
        message: error?.message || error
      });
    }
  });
  app2.get("/api/system/health", async (req, res) => {
    const memoryUsage = process.memoryUsage();
    res.json({
      status: "healthy",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + "MB",
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + "MB",
        percentage: Math.round(memoryUsage.heapUsed / memoryUsage.heapTotal * 100) + "%"
      },
      cluster: { clustered: false, message: "Clustering disabled" },
      activeUploads: Array.from(progressTracker.getAllProgress().values()).filter((p) => p.status === "processing").length
    });
  });
  console.log("\u{1F680} Streaming upload routes registered successfully!");
  console.log(`\u{1F4CA} Cluster mode: DISABLED`);
  console.log(`\u{1F4CA} Server mode: Single server`);
}

// server/routes.ts
ffmpeg2.setFfmpegPath(ffmpegPath2);
ffmpeg2.setFfprobePath(ffprobePath2);
var upload = multer2({
  storage: multer2.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    // 10MB max file size
    files: 1
  }
});
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((cookie) => {
    const [name, value] = cookie.trim().split("=");
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });
  return cookies;
}
var clients = /* @__PURE__ */ new Map();
async function registerRoutes(app2) {
  app2.get("/health", (req, res) => {
    const memoryUsage = process.memoryUsage();
    res.json({
      status: "healthy",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heap: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        percentage: Math.round(memoryUsage.rss / (512 * 1024 * 1024) * 100)
        // Assuming 512MB limit
      }
    });
  });
  app2.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      timestamp: Date.now(),
      pid: process.pid,
      uptime: Math.floor(process.uptime())
    });
  });
  const sessionSettings = setupAuth(app2);
  const { setupSessionRoutes: setupSessionRoutes2 } = await Promise.resolve().then(() => (init_session_manager(), session_manager_exports));
  setupSessionRoutes2(app2);
  app2.locals.chunkManager = distributedChunkManager;
  const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
      console.log("\u{1F510} Authentication required but user not authenticated");
      return res.status(401).json({
        error: "Authentication required",
        message: "Please log in to access this resource"
      });
    }
    if (!req.user?.id) {
      console.log("\u{1F510} User authenticated but missing user ID");
      return res.status(401).json({
        error: "Invalid user session",
        message: "User session is invalid, please log in again"
      });
    }
    next();
  };
  const optionalAuth = (req, res, next) => {
    next();
  };
  const isAdminUser = async (user) => {
    if (!user?.username && !user?.email) {
      return false;
    }
    const instances = dbManager.getAllInstances();
    for (const instance of instances) {
      try {
        const admin = await instance.db.select({ id: adminUsers.id }).from(adminUsers).where(and2(
          eq3(adminUsers.isActive, true),
          or2(
            user.username ? eq3(adminUsers.username, user.username) : sql3`false`,
            user.email ? eq3(adminUsers.email, user.email) : sql3`false`
          )
        )).limit(1).then((rows) => rows[0]);
        if (admin) {
          return true;
        }
      } catch (error) {
        console.error(`Error checking admin user in shard ${instance.id}:`, error);
      }
    }
    return false;
  };
  app2.get("/api/debug/auth", async (req, res) => {
    try {
      res.json({
        isAuthenticated: req.isAuthenticated(),
        currentUser: req.user ? {
          id: req.user.id,
          username: req.user.username,
          email: req.user.email
        } : null,
        sessionID: req.sessionID,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/debug/create-test-user", async (req, res) => {
    try {
      const testUser = {
        username: "testuser",
        email: "test@example.com",
        password: "testpassword123"
      };
      const existing = await storage.getUserByUsername(testUser.username);
      if (existing) {
        return res.json({ message: "Test user already exists", user: { id: existing.id, username: existing.username } });
      }
      const hashedPassword = await __require("crypto").scrypt(testUser.password, "salt", 64);
      const user = await storage.createUser({
        ...testUser,
        password: `${hashedPassword.toString("hex")}.salt`
      });
      res.json({ message: "Test user created successfully", user: { id: user.id, username: user.username } });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  const { clusterManager: clusterManager2 } = await Promise.resolve().then(() => (init_cluster_manager(), cluster_manager_exports));
  const { loadBalancer: loadBalancer2 } = await Promise.resolve().then(() => (init_load_balancer(), load_balancer_exports));
  const { memoryOptimizer: memoryOptimizer2 } = await Promise.resolve().then(() => (init_memory_optimizer(), memory_optimizer_exports));
  app2.get("/api/cluster/status", (req, res) => {
    const clusterMetrics = clusterManager2.getClusterMetrics();
    const loadBalancerHealth = loadBalancer2.getHealthStatus();
    const memoryStats = memoryOptimizer2.getMemoryStats();
    res.json({
      cluster: clusterMetrics,
      loadBalancer: loadBalancerHealth,
      memory: memoryStats,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.get("/api/cluster/metrics", (req, res) => {
    const metrics = loadBalancer2.getMetrics();
    const workerStats = clusterManager2.getWorkerStats();
    res.json({
      loadBalancer: metrics,
      workers: workerStats,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.get("/api/cluster/workers", (req, res) => {
    const workers = clusterManager2.getAllWorkers();
    res.json(workers);
  });
  app2.get("/api/cluster/memory", (req, res) => {
    const memoryStats = memoryOptimizer2.getMemoryStats();
    const connectionStats = memoryOptimizer2.getConnectionStats();
    res.json({
      memory: memoryStats,
      connections: connectionStats,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.get("/api/upload-servers/status", requireAuth, (req, res) => {
    try {
      const stats = distributedChunkManager.getStats();
      res.json({
        ...stats,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to get upload server status",
        message: error.message
      });
    }
  });
  app2.post("/api/upload-servers/add", requireAuth, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({
          error: "Server URL required"
        });
      }
      const success = distributedChunkManager.addServer(url);
      res.json({
        success,
        message: success ? `Successfully added server: ${url}` : `Failed to add server: ${url}`
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to add upload server",
        message: error.message
      });
    }
  });
  app2.post("/api/upload-servers/add-batch", requireAuth, async (req, res) => {
    try {
      const { urls } = req.body;
      if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({
          error: "URLs array required"
        });
      }
      console.log(`\u{1F680} Starting batch add of ${urls.length} upload servers...`);
      const result = distributedChunkManager.addServersBatch(urls);
      res.json({
        message: `Batch processing complete for ${urls.length} servers`,
        result
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to batch add upload servers",
        message: error.message
      });
    }
  });
  app2.get("/api/upload-servers/list", (req, res) => {
    try {
      const stats = distributedChunkManager.getStats();
      const serverList = distributedChunkManager.getUploadServers();
      const servers = Array.from(serverList.values()).map((server) => ({
        serverId: server.id,
        url: server.url,
        region: server.region,
        isActive: server.isActive,
        currentJobs: server.currentJobs,
        maxConcurrentJobs: server.maxConcurrentJobs,
        consecutiveFailures: server.consecutiveFailures,
        totalJobsCompleted: server.totalJobsCompleted,
        averageUploadTime: server.averageUploadTime,
        lastHealthCheck: server.lastHealthCheck
      }));
      res.json({
        servers,
        totalServers: servers.length,
        activeServers: servers.filter((s) => s.isActive).length,
        stats
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to list upload servers",
        message: error.message
      });
    }
  });
  app2.get("/api/upload-servers/available", async (req, res) => {
    try {
      const servers = [];
      res.json({
        servers,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to get available servers",
        message: error.message
      });
    }
  });
  app2.post("/api/upload-servers/register", async (req, res) => {
    try {
      const { serverId, url, region, capabilities, maxConcurrentUploads } = req.body;
      if (!serverId || !url) {
        return res.status(400).json({
          error: "Missing required fields: serverId, url"
        });
      }
      distributedChunkManager.addUploadServer(url, {
        serverId,
        region: region || "unknown",
        maxJobs: maxConcurrentUploads || 5,
        capabilities: capabilities || ["file-upload"]
      });
      console.log(`\u{1F4E1} Upload server registered: ${serverId} at ${url}`);
      res.json({
        success: true,
        serverId,
        message: "Upload server registered successfully"
      });
    } catch (error) {
      console.error("\u274C Upload server registration failed:", error);
      res.status(500).json({
        error: "Failed to register upload server",
        message: error.message
      });
    }
  });
  app2.delete("/api/upload-servers/:serverId", async (req, res) => {
    try {
      const { serverId } = req.params;
      distributedChunkManager.removeUploadServer(serverId);
      console.log(`\u{1F4E1} Upload server unregistered: ${serverId}`);
      res.json({
        success: true,
        message: "Upload server unregistered successfully"
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to unregister upload server",
        message: error.message
      });
    }
  });
  app2.get("/api/forums", optionalAuth, async (req, res, next) => {
    try {
      const forums2 = await storage.getForums();
      const forumsWithAccess = await Promise.all(
        forums2.map(async (forum) => {
          const userId = req.user?.id;
          let hasAccess = forum.isPublic;
          if (userId) {
            if (forum.creatorId === userId) {
              hasAccess = true;
            } else if (!hasAccess && !forum.isPublic) {
              hasAccess = await storage.isForumMember(forum.id, userId);
            }
          }
          let requestStatus = null;
          let requestId = null;
          if (userId && !hasAccess && !forum.isPublic) {
            const existingRequest = await storage.getAccessRequestByUser(forum.id, userId);
            if (existingRequest) {
              requestStatus = existingRequest.status;
              requestId = existingRequest.id;
            }
          }
          return {
            ...forum,
            hasAccess,
            requestStatus,
            requestId
          };
        })
      );
      res.json(forumsWithAccess);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/forums/:id", optionalAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (!forum.isPublic) {
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        const isCreator = forum.creatorId === req.user.id;
        if (!isMember && !isCreator) {
          return res.status(403).send("Access denied");
        }
      }
      res.json(forum);
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/forums", requireAuth, async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "Not authenticated", message: "You must be logged in to create a forum." });
      }
      const validationResult = insertForumSchema.safeParse(req.body);
      if (!validationResult.success) {
        const error = fromZodError(validationResult.error);
        return res.status(400).send(error.message);
      }
      const user = await storage.getUser(req.user.id);
      if (!user) {
        console.error(`\u{1F510} User ${req.user.id} not found in database when creating forum`);
        if (req.session) req.session.destroy(() => {
        });
        return res.status(401).json({
          error: "User not found",
          message: "Your user account was not found. Please log in again."
        });
      }
      console.log(`\u{1F4CB} Creating forum "${validationResult.data.name}" by user ${user.username} (${user.id})`);
      const forum = await storage.createForum(validationResult.data, user.id);
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "forum_created",
            forum
          }));
        }
      });
      res.status(201).json(forum);
    } catch (error) {
      next(error);
    }
  });
  app2.delete("/api/forums/:id", requireAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (forum.creatorId !== req.user.id) {
        return res.status(403).send("Only the creator can delete this forum");
      }
      await storage.deleteForum(req.params.id);
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "forum_deleted",
            forumId: req.params.id
          }));
        }
      });
      res.status(200).json({ message: "Forum deleted successfully" });
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/users/:id/forums", requireAuth, async (req, res, next) => {
    try {
      if (req.params.id !== req.user.id) {
        return res.status(403).send("Access denied");
      }
      const forums2 = await storage.getUserForums(req.params.id);
      res.json(forums2);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/forums/:id/members", requireAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (!forum.isPublic) {
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        const isCreator = forum.creatorId === req.user.id;
        if (!isMember && !isCreator) {
          return res.status(403).send("Access denied");
        }
      }
      const members = await storage.getForumMembers(req.params.id);
      res.json(members);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/forums/:id/messages", optionalAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (!forum.isPublic) {
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }
      const messages2 = await storage.getMessages(req.params.id);
      res.json(messages2);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/forums/:id/files", optionalAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (!forum.isPublic) {
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;
      const files2 = await storage.getFiles(req.params.id, limit, offset);
      res.json(files2);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/forums/:id/files/count", optionalAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) return res.status(404).send("Forum not found");
      if (!forum.isPublic) {
        if (!req.isAuthenticated?.() || !req.user) return res.sendStatus(401);
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) return res.status(403).send("Access denied");
      }
      const counts = await storage.getFilesCount(req.params.id);
      res.json(counts);
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/files/update-extracted-tags", requireAuth, async (req, res, next) => {
    try {
      const { id, tags: tags2 } = req.body;
      if (!id) {
        return res.status(400).json({ error: "id is required" });
      }
      const connectionString = "postgresql://neondb_owner:npg_rjmolz6Ecn9T@ep-autumn-hall-aho0evwl-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
      const { Client: Client2 } = await import("pg");
      const client = new Client2({ connectionString });
      await client.connect();
      await client.query(
        "UPDATE video_mappings SET tags = $1, last_updated = NOW() WHERE id = $2",
        [tags2, id]
      );
      await client.end();
      res.json({ message: "Tags updated successfully" });
    } catch (error) {
      console.error("Update extracted tags error:", error);
      next(error);
    }
  });
  app2.post("/api/files/upload", requireAuth, upload.single("file"), async (req, res, next) => {
    if (!req.user || !req.user.id) {
      if (req.session) req.session.destroy(() => {
      });
      return res.status(401).json({ error: "Not authenticated", message: "You must be logged in to upload files." });
    }
    const dbUser = await storage.getUser(req.user.id);
    if (!dbUser) {
      if (req.session) req.session.destroy(() => {
      });
      return res.status(401).json({ error: "User not found", message: "Your user account was not found. Please log in again." });
    }
    try {
      if (!req.file) {
        return res.status(400).send("No file uploaded");
      }
      const { forumId, checksum, resumeUploadId } = req.body;
      if (!forumId) {
        return res.status(400).send("Forum ID required");
      }
      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (!forum.isPublic) {
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }
      const fileBuffer = req.file.buffer;
      const fileName = req.file.originalname;
      const fileSize = req.file.size;
      const mimeType = req.file.mimetype;
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (fileSize > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: "File too large",
          message: `File size (${(fileSize / (1024 * 1024)).toFixed(2)}MB) exceeds the maximum limit of 10MB`,
          maxSize: MAX_FILE_SIZE,
          actualSize: fileSize
        });
      }
      if (fileName === "dummy" && fileSize === 0) {
        const actualChecksum2 = checksum || crypto6.createHash("sha256").update(fileBuffer).digest("hex");
        const partialUpload2 = await storage.getPartialUploadByChecksum(actualChecksum2, req.user.id);
        if (partialUpload2) {
          return res.json({
            resumeRequired: true,
            partialUpload: {
              id: partialUpload2.id,
              fileName: partialUpload2.fileName,
              fileSize: partialUpload2.fileSize,
              uploadedChunks: partialUpload2.uploadedChunks.length,
              totalChunks: partialUpload2.totalChunks,
              progress: partialUpload2.uploadedChunks.length / partialUpload2.totalChunks * 100
            }
          });
        }
        return res.json({ resumeRequired: false });
      }
      const actualChecksum = checksum || crypto6.createHash("sha256").update(fileBuffer).digest("hex");
      let thumbnail;
      const providedThumbnail = typeof req.body.thumbnail === "string" ? req.body.thumbnail.trim() : "";
      if (providedThumbnail.startsWith("data:image/")) {
        thumbnail = providedThumbnail;
      } else if (mimeType.startsWith("image/")) {
        try {
          const sharp2 = await import("sharp");
          const thumbnailBuffer = await sharp2.default(fileBuffer).resize(300, 300, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
          thumbnail = `data:${mimeType};base64,${thumbnailBuffer.toString("base64")}`;
          console.log(`\u2705 Generated thumbnail for ${fileName}`);
        } catch (error) {
          console.warn(`Failed to generate thumbnail for ${fileName}:`, error);
        }
      } else if (mimeType.startsWith("video/")) {
        try {
          const fs6 = await import("fs/promises");
          const os2 = await import("os");
          const path9 = await import("path");
          const tempVideoPath = path9.join(os2.tmpdir(), `temp_video_${crypto6.randomUUID()}${path9.extname(fileName)}`);
          await fs6.writeFile(tempVideoPath, fileBuffer);
          const thumbnailBuffer = await generateVideoThumbnail2(tempVideoPath);
          if (thumbnailBuffer) {
            thumbnail = `data:image/jpeg;base64,${thumbnailBuffer.toString("base64")}`;
            console.log(`\u2705 Generated video thumbnail for ${fileName}`);
          }
          await fs6.unlink(tempVideoPath);
        } catch (error) {
          console.warn(`Failed to generate video thumbnail for ${fileName}:`, error);
        }
      }
      let partialUpload = null;
      let uploadedChunks = [];
      let resumeFromChunk = 0;
      if (resumeUploadId) {
        partialUpload = await storage.getPartialUploadByChecksum(actualChecksum, req.user.id);
        if (partialUpload && partialUpload.id === resumeUploadId) {
          uploadedChunks = partialUpload.uploadedChunks || [];
          resumeFromChunk = uploadedChunks.length;
        }
      } else {
        partialUpload = await storage.getPartialUploadByChecksum(actualChecksum, req.user.id);
        if (partialUpload) {
          return res.json({
            resumeRequired: true,
            partialUpload: {
              id: partialUpload.id,
              fileName: partialUpload.fileName,
              fileSize: partialUpload.fileSize,
              uploadedChunks: partialUpload.uploadedChunks.length,
              totalChunks: partialUpload.totalChunks,
              progress: partialUpload.uploadedChunks.length / partialUpload.totalChunks * 100
            }
          });
        }
      }
      if (!partialUpload) {
        const chunkSize2 = dropboxManager.getChunkSize();
        const totalChunks = Math.ceil(fileSize / chunkSize2);
        partialUpload = await storage.createPartialUpload(
          forumId,
          req.user.id,
          fileName,
          fileSize,
          mimeType,
          actualChecksum,
          totalChunks
        );
        uploadedChunks = [];
        resumeFromChunk = 0;
      } else {
        uploadedChunks = partialUpload.uploadedChunks || [];
        resumeFromChunk = uploadedChunks.length;
      }
      try {
        const dropboxCheck = await dropboxManager.verifyCapacity(fileSize);
        if (!dropboxCheck.success && fileSize > 100 * 1024 * 1024) {
          console.warn("Dropbox capacity check failed:", dropboxCheck.message);
        }
      } catch (error) {
        console.warn("Dropbox capacity check error:", error);
      }
      const chunkSize = dropboxManager.getChunkSize();
      const numChunks = Math.ceil(fileSize / chunkSize);
      const estimatedDbSize = 1e3 + numChunks * 500;
      try {
        const dbCheck = await dbManager.verifyCapacity(estimatedDbSize);
        if (!dbCheck.success) {
          console.warn("Database capacity warning:", dbCheck.message);
        }
      } catch (error) {
        console.warn("Database capacity check error:", error);
      }
      const file = await storage.createFile(forumId, req.user.id, fileName, fileSize, mimeType, thumbnail);
      let nextChunkToUpload = 0;
      for (let i = 0; i < numChunks; i++) {
        if (!uploadedChunks.includes(i)) {
          nextChunkToUpload = i;
          break;
        }
      }
      clients.forEach((c) => {
        if (c.userId === req.user.id && c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "upload_progress",
            fileId: file.id,
            progress: uploadedChunks.length / numChunks * 100,
            status: nextChunkToUpload > 0 ? "resuming" : "starting"
          }));
        }
      });
      try {
        console.log(`\u{1F680} Starting distributed upload for ${numChunks} chunks using upload servers...`);
        for (let i = nextChunkToUpload; i < numChunks; i++) {
          if (uploadedChunks.includes(i)) {
            continue;
          }
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, fileSize);
          const chunk = fileBuffer.slice(start, end);
          const dropboxPath = `/forums/${forumId}/${file.id}/chunk_${i}`;
          const accountId = dropboxManager.findBestAccount(chunk.length);
          if (accountId === null) {
            throw new Error("No Dropbox account has sufficient space");
          }
          console.log(`\u{1F4E4} Uploading chunk ${i}/${numChunks} to Dropbox account ${accountId}...`);
          const uploadResult = await dropboxManager.uploadChunkWithRetry(
            accountId,
            chunk,
            dropboxPath
          );
          await storage.createFileChunk(
            file.id,
            i,
            chunk.length,
            uploadResult.checksum,
            accountId,
            uploadResult.dropboxPath,
            uploadResult.dropboxFileId,
            uploadResult.downloadUrl
          );
          uploadedChunks.push(i);
          const progressPercent = uploadedChunks.length / numChunks * 100;
          clients.forEach((c) => {
            if (c.userId === req.user.id && c.ws.readyState === WebSocket2.OPEN) {
              c.ws.send(JSON.stringify({
                type: "upload_progress",
                fileId: file.id,
                progress: progressPercent,
                status: uploadedChunks.length === numChunks ? "completed" : "processing"
              }));
            }
          });
          await storage.updatePartialUploadChunks(partialUpload.id, uploadedChunks);
        }
        console.log(`\u{1F389} Successfully processed all ${numChunks} chunks`);
        await storage.deletePartialUpload(partialUpload.id);
        const uploader = await storage.getUser(req.user.id);
        const fileWithUser = { ...file, user: uploader };
        clients.forEach((c) => {
          if (c.ws.readyState === WebSocket2.OPEN) {
            c.ws.send(JSON.stringify({
              type: "file_uploaded",
              forumId,
              data: {
                file: fileWithUser,
                filename: fileWithUser.fileName,
                forumId
              }
            }));
          }
        });
        res.status(201).json({ success: true, fileId: file.id });
      } catch (uploadError) {
        await storage.updatePartialUploadChunks(partialUpload.id, uploadedChunks);
        clients.forEach((c) => {
          if (c.userId === req.user.id && c.ws.readyState === WebSocket2.OPEN) {
            c.ws.send(JSON.stringify({
              type: "upload_progress",
              fileId: file.id,
              progress: uploadedChunks.length / numChunks * 100,
              status: "error",
              error: uploadError instanceof Error ? uploadError.message : "Upload failed"
            }));
          }
        });
        console.error("Upload failed, initiating rollback:", uploadError);
        for (let i = nextChunkToUpload; i < uploadedChunks.length; i++) {
          const chunkIndex = uploadedChunks[i];
          try {
            const chunk = await storage.getFileById(file.id);
            if (chunk) {
              const chunkData = chunk.chunks.find((c) => c.chunkIndex === chunkIndex);
              if (chunkData && chunkData.dropboxPath) {
                await dropboxManager.deleteChunk(chunkData.dropboxAccountId, chunkData.dropboxPath);
                dropboxManager.updateAccountUsage(chunkData.dropboxAccountId, -chunkData.chunkSize);
              }
            }
          } catch (deleteError) {
            console.error(`Failed to delete chunk ${chunkIndex} during rollback:`, deleteError);
          }
        }
        uploadedChunks.splice(nextChunkToUpload);
        await storage.updatePartialUploadChunks(partialUpload.id, uploadedChunks);
        throw uploadError;
      }
    } catch (error) {
      console.error("File upload error:", error);
      next(error);
    }
  });
  registerStreamingUploadRoutes(app2, requireAuth, clients, storage, dropboxManager);
  app2.post("/api/upload/callback", express.json(), async (req, res) => {
    try {
      const {
        jobId,
        fileId,
        chunkIndex,
        status,
        progress,
        phase,
        serverId,
        message,
        error,
        chunkId,
        checksum,
        downloadUrl
      } = req.body;
      console.log(`\u{1F4E1} Upload callback received - Job: ${jobId}, Chunk: ${chunkIndex}, Phase: ${phase || status}, Progress: ${progress || "N/A"}%`);
      const chunkManager = req.app.locals.chunkManager;
      if (!chunkManager) {
        console.warn("\u26A0\uFE0F No chunk manager available for callback processing");
        return res.status(503).json({
          success: false,
          message: "Chunk manager not available"
        });
      }
      if (chunkManager.updateJobStatus) {
        chunkManager.updateJobStatus(jobId, {
          status: status || (error ? "failed" : "uploading"),
          progress: progress || 0,
          phase: phase || status,
          message: message || error,
          serverId,
          chunkId,
          checksum,
          downloadUrl,
          lastUpdate: Date.now()
        });
      }
      const wsManager2 = req.app.locals.wsManager;
      if (wsManager2 && fileId) {
        try {
          let fileProgress = progress || 0;
          if (chunkManager.getFileProgress) {
            fileProgress = chunkManager.getFileProgress(fileId);
          }
          wsManager2.broadcast({
            type: "upload_progress",
            fileId,
            jobId,
            chunkIndex: parseInt(chunkIndex),
            status: status || (error ? "failed" : "uploading"),
            phase: phase || status || "processing",
            progress: fileProgress,
            chunkProgress: progress || 0,
            message: message || error || `Chunk ${chunkIndex} ${phase || status}`,
            serverId,
            timestamp: Date.now()
          });
        } catch (broadcastError) {
          console.warn("\u26A0\uFE0F Failed to broadcast progress update:", broadcastError.message);
        }
      }
      if (status === "completed") {
        console.log(`\u2705 Chunk ${chunkIndex} completed successfully on ${serverId}`);
        res.json({
          success: true,
          message: "Progress updated successfully",
          acknowledged: true
        });
      } else if (status === "failed" || error) {
        console.error(`\u274C Chunk ${chunkIndex} failed on ${serverId}: ${error || message}`);
        res.json({
          success: true,
          message: "Failure acknowledged",
          acknowledged: true
        });
      } else {
        res.json({
          success: true,
          message: "Progress update received",
          acknowledged: true
        });
      }
    } catch (callbackError) {
      console.error("\u274C Upload callback processing error:", callbackError);
      res.status(500).json({
        success: false,
        message: "Failed to process callback",
        error: callbackError.message
      });
    }
  });
  app2.head("/api/files/:id/speed-test", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "application/octet-stream");
    res.status(200).end();
  });
  app2.get("/api/files/:id/metadata", requireAuth, async (req, res) => {
    try {
      const file = await storage.getFileById(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      let inputUrl = file.directDownloadUrl;
      if (!inputUrl) {
        return res.status(400).json({ error: "File does not have a direct download URL" });
      }
      inputUrl = getDirectDownloadUrl(inputUrl);
      const ffmpeg3 = (await import("fluent-ffmpeg")).default;
      try {
        const ffprobeInstaller = (await import("@ffprobe-installer/ffprobe")).default;
        ffmpeg3.setFfprobePath(ffprobeInstaller.path);
      } catch (e) {
        console.warn("Could not load @ffprobe-installer/ffprobe, relying on system path");
      }
      ffmpeg3.ffprobe(inputUrl, (err, metadata) => {
        if (err) {
          console.error("ffprobe error:", err);
          return res.status(500).json({ error: "Failed to probe file" });
        }
        res.json({
          duration: metadata.format.duration,
          format: metadata.format.format_name,
          streams: metadata.streams.map((s) => ({
            codec_type: s.codec_type,
            codec_name: s.codec_name,
            width: s.width,
            height: s.height
          }))
        });
      });
    } catch (error) {
      console.error("Metadata request error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/files/:id", optionalAuth, async (req, res, next) => {
    try {
      const id = req.params.id;
      const file = await storage.getFileById(id);
      if (!file) return res.status(404).json({ error: "File not found" });
      try {
        const forum = await storage.getForumById(file.forumId);
        if (forum && !forum.isPublic) {
          if (!req.isAuthenticated?.() || !req.user) return res.sendStatus(401);
          const isMember = await storage.isForumMember(forum.id, req.user.id);
          const isCreator = forum.creatorId === req.user.id;
          if (!isMember && !isCreator) return res.status(403).json({ error: "Access denied" });
        }
      } catch (e) {
      }
      res.json(file);
    } catch (error) {
      next(error);
    }
  });
  const chunkInfoCache = /* @__PURE__ */ new Map();
  const CACHE_TTL = 5 * 60 * 1e3;
  app2.get("/api/files/:id/priority-status", requireAuth, async (req, res, next) => {
    try {
      const fileId = req.params.id;
      const file = await storage.getFileById(fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      if (!file.isPublic) {
        const user = req.user;
        if (!user) {
          return res.status(401).json({ error: "Authentication required" });
        }
        const hasAccess = await storage.isForumMember(file.forumId, user.id);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const processorStatus = globalPriorityProcessor.getStatus();
      const streamingStatus = globalStreamingProcessor.getStatus?.() || { activeChunks: [], priorityChunks: [] };
      res.json({
        fileId,
        fileName: file.fileName,
        priorityProcessor: processorStatus,
        streamingProcessor: streamingStatus,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("Priority status error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/priority-processing/cancel-all", requireAuth, async (req, res, next) => {
    try {
      console.log("[PriorityProcessor] Cancelling all priority processing");
      globalPriorityProcessor.cancelAll();
      globalStreamingProcessor.clearPriorityChunks();
      res.json({
        success: true,
        message: "All priority processing cancelled",
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("Cancel priority processing error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/files/:id/chunk-info", requireAuth, async (req, res, next) => {
    try {
      const fileId = req.params.id;
      const cacheKey = `chunk-info-${fileId}`;
      const now = Date.now();
      const cached = chunkInfoCache.get(cacheKey);
      if (cached && now - cached.timestamp < CACHE_TTL) {
        console.log(`[ChunkInfo] Serving cached data for file ${fileId}`);
        return res.json(cached.data);
      }
      console.log(`[ChunkInfo] Fetching fresh data for file ${fileId}`);
      const file = await storage.getFileById(fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      if (!file.isPublic) {
        const user = req.user;
        if (!user) {
          return res.status(401).json({ error: "Authentication required" });
        }
        const hasAccess = await storage.isForumMember(file.forumId, user.id);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const chunks = file.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const chunkInfo = chunks.map((chunk, index) => ({
        index: chunk.chunkIndex,
        size: chunk.size,
        startByte: chunks.slice(0, index).reduce((sum, c) => sum + c.size, 0),
        endByte: chunks.slice(0, index + 1).reduce((sum, c) => sum + c.size, 0) - 1
      }));
      const responseData = {
        totalChunks: chunks.length,
        totalSize: file.fileSize,
        chunks: chunkInfo,
        avgChunkSize: file.fileSize / chunks.length
      };
      chunkInfoCache.set(cacheKey, { data: responseData, timestamp: now });
      if (chunkInfoCache.size > 100) {
        for (const [key, value] of chunkInfoCache.entries()) {
          if (now - value.timestamp > CACHE_TTL) {
            chunkInfoCache.delete(key);
          }
        }
      }
      res.json(responseData);
    } catch (error) {
      console.error("Chunk info error:", error);
      next(error);
    }
  });
  app2.post("/api/files/:id/priority-chunk", requireAuth, async (req, res, next) => {
    try {
      const { chunkIndex, forceProcess = true } = req.body;
      const fileId = req.params.id;
      if (chunkIndex === void 0 || chunkIndex < 0) {
        return res.status(400).json({ error: "Valid chunk index required" });
      }
      const file = await storage.getFileById(fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      if (!file.isPublic) {
        const user = req.user;
        if (!user) {
          return res.status(401).json({ error: "Authentication required" });
        }
        const hasAccess = await storage.isForumMember(file.forumId, user.id);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      const chunks = file.chunks?.sort((a, b) => a.chunkIndex - b.chunkIndex) || [];
      const targetChunk = chunks.find((c) => c.chunkIndex === chunkIndex);
      if (!targetChunk) {
        return res.status(404).json({ error: "Chunk not found" });
      }
      console.log(`[PriorityChunk] Processing priority request for chunk ${chunkIndex} of file ${file.fileName}`);
      globalStreamingProcessor.setPriorityChunks([chunkIndex]);
      try {
        const result = await globalPriorityProcessor.processChunkImmediate(
          `${fileId}-${chunkIndex}`,
          chunkIndex,
          async (signal) => {
            await new Promise((resolve) => {
              if (signal.aborted) {
                throw new Error("Aborted");
              }
              setTimeout(() => {
                if (signal.aborted) {
                  throw new Error("Aborted");
                }
                resolve(null);
              }, 100);
            });
            return {
              chunkId: `${fileId}-${chunkIndex}`,
              chunkIndex,
              processed: true,
              timestamp: Date.now()
            };
          },
          {
            priority: "high",
            cancelOthers: forceProcess,
            timeout: 15e3
            // 15 second timeout for chunk processing
          }
        );
        console.log(`[PriorityChunk] Successfully processed priority chunk ${chunkIndex} for file ${file.fileName}`);
        res.json({
          success: true,
          message: `Chunk ${chunkIndex} processed with high priority`,
          result,
          streamUrl: `/api/files/${fileId}/stream?chunk=${chunkIndex}&priority=true`
        });
      } catch (error) {
        console.error(`[PriorityChunk] Failed to process priority chunk ${chunkIndex}:`, error);
        res.status(500).json({
          success: false,
          error: "Failed to process priority chunk",
          message: error.message
        });
      }
    } catch (error) {
      console.error("Priority chunk processing error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/files/:id/stream-smart", requireAuth, async (req, res, next) => {
    try {
      const fileId = req.params.id;
      const file = await storage.getFileById(fileId);
      if (!file) {
        return res.status(404).send("File not found");
      }
      const seekTime = parseFloat(req.query.seekTime) || 0;
      const duration = parseFloat(req.query.duration) || 0;
      const bufferAhead = parseInt(req.query.bufferAhead) || 2;
      const bufferBehind = parseInt(req.query.bufferBehind) || 1;
      console.log(`[SmartStream] \u{1F3AF} SMART SEEK DEBUG for ${file.fileName}:`);
      console.log(`[SmartStream]   - seekTime: ${seekTime}s (${Math.floor(seekTime / 60)}:${Math.floor(seekTime % 60).toString().padStart(2, "0")})`);
      console.log(`[SmartStream]   - duration: ${duration}s (${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, "0")})`);
      console.log(`[SmartStream]   - bufferAhead: ${bufferAhead}, bufferBehind: ${bufferBehind}`);
      if (!file.isPublic) {
        const user = req.user;
        if (!user) {
          return res.status(401).send("Authentication required");
        }
        const hasAccess = await storage.isForumMember(file.forumId, user.id);
        if (!hasAccess) {
          return res.status(403).send("Access denied");
        }
      }
      const chunks = file.chunks?.sort((a, b) => a.chunkIndex - b.chunkIndex) || [];
      if (chunks.length === 0) {
        console.log(`[SmartSeek] No chunks found for file ${file.fileName} (${file.id}), checking for direct URL fallback`);
        if (file.isAdminCreated && file.directDownloadUrl) {
          console.log(`[SmartSeek] Using direct URL streaming for ${file.fileName}: ${file.directDownloadUrl}`);
          const seekRatio2 = duration > 0 ? seekTime / duration : 0;
          const fileSize = file.fileSize || 0;
          const safeSeekRatio = Math.max(0, seekRatio2 - 0.02);
          const chunkSize = 1024 * 1024 * 8;
          const startByte = Math.floor(safeSeekRatio * fileSize);
          const endByte = Math.min(startByte + chunkSize - 1, fileSize - 1);
          console.log(`[SmartSeek] \u{1F3AF} BYTE RANGE CALCULATION:`);
          console.log(`[SmartSeek]   - seekTime: ${seekTime}s (${Math.floor(seekTime / 60)}:${Math.floor(seekTime % 60).toString().padStart(2, "0")})`);
          console.log(`[SmartSeek]   - duration: ${duration}s (${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, "0")})`);
          console.log(`[SmartSeek]   - seekRatio: ${seekRatio2.toFixed(4)} (${(seekRatio2 * 100).toFixed(2)}%)`);
          console.log(`[SmartSeek]   - fileSize: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
          console.log(`[SmartSeek]   - startByte: ${startByte} (${(startByte / 1024 / 1024).toFixed(2)}MB)`);
          console.log(`[SmartSeek]   - endByte: ${endByte} (${(endByte / 1024 / 1024).toFixed(2)}MB)`);
          console.log(`[SmartSeek]   - Range: ${startByte}-${endByte} (${((endByte - startByte + 1) / 1024 / 1024).toFixed(2)}MB)`);
          if (startByte >= fileSize || endByte >= fileSize || startByte > endByte) {
            console.error(`[SmartSeek] Invalid byte range: ${startByte}-${endByte} for file size ${fileSize}`);
            return res.redirect(302, `/api/files/${file.id}/stream`);
          }
          try {
            console.log(`[SmartSeek] Fetching range from: ${file.directDownloadUrl}`);
            console.log(`[SmartSeek] Range header: bytes=${startByte}-${endByte}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15e3);
            const response = await fetch2(file.directDownloadUrl, {
              headers: {
                "Range": `bytes=${startByte}-${endByte}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8",
                "Accept-Encoding": "identity",
                "Connection": "keep-alive"
              },
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            console.log(`[SmartSeek] Direct URL response: ${response.status} ${response.statusText}`);
            console.log(`[SmartSeek] Response headers:`, {
              "content-length": response.headers.get("content-length"),
              "content-range": response.headers.get("content-range"),
              "content-type": response.headers.get("content-type"),
              "accept-ranges": response.headers.get("accept-ranges")
            });
            if (response.ok) {
              res.setHeader("Content-Type", file.mimeType || "video/mp4");
              res.setHeader("Accept-Ranges", "bytes");
              res.setHeader("Content-Length", endByte - startByte + 1);
              res.setHeader("Content-Range", `bytes ${startByte}-${endByte}/${fileSize}`);
              res.setHeader("X-Smart-Seek-Mode", "direct-url");
              res.setHeader("X-Smart-Seek-Time", seekTime.toString());
              res.setHeader("X-Smart-Seek-Duration", duration.toString());
              res.setHeader("X-Smart-Seek-Ratio", seekRatio2.toString());
              res.status(206);
              if (response.body) {
                try {
                  console.log(`[SmartSeek] Streaming ${((endByte - startByte + 1) / 1024 / 1024).toFixed(2)}MB from direct URL`);
                  if (typeof response.body.pipe === "function") {
                    response.body.pipe(res);
                    response.body.on("error", (error) => {
                      console.error(`[SmartSeek] Stream error:`, error);
                      if (!res.headersSent) {
                        res.status(500).end("Streaming error");
                      }
                    });
                    response.body.on("end", () => {
                      console.log(`[SmartSeek] Stream completed for ${file.fileName}`);
                    });
                    return;
                  } else {
                    console.log(`[SmartSeek] Using buffer fallback for streaming`);
                    const buffer = Buffer.from(await response.arrayBuffer());
                    res.write(buffer);
                    res.end();
                    console.log(`[SmartSeek] Buffer streaming completed for ${file.fileName}`);
                    return;
                  }
                } catch (streamError) {
                  console.error(`[SmartSeek] Streaming error:`, streamError);
                }
              } else {
                console.error(`[SmartSeek] No response body available`);
              }
            } else {
              console.error(`[SmartSeek] Direct URL request failed: ${response.status} ${response.statusText}`);
            }
          } catch (error) {
            console.error(`[SmartSeek] Error fetching direct URL:`, error);
          }
        }
        console.log(`[SmartSeek] Falling back to regular streaming for ${file.fileName}`);
        const rangeHeader = req.headers.range;
        if (!rangeHeader) {
          const seekRatio2 = duration > 0 ? seekTime / duration : 0;
          const estimatedStart = Math.floor(seekRatio2 * (file.fileSize || 0));
          req.headers.range = `bytes=${estimatedStart}-`;
          console.log(`[SmartSeek] Added range header for fallback: bytes=${estimatedStart}-`);
        }
        return res.redirect(302, `/api/files/${file.id}/stream`);
      }
      console.log(`[SmartSeek] File: ${file.fileName} (${file.id})`);
      console.log(`[SmartSeek] Request params: seekTime=${seekTime}s, duration=${duration}s, bufferAhead=${bufferAhead}, bufferBehind=${bufferBehind}`);
      console.log(`[SmartSeek] Total chunks available: ${chunks.length}`);
      const seekRatio = duration > 0 ? seekTime / duration : 0;
      const targetChunkIndex = Math.floor(seekRatio * chunks.length);
      const startChunkIndex = Math.max(0, targetChunkIndex - bufferBehind);
      const endChunkIndex = Math.min(chunks.length - 1, targetChunkIndex + bufferAhead);
      const chunksToLoad = chunks.slice(startChunkIndex, endChunkIndex + 1);
      console.log(`[SmartSeek] Seek calculation: ratio=${seekRatio.toFixed(3)}, targetChunk=${targetChunkIndex}`);
      console.log(`[SmartSeek] Loading chunks ${startChunkIndex} to ${endChunkIndex} (${chunksToLoad.length} chunks)`);
      console.log(`[SmartSeek] Chunk details:`, chunksToLoad.map((c) => `${c.chunkIndex}(${Math.round(c.size / 1024)}KB)`).join(", "));
      const totalSize = chunksToLoad.reduce((sum, chunk) => sum + chunk.size, 0);
      console.log(`[SmartSeek] Total size to stream: ${Math.round(totalSize / 1024 / 1024 * 100) / 100}MB`);
      res.setHeader("Content-Type", file.mimeType || "video/mp4");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", totalSize);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("X-Seek-Chunks", `${startChunkIndex}-${endChunkIndex}`);
      res.setHeader("X-Target-Chunk", targetChunkIndex.toString());
      await streamSpecificChunks(chunksToLoad, res);
    } catch (error) {
      console.error("Smart streaming error:", error);
      next(error);
    }
  });
  app2.get("/api/files/:id/stream", requireAuth, async (req, res, next) => {
    try {
      const file = await storage.getFileById(req.params.id);
      if (!file) {
        return res.status(404).send("File not found");
      }
      const requestedQuality = parseInt(req.query.quality) || 720;
      const adaptiveMode = req.query.adaptive === "true";
      const chunkIndex = parseInt(req.query.chunk) || -1;
      const chunkSize = parseInt(req.query.size) || 1024 * 1024;
      const isPriorityRequest = req.query.priority === "true";
      if (!file.isPublic) {
        const user = req.user;
        if (!user) {
          return res.status(401).send("Authentication required");
        }
        const hasAccess = await storage.isForumMember(file.forumId, user.id);
        if (!hasAccess) {
          return res.status(403).send("Access denied");
        }
      }
      if (file.isAdminCreated && file.directDownloadUrl) {
        if (file.mimeType === "application/x-mpegurl" || file.directDownloadUrl.toLowerCase().endsWith(".m3u8")) {
          console.log(`[M3U8 Direct] Serving M3U8 playlist directly for: ${file.fileName}, URL: ${file.directDownloadUrl}`);
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15e3);
            const response = await fetch2(file.directDownloadUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              },
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
              console.error(`[M3U8 Direct] Failed to fetch M3U8 playlist: ${response.status}`);
              return res.status(response.status).json({ error: "Failed to fetch M3U8 playlist" });
            }
            const m3u8Content = await response.text();
            console.log(`[M3U8 Direct] Successfully fetched M3U8 playlist, length: ${m3u8Content.length} chars`);
            const baseUrl = new URL(file.directDownloadUrl).origin + new URL(file.directDownloadUrl).pathname.split("/").slice(0, -1).join("/") + "/";
            const defaultProxyHost = `${req.protocol}://${req.get("host")}`;
            const proxyBaseUrl = process.env.MEDIA_PROXY_BASE || defaultProxyHost;
            const rewrittenContent = m3u8Content.split("\n").map((line) => {
              if (line.trim() && !line.startsWith("#")) {
                try {
                  const fullUrl = new URL(line, baseUrl).href;
                  return `${proxyBaseUrl}/api/proxy?url=${encodeURIComponent(fullUrl)}`;
                } catch (error) {
                  console.error(`[M3U8 Direct] Error rewriting URL ${line}:`, error);
                  return line;
                }
              }
              return line;
            }).join("\n");
            res.setHeader("Content-Type", "application/x-mpegurl");
            res.setHeader("Cache-Control", "public, max-age=3600");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.send(rewrittenContent);
            return;
          } catch (error) {
            console.error(`[M3U8 Direct] Error fetching M3U8 playlist:`, error);
            return res.status(500).json({ error: "Failed to fetch M3U8 playlist", message: error.message });
          }
        }
        try {
          return await handleExternalFileStreaming(file, req, res, { chunkIndex, chunkSize, adaptiveMode });
        } catch (error) {
          console.error(`[Streaming] External URL streaming failed for ${file.fileName}:`, error.message);
          return res.status(502).json({
            error: "External video source unavailable",
            message: "The video source is temporarily unavailable. Please try again later.",
            details: error.message.includes("ETIMEDOUT") ? "Connection timeout" : "Network error"
          });
        }
      }
      const contentLength = file.fileSize;
      const range = req.headers.range;
      res.setHeader("Content-Type", file.mimeType || "video/mp4");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Range");
      if (chunkIndex >= 0) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize - 1, contentLength - 1);
        if (start >= contentLength) {
          return res.status(416).send("Range Not Satisfiable");
        }
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${contentLength}`);
        res.setHeader("Content-Length", end - start + 1);
        await streamFileRange(file, start, end, res);
        return;
      }
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const CHUNK_SIZE = 10 * 1024 * 1024;
        const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + CHUNK_SIZE - 1, contentLength - 1);
        const chunksize = end - start + 1;
        console.log(`[RegularStream] Range request for ${file.fileName}: bytes=${start}-${end} (${Math.round(chunksize / 1024)}KB)`);
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${contentLength}`);
        res.setHeader("Content-Length", chunksize);
        await streamFileRange(file, start, end, res);
      } else {
        console.log(`[RegularStream] Full file request for ${file.fileName} (${Math.round(contentLength / 1024 / 1024 * 100) / 100}MB)`);
        res.setHeader("Content-Length", contentLength);
        await streamFileRange(file, 0, contentLength - 1, res);
      }
    } catch (error) {
      console.error("File streaming error:", error);
      next(error);
    }
  });
  function getDirectDownloadUrl(url) {
    if (!url) return url;
    if (url.includes("dropbox.com")) {
      let directUrl = url.replace("www.dropbox.com", "dl.dropboxusercontent.com");
      try {
        const urlObj = new URL(directUrl);
        urlObj.searchParams.delete("dl");
        urlObj.searchParams.delete("raw");
        return urlObj.toString();
      } catch (e) {
        return directUrl;
      }
    }
    if (url.includes("drive.google.com")) {
      try {
        const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          return `https://drive.google.com/uc?export=download&id=${match[1]}`;
        }
      } catch (e) {
        console.warn("Failed to convert Google Drive URL:", e);
      }
    }
    return url;
  }
  async function handleM3U8Streaming(file, req, res) {
    try {
      console.log(`[M3U8 Stream] Starting M3U8 streaming for: ${file.fileName}, URL: ${file.directDownloadUrl}`);
      const defaultHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "video/webm,video/mp4,video/*,application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.9",
        "Referer": new URL(file.directDownloadUrl).origin
      };
      const segments = await parseM3U8Segments(file.directDownloadUrl, defaultHeaders);
      if (!segments || segments.length === 0) {
        console.error(`[M3U8 Stream] No segments found in playlist for ${file.fileName}`);
        return res.status(400).json({ error: "Invalid M3U8 playlist", message: "Could not parse video segments" });
      }
      console.log(`[M3U8 Stream] Found ${segments.length} segments to stream`);
      let totalSize = 0;
      const segmentSizes = [];
      for (const segmentUrl of segments) {
        try {
          let response = await fetch2(segmentUrl, { method: "HEAD", headers: defaultHeaders });
          if (!response.ok) {
            response = await fetch2(segmentUrl, { method: "GET", headers: { ...defaultHeaders, Range: "bytes=0-0" } });
          }
          if (response.ok) {
            const contentLength = response.headers.get("content-length");
            const size = contentLength ? parseInt(contentLength) : 0;
            segmentSizes.push(size);
            totalSize += size;
          } else {
            segmentSizes.push(0);
          }
        } catch (error) {
          console.warn(`[M3U8 Stream] Failed to get size for segment: ${segmentUrl}`, error?.message || error);
          segmentSizes.push(0);
        }
      }
      console.log(`[M3U8 Stream] Total calculated size: ${totalSize} bytes`);
      const range = req.headers.range;
      let startByte = 0;
      let endByte = totalSize - 1;
      const unknownLength = totalSize === 0;
      if (range && !unknownLength) {
        const parts = range.replace(/bytes=/, "").split("-");
        startByte = parseInt(parts[0], 10);
        endByte = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        console.log(`[M3U8 Stream] Range request: bytes=${startByte}-${endByte}`);
      }
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Range");
      if (!unknownLength) {
        if (range) {
          res.status(206);
          res.setHeader("Content-Range", `bytes ${startByte}-${endByte}/${totalSize}`);
          res.setHeader("Content-Length", endByte - startByte + 1);
        } else {
          res.setHeader("Content-Length", totalSize);
        }
      } else {
        res.setHeader("Transfer-Encoding", "chunked");
      }
      let currentByte = 0;
      let bytesSent = 0;
      for (let i = 0; i < segments.length; i++) {
        const segmentUrl = segments[i];
        const segmentSize = segmentSizes[i];
        if (currentByte + segmentSize <= startByte) {
          currentByte += segmentSize;
          continue;
        }
        if (currentByte >= endByte) {
          break;
        }
        console.log(`[M3U8 Stream] Streaming segment ${i + 1}/${segments.length}: ${segmentUrl}`);
        try {
          const response = await fetch2(segmentUrl, { headers: defaultHeaders });
          if (!response.ok) {
            console.error(`[M3U8 Stream] Failed to fetch segment ${i}: ${response.status}`);
            continue;
          }
          const reader = response.body?.getReader();
          if (!reader) continue;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkStart = Math.max(currentByte, startByte);
            const chunkEnd = Math.min(currentByte + value.length - 1, endByte);
            if (chunkStart <= chunkEnd) {
              const offset = chunkStart - currentByte;
              const length = chunkEnd - chunkStart + 1;
              const chunk = value.slice(offset, offset + length);
              res.write(chunk);
              bytesSent += chunk.length;
            }
            currentByte += value.length;
          }
        } catch (error) {
          console.error(`[M3U8 Stream] Error streaming segment ${i}:`, error);
        }
      }
      console.log(`[M3U8 Stream] Completed streaming ${bytesSent} bytes`);
      res.end();
    } catch (error) {
      console.error(`[M3U8 Stream] Error:`, error);
      res.status(500).json({ error: "Streaming failed", message: error.message });
    }
  }
  async function parseM3U8Segments(m3u8Url, headers = null) {
    try {
      console.log(`[M3U8 Parse] Fetching playlist from:`, m3u8Url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15e3);
      const response = await fetch2(m3u8Url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          ...headers || {}
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        console.warn(`[M3U8 Parse] Failed to fetch playlist:`, response.status);
        return null;
      }
      const content = await response.text();
      console.log(`[M3U8 Parse] Playlist content length:`, content.length);
      const lines = content.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
      const segments = [];
      for (const line of lines) {
        if (line.endsWith(".ts") || line.endsWith(".mp4") || line.includes("segment")) {
          const segmentUrl = line.startsWith("http") ? line : new URL(line, m3u8Url).href;
          segments.push(segmentUrl);
        }
      }
      console.log(`[M3U8 Parse] Extracted ${segments.length} segments:`, segments.slice(0, 3), segments.length > 3 ? "..." : "");
      return segments;
    } catch (error) {
      console.error(`[M3U8 Parse] Failed to parse playlist:`, error);
      return null;
    }
  }
  async function transcodeM3U8ToMP4(m3u8Url, res, fileId, userId, clients2) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`[M3U8 Transcode] Starting transcoding for: ${m3u8Url}`);
        const defaultHeaders = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "video/webm,video/mp4,video/*,application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.9",
          "Referer": new URL(m3u8Url).origin
        };
        const segments = await parseM3U8Segments(m3u8Url, defaultHeaders);
        if (!segments || segments.length === 0) {
          throw new Error("No segments found in M3U8 playlist");
        }
        console.log(`[M3U8 Transcode] Found ${segments.length} segments to transcode`);
        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Disposition", 'attachment; filename="video.mp4"');
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Transfer-Encoding", "chunked");
        const headersString = `User-Agent: ${defaultHeaders["User-Agent"]}\r
Referer: ${defaultHeaders["Referer"]}\r
`;
        const command = ffmpeg2().input(m3u8Url).inputOptions(["-headers", headersString]).outputOptions([
          "-c",
          "copy",
          // Copy streams without re-encoding for speed
          "-bsf:a",
          "aac_adtstoasc",
          // Convert AAC format if needed
          "-movflags",
          "frag_keyframe+empty_moov"
          // Progressive download friendly
        ]).outputFormat("mp4").on("start", (commandLine) => {
          console.log(`[M3U8 Transcode] FFmpeg command: ${commandLine}`);
        }).on("progress", (progress) => {
          console.log(`[M3U8 Transcode] Progress: ${progress.percent}% done`);
          clients2.forEach((client) => {
            if (client.userId === userId && client.ws.readyState === WebSocket2.OPEN) {
              client.ws.send(JSON.stringify({
                type: "download_progress",
                fileId,
                progress: progress.percent
              }));
            }
          });
        }).on("end", () => {
          console.log(`[M3U8 Transcode] Transcoding completed successfully`);
          clients2.forEach((client) => {
            if (client.userId === userId && client.ws.readyState === WebSocket2.OPEN) {
              client.ws.send(JSON.stringify({
                type: "download_complete",
                fileId
              }));
            }
          });
          resolve();
        }).on("error", (err) => {
          console.error(`[M3U8 Transcode] FFmpeg error:`, err);
          clients2.forEach((client) => {
            if (client.userId === userId && client.ws.readyState === WebSocket2.OPEN) {
              client.ws.send(JSON.stringify({
                type: "download_error",
                fileId,
                error: err.message
              }));
            }
          });
          reject(err);
        });
        command.pipe(res, { end: true });
      } catch (error) {
        console.error(`[M3U8 Transcode] Error:`, error);
        reject(error);
      }
    });
  }
  async function handleExternalFileStreaming(file, req, res, options) {
    const { chunkIndex, chunkSize, adaptiveMode } = options;
    const range = req.headers.range;
    try {
      const contentLength = file.fileSize;
      res.setHeader("Content-Type", file.mimeType || "video/mp4");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Range");
      let start = 0;
      let end = contentLength - 1;
      if (chunkIndex >= 0) {
        start = chunkIndex * chunkSize;
        end = Math.min(start + chunkSize - 1, contentLength - 1);
        if (start >= contentLength) {
          return res.status(416).send("Range Not Satisfiable");
        }
      } else if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        start = parseInt(parts[0], 10);
        const MAX_CHUNK_SIZE = 5 * 1024 * 1024;
        const requestedEnd = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;
        const isSeekRequest = start > 0;
        const chunkSize2 = isSeekRequest ? 8 * 1024 * 1024 : MAX_CHUNK_SIZE;
        end = Math.min(start + chunkSize2 - 1, requestedEnd, contentLength - 1);
      } else {
        const MAX_CHUNK_SIZE = 5 * 1024 * 1024;
        end = Math.min(MAX_CHUNK_SIZE - 1, contentLength - 1);
      }
      let currentUrl = getDirectDownloadUrl(file.directDownloadUrl);
      console.log(`[Streaming] Processing request for ${file.fileName}`);
      console.log(`[Streaming] Client requested range: ${range || "None (Full file)"}`);
      console.log(`[Streaming] Calculated chunk: ${start}-${end} (Size: ${end - start + 1} bytes)`);
      console.log(`[Streaming] Upstream URL: ${currentUrl}`);
      let rangeResponse;
      let redirectCount = 0;
      const maxRedirects = 5;
      while (redirectCount < maxRedirects) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2e4);
          rangeResponse = await fetch2(currentUrl, {
            headers: {
              "Range": `bytes=${start}-${end}`,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8",
              "Accept-Encoding": "identity",
              "Connection": "keep-alive"
            },
            redirect: "manual",
            timeout: 45e3,
            // 45 second timeout for YouTube URLs
            signal: AbortSignal.timeout(45e3)
          });
          if (rangeResponse.status === 301 || rangeResponse.status === 302 || rangeResponse.status === 307 || rangeResponse.status === 308) {
            const location = rangeResponse.headers.get("location");
            if (location) {
              currentUrl = location;
              redirectCount++;
              continue;
            }
          }
          break;
        } catch (err) {
          console.error(`[Streaming] Error fetching external URL (attempt ${redirectCount + 1}):`, err);
          if (err.code === "ETIMEDOUT" || err.type === "system") {
            console.error(`[Streaming] Timeout error for external URL: ${currentUrl}`);
            throw new Error(`Failed to proxy external URL: Connection timeout. The external video source may be temporarily unavailable.`);
          }
          if (redirectCount < maxRedirects - 1) {
            redirectCount++;
            continue;
          }
          throw err;
        }
      }
      if (!rangeResponse) {
        throw new Error("Failed to fetch external file");
      }
      console.log(`[Streaming] ${file.fileName} - Range: ${start}-${end} - Status: ${rangeResponse.status}`);
      if (rangeResponse.status === 206) {
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${contentLength}`);
        res.setHeader("Content-Length", end - start + 1);
        if (rangeResponse.body) {
          if (typeof rangeResponse.body.pipe === "function") {
            rangeResponse.body.pipe(res);
          } else {
            const reader = rangeResponse.body.getReader();
            req.on("close", () => {
              console.log(`[Streaming] Client disconnected for ${file.fileName}, aborting upstream fetch.`);
              reader.cancel().catch((e) => console.error("Error cancelling reader:", e));
            });
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!res.writableEnded) {
                  const canWrite = res.write(value);
                  if (!canWrite) {
                    await new Promise((resolve) => res.once("drain", resolve));
                  }
                } else {
                  break;
                }
              }
            } catch (e) {
              console.error("[Streaming] Error piping stream:", e);
            } finally {
              if (!res.writableEnded) res.end();
            }
          }
        } else {
          res.end();
        }
      } else if (rangeResponse.status === 200) {
        console.warn(`[Streaming] External provider returned 200 OK instead of 206 for ${file.fileName}. Simulating chunk.`);
        if (start === 0) {
          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${contentLength}`);
          res.setHeader("Content-Length", end - start + 1);
        } else {
          console.warn(`[Streaming] Simulating seek to ${start} from full stream.`);
        }
        if (rangeResponse.body) {
          const stream = rangeResponse.body;
          let bytesSent = 0;
          const maxBytes = end - start + 1;
          let bytesSkipped = 0;
          if (typeof stream.on === "function") {
            stream.on("data", (chunk) => {
              let chunkToProcess = chunk;
              if (bytesSkipped < start) {
                const remainingSkip = start - bytesSkipped;
                if (chunk.length <= remainingSkip) {
                  bytesSkipped += chunk.length;
                  return;
                } else {
                  chunkToProcess = chunk.slice(remainingSkip);
                  bytesSkipped += remainingSkip;
                }
              }
              if (bytesSent < maxBytes) {
                const remainingSend = maxBytes - bytesSent;
                const toSend = chunkToProcess.length > remainingSend ? chunkToProcess.slice(0, remainingSend) : chunkToProcess;
                res.write(toSend);
                bytesSent += toSend.length;
                if (bytesSent >= maxBytes) {
                  console.log(`[Streaming] Chunk complete. Sent ${bytesSent} bytes. Closing stream.`);
                  stream.destroy();
                  res.end();
                }
              } else {
                stream.destroy();
                res.end();
              }
            });
            stream.on("end", () => {
              if (!res.writableEnded) res.end();
            });
            stream.on("error", (err) => {
              console.error("[Streaming] Stream error:", err);
              if (!res.writableEnded) res.end();
            });
          } else {
            const reader = stream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                let chunk = value;
                if (bytesSkipped < start) {
                  const remainingSkip = start - bytesSkipped;
                  if (chunk.length <= remainingSkip) {
                    bytesSkipped += chunk.length;
                    continue;
                  } else {
                    chunk = chunk.slice(remainingSkip);
                    bytesSkipped += remainingSkip;
                  }
                }
                if (bytesSent < maxBytes) {
                  const remainingSend = maxBytes - bytesSent;
                  const toSend = chunk.length > remainingSend ? chunk.slice(0, remainingSend) : chunk;
                  res.write(toSend);
                  bytesSent += toSend.length;
                  if (bytesSent >= maxBytes) {
                    console.log(`[Streaming] Chunk complete. Sent ${bytesSent} bytes. Closing reader.`);
                    await reader.cancel();
                    break;
                  }
                } else {
                  await reader.cancel();
                  break;
                }
              }
            } catch (err) {
              console.error("[Streaming] Web Stream error:", err);
            } finally {
              if (!res.writableEnded) res.end();
            }
          }
        } else {
          res.end();
        }
      } else {
        console.error(`[Streaming] External provider returned status ${rangeResponse.status}`);
        return res.status(416).send("Range Not Satisfiable");
      }
    } catch (error) {
      console.error("Advanced streaming error:", error);
      if (!res.headersSent) {
        return res.status(500).send("Failed to stream external file");
      }
      res.end();
    }
  }
  async function streamFileRange(file, start, end, res) {
    const chunks = file.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const STREAM_CHUNK_SIZE = 64 * 1024;
    let currentPosition = 0;
    for (const chunk of chunks) {
      const chunkStart = currentPosition;
      const chunkEnd = currentPosition + chunk.size - 1;
      if (chunkEnd < start) {
        currentPosition += chunk.size;
        continue;
      }
      if (chunkStart > end) {
        break;
      }
      try {
        const dataStart = Math.max(0, start - chunkStart);
        const dataEnd = Math.min(chunk.size - 1, end - chunkStart);
        if (dataStart <= dataEnd) {
          if (chunk.downloadUrl) {
            const rangeStart = dataStart;
            const rangeEnd = dataEnd;
            const chunkResponse = await fetch2(chunk.downloadUrl, {
              headers: {
                "Range": `bytes=${rangeStart}-${rangeEnd}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
              },
              timeout: 3e4,
              // 30 second timeout
              signal: AbortSignal.timeout(3e4)
            });
            if (chunkResponse.ok && chunkResponse.body) {
              const reader = chunkResponse.body.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(value);
                  if (res.destroyed) {
                    await reader.cancel();
                    return;
                  }
                }
              } finally {
                reader.releaseLock();
              }
            }
          } else {
            let streamed = false;
            try {
              const tempLink = await dropboxManager.getTemporaryLink(chunk.dropboxAccountId, chunk.dropboxPath);
              const rangeStart = dataStart;
              const rangeEnd = dataEnd;
              const chunkResponse = await fetch2(tempLink, {
                headers: { "Range": `bytes=${rangeStart}-${rangeEnd}` }
              });
              if (chunkResponse.ok && chunkResponse.body) {
                const reader = chunkResponse.body.getReader();
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(value);
                    if (res.destroyed) {
                      await reader.cancel();
                      return;
                    }
                  }
                  streamed = true;
                } finally {
                  reader.releaseLock();
                }
              }
            } catch (err) {
              console.warn(`Failed to get temp link for chunk ${chunk.chunkIndex}, falling back to full download:`, err);
            }
            if (!streamed) {
              if (res.destroyed) {
                console.log(`[Stream] Client disconnected, skipping download for chunk ${chunk.chunkIndex}`);
                return;
              }
              const chunkData = await dropboxManager.downloadChunk(chunk.dropboxAccountId, chunk.dropboxPath);
              if (res.destroyed) {
                console.log(`[Stream] Client disconnected after download for chunk ${chunk.chunkIndex}`);
                return;
              }
              const slicedData = chunkData.slice(dataStart, dataEnd + 1);
              for (let i = 0; i < slicedData.length; i += STREAM_CHUNK_SIZE) {
                const piece = slicedData.slice(i, i + STREAM_CHUNK_SIZE);
                res.write(piece);
                if (res.destroyed) {
                  return;
                }
                await new Promise((resolve) => setImmediate(resolve));
              }
            }
          }
        }
      } catch (error) {
        console.error(`Failed to stream chunk ${chunk.chunkIndex}:`, error);
        if (!res.destroyed) {
          res.status(500).end("Streaming error");
        }
        return;
      }
      currentPosition += chunk.size;
    }
    if (!res.destroyed) {
      res.end();
    }
  }
  async function streamSpecificChunks(chunks, res) {
    const STREAM_CHUNK_SIZE = 64 * 1024;
    console.log(`[StreamChunks] Starting to stream ${chunks.length} specific chunks`);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[StreamChunks] Processing chunk ${i + 1}/${chunks.length}: index=${chunk.chunkIndex}, size=${Math.round(chunk.size / 1024)}KB`);
      try {
        if (chunk.downloadUrl) {
          const chunkResponse = await fetch2(chunk.downloadUrl);
          if (chunkResponse.ok && chunkResponse.body) {
            const reader = chunkResponse.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
                if (res.destroyed) {
                  await reader.cancel();
                  return;
                }
              }
            } finally {
              reader.releaseLock();
            }
          }
        } else {
          let streamed = false;
          try {
            const tempLink = await dropboxManager.getTemporaryLink(chunk.dropboxAccountId, chunk.dropboxPath);
            const chunkResponse = await fetch2(tempLink);
            if (chunkResponse.ok && chunkResponse.body) {
              const reader = chunkResponse.body.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(value);
                  if (res.destroyed) {
                    await reader.cancel();
                    return;
                  }
                }
                streamed = true;
              } finally {
                reader.releaseLock();
              }
            }
          } catch (err) {
            console.warn(`Failed to get temp link for chunk ${chunk.chunkIndex}, falling back:`, err);
          }
          if (!streamed) {
            if (res.destroyed) {
              console.log(`[StreamChunks] Client disconnected, skipping download for chunk ${chunk.chunkIndex}`);
              return;
            }
            const chunkData = await dropboxManager.downloadChunk(chunk.dropboxAccountId, chunk.dropboxPath);
            if (res.destroyed) {
              console.log(`[StreamChunks] Client disconnected after download for chunk ${chunk.chunkIndex}`);
              return;
            }
            for (let i2 = 0; i2 < chunkData.length; i2 += STREAM_CHUNK_SIZE) {
              const piece = chunkData.slice(i2, i2 + STREAM_CHUNK_SIZE);
              res.write(piece);
              if (res.destroyed) {
                return;
              }
              await new Promise((resolve) => setImmediate(resolve));
            }
          }
        }
      } catch (error) {
        console.error(`Failed to stream chunk ${chunk.chunkIndex}:`, error);
        if (!res.destroyed) {
          res.status(500).end("Streaming error");
        }
        return;
      }
    }
    if (!res.destroyed) {
      console.log(`[StreamChunks] Successfully streamed all ${chunks.length} chunks`);
      res.end();
    } else {
      console.log(`[StreamChunks] Response destroyed, stopping chunk streaming`);
    }
  }
  app2.get("/api/files/:id/download", optionalAuth, async (req, res, next) => {
    try {
      const file = await storage.getFileById(req.params.id);
      if (!file) {
        return res.status(404).send("File not found");
      }
      const isExtractedFile = req.params.id.startsWith("extracted_");
      const forum = await storage.getForumById(file.forumId);
      if (!forum && !isExtractedFile) {
        return res.status(404).send("Forum not found");
      }
      if (!forum?.isPublic && !isExtractedFile) {
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      } else if (isExtractedFile) {
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
      }
      if (isExtractedFile) {
        try {
          let hostHeader = req.get("host") || "localhost:5000";
          hostHeader = hostHeader.replace("[::1]", "127.0.0.1").replace("::1", "127.0.0.1");
          const resolveUrl = `${req.protocol}://${hostHeader}/api/extracted/${encodeURIComponent(req.params.id)}/resolve`;
          console.log(`[Download] Resolving extracted file via ${resolveUrl}`);
          const r = await fetch2(resolveUrl, { headers: { "User-Agent": "Node.js" } });
          if (!r.ok) {
            console.warn("[Download] Failed to resolve extracted file", await r.text());
            return res.status(502).send("Failed to resolve extracted file");
          }
          const body = await r.json();
          const chosenProxy = body.localProxyUrl ? `${req.protocol}://${hostHeader}${body.localProxyUrl}` : body.proxiedUrl || body.resolvedUrl;
          if (!chosenProxy) return res.status(404).send("Could not resolve mp4 for this extracted file");
          console.log(`[Download] Streaming resolved URL for ${file.fileName}: ${chosenProxy}`);
          const upstreamHeaders = { "User-Agent": "Node.js" };
          if (req.headers.range) upstreamHeaders["Range"] = req.headers.range;
          const upstreamResp = await fetch2(chosenProxy, { headers: upstreamHeaders });
          if (!upstreamResp.ok && upstreamResp.status !== 206) {
            console.warn("[Download] Upstream fetch failed:", upstreamResp.status);
            return res.status(502).send("Failed to fetch resolved file");
          }
          const contentType = upstreamResp.headers.get("content-type") || file.mimeType || "application/octet-stream";
          const contentLength = upstreamResp.headers.get("content-length");
          const contentRange = upstreamResp.headers.get("content-range");
          res.setHeader("Content-Type", contentType);
          res.setHeader("Accept-Ranges", "bytes");
          if (contentLength) res.setHeader("Content-Length", contentLength);
          if (contentRange) {
            res.status(206);
            res.setHeader("Content-Range", contentRange);
          } else {
            res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
          }
          upstreamResp.body?.pipe(res);
          return;
        } catch (err) {
          console.error("[Download] Error resolving extracted file:", err);
          return res.status(500).send("Error resolving extracted file");
        }
      }
      if (file.isAdminCreated && file.directDownloadUrl) {
        if (file.mimeType === "application/x-mpegurl" || file.directDownloadUrl.toLowerCase().endsWith(".m3u8")) {
          console.log(`[Download] Detected M3U8 file, transcoding to MP4 for download: ${file.fileName}`);
          try {
            await transcodeM3U8ToMP4(file.directDownloadUrl, res, file.id, req.user?.id, clients);
            return;
          } catch (error) {
            console.error("Failed to transcode M3U8 file:", error);
            return res.status(500).send("Failed to transcode M3U8 file");
          }
        }
        try {
          const response = await fetch2(file.directDownloadUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
          }
          res.setHeader("Content-Type", response.headers.get("content-type") || file.mimeType || "application/octet-stream");
          res.setHeader("Content-Length", response.headers.get("content-length") || file.fileSize);
          res.setHeader("Accept-Ranges", "bytes");
          res.setHeader("Cache-Control", "public, max-age=31536000");
          const range = req.headers.range;
          if (range && response.headers.get("accept-ranges") === "bytes") {
            const contentLength = parseInt(response.headers.get("content-length") || "0");
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;
            const chunksize = end - start + 1;
            res.status(206);
            res.setHeader("Content-Range", `bytes ${start}-${end}/${contentLength}`);
            res.setHeader("Content-Length", chunksize);
          }
          response.body?.pipe(res);
          return;
        } catch (error) {
          console.error("Failed to proxy external URL:", error);
          if (error.message?.includes("410")) {
            return res.status(410).send("This file is no longer available (content has been removed)");
          } else if (error.message?.includes("404")) {
            return res.status(404).send("File not found on external server");
          } else if (error.message?.includes("403")) {
            return res.status(403).send("Access denied to external file");
          } else if (error.message?.includes("429")) {
            return res.status(429).send("Too many requests to external server, please try again later");
          } else {
            return res.status(500).send("Failed to fetch external file");
          }
        }
      }
      res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
      res.setHeader("Content-Length", file.fileSize);
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Transfer-Encoding", "chunked");
      const chunks = file.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const SUB_CHUNK_SIZE = 64 * 1024;
      let totalBytesSent = 0;
      for (const chunk of chunks) {
        try {
          let chunkData;
          if (chunk.downloadUrl) {
            console.log(`\u{1F4E5} Downloading chunk ${chunk.chunkIndex} from permanent URL`);
            const response = await fetch2(chunk.downloadUrl);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            chunkData = Buffer.from(arrayBuffer);
          } else if (chunk.dropboxPath) {
            console.log(`\u{1F4E5} Downloading chunk ${chunk.chunkIndex} from Dropbox path (fallback)`);
            chunkData = await dropboxManager.downloadChunk(
              chunk.dropboxAccountId,
              chunk.dropboxPath
            );
          } else {
            throw new Error(`No download URL or Dropbox path available for chunk ${chunk.chunkIndex}`);
          }
          for (let offset = 0; offset < chunkData.length; offset += SUB_CHUNK_SIZE) {
            const end = Math.min(offset + SUB_CHUNK_SIZE, chunkData.length);
            const subChunk = chunkData.slice(offset, end);
            res.write(subChunk);
            totalBytesSent += subChunk.length;
            await new Promise((resolve) => setTimeout(resolve, 1));
          }
        } catch (chunkError) {
          console.error(`Failed to download chunk ${chunk.chunkIndex}:`, chunkError);
          if (totalBytesSent === 0) {
            return res.status(500).send("Failed to download file chunk");
          }
          break;
        }
      }
      res.end();
    } catch (error) {
      console.error("File download error:", error);
      if (!res.headersSent) {
        next(error);
      }
    }
  });
  async function streamFileRange(file, start, end, res) {
    const chunks = file.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    let currentOffset = 0;
    let bytesSent = 0;
    const totalBytes = end - start + 1;
    for (const chunk of chunks) {
      const chunkStart = currentOffset;
      const chunkEnd = currentOffset + chunk.chunkSize - 1;
      currentOffset += chunk.chunkSize;
      if (chunkEnd < start || chunkStart > end) {
        continue;
      }
      try {
        let chunkData;
        if (chunk.downloadUrl) {
          const response = await fetch2(chunk.downloadUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          chunkData = Buffer.from(arrayBuffer);
        } else if (chunk.dropboxPath) {
          chunkData = await dropboxManager.downloadChunk(
            chunk.dropboxAccountId,
            chunk.dropboxPath
          );
        } else {
          throw new Error(`No download URL or Dropbox path available for chunk ${chunk.chunkIndex}`);
        }
        const chunkOffset = Math.max(0, start - chunkStart);
        const chunkSendEnd = Math.min(chunkData.length, end - chunkStart + 1);
        const dataToSend = chunkData.slice(chunkOffset, chunkSendEnd);
        if (dataToSend.length > 0) {
          res.write(dataToSend);
          bytesSent += dataToSend.length;
          if (bytesSent >= totalBytes) {
            break;
          }
        }
      } catch (chunkError) {
        console.error(`Failed to stream chunk ${chunk.chunkIndex}:`, chunkError);
        break;
      }
    }
    res.end();
  }
  app2.delete("/api/files/:id", requireAuth, async (req, res, next) => {
    try {
      const file = await storage.getFileById(req.params.id);
      if (!file) {
        return res.status(404).send("File not found");
      }
      if (file.userId !== req.user.id) {
        return res.status(403).send("Access denied");
      }
      for (const chunk of file.chunks) {
        try {
          if (chunk.dropboxPath) {
            await dropboxManager.deleteChunk(chunk.dropboxAccountId, chunk.dropboxPath);
            dropboxManager.updateAccountUsage(chunk.dropboxAccountId, -chunk.chunkSize);
          }
        } catch (error) {
          console.error("Failed to delete chunk:", error);
        }
      }
      await storage.deleteFile(file.id);
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "file_deleted",
            forumId: file.forumId,
            fileId: file.id
          }));
        }
      });
      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/partial-uploads", requireAuth, async (req, res, next) => {
    try {
      const partialUploads2 = await storage.getPartialUploadsByUser(req.user.id);
      res.json(partialUploads2);
    } catch (error) {
      next(error);
    }
  });
  app2.delete("/api/partial-uploads/:id", requireAuth, async (req, res, next) => {
    try {
      const partialUpload = await storage.getPartialUploadById(req.params.id);
      if (!partialUpload) {
        return res.status(404).send("Partial upload not found");
      }
      if (partialUpload.userId !== req.user.id) {
        return res.status(403).send("Access denied");
      }
      for (const chunkIndex of partialUpload.uploadedChunks) {
        try {
          const files3 = await storage.getFiles(partialUpload.forumId);
          const file2 = files3.find((f) => f.fileName === partialUpload.fileName && f.fileSize === partialUpload.fileSize);
          if (file2) {
            const chunk = file2.chunks.find((c) => c.chunkIndex === chunkIndex);
            if (chunk && chunk.dropboxPath) {
              await dropboxManager.deleteChunk(chunk.dropboxAccountId, chunk.dropboxPath);
              dropboxManager.updateAccountUsage(chunk.dropboxAccountId, -chunk.chunkSize);
            }
          }
        } catch (error) {
          console.error(`Failed to delete chunk ${chunkIndex} during partial upload cleanup:`, error);
        }
      }
      const files2 = await storage.getFiles(partialUpload.forumId);
      const file = files2.find((f) => f.fileName === partialUpload.fileName && f.fileSize === partialUpload.fileSize);
      if (file) {
        await storage.deleteFile(file.id);
        clients.forEach((c) => {
          if (c.ws.readyState === WebSocket2.OPEN) {
            c.ws.send(JSON.stringify({
              type: "file_deleted",
              forumId: partialUpload.forumId,
              fileId: file.id
            }));
          }
        });
      }
      await storage.deletePartialUpload(partialUpload.id);
      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/forums/:id/access-requests", requireAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (forum.creatorId !== req.user.id) {
        return res.status(403).send("Access denied");
      }
      const requests = await storage.getAccessRequests(req.params.id);
      res.json(requests);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/forums/:id/access-status", requireAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (forum.isPublic) {
        return res.json({ hasAccess: true });
      }
      const isMember = await storage.isForumMember(forum.id, req.user.id);
      if (isMember) {
        return res.json({ hasAccess: true });
      }
      const existingRequest = await storage.getAccessRequestByUser(forum.id, req.user.id);
      if (existingRequest) {
        return res.json({
          hasAccess: false,
          requestStatus: existingRequest.status,
          requestId: existingRequest.id
        });
      }
      res.json({ hasAccess: false });
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/access-requests", async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        console.log("\u{1F510} Authentication required but user not authenticated");
        return res.status(401).json({
          error: "Authentication required",
          message: "You must be logged in to request access to private forums.",
          redirect: "/auth"
        });
      }
      const validationResult = insertAccessRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        const error = fromZodError(validationResult.error);
        return res.status(400).send(error.message);
      }
      const { forumId } = validationResult.data;
      const existingRequest = await storage.getAccessRequestByUser(forumId, req.user.id);
      if (existingRequest) {
        if (existingRequest.status === "pending") {
          return res.status(400).send("You already have a pending access request for this forum");
        } else if (existingRequest.status === "rejected") {
          return res.status(400).send("Your access request was rejected. You cannot request access again");
        } else if (existingRequest.status === "approved") {
          return res.status(400).send("You already have access to this forum");
        }
      }
      const request = await storage.createAccessRequest(validationResult.data, req.user.id);
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "access_request_created",
            forumId,
            request
          }));
        }
      });
      res.status(201).json(request);
    } catch (error) {
      next(error);
    }
  });
  app2.patch("/api/access-requests/:id", requireAuth, async (req, res, next) => {
    try {
      const { status } = req.body;
      const request = await storage.updateAccessRequest(req.params.id, status);
      if (!request) {
        return res.status(404).send("Access request not found");
      }
      if (status === "approved") {
        await storage.addForumMember(request.forumId, request.userId);
        clients.forEach((c) => {
          if (c.ws.readyState === WebSocket2.OPEN) {
            c.ws.send(JSON.stringify({
              type: "member_added",
              forumId: request.forumId,
              userId: request.userId,
              requestId: request.id
            }));
          }
        });
      }
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "access_request_update",
            forumId: request.forumId,
            userId: request.userId,
            requestId: request.id,
            status: request.status
          }));
        }
      });
      res.json(request);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/user/pending-requests", requireAuth, async (req, res, next) => {
    try {
      const count = await storage.getPendingAccessRequestsCount(req.user.id);
      res.json({ count });
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/user/reset-cache", requireAuth, async (req, res, next) => {
    try {
      console.log(`\u{1F9F9} Cache reset requested for user: ${req.user.username} (${req.user.id})`);
      await storage.resetAllUserData(req.user.id);
      console.log(`\u2705 Cache reset completed for user: ${req.user.id}`);
      res.json({
        success: true,
        message: "All user cache and storage reset successfully"
      });
    } catch (error) {
      console.error(`\u274C Cache reset failed for user ${req.user.id}:`, error);
      next(error);
    }
  });
  app2.get("/api/admin/db-stats", requireAuth, async (req, res, next) => {
    try {
      const stats = await dbManager.getShardStatistics();
      const formattedStats = stats.map((stat) => ({
        ...stat,
        currentSizeFormatted: dbManager.formatBytes(stat.currentSize),
        maxSizeFormatted: dbManager.formatBytes(stat.maxSize),
        availableSpaceFormatted: dbManager.formatBytes(stat.availableSpace)
      }));
      res.json({
        totalShards: stats.length,
        totalStorage: stats.reduce((sum, stat) => sum + stat.currentSize, 0),
        totalCapacity: stats.reduce((sum, stat) => sum + stat.maxSize, 0),
        shards: formattedStats
      });
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/admin/rebalance-shards", requireAuth, async (req, res, next) => {
    try {
      const result = await dbManager.rebalanceShards();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/admin/optimize-shards", requireAuth, async (req, res, next) => {
    try {
      await dbManager.optimizeShardSelection();
      res.json({
        success: true,
        message: "Shard optimization completed. Check server logs for details."
      });
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/admin/dropbox-stats", requireAuth, async (req, res, next) => {
    try {
      const accountStatuses = await dropboxManager.getAccountStatusWithReservations();
      const activeReservations = await dropboxManager.getAllActiveReservations();
      res.json({
        success: true,
        accounts: accountStatuses,
        activeReservations: activeReservations.length,
        totalReservedBytes: activeReservations.reduce((sum, r) => sum + r.bytes, 0)
      });
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/admin/reservations", requireAuth, async (req, res, next) => {
    try {
      const activeReservations = await dropboxManager.getAllActiveReservations();
      res.json({
        success: true,
        reservations: activeReservations
      });
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/comments/:entityType/:entityId", requireAuth, async (req, res, next) => {
    try {
      const { entityType, entityId } = req.params;
      if (!["message", "file", "comment"].includes(entityType)) {
        return res.status(400).send("Invalid entity type");
      }
      let forumId;
      if (entityType === "message") {
        const message = await storage.getMessageById(entityId);
        if (!message) {
          return res.status(404).send("Message not found");
        }
        forumId = message.forumId;
      } else if (entityType === "file") {
        const file = await storage.getFileById(entityId);
        if (!file) {
          return res.status(404).send("File not found");
        }
        forumId = file.forumId;
      } else {
        const comment = await storage.getCommentById(entityId);
        if (!comment) {
          return res.status(404).send("Comment not found");
        }
        let rootComment = comment;
        while (rootComment.parentId) {
          const parent = await storage.getCommentById(rootComment.parentId);
          if (!parent) break;
          rootComment = parent;
        }
        if (rootComment.entityType === "message") {
          const message = await storage.getMessageById(rootComment.entityId);
          if (!message) {
            return res.status(404).send("Message not found");
          }
          forumId = message.forumId;
        } else if (rootComment.entityType === "file") {
          const file = await storage.getFileById(rootComment.entityId);
          if (!file) {
            return res.status(404).send("File not found");
          }
          forumId = file.forumId;
        } else {
          return res.status(400).send("Invalid root entity type");
        }
      }
      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (!forum.isPublic) {
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }
      const comments2 = await storage.getComments(entityType, entityId);
      res.json(comments2);
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/comments", requireAuth, async (req, res, next) => {
    if (!req.user || !req.user.id) {
      if (req.session) req.session.destroy(() => {
      });
      return res.status(401).json({ error: "Not authenticated", message: "You must be logged in to comment." });
    }
    const dbUser = await storage.getUser(req.user.id);
    if (!dbUser) {
      if (req.session) req.session.destroy(() => {
      });
      return res.status(401).json({ error: "User not found", message: "Your user account was not found. Please log in again." });
    }
    try {
      const validationResult = insertCommentSchema.safeParse(req.body);
      if (!validationResult.success) {
        const error = fromZodError(validationResult.error);
        return res.status(400).send(error.message);
      }
      const { entityType, entityId, parentId, content } = validationResult.data;
      if (!["message", "file", "comment"].includes(entityType)) {
        return res.status(400).send("Invalid entity type");
      }
      let forumId;
      if (entityType === "message") {
        const message = await storage.getMessageById(entityId);
        if (!message) {
          return res.status(404).send("Message not found");
        }
        forumId = message.forumId;
      } else if (entityType === "file") {
        const file = await storage.getFileById(entityId);
        if (!file) {
          return res.status(404).send("File not found");
        }
        forumId = file.forumId;
      } else {
        const parentComment = await storage.getCommentById(entityId);
        if (!parentComment) {
          return res.status(404).send("Parent comment not found");
        }
        let rootComment = parentComment;
        while (rootComment.parentId) {
          const parent = await storage.getCommentById(rootComment.parentId);
          if (!parent) break;
          rootComment = parent;
        }
        if (rootComment.entityType === "message") {
          const message = await storage.getMessageById(rootComment.entityId);
          if (!message) {
            return res.status(404).send("Message not found");
          }
          forumId = message.forumId;
        } else if (rootComment.entityType === "file") {
          const file = await storage.getFileById(rootComment.entityId);
          if (!file) {
            return res.status(404).send("File not found");
          }
          forumId = file.forumId;
        } else {
          return res.status(400).send("Invalid root entity type");
        }
      }
      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (!forum.isPublic) {
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }
      const comment = await storage.createComment({
        entityType,
        entityId,
        parentId,
        content
      }, req.user.id);
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "comment_created",
            forumId,
            comment
          }));
        }
      });
      res.status(201).json(comment);
    } catch (error) {
      next(error);
    }
  });
  app2.put("/api/comments/:id", requireAuth, async (req, res, next) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).send("Comment content is required");
      }
      const comment = await storage.updateComment(req.params.id, content.trim(), req.user.id);
      if (!comment) {
        return res.status(404).send("Comment not found or access denied");
      }
      let forumId;
      let rootComment = comment;
      while (rootComment.parentId) {
        const parent = await storage.getCommentById(rootComment.parentId);
        if (!parent) break;
        rootComment = parent;
      }
      if (rootComment.entityType === "message") {
        const message = await storage.getMessageById(rootComment.entityId);
        if (message) forumId = message.forumId;
      } else if (rootComment.entityType === "file") {
        const file = await storage.getFileById(rootComment.entityId);
        if (file) forumId = file.forumId;
      }
      if (forumId) {
        clients.forEach((c) => {
          if (c.ws.readyState === WebSocket2.OPEN) {
            c.ws.send(JSON.stringify({
              type: "comment_updated",
              forumId,
              comment
            }));
          }
        });
      }
      res.json(comment);
    } catch (error) {
      next(error);
    }
  });
  app2.delete("/api/comments/:id", requireAuth, async (req, res, next) => {
    try {
      const comment = await storage.getCommentById(req.params.id);
      if (!comment) {
        return res.status(404).send("Comment not found");
      }
      if (comment.userId !== req.user.id) {
        return res.status(403).send("Access denied");
      }
      await storage.deleteComment(req.params.id);
      let forumId;
      let rootComment = comment;
      while (rootComment.parentId) {
        const parent = await storage.getCommentById(rootComment.parentId);
        if (!parent) break;
        rootComment = parent;
      }
      if (rootComment.entityType === "message") {
        const message = await storage.getMessageById(rootComment.entityId);
        if (message) forumId = message.forumId;
      } else if (rootComment.entityType === "file") {
        const file = await storage.getFileById(rootComment.entityId);
        if (file) forumId = file.forumId;
      }
      if (forumId) {
        clients.forEach((c) => {
          if (c.ws.readyState === WebSocket2.OPEN) {
            c.ws.send(JSON.stringify({
              type: "comment_deleted",
              forumId,
              commentId: req.params.id,
              entityType: comment.entityType,
              entityId: comment.entityId
            }));
          }
        });
      }
      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/tags", optionalAuth, async (req, res, next) => {
    try {
      const forumId = typeof req.query.forumId === "string" && req.query.forumId.trim().length > 0 ? req.query.forumId.trim() : void 0;
      const tags2 = await storage.getTags(false, forumId);
      res.json(tags2);
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/tags", requireAuth, async (req, res, next) => {
    try {
      const { name, description, color, forumId } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).send("Tag name is required");
      }
      if (!forumId || typeof forumId !== "string" || forumId.trim().length === 0) {
        return res.status(400).send("forumId is required");
      }
      const forum = await storage.getForumById(forumId.trim());
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (forum.creatorId !== req.user.id) {
        return res.status(403).send("Only forum creator can create tags");
      }
      const tag = await storage.createTag({
        name: name.trim(),
        description: description?.trim(),
        color: color || "#6b7280",
        forumId: forum.id,
        createdBy: req.user.id
      });
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "tag_created",
            tag
          }));
        }
      });
      res.status(201).json(tag);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/tags/:id", requireAuth, async (req, res, next) => {
    try {
      const tag = await storage.getTagById(req.params.id);
      if (!tag) {
        return res.status(404).send("Tag not found");
      }
      res.json(tag);
    } catch (error) {
      next(error);
    }
  });
  app2.put("/api/tags/:id", requireAuth, async (req, res, next) => {
    try {
      const { name, description, color } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).send("Tag name is required");
      }
      const existingTag = await storage.getTagById(req.params.id);
      if (!existingTag) {
        return res.status(404).send("Tag not found");
      }
      const admin = await isAdminUser(req.user);
      if (!admin) {
        if (!existingTag.forumId) {
          return res.status(403).send("Only admin can update legacy tags without forum ownership");
        }
        const forum = await storage.getForumById(existingTag.forumId);
        if (!forum) {
          return res.status(404).send("Forum not found");
        }
        if (forum.creatorId !== req.user.id) {
          return res.status(403).send("Only forum creator can update tags");
        }
      }
      const tag = await storage.updateTag(req.params.id, {
        name: name.trim(),
        description: description?.trim(),
        color: color || "#6b7280"
      });
      if (!tag) {
        return res.status(404).send("Tag not found");
      }
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "tag_updated",
            tag
          }));
        }
      });
      res.json(tag);
    } catch (error) {
      next(error);
    }
  });
  app2.delete("/api/tags/:id", requireAuth, async (req, res, next) => {
    try {
      const tag = await storage.getTagById(req.params.id);
      if (!tag) {
        return res.status(404).send("Tag not found");
      }
      const admin = await isAdminUser(req.user);
      if (!admin) {
        if (!tag.forumId) {
          return res.status(403).send("Only admin can delete legacy tags without forum ownership");
        }
        const forum = await storage.getForumById(tag.forumId);
        if (!forum) {
          return res.status(404).send("Forum not found");
        }
        if (forum.creatorId !== req.user.id) {
          return res.status(403).send("Only forum creator can delete tags");
        }
      }
      await storage.deleteTag(req.params.id);
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "tag_deleted",
            tagId: req.params.id
          }));
        }
      });
      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/tags/entity/:entityType/:entityId", optionalAuth, async (req, res, next) => {
    try {
      const { entityType, entityId } = req.params;
      if (!["file", "message", "forum"].includes(entityType)) {
        return res.status(400).send("Invalid entity type");
      }
      let forumId;
      if (entityType === "message") {
        const message = await storage.getMessageById(entityId);
        if (!message) {
          return res.status(404).send("Message not found");
        }
        forumId = message.forumId;
      } else if (entityType === "file") {
        const file = await storage.getFileById(entityId);
        if (!file) {
          return res.status(404).send("File not found");
        }
        forumId = file.forumId;
      } else if (entityType === "forum") {
        forumId = entityId;
      }
      if (!forumId) {
        return res.status(400).send("Could not determine forum ID");
      }
      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (!forum.isPublic) {
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }
      const tags2 = await storage.getEntityTags(entityType, entityId);
      res.json(tags2);
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/tags/assign", requireAuth, async (req, res, next) => {
    try {
      const { entityType, entityId, tagIds } = req.body;
      if (!["file", "message", "forum"].includes(entityType)) {
        return res.status(400).send("Invalid entity type");
      }
      if (!Array.isArray(tagIds) || tagIds.length === 0) {
        return res.status(400).send("Tag IDs array is required");
      }
      let forumId;
      if (entityType === "message") {
        const message = await storage.getMessageById(entityId);
        if (!message) {
          return res.status(404).send("Message not found");
        }
        forumId = message.forumId;
      } else if (entityType === "file") {
        const file = await storage.getFileById(entityId);
        if (!file) {
          return res.status(404).send("File not found");
        }
        forumId = file.forumId;
      } else if (entityType === "forum") {
        forumId = entityId;
      }
      if (!forumId) {
        return res.status(400).send("Could not determine forum ID");
      }
      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (forum.creatorId !== req.user.id) {
        return res.status(403).send("Only forum creator can assign tags");
      }
      for (const tagId of tagIds) {
        const tag = await storage.getTagById(tagId);
        if (!tag) {
          return res.status(404).send(`Tag not found: ${tagId}`);
        }
        if (tag.forumId && tag.forumId !== forumId) {
          return res.status(403).send("Cannot assign tags created for another forum");
        }
      }
      const assignments = await storage.assignTagsToEntity(entityType, entityId, tagIds);
      if (entityType === "forum") {
        await storage.updateForumSEOMetadata(entityId);
      } else if (entityType === "file") {
        await storage.updateFileSEOMetadata(entityId);
      }
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "tags_assigned",
            forumId,
            entityType,
            entityId,
            tagIds
          }));
        }
      });
      res.status(201).json(assignments);
    } catch (error) {
      next(error);
    }
  });
  app2.delete("/api/tags/assign/:entityType/:entityId/:tagId", requireAuth, async (req, res, next) => {
    try {
      const { entityType, entityId, tagId } = req.params;
      if (!["file", "message", "forum"].includes(entityType)) {
        return res.status(400).send("Invalid entity type");
      }
      let forumId;
      if (entityType === "message") {
        const message = await storage.getMessageById(entityId);
        if (!message) {
          return res.status(404).send("Message not found");
        }
        forumId = message.forumId;
      } else if (entityType === "file") {
        const file = await storage.getFileById(entityId);
        if (!file) {
          return res.status(404).send("File not found");
        }
        forumId = file.forumId;
      } else if (entityType === "forum") {
        forumId = entityId;
      }
      if (!forumId) {
        return res.status(400).send("Could not determine forum ID");
      }
      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }
      if (forum.creatorId !== req.user.id) {
        return res.status(403).send("Only forum creator can unassign tags");
      }
      const tag = await storage.getTagById(tagId);
      if (!tag) {
        return res.status(404).send("Tag not found");
      }
      if (tag.forumId && tag.forumId !== forumId) {
        return res.status(403).send("Cannot unassign tags created for another forum");
      }
      await storage.removeTagFromEntity(entityType, entityId, tagId);
      if (entityType === "forum") {
        await storage.updateForumSEOMetadata(entityId);
      } else if (entityType === "file") {
        await storage.updateFileSEOMetadata(entityId);
      }
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket2.OPEN) {
          c.ws.send(JSON.stringify({
            type: "tag_removed",
            forumId,
            entityType,
            entityId,
            tagId
          }));
        }
      });
      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/search", optionalAuth, async (req, res, next) => {
    try {
      const query = req.query.q;
      if (!query || typeof query !== "string") {
        return res.status(400).send("Query is required");
      }
      console.log(`[API] Search request: query="${query}", user=${req.user?.username || "anonymous"}`);
      console.log(`[API] Starting search across local databases...`);
      const startTime = Date.now();
      const forumId = req.query.forumId;
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || "20"), 10)));
      const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10));
      const localResults = await storage.searchEntities(query, req.user?.id, forumId);
      const sortedFiles = localResults.files.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      const totalFiles = sortedFiles.length;
      const paginatedFiles = sortedFiles.slice(offset, offset + limit);
      const duration = Date.now() - startTime;
      console.log(`[API] Search completed: query="${query}", totalFiles:${totalFiles}, returned:${paginatedFiles.length}, duration=${duration}ms`);
      res.json({ forums: localResults.forums, messages: localResults.messages, files: paginatedFiles, totalFiles });
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/neon/replicate", requireAuth, async (req, res, next) => {
    try {
      const targetConn = req.body && req.body.targetConn || void 0;
      const neonManagerImport = await Promise.resolve().then(() => (init_neon_manager(), neon_manager_exports));
      const neonManager = neonManagerImport.default;
      const urls = await neonManager.getNeonDbUrls();
      if (!urls || urls.length < 2) return res.status(400).json({ ok: false, message: "No available Neon DBs to replicate to" });
      const primary = urls[0];
      if (targetConn) {
        const result = await neonManager.default.replicateExtractedVideoMappings(primary, targetConn);
        return res.json({ ok: true, inserted: result.inserted, skipped: result.skipped });
      }
      const target = urls.find((u) => u !== primary);
      if (!target) return res.status(400).json({ ok: false, message: "No target Neon DB found" });
      (async () => {
        try {
          const result = await neonManager.default.replicateExtractedVideoMappings(primary, target);
          console.log("[Neon] Background replication finished:", result);
        } catch (err) {
          console.warn("[Neon] Background replication failed", err);
        }
      })();
      return res.status(202).json({ ok: true, message: "Replication started", target });
    } catch (err) {
      next(err);
    }
  });
  app2.post("/api/neon/import-backup", requireAuth, async (req, res, next) => {
    try {
      const { targetConn, filePath } = req.body || {};
      const neonManager = await Promise.resolve().then(() => (init_neon_manager(), neon_manager_exports));
      const urls = await neonManager.default.getNeonDbUrls();
      if (!urls || urls.length === 0) return res.status(400).json({ ok: false, message: "No Neon DBs available" });
      let target = targetConn;
      if (!target) {
        let minSize = Number.MAX_SAFE_INTEGER;
        let chosen = urls[0];
        for (const u of urls) {
          const size = await neonManager.getDbSizeBytes(u);
          if (size === null) continue;
          if (size === 0) {
            chosen = u;
            break;
          }
          if (size < minSize) {
            minSize = size;
            chosen = u;
          }
        }
        target = chosen;
      }
      const candidatePath = filePath || path4.resolve(process.cwd(), "video_mappings.json");
      if (!fs3.existsSync(candidatePath)) return res.status(404).json({ ok: false, message: "Backup file not found" });
      (async () => {
        try {
          const result = await neonManager.importVideoMappingsFromJson(target, candidatePath);
          console.log("[NeonImport] Import completed", result);
          try {
            await neonManager.setMainExtractedDb(target);
          } catch (e) {
            console.warn("Failed to set main extracted DB", e);
          }
        } catch (err) {
          console.warn("[NeonImport] Import failed", err?.message || err);
        }
      })();
      return res.status(202).json({ ok: true, message: "Import started", target });
    } catch (err) {
      next(err);
    }
  });
  app2.get("/api/neon/list", requireAuth, async (req, res, next) => {
    try {
      const neonManagerImport = await Promise.resolve().then(() => (init_neon_manager(), neon_manager_exports));
      const neonManager = neonManagerImport.default;
      const urls = await neonManager.getNeonDbUrls();
      const list = [];
      for (const u of urls) {
        const size = await neonManager.getDbSizeBytes(u);
        list.push({ url: u, size });
      }
      return res.json({ ok: true, list });
    } catch (err) {
      next(err);
    }
  });
  app2.get("/api/search/stream", optionalAuth, async (req, res, next) => {
    try {
      const query = String(req.query.q || "");
      if (!query) return res.status(400).send("Query required");
      const forumId = req.query.forumId;
      const userId = req.user?.id;
      if (forumId) {
        const forum = await storage.getForumById(forumId);
        if (!forum) return res.status(404).send("Forum not found");
        if (!forum.isPublic) {
          if (!req.isAuthenticated?.() || !req.user) return res.sendStatus(401);
          const isMember = await storage.isForumMember(forumId, req.user.id);
          if (!isMember) return res.status(403).send("Access denied");
        }
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      const instances = dbManager.getAllInstances();
      const shardBatchSize = 5;
      const lower = `%${query.toLowerCase()}%`;
      let localStreamedCount = 0;
      for (const instance of instances) {
        let offset = 0;
        let more = true;
        while (more) {
          try {
            const fileQueryBatch = instance.db.select({ file: files, user: users, forum: forums }).from(files).innerJoin(users, eq3(files.userId, users.id)).innerJoin(forums, eq3(files.forumId, forums.id)).leftJoin(forumMembers, and2(eq3(forumMembers.forumId, forums.id), userId ? eq3(forumMembers.userId, userId) : sql3`1=0`)).where(and2(
              or2(eq3(forums.isPublic, true), userId ? eq3(forums.creatorId, userId) : sql3`1=0`, userId ? isNotNull2(forumMembers.id) : sql3`1=0`),
              or2(
                ilike2(files.fileName, lower),
                and2(isNotNull2(files.metaTitle), ilike2(files.metaTitle, lower)),
                and2(isNotNull2(files.metaDescription), ilike2(files.metaDescription, lower)),
                and2(isNotNull2(files.keywords), ilike2(files.keywords, lower)),
                and2(isNotNull2(files.adminNotes), ilike2(files.adminNotes, lower)),
                exists2(instance.db.select().from(fileTags).innerJoin(tags, eq3(fileTags.tagId, tags.id)).where(and2(eq3(fileTags.fileId, files.id), ilike2(tags.name, lower))))
              )
            )).limit(shardBatchSize).offset(offset);
            const rows = await fileQueryBatch;
            for (const r of rows) {
              const payload = { type: "file", data: { ...r.file, user: r.user, forum: r.forum } };
              res.write(`data: ${JSON.stringify(payload)}

`);
              localStreamedCount++;
              await new Promise((r2) => setTimeout(r2, 10));
            }
            if (rows.length > 0) {
              res.write(`event: count
data: ${JSON.stringify({ source: "local", count: localStreamedCount })}

`);
            }
            if (rows.length < shardBatchSize) more = false;
            else offset += shardBatchSize;
          } catch (err) {
            console.warn("Search stream shard batch error on", instance.id, err && err.message || err);
            more = false;
          }
        }
        try {
          const fileQuery = instance.db.select({ file: files, user: users, forum: forums }).from(files).innerJoin(users, eq3(files.userId, users.id)).innerJoin(forums, eq3(files.forumId, forums.id)).leftJoin(forumMembers, and2(eq3(forumMembers.forumId, forums.id), userId ? eq3(forumMembers.userId, userId) : sql3`1=0`));
          const lower2 = `%${query.toLowerCase()}%`;
          let conditionedFileQuery = fileQuery.where(and2(
            or2(eq3(forums.isPublic, true), userId ? eq3(forums.creatorId, userId) : sql3`1=0`, userId ? isNotNull2(forumMembers.id) : sql3`1=0`),
            or2(
              ilike2(files.fileName, lower2),
              and2(isNotNull2(files.metaTitle), ilike2(files.metaTitle, lower2)),
              and2(isNotNull2(files.metaDescription), ilike2(files.metaDescription, lower2)),
              and2(isNotNull2(files.keywords), ilike2(files.keywords, lower2)),
              and2(isNotNull2(files.adminNotes), ilike2(files.adminNotes, lower2)),
              exists2(instance.db.select().from(fileTags).innerJoin(tags, eq3(fileTags.tagId, tags.id)).where(and2(eq3(fileTags.fileId, files.id), ilike2(tags.name, lower2))))
            )
          ));
          if (forumId) conditionedFileQuery = conditionedFileQuery.where(eq3(files.forumId, forumId));
          const fileRows = await conditionedFileQuery;
          for (const r of fileRows) {
            const payload = { type: "file", data: { ...r.file, user: r.user, forum: r.forum } };
            res.write(`data: ${JSON.stringify(payload)}

`);
            localStreamedCount++;
            await new Promise((r2) => setTimeout(r2, 10));
          }
          if (fileRows.length > 0) {
            res.write(`event: count
data: ${JSON.stringify({ source: "local", count: localStreamedCount })}

`);
          }
          const messageQuery = instance.db.select({ message: messages, user: users, forum: forums }).from(messages).innerJoin(users, eq3(messages.userId, users.id)).innerJoin(forums, eq3(messages.forumId, forums.id)).leftJoin(forumMembers, and2(eq3(forumMembers.forumId, forums.id), userId ? eq3(forumMembers.userId, userId) : sql3`1=0`));
          let conditionedMessageQuery = messageQuery.where(and2(
            or2(eq3(forums.isPublic, true), userId ? eq3(forums.creatorId, userId) : sql3`1=0`, userId ? isNotNull2(forumMembers.id) : sql3`1=0`),
            or2(
              ilike2(messages.content, lower2),
              exists2(instance.db.select().from(messageTags).innerJoin(tags, eq3(messageTags.tagId, tags.id)).where(and2(eq3(messageTags.messageId, messages.id), ilike2(tags.name, lower2))))
            )
          ));
          if (forumId) conditionedMessageQuery = conditionedMessageQuery.where(eq3(messages.forumId, forumId));
          let msgOffset = 0;
          let msgMore = true;
          while (msgMore) {
            const msgBatch = await conditionedMessageQuery.limit(shardBatchSize).offset(msgOffset);
            for (const r of msgBatch) {
              const payload = { type: "message", data: { ...r.message, user: r.user, forum: r.forum } };
              res.write(`data: ${JSON.stringify(payload)}

`);
              await new Promise((r2) => setTimeout(r2, 10));
            }
            if (msgBatch.length < shardBatchSize) msgMore = false;
            else msgOffset += shardBatchSize;
          }
          const forumQuery = instance.db.select({ forum: forums }).from(forums).leftJoin(forumMembers, and2(eq3(forumMembers.forumId, forums.id), userId ? eq3(forumMembers.userId, userId) : sql3`1=0`)).where(and2(
            or2(eq3(forums.isPublic, true), userId ? eq3(forums.creatorId, userId) : sql3`1=0`, userId ? isNotNull2(forumMembers.id) : sql3`1=0`),
            or2(
              ilike2(forums.name, lower2),
              ilike2(forums.description, lower2),
              exists2(instance.db.select().from(forumTags).innerJoin(tags, eq3(forumTags.tagId, tags.id)).where(and2(eq3(forumTags.forumId, forums.id), ilike2(tags.name, lower2)))),
              exists2(instance.db.select().from(files).where(and2(eq3(files.forumId, forums.id), or2(
                ilike2(files.fileName, lower2),
                and2(isNotNull2(files.metaTitle), ilike2(files.metaTitle, lower2)),
                and2(isNotNull2(files.metaDescription), ilike2(files.metaDescription, lower2)),
                and2(isNotNull2(files.keywords), ilike2(files.keywords, lower2)),
                and2(isNotNull2(files.adminNotes), ilike2(files.adminNotes, lower2))
              )))),
              exists2(instance.db.select().from(messages).where(and2(eq3(messages.forumId, forums.id), or2(
                ilike2(messages.content, lower2),
                exists2(instance.db.select().from(messageTags).innerJoin(tags, eq3(messageTags.tagId, tags.id)).where(and2(eq3(messageTags.messageId, messages.id), ilike2(tags.name, lower2))))
              ))))
            )
          ));
          const forumRows = await forumQuery.limit(20);
          for (const r of forumRows) {
            res.write(`data: ${JSON.stringify({ type: "forum", data: r.forum })}

`);
            await new Promise((r2) => setTimeout(r2, 10));
          }
        } catch (err) {
          console.warn("Search stream instance error on", instance.id, err && err.message || err);
        }
      }
      res.write(`event: done
data: {}

`);
      res.end();
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/extracted/:id/resolve", optionalAuth, async (req, res, next) => {
    try {
      const idParam = req.params.id;
      if (!idParam || !idParam.startsWith("extracted_")) return res.status(400).json({ error: "Invalid extracted id" });
      const cacheKey = idParam;
      const cached = resolvedExtractedCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < RESOLVE_TTL_MS) {
        return res.json({ ok: true, resolvedUrl: cached.resolvedUrl, proxiedUrl: cached.proxiedUrl, cached: true });
      }
      const file = await storage.getFileById(idParam);
      if (!file) return res.status(404).json({ error: "Extracted file not found" });
      const videoPage = file.videoUrl || file.directDownloadUrl;
      if (!videoPage) return res.status(400).json({ error: "No source video page available to resolve" });
      const fetchUrl = `${VERCEL_PROXY_BASE}${encodeURIComponent(videoPage)}`;
      console.log("[ExtractResolve] Fetching via vercel proxy:", fetchUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2e4);
      try {
        const r = await fetch2(fetchUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!r.ok) return res.status(502).json({ error: "Failed to fetch source page", status: r.status });
        const html = await r.text();
        let resolvedUrl = null;
        try {
          const cheerioMod = await import("cheerio");
          const cheerio = cheerioMod && (cheerioMod.default || cheerioMod);
          if (!cheerio || typeof cheerio.load !== "function") throw new Error("cheerio not available");
          const $ = cheerio.load(html);
          const ld = $('script[type="application/ld+json"]').html();
          if (ld) {
            try {
              const meta = JSON.parse(ld);
              if (meta && meta.contentUrl) {
                if (typeof meta.contentUrl === "string") resolvedUrl = meta.contentUrl;
                else if (Array.isArray(meta.contentUrl) && meta.contentUrl.length > 0) resolvedUrl = meta.contentUrl[0];
              }
            } catch (e) {
            }
          }
        } catch (err) {
          console.warn("[ExtractResolve] Cheerio parse failed", err && err.message);
        }
        if (!resolvedUrl) {
          const mp4Match = html.match(/https?:\/\/[^'"\s>]+\.mp4[^'"\s]*/i);
          if (mp4Match) resolvedUrl = mp4Match[0];
        }
        if (!resolvedUrl) {
          resolvedUrl = file.directDownloadUrl || null;
        }
        if (!resolvedUrl) return res.status(404).json({ error: "Could not resolve mp4 or m3u8 url from page" });
        const proxiedUrl = `${VERCEL_PROXY_BASE}${encodeURIComponent(resolvedUrl)}`;
        let resolvedMeta = {};
        try {
          let headResp = null;
          try {
            headResp = await fetch2(resolvedUrl, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" } });
          } catch (hErr) {
            try {
              const r2 = await fetch2(resolvedUrl, { headers: { "User-Agent": "Mozilla/5.0", "Range": "bytes=0-0" } });
              resolvedMeta = { status: r2.status, contentType: r2.headers.get("content-type"), acceptRanges: r2.headers.get("accept-ranges") };
            } catch (gErr) {
              resolvedMeta = { error: gErr && gErr.message || String(gErr) };
            }
          }
          if (headResp) {
            resolvedMeta = { status: headResp.status, contentType: headResp.headers.get("content-type"), acceptRanges: headResp.headers.get("accept-ranges") };
          }
        } catch (metaErr) {
          resolvedMeta = { error: metaErr && metaErr.message || String(metaErr) };
        }
        let proxiedMeta = {};
        try {
          try {
            const pj = await fetch2(proxiedUrl, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" } });
            proxiedMeta = { status: pj.status, contentType: pj.headers.get("content-type"), acceptRanges: pj.headers.get("accept-ranges") };
          } catch (pErr) {
            try {
              const pr = await fetch2(proxiedUrl, { headers: { "User-Agent": "Mozilla/5.0", "Range": "bytes=0-0" } });
              proxiedMeta = { status: pr.status, contentType: pr.headers.get("content-type"), acceptRanges: pr.headers.get("accept-ranges") };
            } catch (pErr2) {
              proxiedMeta = { error: pErr2 && pErr2.message || String(pErr2) };
            }
          }
        } catch (e) {
          proxiedMeta = { error: e && e.message || String(e) };
        }
        const localProxyUrl = `/api/proxy?url=${encodeURIComponent(resolvedUrl)}`;
        let hostHeader = req.get("host") || "localhost:5000";
        hostHeader = hostHeader.replace("[::1]", "127.0.0.1").replace("::1", "127.0.0.1");
        const localProxyAbsolute = `${req.protocol}://${hostHeader}${localProxyUrl}`;
        let localProxyMeta = {};
        try {
          try {
            const lj = await fetch2(localProxyAbsolute, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" } });
            localProxyMeta = { status: lj.status, contentType: lj.headers.get("content-type"), acceptRanges: lj.headers.get("accept-ranges") };
          } catch (lErr) {
            try {
              const lr = await fetch2(localProxyAbsolute, { headers: { "User-Agent": "Mozilla/5.0", "Range": "bytes=0-0" } });
              localProxyMeta = { status: lr.status, contentType: lr.headers.get("content-type"), acceptRanges: lr.headers.get("accept-ranges") };
            } catch (lErr2) {
              localProxyMeta = { error: lErr2 && lErr2.message || String(lErr2) };
            }
          }
        } catch (le) {
          localProxyMeta = { error: le && le.message || String(le) };
        }
        resolvedExtractedCache.set(cacheKey, { ts: Date.now(), resolvedUrl, proxiedUrl, resolvedMeta, proxiedMeta, localProxyUrl, localProxyMeta });
        console.log("[ExtractResolve] Resolved URL", { resolvedUrl, proxiedUrl, resolvedMeta, proxiedMeta, localProxyUrl, localProxyMeta });
        return res.json({ ok: true, resolvedUrl, proxiedUrl, localProxyUrl, resolvedMeta, proxiedMeta, localProxyMeta });
      } catch (err) {
        clearTimeout(timeoutId);
        console.warn("[ExtractResolve] Fetch failed", err && err.message);
        return res.status(502).json({ error: "Failed to fetch via proxy", details: err && err.message });
      }
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/search/popular", optionalAuth, async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const popularSearches2 = await storage.getPopularSearches(limit);
      res.json(popularSearches2);
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/search/track", requireAuth, async (req, res, next) => {
    try {
      const { query, resultsCount, sessionId } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).send("Query is required");
      }
      await storage.trackSearch({
        query: query.trim(),
        userId: req.user?.id,
        resultsCount: resultsCount || 0,
        sessionId
      });
      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/admin/search-stats", requireAuth, async (req, res, next) => {
    try {
      const stats = await storage.getSearchAnalyticsStats();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });
  app2.get("/api/proxy", optionalAuth, async (req, res, next) => {
    try {
      const targetUrl = req.query.url;
      console.log(`\u{1F310} [WEB PROXY] Request received:`, {
        url: targetUrl,
        userAgent: req.headers["user-agent"],
        referer: req.headers.referer,
        range: req.headers.range,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (!targetUrl || typeof targetUrl !== "string") {
        console.error(`\u274C [WEB PROXY] Invalid URL parameter:`, targetUrl);
        return res.status(400).json({
          error: "URL parameter is required",
          message: "Please provide a valid URL to proxy"
        });
      }
      let parsedUrl;
      try {
        parsedUrl = new URL(targetUrl);
        console.log(`\u2705 [WEB PROXY] URL validation passed:`, {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          pathname: parsedUrl.pathname,
          search: parsedUrl.search
        });
      } catch (urlError) {
        console.error(`\u274C [WEB PROXY] Invalid URL format:`, targetUrl, urlError);
        return res.status(400).json({
          error: "Invalid URL format",
          message: "The provided URL is not valid"
        });
      }
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        console.error(`\u274C [WEB PROXY] Unsupported protocol:`, parsedUrl.protocol);
        return res.status(400).json({
          error: "Unsupported protocol",
          message: "Only HTTP and HTTPS URLs are supported"
        });
      }
      console.log(`\u{1F680} [WEB PROXY] Starting proxy request to:`, targetUrl);
      const proxyHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "video/webm,video/mp4,video/*,application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.9",
        "Accept-Encoding": "identity",
        // Disable compression to avoid issues
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Referer": parsedUrl.origin
      };
      if (req.headers.range) {
        proxyHeaders["Range"] = req.headers.range;
        console.log(`\u{1F4CA} [WEB PROXY] Forwarding range header:`, req.headers.range);
      }
      console.log(`\u{1F4E4} [WEB PROXY] Sending request with headers:`, proxyHeaders);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`\u23F0 [WEB PROXY] Request timeout for URL:`, targetUrl);
        controller.abort();
      }, 3e4);
      try {
        const response = await fetch2(targetUrl, {
          method: "GET",
          headers: proxyHeaders,
          redirect: "follow",
          // Follow redirects automatically
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        console.log(`\u{1F4E5} [WEB PROXY] Response received:`, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            "content-type": response.headers.get("content-type"),
            "content-length": response.headers.get("content-length"),
            "content-range": response.headers.get("content-range"),
            "accept-ranges": response.headers.get("accept-ranges"),
            "cache-control": response.headers.get("cache-control"),
            "last-modified": response.headers.get("last-modified")
          }
        });
        if (!response.ok && response.status !== 206) {
          console.error(`\u274C [WEB PROXY] Upstream error:`, {
            status: response.status,
            statusText: response.statusText,
            url: targetUrl
          });
          return res.status(response.status).json({
            error: "Upstream server error",
            message: `Failed to fetch content: ${response.status} ${response.statusText}`,
            upstreamStatus: response.status
          });
        }
        const contentType = response.headers.get("content-type") || "application/octet-stream";
        const contentLength = response.headers.get("content-length");
        const contentRange = response.headers.get("content-range");
        const acceptRanges = response.headers.get("accept-ranges");
        const cacheControl = response.headers.get("cache-control") || "no-cache";
        const lastModified = response.headers.get("last-modified");
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", cacheControl);
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Range");
        res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        if (contentLength) {
          res.setHeader("Content-Length", contentLength);
        }
        if (acceptRanges) {
          res.setHeader("Accept-Ranges", acceptRanges);
        }
        if (lastModified) {
          res.setHeader("Last-Modified", lastModified);
        }
        if (response.status === 206 && contentRange) {
          res.setHeader("Content-Range", contentRange);
          res.status(206);
          console.log(`\u{1F4CA} [WEB PROXY] Serving partial content:`, contentRange);
        } else {
          res.status(response.status);
        }
        console.log(`\u{1F30A} [WEB PROXY] Starting stream for:`, {
          contentType,
          contentLength: contentLength || "unknown",
          isPartial: response.status === 206
        });
        if (response.body) {
          if (typeof response.body.pipe === "function") {
            console.log(`\u{1F504} [WEB PROXY] Using Node.js stream piping`);
            req.on("close", () => {
              console.log(`\u{1F50C} [WEB PROXY] Client disconnected, aborting stream for:`, targetUrl);
              response.body?.destroy?.();
            });
            response.body.pipe(res);
            response.body.on("error", (error) => {
              console.error(`\u274C [WEB PROXY] Stream error:`, error);
              if (!res.headersSent) {
                res.status(500).end("Streaming error");
              }
            });
            response.body.on("end", () => {
              console.log(`\u2705 [WEB PROXY] Stream completed successfully for:`, targetUrl);
            });
          } else {
            console.log(`\u{1F504} [WEB PROXY] Using Web Streams API`);
            const reader = response.body.getReader();
            let totalBytesSent = 0;
            req.on("close", () => {
              console.log(`\u{1F50C} [WEB PROXY] Client disconnected, cancelling reader for:`, targetUrl);
              reader.cancel().catch((e) => console.error("Error cancelling reader:", e));
            });
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  console.log(`\u2705 [WEB PROXY] Web stream completed:`, {
                    totalBytesSent,
                    url: targetUrl
                  });
                  break;
                }
                if (res.destroyed) {
                  console.log(`\u{1F50C} [WEB PROXY] Response destroyed, stopping stream for:`, targetUrl);
                  await reader.cancel();
                  break;
                }
                const canWrite = res.write(value);
                totalBytesSent += value.length;
                if (!canWrite) {
                  await new Promise((resolve) => res.once("drain", resolve));
                }
                if (totalBytesSent % (1024 * 1024) === 0) {
                  console.log(`\u{1F4C8} [WEB PROXY] Progress: ${Math.round(totalBytesSent / 1024 / 1024)}MB sent for:`, targetUrl);
                }
              }
            } catch (streamError) {
              console.error(`\u274C [WEB PROXY] Web stream error:`, streamError);
              if (!res.headersSent) {
                res.status(500).end("Streaming error");
              }
            } finally {
              reader.releaseLock();
              if (!res.headersSent) {
                res.end();
              }
            }
          }
        } else {
          console.warn(`\u26A0\uFE0F [WEB PROXY] No response body for:`, targetUrl);
          res.end();
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        console.error(`\u274C [WEB PROXY] Fetch error:`, {
          error: fetchError.message,
          code: fetchError.code,
          url: targetUrl
        });
        if (fetchError.name === "AbortError") {
          return res.status(408).json({
            error: "Request timeout",
            message: "The proxy request timed out"
          });
        }
        return res.status(502).json({
          error: "Proxy error",
          message: "Failed to fetch content from external server",
          details: fetchError.message
        });
      }
    } catch (error) {
      console.error(`\u274C [WEB PROXY] Unexpected error:`, error);
      next(error);
    }
  });
  const httpServer = createServer(app2);
  const isVercelRuntime2 = process.env.VERCEL === "1" || process.env.VERCEL === "true";
  const wsManager = {
    broadcast: (message) => {
      clients.forEach((client, ws2) => {
        if (ws2.readyState === WebSocket2.OPEN) {
          try {
            ws2.send(JSON.stringify(message));
          } catch (error) {
            console.warn("Failed to send WebSocket message:", error);
          }
        }
      });
    },
    broadcastToUser: (userId, message) => {
      clients.forEach((client, ws2) => {
        if (client.userId === userId && ws2.readyState === WebSocket2.OPEN) {
          try {
            ws2.send(JSON.stringify(message));
          } catch (error) {
            console.warn("Failed to send WebSocket message to user:", error);
          }
        }
      });
    }
  };
  app2.locals.wsManager = wsManager;
  async function generateVideoThumbnail2(videoPath) {
    return new Promise((resolve, reject) => {
      const tempThumbnailPath = `${videoPath}.thumb.jpg`;
      ffmpeg2(videoPath).screenshots({
        count: 1,
        folder: path4.dirname(videoPath),
        filename: path4.basename(tempThumbnailPath),
        timemarks: ["10%"],
        // Take thumbnail at 10% of video duration
        size: "300x300"
      }).on("end", async () => {
        try {
          const fs6 = await import("fs/promises");
          const thumbnailBuffer = await fs6.readFile(tempThumbnailPath);
          await fs6.unlink(tempThumbnailPath);
          resolve(thumbnailBuffer);
        } catch (error) {
          console.warn("Failed to read/cleanup video thumbnail:", error);
          resolve(null);
        }
      }).on("error", (error) => {
        console.warn("FFmpeg thumbnail generation failed:", error);
        resolve(null);
      });
    });
  }
  if (!isVercelRuntime2) {
    const wss = new WebSocketServer({
      server: httpServer,
      path: "/ws",
      verifyClient: async (info, callback) => {
        const cookies = parseCookies(info.req.headers.cookie || "");
        const sessionId = cookies["connect.sid"] || cookies["sessionId"];
        const userAgent = info.req.headers["user-agent"] || "unknown";
        const clientIP = info.req.socket.remoteAddress || info.req.connection?.remoteAddress || "unknown";
        const isPingService = userAgent.includes("Forum-Ping-Service");
        console.log(`\u{1F510} WebSocket authentication attempt:`, {
          hasSessionId: !!sessionId,
          userAgent,
          ip: clientIP,
          isPingService,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
        if (sessionId) {
          try {
            const sessionStore = sessionSettings.store;
            if (sessionStore && typeof sessionStore.get === "function") {
              sessionStore.get(sessionId.replace("s:", "").split(".")[0], (err, session3) => {
                if (!err && session3 && session3.passport && session3.passport.user) {
                  info.req.userId = session3.passport.user;
                  console.log(`\u2705 WebSocket authentication successful for user: ${session3.passport.user}`);
                  callback(true);
                  return;
                }
                console.log(`\u274C WebSocket authentication failed: Invalid session`);
                callback(false, 401, "Unauthorized");
              });
              return;
            }
          } catch (error) {
            console.error("Session verification error:", error);
          }
        }
        if (isPingService) {
          console.log(`\u{1F680} Ping service authentication bypassed (no session needed for ping)`);
          info.req.userId = "ping-service";
          callback(true);
          return;
        }
        console.log(`\u274C WebSocket authentication failed: No session ID`);
        callback(false, 401, "Unauthorized");
      }
    });
    wss.on("connection", (ws2, req) => {
      const client = { ws: ws2 };
      client.userId = req.userId;
      const clientIP = req.socket.remoteAddress || req.connection?.remoteAddress || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";
      const isPingService = userAgent.includes("Forum-Ping-Service");
      console.log(`\u{1F50C} WebSocket client connected:`, {
        userId: client.userId || "unauthenticated",
        ip: clientIP,
        userAgent,
        isPingService,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (isPingService) {
        console.log("\u{1F680} Ping service connected - keeping server awake!");
      }
      clients.set(ws2, client);
      ws2.on("message", async (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`\u{1F4AC} WebSocket message received:`, {
            userId: client.userId || "unauthenticated",
            type: message.type,
            forumId: message.forumId || "none",
            hasContent: !!message.content,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          });
          if (message.type === "join" && message.forumId) {
            client.forumId = message.forumId;
            console.log(`Client joined forum: ${message.forumId}`);
          }
          if (message.type === "message" && message.forumId && message.content) {
            const forum = await storage.getForumById(message.forumId);
            if (!forum) {
              ws2.send(JSON.stringify({
                type: "error",
                message: "Forum not found"
              }));
              return;
            }
            if (!forum.isPublic) {
              const isMember = await storage.isForumMember(forum.id, client.userId);
              if (!isMember) {
                ws2.send(JSON.stringify({
                  type: "error",
                  message: "Access denied"
                }));
                return;
              }
            }
            try {
              const savedMessage = await storage.createMessage(
                { forumId: message.forumId, content: message.content },
                client.userId
              );
              clients.forEach((c) => {
                if (c.forumId === message.forumId && c.ws.readyState === WebSocket2.OPEN) {
                  c.ws.send(JSON.stringify({
                    type: "message",
                    forumId: message.forumId,
                    message: savedMessage
                  }));
                }
              });
            } catch (error) {
              console.error("Failed to create message:", error);
              if (error?.status === 403) {
                ws2.send(JSON.stringify({ type: "error", message: error.message || "Forbidden" }));
                return;
              }
              if (error?.code === "23503" && error?.constraint === "messages_forum_id_forums_id_fk") {
                ws2.send(JSON.stringify({ type: "error", message: "Forum no longer exists" }));
                return;
              }
              ws2.send(JSON.stringify({ type: "error", message: "Failed to send message" }));
            }
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      });
      ws2.on("close", () => {
        const wasPingService = req.headers["user-agent"]?.includes("Forum-Ping-Service");
        console.log(`\u{1F50C} WebSocket client disconnected:`, {
          userId: client.userId || "unauthenticated",
          wasPingService,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
        if (wasPingService) {
          console.log("\u{1F680} Ping service disconnected - server stays awake for next ping!");
        }
        clients.delete(ws2);
      });
      ws2.on("error", (error) => {
        console.error("WebSocket error:", error);
        clients.delete(ws2);
      });
    });
  } else {
    console.log("WebSocket server disabled for Vercel runtime. Client polling fallback should be used.");
  }
  return httpServer;
}

// server/vite.ts
import express2 from "express";
import fs4 from "fs";
import path6 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path5 from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      ),
      await import("@replit/vite-plugin-dev-banner").then(
        (m) => m.devBanner()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path5.resolve(import.meta.dirname, "client", "src"),
      "@shared": path5.resolve(import.meta.dirname, "shared"),
      "@assets": path5.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path5.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path5.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true
      }
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path6.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs4.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path6.resolve(import.meta.dirname, "public");
  if (!fs4.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express2.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path6.resolve(distPath, "index.html"));
  });
}

// server/port-manager.ts
import net from "net";
import fs5 from "fs";
import path7 from "path";
var PortManager = class _PortManager {
  PORT_RANGE_START = 5e3;
  PORT_RANGE_END = 6e3;
  LOCK_FILE_DIR = path7.join(process.cwd(), ".ports");
  LOCK_FILE_PREFIX = "port-";
  CLEANUP_INTERVAL = 3e4;
  // 30 seconds
  PORT_TIMEOUT = 3e5;
  // 5 minutes
  assignedPort = null;
  lockFile = null;
  cleanupInterval = null;
  constructor() {
    this.ensureLockDirectory();
    this.startCleanup();
  }
  ensureLockDirectory() {
    if (!fs5.existsSync(this.LOCK_FILE_DIR)) {
      fs5.mkdirSync(this.LOCK_FILE_DIR, { recursive: true });
    }
  }
  startCleanup() {
    this.cleanupStaleLocks();
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleLocks();
    }, this.CLEANUP_INTERVAL);
  }
  cleanupStaleLocks() {
    try {
      const files2 = fs5.readdirSync(this.LOCK_FILE_DIR);
      const now = Date.now();
      for (const file of files2) {
        if (!file.startsWith(this.LOCK_FILE_PREFIX)) continue;
        const filePath = path7.join(this.LOCK_FILE_DIR, file);
        try {
          const content = fs5.readFileSync(filePath, "utf8");
          const portInfo = JSON.parse(content);
          const lockAge = now - new Date(portInfo.timestamp).getTime();
          if (lockAge > this.PORT_TIMEOUT) {
            fs5.unlinkSync(filePath);
            console.log(`\u{1F9F9} Cleaned up stale port lock: ${portInfo.port}`);
            continue;
          }
          if (!this.isProcessRunning(portInfo.processId)) {
            fs5.unlinkSync(filePath);
            console.log(`\u{1F9F9} Cleaned up orphaned port lock: ${portInfo.port} (PID ${portInfo.processId})`);
          }
        } catch (error) {
          fs5.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.warn("Error during port cleanup:", error);
    }
  }
  isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }
  isPortInUse(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      server.once("listening", () => {
        server.close();
        resolve(false);
      });
      server.listen(port, "0.0.0.0");
    });
  }
  isPortLocked(port) {
    const lockFile = path7.join(this.LOCK_FILE_DIR, `${this.LOCK_FILE_PREFIX}${port}`);
    return fs5.existsSync(lockFile);
  }
  lockPort(port, type) {
    const lockFile = path7.join(this.LOCK_FILE_DIR, `${this.LOCK_FILE_PREFIX}${port}`);
    const portInfo = {
      port,
      processId: process.pid,
      timestamp: /* @__PURE__ */ new Date(),
      type
    };
    fs5.writeFileSync(lockFile, JSON.stringify(portInfo, null, 2));
    this.assignedPort = port;
    this.lockFile = lockFile;
  }
  unlockPort() {
    if (this.lockFile && fs5.existsSync(this.lockFile)) {
      fs5.unlinkSync(this.lockFile);
      this.lockFile = null;
    }
    this.assignedPort = null;
  }
  async assignPort(type = "main", preferredPort) {
    if (this.assignedPort) {
      return this.assignedPort;
    }
    if (preferredPort && preferredPort >= this.PORT_RANGE_START && preferredPort <= this.PORT_RANGE_END) {
      const inUse = await this.isPortInUse(preferredPort);
      const locked = this.isPortLocked(preferredPort);
      if (!inUse && !locked) {
        this.lockPort(preferredPort, type);
        console.log(`\u{1F50C} Assigned preferred port ${preferredPort} (${type})`);
        return preferredPort;
      } else {
        console.log(`\u26A0\uFE0F  Preferred port ${preferredPort} is ${inUse ? "in use" : "locked"}`);
      }
    }
    const envPort = parseInt(process.env.PORT || "5000");
    if (envPort !== 5e3 || process.env.NODE_ENV === "production") {
      const inUse = await this.isPortInUse(envPort);
      if (!inUse) {
        this.lockPort(envPort, type);
        console.log(`\u{1F50C} Assigned environment port ${envPort} (${type})`);
        return envPort;
      }
    }
    for (let port = this.PORT_RANGE_START; port <= this.PORT_RANGE_END; port++) {
      const inUse = await this.isPortInUse(port);
      const locked = this.isPortLocked(port);
      if (!inUse && !locked) {
        this.lockPort(port, type);
        console.log(`\u{1F50C} Assigned dynamic port ${port} (${type})`);
        return port;
      }
    }
    throw new Error(`No available ports in range ${this.PORT_RANGE_START}-${this.PORT_RANGE_END}`);
  }
  getAssignedPort() {
    return this.assignedPort;
  }
  getActivePorts() {
    try {
      const files2 = fs5.readdirSync(this.LOCK_FILE_DIR);
      const ports = [];
      for (const file of files2) {
        if (!file.startsWith(this.LOCK_FILE_PREFIX)) continue;
        try {
          const content = fs5.readFileSync(path7.join(this.LOCK_FILE_DIR, file), "utf8");
          const portInfo = JSON.parse(content);
          if (this.isProcessRunning(portInfo.processId)) {
            ports.push(portInfo);
          }
        } catch (error) {
        }
      }
      return ports.sort((a, b) => a.port - b.port);
    } catch (error) {
      console.warn("Error reading active ports:", error);
      return [];
    }
  }
  async findWorkerPorts() {
    const activePorts = this.getActivePorts();
    return {
      upload: activePorts.filter((p) => p.type === "worker-upload").map((p) => p.port),
      chat: activePorts.filter((p) => p.type === "worker-chat").map((p) => p.port),
      general: activePorts.filter((p) => p.type === "worker-general").map((p) => p.port)
    };
  }
  generateWorkerUrls() {
    const workerPorts = this.getActivePorts();
    const baseUrl = process.env.NODE_ENV === "development" ? "http://localhost" : process.env.BASE_URL || "http://localhost";
    return {
      upload: workerPorts.filter((p) => p.type === "worker-upload").map((p) => `${baseUrl}:${p.port}`),
      chat: workerPorts.filter((p) => p.type === "worker-chat").map((p) => `${baseUrl}:${p.port}`),
      general: workerPorts.filter((p) => p.type === "worker-general").map((p) => `${baseUrl}:${p.port}`)
    };
  }
  shutdown() {
    this.unlockPort();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    console.log("\u{1F50C} Port manager shutdown complete");
  }
  // Static method to get next available port quickly
  static async getAvailablePort(start = 5e3, end = 6e3) {
    const isPortFree = (port) => {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => {
          server.close();
          resolve(true);
        });
        server.listen(port);
      });
    };
    for (let port = start; port <= end; port++) {
      if (await isPortFree(port)) {
        return port;
      }
    }
    throw new Error(`No available ports in range ${start}-${end}`);
  }
  // Helper method for development script usage
  static async createDevelopmentCluster(serverCount = 3) {
    const portManager2 = new _PortManager();
    try {
      const mainPort = await portManager2.assignPort("main");
      const uploadPorts = [];
      const chatPorts = [];
      const generalPorts = [];
      const uploadCount = Math.ceil(serverCount * 0.3);
      const chatCount = Math.ceil(serverCount * 0.3);
      const generalCount = serverCount - uploadCount - chatCount;
      for (let i = 0; i < uploadCount; i++) {
        uploadPorts.push(await _PortManager.getAvailablePort(5100, 5200));
      }
      for (let i = 0; i < chatCount; i++) {
        chatPorts.push(await _PortManager.getAvailablePort(5200, 5300));
      }
      for (let i = 0; i < generalCount; i++) {
        generalPorts.push(await _PortManager.getAvailablePort(5300, 5400));
      }
      return {
        mainPort,
        uploadPorts,
        chatPorts,
        generalPorts
      };
    } finally {
      portManager2.shutdown();
    }
  }
};
var portManager = new PortManager();

// server/index.ts
init_memory_optimizer();
init_cluster_manager();
init_load_balancer();
dotenv2.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path8.dirname(__filename);
var app = express3();
var isVercelRuntime = process.env.VERCEL === "1" || process.env.VERCEL === "true";
if (!isVercelRuntime) {
  memoryOptimizer.on("memoryExhaustion", (data) => {
    console.error("\u{1F6A8} Memory exhaustion detected:", data);
  });
  memoryOptimizer.on("memoryWarning", (data) => {
    console.warn("\u26A0\uFE0F Memory warning:", data);
  });
}
app.use(express3.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express3.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "https://for-in-share.onrender.com"
  ];
  const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : process.env.NODE_ENV === "production" ? "https://for-in-share.onrender.com" : "http://localhost:5173";
  res.header("Access-Control-Allow-Origin", corsOrigin);
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});
app.use((req, res, next) => {
  const start = Date.now();
  const path9 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path9.startsWith("/api")) {
      let logLine = `${req.method} ${path9} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
var isInitialized = false;
var initPromise = null;
var initApp = async () => {
  if (isInitialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const server = await registerRoutes(app);
    app.use((err, req, res, _next) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("\u{1F534} Detailed API Error:", {
        message: err.message,
        stack: err.stack,
        code: err.code,
        errno: err.errno,
        syscall: err.syscall,
        hostname: err.hostname,
        url: req.url,
        method: req.method,
        user: req.user?.id,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        process: {
          pid: process.pid,
          memory: process.memoryUsage(),
          uptime: process.uptime()
        },
        errorType: err.constructor.name
      });
      res.status(status).json({ message });
    });
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
    let port;
    if (process.env.NODE_ENV === "production" && process.env.PORT) {
      port = parseInt(process.env.PORT, 10);
    } else {
      const preferredPort = parseInt(process.env.PORT || "5000", 10);
      port = await portManager.assignPort("main", preferredPort);
    }
    const hasWorkers = process.env.WORKER_SERVERS || process.env.UPLOAD_WORKERS || process.env.CHAT_WORKERS;
    if (hasWorkers && !isVercelRuntime) {
      app.use("/api", loadBalancer.getLoadBalanceMiddleware());
      log("\u{1F310} Load balancer enabled for worker servers");
    }
    app.use("/hls", (req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET");
      next();
    }, express3.static(path8.join(__dirname, "storage/hls")));
    if (!isVercelRuntime) {
      server.listen({
        port,
        host: "0.0.0.0"
        // Changed from "localhost" to "0.0.0.0" for Render
      }, () => {
        log(`\u{1F680} Server running on port ${port}`);
        log("\u2139\uFE0F Keep-alive ping system disabled; service wakes on demand");
        if (process.env.NODE_ENV === "development") {
          log(`\u{1F4CA} Memory monitoring active (limit: ${memoryOptimizer.getMemoryStats().limit}MB)`);
          const clusterMetrics = clusterManager.getClusterMetrics();
          if (clusterMetrics.totalServers > 0) {
            log(`\u{1F310} Cluster: ${clusterMetrics.healthyServers}/${clusterMetrics.totalServers} workers healthy`);
          }
        }
      });
      process.on("SIGTERM", async () => {
        console.log("\u{1F50C} Received SIGTERM, shutting down gracefully...");
        await gracefulShutdown();
      });
      process.on("SIGINT", async () => {
        console.log("\u{1F50C} Received SIGINT, shutting down gracefully...");
        await gracefulShutdown();
      });
    }
    async function gracefulShutdown() {
      try {
        server.close(() => {
          console.log("\u2705 HTTP server closed");
        });
        if (!isVercelRuntime) {
          loadBalancer.shutdown();
          clusterManager.shutdown();
          memoryOptimizer.shutdown();
          portManager.shutdown();
        }
        console.log("\u2705 Graceful shutdown complete");
        process.exit(0);
      } catch (error) {
        console.error("\u274C Error during shutdown:", error);
        process.exit(1);
      }
    }
    isInitialized = true;
  })();
  try {
    await initPromise;
  } catch (error) {
    isInitialized = false;
    initPromise = null;
    throw error;
  }
};
if (!isVercelRuntime) {
  initApp().catch(console.error);
}
export {
  app,
  initApp
};
