# DeepSeek Multimodal Proxy (Gemini Edition)

![License](https://img.shields.io/github/license/exithial/deepseek-multimodal-proxy?style=flat-square)
![Version](https://img.shields.io/github/package-json/v/exithial/deepseek-multimodal-proxy?style=flat-square)
![Node Version](https://img.shields.io/node/v/deepseek-multimodal-proxy?style=flat-square)

Proxy HTTP OpenAI-compatible que implementa **arquitectura "Córtex Sensorial"** para añadir capacidades multimodales a DeepSeek utilizando **Google Gemini 2.5 Flash Lite** como sistema de percepción.

## 🎯 Arquitectura "Córtex Sensorial"

### **Visión Conceptual**

- **DeepSeek = Cerebro**: Lógica, código, razonamiento puro
- **Gemini 2.5 Flash Lite = Sentidos**: Percepción multimodal (imágenes, audio, video, documentos, PDFs)
- **Proxy = Córtex**: Routing inteligente según especialidad cognitiva

### **Características Principales**

- ✅ **Routing Inteligente Automático**: Detecta 8 tipos de contenido y decide routing óptimo
- ✅ **Multimodalidad Completa**: Imágenes, audio, video, PDFs, documentos, código, texto
- ✅ **Modo Directo**: Usa `gemini-direct` para bypassing DeepSeek y obtener respuestas ultra-rápidas directamente de Gemini
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
git clone https://github.com/exithial/deepseek-multimodal-proxy.git
cd deepseek-multimodal-proxy
./scripts/setup.sh
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

# 4. Iniciar servicio (vía script unificado)
./scripts/manage.sh start
```

## 🧪 Pruebas

```bash
npm run test:master
npm run test:claude
npm run test:all
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
          "cost": { "input": 0.5, "output": 1.5 },
          "limit": { "context": 100000, "output": 8000 },
          "modalities": {
            "input": ["text", "image", "audio", "video", "pdf"],
            "output": ["text"]
          }
        },
        "deepseek-multimodal-reasoner": {
          "name": "deepseek-multimodal-reasoner",
          "cost": { "input": 1.0, "output": 3.0 },
          "limit": { "context": 100000, "output": 64000 },
          "modalities": {
            "input": ["text", "image", "audio", "video", "pdf"],
            "output": ["text"]
          }
        },
        "gemini-direct": {
          "name": "gemini-direct",
          "cost": { "input": 0.0, "output": 0.0 },
          "limit": { "context": 1000000, "output": 8192 },
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

## 🤖 Integración con Claude Code (Anthropic)

Configura el CLI para usar el proxy como backend Anthropic:

```bash
export ANTHROPIC_BASE_URL="http://localhost:7777"
```

Tambien puedes configurar `.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "test",
    "ANTHROPIC_API_KEY": "test",
    "ANTHROPIC_BASE_URL": "http://localhost:7777",
    "ANTHROPIC_MODEL": "sonnet",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "opus",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "sonnet",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "haiku",
    "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet",
    "ENABLE_EXPERIMENTAL_MCP_CLI": "true"
  },
  "model": "sonnet"
}
```

Modelos disponibles para Claude Code:

- `haiku` → **gemini-direct** (rápido/económico, bypass total de DeepSeek)
- `sonnet` → **deepseek-multimodal-chat** (routing inteligente por contenido)
- `opus` → **deepseek-multimodal-reasoner** (routing inteligente por contenido)

### **Routing Inteligente por Modelo**

El proxy implementa routing automático basado en el modelo:

- **Haiku**: Todo va a `gemini-direct` para máxima velocidad
- **Sonnet/Opus**: Routing inteligente según tipo de contenido:
  - **Texto/código** → DeepSeek directo
  - **Imágenes/audio/video** → Gemini → DeepSeek
  - **PDFs pequeños** → Procesamiento local → DeepSeek
  - **PDFs grandes** → Gemini → DeepSeek

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

#### **Ventajas de Cada Opción:**

**Procesamiento Local (PDFs pequeños):**

- ✅ **Sin costo de API** Gemini
- ✅ **Más rápido** para PDFs de texto simple
- ✅ **Privacidad**: Datos no salen del servidor

**Gemini (PDFs grandes/complejos):**

- ✅ **Mejor calidad**: Entiende estructura, tablas, gráficos
- ✅ **OCR integrado**: Soporta PDFs escaneados/imágenes
- ✅ **Multilenguaje**: Mejor soporte para idiomas diversos

## 🛡️ Micro-Optimizaciones Críticas

### **Validación Content-Type Real**

```typescript
// No confía en extensiones, valida headers HTTP reales
if (contentType.includes("text/html")) {
  throw new Error("URL devuelve HTML, no un tipo de archivo válido");
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

## �️ Soporte para Herramientas (Tools)

El proxy soporta completamente las herramientas de OpenAI (`tools` y `tool_choice`):

- **Forward transparente**: Tools reenviadas directamente a DeepSeek
- **Compatible con multimodalidad**: Funciona después del procesamiento Gemini

## �📊 Endpoints & Métricas

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
- **Formatos soportados**:
  - **Imágenes**: JPEG, PNG, GIF, WebP, BMP, TIFF, SVG
  - **Audio**: MP3, WAV
  - **Video**: MP4, MOV
  - **Documentos**: PDF, Excel, Word, PowerPoint

## 🧪 Pruebas y Gestión

Usa el script unificado `manage.sh` para controlar el proxy:

```bash
./scripts/manage.sh start      # Iniciar servicio
./scripts/manage.sh stop       # Detener servicio
./scripts/manage.sh status     # Ver estado y salud de la API
./scripts/manage.sh logs       # Ver logs en tiempo real
./scripts/manage.sh uninstall  # Eliminar el servicio del sistema
```

Para pruebas rápidas sin instalación:

```bash
./scripts/run-local.sh
```

**Verificación Integral:**

```bash
node test/test-master.js
```

## ✅ Estado Actual - Versión 1.5.0

- ✅ **Arquitectura "Córtex Sensorial"** completa
- ✅ **Routing inteligente por modelo** (haiku → gemini-direct, sonnet/opus → deepseek-routing)
- ✅ **Soporte completo Claude Code** con tipos de contenido extendidos (input_audio, clipboard, file)
- ✅ **Descarga con validación robusta** (Content-Type real)
- ✅ **Caché contextual SHA-256** eficiente
- ✅ **Audio/Video soportados** (MP3/MP4 testeados)
- ✅ **PDFs soportados** vía Gemini o localmente

## ☕ Soporte y Café

Si encuentras útil este proxy y quieres apoyar el desarrollo de más herramientas de código abierto, ¡puedes invitarme a un café!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/exithial)

## 📝 Licencia

MIT
