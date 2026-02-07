#!/bin/bash
# Script para desinstalar el proxy

SERVICE_NAME="deepseek-proxy"
PORT="7777"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🗑️  Desinstalando DeepSeek Vision Proxy...${NC}"
echo ""

# Verificar si el usuario tiene permisos sudo
if ! sudo -v 2>/dev/null; then
    echo -e "${RED}❌ Este script requiere permisos sudo${NC}"
    exit 1
fi

# Paso 1: Detener servicio
echo -e "${BLUE}1. Deteniendo servicio...${NC}"
if sudo systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    sudo systemctl stop "$SERVICE_NAME"
    echo -e "   ${GREEN}✅ Servicio detenido${NC}"
else
    echo -e "   ${YELLOW}⚠️  Servicio ya estaba detenido${NC}"
fi

# Paso 2: Deshabilitar inicio automático
echo -e "${BLUE}2. Deshabilitando inicio automático...${NC}"
if sudo systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    sudo systemctl disable "$SERVICE_NAME"
    echo -e "   ${GREEN}✅ Inicio automático deshabilitado${NC}"
else
    echo -e "   ${YELLOW}⚠️  Servicio no estaba habilitado${NC}"
fi

# Paso 3: Eliminar archivo de servicio
echo -e "${BLUE}3. Eliminando archivo de servicio...${NC}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
if [ -f "$SERVICE_FILE" ]; then
    sudo rm -f "$SERVICE_FILE"
    echo -e "   ${GREEN}✅ Archivo eliminado: $SERVICE_FILE${NC}"
else
    echo -e "   ${YELLOW}⚠️  Archivo no existía: $SERVICE_FILE${NC}"
fi

# Paso 4: Recargar systemd
echo -e "${BLUE}4. Recargando systemd...${NC}"
sudo systemctl daemon-reload
sudo systemctl reset-failed
echo -e "   ${GREEN}✅ systemd recargado${NC}"

# Paso 5: Detener procesos manuales
echo -e "${BLUE}5. Deteniendo procesos en puerto $PORT...${NC}"
PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    for PID in $PIDS; do
        if ps -p "$PID" > /dev/null; then
            echo -e "   ${YELLOW}⚠️  Deteniendo proceso $PID${NC}"
            kill "$PID" 2>/dev/null || true
            sleep 1
            # Forzar si no responde
            if ps -p "$PID" > /dev/null; then
                kill -9 "$PID" 2>/dev/null || true
                echo -e "   ${YELLOW}⚠️  Proceso $PID forzado a terminar${NC}"
            fi
        fi
    done
    echo -e "   ${GREEN}✅ Procesos detenidos${NC}"
else
    echo -e "   ${YELLOW}⚠️  No hay procesos en el puerto $PORT${NC}"
fi

# Paso 6: Verificar que el puerto está libre
echo -e "${BLUE}6. Verificando estado del puerto...${NC}"
sleep 2
if lsof -ti:$PORT > /dev/null 2>&1; then
    echo -e "   ${RED}❌ El puerto $PORT aún está en uso${NC}"
    echo -e "   ${YELLOW}⚠️  Procesos restantes:${NC}"
    lsof -i:$PORT
else
    echo -e "   ${GREEN}✅ Puerto $PORT liberado${NC}"
fi

# Paso 7: Limpiar logs del sistema
echo -e "${BLUE}7. Limpiando logs del sistema...${NC}"
sudo journalctl --vacuum-time=1d > /dev/null 2>&1
echo -e "   ${GREEN}✅ Logs antiguos eliminados${NC}"

echo ""
echo -e "${GREEN}📋 RESUMEN DE DESINSTALACIÓN:${NC}"
echo "================================"
echo -e "✅ Servicio: ${SERVICE_NAME}"
echo -e "✅ Estado: $(sudo systemctl is-active $SERVICE_NAME 2>/dev/null || echo 'inactivo')"
echo -e "✅ Inicio automático: $(sudo systemctl is-enabled $SERVICE_NAME 2>/dev/null || echo 'deshabilitado')"
echo -e "✅ Puerto $PORT: $(lsof -ti:$PORT > /dev/null 2>&1 && echo 'en uso' || echo 'libre')"
echo ""
echo -e "${YELLOW}⚠️  NOTAS IMPORTANTES:${NC}"
echo "======================="
echo "• Los archivos del proyecto NO se eliminaron:"
echo "  ~/Proyectos/deepseek-vision-proxy"
echo ""
echo "• La configuración de OpenCode NO se modificó:"
echo "  ~/.config/opencode/opencode.json"
echo ""
echo "• Si quieres reinstalar, ejecuta:"
echo "  ./setup-deepseek-proxy.sh"
echo ""
echo "• Para eliminar completamente los archivos del proyecto:"
echo "  rm -rf ~/Proyectos/deepseek-vision-proxy"
echo ""
echo -e "${GREEN}🎉 Desinstalación completada exitosamente!${NC}"