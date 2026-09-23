/* =========================================================
   SKY SENTINEL - REAL-TIME COMMAND CENTER
   Replace:
   static/js/script.js
   ========================================================= */

let map = null;
let largeMap = null;
let routeLine = null;

const markers = {};
const largeMarkers = {};
const trailLayers = {};
let areaLayers = [];
let disasterBoundary = null;
let legendControl = null;

let refreshTimer = null;
let telemetryTimer = null;
let areaTimer = null;

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


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}


async function api(url, options = {}) {

    const config = {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    };

    const response = await fetch(url, config);

    let data = {};

    try {
        data = await response.json();
    } catch (error) {
        // Response may not contain JSON
    }

    if (!response.ok) {
        throw new Error(
            data.message ||
            data.error ||
            `HTTP ${response.status}`
        );
    }

    return data;
}


function toast(message) {

    const element = $("toast");

    if (!element) {
        console.log(message);
        return;
    }

    element.textContent = message;
    element.style.display = "block";

    clearTimeout(window.__skyToastTimer);

    window.__skyToastTimer = setTimeout(() => {
        element.style.display = "none";
    }, 2500);
}


/* =========================================================
   CLOCK
   ========================================================= */

function clock() {

    const element = $("clock");

    if (element) {
        element.textContent =
            new Date().toLocaleTimeString();
    }
}

setInterval(clock, 1000);


/* =========================================================
   NAVIGATION
   ========================================================= */

function showPage(page, element) {

    document
        .querySelectorAll(".view")
        .forEach(view => {
            view.classList.remove("active");
        });

    document
        .querySelectorAll(".sidebar li")
        .forEach(item => {
            item.classList.remove("active");
        });


    const pageIds = {
        dashboard: "dashboard",
        map: "mapPage",
        drones: "dronesPage",
        ai: "aiPage",
        routes: "routesPage",
        missions: "missionsPage",
        settings: "settingsPage"
    };


    const target =
        $(pageIds[page] || "dashboard");

    if (target) {
        target.classList.add("active");
    }


    if (element) {
        element.classList.add("active");
    }


    if (page === "map") {

        setTimeout(() => {

            if (map) {
                map.invalidateSize();
            }

            if (largeMap) {
                largeMap.invalidateSize();
            }

        }, 150);
    }


    if (page === "drones") {
        loadDrones();
    }

    if (page === "missions") {
        loadMissions();
    }

    if (page === "settings") {
        loadSettings();
    }
}


/* =========================================================
   MAP
   ========================================================= */

function createMaps() {

    if (typeof L === "undefined") {

        console.error(
            "Leaflet is not loaded."
        );

        return;
    }


    const center = [
        21.1525,
        79.0850
    ];


    const mapElement = $("map");

    if (mapElement && !map) {

        map = L.map("map")
            .setView(center, 13);


        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution:
                    "&copy; OpenStreetMap contributors",

                maxZoom: 19
            }
        ).addTo(map);
    }


    const largeMapElement =
        $("largeMap");


    if (largeMapElement && !largeMap) {

        largeMap =
            L.map("largeMap")
                .setView(center, 13);


        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution:
                    "&copy; OpenStreetMap contributors",

                maxZoom: 19
            }
        ).addTo(largeMap);
    }
}


/* =========================================================
   REFRESH MAP
   ========================================================= */

async function refreshMap() {

    try {

        createMaps();

        await loadDroneAreas();
        await updateMarkers();

        toast("Map refreshed");

    } catch (error) {

        console.error(
            "Map refresh failed:",
            error
        );

        toast(
            "Map refresh failed"
        );
    }
}


/* =========================================================
   DRONE COLORS
   ========================================================= */

function getDroneColor(index) {

    return DRONE_COLORS[
        index % DRONE_COLORS.length
    ];
}


/* =========================================================
   DRONE ICON
   ========================================================= */

