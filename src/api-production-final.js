/**
 * ========================================
 * FINAL WORKING IRYS API - EXPRESS 5 COMPATIBLE
 * ========================================
 * 
 * ✅ FIXED: Express 5 path-to-regexp errors
 * ✅ FIXED: IPv6 rate limiting compatibility  
 * ✅ Complete token creation workflow
 * ✅ Production ready with wallet address tracking
 */

import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// ========================================
// CONFIGURATION
// ========================================

const CONFIG = {
  MAX_UPLOAD_SIZE: parseInt(process.env.MAX_UPLOAD_SIZE) || 2097152, // 2MB
  RATE_LIMIT_PER_MINUTE: parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 100,
  UPLOAD_TIMEOUT: parseInt(process.env.UPLOAD_TIMEOUT) || 25000,
  PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
  NETWORK: process.env.IRYS_NETWORK || 'mainnet',
  TEMP_DIR: './temp'
};

// Ensure directories exist
if (!fs.existsSync(CONFIG.TEMP_DIR)) {
  fs.mkdirSync(CONFIG.TEMP_DIR, { recursive: true });
}

console.log(`🚀 Starting Irys API v2.0.3 (Express 5 Compatible)`);
console.log(`📊 Network: ${CONFIG.NETWORK}`);
console.log(`🔒 Max upload: ${(CONFIG.MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB`);

// ========================================
// ✅ FIXED: EXPRESS 5 COMPATIBLE MIDDLEWARE
// ========================================

// CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'https://yourdomain.com'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Wallet-Address', 'X-API-Key', 'Authorization']
}));

// ✅ FIXED: Express 5 compatible rate limiting (no custom keyGenerator)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: CONFIG.RATE_LIMIT_PER_MINUTE,
  message: { 
    error: 'Rate limit exceeded', 
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
  // ✅ NO custom keyGenerator - uses default IPv6-safe implementation
});

app.use(limiter);
app.use(express.json({ limit: '1mb' }));

// Wallet address extraction
const extractWalletAddress = (req, res, next) => {
  req.walletAddress = 
    req.headers['wallet-address'] || 
    req.headers['x-wallet-address'] || 
    req.headers['user-id'] ||
    null;

  req.userIP = req.ip || 'unknown';
  req.sessionId = crypto.randomUUID();

  // Require wallet for protected endpoints
  const protectedPaths = ['/upload', '/create-token', '/dashboard'];
  if (protectedPaths.some(path => req.path.startsWith(path)) && !req.walletAddress) {
    return res.status(400).json({
      error: 'Wallet address required',
      message: 'Please provide Wallet-Address header',
      example: 'Wallet-Address: 11111111111111111111111111111112'
    });
  }

  next();
};

app.use(extractWalletAddress);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const wallet = req.walletAddress?.slice(0,8) || 'anon';
    console.log(`${req.method} ${req.path} [${wallet}...] ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ========================================
// FILE UPLOAD CONFIGURATION
// ========================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: CONFIG.MAX_UPLOAD_SIZE,
    fieldSize: 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.mp3', '.pdf', '.json'];
    
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Supported: ${allowed.join(', ')}`));
    }
  }
});

// ========================================
// IRYS SERVICE IMPLEMENTATION
// ========================================

// Simple connection pool
const connectionPool = [];
let activeConnections = 0;
const maxConnections = 10;

const getConnection = async () => {
  if (connectionPool.length > 0) {
    return connectionPool.pop();
  }
  
  if (activeConnections < maxConnections) {
    activeConnections++;
    const uploader = await Uploader(Solana).withWallet(CONFIG.PRIVATE_KEY);
    console.log(`⚡ Connection ${activeConnections}/${maxConnections} created`);
    return uploader;
  }
  
  // Simple wait for available connection
  await new Promise(resolve => setTimeout(resolve, 100));
  return getConnection();
};

const releaseConnection = (connection) => {
  connectionPool.push(connection);
};

// File type detection
const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf',
    '.json': 'application/json'
  };
  return types[ext] || 'application/octet-stream';
};

// Core upload function
const uploadToIrys = async (filePath, walletAddress, customTags = []) => {
  const startTime = performance.now();
  let connection = null;

  try {
    connection = await getConnection();
    
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const contentType = getContentType(filePath);
    const fileSize = fs.statSync(filePath).size;
    
    const tags = [
      { name: "Content-Type", value: contentType },
      { name: "File-Name", value: fileName },
      { name: "File-Size", value: fileSize.toString() },
      { name: "Wallet-Address", value: walletAddress },
      { name: "Upload-Time", value: Date.now().toString() },
      ...customTags
    ];

    const uploadPromise = connection.upload(fileData, { tags });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Upload timeout')), CONFIG.UPLOAD_TIMEOUT)
    );

    const receipt = await Promise.race([uploadPromise, timeoutPromise]);
    const publicURL = `https://gateway.irys.xyz/${receipt.id}`;
    
    const uploadTime = Math.round(performance.now() - startTime);
    console.log(`✅ [${walletAddress.slice(0,8)}...] Uploaded ${fileName} in ${uploadTime}ms`);
    
    return {
      success: true,
      transactionId: receipt.id,
      publicURL,
      fileName,
      fileSize,
      contentType,
      uploadTime
    };

  } catch (error) {
    console.error(`❌ Upload failed [${walletAddress?.slice(0,8)}...]:`, error.message);
    throw error;
  } finally {
    if (connection) {
      releaseConnection(connection);
    }
  }
};

