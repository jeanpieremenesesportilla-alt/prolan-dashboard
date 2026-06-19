// ============================================================
// PROLAN Dashboard V17 - Frontend Refactorizado
// Estado unificado, filtros consistentes, sin duplicaciones
// ============================================================

// ESTADO GLOBAL UNIFICADO
const STATE = {
  datos: null,
  filtros: {
    dashboard: {},
    paises: {},
    cal: {},
    productor: {}
  },
  charts: {},
  carpeta: null,
  procesoTimer: null,
  procesoStart: null,
  leafletMap: null,
  geoData: null
};

const COLORS = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#06B6D4','#EC4899','#84CC16','#F97316','#6366F1','#14B8A6','#A855F7'];
const MESES = {1:'Enero',2:'Febrero',3:'Marzo',4:'Abril',5:'Mayo',6:'Junio',7:'Julio',8:'Agosto',9:'Septiembre',10:'Octubre',11:'Noviembre',12:'Diciembre'};
const PAIS_MAP = {
  'reino unido':'United Kingdom','españa':'Spain','japón':'Japan','canadá':'Canada',
  'estados unidos':'United States of America','méxico':'Mexico','perú':'Peru','brasil':'Brazil',
  'chile':'Chile','argentina':'Argentina','colombia':'Colombia','ecuador':'Ecuador'
};

// ============================================================
// HELPERS
// ============================================================
const fmt = (n,dec=0) => {
  if(n===null||n===undefined||isNaN(n)) return '—';
  if(n>=1e6) return (n/1e6).toFixed(1)+'M';
  if(n>=1e3) return (n/1e3).toFixed(0)+'K';
  return Number(n).toLocaleString('es-PE',{maximumFractionDigits:dec});
};

const fmtFull = (n) => n===null||n===undefined ? '—' : Number(n).toLocaleString('es-PE');
const pct = (part,total) => total ? ((part/total)*100).toFixed(1)+'%' : '0%';

function showToast(msg, type='ok'){
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = (type==='ok'?'✅ ':'❌ ') + msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

async function pyCall(fn, ...args){
  try{
    if(window.pywebview && window.pywebview.api) return await window.pywebview.api[fn](...args);
  } catch(e){ console.warn('pyCall', fn, e); }
  return null;
}

// ============================================================
// NAVEGACIÓN
// ============================================================
function goToPage(page){
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.content').forEach(el => el.classList.remove('active'));
  
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById(`page-${page}`)?.classList.add('active');
  
  const titles = {
    inicio: 'CONSOLIDADOR DE EXPORTACIONES',
    procesar: 'PROCESAMIENTO DE ARCHIVOS',
    dashboard: 'DASHBOARD ANALÍTICO',
    paises: 'ANÁLISIS POR PAÍS',
    cal: 'QUIEBRE POR CALIBRE',
    productor: 'SEGUIMIENTO POR PRODUCTOR',
    historial: 'HISTORIAL DE PROCESOS'
  };
  
  document.getElementById('pageTitle').textContent = titles[page] || page;
  
  if(page === 'historial') loadHistorial();
  if(page === 'paises' && STATE.datos) renderPaises(STATE.datos);
  if(page === 'cal' && STATE.datos) renderCal(STATE.datos);
  if(page === 'productor' && STATE.datos) renderProductor(STATE.datos);
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => goToPage(el.dataset.page));
});

