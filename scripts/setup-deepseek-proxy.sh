#!/bin/bash
# Script para configurar e iniciar DeepSeek Multimodal Proxy con inicio automático

set -e  # Detener en caso de error

# Configuración
PROJECT_DIR="/home/exithial/Proyectos/deepseek-multimodal-proxy"
SERVICE_NAME="deepseek-proxy"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
PORT="7777"
USER="exithial"
NODE_PATH="/home/exithial/.nvm/versions/node/v24.13.0/bin/node"
NPM_PATH="/home/exithial/.nvm/versions/node/v24.13.0/bin/npm"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funciones de logging
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar que estamos en el directorio correcto
cd "$PROJECT_DIR" || {
    log_error "No se puede acceder al directorio $PROJECT_DIR"
    exit 1
}

log_info "=== Configuración de DeepSeek Multimodal Proxy ==="

# Verificar si el proxy ya está funcionando
log_info "1. Verificando estado actual..."
if curl -s --max-time 2 http://localhost:$PORT/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://localhost:$PORT/health)
    STATUS=$(echo $HEALTH | jq -r '.status' 2>/dev/null || echo "unknown")
    UPTIME=$(echo $HEALTH | jq -r '.uptime' 2>/dev/null || echo "0")
    
    if [ "$STATUS" = "ok" ]; then
        log_info "   ✅ Proxy ya está funcionando (uptime: ${UPTIME}s)"
        log_info "   ⚠️  No se detendrá el proxy actual para evitar interrupciones"
        SKIP_STOP=true
    else
        log_warn "   ⚠️  Proxy responde pero con estado: $STATUS"
        SKIP_STOP=false
    fi
else
    log_info "   ℹ️  Proxy no responde, procediendo con configuración normal"
    SKIP_STOP=false
fi

# Paso 2: Detener servicio systemd si existe (solo si no estamos saltando)
if [ "$SKIP_STOP" = false ]; then
    log_info "2. Deteniendo servicio systemd..."
    if sudo systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        sudo systemctl stop "$SERVICE_NAME"
        log_info "   Servicio systemd detenido"
    else
        log_info "   ℹ️  Servicio systemd no está activo"
    fi
else
    log_info "2. ⏭️  Saltando detención de servicio (proxy ya funciona)"
fi

# Paso 3: Identificar procesos (solo para información si no estamos saltando)
if [ "$SKIP_STOP" = false ]; then
    log_info "3. Identificando procesos en puerto $PORT..."
    PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
    PROXY_PIDS=""
    OPENCODE_PIDS=""

    if [ -n "$PIDS" ]; then
        for PID in $PIDS; do
            # Obtener nombre del proceso
            PROCESS_NAME=$(ps -p "$PID" -o comm= 2>/dev/null || echo "")
            PROCESS_CMD=$(ps -p "$PID" -o cmd= 2>/dev/null || echo "")
            
            # Identificar tipo de proceso
            if echo "$PROCESS_CMD" | grep -q "opencode"; then
                OPENCODE_PIDS="$OPENCODE_PIDS $PID"
                log_info "   ⚠️  PID $PID es OpenCode (no se detendrá): $PROCESS_NAME"
            elif echo "$PROCESS_CMD" | grep -q "node.*dist/index.js"; then
                PROXY_PIDS="$PROXY_PIDS $PID"
                log_info "   🔧 PID $PID es DeepSeek Proxy: $PROCESS_NAME"
            elif echo "$PROCESS_CMD" | grep -q "node.*deepseek"; then
                PROXY_PIDS="$PROXY_PIDS $PID"
                log_info "   🔧 PID $PID es DeepSeek Proxy: $PROCESS_NAME"
            else
                log_warn "   ⚠️  PID $PID es desconocido: $PROCESS_CMD"
            fi
        done
        
        # Detener solo procesos del proxy
        if [ -n "$PROXY_PIDS" ]; then
            log_info "4. Deteniendo procesos del proxy..."
            for PID in $PROXY_PIDS; do
                log_info "   Deteniendo proceso proxy $PID"
                kill "$PID" 2>/dev/null || true
                sleep 2
                # Verificar si aún está corriendo
                if ps -p "$PID" > /dev/null 2>/dev/null; then
                    log_warn "   Proceso $PID no responde, forzando..."
                    kill -9 "$PID" 2>/dev/null || true
                fi
            done
            
            # Esperar a que los procesos del proxy se detengan
            log_info "5. Esperando que los procesos del proxy se detengan..."
            for i in {1..10}; do
                ALL_STOPPED=true
                for PID in $PROXY_PIDS; do
                    if ps -p "$PID" > /dev/null 2>/dev/null; then
                        ALL_STOPPED=false
                        break
                    fi
                done
                
                if $ALL_STOPPED; then
                    log_info "   ✅ Todos los procesos del proxy detenidos"
                    break
                fi
                sleep 1
                if [ $i -eq 10 ]; then
                    log_warn "   ⚠️  Algunos procesos del proxy aún están activos"
                fi
            done
        else
            log_info "4. No hay procesos del proxy para detener"
        fi
        
        # Informar sobre procesos de OpenCode
        if [ -n "$OPENCODE_PIDS" ]; then
            log_info "6. Procesos de OpenCode detectados (se mantendrán activos):"
            for PID in $OPENCODE_PIDS; do
                PROCESS_CMD=$(ps -p "$PID" -o cmd= 2>/dev/null || echo "N/A")
                log_info "   • PID $PID: $PROCESS_CMD"
            done
        fi
    else
        log_info "3. No hay procesos en el puerto $PORT"
    fi
else
    log_info "3. ⏭️  Saltando identificación de procesos (proxy ya funciona)"
fi

