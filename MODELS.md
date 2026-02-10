# Límites de Contexto de Modelos

## Modelos DeepSeek API

### DeepSeek Chat

- **Contexto máximo**: 128,000 tokens
- **Generación máxima**: 8,000 tokens
- **Características**: Modelo general de chat

### DeepSeek Reasoner

- **Contexto máximo**: 128,000 tokens
- **Generación máxima**: 64,000 tokens
- **Características**: Modelo de razonamiento mejorado

## Modelos con Visión

### 🖼️ Visión Unificada con Gemini

 **Todos los modelos** ahora usan **Gemini 2.5 Flash Lite** para análisis de imágenes:

- **Procesamiento universal**: Cualquier modelo que pase por el proxy tiene visión habilitada
- **Análisis de imágenes**: Procesado por Gemini (hasta 10MB por imagen)
- **Caché contextual**: Hash SHA-256 para evitar llamadas repetidas
- **Prompt adaptativo**: Se ajusta al contexto de la pregunta del usuario

### 🔄 Enrutamiento Inteligente

El proxy detecta automáticamente el destino basado en el modelo solicitado:

```typescript
// Ejemplo de enrutamiento:
"vision-dsk-chat"     → DeepSeek API (con visión Gemini)
"vision-dsk-reasoner" → DeepSeek API (con visión Gemini)
```

### 📊 Modelos Disponibles en el Proxy

El proxy expone **8 modelos** con visión:

| Tipo                  | Modelos Proxy                                     | Modelo Destino      | Contexto | Output | Visión |
| --------------------- | ------------------------------------------------- | ------------------- | -------- | ------ | ------ |
| **DeepSeek Chat**     | `vision-dsk-chat`, `deepseek-vision-chat`         | `deepseek-chat`     | 128K     | 8K     | ✅     |
| **DeepSeek Reasoner** | `vision-dsk-reasoner`, `deepseek-vision-reasoner` | `deepseek-reasoner` | 128K     | 64K    | ✅     |

### Para DeepSeek Chat:

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
