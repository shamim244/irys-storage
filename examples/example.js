import { createTokenAssets, createMultipleTokens } from './irys-token-creator.js';

// Single token creation
const createSingleToken = async () => {
  const tokenData = {
    name: "My Awesome Token",
    symbol: "MAT",
    description: "The most awesome token on Solana",
    logoPath: "./dog.jpg", // ✅ Automatically detects as image/jpeg
    website: "https://myawesometoken.com",
    attributes: [
      { trait_type: "Type", value: "Utility" },
      { trait_type: "Network", value: "Solana" }
    ]
  };
  
  const result = await createTokenAssets(tokenData);
  
  if (result.success) {
    console.log('\n🎉 Token Created Successfully!');
    console.log(`🌐 Logo URL: ${result.logoURL}`);
    console.log(`📄 Metadata URL: ${result.metadataURL}`);
    console.log(`⚡ Total Time: ${result.totalTime}ms`);
    
    // Verify metadata
    const response = await fetch(result.metadataURL);
    const metadata = await response.json();
    console.log('\n📊 Generated Metadata:');
    console.log(JSON.stringify(metadata, null, 2));
  } else {
    console.error('❌ Token creation failed:', result.error);
  }
};

// Multiple tokens creation
const createMultipleTokensExample = async () => {
  const tokensData = [
    {
      name: "Token One",
      symbol: "ONE",
      description: "First token",
      logoPath: "./logo1.png"
    },
    {
      name: "Token Two", 
      symbol: "TWO",
      description: "Second token",
      logoPath: "./logo2.jpg"
    }
  ];
  
  const batchResult = await createMultipleTokens(tokensData);
  console.log('Batch Result:', batchResult);
};

// Run single token creation
createSingleToken();