function createDroneIcon(color, status) {

    const opacity =
        status === "STANDBY"
            ? 0.65
            : 1;


    return L.divIcon({

        className:
            "sky-drone-icon",

        html: `
            <div style="
                width:36px;
                height:36px;
                border-radius:50%;
                display:flex;
                align-items:center;
                justify-content:center;
                background:${color};
                border:3px solid white;
                box-shadow:0 0 14px rgba(0,0,0,.45);
                font-size:19px;
                opacity:${opacity};
                position:relative;
            ">

                🚁

                <span style="
                    position:absolute;
                    right:-3px;
                    top:-3px;
                    width:10px;
                    height:10px;
                    border-radius:50%;
                    background:${
                        status === "ACTIVE"
                            ? "#22c55e"
                            : "#f59e0b"
                    };
                    border:2px solid white;
                "></span>

            </div>
        `,

        iconSize: [
            36,
            36
        ],

        iconAnchor: [
            18,
            18
        ],

        popupAnchor: [
            0,
            -18
        ]
    });
}


/* =========================================================
   DRONE POPUP
   ========================================================= */

function dronePopup(drone) {

    return `
        <div style="min-width:220px">

            <h3>
                🚁 ${drone.name}
            </h3>

            <hr>

            <p>
                <b>ID:</b>
                ${drone.id}
            </p>

            <p>
                <b>Status:</b>
                ${drone.status}
            </p>

            <p>
                <b>Battery:</b>
                ${drone.battery}%
            </p>

            <p>
                <b>Mission:</b>
                ${drone.mission || "NONE"}
            </p>

            <p>
                <b>Altitude:</b>
                ${drone.altitude ?? 0} m
            </p>

            <p>
                <b>Speed:</b>
                ${drone.speed ?? 0} km/h
            </p>

            <p>
                <b>Position:</b><br>
                ${Number(drone.latitude).toFixed(5)},
                ${Number(drone.longitude).toFixed(5)}
            </p>

        </div>
    `;
}


/* =========================================================
   LIVE DRONE MARKERS
   ========================================================= */

async function updateMarkers() {

    if (!map && !largeMap) {
        return;
    }


    try {

        const data =
            await api("/api/drones");

        const drones =
            data.drones || [];

        const seen =
            new Set();


        drones.forEach(
            (drone, index) => {

                seen.add(drone.id);


                const latitude =
                    Number(drone.latitude);

                const longitude =
                    Number(drone.longitude);


                if (
                    !Number.isFinite(latitude) ||
                    !Number.isFinite(longitude)
                ) {
                    return;
                }


                const position = [
                    latitude,
                    longitude
                ];


                const color =
                    getDroneColor(index);


                /* SMALL MAP */

                if (map) {

                    if (!markers[drone.id]) {

                        markers[drone.id] =
                            L.marker(
                                position,
                                {
                                    icon:
                                        createDroneIcon(
                                            color,
                                            drone.status
                                        )
                                }
                            ).addTo(map);

                    } else {

                        markers[drone.id]
                            .setLatLng(position);

                        markers[drone.id]
                            .setIcon(
                                createDroneIcon(
                                    color,
                                    drone.status
                                )
                            );
                    }


                    markers[drone.id]
                        .bindPopup(
                            dronePopup(drone)
                        );
                }


                /* LARGE MAP */

                if (largeMap) {

                    if (
                        !largeMarkers[drone.id]
                    ) {

                        largeMarkers[drone.id] =
                            L.marker(
                                position,
                                {
                                    icon:
                                        createDroneIcon(
                                            color,
                                            drone.status
                                        )
                                }
                            ).addTo(
                                largeMap
                            );

                    } else {

                        largeMarkers[drone.id]
                            .setLatLng(position);

                        largeMarkers[drone.id]
                            .setIcon(
                                createDroneIcon(
                                    color,
                                    drone.status
                                )
                            );
                    }


                    largeMarkers[drone.id]
                        .bindPopup(
                            dronePopup(drone)
                        );
                }
            }
        );


        /* REMOVE OLD MARKERS */

        Object.keys(markers)
            .forEach(id => {

                if (!seen.has(id)) {

                    if (map) {
                        map.removeLayer(
                            markers[id]
                        );
                    }

                    delete markers[id];
                }
            });


        Object.keys(largeMarkers)
            .forEach(id => {

                if (!seen.has(id)) {

                    if (largeMap) {
                        largeMap.removeLayer(
                            largeMarkers[id]
                        );
                    }

                    delete largeMarkers[id];
                }
            });


        await updateTrails(drones);

    } catch (error) {

        console.error(
            "Marker update failed:",
            error
        );
    }
}


