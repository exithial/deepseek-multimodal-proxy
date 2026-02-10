# Scripts de Gestión para DeepSeek Multimodal Proxy

## 📋 Scripts Disponibles

### 1. `setup-deepseek-proxy.sh` - **Script Principal de Configuración**

**Propósito:** Configurar e iniciar el proxy con inicio automático mediante systemd.

**Funcionalidades:**

- Detiene servicios y procesos existentes
- Recompila el proyecto
- Configura variables de entorno
- Crea servicio systemd
- Habilita inicio automático
- Inicia el servicio
- Verifica que todo funcione correctamente

**Uso:**

```bash
./scripts/setup-deepseek-proxy.sh
```

**Requisitos:**

- Permisos sudo
- Dependencias: `jq`, `curl`, `lsof`
- Node.js instalado (v18+)

---

### 2. `check-proxy-status.sh` - **Script de Verificación**

**Propósito:** Verificar el estado actual del proxy.

**Funcionalidades:**

- Verifica estado del servicio systemd
- Comprueba uso del puerto 7777
- Realiza health check al proxy
- Lista modelos disponibles
- Muestra logs recientes
- Proporciona resumen y acciones recomendadas

**Uso:**

```bash
./scripts/check-proxy-status.sh
```

**Salida de ejemplo:**

```
🔍 Verificando estado de DeepSeek Multimodal Proxy...

1. Servicio systemd:
   ✅ Activo
   Estado detallado: ...

2. Puerto 7777:
   ✅ En uso
   Procesos usando el puerto: ...

3. Health check:
   ✅ Respondiendo
   Status: ok
   Uptime: 3600s
    Service: deepseek-multimodal-proxy

4. Modelos disponibles:
   ✅ 10 modelos
   Lista de modelos:
   • deepseek-multimodal-chat
   • deepseek-multimodal-reasoner
   • ...
```

---

### 3. `uninstall-proxy.sh` - **Script de Desinstalación**

**Propósito:** Desinstalar completamente el proxy del sistema.

**Funcionalidades:**

- Detiene el servicio
- Deshabilita inicio automático
- Elimina archivo de servicio systemd
- Detiene procesos en puerto 7777
- Limpia logs del sistema
- Proporciona resumen de desinstalación

**Uso:**

```bash
./scripts/uninstall-proxy.sh
```

**Nota importante:** Este script NO elimina los archivos del proyecto, solo la configuración del sistema.

---

## 🚀 Flujo de Trabajo Recomendado

### Instalación Inicial:

```bash
# 1. Navegar al directorio del proyecto
cd ~/Proyectos/deepseek-multimodal-proxy

# 2. Ejecutar script de configuración
./scripts/setup-deepseek-proxy.sh

# 3. Verificar que todo funciona
./scripts/check-proxy-status.sh
```

### Mantenimiento Diario:

```bash
# Verificar estado
./scripts/check-proxy-status.sh

# Reiniciar si es necesario
sudo systemctl restart deepseek-proxy

# Ver logs en tiempo real
sudo journalctl -u deepseek-proxy -f
```

### Desinstalación:

```bash
# Desinstalar completamente
./scripts/uninstall-proxy.sh

# Opcional: Eliminar archivos del proyecto
rm -rf ~/Proyectos/deepseek-multimodal-proxy
```

---

## 🔧 Comandos Útiles del Sistema

### Gestión del Servicio:

```bash
# Ver estado
sudo systemctl status deepseek-proxy

# Iniciar
sudo systemctl start deepseek-proxy

# Detener
sudo systemctl stop deepseek-proxy

# Reiniciar
sudo systemctl restart deepseek-proxy

# Habilitar inicio automático
sudo systemctl enable deepseek-proxy

# Deshabilitar inicio automático
sudo systemctl disable deepseek-proxy
```

### Monitoreo de Logs:

```bash
# Ver logs en tiempo real
sudo journalctl -u deepseek-proxy -f

# Ver últimos 50 logs
sudo journalctl -u deepseek-proxy -n 50

# Ver logs desde el inicio del sistema
sudo journalctl -u deepseek-proxy --since boot

# Ver logs de hoy
sudo journalctl -u deepseek-proxy --since today
```

### Verificación Manual:

```bash
# Health check
curl http://localhost:7777/health

# Listar modelos
curl http://localhost:7777/v1/models | jq .

# Probar chat
curl -X POST http://localhost:7777/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-multimodal-chat", "messages": [{"role": "user", "content": "Hola"}]}'
```

---

## ⚠️ Solución de Problemas

### Problema: "Permission denied" al ejecutar scripts

**Solución:**

```bash
chmod +x scripts/*.sh
```

### Problema: "Command not found" para jq, curl, lsof

**Solución:**

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y jq curl lsof

# Fedora/RHEL
sudo dnf install -y jq curl lsof

# Arch Linux
sudo pacman -S jq curl lsof
```

### Problema: Proxy no responde después de instalación

**Solución:**

```bash
# 1. Verificar logs
sudo journalctl -u deepseek-proxy -n 20

# 2. Verificar puerto
lsof -ti:7777

# 3. Verificar .env
cat .env

# 4. Reiniciar
sudo systemctl restart deepseek-proxy
```

### Problema: Error "API key not configured"

**Solución:**

```bash
# Editar archivo .env con tus API keys
nano .env

# Las variables requeridas son:
# DEEPSEEK_API_KEY=tu_api_key_deepseek
# GEMINI_API_KEY=tu_api_key_gemini
```

---

## 📊 Configuración del Servicio Systemd

El servicio se configura en: `/etc/systemd/system/deepseek-proxy.service`

**Contenido del archivo:**

```ini
[Unit]
Description=DeepSeek Multimodal Proxy
After=network.target
Wants=network.target

[Service]
Type=simple
User=exithial
WorkingDirectory=/home/exithial/Proyectos/deepseek-multimodal-proxy
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/exithial/.nvm/versions/node/v24.13.0/bin/node"
Environment="NODE_ENV=production"
ExecStart=/home/exithial/.nvm/versions/node/v24.13.0/bin/node /home/exithial/Proyectos/deepseek-multimodal-proxy/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=deepseek-proxy

# Seguridad
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
PrivateDevices=true
ProtectHome=true
ReadWritePaths=/home/exithial/Proyectos/deepseek-multimodal-proxy

[Install]
WantedBy=multi-user.target
```

---

## 🔄 Reinstalación

Si necesitas reinstalar desde cero:

```bash
# 1. Desinstalar
./scripts/uninstall-proxy.sh

# 2. Asegurarte de que el código está actualizado
git pull origin main  # Si usas git

# 3. Reinstalar
./scripts/setup-deepseek-proxy.sh
```

---

## 📞 Soporte

Si encuentras problemas:

1. Ejecuta `./scripts/check-proxy-status.sh` para diagnóstico
2. Revisa logs: `sudo journalctl -u deepseek-proxy -n 50`
3. Verifica configuración: `cat .env`
4. Prueba manualmente: `curl http://localhost:7777/health`

---

**🎯 Configuración lista para producción con inicio automático y monitoreo completo.**
