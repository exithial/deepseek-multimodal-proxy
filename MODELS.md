# Límites de Contexto de Modelos

## Modelos DeepSeek API

### DeepSeek Chat

- **Contexto máximo**: 128,000 tokens
- **Generación máxima**: 4,000 tokens
- **Características**: Modelo general de chat

### DeepSeek Reasoner

- **Contexto máximo**: 128,000 tokens
- **Generación máxima**: 16,000 tokens
- **Características**: Modelo de razonamiento mejorado

## Modelos con Visión

### 🖼️ Visión Unificada con Gemini

**Todos los modelos** (DeepSeek y Ollama) ahora usan **Gemini 2.5 Flash** para análisis de imágenes:

- **Procesamiento universal**: Cualquier modelo que pase por el proxy tiene visión habilitada
- **Análisis de imágenes**: Procesado por Gemini (hasta 10MB por imagen)
- **Caché contextual**: Hash SHA-256 para evitar llamadas repetidas
- **Prompt adaptativo**: Se ajusta al contexto de la pregunta del usuario

### 🔄 Enrutamiento Inteligente

El proxy detecta automáticamente el destino basado en el modelo solicitado:

```typescript
// Ejemplo de enrutamiento:
"vision-dsk-chat" → DeepSeek API (con visión Gemini)
"qwen2.5:7b-instruct" → Ollama local (con visión Gemini)
"deepseek-coder" → DeepSeek API (con visión Gemini) - Ahora enruta a DeepSeek
```

### 📊 Modelos Disponibles en el Proxy

El proxy expone **8 modelos** con visión:

| Tipo                  | Modelos Proxy                                     | Modelo Destino      | Contexto | Output | Visión |
| --------------------- | ------------------------------------------------- | ------------------- | -------- | ------ | ------ |
| **DeepSeek Chat**     | `vision-dsk-chat`, `deepseek-vision-chat`         | `deepseek-chat`     | 128K     | 8K     | ✅     |
| **DeepSeek Reasoner** | `vision-dsk-reasoner`, `deepseek-vision-reasoner` | `deepseek-reasoner` | 128K     | 64K    | ✅     |

## Configuración Recomendada

### Para DeepSeek Coder (ahora via API):

```json
{
  "context": 128000,
  "output": 8000
}
```

### Para DeepSeek API:

```json
{
  "context": 128000,
  "output": 4000 // 16000 para Reasoner
}
```
