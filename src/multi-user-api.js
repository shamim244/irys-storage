import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { 
  createTokenAssetsMultiUser, 
  getUserDashboard, 
  getServiceHealth,
  CONFIG 
} from './irys-multiuser-service.js';

const app = express();

// ✅ FIXED: IPv6-compatible rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: CONFIG.RATE_LIMIT_PER_MINUTE || 6000,
  message: { error: 'Too many requests, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ REMOVED: Custom keyGenerator to use default IPv6-safe implementation
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests, please try again later',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  }
});

app.use(limiter);
app.use(express.json({ limit: '1mb' }));

// Middleware to extract user ID
const extractUserId = (req, res, next) => {
  req.userId = req.headers['user-id'] || req.headers['x-user-id'] || uuidv4();
  req.userIP = req.ip || req.connection.remoteAddress || 'unknown';
  next();
};

app.use(extractUserId);

// ✅ FIXED: Ensure temp directory exists
if (!fs.existsSync('./temp')) {
  fs.mkdirSync('./temp', { recursive: true });
  console.log('📁 Created temp directory');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CONFIG.MAX_UPLOAD_SIZE || 2097152 }
});

// Create token endpoint
app.post('/create-token', upload.single('logo'), async (req, res) => {
  let logoPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Logo file required',
        maxSize: `${((CONFIG.MAX_UPLOAD_SIZE || 2097152) / 1024 / 1024).toFixed(1)}MB`
      });
    }

    // Save uploaded file with unique name
    logoPath = `./temp/${req.userId}_${Date.now()}_${req.file.originalname}`;
    fs.writeFileSync(logoPath, req.file.buffer);

    const tokenData = {
      name: req.body.name,
      symbol: req.body.symbol,
      description: req.body.description,
      logoPath: logoPath,
      website: req.body.website,
      attributes: JSON.parse(req.body.attributes || '[]'),
      creators: JSON.parse(req.body.creators || '[]')
    };

    const result = await createTokenAssetsMultiUser(tokenData, req.userId, req.userIP);

    // Cleanup temp file
    fs.unlinkSync(logoPath);

    res.json({
      success: true,
      token: {
        name: tokenData.name,
        symbol: tokenData.symbol,
        logoURL: result.logoURL,
        metadataURL: result.metadataURL,
        logoType: result.logoType
      },
      user: {
        userId: req.userId,
        sessionId: result.sessionId
      },
      irys: {
        logoTxId: result.logoTxId,
        metadataTxId: result.metadataTxId
      }
    });

  } catch (error) {
    // Cleanup on error
    if (logoPath && fs.existsSync(logoPath)) {
      fs.unlinkSync(logoPath);
    }

    console.error(`❌ API Error [${req.userId}]:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Upload failed',
      userId: req.userId
    });
  }
});

// Health endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await getServiceHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// User dashboard endpoint
app.get('/dashboard', async (req, res) => {
  try {
    const dashboard = await getUserDashboard(req.userId);
    
    res.json({
      success: true,
      userId: req.userId,
      dashboard: dashboard
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      userId: req.userId
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Multi-User Irys API running on port ${PORT}`);
  console.log(`📊 Database: SQLite`);
  console.log(`🔒 Max upload: ${((CONFIG.MAX_UPLOAD_SIZE || 2097152) / 1024 / 1024).toFixed(1)}MB`);
  console.log(`⏱️  Rate limit: ${CONFIG.RATE_LIMIT_PER_MINUTE || 6000} requests/minute`);
});
