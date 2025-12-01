import { ethers, Contract, Signer, Provider } from 'ethers';
import ABI from './abi.json';

export interface ARTICLConfig {
  contractAddress: string;
  provider: Provider;
  signer?: Signer;
}

export interface Publisher {
  domain: string;
  pricePerCall: bigint;
  payoutWallet: string;
}

export interface Ticket {
  client: string;
  publisher: string;
  isConsumed: boolean;
  purchasedAt: bigint;
}

/**
 * Thin wrapper over the ARTICL contract ABI for the front-end.
 */
export class ARTICLClient {
  private contract: Contract;
  private signer?: Signer;

  constructor(config: ARTICLConfig) {
    this.contract = new Contract(config.contractAddress, ABI, config.provider);
    this.signer = config.signer;
  }

  connect(signer: Signer): ARTICLClient {
    this.signer = signer;
    this.contract = this.contract.connect(signer) as Contract;
    return this;
  }

  // Client functions
  async deposit(amount: bigint): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for deposit');
    return this.contract.deposit({ value: amount });
  }

  async getClientBalance(address?: string): Promise<bigint> {
    const addr = address || (await this.signer?.getAddress());
    if (!addr) throw new Error('Address required');
    return this.contract.clientBalances(addr);
  }

  generateSecret(): { secret: string; hash: string } {
    const secret = ethers.hexlify(ethers.randomBytes(32));
    const hash = ethers.keccak256(ethers.toUtf8Bytes(secret));
    return { secret, hash };
  }

  hashSecret(secret: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(secret));
  }

  async buyTicket(
    publisherAddress: string,
    ticketHash: string
  ): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for buyTicket');
    return this.contract.buyTicket(publisherAddress, ticketHash);
  }

  async buyTickets(
    publisherAddress: string,
    ticketHashes: string[]
  ): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for buyTickets');
    return this.contract.buyTickets(publisherAddress, ticketHashes);
  }

  async buyTicketsAndGetSecrets(
    publisherAddress: string,
    count: number
  ): Promise<string[]> {
    const tickets: { secret: string; hash: string }[] = [];
    for (let i = 0; i < count; i++) {
      tickets.push(this.generateSecret());
    }
    const hashes = tickets.map((t) => t.hash);
    const tx = await this.buyTickets(publisherAddress, hashes);
    await tx.wait();
    return tickets.map((t) => t.secret);
  }

  // Publisher functions
  async registerPublisher(
    domain: string,
    pricePerCall: bigint,
    payoutWallet: string
  ): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for registerPublisher');
    return this.contract.registerPublisher(domain, pricePerCall, payoutWallet);
  }

  async updatePrice(newPrice: bigint): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for updatePrice');
    return this.contract.updatePrice(newPrice);
  }

  async withdraw(): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for withdraw');
    return this.contract.withdraw();
  }

  async consumeTicket(ticketHash: string): Promise<ethers.ContractTransactionResponse> {
    if (!this.signer) throw new Error('Signer required for consumeTicket');
    return this.contract.consumeTicket(ticketHash);
  }

  async getPublisherBalance(address?: string): Promise<bigint> {
    const addr = address || (await this.signer?.getAddress());
    if (!addr) throw new Error('Address required');
    return this.contract.publisherBalances(addr);
  }

  // View functions
  async verifyTicket(publisherAddress: string, ticketHash: string): Promise<boolean> {
    return this.contract.verifyTicket(publisherAddress, ticketHash);
  }

  async verifyTicketWithSecret(publisherAddress: string, secret: string): Promise<boolean> {
    const hash = this.hashSecret(secret);
    return this.verifyTicket(publisherAddress, hash);
  }

  async getPublisher(publisherAddress: string): Promise<Publisher> {
    const [domain, pricePerCall, payoutWallet] = await this.contract.getPublisher(
      publisherAddress
    );
    return { domain, pricePerCall, payoutWallet };
  }

  async getTicket(ticketHash: string): Promise<Ticket> {
    const [client, publisher, isConsumed, purchasedAt] = await this.contract.getTicket(
      ticketHash
    );
    return { client, publisher, isConsumed, purchasedAt };
  }
}
