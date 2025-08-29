/**
 * Enhanced Irys Upload Service with Multi-User Database Support
 * Supports both SQLite and JSON-based user management
 */

import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

// Import user managers
import { UserManager as SQLiteUserManager } from './user-database.js';
import JSONUserManager from './user-json-manager.js';

dotenv.config();

// Configuration
const CONFIG = {
  MAX_UPLOAD_SIZE: parseInt(process.env.MAX_UPLOAD_SIZE) || 2097152,
  MAX_CONCURRENT_UPLOADS: parseInt(process.env.MAX_CONCURRENT_UPLOADS) || 10,
  UPLOAD_TIMEOUT: parseInt(process.env.UPLOAD_TIMEOUT) || 30000,
  RATE_LIMIT_PER_MINUTE: parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 60,
  USE_SQLITE: process.env.USE_SQLITE === 'true' || true, // Default to SQLite
  PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY
};

// Initialize user manager based on configuration
const userManager = CONFIG.USE_SQLITE 
  ? SQLiteUserManager 
  : new JSONUserManager('./data');

console.log(`📊 Using ${CONFIG.USE_SQLITE ? 'SQLite' : 'JSON'} user management`);

// File type validation
const FILE_TYPES = {
  ".jpg": { mime: "image/jpeg", category: "image" },
  ".jpeg": { mime: "image/jpeg", category: "image" },
  ".png": { mime: "image/png", category: "image" },
  ".gif": { mime: "image/gif", category: "image" },
  ".webp": { mime: "image/webp", category: "image" },
  ".mp4": { mime: "video/mp4", category: "video" },
  ".mp3": { mime: "audio/mpeg", category: "audio" },
  ".json": { mime: "application/json", category: "document" }
};

// Connection pool for concurrent users
class ConnectionPool {
  constructor(maxConnections = 10) {
    this.pool = [];
    this.activeConnections = 0;
    this.maxConnections = maxConnections;
    this.waitingQueue = [];
  }

  async getConnection() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }

    if (this.activeConnections < this.maxConnections) {
      this.activeConnections++;
      const uploader = await Uploader(Solana).withWallet(CONFIG.PRIVATE_KEY);
      return uploader;
    }

    return new Promise((resolve) => {
      this.waitingQueue.push(resolve);
    });
  }

  releaseConnection(uploader) {
    if (this.waitingQueue.length > 0) {
      const waitingRequest = this.waitingQueue.shift();
      waitingRequest(uploader);
      return;
    }
    this.pool.push(uploader);
  }
}

const connectionPool = new ConnectionPool(CONFIG.MAX_CONCURRENT_UPLOADS);

// Enhanced upload function with user tracking
const uploadFileWithUserTracking = async (filePath, customTags = [], userId, ipAddress = 'unknown') => {
  const sessionId = crypto.randomUUID();
  const startTime = performance.now();

  try {
    // 1. Create or get user
    if (CONFIG.USE_SQLITE) {
      await userManager.createOrGetUser(userId);
    } else {
      userManager.createOrGetUser(userId);
    }

    // 2. Check rate limiting
    const rateCheck = CONFIG.USE_SQLITE
      ? await userManager.checkRateLimit(userId, ipAddress)
      : userManager.checkRateLimit(userId, ipAddress);

    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Remaining: ${rateCheck.remaining} requests`);
    }

    // 3. Validate file
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const fileType = FILE_TYPES[ext];

    if (!fileType) {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    if (stats.size > CONFIG.MAX_UPLOAD_SIZE) {
      throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
    }

    // 4. Track upload start
    let uploadSessionId;
    if (CONFIG.USE_SQLITE) {
      const session = await userManager.startUpload(userId, sessionId, path.basename(filePath));
      uploadSessionId = session.uploadSessionId;
    }

    // 5. Get connection and upload
    const uploader = await connectionPool.getConnection();
    
    try {
      const fileData = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);

      const tags = [
        { name: "Content-Type", value: fileType.mime },
        { name: "File-Name", value: fileName },
        { name: "File-Size", value: stats.size.toString() },
        { name: "User-ID", value: userId },
        { name: "Session-ID", value: sessionId },
        { name: "Upload-Time", value: Date.now().toString() },
        ...customTags
      ];

      const uploadPromise = uploader.upload(fileData, { tags });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Upload timeout')), CONFIG.UPLOAD_TIMEOUT)
      );

      const receipt = await Promise.race([uploadPromise, timeoutPromise]);
      const publicURL = `https://gateway.irys.xyz/${receipt.id}`;

      const uploadTime = Math.round(performance.now() - startTime);

      // 6. Record successful upload
      const uploadData = {
        transactionId: receipt.id,
        publicURL: publicURL,
        fileName: fileName,
        fileSize: stats.size,
        contentType: fileType.mime,
        uploadTime: uploadTime
      };

      if (CONFIG.USE_SQLITE) {
        await userManager.recordUpload(userId, uploadData);
        await userManager.completeUpload(uploadSessionId, 'completed');
      } else {
        userManager.recordUpload(userId, uploadData);
      }

      console.log(`✅ [${userId}] Upload successful: ${fileName} (${uploadTime}ms)`);

      return {
        success: true,
        ...uploadData,
        userId: userId,
        sessionId: sessionId,
        rateLimitRemaining: rateCheck.remaining - 1
      };

    } finally {
      connectionPool.releaseConnection(uploader);
    }

  } catch (error) {
    const uploadTime = Math.round(performance.now() - startTime);
    
    // Mark upload as failed if tracking was started
    if (CONFIG.USE_SQLITE && uploadSessionId) {
      await userManager.completeUpload(uploadSessionId, 'failed');
    }

    console.error(`❌ [${userId}] Upload failed (${uploadTime}ms):`, error.message);
    
    throw {
      success: false,
      error: error.message,
      userId: userId,
      uploadTime: uploadTime
    };
  }
};

