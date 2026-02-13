import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Crear una clase de test que podamos instanciar
class TestCacheService {
  private cacheDir: string;
  private cacheFile: string;
  private cache: Record<string, any> = {};
  private enabled: boolean;

  constructor(cacheDir: string, enabled: boolean = true) {
    this.cacheDir = cacheDir;
    this.cacheFile = path.join(cacheDir, 'descriptions.json');
    this.enabled = enabled;
  }

  async init(): Promise<void> {
    if (!this.enabled) return;
    await fs.mkdir(this.cacheDir, { recursive: true });
    try {
      const data = await fs.readFile(this.cacheFile, 'utf-8');
      this.cache = JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.cache = {};
        await this.save();
      }
    }
  }

  async get(hash: string): Promise<any> {
    if (!this.enabled) return null;
    return this.cache[hash] || null;
  }

  async set(hash: string, description: string, model: string): Promise<void> {
    if (!this.enabled) return;
    this.cache[hash] = { description, model, timestamp: Date.now(), hits: 0 };
    await this.save();
  }

  async save(): Promise<void> {
    await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2));
  }

  async getStats(): Promise<any> {
    if (!this.enabled) return { enabled: false };
    const entries = Object.values(this.cache);
    return {
      enabled: true,
      entries: entries.length,
      totalHits: entries.reduce((sum, e: any) => sum + e.hits, 0),
    };
  }
}

describe('CacheService Logic', () => {
  let tempDir: string;
  let cacheService: TestCacheService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('init', () => {
    it('debe crear directorio de cache si no existe', async () => {
      cacheService = new TestCacheService(tempDir, true);
      await cacheService.init();

      const stats = await fs.stat(tempDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('debe cargar cache existente', async () => {
      const cacheData = {
        hash1: { description: 'test', model: 'gemini', timestamp: Date.now(), hits: 0 },
      };
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'descriptions.json'),
        JSON.stringify(cacheData)
      );

      cacheService = new TestCacheService(tempDir, true);
      await cacheService.init();
      const entry = await cacheService.get('hash1');

      expect(entry).not.toBeNull();
      expect(entry.description).toBe('test');
    });

    it('debe crear cache vacío si archivo no existe', async () => {
      cacheService = new TestCacheService(tempDir, true);
      await cacheService.init();

      const stats = await cacheService.getStats();
      expect(stats.enabled).toBe(true);
      expect(stats.entries).toBe(0);
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      cacheService = new TestCacheService(tempDir, true);
      await cacheService.init();
      await cacheService.set('hash1', 'description1', 'model1');
    });

    it('debe retornar null si cache está deshabilitado', async () => {
      const disabledService = new TestCacheService(tempDir, false);
      const result = await disabledService.get('hash1');
      expect(result).toBeNull();
    });

    it('debe retornar entrada existente', async () => {
      const entry = await cacheService.get('hash1');
      expect(entry).not.toBeNull();
      expect(entry.description).toBe('description1');
    });

    it('debe retornar null para hash inexistente', async () => {
      const entry = await cacheService.get('nonexistent');
      expect(entry).toBeNull();
    });
  });

  describe('set', () => {
    beforeEach(async () => {
      cacheService = new TestCacheService(tempDir, true);
      await cacheService.init();
    });

    it('debe guardar nueva entrada', async () => {
      await cacheService.set('newhash', 'new description', 'gemini-pro');

      const entry = await cacheService.get('newhash');
      expect(entry).not.toBeNull();
      expect(entry.description).toBe('new description');
      expect(entry.model).toBe('gemini-pro');
    });

    it('debe hacer nada si cache está deshabilitado', async () => {
      const disabledService = new TestCacheService(tempDir, false);
      await disabledService.set('hash', 'desc', 'model');
      
      const entry = await disabledService.get('hash');
      expect(entry).toBeNull();
    });

    it('debe sobrescribir entrada existente', async () => {
      await cacheService.set('hash1', 'original', 'model');
      await cacheService.set('hash1', 'updated', 'model2');

      const entry = await cacheService.get('hash1');
      expect(entry.description).toBe('updated');
      expect(entry.model).toBe('model2');
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      cacheService = new TestCacheService(tempDir, true);
      await cacheService.init();
    });

    it('debe retornar stats cuando está habilitado', async () => {
      await cacheService.set('hash1', 'desc1', 'model');
      await cacheService.set('hash2', 'desc2', 'model');

      const stats = await cacheService.getStats();

      expect(stats.enabled).toBe(true);
      expect(stats.entries).toBe(2);
    });

    it('debe retornar enabled:false cuando está deshabilitado', async () => {
      const disabledService = new TestCacheService(tempDir, false);
      const stats = await disabledService.getStats();
      
      expect(stats.enabled).toBe(false);
    });

    it('debe contar entradas correctamente', async () => {
      const stats0 = await cacheService.getStats();
      expect(stats0.entries).toBe(0);

      await cacheService.set('hash1', 'desc', 'model');
      const stats1 = await cacheService.getStats();
      expect(stats1.entries).toBe(1);

      await cacheService.set('hash2', 'desc', 'model');
      const stats2 = await cacheService.getStats();
      expect(stats2.entries).toBe(2);
    });
  });
});
