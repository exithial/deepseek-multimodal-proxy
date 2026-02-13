import { describe, it, expect, vi } from 'vitest';
import { Downloader } from '../../../src/utils/downloader';

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Simple mock for axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      head: vi.fn(),
    })),
  },
}));

describe('Downloader', () => {
  it('debe ser singleton', () => {
    const d1 = Downloader.getInstance();
    const d2 = Downloader.getInstance();
    expect(d1).toBe(d2);
  });
});
