# PROLAN Dashboard Enterprise V17

**Sistema de Consolidación de Exportaciones - Agroindustria**

Aplicación de escritorio para procesar, analizar y visualizar datos de exportaciones en tiempo real.

## 🚀 Características

- ✅ Procesamiento automático de archivos Excel
- ✅ Dashboard interactivo con filtros en cascada
- ✅ Análisis por País, Calibre (CAL) y Productor
- ✅ Mapa mundial interactivo
- ✅ Exportación a PDF y Excel
- ✅ Historial de procesos
- ✅ Interfaz moderna y responsiva

## 📦 Requisitos

```bash
pip install pandas openpyxl unidecode pywebview
```

## ▶️ Ejecución

```bash
python main.py
```

## 📁 Estructura

- `main.py` - Punto de entrada
- `api.py` - Backend API
- `index.html` - Interfaz web
- `app.js` - Lógica del frontend
- `actualizar_base_v1_1_final.py` - Script de procesamiento

## 📊 Páginas

1. **Inicio** - Resumen general de KPIs
2. **Procesar** - Importar archivos Excel
3. **Dashboard** - Análisis con filtros
4. **Por País** - Distribución geográfica con mapa
5. **Por CAL** - Análisis de calibres
6. **Seg. Productor** - Seguimiento por planta
7. **Historial** - Registro de ejecuciones

## 🎨 Diseño

- Tema oscuro profesional
- Charts.js para visualizaciones
- Leaflet para mapas interactivos
- Diseño responsivo

## 📝 Licencia

Propiedad de PROLAN - Confidencial
