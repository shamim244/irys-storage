import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// ✅ CORRECT: Create uploader function following official docs pattern
const getIrysUploader = async () => {
  const irysUploader = await Uploader(Solana).withWallet(process.env.SOLANA_PRIVATE_KEY);
  return irysUploader;
};

async function uploadToMainnet(filePath) {
  try {
    console.log('💎 Connecting to Irys MAINNET...');
    
    // ✅ FIXED: Use the correct pattern from docs
    const irysUploader = await getIrysUploader();

    // Read and prepare file
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Content type mapping
    const contentTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg", 
      ".png": "image/png",
      ".gif": "image/gif",
      ".pdf": "application/pdf",
      ".txt": "text/plain",
      ".json": "application/json",
      ".mp4": "video/mp4"
    };

    const contentType = contentTypes[ext] || "application/octet-stream";

    // File tags
    const tags = [
      { name: "Content-Type", value: contentType },
      { name: "File-Name", value: fileName },
      { name: "Environment", value: "mainnet" },
      { name: "Upload-Client", value: "JavaScript-Node" },
      { name: "Storage-Type", value: "Permanent" },
      { name: "Upload-Time", value: new Date().toISOString() }
    ];

    console.log(`🚀 Uploading ${fileName} to MAINNET...`);
    console.log(`📁 File size: ${(fileData.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`💰 Cost: ~0.0019 SOL from your Irys balance`);

    // ✅ CORRECT: Upload directly using the uploader instance
    const receipt = await irysUploader.upload(fileData, { tags });
    const publicURL = `https://gateway.irys.xyz/${receipt.id}`;

    console.log('\n✅ MAINNET Upload Successful!');
    console.log(`📊 Transaction ID: ${receipt.id}`);
    console.log(`🌐 PERMANENT URL: ${publicURL}`);
    console.log(`🔒 Storage: Forever accessible!`);

    return {
      success: true,
      transactionId: receipt.id,
      publicURL: publicURL,
      fileName: fileName,
      fileSize: fileData.length,
      cost: '~0.0019 SOL',
      permanent: true
    };

  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    
    if (error.message.includes('balance') || error.message.includes('402')) {
      console.log('\n💡 Solution: Fund your Irys mainnet account:');
      console.log(`   irys fund 3000000 -t solana -w ${process.env.SOLANA_PRIVATE_KEY} --provider-url https://api.mainnet-beta.solana.com -n mainnet`);
    }
    
    throw error;
  }
}

// Main execution
async function main() {
  try {
    const result = await uploadToMainnet('./cat.jpg');
    
    console.log('\n🎉 SUCCESS! Your file is permanently stored on mainnet!');
    console.log(`🌍 Access globally: ${result.publicURL}`);
    console.log('💎 This URL will work forever!');
    
  } catch (error) {
    console.error('Script failed:', error.message);
    process.exit(1);
  }
}

// Run the upload
main();
