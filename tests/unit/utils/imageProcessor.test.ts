import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateFileSize } from '../../../src/utils/imageProcessor';

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('imageProcessor', () => {
  beforeEach(() => {
    delete process.env.MAX_FILE_SIZE_MB;
  });
  describe('validateFileSize', () => {
    it('debe permitir archivos dentro del límite', () => {
      const buffer = Buffer.alloc(1024 * 1024); // 1MB
      expect(() => validateFileSize(buffer)).not.toThrow();
    });

    it('debe lanzar error para archivos demasiado grandes', () => {
      process.env.MAX_FILE_SIZE_MB = '1';
      const buffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
      expect(() => validateFileSize(buffer)).toThrow('Archivo demasiado grande');
    });

    it('debe usar límite por defecto de 50MB', () => {
      const buffer = Buffer.alloc(51 * 1024 * 1024); // 51MB
      expect(() => validateFileSize(buffer)).toThrow('50MB');
    });

    it('debe respetar límite personalizado', () => {
      process.env.MAX_FILE_SIZE_MB = '100';
      const smallBuffer = Buffer.alloc(50 * 1024 * 1024);
      const largeBuffer = Buffer.alloc(101 * 1024 * 1024);

      expect(() => validateFileSize(smallBuffer)).not.toThrow();
      expect(() => validateFileSize(largeBuffer)).toThrow('100MB');
    });

    it('debe incluir tamaño actual en mensaje de error', () => {
      process.env.MAX_FILE_SIZE_MB = '1';
      const buffer = Buffer.alloc(5 * 1024 * 1024); // 5MB

      expect(() => validateFileSize(buffer)).toThrow('5.00MB');
    });
  });
});
