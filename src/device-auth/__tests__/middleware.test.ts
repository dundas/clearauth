import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  extractSignatureHeaders, 
  reconstructSignedPayload, 
  validateChallengeFreshness, 
  verifyDeviceSignature,
  DeviceAuthError
} from '../middleware';

// Mocks
const mockValidateBearerToken = vi.fn();
const mockVerifySignature = vi.fn();
const mockVerifyChallenge = vi.fn();

vi.mock('../../jwt/handlers', () => ({
  validateBearerToken: (...args: any[]) => mockValidateBearerToken(...args)
}));

vi.mock('../signature-verifier', () => ({
  verifySignature: (...args: any[]) => mockVerifySignature(...args)
}));

// Partially mock challenge.js to keep extractTimestamp working if possible,
// or just implement a mock for it if it's simple.
// Since extractTimestamp is pure logic, let's use the real one if we can.
import * as challengeModule from '../challenge';
vi.mock('../challenge', async (importOriginal) => {
  const actual = await importOriginal<typeof challengeModule>();
  return {
    ...actual,
    verifyChallenge: (...args: any[]) => mockVerifyChallenge(...args)
  };
});

describe('Device Authentication Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractSignatureHeaders', () => {
    it('should extract all signature headers', () => {
      const mockRequest = new Request('https://example.com/api', {
        headers: {
          'x-device-signature': 'sig123',
          'x-challenge': 'chall123',
          'x-device-id': 'dev123'
        }
      });

      const result = extractSignatureHeaders(mockRequest);

      expect(result).toEqual({
        signature: 'sig123',
        challenge: 'chall123',
        deviceId: 'dev123'
      });
    });

    it('should return null if any header is missing', () => {
      const mockRequest = new Request('https://example.com/api', {
        headers: {
          'x-device-signature': 'sig123'
        }
      });
      expect(extractSignatureHeaders(mockRequest)).toBeNull();
    });
  });

  describe('reconstructSignedPayload', () => {
    it('should reconstruct payload correctly for GET request', async () => {
      const mockRequest = new Request('https://example.com/auth/resource', {
        method: 'GET'
      });
      const challenge = 'chall123';
      const payload = await reconstructSignedPayload(mockRequest, challenge);
      expect(payload).toBe('GET|/auth/resource||chall123');
    });

    it('should reconstruct payload correctly for POST request with body', async () => {
      const body = JSON.stringify({ data: 'test' });
      const mockRequest = new Request('https://example.com/auth/resource', {
        method: 'POST',
        body: body
      });
      const challenge = 'chall123';

      const payload = await reconstructSignedPayload(mockRequest, challenge);
      
      // Calculate expected hash: SHA-256 of body
      const encoder = new TextEncoder();
      const data = encoder.encode(body);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const expectedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      expect(payload).toBe(`POST|/auth/resource|${expectedHash}|chall123`);
    });
  });

  describe('validateChallengeFreshness', () => {
    it('should return true for fresh challenge', () => {
      const now = Date.now();
      const challenge = `nonce|${now}`;
      expect(validateChallengeFreshness(challenge)).toBe(true);
    });

    it('should return false for expired challenge (> 60s)', () => {
      const now = Date.now();
      const expiredTimestamp = now - 61000;
      const challenge = `nonce|${expiredTimestamp}`;
      expect(validateChallengeFreshness(challenge)).toBe(false);
    });

    it('should return false for future challenge (> 5s)', () => {
      const now = Date.now();
      const futureTimestamp = now + 6000;
      const challenge = `nonce|${futureTimestamp}`;
      expect(validateChallengeFreshness(challenge)).toBe(false);
    });
    
    it('should return false for malformed challenge', () => {
      expect(validateChallengeFreshness('invalid')).toBe(false);
    });
  });

  describe('verifyDeviceSignature', () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn(),
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      execute: vi.fn()
    } as any;

    const mockJwtConfig = { secret: 'test' } as any;
    const mockConfig = { database: mockDb } as any;
    
    const validUser = { sub: 'user123', deviceId: 'dev123' };
    const validDevice = { 
      device_id: 'dev123', 
      user_id: 'user123', 
      public_key: 'pubkey', 
      key_algorithm: 'P-256',
      status: 'active' 
    };
    const validHeaders = {
      'Authorization': 'Bearer token',
      'X-Device-Signature': 'sig123',
      'X-Challenge': `nonce|${Date.now()}`
    };

    it('should verify signature successfully', async () => {
      const request = new Request('https://example.com/api', { headers: validHeaders });
      
      mockValidateBearerToken.mockResolvedValue(validUser);
      mockDb.executeTakeFirst.mockResolvedValue(validDevice);
      mockVerifyChallenge.mockResolvedValue(true);
      mockVerifySignature.mockResolvedValue(true);

      const result = await verifyDeviceSignature(request, mockDb, mockJwtConfig, mockConfig);

      expect(result).toEqual({
        user: validUser,
        device: validDevice,
        challenge: validHeaders['X-Challenge']
      });
      
      expect(mockVerifySignature).toHaveBeenCalledWith(expect.objectContaining({
        publicKey: 'pubkey',
        algorithm: 'P-256'
      }));
    });

    it('should throw if user is unauthorized', async () => {
      const request = new Request('https://example.com/api', { headers: validHeaders });
      mockValidateBearerToken.mockResolvedValue(null);

      await expect(verifyDeviceSignature(request, mockDb, mockJwtConfig, mockConfig))
        .rejects.toThrow('Unauthorized');
    });

    it('should throw if signature headers are missing', async () => {
      const request = new Request('https://example.com/api', { 
        headers: { 'Authorization': 'Bearer token' } 
      });
      mockValidateBearerToken.mockResolvedValue(validUser);

      await expect(verifyDeviceSignature(request, mockDb, mockJwtConfig, mockConfig))
        .rejects.toThrow('Missing signature headers');
    });

    it('should throw if device ID mismatch', async () => {
      const request = new Request('https://example.com/api', { 
        headers: { 
          ...validHeaders,
          'X-Device-Id': 'other-dev' 
        } 
      });
      mockValidateBearerToken.mockResolvedValue(validUser); // user has deviceId='dev123'

      await expect(verifyDeviceSignature(request, mockDb, mockJwtConfig, mockConfig))
        .rejects.toThrow('Device ID mismatch');
    });

    it('should throw if device not found', async () => {
      const request = new Request('https://example.com/api', { headers: validHeaders });
      mockValidateBearerToken.mockResolvedValue(validUser);
      mockDb.executeTakeFirst.mockResolvedValue(null);

      await expect(verifyDeviceSignature(request, mockDb, mockJwtConfig, mockConfig))
        .rejects.toThrow('Device not found');
    });

    it('should throw if device is revoked', async () => {
      const request = new Request('https://example.com/api', { headers: validHeaders });
      mockValidateBearerToken.mockResolvedValue(validUser);
      mockDb.executeTakeFirst.mockResolvedValue({ ...validDevice, status: 'revoked' });

      await expect(verifyDeviceSignature(request, mockDb, mockJwtConfig, mockConfig))
        .rejects.toThrow('Device is revoked');
    });

    it('should throw if challenge is not fresh', async () => {
      const oldTimestamp = Date.now() - 100000;
      const headers = { ...validHeaders, 'X-Challenge': `nonce|${oldTimestamp}` };
      const request = new Request('https://example.com/api', { headers });
      
      mockValidateBearerToken.mockResolvedValue(validUser);
      mockDb.executeTakeFirst.mockResolvedValue(validDevice);

      await expect(verifyDeviceSignature(request, mockDb, mockJwtConfig, mockConfig))
        .rejects.toThrow('Challenge is expired');
    });

    it('should throw if challenge verification fails (DB)', async () => {
      const request = new Request('https://example.com/api', { headers: validHeaders });
      mockValidateBearerToken.mockResolvedValue(validUser);
      mockDb.executeTakeFirst.mockResolvedValue(validDevice);
      mockVerifyChallenge.mockResolvedValue(false);

      await expect(verifyDeviceSignature(request, mockDb, mockJwtConfig, mockConfig))
        .rejects.toThrow('Challenge invalid or already used');
    });

    it('should throw if signature verification fails', async () => {
      const request = new Request('https://example.com/api', { headers: validHeaders });
      mockValidateBearerToken.mockResolvedValue(validUser);
      mockDb.executeTakeFirst.mockResolvedValue(validDevice);
      mockVerifyChallenge.mockResolvedValue(true);
      mockVerifySignature.mockResolvedValue(false);

      await expect(verifyDeviceSignature(request, mockDb, mockJwtConfig, mockConfig))
        .rejects.toThrow('Invalid signature');
    });
  });
});