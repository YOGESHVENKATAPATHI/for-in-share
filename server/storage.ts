import { Client } from 'pg';
import neonManager from './neon-manager';
import session from "express-session";
import connectPg from "connect-pg-simple";
import fs from 'fs';
import path from 'path';
import { 
  users, forums, forumMembers, messages, files, fileChunks, partialUploads, accessRequests, comments, tags, fileTags, messageTags, forumTags,
  searchAnalytics, popularSearches,
  type User, type InsertUser, type Forum, type InsertForum, 
  type Message, type InsertMessage, type ForumMember,
  type File as FileType, type FileChunk, type PartialUpload, type AccessRequest, type InsertAccessRequest,
  type Comment, type InsertComment, type CommentWithUser,
  type ForumWithCreator, type MessageWithUser, type FileWithChunks, type AccessRequestWithUser, type ForumMemberWithUser,
  type Tag, type SearchAnalytics, type PopularSearch
} from "@shared/schema";
import { db, pool, dbManager } from "./db";
import { eq, and, desc, sql, inArray, or, ilike, exists, isNotNull } from "drizzle-orm";
import type { Store } from "express-session";
import { dropboxManager } from "./dropbox-manager";
const PostgresSessionStore = connectPg(session);

export interface IStorage {
  sessionStore: Store;
  
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getForums(): Promise<ForumWithCreator[]>;
  getForumById(id: string): Promise<Forum | undefined>;
  createForum(forum: InsertForum, creatorId: string): Promise<Forum>;
  getForumMembers(forumId: string): Promise<ForumMemberWithUser[]>;
  addForumMember(forumId: string, userId: string): Promise<ForumMember>;
  isForumMember(forumId: string, userId: string): Promise<boolean>;
  
  getMessages(forumId: string): Promise<MessageWithUser[]>;
  getMessageById(id: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage, userId: string): Promise<MessageWithUser>;
  
  getComments(entityType: string, entityId: string): Promise<CommentWithUser[]>;
  getCommentById(id: string): Promise<CommentWithUser | undefined>;
  createComment(comment: InsertComment, userId: string): Promise<CommentWithUser>;
  updateComment(id: string, content: string, userId: string): Promise<CommentWithUser | undefined>;
  deleteComment(id: string): Promise<void>;
  
  getFiles(forumId: string, limit?: number, offset?: number): Promise<FileWithChunks[]>;
  getFilesCount(forumId: string): Promise<{ total: number }>;
  getFileById(id: string): Promise<FileWithChunks | undefined>;
  createFile(forumId: string, userId: string, fileName: string, fileSize: number, mimeType?: string, thumbnail?: string): Promise<FileType>;
  createFileChunk(fileId: string, chunkIndex: number, chunkSize: number, checksum: string, dropboxAccountId: number, dropboxPath: string, dropboxFileId: string, downloadUrl?: string): Promise<FileChunk>;
  deleteFile(id: string): Promise<void>;
  
  // Partial upload methods
  createPartialUpload(forumId: string, userId: string, fileName: string, fileSize: number, mimeType: string | undefined, checksum: string, totalChunks: number): Promise<PartialUpload>;
  getPartialUploadByChecksum(checksum: string, userId: string): Promise<PartialUpload | undefined>;
  updatePartialUploadChunks(id: string, uploadedChunks: number[]): Promise<PartialUpload>;
  deletePartialUpload(id: string): Promise<void>;
  getPartialUploadsByUser(userId: string): Promise<PartialUpload[]>;
  
  getAccessRequests(forumId: string): Promise<AccessRequestWithUser[]>;
  createAccessRequest(request: InsertAccessRequest, userId: string): Promise<AccessRequest>;
  updateAccessRequest(id: string, status: string): Promise<AccessRequest | undefined>;
  getAccessRequestByUser(forumId: string, userId: string): Promise<AccessRequest | undefined>;
  
  deleteForum(forumId: string): Promise<void>;
  getUserForums(userId: string): Promise<ForumWithCreator[]>;
  
  // Tag methods
  getTags(includeExtracted?: boolean, forumId?: string): Promise<Tag[]>;
  createTag(tag: { name: string; description?: string; color?: string; forumId: string; createdBy: string }): Promise<Tag>;
  getTagById(id: string): Promise<Tag | undefined>;
  updateTag(id: string, updates: { name?: string; description?: string; color?: string }): Promise<Tag | undefined>;
  deleteTag(id: string): Promise<void>;
  getEntityTags(entityType: string, entityId: string): Promise<Tag[]>;
  assignTagsToEntity(entityType: string, entityId: string, tagIds: string[]): Promise<any[]>;
  removeTagFromEntity(entityType: string, entityId: string, tagId: string): Promise<void>;
  
  // SEO methods
  updateForumSEOMetadata(forumId: string): Promise<void>;
  updateFileSEOMetadata(fileId: string): Promise<void>;
  
  // Search Analytics methods
  trackSearch(params: { query: string; userId?: string; resultsCount: number; sessionId?: string }): Promise<void>;
  getPopularSearches(limit?: number): Promise<PopularSearch[]>;
  getSearchAnalyticsStats(): Promise<{ totalSearches: number; popularSearches: number; topSearches: PopularSearch[] }>;

  searchEntities(query: string, userId?: string, forumId?: string): Promise<{
    forums: Forum[];
    files: (FileType & { user: User, forum: Forum })[];
    messages: (Message & { user: User, forum: Forum })[];
  }>;

