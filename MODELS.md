# Límites de Contexto de Modelos

## Modelos OpenCode (OpenAI API)

### DeepSeek Chat

- **Contexto máximo**: 128,000 tokens
- **Generación máxima**: 8,000 tokens
- **Características**: Modelo general de chat

### DeepSeek Reasoner

- **Contexto máximo**: 128,000 tokens
- **Generación máxima**: 64,000 tokens
- **Características**: Modelo de razonamiento mejorado

## Modelos con Visión (OpenCode)

### 🖼️ Modelos Multimodales con Gemini 2.5 Flash Lite

Todos los modelos ahora usan **Gemini 2.5 Flash Lite** para análisis multimodal avanzado:

- **Procesamiento Universal**: Cualquier modelo que pase por el proxy tiene multimodalidad habilitada.
- **Análisis de Imágenes**: OCR superior y descripción visual.
- **Análisis de Audio/Video**: Transcripción y descripción contextual (MP3/MP4 validados).
- **Soporte de PDFs**: Sistema híbrido. Gemini soporta PDFs nativamente para análisis de tablas/gráficos complejos. El proxy añade procesamiento local para archivos < 1MB por velocidad y costo.
- **Caché Contextual**: Hash SHA-256(content + pregunta) para evitar llamadas Gemini repetidas.
- **Límite por archivo**: **50MB** (Con validación HEAD previa para evitar descargas innecesarias).

### 🔄 Enrutamiento Inteligente

El proxy detecta automáticamente el destino basado en el modelo solicitado:

```typescript
"deepseek-multimodal-chat"     → DeepSeek Chat (v3.2) + Gemini Percepción
"deepseek-multimodal-reasoner" → DeepSeek Reasoner (r1) + Gemini Percepción
```

### 📊 Modelos Disponibles en el Proxy

| Modelo Proxy                   | Modelo Destino      | Contexto (Input) | Salida (Output) | Modalidades                       |
| :----------------------------- | :------------------ | :--------------- | :-------------- | :-------------------------------- |
| `deepseek-multimodal-chat`     | `deepseek-chat`     | 100K             | 8K              | ✅ Text, Image, Audio, Video, PDF |
| `deepseek-multimodal-reasoner` | `deepseek-reasoner` | 100K             | 64K             | ✅ Text, Image, Audio, Video, PDF |

## Modelos Claude Code (Anthropic)

Los clientes Anthropic usan `/v1/messages` y estos alias:

| Modelo Claude | Modelo Interno             | Routing Estratégico |
| :------------ | :------------------------- | :-- |
| `haiku`       | `gemini-direct`            | **Bypass total**: Todo va a Gemini, sin DeepSeek |
| `sonnet`      | `deepseek-multimodal-chat` | **Inteligente**: Texto → DeepSeek, Multimodal → Gemini → DeepSeek |
| `opus`        | `deepseek-multimodal-reasoner` | **Inteligente**: Texto → DeepSeek, Multimodal → Gemini → DeepSeek |

### **Routing Inteligente por Modelo**

- **Haiku**: Estrategia `gemini-direct` para máxima velocidad y economía
- **Sonnet/Opus**: Estrategia `deepseek-routing` con análisis de contenido:
  - **Texto/código**: DeepSeek directo
  - **Imágenes/audio/video**: Gemini → DeepSeek
  - **PDFs**: Procesamiento local o Gemini → DeepSeek

### Configuración de Límites (vía .env)

Los límites son personalizables para adaptarse a las cuotas de tu API de DeepSeek:

- **Chat**: 100,000 contextual / 8,000 generación.
- **Reasoner**: 100,000 contextual / 64,000 generación.

```json
{
  "context": 100000,
  "output": 8000,
  "cost": {
    "input": 0.27,
    "output": 1.1
  }
}
```

### Para DeepSeek Reasoner:

```json
{
  "context": 100000,
  "output": 64000,
  "cost": {
    "input": 0.55,
    "output": 2.19
  }
}
```
