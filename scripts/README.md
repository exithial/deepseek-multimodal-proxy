# Scripts de Gestión Unificados

Este directorio contiene los scripts para la instalación, gestión y ejecución de **DeepSeek Multimodal Proxy**. Se ha simplificado la estructura para ofrecer una experiencia más profesional y directa.

## 📋 Scripts Principales

### 1. `setup.sh` - Instalador Automático

**Propósito:** Configurar el entorno, compilar el proyecto e instalar el proxy como un servicio de sistema persistente.

- **Detección Inteligente:** Localiza el binario real de Node.js (incluso bajo NVM/Yarn) para asegurar la persistencia del servicio systemd.
- **Compilación Transparente:** Ejecuta `npm run build` y verifica la generación de archivos en `dist/`.
- **Servicio Systemd:** Crea y habilita el servicio `deepseek-proxy.service` con reinicio automático.
- **Salida Informativa:** Reporta cada paso y verifica la salud de la API al finalizar.

```bash
./scripts/setup.sh
```

---

### 2. `manage.sh` - Comando Único de Gestión

**Propósito:** Centralizar todas las operaciones del servicio en un solo punto de entrada.

**Comandos disponibles:**

- `start`: Inicia el servicio systemd.
- `stop`: Detiene el servicio systemd.
- `restart`: Reinicia el servicio para aplicar cambios.
- `status`: Muestra el estado de systemd y realiza un **Health Check** real a la API.
- `logs`: Muestra los logs en tiempo real (vía `journalctl`).
- `logs --clear`: Limpia logs y luego muestra seguimiento en vivo.
- `uninstall`: Elimina completamente el servicio del sistema de forma limpia.

```bash
./scripts/manage.sh [comando]
```

---

### 3. `run-local.sh` - Ejecución Rápida

**Propósito:** Iniciar el proxy manualmente para pruebas rápidas o desarrollo, sin instalar nada como servicio del sistema.

```bash
./scripts/run-local.sh
```

## 🚀 Integración con NPM

Para mayor comodidad, estos scripts están mapeados en el `package.json`:

| Comando NPM               | Descripción                          |
| :------------------------ | :----------------------------------- |
| `npm run setup`           | Ejecuta el instalador completo.      |
| `npm run status`          | Muestra el estado y salud de la API. |
| `npm run proxy:start`     | Inicia el servicio.                  |
| `npm run proxy:stop`      | Detiene el servicio.                 |
| `npm run proxy:logs`      | Ver logs en tiempo real.             |
| `npm run proxy:logs:clear`| Limpiar logs y seguir en vivo.       |
| `npm run proxy:uninstall` | Desinstalación limpia.               |
| `npm run proxy:local`     | Ejecución manual sin systemd.        |
| `npm run test:claude`     | Pruebas Claude Code.                 |
| `npm run test:all`        | Ejecuta test master + Claude Code.   |

## 🧪 Pruebas

Para validar que la instalación y el routing funcionan correctamente:

```bash
npm run test:master
npm run test:claude
npm run test:all
```

## ⚠️ Solución de Problemas

1. **Permisos:** Si recibes un error de permisos, asegúrate de que los scripts sean ejecutables: `chmod +x scripts/*.sh`.
2. **Logs:** Si el servicio no inicia, usa `npm run proxy:logs` para ver el error específico de Node.js.
3. **API Keys:** Verifica que tu archivo `.env` contenga las claves válidas para DeepSeek y Gemini.
4. **Reseteo:** Si necesitas empezar de cero, usa `npm run proxy:uninstall` y luego `npm run setup`.

---

**🎯 Gestión simplificada para máxima robustez técnica.**