  // User data reset methods
  resetAllUserData(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true,
      errorLog: (err) => {
        console.error('🔴 Session Store Database Error:', {
          message: err.message,
          stack: err.stack,
          code: err.code,
          errno: err.errno,
          syscall: err.syscall,
          hostname: err.hostname,
          timestamp: new Date().toISOString(),
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
  private async findUserShard(userId: string): Promise<{ instance: any, user: User }> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        const [user] = await instance.db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        
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
  private async ensureForumInShard(targetInstance: any, forumId: string, safeCreatorId: string): Promise<void> {
    try {
      // Check if forum already exists in target shard
      const [existingForum] = await targetInstance.db
        .select()
        .from(forums)
        .where(eq(forums.id, forumId))
        .limit(1);
      
      if (existingForum) return; // Already exists
      
      // Get forum from source shard
      const { forum: originalForum } = await this.findForumShard(forumId);
      
      // Create forum reference with safe creator ID to avoid cascade issues
      await targetInstance.db
        .insert(forums)
        .values({
          id: originalForum.id,
          name: originalForum.name,
          description: originalForum.description,
          isPublic: originalForum.isPublic,
          creatorId: safeCreatorId, // Use safe creator to prevent FK cascade
          metaTitle: originalForum.metaTitle,
          metaDescription: originalForum.metaDescription,
          keywords: originalForum.keywords,
          ogImage: originalForum.ogImage,
          createdAt: originalForum.createdAt
        })
        .onConflictDoNothing();
        
    } catch (error) {
      console.error(`Error ensuring forum in shard:`, error);
      // Don't throw - let the parent operation handle the constraint violation
    }
  }

  // Helper to ensure user exists in target shard
  private async ensureUserInShard(targetInstance: any, userId: string): Promise<void> {
    try {
      // Check if user already exists in target shard
      const [existingUser] = await targetInstance.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (existingUser) return; // Already exists
      
      // Get user from source shard
      const { user: originalUser } = await this.findUserShard(userId);
      
      // Create user reference in target shard
      await targetInstance.db
        .insert(users)
        .values({
          id: originalUser.id,
          username: originalUser.username,
          email: originalUser.email,
          avatar: originalUser.avatar,
          createdAt: originalUser.createdAt
        })
        .onConflictDoNothing();
        
    } catch (error) {
      console.error(`Error ensuring user in shard:`, error);
      // Don't throw - let the parent operation handle the constraint violation
    }
  }

  // Helper method to find the shard where a forum exists
  private async findForumShard(forumId: string): Promise<{ instance: any, forum: Forum }> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        const [forum] = await instance.db
          .select()
          .from(forums)
          .where(eq(forums.id, forumId))
          .limit(1);
        
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
  private async findFileShard(fileId: string): Promise<{ instance: any, file: FileType }> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        const [file] = await instance.db
          .select()
          .from(files)
          .where(eq(files.id, fileId))
          .limit(1);
        
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
  private async findShardForAccessRequest(userId: string, forumId: string): Promise<{ instance: any, user: User, forum: Forum }> {
    const instances = dbManager.getAllInstances();
    
    // Strategy 1: Find a shard where both user and forum exist (ideal case)
    for (const instance of instances) {
      try {
        const [user] = await instance.db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
          
        const [forum] = await instance.db
          .select()
          .from(forums)
          .where(eq(forums.id, forumId))
          .limit(1);
        
        if (user && forum) {
          return { instance, user, forum };
        }
      } catch (error) {
        console.error(`Error checking user and forum in shard ${instance.id}:`, error);
        continue;
      }
    }
    
    // Strategy 2: If only one shard exists, use it (single database scenario)
    if (instances.length === 1) {
      const instance = instances[0];
      try {
        const [user] = await instance.db.select().from(users).where(eq(users.id, userId)).limit(1);
        const [forum] = await instance.db.select().from(forums).where(eq(forums.id, forumId)).limit(1);
        
        if (user && forum) {
          return { instance, user, forum };
        } else {
          throw new Error(`User ${userId} or Forum ${forumId} not found in database`);
        }
      } catch (error) {
        console.error(`Error in single shard lookup:`, error);
        throw new Error(`Unable to find user ${userId} or forum ${forumId} in database`);
      }
    }
    
    // Strategy 3: Multi-shard scenario - use best available instance without copying
    // This avoids complex cross-shard dependency issues
    let userInstance = null;
    let user = null;
    let forumInstance = null;
    let forum = null;
    
    // Find user and forum locations
    for (const instance of instances) {
      try {
        if (!user) {
          const [foundUser] = await instance.db.select().from(users).where(eq(users.id, userId)).limit(1);
          if (foundUser) {
            user = foundUser;
            userInstance = instance;
          }
        }
        
        if (!forum) {
          const [foundForum] = await instance.db.select().from(forums).where(eq(forums.id, forumId)).limit(1);
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
    
    // Use the user's shard as the primary choice (user-centric approach)
    // This ensures user exists in the target shard for the access request
    return { instance: userInstance!, user, forum };
  }

  async getUser(id: string): Promise<User | undefined> {
    try {
      if (!id || typeof id !== 'string') {
        console.log(`⚠️ Invalid user ID provided to getUser: ${id}`);
        return undefined;
      }

      const allResults = await dbManager.executeOnAllInstances(async (database) => {
        try {
          const [user] = await database.select().from(users).where(eq(users.id, id));
          return user ? [user] : [];
        } catch (dbError) {
          console.error(`❌ Database error in getUser for ID ${id}:`, dbError);
          return [];
        }
      });
      
      const user = allResults[0] || undefined;
      // Throttle user found logs to prevent spam
      if (user && !this.logThrottle) {
        this.logThrottle = new Map();
      }
      if (user) {
        const lastLog = this.logThrottle?.get(`user-found-${user.id}`) || 0;
        if (Date.now() - lastLog > 30000) { // Log once per 30 seconds per user
          console.log(`✅ User found: ${user.username} (${user.id})`);
          this.logThrottle?.set(`user-found-${user.id}`, Date.now());
        }
      } else {
        console.log(`⚠️ No user found for ID: ${id}`);
      }
      
      return user;
    } catch (error) {
      console.error(`❌ Error in getUser for ID ${id}:`, error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      const [user] = await database.select().from(users).where(eq(users.username, username));
      return user ? [user] : [];
    });
    return allResults[0] || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      const [user] = await database.select().from(users).where(eq(users.email, email));
      return user ? [user] : [];
    });
    return allResults[0] || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Estimate size for user record (rough estimate)
    const estimatedSize = 500; // Typical user record size
    const instance = await dbManager.getBestInstanceForData(estimatedSize);
    
    const [user] = await instance.db
      .insert(users)
      .values(insertUser)
      .returning();
    
    // Update shard metadata
    await dbManager.updateShardMetadata(instance.id, estimatedSize);
    
    return user;
  }

  async getForums(): Promise<ForumWithCreator[]> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      return await database
        .select({
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
          creator: users,
        })
        .from(forums)
        .leftJoin(users, eq(forums.creatorId, users.id));
    });

    // Deduplicate results by forum ID (important when using multiple database instances)
    const uniqueForumsMap = new Map<string, any>();
    allResults
      .filter(result => result.creator !== null)
      .forEach(result => {
        if (!uniqueForumsMap.has(result.id)) {
          uniqueForumsMap.set(result.id, result);
        }
      });

    const results = Array.from(uniqueForumsMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const forumsWithMembers = await Promise.all(
      results.map(async (result) => {
        const memberCounts = await dbManager.executeOnAllInstances(async (database) => {
          const [count] = await database
            .select({ count: sql<number>`count(*)::int` })
            .from(forumMembers)
            .where(eq(forumMembers.forumId, result.id));
          return count ? [count.count || 0] : [0];
        });

        const totalCount = memberCounts.reduce((sum, count) => sum + count, 0);

        return {
          ...result,
          creator: result.creator!,
          memberCount: totalCount,
        };
      })
    );

    return forumsWithMembers;
  }

  async getForumById(id: string): Promise<Forum | undefined> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      const [forum] = await database.select().from(forums).where(eq(forums.id, id));
      return forum ? [forum] : [];
    });
    return allResults[0] || undefined;
  }

  async createForum(insertForum: InsertForum, creatorId: string): Promise<Forum> {
    // Find the shard where the creator user exists
    const userInstance = await dbManager.getInstanceForUser(creatorId);
    if (!userInstance) {
      throw new Error(`User ${creatorId} not found in any database instance`);
    }

    // Check if forum name already exists across all instances
    const existingForums = await dbManager.executeOnAllInstances(async (database) => {
      const [forum] = await database.select().from(forums).where(eq(forums.name, insertForum.name));
      return forum ? [forum] : [];
    });
    if (existingForums.length > 0) {
      throw new Error(`Forum with name "${insertForum.name}" already exists`);
    }

    // Estimate size for forum record and initial member
    const estimatedSize = 1000 + (insertForum.description?.length || 0) * 2; // Forum + member records
    
    const [forum] = await userInstance.db
      .insert(forums)
      .values({ ...insertForum, creatorId })
      .returning();

    await userInstance.db
      .insert(forumMembers)
      .values({ forumId: forum.id, userId: creatorId });

    // Update shard metadata
    await dbManager.updateShardMetadata(userInstance.id, estimatedSize);

    return forum;
  }