// ============================================================
// ACTUALIZAR FECHA
// ============================================================
function updateClock(){
  const now = new Date();
  const opts = {day:'numeric',month:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'};
  document.getElementById('headerDate').textContent = now.toLocaleString('es-PE',opts) + ' p. m.';
}
setInterval(updateClock, 1000);
updateClock();

// ============================================================
// CHART HELPERS
// ============================================================
function mkChart(id, type, labels, data, opts={}){
  const c = document.getElementById(id);
  if(!c) return;
  const ctx = c.getContext('2d');
  if(STATE.charts[id]) STATE.charts[id].destroy();
  
  STATE.charts[id] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: opts.multi ? COLORS.slice(0,data.length) : (opts.color || 'rgba(59,130,246,.8)'),
        borderColor: opts.borderColor || 'rgba(59,130,246,1)',
        borderWidth: type === 'line' ? 2 : 1,
        fill: opts.fill || false,
        tension: .4,
        pointRadius: type === 'line' ? 3 : 0,
        ...opts.dataset
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: opts.horizontal ? 'y' : 'x',
      plugins: {
        legend: { display: opts.legend || false, position: 'right', labels: {color:'#94A3B8', font:{size:10}, boxWidth:10} },
        tooltip: { backgroundColor:'#1E293B', titleColor:'#F1F5F9', bodyColor:'#94A3B8', borderColor:'#2D3F57', borderWidth:1 }
      },
      scales: (type==='doughnut' || type==='pie') ? {} : {
        x: { grid: {color:'rgba(255,255,255,.04)'}, ticks: {color:'#64748B', font:{size:10}} },
        y: { grid: {color:'rgba(255,255,255,.06)'}, ticks: {color:'#64748B', font:{size:10}, callback:v=>fmt(v)} }
      },
      cutout: opts.cutout || undefined,
      ...opts.extra
    }
  });
}

// ============================================================
// CARGAR DATOS INICIALES
// ============================================================
async function loadData(){
  document.getElementById('loadingOverlay').classList.remove('hidden');
  try{
    const d = await pyCall('obtener_datos');
    if(d && d.existe){
      STATE.datos = d;
      renderInicio(d);
      renderDashboard(d);
      
      const ops = await pyCall('obtener_opciones_filtros', {});
      if(ops){
        populateFilters('f', ops);
        populateFilters('pf', ops);
        populateFilters('cf', ops);
        populateFilters('suf', ops);
      }
    }
  } catch(e){ console.warn('Error cargando datos', e); }
  document.getElementById('loadingOverlay').classList.add('hidden');
}

// ============================================================
// POBLAR FILTROS
// ============================================================
function populateFilters(prefix, opciones){
  if(!opciones) return;
  
  const map = {
    anio: `${prefix}-anio`,
    mes: `${prefix}-mes`,
    pais: `${prefix}-pais`,
    cliente: `${prefix}-cliente`,
    variedad: `${prefix}-variedad`,
    cal: `${prefix}-cal`
  };
  
  for(const [k, id] of Object.entries(map)){
    const sel = document.getElementById(id);
    if(!sel || !opciones[k]) continue;
    
    const prev = [...sel.selectedOptions].map(o => o.value);
    sel.innerHTML = '<option value="">Todos</option>';
    
    let vals = opciones[k] || [];
    if(k === 'mes') vals = vals.sort((a,b) => parseInt(a) - parseInt(b));
    
    vals.forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = (k === 'mes' && MESES[parseInt(v)]) ? MESES[parseInt(v)] : v;
      if(prev.includes(String(v))) o.selected = true;
      sel.appendChild(o);
    });
  }
}

function getFilters(prefix){
  const map = {
    anio: `${prefix}-anio`,
    mes: `${prefix}-mes`,
    pais: `${prefix}-pais`,
    cliente: `${prefix}-cliente`,
    variedad: `${prefix}-variedad`,
    cal: `${prefix}-cal`
  };
  
  const f = {};
  for(const [k, id] of Object.entries(map)){
    const sel = document.getElementById(id);
    if(!sel) continue;
    const vals = [...sel.selectedOptions].map(o => o.value).filter(v => v);
    if(vals.length) f[k] = vals;
  }
  return f;
}

