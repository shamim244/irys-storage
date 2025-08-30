import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// 🔒 CONFIGURABLE SIZE LIMITS FROM .env
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE) || 2097152; // 2MB default
const MAX_IMAGE_SIZE = parseInt(process.env.MAX_IMAGE_SIZE) || 2097152;   // 2MB default
const MAX_VIDEO_SIZE = parseInt(process.env.MAX_VIDEO_SIZE) || 10485760;  // 10MB default
const MAX_AUDIO_SIZE = parseInt(process.env.MAX_AUDIO_SIZE) || 5242880;   // 5MB default
const UPLOAD_TIMEOUT = parseInt(process.env.UPLOAD_TIMEOUT) || 30000;     // 30s default

console.log(`🔒 Upload restrictions loaded: ${(MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB max size`);

// 🎯 COMPREHENSIVE FILE TYPE MAPPING
const FILE_TYPES = {
  // Images
  ".jpg": { mime: "image/jpeg", type: "image/jpeg", category: "image" },
  ".jpeg": { mime: "image/jpeg", type: "image/jpeg", category: "image" },
  ".png": { mime: "image/png", type: "image/png", category: "image" },
  ".gif": { mime: "image/gif", type: "image/gif", category: "image" },
  ".webp": { mime: "image/webp", type: "image/webp", category: "image" },
  ".svg": { mime: "image/svg+xml", type: "image/svg+xml", category: "image" },
  ".bmp": { mime: "image/bmp", type: "image/bmp", category: "image" },
  
  // Videos
  ".mp4": { mime: "video/mp4", type: "video/mp4", category: "video" },
  ".mov": { mime: "video/quicktime", type: "video/quicktime", category: "video" },
  ".webm": { mime: "video/webm", type: "video/webm", category: "video" },
  
  // Audio
  ".mp3": { mime: "audio/mpeg", type: "audio/mpeg", category: "audio" },
  ".wav": { mime: "audio/wav", type: "audio/wav", category: "audio" },
  ".flac": { mime: "audio/flac", type: "audio/flac", category: "audio" },
  
  // Documents
  ".json": { mime: "application/json", type: "application/json", category: "document" }
};

// 🚀 CONNECTION POOLING
let cachedUploader = null;

const getUploader = async () => {
  if (!cachedUploader) {
    console.log('🔥 Creating cached uploader instance...');
    cachedUploader = await Uploader(Solana).withWallet(process.env.SOLANA_PRIVATE_KEY);
  }
  return cachedUploader;
};

// 🔒 ENHANCED FILE VALIDATION WITH SIZE RESTRICTIONS
const validateAndDetectFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const stats = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const fileType = FILE_TYPES[ext];
  
  if (!fileType) {
    throw new Error(`Unsupported file type: ${ext}`);
  }
  
  // 🔒 APPLY SIZE RESTRICTIONS BASED ON FILE TYPE
  let maxAllowedSize;
  
  switch (fileType.category) {
    case 'image':
      maxAllowedSize = Math.min(MAX_IMAGE_SIZE, MAX_UPLOAD_SIZE);
      break;
    case 'video':
      maxAllowedSize = Math.min(MAX_VIDEO_SIZE, MAX_UPLOAD_SIZE);
      break;
    case 'audio':
      maxAllowedSize = Math.min(MAX_AUDIO_SIZE, MAX_UPLOAD_SIZE);
      break;
    default:
      maxAllowedSize = MAX_UPLOAD_SIZE;
  }
  
  if (stats.size > maxAllowedSize) {
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    const maxSizeMB = (maxAllowedSize / 1024 / 1024).toFixed(2);
    throw new Error(`File too large: ${fileSizeMB}MB (max allowed: ${maxSizeMB}MB for ${fileType.category} files)`);
  }
  
  console.log(`✅ File validated: ${path.basename(filePath)} (${(stats.size / 1024).toFixed(1)}KB) - ${fileType.type}`);
  
  return {
    size: stats.size,
    type: fileType,
    category: fileType.category,
    maxAllowed: maxAllowedSize
  };
};