  async getForumMembers(forumId: string): Promise<ForumMemberWithUser[]> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      return await database
        .select({
          id: forumMembers.id,
          forumId: forumMembers.forumId,
          userId: forumMembers.userId,
          role: forumMembers.role,
          joinedAt: forumMembers.joinedAt,
          user: users,
        })
        .from(forumMembers)
        .leftJoin(users, eq(forumMembers.userId, users.id))
        .where(eq(forumMembers.forumId, forumId))
        .orderBy(forumMembers.joinedAt);
    });

    return allResults
      .filter(result => result.user !== null)
      .map(result => ({
        ...result,
        user: result.user!,
      }));
  }

  async addForumMember(forumId: string, userId: string): Promise<ForumMember> {
    const instances = dbManager.getAllInstances();
    const primaryInstance = instances[0];
    
    try {
      // Try primary instance first
      const [member] = await primaryInstance.db
        .insert(forumMembers)
        .values({ forumId, userId })
        .returning();
      return member;
    } catch (error: any) {
      if (error?.code === '23503') {
        // Foreign key constraint - use user's shard
        const { instance: userInstance } = await this.findUserShard(userId);
        
        try {
          const [member] = await userInstance.db
            .insert(forumMembers)
            .values({ forumId, userId })
            .returning();
          return member;
        } catch (userShardError: any) {
          // If forum doesn't exist in user's shard, create a reference
          if (userShardError?.code === '23503' && userShardError?.constraint?.includes('forum_id')) {
            await this.ensureForumInShard(userInstance, forumId, userId);
            const [member] = await userInstance.db
              .insert(forumMembers)
              .values({ forumId, userId })
              .returning();
            return member;
          }
          throw userShardError;
        }
      }
      throw error;
    }
  }

  async isForumMember(forumId: string, userId: string): Promise<boolean> {
    const results = await dbManager.executeOnAllInstances(async (database) => {
      const [member] = await database
        .select()
        .from(forumMembers)
        .where(and(
          eq(forumMembers.forumId, forumId),
          eq(forumMembers.userId, userId)
        ));
      return member ? [member] : [];
    });
    return results.length > 0;
  }

  async getMessages(forumId: string): Promise<MessageWithUser[]> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      return await database
        .select({
          id: messages.id,
          forumId: messages.forumId,
          userId: messages.userId,
          content: messages.content,
          createdAt: messages.createdAt,
          user: users,
          commentCount: sql<number>`
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
          `.as('commentCount'),
        })
        .from(messages)
        .leftJoin(users, eq(messages.userId, users.id))
        .where(eq(messages.forumId, forumId));
    });

    // Deduplicate results by message ID
    const uniqueMessagesMap = new Map<string, any>();
    allResults
      .filter(result => result.user !== null)
      .forEach(result => {
        if (!uniqueMessagesMap.has(result.id)) {
          uniqueMessagesMap.set(result.id, result);
        }
      });

    const validResults = Array.from(uniqueMessagesMap.values())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return validResults.map(result => ({
      ...result,
      user: result.user!,
      commentCount: result.commentCount || 0,
    }));
  }

  async getMessageById(id: string): Promise<Message | undefined> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      const [message] = await database.select().from(messages).where(eq(messages.id, id));
      return message ? [message] : [];
    });
    return allResults[0] || undefined;
  }

  async createMessage(insertMessage: InsertMessage, userId: string): Promise<MessageWithUser> {
    // Find the user's shard and ensure both user and forum exist there
    const { instance: userInstance, user } = await this.findUserShard(userId);

    // Ensure forum exists in user's shard (copy if needed)
    await this.ensureForumInShard(userInstance, insertMessage.forumId, userId);

    const estimatedSize = 500 + (insertMessage.content.length * 2);

    try {
      // Insert message on the user's shard (where both user and forum exist)
      const [message] = await userInstance.db
        .insert(messages)
        .values({ ...insertMessage, userId })
        .returning();

      await dbManager.updateShardMetadata(userInstance.id, estimatedSize);
      return { ...message, user };

    } catch (error: any) {
      console.error('Failed to create message on user shard:', error);
      throw error;
    }
  }  async getComments(entityType: string, entityId: string): Promise<CommentWithUser[]> {
    // 1. Fetch root comments (level 0)
    let allComments: any[] = [];
    
    const fetchLevel = async (type: string, ids: string | string[]) => {
      return await dbManager.executeOnAllInstances(async (database) => {
        return await database
          .select({
            id: comments.id,
            userId: comments.userId,
            entityType: comments.entityType,
            entityId: comments.entityId,
            parentId: comments.parentId,
            content: comments.content,
            createdAt: comments.createdAt,
            updatedAt: comments.updatedAt,
            user: users,
          })
          .from(comments)
          .leftJoin(users, eq(comments.userId, users.id))
          .where(and(
            eq(comments.entityType, type),
            Array.isArray(ids) ? inArray(comments.entityId, ids) : eq(comments.entityId, ids)
          ));
      });
    };

    // Fetch root comments
    const rootResults = await fetchLevel(entityType, entityId);
    allComments = [...rootResults];
    
    let currentParentIds = rootResults.map(c => c.id);
    
    // Fetch replies iteratively (max depth 10 to prevent infinite loops)
    let depth = 0;
    while (currentParentIds.length > 0 && depth < 10) {
      const replies = await fetchLevel('comment', currentParentIds);
      
      if (replies.length === 0) break;
      
      allComments = [...allComments, ...replies];
      currentParentIds = replies.map(c => c.id);
      depth++;
    }

    const validResults = allComments
      .filter(result => result.user !== null)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Build nested structure
    const commentMap = new Map<string, CommentWithUser & { replies: CommentWithUser[] }>();
    const rootComments: (CommentWithUser & { replies: CommentWithUser[] })[] = [];

    // First pass: create all comment objects
    validResults.forEach(result => {
      if (!commentMap.has(result.id)) {
        const comment: CommentWithUser & { replies: CommentWithUser[] } = {
          ...result,
          user: result.user!,
          replies: [],
        };
        commentMap.set(comment.id, comment);
      }
    });

    // Second pass: build hierarchy
    commentMap.forEach(comment => {
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          parent.replies.push(comment);
        }
      } else {
        // Only add to root if it matches the requested entity
        if (comment.entityType === entityType && comment.entityId === entityId) {
          rootComments.push(comment);
        }
      }
    });

    return rootComments;
  }

  async getCommentById(id: string): Promise<CommentWithUser | undefined> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      const [comment] = await database
        .select({
          id: comments.id,
          userId: comments.userId,
          entityType: comments.entityType,
          entityId: comments.entityId,
          parentId: comments.parentId,
          content: comments.content,
          createdAt: comments.createdAt,
          updatedAt: comments.updatedAt,
          user: users,
        })
        .from(comments)
        .leftJoin(users, eq(comments.userId, users.id))
        .where(eq(comments.id, id));
      return comment ? [comment] : [];
    });

    const result = allResults[0];
    if (!result || !result.user) return undefined;

    return {
      ...result,
      user: result.user,
    };
  }

  async createComment(insertComment: InsertComment, userId: string): Promise<CommentWithUser> {
    // Find the forumId for the comment (from entityId if entityType is 'message', else from parent comment, or from file)
    let forumId: string | undefined = undefined;
    if (insertComment.entityType === 'message') {
      // Get the message to find its forumId
      const message = await this.getMessageById(insertComment.entityId);
      if (message) forumId = message.forumId;
    } else if (insertComment.entityType === 'file') {
      // Get the file to find its forumId
      const file = await this.getFileById(insertComment.entityId);
      if (file) forumId = file.forumId;
    } else if (insertComment.entityType === 'comment') {
      // Get the parent comment, then recursively get its forumId
      let parent = await this.getCommentById(insertComment.entityId);
      while (parent && parent.entityType === 'comment') {
        parent = await this.getCommentById(parent.entityId);
      }
      if (parent && parent.entityType === 'message') {
        const message = await this.getMessageById(parent.entityId);
        if (message) forumId = message.forumId;
      } else if (parent && parent.entityType === 'file') {
        const file = await this.getFileById(parent.entityId);
        if (file) forumId = file.forumId;
      }
    }
    if (!forumId) throw new Error('Unable to determine forum for comment');

    // Find the forum's shard and ensure both user and forum exist there
    const { instance: forumInstance, forum } = await this.findForumShard(forumId);
    await this.ensureUserInShard(forumInstance, userId);
    await this.ensureForumInShard(forumInstance, forumId, forum.creatorId);

    try {
      // Insert comment on the forum's shard
      const [comment] = await forumInstance.db
        .insert(comments)
        .values({ ...insertComment, userId })
        .returning();
      // Always get user from the forum's shard
      const [user] = await forumInstance.db.select().from(users).where(eq(users.id, userId)).limit(1);
      return { ...comment, user };
    } catch (error: any) {
      console.error('Failed to create comment on forum shard:', error);
      throw error;
    }
  }

  async updateComment(id: string, content: string, userId: string): Promise<CommentWithUser | undefined> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        const [comment] = await instance.db
          .update(comments)
          .set({ content, updatedAt: new Date() })
          .where(and(
            eq(comments.id, id),
            eq(comments.userId, userId)
          ))
          .returning();
        
        if (comment) {
          const user = await this.getUser(comment.userId);
          return {
            ...comment,
            user: user!,
          };
        }
      } catch (error) {
        console.error(`Error updating comment in instance ${instance.id}:`, error);
      }
    }
    
    return undefined;
  }

  async deleteComment(id: string): Promise<void> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        // Delete all replies first (cascade will handle this, but let's be explicit)
        await instance.db.delete(comments).where(eq(comments.parentId, id));
        await instance.db.delete(comments).where(eq(comments.id, id));
      } catch (error) {
        console.error(`Error deleting comment from instance ${instance.id}:`, error);
      }
    }
  }

  async getFiles(forumId: string, limit?: number, offset?: number): Promise<FileWithChunks[]> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      let query = database
        .select({
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
          commentCount: sql<number>`
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
          `.as('commentCount'),
        })
        .from(files)
        .leftJoin(users, eq(files.userId, users.id))
        .where(eq(files.forumId, forumId))
        .orderBy(desc(files.uploadedAt));

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
          return await database
            .select()
            .from(fileChunks)
            .where(eq(fileChunks.fileId, file.id));
        });

        const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

        return {
          ...file,
          user: file.user!,
          chunks: sortedChunks,
          commentCount: file.commentCount || 0,
        };
      })
    );

    return filesWithChunks;
  }

  async getFilesCount(forumId: string): Promise<{ total: number }> {
    // Get normal files count across all shards using a Drizzle count query
    const counts = await dbManager.executeOnAllInstances(async (database) => {
      const [row] = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(files)
        .where(eq(files.forumId, forumId));
      return row ? [row.count || 0] : [0];
    });
    const normalCount = counts.reduce((acc, c) => acc + (Number(c) || 0), 0);

    return { total: normalCount };
  }

  async getFileById(id: string): Promise<FileWithChunks | undefined> {
    // Handle normal files from the database
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      const [file] = await database
        .select({
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
        })
        .from(files)
        .leftJoin(users, eq(files.userId, users.id))
        .where(eq(files.id, id));
      return file ? [file] : [];
    });

    const file = allResults[0];
    if (!file) return undefined;

    const chunks = await dbManager.executeOnAllInstances(async (database) => {
      return await database
        .select()
        .from(fileChunks)
        .where(eq(fileChunks.fileId, id));
    });

    const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    return {
      ...file,
      user: file.user!,
      chunks: sortedChunks,
    };
  }

  async createFile(
    forumId: string, 
    userId: string, 
    fileName: string, 
    fileSize: number, 
    mimeType?: string,
    thumbnail?: string,
    options?: { 
      isAdminCreated?: boolean, 
      adminNotes?: string,
      metaTitle?: string,
      metaDescription?: string,
      keywords?: string
    }
  ): Promise<FileType> {
    const instances = dbManager.getAllInstances();
    const estimatedSize = 500 + (fileName.length * 2);
    const primaryInstance = instances[0];

    try {
      const [file] = await primaryInstance.db
        .insert(files)
        .values({ 
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
        })
        .returning();
    
      await dbManager.updateShardMetadata(primaryInstance.id, estimatedSize);
      return file;
      
    } catch (error: any) {
      if (error?.code === '23503') {
        // Foreign key constraint - use user's shard
        const { instance: userInstance } = await this.findUserShard(userId);
        
        try {
          const [file] = await userInstance.db
            .insert(files)
            .values({ 
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
            })
            .returning();
        
          await dbManager.updateShardMetadata(userInstance.id, estimatedSize);
          return file;
        } catch (userShardError: any) {
          // Handle forum constraint if needed
          if (userShardError?.code === '23503' && userShardError?.constraint?.includes('forum_id')) {
            await this.ensureForumInShard(userInstance, forumId, userId);
            const [file] = await userInstance.db
              .insert(files)
              .values({ 
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
              })
              .returning();
          
            await dbManager.updateShardMetadata(userInstance.id, estimatedSize);
            return file;
          }
          throw userShardError;
        }
      }
      throw error;
    }
  }

  async createFileChunk(
    fileId: string,
    chunkIndex: number,
    chunkSize: number,
    checksum: string,
    dropboxAccountId: number,
    dropboxPath: string,
    dropboxFileId: string,
    downloadUrl?: string
  ): Promise<FileChunk> {
    // Ensure we insert the chunk into the same shard that contains the file.
    try {
      let targetInstance: any;

      // Try to find the instance that already contains the file
      try {
        const { instance } = await this.findFileShard(fileId);
        targetInstance = instance;
      } catch (e) {
        // File not found in any shard - attempt to locate source file and copy
        console.warn(`createFileChunk: file ${fileId} not found in any shard, attempting to locate and copy to write shard`);

        // Find source file across instances
        const instances = dbManager.getAllInstances();
        let sourceFile: any = null;
        for (const inst of instances) {
          try {
            const [f] = await inst.db
              .select()
              .from(files)
              .where(eq(files.id, fileId))
              .limit(1);
            if (f) {
              sourceFile = f;
              break;
            }
          } catch (err) {
            // ignore
          }
        }

        // Use a write instance as the target
        targetInstance = dbManager.getInstanceForWrite();

        if (sourceFile) {
          // Ensure dependent user and forum exist in target shard
          try {
            await this.ensureUserInShard(targetInstance, sourceFile.userId);
          } catch (err) {
            console.warn('Failed to ensure user in target shard while copying file:', err);
          }
          try {
            await this.ensureForumInShard(targetInstance, sourceFile.forumId, sourceFile.userId);
          } catch (err) {
            console.warn('Failed to ensure forum in target shard while copying file:', err);
          }

          // Copy file record into target instance (id preserved)
          try {
            await targetInstance.db
              .insert(files)
              .values({
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
              })
              .onConflictDoNothing();
            console.log(`createFileChunk: copied file ${fileId} into target shard ${targetInstance.id}`);
          } catch (err) {
            console.warn('Failed to copy file into target shard:', err);
          }
        } else {
          console.warn(`createFileChunk: file ${fileId} not found in any shard and cannot be copied`);
        }
      }

      try {
        const [chunk] = await targetInstance.db
          .insert(fileChunks)
          .values({
            fileId,
            chunkIndex,
            chunkSize,
            checksum,
            dropboxAccountId,
            dropboxPath,
            dropboxFileId,
            downloadUrl,
          })
          .returning();

        return chunk as FileChunk;
      } catch (err: any) {
        // If FK violation, try to copy the file metadata again then retry once
        if (err?.code === '23503') {
          console.warn('FK violation inserting chunk, attempting to copy file metadata and retrying');

          // Attempt to locate source file and copy
          const instances = dbManager.getAllInstances();
          let sourceFile: any = null;
          for (const inst of instances) {
            try {
              const [f] = await inst.db
                .select()
                .from(files)
                .where(eq(files.id, fileId))
                .limit(1);
              if (f) {
                sourceFile = f;
                break;
              }
            } catch (e) {
              // ignore
            }
          }

          if (sourceFile) {
            try {
              await this.ensureUserInShard(targetInstance, sourceFile.userId);
              await this.ensureForumInShard(targetInstance, sourceFile.forumId, sourceFile.userId);
              await targetInstance.db
                .insert(files)
                .values({
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
                })
                .onConflictDoNothing();

              const [chunk] = await targetInstance.db
                .insert(fileChunks)
                .values({
                  fileId,
                  chunkIndex,
                  chunkSize,
                  checksum,
                  dropboxAccountId,
                  dropboxPath,
                  dropboxFileId,
                  downloadUrl,
                })
                .returning();

              return chunk as FileChunk;
            } catch (retryErr) {
              console.error('Retry after copying file failed', retryErr);
              throw retryErr;
            }
          }
        }

        throw err;
      }
    } catch (err: any) {
      console.error('Failed to create file chunk', err);
      // Re-throw so callers can handle rollback
      throw err;
    }
  }

  async getTags(includeExtracted: boolean = false, forumId?: string): Promise<Tag[]> {
    console.log(`[Tags] getTags() called (includeExtracted=${includeExtracted}, forumId=${forumId || 'all'})`);
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      if (forumId) {
        return await database
          .select()
          .from(tags)
          .where(eq(tags.forumId, forumId))
          .orderBy(tags.name);
      }

      return await database
        .select()
        .from(tags)
        .orderBy(tags.name);
    });
    
    // Remove duplicates based on tag ID
    const uniqueTags = new Map();
    allResults.forEach(tag => {
      if (!uniqueTags.has(tag.id)) {
        uniqueTags.set(tag.id, tag);
      }
    });

    console.log(`[Tags] Returning ${uniqueTags.size} tags from normal databases only`);

    if (includeExtracted) {
      console.log('[Tags] includeExtracted requested but ignored to avoid loading extracted Neon tags');
    }

    return Array.from(uniqueTags.values());
  }

  async createPartialUpload(
    forumId: string,
    userId: string,
    fileName: string,
    fileSize: number,
    mimeType: string | undefined,
    checksum: string,
    totalChunks: number
  ): Promise<PartialUpload> {
    try {
      const instances = dbManager.getAllInstances();
      const primaryInstance = instances[0];

      const [partialUpload] = await primaryInstance.db
        .insert(partialUploads)
        .values({
          forumId,
          userId,
          fileName,
          fileSize,
          mimeType,
          checksum,
          totalChunks,
          uploadedChunks: []
        })
        .returning();

      if (partialUpload) return partialUpload;
    } catch (error: any) {
      if (error?.code === '23503') {
        // Foreign key constraint - use user's shard
        const { instance: userInstance } = await this.findUserShard(userId);
        
        try {
          const [partialUpload] = await userInstance.db
            .insert(partialUploads)
            .values({ 
              forumId, 
              userId, 
              fileName, 
              fileSize, 
              mimeType, 
              checksum, 
              totalChunks,
              uploadedChunks: []
            })
            .returning();
          return partialUpload;
        } catch (userShardError: any) {
          // Handle forum constraint if needed
          if (userShardError?.code === '23503' && userShardError?.constraint?.includes('forum_id')) {
            await this.ensureForumInShard(userInstance, forumId, userId);
            const [partialUpload] = await userInstance.db
              .insert(partialUploads)
              .values({ 
                forumId, 
                userId, 
                fileName, 
                fileSize, 
                mimeType, 
                checksum, 
                totalChunks,
                uploadedChunks: []
              })
              .returning();
            return partialUpload;
          }
          throw userShardError;
        }
      }
      throw error;
    }
  }

  async getPartialUploadByChecksum(checksum: string, userId: string): Promise<PartialUpload | undefined> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      const [partialUpload] = await database
        .select()
        .from(partialUploads)
        .where(and(
          eq(partialUploads.checksum, checksum),
          eq(partialUploads.userId, userId)
        ));
      return partialUpload ? [partialUpload] : [];
    });
    return allResults[0] || undefined;
  }

  async updatePartialUploadChunks(id: string, uploadedChunks: number[]): Promise<PartialUpload> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        const [partialUpload] = await instance.db
          .update(partialUploads)
          .set({ 
            uploadedChunks: uploadedChunks as any,
            updatedAt: new Date()
          })
          .where(eq(partialUploads.id, id))
          .returning();
        
        if (partialUpload) return partialUpload;
      } catch (error) {
        console.error(`Error updating partial upload in instance ${instance.id}:`, error);
      }
    }
    
    throw new Error("Failed to update partial upload");
  }

  async deletePartialUpload(id: string): Promise<void> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        await instance.db.delete(partialUploads).where(eq(partialUploads.id, id));
      } catch (error) {
        console.error(`Error deleting partial upload from instance ${instance.id}:`, error);
      }
    }
  }

  async getPartialUploadsByUser(userId: string): Promise<PartialUpload[]> {
    return await dbManager.executeOnAllInstances(async (database) => {
      return await database
        .select()
        .from(partialUploads)
        .where(eq(partialUploads.userId, userId))
        .orderBy(desc(partialUploads.updatedAt));
    });
  }

  async getPartialUploadById(id: string): Promise<PartialUpload | undefined> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      return await database
        .select()
        .from(partialUploads)
        .where(eq(partialUploads.id, id));
    });
    return allResults[0] || undefined;
  }

  async getAccessRequests(forumId: string): Promise<AccessRequestWithUser[]> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      return await database
        .select({
          id: accessRequests.id,
          forumId: accessRequests.forumId,
          userId: accessRequests.userId,
          status: accessRequests.status,
          requestedAt: accessRequests.requestedAt,
          resolvedAt: accessRequests.resolvedAt,
          resolvedBy: accessRequests.resolvedBy,
          user: users,
        })
        .from(accessRequests)
        .leftJoin(users, eq(accessRequests.userId, users.id))
        .where(eq(accessRequests.forumId, forumId))
        .orderBy(desc(accessRequests.requestedAt));
    });

    return allResults
      .filter(result => result.user !== null)
      .map(result => ({
        ...result,
        user: result.user!,
      }));
  }

  async createAccessRequest(insertRequest: InsertAccessRequest, userId: string): Promise<AccessRequest> {
    const instances = dbManager.getAllInstances();
    
    // Strategy: Always use the first available instance (primary shard strategy)
    // This eliminates cross-shard complexity while maintaining functionality
    const primaryInstance = instances[0];
    
    try {
      // Direct creation in primary shard
      const [request] = await primaryInstance.db
        .insert(accessRequests)
        .values({ ...insertRequest, userId })
        .returning();
      return request;
      
    } catch (error: any) {
      // If foreign key constraint violation occurs, it means either:
      // 1. User doesn't exist in primary shard
      // 2. Forum doesn't exist in primary shard
      
      if (error?.code === '23503') {
        console.log(`Foreign key constraint in primary shard, attempting cross-shard resolution...`);
        
        // Find where the user actually exists and use that shard
        const { instance: userInstance } = await this.findUserShard(userId);
        
        // Attempt to create in user's shard
        try {
          const [request] = await userInstance.db
            .insert(accessRequests)
            .values({ ...insertRequest, userId })
            .returning();
          return request;
        } catch (userShardError: any) {
          // If still failing, the forum doesn't exist in user's shard
          // Create a lightweight forum reference without creator dependency
          if (userShardError?.code === '23503' && userShardError?.constraint?.includes('forum_id')) {
            const { forum: originalForum } = await this.findForumShard(insertRequest.forumId);
            
            // Use a system/admin user ID for the creator to avoid cascade issues
            // Or use the requesting user as the temporary creator
            const safeCreatorId = userId; // Use the requesting user as safe creator
            
            await userInstance.db
              .insert(forums)
              .values({
                id: originalForum.id,
                name: originalForum.name,
                description: originalForum.description,
                isPublic: originalForum.isPublic,
                creatorId: safeCreatorId, // Safe creator to avoid FK cascade
                metaTitle: originalForum.metaTitle,
                metaDescription: originalForum.metaDescription,
                keywords: originalForum.keywords,
                ogImage: originalForum.ogImage,
                createdAt: originalForum.createdAt
              })
              .onConflictDoNothing();
            
            // Final attempt
            const [request] = await userInstance.db
              .insert(accessRequests)
              .values({ ...insertRequest, userId })
              .returning();
            return request;
          }
          throw userShardError;
        }
      }
      throw error;
    }
  }

  async updateAccessRequest(id: string, status: string): Promise<AccessRequest | undefined> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        const [request] = await instance.db
          .update(accessRequests)
          .set({ status, resolvedAt: new Date() })
          .where(eq(accessRequests.id, id))
          .returning();
        
        if (request) return request;
      } catch (error) {
        console.error(`Error updating access request in instance ${instance.id}:`, error);
      }
    }
    
    return undefined;
  }

  async getAccessRequestByUser(forumId: string, userId: string): Promise<AccessRequest | undefined> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      const [request] = await database
        .select()
        .from(accessRequests)
        .where(and(
          eq(accessRequests.forumId, forumId),
          eq(accessRequests.userId, userId)
        ));
      return request ? [request] : [];
    });
    return allResults[0] || undefined;
  }

  async getPendingAccessRequestsCount(userId: string): Promise<number> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      const [count] = await database
        .select({ count: sql<number>`count(*)` })
        .from(accessRequests)
        .innerJoin(forums, eq(accessRequests.forumId, forums.id))
        .where(and(
          eq(forums.creatorId, userId),
          eq(accessRequests.status, 'pending')
        ));
      return count ? [count.count] : [0];
    });

    return allResults.reduce((total, count) => total + count, 0);
  }

  async getUserForums(userId: string): Promise<ForumWithCreator[]> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      return await database
        .select({
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
          creator: users,
        })
        .from(forums)
        .leftJoin(users, eq(forums.creatorId, users.id))
        .where(eq(forums.creatorId, userId));
    });

    const results = allResults
      .filter(result => result.creator !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const forumsWithMembers = await Promise.all(
      results.map(async (result) => {
        const memberCounts = await dbManager.executeOnAllInstances(async (database) => {
          const [count] = await database
            .select({ count: sql<number>`count(*)::int` })
            .from(forumMembers)
            .where(eq(forumMembers.forumId, result.id));
          return count ? [count.count || 0] : [0];
        });

        const totalCount = memberCounts.reduce((sum, count) => sum + count, 0);

        return {
          ...result,
          creator: result.creator!,
          memberCount: totalCount,
        };
      })
    );

    return forumsWithMembers;
  }

  async deleteForum(forumId: string): Promise<void> {
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
        // Delete file/message tag assignments tied to this forum's entities first
        await instance.db.delete(fileTags)
          .where(sql`file_id IN (SELECT id FROM files WHERE forum_id = ${forumId})`);
        await instance.db.delete(messageTags)
          .where(sql`message_id IN (SELECT id FROM messages WHERE forum_id = ${forumId})`);
        await instance.db.delete(forumTags).where(eq(forumTags.forumId, forumId));
        console.log(`Deleted forum-related tag assignments from instance ${instance.id}`);
      } catch (error) {
        console.error(`Error deleting tag assignments from instance ${instance.id}:`, error);
      }

      try {
        // Delete forum-scoped tags (new schema) after unassigning them
        await instance.db.delete(tags).where(eq(tags.forumId, forumId));
        console.log(`Deleted forum-scoped tags from instance ${instance.id}`);
      } catch (error) {
        console.error(`Error deleting forum-scoped tags from instance ${instance.id}:`, error);
      }

      try {
        await instance.db.delete(fileChunks)
          .where(sql`file_id IN (SELECT id FROM files WHERE forum_id = ${forumId})`);
        console.log(`Deleted file chunks from instance ${instance.id}`);
      } catch (error) {
        console.error(`Error deleting chunks from instance ${instance.id}:`, error);
      }
      
      try {
        await instance.db.delete(files).where(eq(files.forumId, forumId));
        console.log(`Deleted files from instance ${instance.id}`);
      } catch (error) {
        console.error(`Error deleting files from instance ${instance.id}:`, error);
      }
      
      try {
        await instance.db.delete(messages).where(eq(messages.forumId, forumId));
        console.log(`Deleted messages from instance ${instance.id}`);
      } catch (error) {
        console.error(`Error deleting messages from instance ${instance.id}:`, error);
      }
      
      try {
        await instance.db.delete(partialUploads).where(eq(partialUploads.forumId, forumId));
        console.log(`Deleted partial uploads from instance ${instance.id}`);
      } catch (error) {
        console.error(`Error deleting partial uploads from instance ${instance.id}:`, error);
      }
      
      try {
        await instance.db.delete(accessRequests).where(eq(accessRequests.forumId, forumId));
        console.log(`Deleted access requests from instance ${instance.id}`);
      } catch (error) {
        console.error(`Error deleting access requests from instance ${instance.id}:`, error);
      }
      
      try {
        await instance.db.delete(forumMembers).where(eq(forumMembers.forumId, forumId));
        console.log(`Deleted forum members from instance ${instance.id}`);
      } catch (error) {
        console.error(`Error deleting forum members from instance ${instance.id}:`, error);
      }
      
      try {
        await instance.db.delete(forums).where(eq(forums.id, forumId));
        console.log(`Deleted forum from instance ${instance.id}`);
      } catch (error) {
        console.error(`Error deleting forum from instance ${instance.id}:`, error);
      }
    }
    
    console.log(`Cascade deletion completed for forum ${forumId}`);
  }

  async deleteFile(id: string): Promise<void> {
    try {
      const file = await this.getFileById(id);
      if (!file) {
        console.warn(`deleteFile: file ${id} not found`);
        return;
      }

      // Delete chunks from Dropbox and adjust account usage
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

      // Delete DB rows across all instances
      const instances = dbManager.getAllInstances();

      for (const instance of instances) {
        try {
          await instance.db.delete(fileChunks).where(eq(fileChunks.fileId, id));
        } catch (error) {
          console.error(`Error deleting file chunks from instance ${instance.id}:`, error);
        }

        try {
          await instance.db.delete(fileTags).where(eq(fileTags.fileId, id));
        } catch (error) {
          // ignore if table not present or other errors
          console.error(`Error deleting file tags from instance ${instance.id}:`, error);
        }

        try {
          await instance.db.delete(files).where(eq(files.id, id));
        } catch (error) {
          console.error(`Error deleting file from instance ${instance.id}:`, error);
        }
      }

      // Remove local HLS directory if it exists
      try {
        const hlsDir = path.join(process.cwd(), 'storage', 'hls', id);
        if (fs.existsSync(hlsDir)) {
          fs.rmSync(hlsDir, { recursive: true, force: true });
          console.log(`[Storage] Deleted HLS directory: ${hlsDir}`);
        }
      } catch (error) {
        console.error('Error deleting HLS directory for file', id, error);
      }

      console.log(`deleteFile: completed deletion for file ${id}`);
    } catch (error) {
      console.error('deleteFile: unexpected error', error);
      throw error;
    }
  }

  // Tag methods

  async createTag(tagData: { name: string; description?: string; color?: string; forumId: string; createdBy: string }): Promise<Tag> {
    // Always create tags in the first shard for consistency
    const instances = dbManager.getAllInstances();
    const primaryInstance = instances[0];
    
    const [tag] = await primaryInstance.db
      .insert(tags)
      .values(tagData)
      .returning();
    return tag;
  }

  async getTagById(id: string): Promise<Tag | undefined> {
    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      const [tag] = await database.select().from(tags).where(eq(tags.id, id));
      return tag ? [tag] : [];
    });
    return allResults[0] || undefined;
  }

  async updateTag(id: string, updates: { name?: string; description?: string; color?: string }): Promise<Tag | undefined> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        const [tag] = await instance.db
          .update(tags)
          .set(updates)
          .where(eq(tags.id, id))
          .returning();
        
        if (tag) return tag;
      } catch (error) {
        console.error(`Error updating tag in instance ${instance.id}:`, error);
      }
    }
    
    return undefined;
  }

  async deleteTag(id: string): Promise<void> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        // Delete tag assignments first
        await instance.db.delete(fileTags).where(eq(fileTags.tagId, id));
        await instance.db.delete(messageTags).where(eq(messageTags.tagId, id));
        await instance.db.delete(forumTags).where(eq(forumTags.tagId, id));
        
        // Delete the tag
        await instance.db.delete(tags).where(eq(tags.id, id));
      } catch (error) {
        console.error(`Error deleting tag from instance ${instance.id}:`, error);
      }
    }
  }

  async getEntityTags(entityType: string, entityId: string): Promise<Tag[]> {
    let table: any;
    let entityColumn: any;
    
    switch (entityType) {
      case 'file':
        table = fileTags;
        entityColumn = fileTags.fileId;
        break;
      case 'message':
        table = messageTags;
        entityColumn = messageTags.messageId;
        break;
      case 'forum':
        table = forumTags;
        entityColumn = forumTags.forumId;
        break;
      default:
        return [];
    }

    const allResults = await dbManager.executeOnAllInstances(async (database) => {
      return await database
        .select({
          id: tags.id,
          name: tags.name,
          description: tags.description,
          color: tags.color,
          createdAt: tags.createdAt,
        })
        .from(table)
        .innerJoin(tags, eq(table.tagId, tags.id))
        .where(eq(entityColumn, entityId))
        .orderBy(tags.name);
    });

    return allResults;
  }

  async assignTagsToEntity(entityType: string, entityId: string, tagIds: string[]): Promise<any[]> {
    // Propagate tags to parent forum for files and messages
    if (entityType === 'file' || entityType === 'message') {
      try {
        const entityInstance = await this.findEntityShard(entityType, entityId);
        if (entityInstance) {
          let forumId: string | undefined;
          
          if (entityType === 'file') {
            const [result] = await entityInstance.db
              .select({ forumId: files.forumId })
              .from(files)
              .where(eq(files.id, entityId));
            forumId = result?.forumId;
          } else {
            const [result] = await entityInstance.db
              .select({ forumId: messages.forumId })
              .from(messages)
              .where(eq(messages.id, entityId));
            forumId = result?.forumId;
          }

          if (forumId) {
            console.log(`Propagating tags to parent forum ${forumId}`);
            // Recursively assign tags to the forum
            await this.assignTagsToEntity('forum', forumId, tagIds);
          }
        }
      } catch (error) {
        console.error('Error propagating tags to parent forum:', error);
      }
    }

    const assignments: any[] = [];

    for (const tagId of tagIds) {
      let table: any;
      let values: any;
      
      switch (entityType) {
        case 'file':
          table = fileTags;
          values = { fileId: entityId, tagId };
          break;
        case 'message':
          table = messageTags;
          values = { messageId: entityId, tagId };
          break;
        case 'forum':
          table = forumTags;
          values = { forumId: entityId, tagId };
          break;
        default:
          continue;
      }

      // Find the database shard that contains both the entity and the tag
      const entityInstance = await this.findEntityShard(entityType, entityId);
      const tagInstance = await this.findTagShard(tagId);
      
      if (!entityInstance || !tagInstance) {
        console.error(`Cannot assign tag ${tagId} to ${entityType} ${entityId}: entity or tag not found`);
        continue;
      }
      
      // If entity and tag are in different shards, we need to create cross-shard references
      // For now, let's ensure both exist in the same shard by copying the tag if needed
      let targetInstance = entityInstance;
      
      // Check if tag exists in the entity's shard
      const tagExistsInEntityShard = await this.checkTagExistsInShard(entityInstance, tagId);
      if (!tagExistsInEntityShard) {
        // Copy the tag to the entity's shard
        await this.copyTagToShard(tagInstance, entityInstance, tagId);
      }

      try {
        const result = await targetInstance.db
          .insert(table)
          .values(values)
          .onConflictDoNothing()
          .returning() as any[];
        
        if (result && result.length > 0) {
          assignments.push(result[0]);
        }
      } catch (error) {
        console.error(`Error assigning tag ${tagId} to ${entityType} ${entityId}:`, error);
      }
    }

    return assignments;
  }

  async removeTagFromEntity(entityType: string, entityId: string, tagId: string): Promise<void> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        let table: any;
        let entityColumn: any;
        
        switch (entityType) {
          case 'file':
            table = fileTags;
            entityColumn = fileTags.fileId;
            break;
          case 'message':
            table = messageTags;
            entityColumn = messageTags.messageId;
            break;
          case 'forum':
            table = forumTags;
            entityColumn = forumTags.forumId;
            break;
          default:
            continue;
        }

        await instance.db
          .delete(table)
          .where(and(
            eq(entityColumn, entityId),
            eq(table.tagId, tagId)
          ));
      } catch (error) {
        console.error(`Error removing tag from instance ${instance.id}:`, error);
      }
    }
  }

  // SEO methods
  async updateForumSEOMetadata(forumId: string): Promise<void> {
    const instances = dbManager.getAllInstances();

    for (const instance of instances) {
      try {
        // Get forum data
        const [forum] = await instance.db
          .select()
          .from(forums)
          .where(eq(forums.id, forumId));

        if (!forum) continue;

        // Get forum tags
        const forumTagsResult = await instance.db
          .select({
            id: tags.id,
            name: tags.name,
            description: tags.description,
            color: tags.color,
            createdAt: tags.createdAt,
          })
          .from(forumTags)
          .innerJoin(tags, eq(forumTags.tagId, tags.id))
          .where(eq(forumTags.forumId, forumId))
          .orderBy(tags.name);

        // Generate SEO metadata
        const tagNames = forumTagsResult.map(tag => tag.name).join(", ");
        const metaTitle = forum.name.length + tagNames.length + 3 <= 60
          ? `${forum.name} - ${tagNames}`
          : forum.name;

        const baseDescription = forum.description || `Join the discussion in ${forum.name}`;
        const metaDescription = baseDescription.length + tagNames.length + 10 <= 160
          ? `${baseDescription}. Tags: ${tagNames}`
          : baseDescription;

        const keywords = tagNames;

        // Update forum with SEO metadata
        await instance.db
          .update(forums)
          .set({
            metaTitle: metaTitle.substring(0, 60),
            metaDescription: metaDescription.substring(0, 160),
            keywords,
          })
          .where(eq(forums.id, forumId));

      } catch (error) {
        console.error(`Error updating forum SEO metadata in instance ${instance.id}:`, error);
      }
    }
  }

  async updateFileSEOMetadata(fileId: string): Promise<void> {
    const instances = dbManager.getAllInstances();

    for (const instance of instances) {
      try {
        // Get file data
        const [file] = await instance.db
          .select({
            id: files.id,
            forumId: files.forumId,
            userId: files.userId,
            fileName: files.fileName,
            metaTitle: files.metaTitle,
            metaDescription: files.metaDescription,
            keywords: files.keywords,
          })
          .from(files)
          .where(eq(files.id, fileId));

        if (!file) continue;

        // Get file tags
        const fileTagsResult = await instance.db
          .select({
            id: tags.id,
            name: tags.name,
            description: tags.description,
            color: tags.color,
            createdAt: tags.createdAt,
          })
          .from(fileTags)
          .innerJoin(tags, eq(fileTags.tagId, tags.id))
          .where(eq(fileTags.fileId, fileId))
          .orderBy(tags.name);

        // Generate SEO metadata
        const tagNames = fileTagsResult.map(tag => tag.name).join(", ");
        const fileNameWithoutExt = file.fileName.replace(/\.[^/.]+$/, "");
        const metaTitle = fileNameWithoutExt.length + tagNames.length + 3 <= 60
          ? `${fileNameWithoutExt} - ${tagNames}`
          : fileNameWithoutExt;

        const baseDescription = `File: ${file.fileName}`;
        const metaDescription = baseDescription.length + tagNames.length + 10 <= 160
          ? `${baseDescription}. Tags: ${tagNames}`
          : baseDescription;

        const keywords = tagNames;

        // Update file with SEO metadata
        await instance.db
          .update(files)
          .set({
            metaTitle: metaTitle.substring(0, 60),
            metaDescription: metaDescription.substring(0, 160),
            keywords,
          })
          .where(eq(files.id, fileId));

      } catch (error) {
        console.error(`Error updating file SEO metadata in instance ${instance.id}:`, error);
      }
    }
  }

  // Helper methods for cross-shard tag management
  
  private async findEntityShard(entityType: string, entityId: string): Promise<any> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        let result;
        
        switch (entityType) {
          case 'file':
            result = await instance.db
              .select({ id: files.id })
              .from(files)
              .where(eq(files.id, entityId))
              .limit(1);
            break;
          case 'message':
            result = await instance.db
              .select({ id: messages.id })
              .from(messages)
              .where(eq(messages.id, entityId))
              .limit(1);
            break;
          case 'forum':
            result = await instance.db
              .select({ id: forums.id })
              .from(forums)
              .where(eq(forums.id, entityId))
              .limit(1);
            break;
          default:
            continue;
        }
        
        if (result && result.length > 0) {
          return instance;
        }
      } catch (error) {
        // Continue to next shard
      }
    }
    
    return null;
  }

  private async findTagShard(tagId: string): Promise<any> {
    const instances = dbManager.getAllInstances();
    
    for (const instance of instances) {
      try {
        const result = await instance.db
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.id, tagId))
          .limit(1);
        
        if (result && result.length > 0) {
          return instance;
        }
      } catch (error) {
        // Continue to next shard
      }
    }
    
    return null;
  }

  private async checkTagExistsInShard(instance: any, tagId: string): Promise<boolean> {
    try {
      const result = await instance.db
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.id, tagId))
        .limit(1);
      
      return result && result.length > 0;
    } catch (error) {
      return false;
    }
  }

  private async copyTagToShard(sourceInstance: any, targetInstance: any, tagId: string): Promise<void> {
    try {
      // Get the tag from source shard
      const tagResult = await sourceInstance.db
        .select()
        .from(tags)
        .where(eq(tags.id, tagId))
        .limit(1);
      
      if (tagResult && tagResult.length > 0) {
        const tag = tagResult[0];
        
        // Insert tag into target shard if it doesn't exist
        await targetInstance.db
          .insert(tags)
          .values(tag)
          .onConflictDoNothing();
      }
    } catch (error) {
      console.error(`Error copying tag ${tagId} to target shard:`, error);
    }
  }

  // Search Analytics methods
  
  async trackSearch(params: { query: string; userId?: string; resultsCount: number; sessionId?: string }): Promise<void> {
    const { query, userId, resultsCount, sessionId } = params;
    
    try {
      // Always use the first shard for analytics data for consistency
      const instances = dbManager.getAllInstances();
      const primaryInstance = instances[0];
      
      // Track the individual search
      // Ensure the userId exists on the primary instance before inserting to avoid FK violations across shards
      let userIdToInsert = null as string | null | undefined;
      if (userId) {
        try {
          const uRes = await primaryInstance.db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
          if (uRes && uRes.length > 0) userIdToInsert = userId;
        } catch (e) {
          userIdToInsert = null;
        }
      }
      try {
        await primaryInstance.db
          .insert(searchAnalytics)
          .values({
            query: query.toLowerCase().trim(),
            userId: userIdToInsert,
            resultsCount,
            sessionId,
          });
      } catch (err) {
        // If FK constraint caused by missing user on primary instance, try again without userId
        console.warn('[Search] Primary analytics insert failed, retrying without userId', err?.message || err);
        try {
          await primaryInstance.db
            .insert(searchAnalytics)
            .values({
              query: query.toLowerCase().trim(),
              userId: null,
              resultsCount,
              sessionId,
            });
        } catch (e) {
          console.warn('[Search] Failed to insert analytics without userId', e?.message || e);
        }
      }

      // Update or create popular search entry
      const normalizedQuery = query.toLowerCase().trim();
      
      // Check if this search term already exists in popular searches
      const existingPopular = await primaryInstance.db
        .select()
        .from(popularSearches)
        .where(eq(popularSearches.query, normalizedQuery))
        .limit(1);

      if (existingPopular.length > 0) {
        // Update existing entry
        await primaryInstance.db
          .update(popularSearches)
          .set({
            searchCount: sql`search_count + 1`,
            lastSearched: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(popularSearches.query, normalizedQuery));
      } else {
        // Only create new entry if the query is meaningful (more than 2 characters, not just spaces)
        if (normalizedQuery.length >= 2 && /\w/.test(normalizedQuery)) {
          // Determine category based on query content
          let category = 'general';
          if (normalizedQuery.startsWith('#')) {
            category = 'tag';
          } else if (normalizedQuery.includes('by ')) {
            category = 'creator';
          }

          await primaryInstance.db
            .insert(popularSearches)
            .values({
              query: normalizedQuery,
              searchCount: 1,
              category,
              lastSearched: new Date(),
            })
            .onConflictDoNothing();
        }
      }

      // Maintain only top 100 popular searches - cleanup periodically
      // Only run cleanup occasionally to avoid performance impact
      if (Math.random() < 0.01) { // 1% chance to run cleanup
        await this.cleanupPopularSearches(primaryInstance);
      }
    } catch (error) {
      console.error('Error tracking search:', error);
      // Don't throw error as this is analytics and shouldn't break user experience
    }
  }

  async getPopularSearches(limit: number = 10): Promise<PopularSearch[]> {
    try {
      // Always use the first shard for analytics data
      const instances = dbManager.getAllInstances();
      const primaryInstance = instances[0];
      
      // Only return searches that have been searched 5 or more times
      const result = await primaryInstance.db
        .select()
        .from(popularSearches)
        .where(sql`search_count >= 5`) // Only show searches with 5+ occurrences
        .orderBy(desc(popularSearches.searchCount), desc(popularSearches.lastSearched))
        .limit(Math.min(limit, 50)); // Cap at 50 for performance
      
      return result;
    } catch (error) {
      console.error('Error getting popular searches:', error);
      return [];
    }
  }

  // Cleanup method to maintain only top 100 popular searches
  private async cleanupPopularSearches(instance: any): Promise<void> {
    try {
      // Get current count of popular searches
      const countResult = await instance.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(popularSearches);
      
      const totalCount = countResult[0]?.count || 0;
      
      // Only cleanup if we have more than 100 entries
      if (totalCount > 100) {
        console.log(`🧹 Cleaning up popular searches: ${totalCount} entries, keeping top 100`);
        
        // Get the search_count of the 100th most popular search
        const threshold = await instance.db
          .select({ searchCount: popularSearches.searchCount })
          .from(popularSearches)
          .orderBy(desc(popularSearches.searchCount), desc(popularSearches.lastSearched))
          .limit(1)
          .offset(99); // Get the 100th entry (0-indexed)
        
        if (threshold.length > 0) {
          const minSearchCount = threshold[0].searchCount;
          
          // Delete all searches with count less than the threshold
          // Keep ties by using lastSearched as secondary criteria
          const deletedCount = await instance.db
            .delete(popularSearches)
            .where(sql`search_count < ${minSearchCount} OR (search_count = ${minSearchCount} AND id NOT IN (
              SELECT id FROM popular_searches 
              WHERE search_count >= ${minSearchCount}
              ORDER BY search_count DESC, last_searched DESC 
              LIMIT 100
            ))`);
          
          console.log(`✅ Cleaned up ${deletedCount} less popular searches, maintained top 100`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up popular searches:', error);
    }
  }

  async getSearchAnalyticsStats(): Promise<{ totalSearches: number; popularSearches: number; topSearches: PopularSearch[] }> {
    try {
      const instances = dbManager.getAllInstances();
      const primaryInstance = instances[0];
      // ...existing code...
      // Get total number of searches
      const totalSearchesResult = await primaryInstance.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(searchAnalytics);
      // Get number of popular searches (5+ counts)
      const popularSearchesResult = await primaryInstance.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(popularSearches)
        .where(sql`search_count >= 5`);
      // Get top 5 searches for preview
      const topSearches = await primaryInstance.db
        .select()
        .from(popularSearches);
      return { totalSearches: 0, popularSearches: 0, topSearches: [] };
    } catch (e) {
      // ...existing code...
      throw e;
    }
  }

  async searchEntities(query: string, userId?: string, forumId?: string): Promise<any> {
    const lowercaseQuery = `%${query.toLowerCase()}%`;
    console.log(`[Search] Starting search across local databases for query "${query}"`);

    const results = await dbManager.executeOnAllInstances(async (database) => {
      console.log(`[Search] Searching local database instance for forums, files, and messages`);
      
      // Search Forums
      // Match name, description, or tags
      const forumResults = await database.select({
        forum: forums
      })
      .from(forums)
      .leftJoin(forumMembers, and(
          eq(forumMembers.forumId, forums.id),
          userId ? eq(forumMembers.userId, userId) : sql`1=0`
      ))
      .where(and(
        or(
          eq(forums.isPublic, true),
          userId ? eq(forums.creatorId, userId) : sql`1=0`,
          userId ? isNotNull(forumMembers.id) : sql`1=0`
        ),
        or(
          ilike(forums.name, lowercaseQuery),
          ilike(forums.description, lowercaseQuery),
          exists(
            database.select()
              .from(forumTags)
              .innerJoin(tags, eq(forumTags.tagId, tags.id))
              .where(and(
                eq(forumTags.forumId, forums.id),
                ilike(tags.name, lowercaseQuery)
              ))
          )
        )
      ))
      .limit(20);

      // Search Files
      // Match fileName, metaTitle, metaDescription, keywords, adminNotes, or tags
      let fileQuery = database.select({
        file: files,
        user: users,
        forum: forums
      })
      .from(files)
      .innerJoin(users, eq(files.userId, users.id))
      .innerJoin(forums, eq(files.forumId, forums.id))
        .leftJoin(forumMembers, and(
          eq(forumMembers.forumId, forums.id),
          userId ? eq(forumMembers.userId, userId) : sql`1=0`
      ))
      
      if (forumId) {
        fileQuery = fileQuery.where(eq(files.forumId, forumId));
      }

      fileQuery = fileQuery.where(and(
        or(
          eq(forums.isPublic, true),
          userId ? eq(forums.creatorId, userId) : sql`1=0`,
          userId ? isNotNull(forumMembers.id) : sql`1=0`
        ),
        or(
          ilike(files.fileName, lowercaseQuery),
          and(isNotNull(files.metaTitle), ilike(files.metaTitle, lowercaseQuery)),
          and(isNotNull(files.metaDescription), ilike(files.metaDescription, lowercaseQuery)),
          and(isNotNull(files.keywords), ilike(files.keywords, lowercaseQuery)),
          and(isNotNull(files.adminNotes), ilike(files.adminNotes, lowercaseQuery)),
          exists(
            database.select()
              .from(fileTags)
              .innerJoin(tags, eq(fileTags.tagId, tags.id))
              .where(and(
                eq(fileTags.fileId, files.id),
                ilike(tags.name, lowercaseQuery)
              ))
          )
        )
      ))
      .limit(50);
      const fileResults = await fileQuery;

      // Search Messages
      // Match content or tags
      let messageQuery = database.select({
        message: messages,
        user: users,
        forum: forums
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .innerJoin(forums, eq(messages.forumId, forums.id))
        .leftJoin(forumMembers, and(
          eq(forumMembers.forumId, forums.id),
          userId ? eq(forumMembers.userId, userId) : sql`1=0`
      ))
      if (forumId) {
        messageQuery = messageQuery.where(eq(messages.forumId, forumId));
      }

      messageQuery = messageQuery.where(and(
        or(
          eq(forums.isPublic, true),
          userId ? eq(forums.creatorId, userId) : sql`1=0`,
          userId ? isNotNull(forumMembers.id) : sql`1=0`
        ),
        or(
          ilike(messages.content, lowercaseQuery),
          exists(
            database.select()
              .from(messageTags)
              .innerJoin(tags, eq(messageTags.tagId, tags.id))
              .where(and(
                eq(messageTags.messageId, messages.id),
                ilike(tags.name, lowercaseQuery)
              ))
          )
        )
      ))
      .limit(50);
      const messageResults = await messageQuery;

      // Also include forums for any files/messages matched in this shard so they appear in the list
      const forumMapLocal: Record<string, any> = {};
      forumResults.forEach(r => { forumMapLocal[r.forum.id] = r.forum; });
      fileResults.forEach((fr: any) => { if (fr.forum && !forumMapLocal[fr.forum.id]) forumMapLocal[fr.forum.id] = fr.forum; });
      messageResults.forEach((mr: any) => { if (mr.forum && !forumMapLocal[mr.forum.id]) forumMapLocal[mr.forum.id] = mr.forum; });
      return { forums: Object.values(forumMapLocal), files: fileResults, messages: messageResults };
    });

    // Merge results from all instances
    console.log(`[Search] Merging results from ${results.length} database instances`);
    let mergedForums = results.flatMap(r => r.forums);
    let mergedFiles = results.flatMap(r => r.files).map(r => ({ ...r.file, user: r.user, forum: r.forum }));
    const mergedMessages = results.flatMap(r => r.messages).map(r => ({ ...r.message, user: r.user, forum: r.forum }));

    // If any file or message belongs to a forum not present in mergedForums yet, include that forum
    const forumMap: Record<string, Forum> = {};
    mergedForums.forEach(f => { forumMap[(f as any).id] = f as any; });
    mergedFiles.forEach(f => {
      if (f && f.forum && !forumMap[f.forum.id]) forumMap[f.forum.id] = f.forum;
    });
    mergedMessages.forEach(m => {
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

  async resetAllUserData(userId: string): Promise<void> {
    console.log(`[Storage] Starting comprehensive data reset for user: ${userId}`);
    
    try {
      await dbManager.withReadWrite(async (db) => {
        // 1. Delete all partial uploads for the user
        const partialUploadsToDelete = await db
          .select()
          .from(partialUploads)
          .where(eq(partialUploads.userId, userId));
        
        if (partialUploadsToDelete.length > 0) {
          await db.delete(partialUploads).where(eq(partialUploads.userId, userId));
          console.log(`[Storage] Deleted ${partialUploadsToDelete.length} partial uploads for user ${userId}`);
        }

        // 2. Delete user's access requests  
        const accessRequestsToDelete = await db
          .select()
          .from(accessRequests)
          .where(eq(accessRequests.userId, userId));
          
        if (accessRequestsToDelete.length > 0) {
          await db.delete(accessRequests).where(eq(accessRequests.userId, userId));
          console.log(`[Storage] Deleted ${accessRequestsToDelete.length} access requests for user ${userId}`);
        }

        // 3. Remove user from all forums (except owned forums)
        const membershipToDelete = await db
          .select()
          .from(forumMembers)
          .where(eq(forumMembers.userId, userId));
          
        if (membershipToDelete.length > 0) {
          await db.delete(forumMembers).where(eq(forumMembers.userId, userId));
          console.log(`[Storage] Removed user ${userId} from ${membershipToDelete.length} forums`);
        }

        // 4. Delete user's search analytics
        await db.delete(searchAnalytics).where(eq(searchAnalytics.userId, userId));
        console.log(`[Storage] Cleared search analytics for user ${userId}`);
      });

      // 5. Clean up HLS transcoded files for user's uploaded videos
      await this.cleanupUserHLSFiles(userId);

      // 6. Clear user's session data from session store
      await this.clearUserSessions(userId);

      // 7. Cleanup any temporary files
      await this.cleanupUserTemporaryFiles(userId);

      console.log(`[Storage] ✅ Comprehensive data reset completed for user: ${userId}`);
      
    } catch (error) {
      console.error(`[Storage] ❌ Error during data reset for user ${userId}:`, error);
      throw error;
    }
  }

  private async cleanupUserHLSFiles(userId: string): Promise<void> {
    try {
      // Get all files uploaded by this user
      const userFiles = await dbManager.withReadWrite(async (db) => {
        return await db
          .select()
          .from(files)
          .where(eq(files.userId, userId));
      });

      for (const file of userFiles) {
        const hlsDir = path.join(process.cwd(), 'storage', 'hls', file.id);
        
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
      console.error('[Storage] Error during HLS cleanup:', error);
    }
  }

  private async clearUserSessions(userId: string): Promise<void> {
    try {
      // Clear all sessions for this user from the session store
      const sessionStore = this.sessionStore;
      
      if (sessionStore && typeof sessionStore.all === 'function') {
        sessionStore.all((err, sessions) => {
          if (err) {
            console.error('[Storage] Error getting sessions:', err);
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
      console.error('[Storage] Error during session cleanup:', error);
    }
  }

  private async cleanupUserTemporaryFiles(userId: string): Promise<void> {
    try {
      const tempDir = path.join(process.cwd(), 'temp');
      
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        let cleanedFiles = 0;
        
        for (const file of files) {
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
      console.error('[Storage] Error during temp file cleanup:', error);
    }
  }
}

export const storage = new DatabaseStorage();