// ============================================================
// RENDER INICIO
// ============================================================
function renderInicio(d){
  document.getElementById('k-arch').textContent = fmtFull(d.archivos);
  document.getElementById('k-regs').textContent = fmtFull(d.registros);
  document.getElementById('k-cajas').textContent = fmt(d.cajas);
  document.getElementById('k-kilos').textContent = fmt(d.kilos);
  document.getElementById('st-regs').textContent = fmtFull(d.registros) + ' registros';
  document.getElementById('sum-paises').textContent = (d.paises||[]).length;
  document.getElementById('sum-clientes').textContent = (d.clientes||[]).length;
  document.getElementById('sum-vars').textContent = (d.variedades||[]).length;
  document.getElementById('sum-cals').textContent = (d.cal||[]).length;

  const paises = (d.paises||[]).slice(0,10);
  mkChart('chartPais', 'bar', paises.map(x=>x.nombre), paises.map(x=>x.kilos), {horizontal:true, multi:true});

  const clts = (d.clientes||[]).slice(0,10);
  mkChart('chartClientes', 'bar', clts.map(x=>x.nombre), clts.map(x=>x.kilos), {horizontal:true, color:'#10B981'});

  const mes = d.por_mes||[];
  mkChart('chartMes', 'line', mes.map(x=>x.label), mes.map(x=>x.kilos), {fill:true, color:'rgba(59,130,246,.8)', dataset:{backgroundColor:'rgba(59,130,246,.15)'}});

  const cal = (d.cal||[]).slice(0,8);
  mkChart('chartCalDonut', 'doughnut', cal.map(x=>'CAL '+x.nombre), cal.map(x=>x.kilos), {multi:true, legend:true, cutout:'65%'});
}

// ============================================================
// RENDER DASHBOARD
// ============================================================
function renderDashboard(d){
  document.getElementById('d-arch').textContent = fmtFull(d.archivos);
  document.getElementById('d-regs').textContent = fmtFull(d.registros);
  document.getElementById('d-cajas').textContent = fmt(d.cajas);
  document.getElementById('d-kilos').textContent = fmt(d.kilos);

  const paises = (d.paises||[]).slice(0,12);
  mkChart('dchartPais', 'bar', paises.map(x=>x.nombre), paises.map(x=>x.kilos), {horizontal:true, multi:true});
  
  const clts = (d.clientes||[]).slice(0,10);
  mkChart('dchartClientes', 'bar', clts.map(x=>x.nombre), clts.map(x=>x.kilos), {horizontal:true, color:'#10B981'});
  
  const mes = d.por_mes||[];
  mkChart('dchartMes', 'line', mes.map(x=>x.label), mes.map(x=>x.kilos), {fill:true});
  
  const vars = (d.variedades||[]).slice(0,10);
  mkChart('dchartVar', 'bar', vars.map(x=>x.nombre), vars.map(x=>x.kilos), {color:'#F59E0B'});
}

// ============================================================
// DASHBOARD FILTERS
// ============================================================
async function applyDashboardFilters(){
  STATE.filtros.dashboard = getFilters('f');
  const d = await pyCall('obtener_datos_filtrados', STATE.filtros.dashboard);
  if(d && d.existe){
    renderDashboard(d);
    if(d.opciones) populateFilters('f', d.opciones);
  }
}

function clearDashboardFilters(){
  STATE.filtros.dashboard = {};
  document.querySelectorAll('[id^="f-"]').forEach(el => {
    if(el.tagName === 'SELECT') [...el.options].forEach(o => o.selected = false);
  });
  if(STATE.datos) renderDashboard(STATE.datos);
}

// ============================================================
// POR PAÍSES
// ============================================================
async function applyPaisFilters(){
  STATE.filtros.paises = getFilters('pf');
  const d = await pyCall('obtener_datos_filtrados', STATE.filtros.paises);
  if(d && d.existe){
    renderPaises(d);
    if(d.opciones) populateFilters('pf', d.opciones);
  }
}

function clearPaisFilters(){
  STATE.filtros.paises = {};
  document.querySelectorAll('[id^="pf-"]').forEach(el => {
    if(el.tagName === 'SELECT') [...el.options].forEach(o => o.selected = false);
  });
  if(STATE.datos) renderPaises(STATE.datos);
}

