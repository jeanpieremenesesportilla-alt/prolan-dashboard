# ============================================================
# PROLAN Dashboard Enterprise V17 - Backend API
# ============================================================

import os
import sys
import json
import threading
import subprocess
import datetime
from pathlib import Path

import pandas as pd
import webview

MESES_NOMBRE = {1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
                5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
                9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"}


def _carpeta_datos():
    """Carpeta donde viven el Excel, el historial y el ejecutable de proceso."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


BASE_DIR = _carpeta_datos()
RUTA_BASE_MAESTRA = os.path.join(BASE_DIR, "Base_Maestra_Exportaciones.xlsx")
RUTA_HISTORIAL = os.path.join(BASE_DIR, "Historial_Procesos.xlsx")
RUTA_PROGRESO = os.path.join(BASE_DIR, "progreso_v9.txt")
RUTA_PROCESAR_EXE = os.path.join(BASE_DIR, "Procesar.exe")
RUTA_SCRIPT_PROCESO = os.path.join(BASE_DIR, "actualizar_base_v1_1_final.py")


def _col(df, *opciones):
    for o in opciones:
        if o in df.columns:
            return o
    return None


def _num(df, col):
    if col is None:
        return pd.Series([0] * len(df), index=df.index)
    return pd.to_numeric(df[col], errors="coerce").fillna(0)


DIMENSIONES = {
    "anio": ["AÑO", "ANO"],
    "semana": ["SEMANA"],
    "mes": ["MES"],
    "mesnombre": ["MESNOMBRE"],
    "fechaproceso": ["FECHAPROCESO"],
    "pais": ["PAIS_HOMOLOGADO", "PAIS"],
    "cliente": ["CLIENTE_HOMOLOGADO", "CLIENTEPRINCIPAL"],
    "variedad": ["VARIEDAD"],
    "variedadreal": ["VARIEDADREAL"],
    "colorfruta": ["COLORFRUTA"],
    "cat": ["CAT_HOMOLOGADO", "CAT"],
    "cal": ["CAL"],
    "prod": ["PROD"],
    "familia": ["FAMILIA_PRODUCTO"],
    "planta": ["PLANTA"],
}


class Api:
    def __init__(self):
        self._proceso_activo = False
        self._df = None
        self._cols = {}
        self._cargar_base()

    def _cargar_base(self):
        if not os.path.exists(RUTA_BASE_MAESTRA):
            self._df = None
            return False
        try:
            df = pd.read_excel(RUTA_BASE_MAESTRA)
        except Exception as e:
            print("Error leyendo base maestra:", e)
            self._df = None
            return False

        df.columns = [str(c).upper().strip() for c in df.columns]

        cols = {clave: _col(df, *opciones) for clave, opciones in DIMENSIONES.items()}
        cols["kg"] = _col(df, "KILOS")
        cols["cj"] = _col(df, "NCJS", "NCAJAS")
        cols["arch"] = _col(df, "ARCHIVOORIGEN")

        df["_KG"] = _num(df, cols["kg"])
        df["_CJ"] = _num(df, cols["cj"])

        if cols["fechaproceso"]:
            df[cols["fechaproceso"]] = pd.to_datetime(df[cols["fechaproceso"]], errors="coerce")

        self._df = df
        self._cols = cols
        return True

    def _aplicar_filtros(self, df, filtros, excluir_clave=None):
        if not filtros:
            return df
        c = self._cols
        for clave, valores in filtros.items():
            if clave == excluir_clave:
                continue
            if not valores:
                continue
            col = c.get(clave)
            if not col:
                continue
            df = df[df[col].astype(str).isin([str(v) for v in valores])]
        return df

    def obtener_opciones_filtros(self, filtros):
        if self._df is None and not self._cargar_base():
            return {}

        c = self._cols
        resultado = {}
        for clave in DIMENSIONES.keys():
            col = c.get(clave)
            if not col:
                resultado[clave] = []
                continue
            df_sub = self._aplicar_filtros(self._df, filtros or {}, excluir_clave=clave)
            if clave == "fechaproceso":
                fechas = df_sub[col].dropna()
                resultado[clave] = {
                    "min": fechas.min().strftime("%Y-%m-%d") if not fechas.empty else None,
                    "max": fechas.max().strftime("%Y-%m-%d") if not fechas.empty else None,
                }
            else:
                valores = df_sub[col].dropna().astype(str).unique().tolist()
                try:
                    valores_ordenados = sorted(valores, key=lambda x: (len(x), x))
                except Exception:
                    valores_ordenados = sorted(valores)
                resultado[clave] = valores_ordenados
        return resultado

    def _agrupar(self, df, col_key, top=None):
        if col_key is None or df.empty:
            return []
        g = (df.groupby(col_key)
             .agg(kilos=("_KG", "sum"), cajas=("_CJ", "sum"), regs=("_KG", "count"))
             .sort_values("kilos", ascending=False)
             .reset_index()
             .rename(columns={col_key: "nombre"}))
        if top:
            g = g.head(top)
        return g.to_dict(orient="records")

    def _por_mes(self, df):
        c = self._cols
        if not (c["anio"] and c["mes"]) or df.empty:
            return []
        g = (df.groupby([c["anio"], c["mes"]])
             .agg(kilos=("_KG", "sum"), cajas=("_CJ", "sum"), regs=("_KG", "count"))
             .reset_index()
             .sort_values([c["anio"], c["mes"]]))
        out = []
        for _, row in g.iterrows():
            anio = int(row[c["anio"]])
            mes = int(row[c["mes"]])
            label = f"{MESES_NOMBRE.get(mes, str(mes))[:3]}-{str(anio)[2:]}"
            out.append({
                "anio": anio, "mes": mes, "label": label,
                "kilos": float(row["kilos"]), "cajas": float(row["cajas"]),
                "regs": int(row["regs"])
            })
        return out

    def _construir_payload(self, df):
        c = self._cols
        cajas = int(df["_CJ"].sum()) if not df.empty else 0
        kilos = float(df["_KG"].sum()) if not df.empty else 0.0

        return {
            "cajas": cajas,
            "kilos": kilos,
            "clientes": self._agrupar(df, c["cliente"], 20),
            "variedades": self._agrupar(df, c["variedad"], 20),
            "paises": self._agrupar(df, c["pais"], 20),
            "cal": self._agrupar(df, c["cal"]),
            "prod": self._agrupar(df, c["prod"], 20),
            "planta": self._agrupar(df, c["planta"], 20),
            "por_mes": self._por_mes(df),
        }

    def obtener_datos(self):
        if self._df is None and not self._cargar_base():
            return {"existe": False}

        df = self._df
        c = self._cols
        archivos = int(df[c["arch"]].nunique()) if c["arch"] else 0
        registros = int(len(df))
        fecha_max = (df[c["fechaproceso"]].max().strftime("%d/%m/%Y")
                     if c["fechaproceso"] and df[c["fechaproceso"]].notna().any() else "—")

        base = self._construir_payload(df)
        base.update({
            "existe": True,
            "archivos": archivos,
            "registros": registros,
            "fecha_ultima": fecha_max,
        })
        return base

    def obtener_datos_filtrados(self, filtros):
        if self._df is None and not self._cargar_base():
            return {"existe": False}

        filtros = filtros or {}
        df_filtrado = self._aplicar_filtros(self._df, filtros)
        c = self._cols

        archivos = int(df_filtrado[c["arch"]].nunique()) if c["arch"] else 0
        registros = int(len(df_filtrado))

        payload = self._construir_payload(df_filtrado)
        payload.update({
            "existe": True,
            "archivos": archivos,
            "registros": registros,
            "opciones": self.obtener_opciones_filtros(filtros),
        })
        return payload

    def obtener_historial(self):
        if not os.path.exists(RUTA_HISTORIAL):
            return []
        try:
            df = pd.read_excel(RUTA_HISTORIAL)
            df = df.tail(30).iloc[::-1]
            return df.to_dict(orient="records")
        except Exception:
            return []

    def _guardar_historial(self):
        try:
            datos = self.obtener_datos()
            if not datos.get("existe"):
                return
            nuevo = pd.DataFrame([{
                "Fecha": datetime.datetime.now().strftime("%d/%m/%Y"),
                "Hora": datetime.datetime.now().strftime("%H:%M:%S"),
                "Archivos": datos["archivos"], "Registros": datos["registros"],
                "Cajas": datos["cajas"], "Kilos": datos["kilos"],
            }])
            if os.path.exists(RUTA_HISTORIAL):
                hist = pd.read_excel(RUTA_HISTORIAL)
                hist = pd.concat([hist, nuevo], ignore_index=True)
            else:
                hist = nuevo
            hist.to_excel(RUTA_HISTORIAL, index=False)
        except Exception as e:
            print("Error guardando historial:", e)

    def seleccionar_carpeta(self):
        ventana = webview.windows[0]
        resultado = ventana.create_file_dialog(webview.FOLDER_DIALOG)
        if resultado:
            return resultado[0]
        return None

    def abrir_excel(self):
        if os.path.exists(RUTA_BASE_MAESTRA):
            try:
                os.startfile(RUTA_BASE_MAESTRA)
            except Exception as e:
                return str(e)
        return None

    def abrir_carpeta(self):
        try:
            os.startfile(BASE_DIR)
        except Exception as e:
            return str(e)
        return None

    def iniciar_procesamiento(self, carpeta):
        if self._proceso_activo:
            return {"ok": False, "msg": "Ya hay un proceso en curso"}
        if not carpeta:
            return {"ok": False, "msg": "No se seleccionó carpeta"}

        def ejecutar():
            self._proceso_activo = True
            try:
                if os.path.exists(RUTA_PROGRESO):
                    os.remove(RUTA_PROGRESO)
                if os.path.exists(RUTA_PROCESAR_EXE):
                    comando = [RUTA_PROCESAR_EXE, carpeta]
                else:
                    comando = [sys.executable, RUTA_SCRIPT_PROCESO, carpeta]
                proceso = subprocess.Popen(comando)
                proceso.wait()
                self._cargar_base()
                self._guardar_historial()
            except Exception as e:
                Path(RUTA_PROGRESO).write_text(f"0|ERROR: {e}")
            finally:
                self._proceso_activo = False

        threading.Thread(target=ejecutar, daemon=True).start()
        return {"ok": True}

    def consultar_progreso(self):
        if not os.path.exists(RUTA_PROGRESO):
            return {"pct": 0, "msg": "Sin iniciar"}
        try:
            contenido = Path(RUTA_PROGRESO).read_text(encoding="utf-8").strip()
            if "|" in contenido:
                p, msg = contenido.split("|", 1)
                return {"pct": float(p), "msg": msg}
        except Exception:
            pass
        return {"pct": 0, "msg": "Sin iniciar"}

    def proceso_en_curso(self):
        return self._proceso_activo

    def guardar_y_abrir_pdf(self, nombre_archivo, datos_base64):
        import base64
        try:
            ruta = os.path.join(BASE_DIR, nombre_archivo)
            pdf_bytes = base64.b64decode(datos_base64)
            with open(ruta, "wb") as f:
                f.write(pdf_bytes)
            os.startfile(ruta)
            return {"ok": True, "ruta": ruta}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def guardar_y_abrir_excel(self, nombre_archivo, datos_base64):
        import base64
        try:
            ruta = os.path.join(BASE_DIR, nombre_archivo)
            xlsx_bytes = base64.b64decode(datos_base64)
            with open(ruta, "wb") as f:
                f.write(xlsx_bytes)
            os.startfile(ruta)
            return {"ok": True, "ruta": ruta}
        except Exception as e:
            return {"ok": False, "error": str(e)}