// 🚀 OPTIMIZED UPLOAD FUNCTION WITH TIMEOUT
const uploadFile = async (filePath, customTags = []) => {
  const startTime = Date.now();
  
  try {
    // Validate file with size restrictions
    const fileInfo = validateAndDetectFile(filePath);
    const uploader = await getUploader();
    
    // Read file
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    // Essential tags with size info
    const tags = [
      { name: "Content-Type", value: fileInfo.type.mime },
      { name: "File-Name", value: fileName },
      { name: "File-Size", value: fileInfo.size.toString() },
      { name: "File-Category", value: fileInfo.category },
      { name: "Max-Size-Policy", value: `${(fileInfo.maxAllowed / 1024 / 1024).toFixed(1)}MB` },
      { name: "Upload-Time", value: new Date().toISOString() },
      ...customTags
    ];
    
    // Upload with timeout handling
    const uploadPromise = uploader.upload(fileData, { tags });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Upload timeout')), UPLOAD_TIMEOUT)
    );
    
    const receipt = await Promise.race([uploadPromise, timeoutPromise]);
    const publicURL = `https://gateway.irys.xyz/${receipt.id}`;
    
    const uploadTime = Date.now() - startTime;
    console.log(`⚡ Upload: ${uploadTime}ms | ${fileName} (${fileInfo.type.type}) | ${receipt.id}`);
    
    return {
      transactionId: receipt.id,
      publicURL: publicURL,
      fileName: fileName,
      fileSize: fileInfo.size,
      contentType: fileInfo.type.type,
      category: fileInfo.category,
      uploadTime: uploadTime,
      sizeCompliant: true
    };
    
  } catch (error) {
    if (error.message === 'Upload timeout') {
      console.error(`❌ Upload timeout after ${UPLOAD_TIMEOUT}ms`);
    }
    console.error(`❌ Upload failed: ${error.message}`);
    throw error;
  }
};

// 🎯 TOKEN CREATOR WITH SIZE VALIDATION
const createTokenAssets = async (tokenData) => {
  console.log('🪙 Creating Solana Token Assets...');
  console.log(`🔒 Size limit: ${(MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB per file`);
  
  const startTime = Date.now();
  
  try {
    // Pre-validate logo size before processing
    const logoInfo = validateAndDetectFile(tokenData.logoPath);
    console.log(`📸 Logo validated: ${logoInfo.type.type} (${(logoInfo.size / 1024).toFixed(1)}KB)`);
    
    // Create metadata structure
    const metadata = {
      name: tokenData.name,
      symbol: tokenData.symbol,
      description: tokenData.description,
      image: "",
      external_url: tokenData.website || "",
      attributes: tokenData.attributes || [],
      properties: {
        files: [{
          uri: "",
          type: logoInfo.type.type
        }],
        category: logoInfo.category,
        creators: tokenData.creators || [],
        file_size: logoInfo.size,
        size_compliant: true
      }
    };
    
    // Upload logo
    console.log(`📸 Uploading ${logoInfo.type.type} logo...`);
    const logoResult = await uploadFile(tokenData.logoPath, [
      { name: "Asset-Type", value: "token-logo" },
      { name: "Token-Symbol", value: tokenData.symbol },
      { name: "Token-Name", value: tokenData.name },
      { name: "Size-Validated", value: "true" }
    ]);
    
    // Update metadata with logo URL
    metadata.image = logoResult.publicURL;
    metadata.properties.files[0].uri = logoResult.publicURL;
    
    // Create and upload metadata
    const metadataPath = `./temp_metadata_${Date.now()}.json`;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    console.log('📄 Uploading token metadata...');
    const metadataResult = await uploadFile(metadataPath, [
      { name: "Asset-Type", value: "token-metadata" },
      { name: "Token-Symbol", value: tokenData.symbol },
      { name: "Logo-Size", value: logoInfo.size.toString() }
    ]);
    
    // Cleanup
    fs.unlinkSync(metadataPath);
    
    const totalTime = Date.now() - startTime;
    console.log(`🎉 Token assets ready in ${totalTime}ms!`);
    
    return {
      success: true,
      logoURL: logoResult.publicURL,
      metadataURL: metadataResult.publicURL,
      logoTxId: logoResult.transactionId,
      metadataTxId: metadataResult.transactionId,
      logoType: logoInfo.type.type,
      logoSize: logoInfo.size,
      category: logoInfo.category,
      sizeCompliant: true,
      maxSizeAllowed: (logoInfo.maxAllowed / 1024 / 1024).toFixed(1) + 'MB',
      totalTime: totalTime
    };
    
  } catch (error) {
    console.error('❌ Token creation failed:', error.message);
    return {
      success: false,
      error: error.message,
      sizeRestriction: `${(MAX_UPLOAD_SIZE / 1024 / 1024).toFixed(1)}MB`
    };
  }
};

// 🔒 SIZE CHECK UTILITY
const checkFileSize = (filePath) => {
  try {
    const fileInfo = validateAndDetectFile(filePath);
    return {
      valid: true,
      size: fileInfo.size,
      sizeMB: (fileInfo.size / 1024 / 1024).toFixed(2),
      category: fileInfo.category,
      maxAllowed: (fileInfo.maxAllowed / 1024 / 1024).toFixed(1) + 'MB'
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
};

// Export functions
export { 
  createTokenAssets,
  uploadFile,
  checkFileSize,
  FILE_TYPES,
  MAX_UPLOAD_SIZE,
  MAX_IMAGE_SIZE
};
