/**
 * ARTICL Publisher Middleware for Express.js
 *
 * This middleware validates incoming API requests using ARTICL tickets
 */

import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import { ARTICLClient } from '../client-sdk/src';

export interface ARTICLMiddlewareConfig {
  contractAddress: string;
  provider: ethers.Provider;
  publisherAddress: string;
  autoConsume?: boolean; // Automatically mark tickets as consumed after use
  cache?: boolean; // Cache verified tickets for performance
  headerName?: string; // Custom header name (default: X-ARTICL-Access-Key)
}

/**
 * Create ARTICL middleware for Express
 */
export function createARTICLMiddleware(config: ARTICLMiddlewareConfig) {
  const articl = new ARTICLClient({
    contractAddress: config.contractAddress,
    provider: config.provider
  });

  const headerName = config.headerName || 'x-microaccess-key';
  const cache = new Map<string, boolean>(); // Simple in-memory cache

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Get secret from header
      const secret = req.headers[headerName] as string;

      if (!secret) {
        return res.status(401).json({
          error: 'Missing API key',
          message: `Please provide your access key in the '${headerName}' header`
        });
      }

      // 2. Hash the secret
      const ticketHash = articl.hashSecret(secret);

      // 3. Check cache first (if enabled)
      if (config.cache && cache.has(ticketHash)) {
        const isValid = cache.get(ticketHash);
        if (!isValid) {
          return res.status(403).json({
            error: 'Invalid or consumed ticket',
            message: 'This access key is no longer valid'
          });
        }
        return next();
      }

      // 4. Verify on-chain
      const isValid = await articl.verifyTicket(config.publisherAddress, ticketHash);

      if (!isValid) {
        if (config.cache) {
          cache.set(ticketHash, false);
        }
        return res.status(403).json({
          error: 'Invalid or consumed ticket',
          message: 'This access key is not valid or has already been used'
        });
      }

      // 5. Cache if enabled
      if (config.cache) {
        cache.set(ticketHash, true);
      }

      // 6. Optionally mark as consumed (requires signer)
      // Note: In production, you might want to do this asynchronously or in batches
      if (config.autoConsume) {
        // For auto-consume, you'd need to add a signer to the config
        console.log(`TODO: Mark ticket ${ticketHash} as consumed`);
      }

      // 7. Allow the request
      next();

    } catch (error) {
      console.error('ARTICL middleware error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to verify access ticket'
      });
    }
  };
}

/**
 * Enhanced middleware with request tracking
 */
export interface EnhancedARTICLConfig extends ARTICLMiddlewareConfig {
  onRequest?: (ticketHash: string, req: Request) => void;
  onValidTicket?: (ticketHash: string, req: Request) => void;
  onInvalidTicket?: (ticketHash: string, req: Request) => void;
}

export function createEnhancedARTICLMiddleware(config: EnhancedARTICLConfig) {
  const articl = new ARTICLClient({
    contractAddress: config.contractAddress,
    provider: config.provider
  });

  const headerName = config.headerName || 'x-microaccess-key';
  const cache = new Map<string, boolean>();

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secret = req.headers[headerName] as string;

      if (!secret) {
        return res.status(401).json({
          error: 'Missing API key',
          message: `Please provide your access key in the '${headerName}' header`
        });
      }

      const ticketHash = articl.hashSecret(secret);

      // Track request
      config.onRequest?.(ticketHash, req);

      // Check cache
      if (config.cache && cache.has(ticketHash)) {
        const isValid = cache.get(ticketHash);
        if (!isValid) {
          config.onInvalidTicket?.(ticketHash, req);
          return res.status(403).json({
            error: 'Invalid or consumed ticket',
            message: 'This access key is no longer valid'
          });
        }
        config.onValidTicket?.(ticketHash, req);
        return next();
      }

      // Verify on-chain
      const isValid = await articl.verifyTicket(config.publisherAddress, ticketHash);

      if (!isValid) {
        if (config.cache) {
          cache.set(ticketHash, false);
        }
        config.onInvalidTicket?.(ticketHash, req);
        return res.status(403).json({
          error: 'Invalid or consumed ticket',
          message: 'This access key is not valid or has already been used'
        });
      }

      if (config.cache) {
        cache.set(ticketHash, true);
      }

      config.onValidTicket?.(ticketHash, req);
      next();

    } catch (error) {
      console.error('ARTICL middleware error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to verify access ticket'
      });
    }
  };
}