/* =========================================================
   DRONE TRAILS
   ========================================================= */

async function updateTrails(drones) {

    for (const drone of drones) {

        try {

            const data =
                await api(
                    `/api/drones/${encodeURIComponent(
                        drone.id
                    )}/trail`
                );


            const trail =
                data.trail || [];


            if (trail.length < 2) {
                continue;
            }


            const points =
                trail.map(point => {

                    if (
                        Array.isArray(point)
                    ) {

                        return [
                            Number(point[0]),
                            Number(point[1])
                        ];
                    }


                    return [
                        Number(point.latitude),
                        Number(point.longitude)
                    ];
                });


            const index =
                drones.findIndex(
                    d =>
                        d.id === drone.id
                );


            const color =
                getDroneColor(
                    Math.max(index, 0)
                );


            /* SMALL MAP */

            if (map) {

                if (!trailLayers[drone.id]) {

                    trailLayers[drone.id] =
                        L.polyline(
                            points,
                            {
                                color,
                                weight: 3,
                                opacity: 0.7,
                                dashArray: "6 6"
                            }
                        ).addTo(map);

                } else {

                    trailLayers[drone.id]
                        .setLatLngs(points);
                }
            }


            /* LARGE MAP */

            if (largeMap) {

                const largeId =
                    `large-${drone.id}`;


                if (!trailLayers[largeId]) {

                    trailLayers[largeId] =
                        L.polyline(
                            points,
                            {
                                color,
                                weight: 3,
                                opacity: 0.65,
                                dashArray: "6 6"
                            }
                        ).addTo(
                            largeMap
                        );

                } else {

                    trailLayers[largeId]
                        .setLatLngs(points);
                }
            }

        } catch (error) {

            console.warn(
                `Trail unavailable for ${drone.id}:`,
                error.message
            );
        }
    }
}


/* =========================================================
   CLEAR DRONE AREAS
   ========================================================= */

function clearDroneAreas() {

    areaLayers.forEach(
        layer => {

            if (map) {
                map.removeLayer(layer);
            }

            if (largeMap) {
                largeMap.removeLayer(layer);
            }
        }
    );


    areaLayers = [];


    if (disasterBoundary) {

        if (map) {
            map.removeLayer(
                disasterBoundary
            );
        }

        if (largeMap) {
            largeMap.removeLayer(
                disasterBoundary
            );
        }

        disasterBoundary = null;
    }


    if (legendControl && map) {

        map.removeControl(
            legendControl
        );

        legendControl = null;
    }
}


/* =========================================================
   LOAD DRONE AREAS
   ========================================================= */

async function loadDroneAreas() {

    try {

        const data =
            await api(
                "/api/drone-areas"
            );


        if (!data.success) {
            throw new Error(
                "Area allocation failed"
            );
        }


        drawDroneAreas(data);

    } catch (error) {

        console.error(
            "Drone area error:",
            error
        );
    }
}


/* =========================================================
   DRAW DRONE AREAS
   ========================================================= */

