import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectImages,
  processImagesInMessages,
} from '../../../src/middleware/imageDetector';
import type { ChatMessage } from '../../../src/types/openai';

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock geminiService
const mockAnalyzeImage = vi.fn();
vi.mock('../../../src/services/geminiService', () => ({
  geminiService: {
    analyzeImage: (...args: any[]) => mockAnalyzeImage(...args),
  },
}));

describe('imageDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyzeImage.mockReset();
  });

  describe('detectImages', () => {
    it('debe retornar array vacío si no hay mensajes de usuario', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'Eres un asistente' },
        { role: 'assistant', content: 'Hola' },
      ];

      const images = detectImages(messages);

      expect(images).toHaveLength(0);
    });

    it('debe detectar imagen en formato image_url', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe esta imagen' },
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
          ],
        },
      ];

      const images = detectImages(messages);

      expect(images).toHaveLength(1);
      expect(images[0].source).toBe('https://example.com/image.png');
      expect(images[0].messageIndex).toBe(0);
      expect(images[0].contentIndex).toBe(1);
    });

    it('debe detectar múltiples imágenes image_url', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img1.png' } },
            { type: 'image_url', image_url: { url: 'https://example.com/img2.jpg' } },
          ],
        },
      ];

      const images = detectImages(messages);

      expect(images).toHaveLength(2);
      expect(images[0].source).toBe('https://example.com/img1.png');
      expect(images[1].source).toBe('https://example.com/img2.jpg');
    });

    it('debe detectar imagen base64 embebida en texto', () => {
      const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: `Mira esta imagen: ${base64Image} ¿Qué te parece?`,
        },
      ];

      const images = detectImages(messages);

      expect(images).toHaveLength(1);
      expect(images[0].source).toBe(base64Image);
    });

    it('debe detectar múltiples imágenes base64 en texto', () => {
      const base64Img1 = 'data:image/png;base64,AAAA';
      const base64Img2 = 'data:image/jpeg;base64,BBBB';
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: `Primera: ${base64Img1} Segunda: ${base64Img2}`,
        },
      ];

      const images = detectImages(messages);

      expect(images).toHaveLength(2);
      expect(images[0].source).toBe(base64Img1);
      expect(images[1].source).toBe(base64Img2);
    });

    it('debe procesar solo el último mensaje del usuario', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/old.png' } },
          ],
        },
        {
          role: 'assistant',
          content: 'Ya vi esa',
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/new.png' } },
          ],
        },
      ];

      const images = detectImages(messages);

      expect(images).toHaveLength(1);
      expect(images[0].source).toBe('https://example.com/new.png');
    });

    it('debe ignorar URLs que no son imágenes válidas', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: '' } },
            { type: 'text', text: 'Sin imagen' },
          ],
        },
      ];

      const images = detectImages(messages);

      expect(images).toHaveLength(0);
    });

    it('debe retornar array vacío si content es undefined', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          // @ts-ignore
          content: undefined,
        },
      ];

      const images = detectImages(messages);

      expect(images).toHaveLength(0);
    });
  });

  describe('processImagesInMessages', () => {
    it('debe retornar mensajes sin cambios si no hay imágenes', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hola, ¿cómo estás?' },
      ];

      const result = await processImagesInMessages(messages);

      expect(result).toEqual(messages);
      expect(mockAnalyzeImage).not.toHaveBeenCalled();
    });

    it('debe procesar imagen y reemplazar con descripción', async () => {
      mockAnalyzeImage.mockResolvedValue('Una imagen de un gato');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: '¿Qué ves?' },
            { type: 'image_url', image_url: { url: 'https://example.com/cat.png' } },
          ],
        },
      ];

      const result = await processImagesInMessages(messages);

      expect(mockAnalyzeImage).toHaveBeenCalledWith(
        'https://example.com/cat.png',
        '¿Qué ves?'
      );
      expect(result[0].content).toContain('DESCRIPCIÓN IMAGEN');
      expect(result[0].content).toContain('Una imagen de un gato');
    });

    it('debe procesar múltiples imágenes en paralelo', async () => {
      mockAnalyzeImage
        .mockResolvedValueOnce('Primera imagen')
        .mockResolvedValueOnce('Segunda imagen');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img1.png' } },
            { type: 'image_url', image_url: { url: 'https://example.com/img2.png' } },
          ],
        },
      ];

      const result = await processImagesInMessages(messages);

      expect(mockAnalyzeImage).toHaveBeenCalledTimes(2);
      expect(result[0].content).toContain('Primera imagen');
      expect(result[0].content).toContain('Segunda imagen');
    });

    it('debe lanzar error si se excede el límite de imágenes', async () => {
      process.env.MAX_IMAGES_PER_REQUEST = '2';

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/1.png' } },
            { type: 'image_url', image_url: { url: 'https://example.com/2.png' } },
            { type: 'image_url', image_url: { url: 'https://example.com/3.png' } },
          ],
        },
      ];

      await expect(processImagesInMessages(messages)).rejects.toThrow('Demasiadas imágenes');
    });

    it('debe manejar errores de geminiService', async () => {
      mockAnalyzeImage.mockRejectedValue(new Error('API Error'));

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      await expect(processImagesInMessages(messages)).rejects.toThrow('API Error');
    });

    it('debe extraer contexto correctamente para análisis', async () => {
      mockAnalyzeImage.mockResolvedValue('Descripción');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe detalladamente' },
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      await processImagesInMessages(messages);

      expect(mockAnalyzeImage).toHaveBeenCalledWith(
        expect.any(String),
        'Describe detalladamente'
      );
    });

    it('no debe mutar mensajes originales', async () => {
      mockAnalyzeImage.mockResolvedValue('Descripción');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      const originalContent = JSON.stringify(messages[0].content);
      await processImagesInMessages(messages);

      expect(JSON.stringify(messages[0].content)).toBe(originalContent);
    });
  });
});