function renderPaises(d){
  document.getElementById('p-kilos').textContent = fmt(d.kilos);
  document.getElementById('p-cajas').textContent = fmt(d.cajas);
  document.getElementById('p-paises').textContent = (d.paises||[]).length;
  document.getElementById('p-regs').textContent = fmtFull(d.registros);

  const paises = (d.paises||[]).slice(0,15);
  const total = paises.reduce((a,c) => a+c.kilos, 0) || 1;

  mkChart('paisChart', 'bar', paises.map(x=>x.nombre), paises.map(x=>x.kilos), {horizontal:true, multi:true});

  const tbody = document.getElementById('paisTable');
  tbody.innerHTML = paises.map((p,i) => `
    <tr>
      <td><span class="rank-num">${i+1}</span></td>
      <td>${p.nombre}</td>
      <td class="num">${fmtFull(Math.round(p.kilos))}</td>
      <td class="num">${fmtFull(Math.round(p.cajas))}</td>
      <td class="pct"><span class="pct-badge">${pct(p.kilos, total)}</span></td>
    </tr>
  `).join('');

  renderMapaMundo(paises);
}

// ============================================================
// MAPA LEAFLET
// ============================================================
async function renderMapaMundo(paises){
  const mapDiv = document.getElementById('mapMundo');
  if(!mapDiv) return;

  if(STATE.leafletMap) STATE.leafletMap.remove();
  STATE.leafletMap = null;

  const kilosMap = {};
  let maxK = 0;
  paises.forEach(p => {
    const en = PAIS_MAP[p.nombre.toLowerCase().trim()] || p.nombre;
    kilosMap[en] = (kilosMap[en]||0) + p.kilos;
    if(kilosMap[en] > maxK) maxK = kilosMap[en];
  });

  STATE.leafletMap = L.map('mapMundo', {center:[20,0], zoom:2, minZoom:1, maxZoom:7});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {subdomains:'abcd', maxZoom:19}).addTo(STATE.leafletMap);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {subdomains:'abcd', maxZoom:19}).addTo(STATE.leafletMap);

  function getColor(kilos){
    if(!kilos) return 'rgba(45,63,87,0.4)';
    const t = Math.min(kilos/maxK, 1);
    const r = Math.round(30 + t*10);
    const g = Math.round(60 + t*70);
    const b = Math.round(130 + t*120);
    return `rgba(${r},${g},${b},${0.5 + t*0.5})`;
  }

  if(!STATE.geoData){
    try{
      const r = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
      const topo = await r.json();
      STATE.geoData = topojson.feature(topo, topo.objects.countries);
    } catch(e){ console.warn('GeoData error', e); return; }
  }

  if(STATE.geoData){
    L.geoJSON(STATE.geoData, {
      style: feature => ({
        fillColor: getColor(kilosMap[feature.properties.name]||0),
        weight: 1,
        opacity: 1,
        color: '#2D3F57',
        fillOpacity: 0.7
      }),
      onEachFeature: (feature, layer) => {
        const name = feature.properties.name;
        const k = kilosMap[name] || 0;
        layer.bindTooltip(`<div class="map-tooltip"><b>${name}</b><br>${k ? fmtFull(Math.round(k))+' kg' : 'Sin datos'}</div>`, {sticky:true});
      }
    }).addTo(STATE.leafletMap);
  }
}

// ============================================================
// POR CAL
// ============================================================
async function applyCalFilters(){
  STATE.filtros.cal = getFilters('cf');
  const d = await pyCall('obtener_datos_filtrados', STATE.filtros.cal);
  if(d && d.existe){
    renderCal(d);
    if(d.opciones) populateFilters('cf', d.opciones);
  }
}

function clearCalFilters(){
  STATE.filtros.cal = {};
  document.querySelectorAll('[id^="cf-"]').forEach(el => {
    if(el.tagName === 'SELECT') [...el.options].forEach(o => o.selected = false);
  });
  if(STATE.datos) renderCal(STATE.datos);
}

