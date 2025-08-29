Irys CLI Deposit/Funding Commands Documentation
Installation
First, install the Irys CLI globally:

bash
npm install -g @irys/cli
Basic Fund Command Syntax
bash
irys fund <amount> -t <token> -w <private_key_or_wallet> -n <network> [additional_options]
🪙 Solana Token Funding
Mainnet
bash

# Fund 0.01 SOL (10,000,000 lamports)

irys fund 10000000 -t solana -w YOUR_SOLANA_PRIVATE_KEY -n mainnet --provider-url https://api.mainnet-beta.solana.com

# Fund 0.005 SOL (5,000,000 lamports)

irys fund 5000000 -t solana -w YOUR_SOLANA_PRIVATE_KEY -n mainnet --provider-url https://api.mainnet-beta.solana.com

# Fund 0.002 SOL (2,000,000 lamports)

irys fund 2000000 -t solana -w YOUR_SOLANA_PRIVATE_KEY -n mainnet --provider-url https://api.mainnet-beta.solana.com
Devnet (Free Testing)
bash

# Fund 0.01 SOL on devnet

irys fund 10000000 -t solana -w YOUR_SOLANA_PRIVATE_KEY -n devnet --provider-url https://api.devnet.solana.com

# Fund 0.001 SOL on devnet

irys fund 1000000 -t solana -w YOUR_SOLANA_PRIVATE_KEY -n devnet --provider-url https://api.devnet.solana.com
Alternative Solana RPC URLs
bash

# Using different RPC providers

irys fund 10000000 -t solana -w YOUR_PRIVATE_KEY -n mainnet --provider-url https://solana-mainnet.g.alchemy.com/v2/YOUR_API_KEY

irys fund 10000000 -t solana -w YOUR_PRIVATE_KEY -n devnet --provider-url https://devnet.sonic.game
⚡ Ethereum Token Funding
Mainnet
bash

# Fund 0.01 ETH (10000000000000000 wei)

irys fund 10000000000000000 -t ethereum -w YOUR_ETHEREUM_PRIVATE_KEY -n mainnet

# Fund 0.005 ETH (5000000000000000 wei)

irys fund 5000000000000000 -t ethereum -w YOUR_ETHEREUM_PRIVATE_KEY -n mainnet

# Fund 0.001 ETH (1000000000000000 wei)

irys fund 1000000000000000 -t ethereum -w YOUR_ETHEREUM_PRIVATE_KEY -n mainnet
Ethereum Testnet (Sepolia)
bash

# Fund on Sepolia testnet

irys fund 10000000000000000 -t ethereum -w YOUR_ETHEREUM_PRIVATE_KEY -n devnet --provider-url https://rpc.sepolia.dev

# Using different Sepolia RPC

irys fund 10000000000000000 -t ethereum -w YOUR_ETHEREUM_PRIVATE_KEY -n devnet --provider-url https://sepolia.infura.io/v3/YOUR_PROJECT_ID
🔺 Polygon Token Funding
bash

# Fund with MATIC on Polygon mainnet

irys fund 1000000000000000000 -t polygon -w YOUR_PRIVATE_KEY -n mainnet --provider-url https://polygon-rpc.com

# Fund on Polygon Mumbai testnet

irys fund 1000000000000000000 -t polygon -w YOUR_PRIVATE_KEY -n devnet --provider-url https://rpc-mumbai.maticvigil.com
🟠 Arweave Token Funding
bash

# Fund with AR using wallet file

irys fund 1000000000000 -t arweave -w /path/to/wallet.json -n mainnet

# Fund smaller amount

irys fund 100000000000 -t arweave -w /path/to/wallet.json -n mainnet
🔍 Check Balance Before/After Funding
Check Current Balance
bash

# Check Solana balance

irys balance YOUR_WALLET_ADDRESS -t solana --provider-url https://api.mainnet-beta.solana.com -n mainnet

# Check Ethereum balance

irys balance YOUR_WALLET_ADDRESS -t ethereum -n mainnet

# Check Arweave balance

irys balance YOUR_WALLET_ADDRESS -t arweave -n mainnet
💸 Withdraw Funds
bash

# Withdraw Solana

