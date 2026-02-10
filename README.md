# DeepSeek Multimodal Proxy (Gemini Edition)

Proxy HTTP OpenAI-compatible que implementa **arquitectura "Córtex Sensorial"** para añadir capacidades multimodales a DeepSeek utilizando **Google Gemini 2.5 Flash Lite** como sistema de percepción.

## 🎯 Arquitectura "Córtex Sensorial"

### **Visión Conceptual**

- **DeepSeek = Cerebro**: Lógica, código, razonamiento puro
- **Gemini 2.5 Flash Lite = Sentidos**: Percepción multimodal (imágenes, audio, video, documentos, PDFs)
- **Proxy = Córtex**: Routing inteligente según especialidad cognitiva

### **Características Principales**

- ✅ **Routing Inteligente Automático**: Detecta 8 tipos de contenido y decide routing óptimo
- ✅ **Multimodalidad Completa**: Imágenes, audio, video, PDFs, documentos, código, texto
- ✅ **Procesamiento Híbrido de PDFs**: Local (<1MB) para velocidad o Gemini (>1MB) para calidad/OCR
- ✅ **Descarga Automática con Validación**: URLs con validación Content-Type real y límite de 50MB
- ✅ **Caché Contextual SHA-256**: Hash único por contenido + pregunta (Evita re-procesamiento)
- ✅ **Streaming SSE**: Soporte nativo para respuestas en tiempo real (compatible con OpenCode)
- ✅ **Optimizado para OpenCode**: Mapeo transparente de modalidades `text`, `image`, `audio`, `video`, `pdf`

## 📦 Requisitos

- **Node.js** >= 18.0.0
- **DeepSeek API Key** (Para razonamiento/texto)
- **Google Gemini API Key** (Para percepción multimodal)

## 🚀 Instalación Rápida

### Opción 1: Script Automático (Recomendado)

```bash
cd /home/exithial/Proyectos/deepseek-multimodal-proxy
./scripts/setup-deepseek-proxy.sh
```

Esto configurará todo automáticamente:

- Recompila el proyecto con TypeScript
- Instala el servicio systemd `deepseek-proxy`
- Verifica la disponibilidad del servicio y los modelos

### Opción 2: Instalación Manual

```bash
# 1. Instalar dependencias
npm install

# 2. Compilar
npm run build

# 3. Configurar .env
cp .env.example .env # Y editar con tus claves

# 4. Iniciar servicio
sudo systemctl enable --now deepseek-proxy
```

## 🔌 Integración con OpenCode

### Configuración Multimodal Completa

Agrega esto a tu `~/.config/opencode/opencode.json`:

```json
{
  "provider": {
    "deepseek-multimodal": {
      "name": "DeepSeek Multimodal (Proxy Inteligente)",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:7777/v1",
        "apiKey": "not-needed"
      },
      "models": {
        "deepseek-multimodal-chat": {
          "name": "deepseek-multimodal-chat",
          "cost": {
            "input": 0.5,
            "output": 1.5
          },
          "limit": {
            "context": 100000,
            "output": 8000
          },
          "modalities": {
            "input": ["text", "image", "audio", "video", "pdf"],
            "output": ["text"]
          }
        },
        "deepseek-multimodal-reasoner": {
          "name": "deepseek-multimodal-reasoner",
          "cost": {
            "input": 1.0,
            "output": 3.0
          },
          "limit": {
            "context": 100000,
            "output": 64000
          },
          "modalities": {
            "input": ["text", "image", "audio", "video", "pdf"],
            "output": ["text"]
          }
        }
      }
    }
  }
}
```

## 🔄 Flujo de Trabajo "Córtex Sensorial"

### **Matriz de Routing Validada**