function drawDroneAreas(data) {

    if (!map && !largeMap) {
        return;
    }


    clearDroneAreas();


    const zone =
        data.disaster_zone;


    if (!zone) {
        return;
    }


    const zoneBounds = [

        [
            zone.south,
            zone.west
        ],

        [
            zone.north,
            zone.east
        ]
    ];


    /* DISASTER BOUNDARY */

    if (map) {

        disasterBoundary =
            L.rectangle(
                zoneBounds,
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
    }


    /* DRONE AREAS */

    (data.areas || [])
        .forEach(
            (area, index) => {

                const color =
                    getDroneColor(index);


                const popup = `
                    <div style="min-width:220px">

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
                            <b>Allocated Area</b>
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
                `;


                if (
                    map &&
                    area.coordinates
                ) {

                    const polygon =
                        L.polygon(
                            area.coordinates,
                            {
                                color,
                                fillColor: color,
                                fillOpacity: 0.22,
                                weight: 3
                            }
                        ).addTo(map);


                    polygon.bindPopup(
                        popup
                    );


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


                    areaLayers.push(
                        polygon
                    );
                }


                if (
                    largeMap &&
                    area.coordinates
                ) {

                    const polygonLarge =
                        L.polygon(
                            area.coordinates,
                            {
                                color,
                                fillColor: color,
                                fillOpacity: 0.18,
                                weight: 3
                            }
                        ).addTo(
                            largeMap
                        );


                    polygonLarge.bindPopup(
                        popup
                    );


                    areaLayers.push(
                        polygonLarge
                    );
                }
            }
        );


    if (map) {
        createLegend(data);
    }


    if (map) {

        map.fitBounds(
            zoneBounds,
            {
                padding: [
                    30,
                    30
                ]
            }
        );
    }
}


/* =========================================================
   LEGEND
   ========================================================= */

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
                    <div class="legend-title">
                        🚁 Drone Allocation
                    </div>

                    <div class="legend-total">
                        Total:
                        <b>
                            ${data.total_area_km2}
                            km²
                        </b>
                    </div>
                `;


                (data.areas || [])
                    .forEach(
                        (area, index) => {

                            const color =
                                getDroneColor(index);


                            html += `
                                <div class="legend-item">

                                    <span
                                        class="legend-dot"
                                        style="
                                            background:${color};
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


                div.innerHTML = html;


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


/* =========================================================
   DASHBOARD
   ========================================================= */

async function loadDashboard() {

    try {

        const data =
            await api(
                "/api/dashboard"
            );


        if ($("activeDrones")) {

            $("activeDrones")
                .textContent =
                data.active_drones;
        }


        if ($("totalDrones")) {

            $("totalDrones")
                .textContent =
                `${data.total_drones} total`;
        }


        if ($("survivors")) {

            $("survivors")
                .textContent =
                data.survivors_detected;
        }


        if ($("missionStatus")) {

            $("missionStatus")
                .textContent =
                data.mission_status;
        }


        if ($("battery")) {

            $("battery")
                .textContent =
                `${data.battery}%`;
        }


        if ($("alertCount")) {

            $("alertCount")
                .textContent =
                `${data.open_alerts} open alerts`;
        }


        if ($("serverStatus")) {

            $("serverStatus")
                .textContent =
                "🟢 ONLINE";
        }


        await loadAlerts();

    } catch (error) {

        if ($("serverStatus")) {

            $("serverStatus")
                .textContent =
                "🔴 OFFLINE";
        }


        console.error(
            "Dashboard error:",
            error
        );
    }
}


/* =========================================================
   ALERTS
   ========================================================= */

async function loadAlerts() {

    try {

        const data =
            await api(
                "/api/alerts"
            );


        const box =
            $("alerts");


        if (!box) {
            return;
        }


        const alerts =
            data.alerts || [];


        if (!alerts.length) {

            box.innerHTML =
                "<p>No alerts.</p>";

            return;
        }


        box.innerHTML =
            alerts
                .slice(0, 8)
                .map(
                    alert => `

                        <div class="alert">

                            <strong>
                                ${alert.type}
                            </strong>

                            <p>
                                ${alert.message}
                            </p>

                            <small>
                                ${alert.timestamp}
                            </small>

                            <br>

                            ${
                                alert.resolved
                                    ? "<span>✓ Resolved</span>"
                                    : `
                                        <button
                                            class="dark-btn"
                                            onclick="
                                                resolveAlert(
                                                    '${alert.id}'
                                                )
                                            "
                                        >
                                            Resolve
                                        </button>
                                    `
                            }

                        </div>
                    `
                )
                .join("");

    } catch (error) {

        console.error(
            "Alert loading failed:",
            error
        );
    }
}


async function resolveAlert(id) {

    try {

        const data =
            await api(
                `/api/alerts/${encodeURIComponent(
                    id
                )}/resolve`,
                {
                    method: "POST"
                }
            );


        toast(
            data.message ||
            "Alert resolved"
        );


        await loadDashboard();

    } catch (error) {

        toast(
            error.message
        );
    }
}


/* =========================================================
   DRONE CARDS
   ========================================================= */

async function loadDrones() {

    try {

        const data =
            await api(
                "/api/drones"
            );


        const grid =
            $("droneGrid");


        if (grid) {

            grid.innerHTML =
                (data.drones || [])
                    .map(
                        drone => `

                            <div
                                class="drone"
                                data-drone-id="${drone.id}"
                            >

                                <h3>
                                    🚁
                                    ${drone.name}
                                </h3>

                                <p>
                                    ID:
                                    ${drone.id}
                                </p>

                                <p>
                                    Status:

                                    <strong
                                        class="${
                                            drone.status ===
                                            "ACTIVE"
                                                ? "active-status"
                                                : "standby-status"
                                        }"
                                    >
                                        ${drone.status}
                                    </strong>
                                </p>

                                <p>
                                    🔋 Battery:

                                    <span
                                        class="telemetry-battery"
                                    >
                                        ${drone.battery}%
                                    </span>
                                </p>

                                <p>
                                    🎯 Mission:
                                    ${drone.mission || "None"}
                                </p>

                                <p>
                                    📏 Altitude:

                                    <span
                                        class="telemetry-altitude"
                                    >
                                        ${drone.altitude ?? 0} m
                                    </span>
                                </p>

                                <p>
                                    💨 Speed:

                                    <span
                                        class="telemetry-speed"
                                    >
                                        ${drone.speed ?? 0} km/h
                                    </span>
                                </p>

                                <p>
                                    📍
                                    ${Number(drone.latitude).toFixed(5)},
                                    ${Number(drone.longitude).toFixed(5)}
                                </p>

                                <div class="drone-buttons">

                                    ${
                                        [
                                            "START",
                                            "STOP",
                                            "SEARCH",
                                            "RESCUE",
                                            "PATROL",
                                            "RETURN_HOME"
                                        ]
                                        .map(
                                            command => `

                                                <button
                                                    onclick="
                                                        sendCommand(
                                                            '${drone.id}',
                                                            '${command}'
                                                        )
                                                    "
                                                >
                                                    ${command.replace(
                                                        "_",
                                                        " "
                                                    )}
                                                </button>

                                            `
                                        )
                                        .join("")
                                    }

                                </div>

                            </div>
                        `
                    )
                    .join("");
        }


        /* AI DRONE DROPDOWN */

        const aiDrone =
            $("aiDrone");


        if (aiDrone) {

            aiDrone.innerHTML =
                `
                    <option value="">
                        No Drone
                    </option>
                ` +

                (data.drones || [])
                    .map(
                        drone => `
                            <option
                                value="${drone.id}"
                            >
                                ${drone.name}
                            </option>
                        `
                    )
                    .join("");
        }

    } catch (error) {

        console.error(
            "Drone loading failed:",
            error
        );

        toast(
            error.message
        );
    }
}


/* =========================================================
   DRONE COMMAND
   ========================================================= */

async function sendCommand(
    id,
    command
) {

    try {

        const data =
            await api(
                `/api/drones/${encodeURIComponent(
                    id
                )}/command`,
                {
                    method: "POST",

                    body:
                        JSON.stringify({
                            command
                        })
                }
            );


        toast(
            data.message ||
            `${command} sent`
        );


        await loadDrones();
        await loadDashboard();
        await updateMarkers();

    } catch (error) {

        toast(
            error.message
        );
    }
}


/* =========================================================
   AI DETECTION
   ========================================================= */

async function runAI() {

    try {

        const latitude =
            Number(
                $("aiLatitude")?.value
            );


        const longitude =
            Number(
                $("aiLongitude")?.value
            );


        const droneId =
            $("aiDrone")?.value ||
            "";


        const data =
            await api(
                "/api/ai/detect",
                {
                    method: "POST",

                    body:
                        JSON.stringify({

                            latitude,

                            longitude,

                            drone_id:
                                droneId
                        })
                }
            );


        const result =
            $("aiResult");


        if (result) {

            result.innerHTML = `

                <h3>
                    🤖 AI Detection Result
                </h3>

                <p>
                    👤 Survivors:
                    <strong>
                        ${data.people_detected}
                    </strong>
                </p>

                <p>
                    🚗 Vehicles:
                    <strong>
                        ${data.vehicles_detected}
                    </strong>
                </p>

                <p>
                    🏢 Buildings:
                    <strong>
                        ${data.buildings_detected}
                    </strong>
                </p>

                <p>
                    ⚠ Risk:
                    <strong>
                        ${data.risk_level}
                    </strong>
                </p>

            `;
        }


        toast(
            "AI detection completed"
        );


        await loadDashboard();

    } catch (error) {

        toast(
            error.message
        );
    }
}


/* =========================================================
   RESCUE ROUTE
   ========================================================= */

async function generateRoute() {

    try {

        const data =
            await api(
                "/api/rescue/route",
                {
                    method: "POST",

                    body:
                        JSON.stringify({

                            start: {

                                latitude:
                                    Number(
                                        $("startLat")?.value
                                    ),

                                longitude:
                                    Number(
                                        $("startLon")?.value
                                    )
                            },

                            target: {

                                latitude:
                                    Number(
                                        $("targetLat")?.value
                                    ),

                                longitude:
                                    Number(
                                        $("targetLon")?.value
                                    )
                            }

                        })
                }
            );


        const result =
            $("routeResult");


        if (result) {

            result.innerHTML = `

                <h3>
                    📍 Rescue Route Generated
                </h3>

                <p>
                    Distance:
                    ${data.distance_km}
                    km
                </p>

                <p>
                    ETA:
                    ${data.eta_minutes}
                    minutes
                </p>

            `;
        }


        if (
            map &&
            data.route
        ) {

            if (routeLine) {

                map.removeLayer(
                    routeLine
                );
            }


            routeLine =
                L.polyline(
                    data.route,
                    {
                        weight: 5,
                        opacity: 0.85
                    }
                ).addTo(map);


            map.fitBounds(
                routeLine.getBounds()
            );
        }


        toast(
            "Route generated"
        );

    } catch (error) {

        toast(
            error.message
        );
    }
}


/* =========================================================
   MISSIONS
   ========================================================= */

async function loadMissions() {

    try {

        const data =
            await api(
                "/api/missions"
            );


        const box =
            $("missionList");


        if (!box) {
            return;
        }


        box.innerHTML =
            (data.missions || [])
                .map(
                    mission => `

                        <div class="mission">

                            <h3>
                                ${mission.name}
                            </h3>

                            <p>
                                ID:
                                ${mission.id}
                            </p>

                            <p>
                                Type:
                                ${mission.type}

                                |

                                Priority:
                                ${mission.priority}
                            </p>

                            <p>
                                Status:

                                <strong>
                                    ${mission.status}
                                </strong>
                            </p>

                            <p>
                                Drones:
                                ${
                                    mission.assigned_drones?.join(
                                        ", "
                                    ) ||
                                    "None"
                                }
                            </p>

                            ${
                                mission.status !== "ACTIVE" &&
                                mission.status !== "COMPLETED"
                                    ? `
                                        <button
                                            class="btn"
                                            onclick="
                                                startMission(
                                                    '${mission.id}'
                                                )
                                            "
                                        >
                                            Start Mission
                                        </button>
                                    `
                                    : ""
                            }

                            ${
                                mission.status === "ACTIVE"
                                    ? `
                                        <button
                                            class="dark-btn"
                                            onclick="
                                                stopMission(
                                                    '${mission.id}'
                                                )
                                            "
                                        >
                                            Complete
                                        </button>
                                    `
                                    : ""
                            }

                        </div>
                    `
                )
                .join("");

    } catch (error) {

        toast(
            error.message
        );
    }
}


async function createMission() {

    const name =
        prompt(
            "Enter mission name:",
            "New Rescue Mission"
        );


    if (!name) {
        return;
    }


    try {

        await api(
            "/api/missions",
            {
                method: "POST",

                body:
                    JSON.stringify({

                        name,

                        type:
                            "SEARCH",

                        priority:
                            "HIGH",

                        assigned_drones: [
                            "DR-001"
                        ]
                    })
            }
        );


        toast(
            "Mission created"
        );


        await loadMissions();

    } catch (error) {

        toast(
            error.message
        );
    }
}


async function startMission(id) {

    try {

        const data =
            await api(
                `/api/missions/${encodeURIComponent(
                    id
                )}/start`,
                {
                    method: "POST"
                }
            );


        toast(
            data.message ||
            "Mission started"
        );


        await loadMissions();
        await loadDrones();
        await loadDashboard();
        await updateMarkers();

    } catch (error) {

        toast(
            error.message
        );
    }
}


async function stopMission(id) {

    try {

        const data =
            await api(
                `/api/missions/${encodeURIComponent(
                    id
                )}/stop`,
                {
                    method: "POST"
                }
            );


        toast(
            data.message ||
            "Mission completed"
        );


        await loadMissions();
        await loadDrones();
        await loadDashboard();

    } catch (error) {

        toast(
            error.message
        );
    }
}


/* =========================================================
   SETTINGS
   ========================================================= */

async function loadSettings() {

    try {

        const data =
            await api(
                "/api/settings"
            );


        if ($("alertThreshold")) {

            $("alertThreshold").value =
                data.settings.alert_threshold;
        }


        if ($("refreshInterval")) {

            $("refreshInterval").value =
                data.settings.refresh_seconds;
        }

    } catch (error) {

        console.error(
            "Settings error:",
            error
        );
    }
}


async function saveSettings() {

    try {

        await api(
            "/api/settings",
            {
                method: "POST",

                body:
                    JSON.stringify({

                        alert_threshold:
                            $("alertThreshold")?.value ||
                            "HIGH",

                        refresh_seconds:
                            Number(
                                $("refreshInterval")?.value ||
                                5
                            )
                    })
            }
        );


        toast(
            "Settings saved"
        );


        restartLiveRefresh();

    } catch (error) {

        toast(
            error.message
        );
    }
}


/* =========================================================
   TELEMETRY
   ========================================================= */

async function loadTelemetry() {

    try {

        const data =
            await api(
                "/api/telemetry"
            );


        const telemetry =
            data.telemetry ||
            data.drones ||
            [];


        telemetry.forEach(
            item => {

                const id =
                    item.id ||
                    item.drone_id;


                if (!id) {
                    return;
                }


                const card =
                    document.querySelector(
                        `[data-drone-id="${id}"]`
                    );


                if (!card) {
                    return;
                }


                const battery =
                    card.querySelector(
                        ".telemetry-battery"
                    );


                const altitude =
                    card.querySelector(
                        ".telemetry-altitude"
                    );


                const speed =
                    card.querySelector(
                        ".telemetry-speed"
                    );


                if (battery) {

                    battery.textContent =
                        `${item.battery ?? "--"}%`;
                }


                if (altitude) {

                    altitude.textContent =
                        `${item.altitude ?? "--"} m`;
                }


                if (speed) {

                    speed.textContent =
                        `${item.speed ?? "--"} km/h`;
                }

            }
        );

    } catch (error) {

        console.warn(
            "Telemetry update:",
            error.message
        );
    }
}


/* =========================================================
   SIMULATOR
   ========================================================= */

async function loadSimulatorStatus() {

    try {

        const data =
            await api(
                "/api/simulator"
            );


        const running =
            data.running ??
            data.simulator?.running ??
            false;


        const status =
            $("simulatorStatus");


        if (status) {

            status.textContent =
                running
                    ? "🟢 SIMULATOR RUNNING"
                    : "🟡 SIMULATOR STOPPED";
        }

    } catch (error) {

        console.warn(
            "Simulator status:",
            error.message
        );
    }
}


async function simulatorAction(action) {

    try {

        const data =
            await api(
                `/api/simulator/${action}`,
                {
                    method: "POST"
                }
            );


        toast(
            data.message ||
            `Simulator ${action}`
        );


        await loadSimulatorStatus();
        await updateMarkers();
        await loadDashboard();

    } catch (error) {

        toast(
            error.message
        );
    }
}


async function startSimulator() {

    await simulatorAction(
        "start"
    );
}


async function stopSimulator() {

    await simulatorAction(
        "stop"
    );
}


async function resetSimulator() {

    await simulatorAction(
        "reset"
    );
}


/* =========================================================
   LIVE REFRESH
   ========================================================= */

function restartLiveRefresh() {

    clearInterval(
        refreshTimer
    );

    clearInterval(
        telemetryTimer
    );

    clearInterval(
        areaTimer
    );


    let seconds = 5;


    if ($("refreshInterval")) {

        seconds =
            Math.max(
                1,
                Number(
                    $("refreshInterval").value
                ) || 5
            );
    }


    refreshTimer =
        setInterval(
            async () => {

                await loadDashboard();

                await loadDrones();

                await updateMarkers();

                await loadSimulatorStatus();

            },
            seconds * 1000
        );


    telemetryTimer =
        setInterval(
            loadTelemetry,
            1000
        );


    areaTimer =
        setInterval(
            loadDroneAreas,
            Math.max(
                seconds * 1000,
                5000
            )
        );
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

window.addEventListener(
    "load",
    async () => {

        clock();

        createMaps();


        try {

            await loadDashboard();

            await loadDrones();

            await loadMissions();

            await loadSettings();

            await loadDroneAreas();

            await updateMarkers();

            await loadTelemetry();

            await loadSimulatorStatus();

        } catch (error) {

            console.error(
                "SkySentinel initialization failed:",
                error
            );

            toast(
                "Failed to initialize dashboard"
            );
        }


        restartLiveRefresh();
    }
);


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.refreshMap =
    refreshMap;

window.loadDroneAreas =
    loadDroneAreas;

window.loadDrones =
    loadDrones;

window.sendCommand =
    sendCommand;

window.resolveAlert =
    resolveAlert;

window.runAI =
    runAI;

window.generateRoute =
    generateRoute;

window.loadMissions =
    loadMissions;

window.createMission =
    createMission;

window.startMission =
    startMission;

window.stopMission =
    stopMission;

window.loadSettings =
    loadSettings;

window.saveSettings =
    saveSettings;

window.startSimulator =
    startSimulator;

window.stopSimulator =
    stopSimulator;

window.resetSimulator =
    resetSimulator;

window.showPage =
    showPage;