irys withdraw 5000000 -t solana -w YOUR_PRIVATE_KEY -n mainnet --provider-url https://api.mainnet-beta.solana.com

# Withdraw Ethereum

irys withdraw 5000000000000000 -t ethereum -w YOUR_PRIVATE_KEY -n mainnet

# Withdraw Arweave

irys withdraw 50000000000 -t arweave -w /path/to/wallet.json -n mainnet
📊 Check Upload Pricing
bash

# Check cost to upload 1MB (1,000,000 bytes)

irys price 1000000 -t solana -n mainnet --provider-url https://api.mainnet-beta.solana.com

# Check cost for 5MB

irys price 5000000 -t ethereum -n mainnet

# Check cost for specific file

irys price myfile.jpg -t solana -n mainnet --provider-url https://api.mainnet-beta.solana.com
📝 Important Notes
Amount Units
Solana: Amounts in lamports (1 SOL = 1,000,000,000 lamports)

Ethereum: Amounts in wei (1 ETH = 1,000,000,000,000,000,000 wei)

Arweave: Amounts in winston (1 AR = 1,000,000,000,000 winston)

Common Amount Conversions
Amount Solana (lamports) Ethereum (wei)
0.001 1,000,000 1,000,000,000,000,000
0.005 5,000,000 5,000,000,000,000,000
0.01 10,000,000 10,000,000,000,000,000
0.1 100,000,000 100,000,000,000,000,000
Private Key Formats
Solana: Base58 encoded private key

Ethereum: Hex string (with or without 0x prefix)

Arweave: JSON wallet file path

Network Options
mainnet: Production network (costs real tokens)

devnet: Test network (use testnet tokens)

🚨 Security Best Practices
Environment Variables
bash

# Set private key as environment variable

export SOLANA_PRIVATE_KEY="your_private_key_here"
export ETHEREUM_PRIVATE_KEY="your_private_key_here"

# Use in commands

irys fund 10000000 -t solana -w $SOLANA_PRIVATE_KEY -n mainnet --provider-url https://api.mainnet-beta.solana.com
Wallet File for Arweave
bash

# Store Arweave wallet in secure file

irys fund 1000000000000 -t arweave -w ./secure/arweave-wallet.json -n mainnet
🔧 Troubleshooting
Common Issues
bash

# Issue: Insufficient funds in wallet

# Solution: Check wallet balance first

irys balance YOUR_ADDRESS -t solana -n mainnet --provider-url https://api.mainnet-beta.solana.com

# Issue: RPC connection failed

# Solution: Try alternative RPC URL

irys fund 10000000 -t solana -w YOUR_KEY -n mainnet --provider-url https://solana-mainnet.g.alchemy.com/v2/demo

# Issue: Network congestion

# Solution: Wait and retry, or use different RPC

Verify Successful Funding
bash

# Check Irys balance after funding

irys balance YOUR_ADDRESS -t solana -n mainnet --provider-url https://api.mainnet-beta.solana.com

# Should show increased balance

📖 Complete Example Workflow
bash

# 1. Check current Irys balance

irys balance YOUR_WALLET_ADDRESS -t solana -n mainnet --provider-url https://api.mainnet-beta.solana.com

# 2. Check upload pricing

irys price 2000000 -t solana -n mainnet

# 3. Fund account with sufficient amount

irys fund 10000000 -t solana -w YOUR_PRIVATE_KEY -n mainnet --provider-url https://api.mainnet-beta.solana.com

# 4. Verify funding was successful

irys balance YOUR_WALLET_ADDRESS -t solana -n mainnet --provider-url https://api.mainnet-beta.solana.com

# 5. Now ready to upload files

irys upload myfile.jpg -t solana -w YOUR_PRIVATE_KEY -n mainnet --provider-url https://api.mainnet-beta.solana.com
🔗 Additional Resources
Irys Documentation: https://docs.irys.xyz

Solana RPC Endpoints: https://docs.solana.com/cluster/rpc-endpoints

Ethereum RPC Endpoints: https://chainlist.org

CLI Source Code: https://github.com/Irys-xyz/cli

Note: Always test commands on devnet first before using mainnet to avoid losing real tokens due to errors.
