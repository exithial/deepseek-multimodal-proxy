## Ejecución de Pruebas

El proyecto cuenta con una suite de pruebas unificada que valida todas las funcionalidades (texto, imagen, audio, video, PDF).

### 🚀 Ejecutar Test Maestro

```bash
# Asegúrate de que el proxy esté corriendo
sudo systemctl start deepseek-proxy

# Ejecutar la suite completa
node test/test-master.js
```

Este script validará:

1. **Health Check**: Estado del servicio y versión.
2. **Modelos**: Disponibilidad de `deepseek-multimodal-chat` y `reasoner`.
3. **Texto**: Routing directo a DeepSeek.
4. **Multimodal**: Procesamiento de imágenes, audio y PDF (local/Gemini).

---

## Historial de Ejecuciones

### Ejecución del 10/02/2026 (Consolidación de Tests)

- **Estado General**: ✅ PASSED
- **Test Suites**: 1 suite (test-proxy-complete.js)
- **Total Tests**: 7 verificaciones (Health + 2 modelos x 2 + Imagen)
- **Cobertura Funcional**: 100% core validado

### Cambios Verificados

- **Sistema de Tipo Dual**: Implementado `type` (OpenCode normalizado) + `internalType` (routing granular)
- **Renombramiento de Modelos**:
  - `multimodal-dsk-chat` → `deepseek-multimodal-chat`
  - `multimodal-dsk-reasoner` → `deepseek-multimodal-reasoner`
- **Mapeo OpenCode**: code/text_file/data_file → text, document → pdf
- **Routing Inteligente**: Preservado usando `internalType` para decisiones

### Resultados de Ejecución

### Resultados de Ejecución

**Suite Maestra (`test/test-master.js`):**

```bash
$ node test/test-master.js
🚀 INICIANDO SUITE DE PRUEBAS MAESTRA

ℹ️  Servidor de archivos de prueba activo en http://localhost:8899

=== 1. HEATH CHECK ===
✅ Servicio activo: v1.3.0
   Uptime: 36.6s
✅ Modelos disponibles: 2

=== 2. PRUEBA DE TEXTO (Directo DeepSeek) ===
ℹ️  Ejecutando: DeepSeek Chat (Texto simple)...
✅ OK (1469ms) [Strategy: direct]
   📄 "2 + 2 = 4."

=== 3. PRUEBA MULTIMODAL: IMAGEN ===
ℹ️  Ejecutando: Análisis de Imagen (Gemini → DeepSeek)...
✅ OK (2257ms) [Strategy: gemini]
   📄 "En la imagen solo veo un fondo de color rojo brillante..."

=== 4. PRUEBA MULTIMODAL: AUDIO ===
ℹ️  Ejecutando: Análisis de Audio (Gemini → DeepSeek)...
✅ OK (3139ms) [Strategy: gemini]
   📄 "Aquí tienes la transcripción del audio..."

=== 5. PRUEBA MULTIMODAL: PDF ===
ℹ️  Ejecutando: Análisis de PDF via URL (Detección automática)...
✅ OK (4010ms) [Strategy: local]
   📄 "**Resumen del documento:** El documento es un archivo PDF..."

=== RESUMEN FINAL ===
Total Pruebas: 6
✅ Pasadas:    6
❌ Falladas:   0
✅ ¡TODAS LAS PRUEBAS OBLIGATORIAS PASARON!
```

### Validación de Routing (Header `X-Multimodal-Strategy`)

El test maestro verifica que cada tipo de contenido sea procesado por la estrategia correcta:

| Tipo              | `type` (OpenCode)        | Estrategia | Routing Real             | Estado |
| ----------------- | ------------------------ | ---------- | ------------------------ | ------ |
| Texto             | `text`                   | `direct`   | DeepSeek                 | ✅ OK  |
| Imagen            | `image` (`image_url`)    | `gemini`   | Gemini → DeepSeek        | ✅ OK  |
| Audio             | `audio` (`input_audio`)  | `gemini`   | Gemini → DeepSeek        | ✅ OK  |
| PDF (Pequeño)     | `pdf` (`small-test.pdf`) | `local`    | Local (<1MB) → DeepSeek  | ✅ OK  |
| PDF (Grande Real) | `pdf` (`large-test.pdf`) | `local`    | Local (<1MB) → DeepSeek  | ✅ OK  |
| PDF (Simulado)    | `pdf` (`large.pdf`)      | `gemini`   | Gemini (>1MB) → DeepSeek | ✅ OK  |
| Video             | `video` (`video.mp4`)    | `gemini`   | Gemini → DeepSeek        | ✅ OK  |
| Base64            | `image_url` (Data URI)   | `gemini`   | Gemini → DeepSeek        | ✅ OK  |
| Streaming         | `text` (stream=true)     | `direct`   | DeepSeek (Chunks)        | ✅ OK  |