function renderCal(d){
  const cal = (d.cal||[]).slice(0,15);
  const total = cal.reduce((a,c) => a+c.kilos, 0) || 1;

  mkChart('calChartBar', 'bar', cal.map(x=>'CAL '+x.nombre), cal.map(x=>x.kilos), {multi:true});
  mkChart('calChartDonut', 'doughnut', cal.map(x=>'CAL '+x.nombre), cal.map(x=>x.kilos), {multi:true, legend:true, cutout:'55%'});

  const tbody = document.getElementById('calTable');
  tbody.innerHTML = cal.map((c,i) => `
    <tr>
      <td><span class="rank-num">${i+1}</span></td>
      <td style="font-weight:600;color:#60A5FA">CAL ${c.nombre}</td>
      <td class="num">${fmtFull(Math.round(c.kilos))}</td>
      <td class="num">${fmtFull(Math.round(c.cajas))}</td>
      <td class="num">${c.regs||0}</td>
      <td class="pct"><span class="pct-badge">${pct(c.kilos, total)}</span></td>
    </tr>
  `).join('');
}

// ============================================================
// PRODUCTOR
// ============================================================
async function applyProductorFilters(){
  STATE.filtros.productor = getFilters('suf');
  const d = await pyCall('obtener_datos_filtrados', STATE.filtros.productor);
  if(d && d.existe){
    renderProductor(d);
    if(d.opciones) populateFilters('suf', d.opciones);
  }
}

function clearProductorFilters(){
  STATE.filtros.productor = {};
  document.querySelectorAll('[id^="suf-"]').forEach(el => {
    if(el.tagName === 'SELECT') [...el.options].forEach(o => o.selected = false);
  });
  if(STATE.datos) renderProductor(STATE.datos);
}

function renderProductor(d){
  const plantas = (d.planta||[]).slice(0,10);
  const prods = (d.prod||[]).slice(0,10);
  const grupos = plantas.length ? plantas : prods;

  document.getElementById('su-kilos').textContent = fmt(d.kilos);
  document.getElementById('su-cajas').textContent = fmt(d.cajas);
  document.getElementById('su-prods').textContent = grupos.length;
  document.getElementById('su-regs').textContent = fmtFull(d.registros);

  mkChart('suChartBar', 'bar', grupos.map(x=>x.nombre), grupos.map(x=>x.kilos), {multi:true});
  mkChart('suChartDonut', 'doughnut', grupos.map(x=>x.nombre), grupos.map(x=>x.kilos), {multi:true, legend:true, cutout:'55%'});

  const total = grupos.reduce((a,c) => a+c.kilos, 0) || 1;
  const tbody = document.getElementById('suTable');
  tbody.innerHTML = grupos.map((g,i) => `
    <tr>
      <td><span class="rank-num">${i+1}</span></td>
      <td style="font-weight:600;color:#60A5FA">${g.nombre}</td>
      <td class="num">${fmtFull(Math.round(g.kilos))}</td>
      <td class="num">${fmtFull(Math.round(g.cajas))}</td>
      <td class="pct"><span class="pct-badge">${pct(g.kilos, total)}</span></td>
    </tr>
  `).join('');
}

// ============================================================
// HISTORIAL
// ============================================================
async function loadHistorial(){
  const hist = await pyCall('obtener_historial');
  const tbody = document.getElementById('histTable');
  if(!hist || !hist.length){
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:20px">Sin registros</td></tr>';
    return;
  }
  tbody.innerHTML = hist.map((h,i) => `
    <tr>
      <td><span class="rank-num">${i+1}</span></td>
      <td>${h.Fecha||'—'}</td>
      <td>${h.Hora||'—'}</td>
      <td class="num">${fmtFull(h.Archivos)}</td>
      <td class="num">${fmtFull(h.Registros)}</td>
      <td class="num">${fmtFull(h.Cajas)}</td>
      <td class="num">${fmt(h.Kilos)}</td>
    </tr>
  `).join('');
}

// ============================================================
// PROCESAR
// ============================================================
async function seleccionarCarpeta(){
  const carpeta = await pyCall('seleccionar_carpeta');
  if(carpeta){
    STATE.carpeta = carpeta;
    document.getElementById('folderPath').textContent = carpeta;
    document.getElementById('startBtn').disabled = false;
    showToast('Carpeta seleccionada', 'ok');
  }
}

