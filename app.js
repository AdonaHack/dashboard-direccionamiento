const SPREADSHEET_ID = '1tg3GYdOLNR04g4ODRkudn06YHRLc_nycp5GBmfG7VFg';

let map;
let currentMarker;
let todasLasNaps = [];
let cacheZonas = {};
let cacheCoordenadas = {};

function initMap() {
    if (!map) {
        map = L.map('map').setView([-12.0863, -77.0365], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(map);
    }
}

function cambiarZona() {
    const selectZona = document.getElementById('filtro-zona');
    const textoZona = selectZona.options[selectZona.selectedIndex].text;
    document.getElementById('kpi-zona').textContent = textoZona;
    cargarDatos();
}

function cargarDatos() {
    const gidSeleccionado = document.getElementById('filtro-zona').value;

    if (cacheZonas[gidSeleccionado]) {
        procesarDatosNaps(cacheZonas[gidSeleccionado]);
        return;
    }

    document.getElementById('tabla-naps').innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando datos de la zona...</td></tr>';

    const scriptUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?gid=${gidSeleccionado}&tqx=responseHandler:procesarRespuestaGoogle`;

    const scriptAnterior = document.getElementById('google-sheet-script');
    if (scriptAnterior) scriptAnterior.remove();

    const script = document.createElement('script');
    script.id = 'google-sheet-script';
    script.src = scriptUrl;
    script.onerror = () => {
        document.getElementById('tabla-naps').innerHTML =
            '<tr><td colspan="5" style="color:red; text-align:center;">Error al cargar los datos. Revisa la conexión a internet.</td></tr>';
    };
    document.body.appendChild(script);
}

window.procesarRespuestaGoogle = function (datos) {
    try {
        const gidSeleccionado = document.getElementById('filtro-zona').value;
        cacheZonas[gidSeleccionado] = datos; 
        procesarDatosNaps(datos);
    } catch (e) {
        console.error('Error al procesar la respuesta de Google Sheets:', e);
    }
};

function procesarDatosNaps(datos) {
    const tabla = datos.table;
    const filas = tabla.rows;

    const getVal = (r, c) => {
        if (!filas[r] || !filas[r].c || !filas[r].c[c]) return '';
        return filas[r].c[c].v !== undefined && filas[r].c[c].v !== null ? String(filas[r].c[c].v).trim() : '';
    };

    todasLasNaps = [];
    let distritosSet = new Set();

    for (let i = 4; i < filas.length; i++) {
        const zona = getVal(i, 0);
        const distrito = getVal(i, 1);
        const direccion = getVal(i, 2);
        const napCode = getVal(i, 3);
        const tipoNap = getVal(i, 4) || 'HORIZONTAL';
        const edificio = getVal(i, 5);
        const puertos = getVal(i, 6) || '0';
        const linkMaps = getVal(i, 7);

        if (!napCode && !direccion && !distrito) continue;

        if (distrito) distritosSet.add(distrito);

        if (napCode) {
            todasLasNaps.push({
                zona,
                distrito,
                direccion,
                napCode,
                tipo: tipoNap,
                edificio,
                puertos,
                linkMaps
            });
        }
    }

    const selectDistrito = document.getElementById('filtro-distrito');
    selectDistrito.innerHTML = '<option value="TODOS">Todos los Distritos</option>';
    Array.from(distritosSet).sort().forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        selectDistrito.appendChild(opt);
    });

    filtrarDatos();
}

function filtrarDatos() {
    const distritoSeleccionado = document.getElementById('filtro-distrito').value;
    document.getElementById('kpi-distrito').textContent = distritoSeleccionado;

    const tbodyNaps = document.getElementById('tabla-naps');
    tbodyNaps.innerHTML = '';

    let filtradas = todasLasNaps;
    if (distritoSeleccionado !== 'TODOS') {
        filtradas = todasLasNaps.filter(n => n.distrito.toUpperCase() === distritoSeleccionado.toUpperCase());
    }

    let totalPuertosLibres = 0;
    let totalEdificiosSet = new Set();

    if (filtradas.length === 0) {
        tbodyNaps.innerHTML = '<tr><td colspan="5" style="text-align:center;">No se encontraron registros para este distrito.</td></tr>';
        document.getElementById('kpi-puertos').textContent = '0';
        document.getElementById('kpi-edificios').textContent = '0';
        return;
    }

    let htmlRows = '';
    filtradas.forEach(item => {
        totalPuertosLibres += parseInt(item.puertos) || 0;
        if (item.edificio) totalEdificiosSet.add(item.edificio);

        const dirEscaped = item.direccion.replace(/'/g, "\\'");
        const urlGoogleMaps = item.linkMaps || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.direccion + ', ' + item.distrito + ', Lima, Peru')}`;

        htmlRows += `
          <tr>
            <td>
              <strong>${item.napCode}</strong>
              ${item.edificio ? `<br><small style="color:#d9534f; font-weight:600;">Edificio: ${item.edificio}</small>` : ''}
            </td>
            <td>${item.direccion}</td>
            <td>
              <a href="${urlGoogleMaps}" target="_blank" class="btn-location btn-maps" style="margin-bottom: 4px; display:inline-block;">
                🗺️ G. Maps
              </a>
              <button class="btn-location" onclick="verEnMapa('${dirEscaped}', '${item.distrito}')">
                📍 App
              </button>
            </td>
            <td><span class="badge ${item.tipo.includes('VERTICAL') ? 'badge-vertical' : 'badge-horizontal'}">${item.tipo}</span></td>
            <td><strong>${item.puertos}</strong></td>
          </tr>
        `;
    });

    tbodyNaps.innerHTML = htmlRows;
    document.getElementById('kpi-puertos').textContent = totalPuertosLibres;
    document.getElementById('kpi-edificios').textContent = totalEdificiosSet.size;
}

