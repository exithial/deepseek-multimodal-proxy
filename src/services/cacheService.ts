import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/error';

interface CacheEntry {
  description: string;
  model: string;
  timestamp: number;
  hits: number;
}

interface CacheData {
  [hash: string]: CacheEntry;
}

export interface CacheStats {
  enabled: boolean;
  entries?: number;
  maxEntries?: number;
  totalHits?: number;
  totalMisses?: number;
  hitRate?: string;
  oldestEntry?: string | null;
  newestEntry?: string | null;
  diskUsage?: string;
  ttlDays?: number;
}

class CacheService {
  private cacheDir: string;
  private cacheFile: string;
  private cache: CacheData = {};
  private enabled: boolean;
  private ttlDays: number;
  private maxEntries: number;

  constructor() {
    this.cacheDir = path.resolve(process.env.CACHE_DIR || './cache');
    this.cacheFile = path.join(this.cacheDir, 'descriptions.json');
    this.enabled = process.env.CACHE_ENABLED === 'true';
    this.ttlDays = parseInt(process.env.CACHE_TTL_DAYS || '7');
    this.maxEntries = parseInt(process.env.CACHE_MAX_ENTRIES || '1000');
  }

  async init(): Promise<void> {
    if (!this.enabled) {
      logger.info('Cache deshabilitado');
      return;
    }

    try {
      // Crear directorio si no existe
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Cargar caché existente
      try {
        const data = await fs.readFile(this.cacheFile, 'utf-8');
        this.cache = JSON.parse(data);
        const entries = Object.keys(this.cache).length;
        logger.info(`Cache cargado: ${entries} entradas`);
        
        // Limpiar entradas expiradas
        await this.cleanExpired();
      } catch (error: unknown) {
        if (this.isEnoentError(error)) {
          logger.info('Creando nuevo archivo de cache');
          this.cache = {};
          await this.save();
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error('Error inicializando cache:', getErrorMessage(error));
      this.enabled = false;
    }
  }

  private isEnoentError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'ENOENT'
    );
  }

  async get(hash: string): Promise<CacheEntry | null> {
    if (!this.enabled) return null;

    const entry = this.cache[hash];
    if (!entry) return null;

    // Verificar si expiró
    const age = Date.now() - entry.timestamp;
    const maxAge = this.ttlDays * 24 * 60 * 60 * 1000;
    
    if (age > maxAge) {
      logger.debug(`Cache expirado para hash ${hash.substring(0, 8)}...`);
      delete this.cache[hash];
      await this.save();
      return null;
    }

    return entry;
  }

  async set(hash: string, description: string, model: string): Promise<void> {
    if (!this.enabled) return;

    // Verificar límite de entradas (LRU eviction)
    if (Object.keys(this.cache).length >= this.maxEntries) {
      await this.evictOldest();
    }

    this.cache[hash] = {
      description,
      model,
      timestamp: Date.now(),
      hits: 0,
    };

    await this.save();
    logger.debug(`Guardado en cache: ${hash.substring(0, 8)}...`);
  }

  async incrementHits(hash: string): Promise<void> {
    if (!this.enabled || !this.cache[hash]) return;

    this.cache[hash].hits++;
    await this.save();
  }

  async getStats(): Promise<CacheStats> {
    if (!this.enabled) {
      return { enabled: false };
    }

    const entries = Object.values(this.cache);
    const totalHits = entries.reduce((sum, entry) => sum + entry.hits, 0);
    const totalMisses = entries.length; // Aproximación

    let oldestEntry = null;
    let newestEntry = null;
    
    if (entries.length > 0) {
      const timestamps = entries.map(e => e.timestamp);
      oldestEntry = new Date(Math.min(...timestamps)).toISOString();
      newestEntry = new Date(Math.max(...timestamps)).toISOString();
    }

    // Calcular tamaño en disco
    let diskUsage = '0 MB';
    try {
      const stats = await fs.stat(this.cacheFile);
      diskUsage = `${(stats.size / 1024 / 1024).toFixed(2)} MB`;
    } catch (error) {
      // Ignorar si no existe
    }

    return {
      enabled: true,
      entries: entries.length,
      maxEntries: this.maxEntries,
      totalHits,
      totalMisses,
      hitRate: totalMisses > 0 ? ((totalHits / (totalHits + totalMisses)) * 100).toFixed(1) : '0',
      oldestEntry,
      newestEntry,
      diskUsage,
      ttlDays: this.ttlDays,
    };
  }

  private async cleanExpired(): Promise<void> {
    const maxAge = this.ttlDays * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [hash, entry] of Object.entries(this.cache)) {
      const age = Date.now() - entry.timestamp;
      if (age > maxAge) {
        delete this.cache[hash];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Limpiadas ${cleaned} entradas expiradas del cache`);
      await this.save();
    }
  }

  private async evictOldest(): Promise<void> {
    // LRU: Eliminar la entrada más antigua (menos usada)
    let oldestHash: string | null = null;
    let oldestTime = Infinity;

    for (const [hash, entry] of Object.entries(this.cache)) {
      // Calcular score: menos hits + más antiguo = menor score
      const score = entry.hits * 1000 + entry.timestamp;
      if (score < oldestTime) {
        oldestTime = score;
        oldestHash = hash;
      }
    }

    if (oldestHash) {
      delete this.cache[oldestHash];
      logger.debug(`Evicted LRU entry: ${oldestHash.substring(0, 8)}...`);
    }
  }

  private async save(): Promise<void> {
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (error) {
      logger.error('Error guardando cache:', getErrorMessage(error));
    }
  }
}

export const cacheService = new CacheService();
