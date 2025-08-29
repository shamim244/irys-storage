/**
 * JSON-Based User Manager for Lightweight Multi-User Support
 * Good for development and small-scale production
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

class JSONUserManager {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.usersFile = path.join(dataDir, 'users.json');
    this.uploadsFile = path.join(dataDir, 'uploads.json');
    this.rateLimitsFile = path.join(dataDir, 'rate_limits.json');
    
    this.ensureDataDir();
    this.loadData();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  loadData() {
    // Load users
    try {
      this.users = fs.existsSync(this.usersFile) 
        ? JSON.parse(fs.readFileSync(this.usersFile, 'utf8'))
        : {};
    } catch (error) {
      console.error('Error loading users:', error.message);
      this.users = {};
    }

    // Load uploads
    try {
      this.uploads = fs.existsSync(this.uploadsFile)
        ? JSON.parse(fs.readFileSync(this.uploadsFile, 'utf8'))
        : {};
    } catch (error) {
      console.error('Error loading uploads:', error.message);
      this.uploads = {};
    }

    // Load rate limits
    try {
      this.rateLimits = fs.existsSync(this.rateLimitsFile)
        ? JSON.parse(fs.readFileSync(this.rateLimitsFile, 'utf8'))
        : {};
    } catch (error) {
      console.error('Error loading rate limits:', error.message);
      this.rateLimits = {};
    }
  }

  saveData() {
    try {
      fs.writeFileSync(this.usersFile, JSON.stringify(this.users, null, 2));
      fs.writeFileSync(this.uploadsFile, JSON.stringify(this.uploads, null, 2));
      fs.writeFileSync(this.rateLimitsFile, JSON.stringify(this.rateLimits, null, 2));
    } catch (error) {
      console.error('Error saving data:', error.message);
    }
  }

  // Create or get user
  createOrGetUser(userId, email = null) {
    if (!this.users[userId]) {
      this.users[userId] = {
        userId: userId,
        email: email,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        totalUploads: 0,
        totalSizeBytes: 0,
        status: 'active'
      };
    } else {
      this.users[userId].lastActivity = new Date().toISOString();
    }
    
    this.saveData();
    return this.users[userId];
  }

  // Record upload
  recordUpload(userId, uploadData) {
    // Initialize user uploads array if needed
    if (!this.uploads[userId]) {
      this.uploads[userId] = [];
    }

    // Add upload record
    const uploadRecord = {
      id: crypto.randomUUID(),
      transactionId: uploadData.transactionId,
      fileName: uploadData.fileName,
      fileSize: uploadData.fileSize,
      contentType: uploadData.contentType,
      publicURL: uploadData.publicURL,
      uploadTime: uploadData.uploadTime,
      createdAt: new Date().toISOString()
    };

    this.uploads[userId].push(uploadRecord);

    // Update user statistics
    if (this.users[userId]) {
      this.users[userId].totalUploads += 1;
      this.users[userId].totalSizeBytes += uploadData.fileSize;
      this.users[userId].lastActivity = new Date().toISOString();
    }

    this.saveData();
    return uploadRecord;
  }

  // Check rate limit
  checkRateLimit(userId, ipAddress, timeWindowMs = 60000, maxRequests = 60) {
    const now = Date.now();
    const cutoffTime = now - timeWindowMs;

    // Initialize rate limits for user if needed
    if (!this.rateLimits[userId]) {
      this.rateLimits[userId] = [];
    }

    // Remove old requests
    this.rateLimits[userId] = this.rateLimits[userId].filter(
      request => request.timestamp > cutoffTime
    );

    const requestCount = this.rateLimits[userId].length;
    
    if (requestCount >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + timeWindowMs
      };
    }

    // Record this request
    this.rateLimits[userId].push({
      timestamp: now,
      ipAddress: ipAddress
    });

    this.saveData();

    return {
      allowed: true,
      remaining: maxRequests - requestCount - 1,
      resetTime: now + timeWindowMs
    };
  }

  // Get user statistics
  getUserStats(userId) {
    const user = this.users[userId];
    if (!user) return null;

    const userUploads = this.uploads[userId] || [];
    
    return {
      userId: user.userId,
      totalUploads: user.totalUploads,
      totalSizeBytes: user.totalSizeBytes,
      createdAt: user.createdAt,
      lastActivity: user.lastActivity,
      recentUploads: userUploads.slice(-5) // Last 5 uploads
    };
  }

  // Get recent uploads
  getRecentUploads(userId, limit = 10) {
    const userUploads = this.uploads[userId] || [];
    return userUploads
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  // Cleanup old data
  cleanup(daysOld = 30) {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

    // Clean rate limits
    Object.keys(this.rateLimits).forEach(userId => {
      this.rateLimits[userId] = this.rateLimits[userId].filter(
        request => request.timestamp > cutoffTime
      );
    });

    console.log(`✅ Cleaned up data older than ${daysOld} days`);
    this.saveData();
  }
}

export default JSONUserManager;
