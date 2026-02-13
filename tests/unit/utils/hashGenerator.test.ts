import { describe, it, expect } from 'vitest';
import {
  generateHash,
  generateHashFromString,
  generateContextualHash,
} from '../../../src/utils/hashGenerator';

describe('hashGenerator', () => {
  describe('generateHash', () => {
    it('debe generar un hash SHA-256 consistente para el mismo buffer', () => {
      const data = Buffer.from('test data');
      const hash1 = generateHash(data);
      const hash2 = generateHash(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[a-f0-9]+$/);
    });

    it('debe generar hashes diferentes para datos diferentes', () => {
      const hash1 = generateHash(Buffer.from('data1'));
      const hash2 = generateHash(Buffer.from('data2'));
      
      expect(hash1).not.toBe(hash2);
    });

    it('debe manejar buffers vacíos', () => {
      const hash = generateHash(Buffer.from(''));
      
      expect(hash).toHaveLength(64);
      expect(hash).toBeDefined();
    });

    it('debe manejar datos binarios', () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      const hash = generateHash(binaryData);
      
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('generateHashFromString', () => {
    it('debe generar un hash SHA-256 consistente para la misma cadena', () => {
      const text = 'hello world';
      const hash1 = generateHashFromString(text);
      const hash2 = generateHashFromString(text);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('debe generar hashes diferentes para cadenas diferentes', () => {
      const hash1 = generateHashFromString('text1');
      const hash2 = generateHashFromString('text2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('debe ser sensible a mayúsculas/minúsculas', () => {
      const hash1 = generateHashFromString('Hello');
      const hash2 = generateHashFromString('hello');
      
      expect(hash1).not.toBe(hash2);
    });

    it('debe manejar cadenas vacías', () => {
      const hash = generateHashFromString('');
      
      expect(hash).toHaveLength(64);
      expect(hash).toBeDefined();
    });

    it('debe manejar caracteres especiales y unicode', () => {
      const hash1 = generateHashFromString('ñáéíóú');
      const hash2 = generateHashFromString('🚀🎉');
      
      expect(hash1).toHaveLength(64);
      expect(hash2).toHaveLength(64);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateContextualHash', () => {
    it('debe generar hash consistente para misma imagen y contexto', () => {
      const imageData = Buffer.from('image data');
      const context = 'describe this image';
      
      const hash1 = generateContextualHash(imageData, context);
      const hash2 = generateContextualHash(imageData, context);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('debe generar hashes diferentes para diferentes contextos', () => {
      const imageData = Buffer.from('image data');
      
      const hash1 = generateContextualHash(imageData, 'context A');
      const hash2 = generateContextualHash(imageData, 'context B');
      
      expect(hash1).not.toBe(hash2);
    });

    it('debe generar hashes diferentes para diferentes imágenes', () => {
      const context = 'same context';
      
      const hash1 = generateContextualHash(Buffer.from('image1'), context);
      const hash2 = generateContextualHash(Buffer.from('image2'), context);
      
      expect(hash1).not.toBe(hash2);
    });

    it('debe generar hash válido con contexto vacío', () => {
      const imageData = Buffer.from('image data');
      const hash = generateContextualHash(imageData, '');
      
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });
});
