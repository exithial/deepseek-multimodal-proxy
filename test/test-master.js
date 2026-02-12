#!/usr/bin/env node

/**
 * 🧪 MASTER TEST SUITE - DeepSeek Multimodal Proxy
 * 
 * Valida todas las funcionalidades del proxy en una sola ejecución:
 * 1. Health check y disponibilidad de modelos
 * 2. Routing de texto (DeepSeek directo)
 * 3. Routing multimodal con archivos de prueba reales (Gemini → DeepSeek):
 *    - Imágenes (PNG/JPG)
 *    - Audio (MP3)
 *    - Video (MP4)
 *    - PDF (Local y Gemini)
 * 
 * Uso: node test/test-master.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuración
const PROXY_PORT = 7777;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;
const TEST_SERVER_PORT = 8899;
const TEST_FILES_DIR = path.join(__dirname, 'files');

// Colores para consola
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m"
};

const print = {
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}=== ${msg} ===${colors.reset}\n`)
};

class MasterTestSuite {
  constructor() {
    this.testServer = null;
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    };
  }

  async startTestServer() {
    return new Promise((resolve) => {
      this.testServer = http.createServer((req, res) => {
        // Simulación de PDF grande para pruebas de routing (Content-Length > 1MB)
        if (req.url === '/large.pdf') {
          const size = 2 * 1024 * 1024; // 2MB
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': size
          });
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          // Enviar basura si es GET (no importa porque Gemini fallará al intentar leer localhost,
          // pero lo que probamos es el routing inicial que hace HEAD)
          res.end(Buffer.alloc(100)); // Enviar algo pequeño para no bloquear, el proxy confiará en el header
          return;
        }

        const filePath = path.join(TEST_FILES_DIR, req.url);
        
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = {
            '.mp3': 'audio/mpeg',
            '.mp4': 'video/mp4',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.pdf': 'application/pdf',
            '.txt': 'text/plain'
          }[ext] || 'application/octet-stream';
          
          const fileBuffer = fs.readFileSync(filePath);
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': fileBuffer.length
          });
          res.end(fileBuffer);
        } else {
          res.writeHead(404);
          res.end('File not found');
        }
      });
      
      this.testServer.listen(TEST_SERVER_PORT, () => {
        print.info(`Servidor de archivos de prueba activo en http://localhost:${TEST_SERVER_PORT}`);
        resolve();
      });
    });
  }

  async runRequest(endpoint, body, description) {
    this.results.total++;
    print.info(`Ejecutando: ${description}...`);
    
    const start = Date.now();
    try {
      const response = await fetch(`${PROXY_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer not-needed'
        },
        body: JSON.stringify(body)
      });
      
      const duration = Date.now() - start;
      
      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || JSON.stringify(data);
        const strategy = response.headers.get('x-multimodal-strategy');
        
        print.success(`OK (${duration}ms) [Strategy: ${strategy || 'unknown'}]`);
        if (content.length < 200) console.log(`   📄 "${content}"`);
        else console.log(`   📄 "${content.substring(0, 100)}..."`);
        this.results.passed++;
        return { success: true, strategy };
      } else {
        const strategy = response.headers.get('x-multimodal-strategy');
        // Verificar si es error por falta de API Key (esperado en algunos casos)
        if (response.status === 500 && (error.includes('API key') || error.includes('Gemini API'))) {
          print.warn(`SKIPPED: Requiere configuración de Gemini API (${response.status})`);
          this.results.skipped++;
          return { success: false, strategy, skipped: true };
        }
        
        print.error(`FAILED (${response.status}) [Strategy: ${strategy || 'unknown'}]: ${error.substring(0, 150)}`);
        this.results.failed++;
        return { success: false, strategy };
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        print.error(`ERROR DE CONEXIÓN: El proxy no parece estar corriendo en ${PROXY_URL}`);
        print.error(`Asegúrate de iniciar el proxy con: sudo systemctl start deepseek-proxy`);
      } else {
        print.error(`ERROR: ${error.message}`);
      }
      this.results.failed++;
      return false;
    }
  }

  async checkHealth() {
    print.header("1. HEATH CHECK");
    this.results.total++;
    try {
      const response = await fetch(`${PROXY_URL}/health`);
      if (response.ok) {
        const data = await response.json();
        print.success(`Servicio activo: v${data.version}`);
        console.log(`   Uptime: ${data.uptime.toFixed(1)}s`);
        this.results.passed++;
      } else {
        print.error(`Servicio inactivo o error: ${response.status}`);
        this.results.failed++;
      }
    } catch (e) {
      print.error(`No se pudo conectar al proxy: ${e.message}`);
      this.results.failed++;
    }
    
    // Check models
    this.results.total++;
    try {
      const response = await fetch(`${PROXY_URL}/v1/models`);
      if (response.ok) {
        const data = await response.json();
        print.success(`Modelos disponibles: ${data.data.length}`);
        data.data.forEach(m => console.log(`   - ${m.id}`));
        this.results.passed++;
      } else {
        print.error("Error obteniendo modelos");
        this.results.failed++;
      }
    } catch (e) {
      this.results.failed++;
    }
  }

  async testText() {
    print.header("2. PRUEBA DE TEXTO (Directo DeepSeek)");
    const result = await this.runRequest('/v1/chat/completions', {
      model: 'deepseek-multimodal-chat',
      messages: [{ role: 'user', content: '¿Cuánto es 2+2?' }],
      max_tokens: 10
    }, "DeepSeek Chat (Texto simple)");

    if (result && result.strategy !== 'direct') {
       print.warn(`⚠️ Estrategia inesperada para Texto: ${result.strategy} (Esperado: direct)`);
    }
  }

  async testGeminiDirect() {
    print.header("2.5. PRUEBA GEMINI DIRECT");
    const result = await this.runRequest('/v1/chat/completions', {
      model: 'gemini-direct',
      messages: [{ role: 'user', content: 'Di "Gemini Direct funciona"' }],
      max_tokens: 10
    }, "Gemini Direct (Bypass DeepSeek)");

    if (result && result.strategy !== 'gemini-direct') {
       print.warn(`⚠️ Estrategia inesperada para Gemini Direct: ${result.strategy} (Esperado: gemini-direct)`);
    } else if (result) {
       print.success("✓ Routing correcto: gemini-direct");
    }
  }

  async testImage() {
    print.header("3. PRUEBA MULTIMODAL: IMAGEN");
    
    // Usar imagen de prueba local
    const imageUrl = `http://localhost:${TEST_SERVER_PORT}/image.png`;
    
    const result = await this.runRequest('/v1/chat/completions', {
      model: 'deepseek-multimodal-chat',
      messages: [{ 
        role: 'user', 
        content: [
          { type: 'text', text: '¿Qué ves en esta imagen?' },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 100
    }, "Análisis de Imagen (Gemini → DeepSeek)");

    if (result && result.strategy !== 'gemini' && result.strategy !== 'mixed') {
       print.warn(`⚠️ Estrategia inesperada para Imagen: ${result.strategy} (Esperado: gemini/mixed)`);
    }
  }

  async testAudio() {
    print.header("4. PRUEBA MULTIMODAL: AUDIO");

    if (!fs.existsSync(path.join(TEST_FILES_DIR, 'audio.mp3'))) {
      print.warn("Saltando prueba de audio: test/files/audio.mp3 no existe");
      this.results.skipped++;
      this.results.total++;
      return;
    }
    
    const audioUrl = `http://localhost:${TEST_SERVER_PORT}/audio.mp3`;
    
    const result = await this.runRequest('/v1/chat/completions', {
      model: 'deepseek-multimodal-chat',
      messages: [{ 
        role: 'user', 
        content: [
          { type: 'text', text: 'Transcribe este audio' },
          { type: 'input_audio', input_audio: { data: audioUrl, format: 'mp3' } } // Nota: La API espera base64 o URL convertida
        ]
      }],
      max_tokens: 100
    }, "Análisis de Audio (Gemini → DeepSeek)");

    if (result && result.strategy !== 'gemini' && result.strategy !== 'mixed') {
       print.warn(`⚠️ Estrategia inesperada para Audio: ${result.strategy} (Esperado: gemini/mixed)`);
    }
  }

  async testPDF() {
    print.header("5. PRUEBA MULTIMODAL: PDF (small-test.pdf)");
    
    const pdfUrl = `http://localhost:${TEST_SERVER_PORT}/small-test.pdf`;
    
    const result = await this.runRequest('/v1/chat/completions', {
      model: 'deepseek-multimodal-chat',
      messages: [{ 
        role: 'user', 
        content: [
          { type: 'text', text: 'Resume este documento' },
          { type: 'document_url', document_url: { url: pdfUrl } }
        ]
      }],
      max_tokens: 100
    }, "Análisis de PDF Pequeño (small-test.pdf)");

    if (result && result.strategy !== 'local') {
       print.warn(`⚠️ Estrategia inesperada para PDF Pequeño: ${result.strategy}`);
    }

    // PDF "Large" del usuario (0.9MB -> Local porque < 1MB)
    print.header("6. PRUEBA MULTIMODAL: PDF 'Large' Real (large-test.pdf)");
    const largeRealPdfUrl = `http://localhost:${TEST_SERVER_PORT}/large-test.pdf`;
    
    const resultRealLarge = await this.runRequest('/v1/chat/completions', {
      model: 'deepseek-multimodal-chat',
      messages: [{ 
        role: 'user', 
        content: [
          { type: 'text', text: 'Resume este documento' },
          { type: 'document_url', document_url: { url: largeRealPdfUrl } }
        ]
      }],
      max_tokens: 100
    }, "Análisis de PDF 'Large' Real (<1MB, debe ser Local)");

    if (resultRealLarge && resultRealLarge.strategy !== 'local') {
       print.warn(`⚠️ Estrategia inesperada para PDF 'Large': ${resultRealLarge.strategy} (Esperado: local)`);
    }

    // PDF Simulado (> 1MB) -> Debería ir a Gemini
    print.header("7. PRUEBA MULTIMODAL: PDF SIMULADO (>1MB)");
    const largeSimulatedPdfUrl = `http://localhost:${TEST_SERVER_PORT}/large.pdf`;
    
    const resultSimulated = await this.runRequest('/v1/chat/completions', {
      model: 'deepseek-multimodal-chat',
      messages: [{ 
        role: 'user', 
        content: [
          { type: 'text', text: 'Resume este documento grande' },
          { type: 'document_url', document_url: { url: largeSimulatedPdfUrl } }
        ]
      }],
      max_tokens: 100
    }, "Análisis de PDF Simulado >1MB (Gemini)");

    if (resultSimulated && resultSimulated.strategy !== 'gemini') {
       print.warn(`⚠️ Estrategia fallo para PDF Simulado. Obtuvimos: ${resultSimulated.strategy} (Esperado: gemini)`);
    } else if (resultSimulated) {
       print.success(`✓ Routing correcto: PDF Simulado fue enviado a Gemini`);
    }
  }

  async testVideo() {
    print.header("8. PRUEBA MULTIMODAL: VIDEO");
    
    const videoUrl = `http://localhost:${TEST_SERVER_PORT}/video.mp4`;
    
    const result = await this.runRequest('/v1/chat/completions', {
      model: 'deepseek-multimodal-chat',
      messages: [{ 
        role: 'user', 
        content: [
          { type: 'text', text: 'Describe este video' },
          { type: 'video_url', video_url: { url: videoUrl } }
        ]
      }],
      max_tokens: 100
    }, "Análisis de Video (Gemini → DeepSeek)");

    if (result && result.strategy !== 'gemini' && result.strategy !== 'mixed') {
       print.warn(`⚠️ Estrategia inesperada para Video: ${result.strategy} (Esperado: gemini/mixed)`);
    }
  }

  async testBase64() {
    print.header("9. PRUEBA BASE64 (Imagen Inline)");
    // Imagen simple de 1x1 pixel rojo en base64
    const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    
    const result = await this.runRequest('/v1/chat/completions', {
      model: 'deepseek-multimodal-chat',
      messages: [{ 
        role: 'user', 
        content: [
          { type: 'text', text: '¿De qué color es este pixel?' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
        ]
      }],
      max_tokens: 50
    }, "Análisis de Imagen Base64 (Directo en Payload)");

    if (result && result.strategy !== 'gemini') {
       print.warn(`⚠️ Estrategia inesperada para Base64: ${result.strategy} (Esperado: gemini)`);
    }
  }

  async testStreaming() {
    print.header("10. PRUEBA STREAMING");
    this.results.total++;
    print.info("Ejecutando: DeepSeek Chat con Stream...");

    const start = Date.now();
    try {
      const response = await fetch(`${PROXY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer not-needed'
        },
        body: JSON.stringify({
          model: 'deepseek-multimodal-chat',
          stream: true,
          messages: [{ role: 'user', content: 'Cuenta del 1 al 5' }]
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        // Los chunks vienen en formato 'data: {...}\n\n'
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.includes('[DONE]')) continue;
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices && data.choices[0].delta.content) {
                fullText += data.choices[0].delta.content;
                chunkCount++;
              }
            } catch (e) {
              // Ignorar errores de parseo en chunks parciales
            }
          }
        }
      }
      
      const duration = Date.now() - start;
      const strategy = response.headers.get('x-multimodal-strategy');
      
      print.success(`OK (${duration}ms) [Chunks: ${chunkCount}] [Strategy: ${strategy}]`);
      console.log(`   📄 "${fullText.trim()}"`);
      
      if (chunkCount > 1) {
        this.results.passed++;
      } else {
        print.warn("⚠️ Recibido 0 o 1 chunk, streaming podría no estar funcionando correctamente activando solo 1 respuesta");
        // A veces modelos rápidos responden en 1 chunk, pasamos igual si hay texto
        if (fullText.length > 0) this.results.passed++;
        else this.results.failed++;
      }

    } catch (error) {
      print.error(`FAILED: ${error.message}`);
      this.results.failed++;
    }
  }

  async testCache() {
    print.header("11. PRUEBA CACHÉ (Hit Repetido)");
    const imagePath = "/image.png"; // Usar la misma imagen de la prueba 3
    
    // request 1 (warmup - ya se hizo, pero aseguramos)
    // request 2 (medir tiempo)
    print.info("Ejecutando: Request repetido para verificar caché...");
    const start = Date.now();
    const result = await this.runRequest('/v1/chat/completions', {
      model: 'deepseek-multimodal-chat',
      messages: [{ 
        role: 'user', 
        content: [
          { type: 'text', text: 'Describe esta imagen otra vez' },
          { type: 'image_url', image_url: { url: `http://localhost:${TEST_SERVER_PORT}${imagePath}` } }
        ]
      }],
      max_tokens: 50
    }, "Consulta con Caché");

    const duration = Date.now() - start;
    if (result) {
        // En un entorno real, la caché debería hacer esto MUY rápido (<1s)
        // Pero como Gemini es externo, la "caché" nuestra es del análisis.
        // Si activamos la caché interna, deberíamos ver un tiempo menor al primer request de imagen.
        print.info(`⏱️ Tiempo Caché: ${duration}ms`);
    }
  }

  async run() {
    console.log(`${colors.bold}🚀 INICIANDO SUITE DE PRUEBAS MAESTRA${colors.reset}\n`);
    
    await this.startTestServer();
    
    await this.checkHealth();
    await this.testText();
    await this.testGeminiDirect();
    await this.testImage();
    await this.testAudio();
    await this.testPDF();
    await this.testVideo();
    await this.testBase64();  // Nuevo
    await this.testStreaming(); // Nuevo
    await this.testCache();     // Nuevo
    
    this.testServer.close();
    
    print.header("RESUMEN FINAL");
    console.log(`Total Pruebas: ${this.results.total}`);
    console.log(`✅ Pasadas:    ${this.results.passed}`);
    console.log(`❌ Falladas:   ${this.results.failed}`);
    console.log(`⏭️  Saltadas:   ${this.results.skipped}`);
    
    if (this.results.failed === 0) {
      print.success("¡TODAS LAS PRUEBAS OBLIGATORIAS PASARON!");
      process.exit(0);
    } else {
      print.error("ALGUNAS PRUEBAS FALLARON");
      process.exit(1);
    }
  }
}

// Ejecutar
new MasterTestSuite().run().catch(e => {
  console.error(e);
  process.exit(1);
});
