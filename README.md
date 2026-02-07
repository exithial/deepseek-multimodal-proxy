# DeepSeek Vision Proxy (Gemini Edition)

Proxy HTTP OpenAI-compatible que añade capacidades de visión a DeepSeek utilizando **Google Gemini 2.5 Flash** para el análisis de imágenes.

## 🎯 Características

- ✅ **Visión por Gemini 2.5 Flash**: Análisis de imágenes ultra-rápido y preciso.
- ✅ **Prompting Contextual**: El análisis de la imagen se adapta inteligentemente a la pregunta del usuario.
- ✅ **Detección multiformato**: Soporta Base64, URLs y archivos locales.
- ✅ **Caché Inteligente**: Hash contextual SHA-256 para evitar llamadas repetidas a la API (TTL configurable).
- ✅ **Streaming SSE**: Respuestas en tiempo real compatibles con clientes OpenAI.
- ✅ **Zero Overhead**: Passthrough directo si no hay imágenes.

## 📦 Requisitos

- **Node.js** >= 18.0.0
- **DeepSeek API Key**
- **Google Gemini API Key**

## 🚀 Instalación Rápida

```bash
cd /home/exithial/Proyectos/deepseek-vision-proxy
./install.sh
```

Esto instalará dependencias, compilará el proyecto y configurará el servicio systemd.

## ⚙️ Configuración

Crea o edita el archivo `.env`:

```bash
# Servidor
PORT=7777
LOG_LEVEL=info

# Gemini Vision
GEMINI_API_KEY=tu_api_key_de_google_aistudio

# Configuración del Modelo
GEMINI_MODEL=gemini-2.5-flash

# DeepSeek API
DEEPSEEK_API_KEY=sk-tu-api-key-aqui

# Caché (Recomendado)
CACHE_ENABLED=true
CACHE_TTL_DAYS=7
```

## 🔌 Integración con OpenCode

Agrega esto a tu `~/.config/opencode/opencode.json`:

```json
{
  "provider": {
    "deepseek": {
      "name": "DeepSeek Vision (Gemini Proxy)",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:7777/v1",
        "apiKey": "not-needed"
      },
      "models": {
        "vision-dsk-chat": {
          "name": "vision-dsk-chat",
          "limit": {
            "context": 100000,
            "output": 4000
          },
          "modalities": {
            "input": ["text", "image"],
            "output": ["text"]
          }
        },
        "vision-dsk-reasoner": {
          "name": "vision-dsk-reasoner",
          "limit": {
            "context": 100000,
            "output": 16000
          },
          "modalities": {
            "input": ["text", "image"],
            "output": ["text"]
          }
        },
        "deepseek-vision-chat": {
          "name": "deepseek-vision-chat",
          "limit": {
            "context": 100000,
            "output": 4000
          },
          "modalities": {
            "input": ["text", "image"],
            "output": ["text"]
          }
        },
        "deepseek-vision-reasoner": {
          "name": "deepseek-vision-reasoner",
          "limit": {
            "context": 100000,
            "output": 16000
          },
          "modalities": {
            "input": ["text", "image"],
            "output": ["text"]
          }
        }
      }
    }
  }
}
```

## 🔄 Flujo de Trabajo

1. **Recepción**: El proxy recibe el request en puerto 7777.
2. **Detección**: Analiza si el último mensaje contiene imágenes (URL o Base64).
3. **Procesamiento**:
   - **Sin imágenes**: Reenvía directamente a DeepSeek (passthrough).
   - **Con imágenes**:
     1. Calcula hash único de la imagen + contexto de la pregunta.
     2. Consulta caché local.
     3. Si no está en caché, envía a **Gemini Flash** con un prompt adaptativo.
     4. Reemplaza la imagen en el prompt original con la descripción textual generada.
4. **Respuesta**: Envía el prompt enriquecido a DeepSeek y devuelve la respuesta en stream.

## 🛠️ Soporte para Herramientas (Tools)

El proxy soporta completamente las herramientas de OpenAI (`tools` y `tool_choice`):

- **Forward transparente**: Las herramientas se reenvían directamente a DeepSeek sin modificación.
- **Compatible con imágenes**: Las herramientas funcionan incluso cuando hay imágenes en el mensaje (después de ser procesadas).
- **Streaming**: Soporta herramientas tanto en modo streaming como no-streaming.

### Ejemplo de uso con herramientas:
```json
{
  "model": "vision-dsk-chat",
  "messages": [...],
  "tools": [...],
  "tool_choice": "auto"
}
```

## 📊 Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Chat standard (compatible OpenAI) |
| `/v1/cache/stats` | GET | Estadísticas de uso del caché |
| `/v1/models` | GET | Lista de modelos |
| `/health` | GET | Estado del servicio |

## 🛠️ Comandos Útiles

```bash
# Ver estado del servicio
systemctl --user status deepseek-proxy

# Ver logs en tiempo real
journalctl --user -u deepseek-proxy -f

# Reiniciar servicio
systemctl --user restart deepseek-proxy

# Ver estadísticas de caché
curl http://localhost:7777/v1/cache/stats
```

## 📝 Licencia

MIT