// Multi-user token creation
const createTokenAssetsMultiUser = async (tokenData, userId, ipAddress = 'unknown') => {
  const sessionId = `token_${userId}_${Date.now()}`;
  console.log(`🪙 [${userId}] Creating token: ${tokenData.symbol}`);

  let metadataPath = null;

  try {
    // 1. Upload logo
    const logoResult = await uploadFileWithUserTracking(
      tokenData.logoPath,
      [
        { name: "Asset-Type", value: "token-logo" },
        { name: "Token-Symbol", value: tokenData.symbol },
        { name: "Token-Name", value: tokenData.name }
      ],
      userId,
      ipAddress
    );

    // 2. Create metadata
    const logoInfo = FILE_TYPES[path.extname(tokenData.logoPath).toLowerCase()];
    
    const metadata = {
      name: tokenData.name,
      symbol: tokenData.symbol,
      description: tokenData.description,
      image: logoResult.publicURL,
      external_url: tokenData.website || "",
      attributes: tokenData.attributes || [],
      properties: {
        files: [{
          uri: logoResult.publicURL,
          type: logoInfo.mime
        }],
        category: logoInfo.category,
        creators: tokenData.creators || []
      }
    };

    // 3. Create unique metadata file
    metadataPath = path.join('./temp', `metadata_${userId}_${Date.now()}.json`);
    
    // Ensure temp directory exists
    if (!fs.existsSync('./temp')) {
      fs.mkdirSync('./temp', { recursive: true });
    }
    
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // 4. Upload metadata
    const metadataResult = await uploadFileWithUserTracking(
      metadataPath,
      [
        { name: "Asset-Type", value: "token-metadata" },
        { name: "Token-Symbol", value: tokenData.symbol },
        { name: "Token-Name", value: tokenData.name }
      ],
      userId,
      ipAddress
    );

    console.log(`🎉 [${userId}] Token created successfully!`);

    return {
      success: true,
      logoURL: logoResult.publicURL,
      metadataURL: metadataResult.publicURL,
      logoTxId: logoResult.transactionId,
      metadataTxId: metadataResult.transactionId,
      logoType: logoInfo.mime,
      userId: userId,
      sessionId: sessionId
    };

  } catch (error) {
    console.error(`❌ [${userId}] Token creation failed:`, error.message);
    throw error;
  } finally {
    // Cleanup
    if (metadataPath && fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }
  }
};

// Get user dashboard data
const getUserDashboard = async (userId) => {
  try {
    if (CONFIG.USE_SQLITE) {
      const stats = await userManager.getUserStats(userId);
      const recentUploads = await userManager.getRecentUploads(userId, 10);
      return { stats, recentUploads };
    } else {
      const stats = userManager.getUserStats(userId);
      const recentUploads = userManager.getRecentUploads(userId, 10);
      return { stats, recentUploads };
    }
  } catch (error) {
    console.error('Error getting user dashboard:', error.message);
    return null;
  }
};

// Service health with user metrics
const getServiceHealth = async () => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: CONFIG.USE_SQLITE ? 'SQLite' : 'JSON',
    activeConnections: connectionPool.activeConnections,
    maxConnections: connectionPool.maxConnections,
    queueLength: connectionPool.waitingQueue.length,
    config: {
      maxUploadSize: `${(CONFIG.MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB`,
      rateLimitPerMinute: CONFIG.RATE_LIMIT_PER_MINUTE,
      uploadTimeout: `${CONFIG.UPLOAD_TIMEOUT / 1000}s`
    }
  };

  return health;
};

export {
  uploadFileWithUserTracking,
  createTokenAssetsMultiUser,
  getUserDashboard,
  getServiceHealth,
  userManager,
  CONFIG
};
