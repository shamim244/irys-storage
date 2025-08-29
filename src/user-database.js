/**
 * SQLite Database Manager for Multi-User Irys Upload Service
 * FIXED: Proper path handling and directory creation
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ FIXED: Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('📁 Created data directory:', dataDir);
}

// ✅ FIXED: Proper database path
const dbPath = path.join(dataDir, 'users.db');
console.log('📊 Database path:', dbPath);

// Initialize SQLite database with better error handling
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ SQLite connection failed:', err.message);
    console.log('🔧 Troubleshooting:');
    console.log('   1. Check directory permissions:', dataDir);
    console.log('   2. Ensure data directory exists');
    console.log('   3. Check disk space');
  } else {
    console.log('✅ Connected to SQLite database:', dbPath);
  }
});

// Create tables on initialization
const initializeDatabase = () => {
  const createTables = `
    -- User sessions table
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_uploads INTEGER DEFAULT 0,
      total_size_bytes INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active'
    );

    -- Upload history table
    CREATE TABLE IF NOT EXISTS upload_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      public_url TEXT NOT NULL,
      upload_time INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user_sessions (user_id)
    );

    -- Rate limiting table
    CREATE TABLE IF NOT EXISTS rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      request_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      endpoint TEXT,
      FOREIGN KEY (user_id) REFERENCES user_sessions (user_id)
    );

    -- Active uploads table
    CREATE TABLE IF NOT EXISTS active_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'uploading',
      FOREIGN KEY (user_id) REFERENCES user_sessions (user_id)
    );
  `;

  db.exec(createTables, (err) => {
    if (err) {
      console.error('❌ Database initialization failed:', err.message);
    } else {
      console.log('✅ Database tables initialized');
      createIndexes();
    }
  });
};

// Create performance indexes
const createIndexes = () => {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_upload_history_user_id ON upload_history(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_rate_limits_user_id_time ON rate_limits(user_id, request_time);',
    'CREATE INDEX IF NOT EXISTS idx_active_uploads_user_id ON active_uploads(user_id);'
  ];

  indexes.forEach(indexSQL => {
    db.run(indexSQL, (err) => {
      if (err) console.error('Index creation error:', err.message);
    });
  });
  
  console.log('✅ Database indexes created');
};

// User Management Functions
class UserManager {
  
  // Create or get user session
  static async createOrGetUser(userId, email = null) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO user_sessions (user_id, email) 
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET 
          last_activity = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      
      db.get(sql, [userId, email], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Record upload activity
  static async recordUpload(userId, uploadData) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Insert upload record
        const uploadSQL = `
          INSERT INTO upload_history 
          (user_id, transaction_id, file_name, file_size, file_type, public_url, upload_time)
          VALUES (?, ?, ?, ?, ?, ?, ?);
        `;
        
        db.run(uploadSQL, [
          userId,
          uploadData.transactionId,
          uploadData.fileName,
          uploadData.fileSize,
          uploadData.contentType,
          uploadData.publicURL,
          uploadData.uploadTime
        ], function(err) {
          if (err) {
            reject(err);
            return;
          }

          // Update user statistics
          const updateUserSQL = `
            UPDATE user_sessions 
            SET total_uploads = total_uploads + 1,
                total_size_bytes = total_size_bytes + ?,
                last_activity = CURRENT_TIMESTAMP
            WHERE user_id = ?;
          `;
          
          db.run(updateUserSQL, [uploadData.fileSize, userId], (err) => {
            if (err) {
              reject(err);
            } else {
              resolve({ uploadId: this.lastID });
            }
          });
        });
      });
    });
  }

  // Check rate limiting
  static async checkRateLimit(userId, ipAddress, timeWindowMs = 60000, maxRequests = 60) {
    return new Promise((resolve, reject) => {
      const cutoffTime = new Date(Date.now() - timeWindowMs).toISOString();
      
      const sql = `
        SELECT COUNT(*) as request_count
        FROM rate_limits 
        WHERE user_id = ? AND request_time > ?;
      `;
      
      db.get(sql, [userId, cutoffTime], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        const requestCount = row.request_count;
        const allowed = requestCount < maxRequests;
        
        if (allowed) {
          // Record this request
          const insertSQL = `
            INSERT INTO rate_limits (user_id, ip_address)
            VALUES (?, ?);
          `;
          
          db.run(insertSQL, [userId, ipAddress], (err) => {
            if (err) {
              reject(err);
            } else {
              resolve({
                allowed: true,
                remaining: maxRequests - requestCount - 1,
                resetTime: Date.now() + timeWindowMs
              });
            }
          });
        } else {
          resolve({
            allowed: false,
            remaining: 0,
            resetTime: Date.now() + timeWindowMs
          });
        }
      });
    });
  }

  // Track active uploads
  static async startUpload(userId, sessionId, fileName) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO active_uploads (user_id, session_id, file_name)
        VALUES (?, ?, ?);
      `;
      
      db.run(sql, [userId, sessionId, fileName], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ uploadSessionId: this.lastID });
        }
      });
    });
  }

  // Complete upload tracking
  static async completeUpload(uploadSessionId, status = 'completed') {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE active_uploads 
        SET status = ?
        WHERE id = ?;
      `;
      
      db.run(sql, [status, uploadSessionId], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  // Get user statistics
  static async getUserStats(userId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          u.user_id,
          u.total_uploads,
          u.total_size_bytes,
          u.created_at,
          u.last_activity,
          COUNT(a.id) as active_uploads
        FROM user_sessions u
        LEFT JOIN active_uploads a ON u.user_id = a.user_id AND a.status = 'uploading'
        WHERE u.user_id = ?
        GROUP BY u.user_id;
      `;
      
      db.get(sql, [userId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  // Get recent uploads for user
  static async getRecentUploads(userId, limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT transaction_id, file_name, file_size, file_type, public_url, upload_time, created_at
        FROM upload_history 
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?;
      `;
      
      db.all(sql, [userId, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}

// Initialize database on module load
initializeDatabase();

// Export database and manager
export { db, UserManager };

// If running directly, test the connection
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🧪 Testing database connection...');
  
  setTimeout(async () => {
    try {
      // Test creating a user
      const testUser = await UserManager.createOrGetUser('test-user', 'test@example.com');
      console.log('✅ Database test successful:', testUser);
      
      // Close database connection
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('✅ Database connection closed');
        }
        process.exit(0);
      });
    } catch (error) {
      console.error('❌ Database test failed:', error.message);
      process.exit(1);
    }
  }, 1000);
}
