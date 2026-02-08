# Límites de Contexto de Modelos

## Modelos Ollama Locales

### Qwen2.5:7B-Instruct
- **Contexto máximo**: 131,072 tokens (128K)
- **Generación máxima**: 8,192 tokens
- **Fuente**: [Documentación oficial Qwen2.5](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct)
- **Características**: 
  - Soporta hasta 128K tokens con YaRN
  - Mejorado para seguir instrucciones
  - Excelente en generación de texto largo
  - Soporte multilingüe (29+ idiomas)

### ⚠️ Nota: DeepSeek-Coder Eliminado
- **Estado**: Eliminado de la compatibilidad con Ollama en el proxy
- **Razón**: Simplificación del stack de modelos locales
- **Alternativa**: Los modelos `deepseek-coder*` ahora se enrutan a DeepSeek API
- **Recomendación**: Usar `qwen2.5:7b-instruct` para tareas locales o DeepSeek API para código

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

| Tipo | Modelos Proxy | Modelo Destino | Contexto | Output | Visión |
|------|---------------|----------------|----------|--------|--------|
| **DeepSeek Chat** | `vision-dsk-chat`, `deepseek-vision-chat` | `deepseek-chat` | 128K | 8K | ✅ |
| **DeepSeek Reasoner** | `vision-dsk-reasoner`, `deepseek-vision-reasoner` | `deepseek-reasoner` | 128K | 64K | ✅ |
| **Qwen2.5** | `qwen2.5-instruct`, `qwen2.5-7b-instruct`, `qwen2.5`, `qwen2.5:7b-instruct` | `qwen2.5:7b-instruct` | 131K | 8K | ✅ |
| **DeepSeek Coder** | `deepseek-coder-instruct`, `deepseek-coder-6.7b-instruct`, `deepseek-coder`, `deepseek-coder:6.7b-instruct-q8_0` | `deepseek-chat` (API) | 128K | 8K | ✅ |

## Configuración Recomendada

### Para Qwen2.5:
```json
{
  "context": 131072,
  "output": 8192
}
```

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
  "output": 4000  // 16000 para Reasoner
}
```

## Notas Importantes

1. **Los límites de Ollama** son los máximos teóricos según documentación oficial
2. **En la práctica**, el rendimiento puede variar según:
   - Hardware disponible
   - Quantización del modelo (Q8_0, Q4_K_M, etc.)
   - Configuración de memoria
3. **Para uso óptimo**:
   - Qwen2.5: Ideal para tareas de texto largo y multilingües (local)
   - DeepSeek Coder: Ahora usa DeepSeek API para programación y código
   - DeepSeek API: Mejor para tareas generales y de programación con visión

## Verificación

Para verificar los modelos instalados en Ollama:
```bash
ollama list
ollama show qwen2.5:7b-instruct --modelfile | head -10
```

**Nota**: `deepseek-coder:6.7b-instruct-q8_0` ya no es necesario para el proxy, pero puede mantenerse instalado para uso directo con Ollama.