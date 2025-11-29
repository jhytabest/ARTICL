import { ethers, Contract, Signer, Provider } from 'ethers';
import ABI from './abi.json';

/**
 * Configuration for ARTICL Client
 */
export interface ARTICLConfig {
  contractAddress: string;
  provider: Provider;
  signer?: Signer;
}

/**
 * Publisher information
 */
export interface Publisher {
  domain: string;
  pricePerCall: bigint;
  payoutWallet: string;
}

/**
 * Ticket information
 */
export interface Ticket {
  client: string;
  publisher: string;
  isConsumed: boolean;
  purchasedAt: bigint;
}

/**
 * ARTICL Client for interacting with the ARTICL Protocol
 */
export class ARTICLClient {
  private contract: Contract;
  private signer?: Signer;

  constructor(config: ARTICLConfig) {
    this.contract = new Contract(config.contractAddress, ABI, config.provider);
    this.signer = config.signer;
  }

  /**
   * Connect a signer to enable write operations
   */
  connect(signer: Signer): ARTICLClient {
    this.signer = signer;
    this.contract = this.contract.connect(signer) as Contract;
    return this;
  }

  // ============ Client Functions ============

  /**
   * Deposit funds to your prepaid balance
   * @param amount Amount in wei to deposit
   */
  async deposit(amount: bigint): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for this operation');
    return this.contract.deposit({ value: amount });
  }

  /**
   * Get client balance
   * @param address Client address (defaults to signer address)
   */
  async getClientBalance(address?: string): Promise<bigint> {
    const addr = address || (await this.signer?.getAddress());
    if (!addr) throw new Error('Address required');
    return this.contract.clientBalances(addr);
  }

  /**
   * Generate a secret and its hash
   * @returns Object with secret and hash
   */
  generateSecret(): { secret: string; hash: string } {
    const secret = ethers.hexlify(ethers.randomBytes(32));
    const hash = ethers.keccak256(ethers.toUtf8Bytes(secret));
    return { secret, hash };
  }

  /**
   * Compute hash from a secret
   * @param secret The secret string
   */
  hashSecret(secret: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(secret));
  }

  /**
   * Buy a single ticket
   * @param publisherAddress Publisher's address
   * @param ticketHash Hash of the secret
   */
  async buyTicket(
    publisherAddress: string,
    ticketHash: string
  ): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for this operation');
    return this.contract.buyTicket(publisherAddress, ticketHash);
  }

  /**
   * Buy multiple tickets at once
   * @param publisherAddress Publisher's address
   * @param ticketHashes Array of ticket hashes
   */
  async buyTickets(
    publisherAddress: string,
    ticketHashes: string[]
  ): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for this operation');
    return this.contract.buyTickets(publisherAddress, ticketHashes);
  }

  /**
   * Buy N tickets and return their secrets
   * @param publisherAddress Publisher's address
   * @param count Number of tickets to buy
   * @returns Array of secrets (save these to use the API!)
   */
  async buyTicketsAndGetSecrets(
    publisherAddress: string,
    count: number
  ): Promise<string[]> {
    const tickets: { secret: string; hash: string }[] = [];

    // Generate secrets and hashes
    for (let i = 0; i < count; i++) {
      tickets.push(this.generateSecret());
    }

    // Buy tickets
    const hashes = tickets.map(t => t.hash);
    const tx = await this.buyTickets(publisherAddress, hashes);
    await tx.wait();

    // Return secrets
    return tickets.map(t => t.secret);
  }

  // ============ Publisher Functions ============

  /**
   * Register as a publisher
   * @param domain Your API domain
   * @param pricePerCall Price in wei per API call
   * @param payoutWallet Wallet to receive payments
   */
  async registerPublisher(
    domain: string,
    pricePerCall: bigint,
    payoutWallet: string
  ): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for this operation');
    return this.contract.registerPublisher(domain, pricePerCall, payoutWallet);
  }

  /**
   * Update your price per call
   * @param newPrice New price in wei
   */
  async updatePrice(newPrice: bigint): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for this operation');
    return this.contract.updatePrice(newPrice);
  }

  /**
   * Withdraw accumulated revenue
   */
  async withdraw(): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for this operation');
    return this.contract.withdraw();
  }

  /**
   * Mark a ticket as consumed
   * @param ticketHash The hash of the secret that was used
   */
  async consumeTicket(ticketHash: string): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for this operation');
    return this.contract.consumeTicket(ticketHash);
  }

  /**
   * Get publisher balance
   * @param address Publisher address (defaults to signer address)
   */
  async getPublisherBalance(address?: string): Promise<bigint> {
    const addr = address || (await this.signer?.getAddress());
    if (!addr) throw new Error('Address required');
    return this.contract.publisherBalances(addr);
  }

  // ============ View Functions ============

  /**
   * Verify if a ticket is valid
   * @param publisherAddress Publisher's address
   * @param ticketHash Hash to verify
   */
  async verifyTicket(publisherAddress: string, ticketHash: string): Promise<boolean> {
    return this.contract.verifyTicket(publisherAddress, ticketHash);
  }

  /**
   * Verify a ticket using the secret directly
   * @param publisherAddress Publisher's address
   * @param secret The secret string
   */
  async verifyTicketWithSecret(publisherAddress: string, secret: string): Promise<boolean> {
    const hash = this.hashSecret(secret);
    return this.verifyTicket(publisherAddress, hash);
  }

  /**
   * Get publisher information
   * @param publisherAddress Publisher's address
   */
  async getPublisher(publisherAddress: string): Promise<Publisher> {
    const [domain, pricePerCall, payoutWallet] = await this.contract.getPublisher(publisherAddress);
    return { domain, pricePerCall, payoutWallet };
  }

  /**
   * Get ticket information
   * @param ticketHash The ticket hash
   */
  async getTicket(ticketHash: string): Promise<Ticket> {
    const [client, publisher, isConsumed, purchasedAt] = await this.contract.getTicket(ticketHash);
    return { client, publisher, isConsumed, purchasedAt };
  }

  // ============ Event Listeners ============

  /**
   * Listen for ticket purchases
   * @param callback Function to call when a ticket is purchased
   */
  onTicketPurchased(
    callback: (client: string, publisher: string, ticketHash: string, price: bigint) => void
  ) {
    this.contract.on('TicketPurchased', callback);
  }

  /**
   * Listen for publisher registrations
   * @param callback Function to call when a publisher registers
   */
  onPublisherRegistered(
    callback: (publisher: string, domain: string, pricePerCall: bigint, payoutWallet: string) => void
  ) {
    this.contract.on('PublisherRegistered', callback);
  }

  /**
   * Listen for ticket consumption
   * @param callback Function to call when a ticket is consumed
   */
  onTicketConsumed(
    callback: (publisher: string, ticketHash: string) => void
  ) {
    this.contract.on('TicketConsumed', callback);
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners() {
    this.contract.removeAllListeners();
  }
}