# Paso 4: Recompilar proyecto (siempre necesario para asegurar cambios)
log_info "4. Recompilando proyecto..."
"$NPM_PATH" run build
if [ $? -eq 0 ]; then
    log_info "   Compilación exitosa"
else
    log_error "   Error en la compilación"
    exit 1
fi

# Paso 5: Crear archivo .env si no existe
log_info "5. Configurando variables de entorno..."
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
    log_info "   Archivo .env creado desde .env.example"
    log_warn "   ⚠️  Edita el archivo .env con tus API keys"
fi

# Paso 6: Crear servicio systemd (siempre se crea/actualiza)
log_info "6. Creando/actualizando servicio systemd..."
sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=DeepSeek Multimodal Proxy
After=network.target
Requires=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR

Environment="NODE_ENV=production"
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/exithial/.nvm/versions/node/v24.13.0/bin"
ExecStart=/home/exithial/.nvm/versions/node/v24.13.0/bin/node /home/exithial/Proyectos/deepseek-multimodal-proxy/dist/index.js

# Configuración de reinicio
Restart=on-failure
RestartSec=10

# Logs
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Seguridad básica
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$PROJECT_DIR

[Install]
WantedBy=multi-user.target
EOF

log_info "   Archivo de servicio creado/actualizado: $SERVICE_FILE"

# Paso 7: Recargar systemd y habilitar servicio
log_info "7. Configurando inicio automático..."
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

# Paso 8: Manejar inicio del servicio basado en estado actual
if [ "$SKIP_STOP" = true ]; then
    log_info "8. ⏭️  Saltando inicio de servicio (proxy ya funciona)"
    log_info "   ℹ️  El servicio systemd se configuró pero no se iniciará"
    log_info "   ℹ️  Para migrar al servicio systemd, reinicia manualmente:"
    log_info "   ℹ️  sudo systemctl restart deepseek-proxy"
else
    log_info "8. Iniciando servicio..."
    sudo systemctl start "$SERVICE_NAME"
    
    # Paso 9: Verificar estado
    log_info "9. Verificando estado del servicio..."
    sleep 3  # Dar tiempo para que inicie
    
    if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "   ✅ Servicio activo y corriendo"
    else
        log_error "   ❌ Servicio no se pudo iniciar"
        sudo systemctl status "$SERVICE_NAME" --no-pager
        exit 1
    fi
fi

# Paso 10: Verificar salud del proxy (siempre se verifica)
log_info "10. Verificando salud del proxy..."
for i in {1..10}; do
    if curl -s http://localhost:$PORT/health > /dev/null 2>&1; then
        log_info "   ✅ Proxy respondiendo correctamente"
        
        # Verificar modelos
        MODEL_COUNT=$(curl -s http://localhost:$PORT/v1/models | jq '.data | length' 2>/dev/null || echo "0")
        log_info "   📊 Modelos expuestos: $MODEL_COUNT"
        break
    fi
    sleep 2
    if [ $i -eq 10 ]; then
        log_error "   ❌ Proxy no responde después de 20 segundos"
        if [ "$SKIP_STOP" = false ]; then
            sudo journalctl -u "$SERVICE_NAME" -n 20 --no-pager
        fi
        exit 1
    fi
done

# Paso 11: Mostrar información útil
log_info "11. Información del servicio:"
echo ""
echo "📋 RESUMEN DE CONFIGURACIÓN:"
echo "============================="
echo "✅ Servicio: $SERVICE_NAME"
echo "✅ Estado systemd: $(sudo systemctl is-active $SERVICE_NAME 2>/dev/null || echo 'inactivo')"
echo "✅ Inicio automático: $(sudo systemctl is-enabled $SERVICE_NAME 2>/dev/null || echo 'deshabilitado')"
echo "✅ Puerto $PORT: $(curl -s --max-time 2 http://localhost:$PORT/health > /dev/null && echo 'activo' || echo 'inactivo')"
echo "✅ Modelos expuestos: $MODEL_COUNT"
echo "✅ Directorio: $PROJECT_DIR"
echo ""

if [ "$SKIP_STOP" = true ]; then
    echo "⚠️  NOTA IMPORTANTE:"
    echo "==================="
    echo "El proxy YA estaba funcionando correctamente."
    echo "Se configuró el servicio systemd pero NO se reinició."
    echo ""
    echo "Para migrar al servicio systemd (recomendado):"
    echo "1. Cuando sea conveniente, reinicia:"
    echo "   sudo systemctl restart deepseek-proxy"
    echo "2. Esto transferirá el proxy al control de systemd"
    echo "3. OpenCode se reconectará automáticamente"
    echo ""
fi

echo "🔧 COMANDOS ÚTILES:"
echo "==================="
echo "• Ver estado:      sudo systemctl status $SERVICE_NAME"
echo "• Ver logs:        sudo journalctl -u $SERVICE_NAME -f"
echo "• Reiniciar:       sudo systemctl restart $SERVICE_NAME"
echo "• Detener:         sudo systemctl stop $SERVICE_NAME"
echo "• Iniciar:         sudo systemctl start $SERVICE_NAME"
echo "• Verificar:       ./scripts/check-proxy-status.sh"
echo ""
echo "🌐 ENDPOINTS:"
echo "============="
echo "• Health check:    http://localhost:$PORT/health"
echo "• Modelos:         http://localhost:$PORT/v1/models"
echo "• Chat:            http://localhost:$PORT/v1/chat/completions"
echo ""
echo "📝 CONFIGURACIÓN OPENCODE:"
echo "=========================="
echo "OpenCode ya está configurado con 4 modelos:"
echo "  ~/.config/opencode/opencode.json"
echo ""
echo "🎉 Configuración completada exitosamente!"