async function verEnMapa(direccion, distritoActual) {
    if (!map) initMap();
    document.getElementById('map-title').textContent = `📍 Buscando ubicación...`;

    let queryCacheKey = `${direccion}_${distritoActual}`;

    if (cacheCoordenadas[queryCacheKey]) {
        const { lat, lon } = cacheCoordenadas[queryCacheKey];
        actualizarMarcadorMapa(lat, lon, direccion, distritoActual);
        return;
    }

    let direccionLimpia = direccion
        .replace(/Ctra\./gi, 'Carretera')
        .replace(/,\s*\d{5},\s*Perú/gi, '')
        .replace(/,\s*Lima,\s*Perú/gi, '')
        .replace(/,\s*Perú/gi, '')
        .trim();

    let queryStr = `${direccionLimpia}, ${distritoActual}, Lima, Perú`;

    try {
        let response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&addressdetails=1&limit=1`);
        let data = await response.json();

        if (!data || data.length === 0) {
            let callePrincipal = direccionLimpia.split(/Nº|N°|#|-/)[0].trim();
            queryStr = `${callePrincipal}, ${distritoActual}, Lima`;
            let res2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&addressdetails=1&limit=1`);
            data = await res2.json();
        }

        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);

            cacheCoordenadas[queryCacheKey] = { lat, lon };

            actualizarMarcadorMapa(lat, lon, direccion, distritoActual);
        } else {
            alert(`No se encontraron coordenadas exactas para: "${direccion}"`);
            document.getElementById('map-title').textContent = `📍 Ubicación en Mapa`;
        }
    } catch (error) {
        console.error('Error al obtener coordenadas:', error);
        alert('Error de conexión al buscar la dirección.');
        document.getElementById('map-title').textContent = `📍 Ubicación en Mapa`;
    }
}

function actualizarMarcadorMapa(lat, lon, direccion, distritoActual) {
    map.setView([lat, lon], 17);
    if (currentMarker) map.removeLayer(currentMarker);

    currentMarker = L.marker([lat, lon]).addTo(map)
        .bindPopup(`<b>${direccion}</b><br>${distritoActual}, Lima`)
        .openPopup();

    document.getElementById('map-title').textContent = `📍 Ubicación encontrada`;
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    cargarDatos();
});