async function iniciarProceso(){
  if(!STATE.carpeta){ showToast('Seleccione carpeta', 'err'); return; }
  const res = await pyCall('iniciar_procesamiento', STATE.carpeta);
  if(res && res.ok){
    document.getElementById('startBtn').disabled = true;
    document.getElementById('progressSection').classList.add('visible');
    STATE.procesoStart = Date.now();
    STATE.procesoTimer = setInterval(pollProgress, 800);
  } else {
    showToast((res&&res.msg) || 'Error', 'err');
  }
}

async function pollProgress(){
  const p = await pyCall('consultar_progreso');
  if(!p) return;
  
  const pct = Math.round(p.pct || 0);
  document.getElementById('progBar').style.width = pct + '%';
  document.getElementById('progMsg').textContent = p.msg || 'Procesando...';

  if(pct >= 100 || p.msg.includes('finalizado')){
    clearInterval(STATE.procesoTimer);
    document.getElementById('progBadge').textContent = 'Completado';
    document.getElementById('progBadge').className = 'prog-badge done';
    document.getElementById('startBtn').disabled = false;
    showToast('Procesamiento completado', 'ok');
    loadData();
  }
}

// ============================================================
// EXPORTAR
// ============================================================
async function guardarPDF(doc, nombre){
  try{
    const b64 = doc.output('datauristring').split(',')[1];
    const res = await pyCall('guardar_y_abrir_pdf', nombre, b64);
    if(res && res.ok) showToast('PDF guardado', 'ok');
    else showToast('Error: ' + (res?.error || 'desconocido'), 'err');
  } catch(e){ showToast('Error al guardar PDF', 'err'); }
}

async function guardarExcel(wb, nombre){
  try{
    const b64 = XLSX.write(wb, {type:'base64', bookType:'xlsx'});
    const res = await pyCall('guardar_y_abrir_excel', nombre, b64);
    if(res && res.ok) showToast('Excel guardado', 'ok');
    else showToast('Error: ' + (res?.error || 'desconocido'), 'err');
  } catch(e){ showToast('Error al guardar Excel', 'err'); }
}

async function exportPaisPDF(){
  try{
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF();
    const d = STATE.datos;
    if(!d){ showToast('Sin datos', 'err'); return; }

    doc.setFillColor(31,78,120);
    doc.rect(0,0,210,28,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(16);
    doc.setFont('helvetica','bold');
    doc.text('ANÁLISIS POR PAÍS — PROLAN V17',105,12,{align:'center'});

    const paises = (d.paises||[]).slice(0,20);
    const total = paises.reduce((a,c) => a+c.kilos, 0) || 1;
    doc.autoTable({
      head:[['#','País','Kilos','Cajas','%']],
      body: paises.map((p,i) => [i+1, p.nombre, fmtFull(Math.round(p.kilos)), fmtFull(Math.round(p.cajas)), pct(p.kilos, total)]),
      startY: 32,
      headStyles: {fillColor:[30,58,95], textColor:255, fontSize:8},
      bodyStyles: {fontSize:8},
      alternateRowStyles: {fillColor:[248,250,252]},
      margin: {left:14, right:14}
    });

    await guardarPDF(doc, 'PROLAN_Paises_'+new Date().toISOString().slice(0,10)+'.pdf');
  } catch(e){ showToast('Error al exportar', 'err'); }
}

async function exportPaisExcel(){
  try{
    const d = STATE.datos;
    if(!d){ showToast('Sin datos', 'err'); return; }
    const paises = d.paises||[];
    const total = paises.reduce((a,c) => a+c.kilos, 0) || 1;
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paises.map((p,i) => ({
      '#':i+1, 'País':p.nombre, 'Kilos':Math.round(p.kilos), 'Cajas':Math.round(p.cajas), '%':pct(p.kilos, total)
    }))), 'Países');
    
    await guardarExcel(wb, 'PROLAN_Paises_'+new Date().toISOString().slice(0,10)+'.xlsx');
  } catch(e){ showToast('Error al exportar', 'err'); }
}

