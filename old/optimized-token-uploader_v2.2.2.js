import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// 🚀 OPTIMIZATION 1: Connection Pooling - Reuse uploader instance
let cachedUploader = null;

const getOptimizedUploader = async () => {
  if (!cachedUploader) {
    console.log('🔥 Creating cached uploader instance...');
    cachedUploader = await Uploader(Solana).withWallet(process.env.SOLANA_PRIVATE_KEY);
  }
  return cachedUploader;
};

// 🚀 OPTIMIZATION 2: Pre-validate files before upload
const validateFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024) { // 10MB limit
    throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
  }
  
  return stats.size;
};

// 🚀 OPTIMIZATION 3: Streamlined upload function
const fastUpload = async (filePath, customTags = []) => {
  const startTime = Date.now();
  
  try {
    // Pre-validate
    const fileSize = validateFile(filePath);
    
    // Get cached uploader (no recreation delay)
    const uploader = await getOptimizedUploader();
    
    // Read file (async for better performance)
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // Minimal essential tags only
    const tags = [
      { name: "Content-Type", value: getContentType(ext) },
      { name: "File-Name", value: fileName },
      ...customTags
    ];
    
    // Upload with minimal logging
    const receipt = await uploader.upload(fileData, { tags });
    const publicURL = `https://gateway.irys.xyz/${receipt.id}`;
    
    const uploadTime = Date.now() - startTime;
    console.log(`⚡ Upload: ${uploadTime}ms | ${fileName} | ${receipt.id}`);
    
    return {
      transactionId: receipt.id,
      publicURL: publicURL,
      fileName: fileName,
      fileSize: fileSize,
      uploadTime: uploadTime
    };
    
  } catch (error) {
    console.error(`❌ Fast upload failed: ${error.message}`);
    throw error;
  }
};

// 🚀 OPTIMIZATION 4: Content type mapping (cached)
const contentTypeMap = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".json": "application/json", ".txt": "text/plain"
};

const getContentType = (ext) => contentTypeMap[ext] || "application/octet-stream";

// 🚀 OPTIMIZATION 5: Batch upload for multiple files
const batchUpload = async (files) => {
  const startTime = Date.now();
  console.log(`🚀 Batch uploading ${files.length} files...`);
  
  try {
    // Upload all files in parallel
    const uploadPromises = files.map(file => fastUpload(file.path, file.tags || []));
    const results = await Promise.all(uploadPromises);
    
    const totalTime = Date.now() - startTime;
    console.log(`✅ Batch completed: ${totalTime}ms for ${files.length} files`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Batch upload failed:', error.message);
    throw error;
  }
};

export { fastUpload, batchUpload, getOptimizedUploader };