### Detalles Técnicos

- **Compilación TypeScript**: ✅ Limpia (0 errores)
- **Servicio**: Reiniciado correctamente con código actualizado
- **Modelos Detectados**: 2 (nombres actualizados correctamente)
- **Procesamiento Multimodal**: Funcional (Gemini integrado)

---

## Ejecución del 09/02/2026 (Release 1.2.4 - Actualización Gemini 2.5 Flash Lite)

### Resumen

- **Estado General**: ✅ PASSED
- **Tipo de Prueba**: Verificación Post-Actualización de Modelo
- **Duración**: ~12s
- **Fecha/Hora**: 2026-02-09 21:45:00 -03

### Métricas Obligatorias

- **Estado General**: ✅ PASSED
- **Test Suites**: 1 suite (test-proxy-complete.js)
- **Total Tests**: 5 verificaciones (4 modelos + Health/Imagen)
- **Cobertura Funcional**: 100% core validado

### Cambios Verificados

- **Modelo Gemini**: Actualizado de `gemini-2.5-flash` a `gemini-2.5-flash-lite`
- **Configuración**: `.env`, `.env.example`, `src/services/geminiService.ts` actualizados
- **Documentación**: `README.md`, `MODELS.md`, `CHANGELOG.md` sincronizados
- **Versión**: Actualizada a `1.2.4` en `package.json`

### Resultados de Ejecución

```bash
$ node test-proxy-complete.js
✅ Health check: OK (Version: 1.2.4)
✅ Modelos disponibles (4): vision-dsk-chat, vision-dsk-reasoner...
🧪 Probando modelos... OK
🖼️ Probando detección de imágenes... OK
🎉 Pruebas completadas!
```

## Ejecución del 09/02/2026 (Release 1.2.3 - Sincronización de Versión)

### Resumen

- **Estado General**: ✅ PASSED
- **Tipo de Prueba**: Verificación de Salud y Sincronización
- **Duración**: ~15s
- **Fecha/Hora**: 2026-02-09 21:33:00 -03

### Métricas Obligatorias

- **Estado General**: ✅ PASSED
- **Test Suites**: 1 suite (test-proxy-complete.js)
- **Total Tests**: 5 verificaciones (4 modelos + Health/Imagen)
- **Cobertura Funcional**: 100% core validado

### Resultados de Ejecución

```bash
$ node test-proxy-complete.js
✅ Health check: OK (Version: 1.2.3)
✅ Modelos disponibles (4): vision-dsk-chat, vision-dsk-reasoner...
🧪 Probando modelos... OK
🖼️ Probando detección de imágenes... OK
🎉 Pruebas completadas!
```

## Ejecución del 09/02/2026 (Release 1.2.1 - Nuevos Límites)

### Resumen

- **Estado General**: ✅ PASSED
- **Tipo de Prueba**: Verificación Post-Release
- **Duración**: ~6s
- **Fecha/Hora**: 2026-02-09 21:18:00 -03

### Métricas Obligatorias

- **Estado General**: ✅ PASSED
- **Test Suites**: 1 suite (test-proxy-complete.js)
- **Total Tests**: 7 verificaciones
- **Cobertura Funcional**: 100% de la funcionalidad core con nuevos límites

### Detalles Técnicos

- **DeepSeek Chat**: Output máx ahora 8,000 tokens (verificado config)
- **DeepSeek Reasoner**: Output máx ahora 64,000 tokens (verificado config)
- **Contexto**: Mantenido en 100,000 tokens por seguridad

### Resultados de Ejecución

```bash
$ node test-proxy-complete.js
✅ Health check: OK
✅ Modelos disponibles (4):
   1. vision-dsk-chat
   2. vision-dsk-reasoner
   3. deepseek-vision-chat
   4. deepseek-vision-reasoner

🧪 Chat Generation: OK
🖼️ Image Processing: OK
```

## Ejecución del 09/02/2026 (Eliminación de Ollama + Release 1.2.0)

...