| Contenido          | Ejemplos                  | Routing                  | Razón                                |
| :----------------- | :------------------------ | :----------------------- | :----------------------------------- |
| **Texto / Código** | `.js`, `.py`, `.md`       | 🚀 **DeepSeek directo**  | Máxima precisión lógica y sintáctica |
| **Imágenes**       | `.jpg`, `.png`, Base64    | 👁️ **Gemini → DeepSeek** | OCR superior y descripción visual    |
| **Audio**          | `.mp3`, `.wav`, `.m4a`    | 👁️ **Gemini → DeepSeek** | Transcripción y análisis de tono     |
| **Video**          | `.mp4`, `.mov`, `.webm`   | 👁️ **Gemini → DeepSeek** | Análisis temporal de frames y audio  |
| **PDF (< 1MB)**    | `invoice.pdf`             | 🏠 **Local → DeepSeek**  | Privacidad y velocidad (pdf-parse)   |
| **PDF (> 1MB)**    | `manual.pdf`              | 👁️ **Gemini → DeepSeek** | Mejor manejo de contexto y tablas    |
| **Docs**           | `.docx`, `.xlsx`, `.pptx` | 👁️ **Gemini → DeepSeek** | Extracción estructural compleja      |

### **Proceso Detallado**

1. **Recepción**: Request en puerto 7777 (compatible OpenAI)
2. **Detección**: Analiza contenido por extensión/MIME type (múltiples categorías)
3. **Routing Inteligente**: Decide según matriz anterior
4. **Procesamiento** (según tipo):

   **Para PDFs (Routing Inteligente Basado en Tamaño):**
   - **Descarga**: URL o Base64 con validación de tamaño (HEAD request para URLs)
   - **Detección de tamaño**: Automática para decidir routing óptimo
   - **Routing inteligente**:
     - **PDFs pequeños (< 1MB por defecto)**: Procesamiento local (configurable)
     - **PDFs grandes o complejos**: Gemini (mejor calidad, soporta OCR)
   - **Configurable**: Variables `PDF_LOCAL_PROCESSING` y `PDF_LOCAL_MAX_SIZE_MB`
   - **Extracción Doble Local**: pdf2json (estructurado) → pdf-parse (fallback)
   - **Análisis Gemini**: Mejor comprensión de estructura, tablas, OCR, multilenguaje
   - **Fallback automático**: Si procesamiento local falla → Gemini automáticamente
   - **Cache**: SHA-256(content + pregunta)
   - **Envío**: Texto procesado por Gemini o extraído localmente a DeepSeek

   **Para Otros Formatos (Gemini):**
   - **Descarga con Validación**: URLs con Content-Type real
   - **Hash Contextual**: SHA-256(content + user question)
   - **Caché**: Consulta local para evitar llamadas repetidas
   - **Análisis Especializado**: Prompt adaptado al tipo de contenido
   - **Transformación**: Contenido físico → Texto estructurado

5. **Respuesta**: DeepSeek genera respuesta final (streaming o batch)

### **Configuración de Procesamiento de PDFs**

El sistema implementa **routing inteligente basado en tamaño** para PDFs:

#### **Variables de Entorno (.env):**

```bash
# Procesamiento de PDFs
PDF_LOCAL_PROCESSING=true          # Habilitar procesamiento local para PDFs pequeños
PDF_LOCAL_MAX_SIZE_MB=1            # Tamaño máximo para procesamiento local (1MB por defecto)
```

#### **Comportamiento por Defecto:**

- **PDFs pequeños (< 1MB)**: Procesamiento local (sin costo API, más rápido)
- **PDFs grandes (≥ 1MB)**: Gemini (mejor calidad, soporta OCR)
- **Todo deshabilitado**: Si `PDF_LOCAL_PROCESSING=false`, todo va a Gemini

#### **Ventajas de Cada Opción:**

**Procesamiento Local (PDFs pequeños):**

- ✅ **Sin costo de API** Gemini
- ✅ **Más rápido** para PDFs de texto simple
- ✅ **Privacidad**: Datos no salen del servidor
- ✅ **Control total** sobre el procesamiento

**Gemini (PDFs grandes/complejos):**

- ✅ **Mejor calidad**: Entiende estructura, tablas, gráficos
- ✅ **OCR integrado**: Soporta PDFs escaneados/imágenes
- ✅ **Consistencia**: Mismo flujo que otros formatos
- ✅ **Análisis contextual**: Mejor comprensión del contenido
- ✅ **Multilenguaje**: Mejor soporte para idiomas diversos

#### **Fallback Automático:**

Si el procesamiento local falla (ej: PDF corrupto, formato complejo), el sistema automáticamente:

1. Detecta el error
2. Intenta procesamiento con Gemini
3. Si Gemini también falla, devuelve error informativo

### **Dependencias Locales (para procesamiento opcional):**

