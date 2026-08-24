let map=null, largeMap=null, routeLine=null, markers=[];

async function api(url, options={}){
  const res=await fetch(url,{headers:{"Content-Type":"application/json"},...options});
  let data={}; try{data=await res.json()}catch{}
  if(!res.ok) throw new Error(data.message||`HTTP ${res.status}`);
  return data;
}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.style.display='none',2500)}
function clock(){document.getElementById('clock').textContent=new Date().toLocaleTimeString()}
setInterval(clock,1000);

function showPage(page,el){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.sidebar li').forEach(v=>v.classList.remove('active'));
  const id=page==='map'?'mapPage':page==='drones'?'dronesPage':page==='ai'?'aiPage':page==='routes'?'routesPage':page==='missions'?'missionsPage':page==='settings'?'settingsPage':'dashboard';
  document.getElementById(id).classList.add('active'); if(el) el.classList.add('active');
  if(page==='map'&&largeMap) setTimeout(()=>largeMap.invalidateSize(),100);
  if(page==='drones') loadDrones(); if(page==='missions') loadMissions(); if(page==='settings') loadSettings();
}

function createMaps(){
  map=L.map('map').setView([21.1458,79.0882],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  L.polygon([[21.155,79.070],[21.160,79.085],[21.148,79.090],[21.145,79.072]],{color:'yellow',fillColor:'yellow',fillOpacity:.25}).addTo(map).bindPopup('⚠ Disaster Zone A');
  largeMap=L.map('largeMap').setView([21.1458,79.0882],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors'}).addTo(largeMap);
}

async function loadDashboard(){
  try{
    const d=await api('/api/dashboard');
    activeDrones.textContent=d.active_drones; totalDrones.textContent=`${d.total_drones} total`; survivors.textContent=d.survivors_detected; missionStatus.textContent=d.mission_status; battery.textContent=`${d.battery}%`; alertCount.textContent=`${d.open_alerts} open alerts`;
    serverStatus.textContent='🟢 ONLINE'; await loadAlerts(); await updateMarkers();
  }catch(e){serverStatus.textContent='🔴 OFFLINE';toast(e.message)}
}

async function loadAlerts(){
  const d=await api('/api/alerts'); const box=document.getElementById('alerts');
  box.innerHTML=d.alerts.length?d.alerts.slice(0,8).map(a=>`<div class="alert"><strong>${a.type}</strong><p>${a.message}</p><small>${a.timestamp}</small><br>${a.resolved?'<span>✓ Resolved</span>':`<button class="dark-btn" onclick="resolveAlert('${a.id}')">Resolve</button>`}</div>`).join(''):'<p>No alerts.</p>';
}
async function resolveAlert(id){try{await api(`/api/alerts/${id}/resolve`,{method:'POST'});toast('Alert resolved');loadDashboard()}catch(e){toast(e.message)}}

async function loadDrones(){
  try{
    const d=await api('/api/drones'); const grid=document.getElementById('droneGrid');
    grid.innerHTML=d.drones.map(x=>`<div class="drone"><h3>🚁 ${x.name}</h3><p>ID: ${x.id}</p><p>Status: <strong class="${x.status==='ACTIVE'?'active-status':'standby-status'}">${x.status}</strong></p><p>🔋 Battery: ${x.battery}%</p><p>🎯 Mission: ${x.mission||'None'}</p><p>📏 Altitude: ${x.altitude} m</p><p>💨 Speed: ${x.speed} km/h</p><div class="drone-buttons">${['START','STOP','SEARCH','RESCUE','PATROL','RETURN_HOME'].map(c=>`<button onclick="sendCommand('${x.id}','${c}')">${c.replace('_',' ')}</button>`).join('')}</div></div>`).join('');
    aiDrone.innerHTML='<option value="">No Drone</option>'+d.drones.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
  }catch(e){toast(e.message)}
}
async function sendCommand(id,cmd){try{const d=await api(`/api/drones/${id}/command`,{method:'POST',body:JSON.stringify({command:cmd})});toast(d.message);await loadDrones();await loadDashboard()}catch(e){toast(e.message)}}

async function updateMarkers(){
  if(!map)return; const d=await api('/api/drones'); markers.forEach(m=>map.removeLayer(m)); markers=[];
  d.drones.forEach(x=>{const m=L.marker([x.latitude,x.longitude]).addTo(map).bindPopup(`<strong>${x.name}</strong><br>Status: ${x.status}<br>Battery: ${x.battery}%<br>Mission: ${x.mission||'None'}`);markers.push(m)});
  if(largeMap){d.drones.forEach(x=>L.circleMarker([x.latitude,x.longitude],{radius:7}).addTo(largeMap).bindPopup(`${x.name} — ${x.status}`))}
}
async function refreshMap(){
    await updateMarkers();
    await loadDroneAreas();
    toast('Map refreshed');
}

async function runAI(){try{const d=await api('/api/ai/detect',{method:'POST',body:JSON.stringify({latitude:Number(aiLatitude.value),longitude:Number(aiLongitude.value),drone_id:aiDrone.value})});aiResult.innerHTML=`<h3>🤖 AI Detection Result</h3><br><p>👤 Survivors: <strong>${d.people_detected}</strong></p><p>🚗 Vehicles: <strong>${d.vehicles_detected}</strong></p><p>🏢 Buildings: <strong>${d.buildings_detected}</strong></p><p>⚠ Risk: <strong>${d.risk_level}</strong></p>`;toast('AI detection completed');loadDashboard()}catch(e){toast(e.message)}}

async function generateRoute(){try{const d=await api('/api/rescue/route',{method:'POST',body:JSON.stringify({start:{latitude:Number(startLat.value),longitude:Number(startLon.value)},target:{latitude:Number(targetLat.value),longitude:Number(targetLon.value)}})});routeResult.innerHTML=`<h3>📍 Rescue Route Generated</h3><br><p>Distance: ${d.distance_km} km</p><p>ETA: ${d.eta_minutes} minutes</p>`;if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline(d.route,{weight:5}).addTo(map);map.fitBounds(routeLine.getBounds());toast('Route generated')}catch(e){toast(e.message)}}

async function loadMissions(){try{const d=await api('/api/missions');missionList.innerHTML=d.missions.map(m=>`<div class="mission"><h3>${m.name}</h3><p>ID: ${m.id}</p><p>Type: ${m.type} | Priority: ${m.priority}</p><p>Status: <strong>${m.status}</strong></p><p>Drones: ${m.assigned_drones.join(', ')||'None'}</p>${m.status!=='ACTIVE'&&m.status!=='COMPLETED'?`<button class="btn" onclick="startMission('${m.id}')">Start Mission</button>`:''}${m.status==='ACTIVE'?` <button class="dark-btn" onclick="stopMission('${m.id}')">Complete</button>`:''}</div>`).join('')}catch(e){toast(e.message)}}
async function createMission(){const name=prompt('Enter mission name:','New Rescue Mission');if(!name)return;try{await api('/api/missions',{method:'POST',body:JSON.stringify({name,type:'SEARCH',priority:'HIGH',assigned_drones:['DR-001']})});toast('Mission created');loadMissions()}catch(e){toast(e.message)}}
async function startMission(id){try{const d=await api(`/api/missions/${id}/start`,{method:'POST'});toast(d.message);loadMissions();loadDrones();loadDashboard()}catch(e){toast(e.message)}}
async function stopMission(id){try{const d=await api(`/api/missions/${id}/stop`,{method:'POST'});toast(d.message);loadMissions();loadDashboard()}catch(e){toast(e.message)}}

async function loadSettings(){try{const d=await api('/api/settings');alertThreshold.value=d.settings.alert_threshold;refreshInterval.value=d.settings.refresh_seconds}catch(e){toast(e.message)}}
async function saveSettings(){try{await api('/api/settings',{method:'POST',body:JSON.stringify({alert_threshold:alertThreshold.value,refresh_seconds:Number(refreshInterval.value)})});toast('Settings saved')}catch(e){toast(e.message)}}

window.addEventListener('load',async()=>{clock();createMaps();await loadDashboard();await loadDrones();await loadMissions();setInterval(loadDashboard,5000)});

// ==========================================
// SKY SENTINEL DRONE AREA MAP
// ==========================================


// ------------------------------------------
// VARIABLES
// ------------------------------------------

let droneAreas = [];

let droneMarkers = [];

let disasterBoundary = null;

let legendControl = null;


// ------------------------------------------
// COLORS
// ------------------------------------------

const DRONE_COLORS = [

    "#22c55e",

    "#3b82f6",

    "#f97316",

    "#a855f7",

    "#ef4444",

    "#14b8a6",

    "#eab308",

    "#ec4899"

];


function getDroneColor(index) {

    return DRONE_COLORS[
        index % DRONE_COLORS.length
    ];

}


// ------------------------------------------
// CLEAR OLD MAP DATA
// ------------------------------------------

function clearDroneAreas() {

    droneAreas.forEach(
        layer => map.removeLayer(layer)
    );

    droneAreas = [];


    droneMarkers.forEach(
        marker => map.removeLayer(marker)
    );

    droneMarkers = [];


    if (disasterBoundary) {

        map.removeLayer(
            disasterBoundary
        );

        disasterBoundary = null;

    }


    if (legendControl) {

        map.removeControl(
            legendControl
        );

        legendControl = null;

    }

}


// ------------------------------------------
// LOAD DRONE AREAS
// ------------------------------------------

async function loadDroneAreas() {

    try {

        const response = await fetch(
            "/api/drone-areas"
        );


        if (!response.ok) {

            throw new Error(
                "Failed to load drone areas"
            );

        }


        const data =
            await response.json();


        if (!data.success) {

            throw new Error(
                "Area allocation failed"
            );

        }


        drawDroneAreas(data);


    }

    catch (error) {

        console.error(
            "Drone area error:",
            error
        );

    }

}


// ------------------------------------------
// DRAW DRONE AREAS
// ------------------------------------------

function drawDroneAreas(data) {

    clearDroneAreas();


    const zone =
        data.disaster_zone;


    // --------------------------------------
    // DISASTER ZONE
    // --------------------------------------

    disasterBoundary =
        L.rectangle(

            [

                [
                    zone.south,
                    zone.west
                ],

                [
                    zone.north,
                    zone.east
                ]

            ],

            {

                color: "#facc15",

                weight: 4,

                fill: false,

                dashArray: "8 6"

            }

        ).addTo(map);


    disasterBoundary.bindPopup(`

        <div>

            <h3>
                ⚠ Disaster Zone
            </h3>

            <p>
                <b>Total Area:</b>
                ${data.total_area_km2} km²
            </p>

            <p>
                <b>Hectares:</b>
                ${data.total_area_hectares}
            </p>

            <p>
                <b>Active Drones:</b>
                ${data.active_drones}
            </p>

        </div>

    `);


    // --------------------------------------
    // DRAW EVERY DRONE AREA
    // --------------------------------------

    data.areas.forEach(
        (area, index) => {

            const color =
                getDroneColor(index);


            // --------------------------------
            // POLYGON
            // --------------------------------

            const polygon =
                L.polygon(

                    area.coordinates,

                    {

                        color: color,

                        fillColor: color,

                        fillOpacity: 0.25,

                        weight: 3

                    }

                ).addTo(map);


            // --------------------------------
            // POPUP
            // --------------------------------

            polygon.bindPopup(`

                <div style="
                    min-width:220px;
                ">

                    <h3>
                        🚁
                        ${area.drone_name}
                    </h3>

                    <hr>

                    <p>
                        <b>Drone ID:</b>
                        ${area.drone_id}
                    </p>

                    <p>
                        <b>Status:</b>
                        ${area.status}
                    </p>

                    <p>
                        <b>Battery:</b>
                        ${area.battery}%
                    </p>

                    <p>
                        <b>Mission:</b>
                        ${area.mission || "NONE"}
                    </p>

                    <hr>

                    <p>
                        <b>Allotted Area</b>
                    </p>

                    <p>
                        📐
                        ${area.area_km2}
                        km²
                    </p>

                    <p>
                        🌐
                        ${area.area_hectares}
                        hectares
                    </p>

                    <p>
                        📊
                        ${area.percentage}%
                        of disaster zone
                    </p>

                </div>

            `);


            // --------------------------------
            // PERMANENT LABEL
            // --------------------------------

            polygon.bindTooltip(

                `
                <b>
                    ${area.drone_id}
                </b>

                <br>

                ${area.area_km2}
                km²
                `,

                {

                    permanent: true,

                    direction: "center",

                    className:
                        "drone-area-label"

                }

            );


            droneAreas.push(
                polygon
            );


            // --------------------------------
            // DRONE CENTER
            // --------------------------------

            const centerLat =
                (
                    area.bounds.south +
                    area.bounds.north
                ) / 2;


            const centerLon =
                (
                    area.bounds.west +
                    area.bounds.east
                ) / 2;


            // --------------------------------
            // DRONE MARKER
            // --------------------------------

            const droneIcon =
                L.divIcon({

                    className:
                        "drone-marker",

                    html: `

                        <div
                            style="
                                background:
                                    ${color};
                                width:34px;
                                height:34px;
                                border-radius:50%;
                                display:flex;
                                align-items:center;
                                justify-content:center;
                                border:3px solid white;
                                box-shadow:
                                    0 0 10px
                                    rgba(0,0,0,.5);
                                font-size:18px;
                            "
                        >

                            🚁

                        </div>

                    `,

                    iconSize: [
                        34,
                        34
                    ],

                    iconAnchor: [
                        17,
                        17
                    ]

                });


            const marker =
                L.marker(

                    [
                        centerLat,
                        centerLon
                    ],

                    {
                        icon:
                            droneIcon
                    }

                ).addTo(map);


            marker.bindPopup(`

                <div>

                    <h3>
                        🚁
                        ${area.drone_name}
                    </h3>

                    <p>
                        <b>ID:</b>
                        ${area.drone_id}
                    </p>

                    <p>
                        <b>Assigned Area:</b>
                        ${area.area_km2}
                        km²
                    </p>

                    <p>
                        <b>Coverage:</b>
                        ${area.percentage}%
                    </p>

                </div>

            `);


            droneMarkers.push(
                marker
            );

        }
    );


    // --------------------------------------
    // LEGEND
    // --------------------------------------

    createLegend(data);


    // --------------------------------------
    // FIT MAP
    // --------------------------------------

    map.fitBounds(

        [

            [
                zone.south,
                zone.west
            ],

            [
                zone.north,
                zone.east
            ]

        ],

        {
            padding: [
                30,
                30
            ]
        }

    );

}


// ------------------------------------------
// LEGEND
// ------------------------------------------

function createLegend(data) {

    const Legend =
        L.Control.extend({

            options: {
                position: "topright"
            },


            onAdd: function () {

                const div =
                    L.DomUtil.create(
                        "div",
                        "drone-legend"
                    );


                let html = `

                    <div
                        class="legend-title"
                    >
                        🚁
                        Drone Allocation
                    </div>

                    <div
                        class="legend-total"
                    >

                        Total:
                        <b>
                            ${data.total_area_km2}
                            km²
                        </b>

                    </div>

                `;


                data.areas.forEach(
                    (area, index) => {

                        const color =
                            getDroneColor(
                                index
                            );


                        html += `

                            <div
                                class="legend-item"
                            >

                                <span
                                    class="legend-dot"
                                    style="
                                        background:
                                            ${color};
                                    "
                                ></span>

                                <div>

                                    <b>
                                        ${area.drone_id}
                                    </b>

                                    <br>

                                    <small>

                                        ${area.area_km2}
                                        km²

                                        |

                                        ${area.percentage}%

                                    </small>

                                </div>

                            </div>

                        `;

                    }
                );


                div.innerHTML =
                    html;


                L.DomEvent
                    .disableClickPropagation(
                        div
                    );


                return div;

            }

        });


    legendControl =
        new Legend();


    map.addControl(
        legendControl
    );

}


// ------------------------------------------
// INITIAL LOAD
// ------------------------------------------

loadDroneAreas();


// ------------------------------------------
// AUTO REFRESH
// ------------------------------------------

setInterval(

    loadDroneAreas,

    5000

);