async function exportCalPDF(){
  try{
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF();
    const d = STATE.datos;
    if(!d){ showToast('Sin datos', 'err'); return; }

    doc.setFillColor(31,78,120);
    doc.rect(0,0,210,28,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(16);
    doc.text('QUIEBRE DE CALIBRE — PROLAN V17',105,12,{align:'center'});

    const cal = (d.cal||[]).slice(0,20);
    const total = cal.reduce((a,c) => a+c.kilos, 0) || 1;
    doc.autoTable({
      head:[['#','CAL','Kilos','Cajas','%']],
      body: cal.map((c,i) => [i+1, 'CAL '+c.nombre, fmtFull(Math.round(c.kilos)), fmtFull(Math.round(c.cajas)), pct(c.kilos, total)]),
      startY: 32,
      headStyles: {fillColor:[30,58,95], textColor:255, fontSize:8},
      bodyStyles: {fontSize:8},
      alternateRowStyles: {fillColor:[248,250,252]},
      margin: {left:14, right:14}
    });

    await guardarPDF(doc, 'PROLAN_Calibres_'+new Date().toISOString().slice(0,10)+'.pdf');
  } catch(e){ showToast('Error al exportar', 'err'); }
}

async function exportCalExcel(){
  try{
    const d = STATE.datos;
    if(!d){ showToast('Sin datos', 'err'); return; }
    const cal = d.cal||[];
    const total = cal.reduce((a,c) => a+c.kilos, 0) || 1;
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cal.map((c,i) => ({
      '#':i+1, 'CAL':'CAL '+c.nombre, 'Kilos':Math.round(c.kilos), 'Cajas':Math.round(c.cajas), '%':pct(c.kilos, total)
    }))), 'Calibres');
    
    await guardarExcel(wb, 'PROLAN_Calibres_'+new Date().toISOString().slice(0,10)+'.xlsx');
  } catch(e){ showToast('Error al exportar', 'err'); }
}

async function exportProductorPDF(){
  try{
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF();
    const d = STATE.datos;
    if(!d){ showToast('Sin datos', 'err'); return; }

    doc.setFillColor(31,78,120);
    doc.rect(0,0,210,28,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(16);
    doc.text('SEG. PRODUCTOR — PROLAN V17',105,12,{align:'center'});

    const grupos = (d.planta||[]).length ? d.planta : (d.prod||[]).slice(0,10);
    const total = grupos.reduce((a,c) => a+c.kilos, 0) || 1;
    doc.autoTable({
      head:[['#','Productor','Kilos','Cajas','%']],
      body: grupos.map((g,i) => [i+1, g.nombre, fmtFull(Math.round(g.kilos)), fmtFull(Math.round(g.cajas)), pct(g.kilos, total)]),
      startY: 32,
      headStyles: {fillColor:[30,58,95], textColor:255, fontSize:8},
      bodyStyles: {fontSize:8},
      alternateRowStyles: {fillColor:[248,250,252]},
      margin: {left:14, right:14}
    });

    await guardarPDF(doc, 'PROLAN_Productor_'+new Date().toISOString().slice(0,10)+'.pdf');
  } catch(e){ showToast('Error al exportar', 'err'); }
}

async function exportProductorExcel(){
  try{
    const d = STATE.datos;
    if(!d){ showToast('Sin datos', 'err'); return; }
    const grupos = (d.planta||[]).length ? d.planta : (d.prod||[]);
    const total = grupos.reduce((a,c) => a+c.kilos, 0) || 1;
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grupos.map((g,i) => ({
      '#':i+1, 'Productor':g.nombre, 'Kilos':Math.round(g.kilos), 'Cajas':Math.round(g.cajas), '%':pct(g.kilos, total)
    }))), 'Productores');
    
    await guardarExcel(wb, 'PROLAN_Productor_'+new Date().toISOString().slice(0,10)+'.xlsx');
  } catch(e){ showToast('Error al exportar', 'err'); }
}

// ============================================================
// INICIALIZAR
// ============================================================
window.addEventListener('pywebviewready', loadData);
setTimeout(() => {
  document.getElementById('loadingOverlay').classList.add('hidden');
  if(!STATE.datos) loadData();
}, 2000);
