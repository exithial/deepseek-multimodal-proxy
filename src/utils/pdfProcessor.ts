// Para pdf-parse v2, necesitamos importar de manera diferente
const pdfParse = require('pdf-parse');
import PDFParser from 'pdf2json';
import { logger } from './logger';
import { getErrorMessage } from './error';

export interface PDFExtractionResult {
  text: string;
  metadata: {
    pages: number;
    info?: any;
    metadata?: any;
  };
  structured?: {
    pages: Array<{
      page: number;
      text: string;
      lines?: string[];
    }>;
  };
}

/**
 * Procesador local de PDFs con múltiples estrategias de extracción
 */
export class PDFProcessor {
  private static instance: PDFProcessor;

  private constructor() {}

  static getInstance(): PDFProcessor {
    if (!PDFProcessor.instance) {
      PDFProcessor.instance = new PDFProcessor();
    }
    return PDFProcessor.instance;
  }

  /**
   * Extrae texto de un PDF usando pdf-parse (más simple y rápido)
   */
  async extractTextWithPDFParse(pdfBuffer: Buffer): Promise<PDFExtractionResult> {
    try {
      logger.info('📄 Extrayendo texto de PDF con pdf-parse...');
      const startTime = Date.now();

      // Usar la API más simple de pdf-parse
      // En v2, necesitamos crear una instancia de PDFParse
      const PDFParseClass = pdfParse.PDFParse || pdfParse.default?.PDFParse || pdfParse;
      const parser = new PDFParseClass({ data: pdfBuffer });
      const data = await parser.getText();
      const info = await parser.getInfo();
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`✓ PDF procesado con pdf-parse en ${elapsed}s (${data.total} páginas)`);

      return {
        text: data.text,
        metadata: {
          pages: data.total,
          info: info,
          metadata: {}
        }
      };
    } catch (error: unknown) {
      logger.error(`✗ Error con pdf-parse: ${getErrorMessage(error)}`);
      throw new Error(`Falló extracción con pdf-parse: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Extrae texto estructurado de un PDF usando pdf2json (más detallado)
   */
  async extractStructuredWithPDF2JSON(pdfBuffer: Buffer): Promise<PDFExtractionResult> {
    return new Promise((resolve, reject) => {
      try {
        logger.info('📄 Extrayendo texto estructurado de PDF con pdf2json...');
        const startTime = Date.now();

        const pdfParser = new PDFParser();

        pdfParser.on('pdfParser_dataError', (error: any) => {
          logger.error(`✗ Error en pdf2json: ${error.parserError}`);
          reject(new Error(`Falló extracción con pdf2json: ${error.parserError}`));
        });

        pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          
          // Extraer texto de todas las páginas
          let fullText = '';
          const pages: Array<{ page: number; text: string; lines: string[] }> = [];

          if (pdfData.Pages && Array.isArray(pdfData.Pages)) {
            pdfData.Pages.forEach((page: any, index: number) => {
              let pageText = '';
              const pageLines: string[] = [];

              if (page.Texts && Array.isArray(page.Texts)) {
                page.Texts.forEach((textObj: any) => {
                  if (textObj.R && Array.isArray(textObj.R)) {
                    textObj.R.forEach((r: any) => {
                      if (r.T) {
                        // Decodificar texto (pdf2json usa encoding especial)
                        const decodedText = decodeURIComponent(r.T);
                        pageText += decodedText;
                        
                        // Agrupar por líneas basado en posición Y
                        pageLines.push(decodedText);
                      }
                    });
                  }
                });
              }

              fullText += `\n\n--- Página ${index + 1} ---\n${pageText}`;
              pages.push({
                page: index + 1,
                text: pageText,
                lines: pageLines
              });
            });
          }

          logger.info(`✓ PDF procesado con pdf2json en ${elapsed}s (${pages.length} páginas)`);

          resolve({
            text: fullText.trim(),
            metadata: {
              pages: pages.length,
              info: pdfData.Meta,
              metadata: pdfData.Info
            },
            structured: {
              pages
            }
          });
        });

        // Parsear el PDF
        pdfParser.parseBuffer(pdfBuffer);

      } catch (error: unknown) {
        logger.error(`✗ Error inicializando pdf2json: ${getErrorMessage(error)}`);
        reject(new Error(`Falló inicialización de pdf2json: ${getErrorMessage(error)}`));
      }
    });
  }

  /**
   * Extrae texto de un PDF usando la mejor estrategia disponible
   * Intenta pdf-parse primero, si falla intenta pdf2json
   */
  async extractText(pdfBuffer: Buffer, preferStructured: boolean = false): Promise<PDFExtractionResult> {
    try {
      // Por defecto usar pdf-parse (más rápido y simple)
      if (!preferStructured) {
        return await this.extractTextWithPDFParse(pdfBuffer);
      }
      
      // Si se prefiere estructurado, usar pdf2json
      return await this.extractStructuredWithPDF2JSON(pdfBuffer);
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      logger.warn(`⚠️ Primera estrategia falló: ${errorMsg}`);
      
      // Intentar con la otra estrategia como fallback
      try {
        logger.info('🔄 Intentando estrategia alternativa...');
        if (preferStructured) {
          return await this.extractTextWithPDFParse(pdfBuffer);
        } else {
          return await this.extractStructuredWithPDF2JSON(pdfBuffer);
        }
      } catch (fallbackError: unknown) {
        logger.error(`✗ Ambas estrategias fallaron: ${getErrorMessage(fallbackError)}`);
        throw new Error(`No se pudo extraer texto del PDF: ${getErrorMessage(fallbackError)}`);
      }
    }
  }

  /**
   * Analiza un PDF y genera una descripción para DeepSeek
   */
  async analyzePDF(pdfBuffer: Buffer, userContext: string = ''): Promise<string> {
    try {
      logger.info('🔍 Analizando PDF localmente...');
      const startTime = Date.now();

      // Extraer texto (usar estructurado para mejor análisis)
      const result = await this.extractText(pdfBuffer, true);
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`✓ PDF analizado localmente en ${elapsed}s`);

      // Generar descripción estructurada
      return this.generatePDFDescription(result, userContext);

    } catch (error: unknown) {
      logger.error(`✗ Error analizando PDF: ${getErrorMessage(error)}`);
      throw new Error(`Falló análisis local de PDF: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Genera una descripción estructurada del contenido del PDF
   */
  private generatePDFDescription(result: PDFExtractionResult, userContext: string = ''): string {
    const { text, metadata, structured } = result;
    
    // Limitar texto si es muy largo (para no exceder límites de contexto)
    const maxTextLength = 15000;
    const truncatedText = text.length > maxTextLength 
      ? text.substring(0, maxTextLength) + `\n\n[Texto truncado: ${text.length - maxTextLength} caracteres omitidos]`
      : text;

    // Analizar tipo de documento basado en contenido
    const docType = this.analyzeDocumentType(text);
    
    // Generar descripción estructurada
    let description = `[ANÁLISIS LOCAL DE PDF - ${docType}]\n\n`;
    
    if (userContext) {
      description += `CONTEXTO DEL USUARIO: "${userContext}"\n\n`;
    }
    
    description += `METADATOS:\n`;
    description += `- Páginas: ${metadata.pages}\n`;
    if (metadata.info && metadata.info.Title) {
      description += `- Título: ${metadata.info.Title}\n`;
    }
    if (metadata.info && metadata.info.Author) {
      description += `- Autor: ${metadata.info.Author}\n`;
    }
    
    description += `\nESTRUCTURA DEL DOCUMENTO:\n`;
    if (structured && structured.pages.length > 0) {
      description += `- Total de páginas: ${structured.pages.length}\n`;
      
      // Resumen por páginas (solo primeras 5 para no hacerlo muy largo)
      const pagesToShow = Math.min(5, structured.pages.length);
      description += `- Resumen de primeras ${pagesToShow} páginas:\n`;
      
      for (let i = 0; i < pagesToShow; i++) {
        const page = structured.pages[i];
        const pagePreview = page.text.substring(0, 200).replace(/\n/g, ' ');
        description += `  Página ${page.page}: ${pagePreview}...\n`;
      }
      
      if (structured.pages.length > pagesToShow) {
        description += `  ... y ${structured.pages.length - pagesToShow} páginas más\n`;
      }
    }
    
    description += `\nCONTENIDO EXTRACTADO:\n`;
    description += `"${truncatedText}"\n\n`;
    
    description += `ANÁLISIS AUTOMÁTICO:\n`;
    description += `- Tipo de documento: ${docType}\n`;
    description += `- Longitud total: ${text.length} caracteres\n`;
    description += `- Densidad de información: ${this.calculateInformationDensity(text)}\n`;
    
    if (this.containsTables(text)) {
      description += `- Contiene tablas de datos\n`;
    }
    
    if (this.containsCode(text)) {
      description += `- Contiene código fuente\n`;
    }
    
    description += `\nINSTRUCCIONES PARA DEEPSEEK:\n`;
    description += `Este es un PDF procesado localmente. Analiza el contenido extraído y responde según el contexto del usuario.`;
    
    return description;
  }

  /**
   * Analiza el tipo de documento basado en el contenido
   */
  private analyzeDocumentType(text: string): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('contrato') || lowerText.includes('acuerdo') || lowerText.includes('cláusula')) {
      return 'Documento Legal';
    }
    
    if (lowerText.includes('invoice') || lowerText.includes('factura') || lowerText.includes('bill')) {
      return 'Factura/Invoice';
    }
    
    if (lowerText.includes('report') || lowerText.includes('informe') || lowerText.includes('análisis')) {
      return 'Reporte/Informe';
    }
    
    if (lowerText.includes('resume') || lowerText.includes('curriculum') || lowerText.includes('cv')) {
      return 'Currículum';
    }
    
    if (lowerText.includes('function') || lowerText.includes('def ') || lowerText.includes('class ') || 
        lowerText.includes('import ') || lowerText.includes('export ')) {
      return 'Documento Técnico/Código';
    }
    
    if (lowerText.includes('table') || lowerText.includes('tabla') || 
        (text.match(/\d+\s+\d+\s+\d+/g) || []).length > 5) {
      return 'Documento con Datos Tabulares';
    }
    
    return 'Documento General';
  }

  /**
   * Calcula densidad de información (palabras únicas vs totales)
   */
  private calculateInformationDensity(text: string): string {
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const uniqueWords = new Set(words.map(word => word.toLowerCase()));
    
    const density = (uniqueWords.size / words.length) * 100;
    
    if (density > 70) return 'Alta (documento diverso)';
    if (density > 40) return 'Media';
    return 'Baja (mucho texto repetido)';
  }

  /**
   * Detecta si el texto contiene tablas
   */
  private containsTables(text: string): boolean {
    // Patrones simples para detectar tablas
    const tablePatterns = [
      /\|\s*.+\s*\|/g,  // Markdown tables
      /\+\-+\+/g,       // ASCII tables
      /\s{2,}.+\s{2,}.+/g,  // Aligned columns
    ];
    
    return tablePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Detecta si el texto contiene código
   */
  private containsCode(text: string): boolean {
    const codePatterns = [
      /function\s+\w+\(/,
      /class\s+\w+/,
      /import\s+.+from/,
      /def\s+\w+\(/,
      /public\s+class/,
      /<\?php/,
      /<script>/,
      /#include/,
    ];
    
    return codePatterns.some(pattern => pattern.test(text));
  }
}

export const pdfProcessor = PDFProcessor.getInstance();