// ========================================
// API ENDPOINTS
// ========================================

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Irys Upload Service API',
    version: '2.0.3-EXPRESS5',
    status: 'running',
    endpoints: ['/upload', '/create-token', '/dashboard', '/health', '/docs'],
    timestamp: new Date().toISOString()
  });
});

// Single file upload
app.post('/upload', upload.single('file'), async (req, res) => {
  let tempFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'File required',
        message: 'Please upload a file using the "file" field',
        maxSize: `${(CONFIG.MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB`
      });
    }

    // Save to unique temp file
    tempFilePath = path.join(CONFIG.TEMP_DIR, `${req.sessionId}_${req.file.originalname}`);
    fs.writeFileSync(tempFilePath, req.file.buffer);

    // Upload to Irys
    const result = await uploadToIrys(tempFilePath, req.walletAddress, [
      { name: 'Upload-Method', value: 'API' },
      { name: 'Session-ID', value: req.sessionId }
    ]);

    res.json({
      success: true,
      file: {
        transactionId: result.transactionId,
        publicURL: result.publicURL,
        fileName: result.fileName,
        fileSize: result.fileSize,
        contentType: result.contentType
      },
      wallet: {
        address: req.walletAddress,
        sessionId: req.sessionId
      },
      performance: {
        uploadTime: result.uploadTime
      },
      network: CONFIG.NETWORK
    });

  } catch (error) {
    console.error('Upload API error:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      wallet: req.walletAddress
    });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