- **pdf-parse**: Extracción básica de texto
- **pdf2json**: Extracción estructurada (fallback)
- **pdf-lib**: Creación/manipulación de PDFs (testing)

## 🛡️ Micro-Optimizaciones Críticas

### **Validación Content-Type Real**

```typescript
// No confía en extensiones, valida headers HTTP reales
if (contentType.includes("text/html")) {
  throw new Error("URL devuelve HTML, no imagen");
}
```

### **Manejo Filtros Seguridad Gemini**

```typescript
// Fallback informativo, no error silencioso
return `[SISTEMA: Contenido bloqueado por seguridad. Describe verbalmente...]`;
```

### **Caché Contextual SHA-256**

```typescript
// Hash único por combinación contenido + pregunta
const cacheKey = sha256(content + userQuestion);
```

## 🛠️ Soporte para Herramientas (Tools)

El proxy soporta completamente las herramientas de OpenAI (`tools` y `tool_choice`):

- **Forward transparente**: Tools reenviadas directamente a DeepSeek
- **Compatible con multimodalidad**: Funciona después del procesamiento Gemini
- **Streaming**: Soporta tools en modo streaming y batch

## 📊 Endpoints & Métricas

| Endpoint               | Método | Descripción                         |
| ---------------------- | ------ | ----------------------------------- |
| `/v1/chat/completions` | POST   | Chat multimodal (compatible OpenAI) |
| `/v1/cache/stats`      | GET    | Estadísticas de caché contextual    |
| `/v1/models`           | GET    | Lista de modelos multimodales       |
| `/health`              | GET    | Estado del servicio + versión       |

### **Métricas Técnicas**

- **Tamaño máximo**: **50MB por archivo** (límite oficial de Gemini API)
- **Validación previa**: HEAD requests detectan archivos > 50MB antes de descargar
- **Timeout descarga**: **120 segundos** para archivos grandes
- **Caché TTL**: 7 días (configurable)
- **Puerto default**: 7777
- **API compatible**: OpenAI 100%
- **Formatos soportados**:
  - **Imágenes**: JPEG, PNG, GIF, WebP, BMP, TIFF, SVG
  - **Audio**: MP3, WAV (testeado con MP3 real)
  - **Video**: MP4, MOV (testeado con MP4 real)
  - **Documentos**: PDF (✅ Gemini SÍ soporta), Excel, Word, PowerPoint
  - **Procesamiento local opcional**: PDFs pequeños (< 1MB) configurable

## 🛠️ Comandos Útiles

```bash
# Scripts de gestión automática
./scripts/setup-deepseek-proxy.sh      # Instalación completa
./scripts/check-proxy-status.sh        # Verificación de estado
./scripts/uninstall-proxy.sh           # Desinstalación limpia

# Verificación básica
curl http://localhost:7777/health
# {"status":"ok","service":"deepseek-multimodal-proxy","version":"1.3.0"}

# Pruebas integrales
node test/test-complete-multimodal.js
node test/test-micro-optimizations.js

# Monitoreo en producción
journalctl -u deepseek-proxy -f  # Logs en tiempo real
curl http://localhost:7777/v1/cache/stats  # Estadísticas caché
```

## ✅ Estado Actual

**Versión 1.3.0 - Listo para Producción**

### **Implementado:**

- ✅ Arquitectura "Córtex Sensorial" completa
- ✅ Routing inteligente automático (7 tipos de contenido)
- ✅ Descarga con validación robusta (Content-Type real)
- ✅ Manejo informativo de filtros seguridad Gemini
- ✅ Caché contextual SHA-256 eficiente
- ✅ Backward compatible 100% con OpenAI
- ✅ Integración completa con OpenCode
- ✅ **Audio/Video soportados** (MP3/MP4 testeado con archivos reales)
- ✅ **Límite 50MB** con validación HEAD previa
- ✅ **PDFs soportados por Gemini** (✅ application/pdf MIME type)
- ✅ **Procesamiento local opcional** para PDFs pequeños

### **Beneficios Clave:**

1. **Unificación**: Un proxy para todos los contenidos
2. **Calidad**: Cada modelo hace lo que mejor sabe
3. **Consistencia**: Mismo procesamiento para URLs/Base64
4. **Robustez**: No se rompe silenciosamente
5. **Eficiencia**: Caché reduce costos y latencia

## 📝 Licencia

MIT
