import pandas as pd
import re
from pathlib import Path
from datetime import datetime
from unidecode import unidecode
from tkinter import Tk
from tkinter.filedialog import askdirectory
from openpyxl import load_workbook
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.utils import get_column_letter

# COLUMNAS MAESTRAS
COLUMNAS = [
    "TURNO","SEM","FechaProceso","Pedidos","OrdenFabricacion","PT",
    "Variedad","VariedadReal","CodCaja","Caja","Embalaje",
    "RefCliente","REF","OTROS","ColorFruta","CAT","KgCj",
    "Cal","VOLCADO","ProdReal","PROD","LOTE","NCjs","Kilos",
    "Dia","GRem","NoEmbarq","Contenedor","ClientePrincipal",
    "RecibFinal","Pais","Pais_Homologado","Producto",
    "ArchivoOrigen","HojaOrigen","FechaCarga","PRODUCTOR","CAMPO","HECTAREAS","PLANTA","FAMILIA_PRODUCTO"
]

def limpiar(txt):
    if pd.isna(txt):
        return ""
    txt = str(txt).upper()
    txt = unidecode(txt)
    txt = txt.replace("DEG", "")
    txt = txt.replace(".", "").replace("°", "").replace("º", "").replace("/", "").replace("-", "").replace("_", "")
    txt = re.sub(r"\s+", "", txt)
    return txt

MAP EO = {
    "TURNO":"TURNO", "SEM":"SEM",
    "FECHADEPROCESO":"FechaProceso", "FECHAPROCESO":"FechaProceso", "FECHA":"FechaProceso",
    "PEDIDO":"Pedidos", "PEDIDOS":"Pedidos",
    "ORDENDEFABRIC":"OrdenFabricacion", "ORDENDEFABRICACION":"OrdenFabricacion",
    "ORDENFABRICACION":"OrdenFabricacion", "OF":"OrdenFabricacion",
    "PT":"PT",
    "VARIEDAD":"Variedad", "VARIEDADREAL":"VariedadReal",
    "CODCAJA":"CodCaja", "CAJA":"Caja",
    "EMB":"Embalaje", "EMBALAJE":"Embalaje",
    "REFCLIENTE":"RefCliente", "REF":"REF", "OTROS":"OTROS",
    "COLORFRUTA":"ColorFruta",
    "CAT":"CAT",
    "KGCJ":"KgCj", "KGCJA":"KgCj",
    "CAL":"Cal",
    "VOLCADO":"VOLCADO",
    "PRODREAL":"ProdReal", "PROD":"PROD",
    "LOTE":"LOTE",
    "KILOS":"Kilos",
    "DIA":"Dia",
    "GREM":"GRem",
    "NOEMBARQ":"NoEmbarq", "NUMEROEMBARQ":"NoEmbarq",
    "CONTENED":"Contenedor", "CONTENEDOR":"Contenedor",
    "CLIENTEPRINC":"ClientePrincipal", "CLIENTEPRINCIPAL":"ClientePrincipal",
    "RECIBFINAL":"RecibFinal",
    "PAIS":"Pais"
}

def detectar_encabezado(df):
    palabras_clave = ["PEDIDO", "PEDIDOS", "PT", "LOTE", "KILOS", "VARIEDAD", "CAJA", "CODCAJA", "EMB", "EMBALAJE", "CAL", "CAT", "NCJS", "NCAJAS"]
    for fila in range(min(25, len(df))):
        valores = [limpiar(x) for x in df.iloc[fila].fillna("").tolist()]
        score = sum(1 for palabra in palabras_clave if palabra in valores)
        if score >= 2:
            return fila
    return 0

def obtener_producto(nombre):
    nombre = nombre.upper().replace("EXPORTACION", "").replace(".XLSX", "")
    partes = nombre.split("-")
    return partes[0].strip()

import sys
if len(sys.argv) > 1:
    carpeta = sys.argv[1]
else:
    raise Exception('No se recibió carpeta desde Dashboard')

print('Carpeta:', carpeta)
Path('progreso_v9.txt').write_text('5|Carpeta seleccionada')

Path('progreso_v9.txt').write_text('15|Leyendo archivos Excel')
registros = []

archivos_lista = list(Path(carpeta).glob('*.xlsx'))
total = max(len(archivos_lista), 1)
for i, archivo in enumerate(archivos_lista, start=1):
    Path('progreso_v9.txt').write_text(f"{15+int((i/total)*45)}|Procesando {archivo.name}")
    if archivo.name.upper().startswith("BASE_MAESTRA"):
        continue
    print("\nProcesando:", archivo.name)
    try:
        xls = pd.ExcelFile(archivo)
        for hoja in xls.sheet_names:
            if hoja.strip().upper() not in ["EXPORTABLE", "EXPORTACION", "EXPO"]:
                continue
            bruto = pd.read_excel(archivo, sheet_name=hoja, header=None)
            encabezado = detectar_encabezado(bruto)
            df = pd.read_excel(archivo, sheet_name=hoja, header=encabezado)
            print("\nARCHIVO:", archivo.name)
            print("HOJA:", hoja)
            columnas_nuevas = {}
            for col in df.columns:
                key = limpiar(col)
                print("ORIGINAL:", col)
                print("LIMPIA  :", key)
                if "CJS" in key or "CAJAS" in key or key.startswith("NCJ") or key.startswith("NCAJ") or key.startswith("NUMCAJ") or key.startswith("NROCAJ"):
                    columnas_nuevas[col] = "NCjs"
                elif "KILO" in key or key == "KG" or key == "KGS" or "KILOSEXPORT" in key:
                    columnas_nuevas[col] = "Kilos"
                elif key in MAPEO:
                    columnas_nuevas[col] = MAPEO[key]
            df = df.rename(columns=columnas_nuevas)
            df = df.loc[:, ~df.columns.duplicated()]
            df_final = pd.DataFrame()
            for campo in COLUMNAS:
                if campo in df.columns:
                    df_final[campo] = df[campo]
                else:
                    df_final[campo] = None
            df_final["Producto"] = obtener_producto(archivo.name)
            df_final["ArchivoOrigen"] = archivo.name
            df_final["HojaOrigen"] = hoja
            df_final["FechaCarga"] = datetime.now()
            registros.append(df_final)
    except Exception as e:
        print(f"ERROR {archivo.name}: {e}")

Path('progreso_v9.txt').write_text('70|Consolidando información')
if registros:
    maestro = pd.concat(registros, ignore_index=True)
    maestro["NCjs"] = pd.to_numeric(maestro["NCjs"], errors="coerce")
    maestro["Kilos"] = pd.to_numeric(maestro["Kilos"], errors="coerce")
    maestro = maestro[(maestro["NCjs"].notna()) | (maestro["Kilos"].notna())]
    maestro["FechaProceso"] = pd.to_datetime(maestro["FechaProceso"], errors="coerce")
    maestro = maestro.dropna(subset=["FechaProceso"])
    
    maestro.columns = [str(col).upper() for col in maestro.columns]
    maestro = maestro.sort_values(by="FECHAPROCESO", ascending=False)
    Path('progreso_v9.txt').write_text('85|Generando Base Maestra')
    maestro.to_excel("Base_Maestra_Exportaciones.xlsx", index=False)
    Path('progreso_v9.txt').write_text('100|Proceso finalizado')
    print("\nFINALIZADO")
    print("Registros:", len(maestro))
else:
    print("No se encontraron datos")
