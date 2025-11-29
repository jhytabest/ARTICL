/**
 * Example: Using ARTICL as a Client
 *
 * This example shows how to:
 * 1. Deposit funds
 * 2. Buy tickets
 * 3. Use the secrets to access APIs
 */

import { ethers } from 'ethers';
import { ARTICLClient } from '../client-sdk/src';

async function main() {
  // Setup provider and signer
  const provider = new ethers.JsonRpcProvider('http://localhost:8545'); // Anvil/Hardhat
  const signer = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);

  // Initialize ARTICL client
  const articl = new ARTICLClient({
    contractAddress: '0x...', // Your deployed contract address
    provider,
    signer
  });

  console.log('Client address:', await signer.getAddress());

  // 1. Deposit funds to prepaid balance
  console.log('\n📥 Depositing funds...');
  const depositTx = await articl.deposit(ethers.parseEther('1.0'));
  await depositTx.wait();
  console.log('Deposited 1 ETH');

  // Check balance
  const balance = await articl.getClientBalance();
  console.log('Prepaid balance:', ethers.formatEther(balance), 'ETH');

  // 2. Get publisher information
  const publisherAddress = '0x...'; // Publisher's address
  const publisher = await articl.getPublisher(publisherAddress);
  console.log('\n📊 Publisher Info:');
  console.log('  Domain:', publisher.domain);
  console.log('  Price per call:', ethers.formatEther(publisher.pricePerCall), 'ETH');

  // 3. Buy tickets and get secrets
  console.log('\n🎫 Buying 10 tickets...');
  const secrets = await articl.buyTicketsAndGetSecrets(publisherAddress, 10);
  console.log('Purchased 10 tickets!');
  console.log('\n💾 Save these secrets to use the API:');
  secrets.forEach((secret, i) => {
    console.log(`  Ticket ${i + 1}: ${secret}`);
  });

  // 4. Verify a ticket (what the publisher would do)
  console.log('\n✅ Verifying first ticket...');
  const isValid = await articl.verifyTicketWithSecret(publisherAddress, secrets[0]);
  console.log('Ticket valid:', isValid);

  console.log('\n🎉 Done! You can now use these secrets as API keys:');
  console.log('Example API call:');
  console.log(`  curl -H "X-ARTICL-Access-Key: ${secrets[0]}" https://${publisher.domain}/api/resource`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