// Token creation (main feature)
app.post('/create-token', upload.single('logo'), async (req, res) => {
  let logoPath = null;
  let metadataPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Logo file required',
        message: 'Please upload a logo file using the "logo" field'
      });
    }

    // Validate required fields
    const { name, symbol, description } = req.body;
    if (!name || !symbol || !description) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['name', 'symbol', 'description'],
        received: { name: !!name, symbol: !!symbol, description: !!description }
      });
    }

    // Save logo to unique temp file
    logoPath = path.join(CONFIG.TEMP_DIR, `logo_${req.sessionId}_${req.file.originalname}`);
    fs.writeFileSync(logoPath, req.file.buffer);

    const tokenData = {
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      description: description.trim(),
      website: req.body.website?.trim() || ""
    };

    console.log(`🪙 Creating token ${tokenData.symbol} for ${req.walletAddress.slice(0,8)}...`);

    // 1. Upload logo
    const logoResult = await uploadToIrys(logoPath, req.walletAddress, [
      { name: 'Asset-Type', value: 'token-logo' },
      { name: 'Token-Symbol', value: tokenData.symbol },
      { name: 'Token-Name', value: tokenData.name }
    ]);

    // 2. Create metadata with dynamic type detection
    const logoContentType = getContentType(logoPath);
    const metadata = {
      name: tokenData.name,
      symbol: tokenData.symbol,
      description: tokenData.description,
      image: logoResult.publicURL,
      external_url: tokenData.website,
      attributes: JSON.parse(req.body.attributes || '[]'),
      properties: {
        files: [{
          uri: logoResult.publicURL,
          type: logoContentType // ✅ Correct dynamic type
        }],
        category: logoContentType.startsWith('image/') ? 'image' : 'file',
        creators: JSON.parse(req.body.creators || '[]')
      }
    };

    // 3. Upload metadata
    metadataPath = path.join(CONFIG.TEMP_DIR, `metadata_${req.sessionId}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    const metadataResult = await uploadToIrys(metadataPath, req.walletAddress, [
      { name: 'Asset-Type', value: 'token-metadata' },
      { name: 'Token-Symbol', value: tokenData.symbol },
      { name: 'Token-Name', value: tokenData.name }
    ]);

    console.log(`🎉 Token ${tokenData.symbol} created successfully!`);

    res.json({
      success: true,
      token: {
        name: tokenData.name,
        symbol: tokenData.symbol,
        logoURL: logoResult.publicURL,
        metadataURL: metadataResult.publicURL,
        logoType: logoContentType
      },
      wallet: {
        address: req.walletAddress,
        sessionId: req.sessionId
      },
      irys: {
        logoTxId: logoResult.transactionId,
        metadataTxId: metadataResult.transactionId,
        network: CONFIG.NETWORK
      },
      performance: {
        logoUploadTime: logoResult.uploadTime,
        metadataUploadTime: metadataResult.uploadTime,
        totalTime: logoResult.uploadTime + metadataResult.uploadTime
      },
      metadata: metadata
    });

  } catch (error) {
    console.error('Token creation error:', error.message);
    
    const statusCode = error.message.includes('timeout') ? 408 :
                      error.message.includes('too large') ? 413 :
                      error.message.includes('Rate limit') ? 429 : 500;

    res.status(statusCode).json({
      success: false,
      error: error.message,
      wallet: req.walletAddress,
      timestamp: new Date().toISOString()
    });
  } finally {
    // Cleanup temp files
    if (logoPath && fs.existsSync(logoPath)) {
      fs.unlinkSync(logoPath);
    }
    if (metadataPath && fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }
  }
});

// Dashboard endpoint
app.get('/dashboard', async (req, res) => {
  try {
    res.json({
      success: true,
      wallet: {
        address: req.walletAddress,
        masked: req.walletAddress.slice(0,8) + '...' + req.walletAddress.slice(-4)
      },
      dashboard: {
        message: 'Dashboard functionality ready for database integration',
        features: ['Upload tracking', 'Token management', 'Analytics'],
        totalUploads: 'To be implemented with database',
        recentTokens: 'To be implemented with database'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      wallet: req.walletAddress
    });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.3-EXPRESS5-COMPATIBLE',
      network: CONFIG.NETWORK,
      compatibility: 'Express 5.x',
      performance: {
        activeConnections: activeConnections,
        maxConnections: maxConnections,
        poolSize: connectionPool.length,
        maxUploadSize: `${(CONFIG.MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB`,
        rateLimitPerMinute: CONFIG.RATE_LIMIT_PER_MINUTE,
        uploadTimeout: `${CONFIG.UPLOAD_TIMEOUT / 1000}s`
      },
      features: [
        'Single file upload (/upload)',
        'Token creation (/create-token)', 
        'Wallet address tracking',
        'Connection pooling',
        'Rate limiting (Express 5 compatible)',
        'Dynamic file type detection',
        'Automatic cleanup'
      ]
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API documentation
app.get('/docs', (req, res) => {
  res.json({
    name: 'Irys Upload Service API Documentation',
    version: '2.0.3-EXPRESS5',
    description: 'Production-ready file upload service with wallet-based user management',
    compatibility: 'Express 5.x compatible',
    baseURL: `http://localhost:${process.env.PORT || 3000}`,
    endpoints: {
      'GET /': 'API information',
      'POST /upload': {
        description: 'Upload a single file',
        headers: { 'Wallet-Address': 'Required Solana wallet address' },
        body: { file: 'multipart/form-data file' },
        response: { success: true, file: {}, wallet: {}, performance: {} }
      },
      'POST /create-token': {
        description: 'Create Solana token assets (logo + metadata)',
        headers: { 'Wallet-Address': 'Required Solana wallet address' },
        body: { 
          logo: 'multipart/form-data file (required)',
          name: 'string (required)',
          symbol: 'string (required)', 
          description: 'string (required)',
          website: 'string (optional)',
          attributes: 'JSON string (optional)',
          creators: 'JSON string (optional)'
        },
        response: { success: true, token: {}, wallet: {}, irys: {}, metadata: {} }
      },
      'GET /dashboard': {
        description: 'Get user dashboard (requires database integration)',
        headers: { 'Wallet-Address': 'Required Solana wallet address' },
        response: { success: true, wallet: {}, dashboard: {} }
      },
      'GET /health': {
        description: 'Service health check and performance metrics',
        response: { status: 'healthy', performance: {}, features: [] }
      },
      'GET /docs': {
        description: 'This API documentation',
        response: { endpoints: {}, examples: {} }
      }
    },
    examples: {
      upload_curl: 'curl -X POST -H "Wallet-Address: 11111...1112" -F "file=@image.jpg" http://localhost:3000/upload',
      token_curl: 'curl -X POST -H "Wallet-Address: 11111...1112" -F "logo=@logo.png" -F "name=My Token" -F "symbol=MT" -F "description=Test token" http://localhost:3000/create-token',
      health_curl: 'curl http://localhost:3000/health',
      dashboard_curl: 'curl -H "Wallet-Address: 11111...1112" http://localhost:3000/dashboard'
    },
    supportedFileTypes: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.mp3', '.pdf', '.json']
  });
});

// ✅ FIXED: Express 5 compatible 404 handler (no wildcard)
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    available: ['/', '/upload', '/create-token', '/dashboard', '/health', '/docs'],
    message: 'Check /docs for complete API documentation'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('API Error:', error.message);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large',
        maxSize: `${(CONFIG.MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB`
      });
    }
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// ========================================
// START SERVER
// ========================================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 Irys API v2.0.3 (Express 5) running on ${HOST}:${PORT}`);
  console.log(`📊 Network: ${CONFIG.NETWORK}`);
  console.log(`🔒 Max upload: ${(CONFIG.MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB`);
  console.log(`⏱️  Rate limit: ${CONFIG.RATE_LIMIT_PER_MINUTE} requests/minute`);
  console.log(`📖 Documentation: http://${HOST}:${PORT}/docs`);
  console.log(`❤️  Health check: http://${HOST}:${PORT}/health`);
  console.log(`✅ Express 5 compatible - no more path-to-regexp errors!`);
});
