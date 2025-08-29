/**
 * Create Solana Token with Metadata using Modern Metaplex Tools
 * Uses metadata URLs from your Irys upload service
 */

import {
  createFungible,
  mplTokenMetadata,
  TokenStandard
} from '@metaplex-foundation/mpl-token-metadata';
import { 
  createTokenIfMissing,
  findAssociatedTokenPda,
  mintTokensTo,
  mplToolbox
} from '@metaplex-foundation/mpl-toolbox';
import {
  generateSigner,
  signerIdentity,
  sol,
  percentAmount,
  publicKey
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { base58 } from '@metaplex-foundation/umi/serializers';
import dotenv from 'dotenv';

dotenv.config();

// ========================================
// CONFIGURATION
// ========================================

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'; // Use devnet for testing
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY; // Your wallet private key

// ========================================
// CREATE TOKEN WITH IRYS METADATA
// ========================================

async function createSolanaTokenWithIrysMetadata(metadataUrl, tokenConfig) {
  try {
    console.log('🚀 Creating Solana token with Irys metadata...');
    console.log('📄 Metadata URL:', metadataUrl);

    // 1. Setup Umi instance
    const umi = createUmi(RPC_URL)
      .use(mplTokenMetadata())
      .use(mplToolbox());

    // 2. Create signer from private key
    let signer;
    if (PRIVATE_KEY) {
      // Use your existing wallet
      const secretKey = base58.serialize(PRIVATE_KEY);
      signer = umi.eddsa.createKeypairFromSecretKey(secretKey);
    } else {
      // Generate new keypair for testing
      signer = generateSigner(umi);
      console.log('⚠️  Generated new keypair for testing:', signer.publicKey);
      console.log('⚠️  Fund this address with devnet SOL: https://faucet.solana.com');
    }

    umi.use(signerIdentity(signer));

    // 3. Airdrop SOL for testing (devnet only)
    if (RPC_URL.includes('devnet')) {
      try {
        await umi.rpc.airdrop(umi.identity.publicKey, sol(2));
        console.log('💰 Airdropped 2 SOL for testing');
      } catch (error) {
        console.log('⚠️  Airdrop failed, ensure wallet has sufficient SOL');
      }
    }

    // 4. Generate mint keypair
    const mint = generateSigner(umi);

    // 5. Create token with metadata
    console.log('🪙 Creating token mint and metadata...');
    
    const createTx = await createFungible(umi, {
      mint,
      name: tokenConfig.name,
      symbol: tokenConfig.symbol,
      uri: metadataUrl, // 🎯 Use Irys metadata URL here
      sellerFeeBasisPoints: percentAmount(tokenConfig.royalty || 0),
      decimals: tokenConfig.decimals || 9,
      tokenStandard: TokenStandard.Fungible
    }).sendAndConfirm(umi);

    const signature = base58.deserialize(createTx.signature)[0];
    
    console.log('✅ Token created successfully!');
    console.log('🏷️  Token Mint:', mint.publicKey);
    console.log('📄 Metadata URL:', metadataUrl);
    console.log('🔗 Transaction:', `https://explorer.solana.com/tx/${signature}${RPC_URL.includes('devnet') ? '?cluster=devnet' : ''}`);

    // 6. Create associated token account and mint initial supply
    if (tokenConfig.initialSupply && tokenConfig.initialSupply > 0) {
      console.log(`🪙 Minting ${tokenConfig.initialSupply} tokens...`);

      // Find associated token account
      const associatedToken = findAssociatedTokenPda(umi, {
        mint: mint.publicKey,
        owner: umi.identity.publicKey,
      });

      // Create token account if it doesn't exist and mint tokens
      const mintTx = await createTokenIfMissing(umi, {
        mint: mint.publicKey,
        owner: umi.identity.publicKey,
        ataProgram: publicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
      })
      .add(
        mintTokensTo(umi, {
          mint: mint.publicKey,
          token: associatedToken[0],
          amount: BigInt(tokenConfig.initialSupply * Math.pow(10, tokenConfig.decimals || 9))
        })
      ).sendAndConfirm(umi);

      const mintSignature = base58.deserialize(mintTx.signature)[0];
      console.log('✅ Tokens minted successfully!');
      console.log('🔗 Mint Transaction:', `https://explorer.solana.com/tx/${mintSignature}${RPC_URL.includes('devnet') ? '?cluster=devnet' : ''}`);
    }

    return {
      success: true,
      mintAddress: mint.publicKey,
      metadataUrl: metadataUrl,
      signature: signature,
      explorerUrl: `https://explorer.solana.com/address/${mint.publicKey}${RPC_URL.includes('devnet') ? '?cluster=devnet' : ''}`
    };

  } catch (error) {
    console.error('❌ Error creating token:', error);
    throw error;
  }
}

// ========================================
// INTEGRATION WITH YOUR IRYS SERVICE
// ========================================

async function createTokenFromIrysService(walletAddress, tokenData, logoFile) {
  try {
    console.log('🎨 Step 1: Creating token assets via Irys service...');

    // Call your Irys API to create logo + metadata
    const formData = new FormData();
    formData.append('logo', logoFile);
    formData.append('name', tokenData.name);
    formData.append('symbol', tokenData.symbol);
    formData.append('description', tokenData.description);
    formData.append('website', tokenData.website || '');
    if (tokenData.attributes) {
      formData.append('attributes', JSON.stringify(tokenData.attributes));
    }

    const irysResponse = await fetch('http://localhost:3000/create-token', {
      method: 'POST',
      headers: {
        'Wallet-Address': walletAddress
      },
      body: formData
    });

    if (!irysResponse.ok) {
      throw new Error('Failed to create token assets via Irys service');
    }

    const irysResult = await irysResponse.json();
    
    if (!irysResult.success) {
      throw new Error(`Irys service error: ${irysResult.error}`);
    }

    console.log('✅ Step 1 Complete: Token assets created on Irys');
    console.log('🖼️  Logo URL:', irysResult.token.logoURL);
    console.log('📄 Metadata URL:', irysResult.token.metadataURL);

    // Step 2: Create actual Solana token using the metadata URL
    console.log('🪙 Step 2: Creating Solana token...');

    const tokenConfig = {
      name: tokenData.name,
      symbol: tokenData.symbol,
      decimals: tokenData.decimals || 9,
      initialSupply: tokenData.initialSupply || 1000000, // 1 million default
      royalty: tokenData.royalty || 0
    };

    const tokenResult = await createSolanaTokenWithIrysMetadata(
      irysResult.token.metadataURL,
      tokenConfig
    );

    return {
      success: true,
      irysData: irysResult,
      solanaToken: tokenResult,
      summary: {
        tokenMint: tokenResult.mintAddress,
        logoUrl: irysResult.token.logoURL,
        metadataUrl: irysResult.token.metadataURL,
        explorerUrl: tokenResult.explorerUrl
      }
    };

  } catch (error) {
    console.error('❌ Error in complete token creation:', error);
    throw error;
  }
}

// ========================================
// EXAMPLE USAGE
// ========================================

async function exampleUsage() {
  try {
    // Method 1: Create token directly with existing metadata URL
    const existingMetadataUrl = 'https://gateway.irys.xyz/5aA9atL8HrG83JebhzeMNNFCiGgtjPKRGEos5pE3h7S9';
    
    const directResult = await createSolanaTokenWithIrysMetadata(existingMetadataUrl, {
      name: 'Fixed Token',
      symbol: 'FIXED',
      decimals: 9,
      initialSupply: 1000000,
      royalty: 0
    });

    console.log('🎉 Direct token creation result:', directResult);

    // Method 2: Complete workflow (Irys + Solana)
    /* 
    const completeResult = await createTokenFromIrysService(
      '11111111111111111111111111111112', // Your wallet address
      {
        name: 'My New Token',
        symbol: 'MNT',
        description: 'This token was created using the complete workflow',
        website: 'https://mytoken.com',
        decimals: 9,
        initialSupply: 1000000,
        attributes: [
          { trait_type: 'Type', value: 'Utility' },
          { trait_type: 'Network', value: 'Solana' }
        ]
      },
      logoFileObject // File object for logo
    );

    console.log('🎉 Complete workflow result:', completeResult);
    */

  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

// Run example
exampleUsage();

export {
  createSolanaTokenWithIrysMetadata,
  createTokenFromIrysService
};
