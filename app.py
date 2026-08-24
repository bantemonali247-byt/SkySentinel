from datetime import datetime
import random
import uuid
import math

from flask import Flask, jsonify, render_template, request
from flask_cors import CORS


# ============================================================
# FLASK APP
# ============================================================

app = Flask(__name__)
CORS(app)


# ============================================================
# GLOBAL DATA
# ============================================================

drones = [
    {
        "id": "DR-001",
        "name": "Sentinel Alpha",
        "status": "ACTIVE",
        "battery": 87,
        "latitude": 21.1458,
        "longitude": 79.0882,
        "altitude": 120,
        "speed": 32,
        "mission": "SEARCH"
    },
    {
        "id": "DR-002",
        "name": "Sentinel Beta",
        "status": "ACTIVE",
        "battery": 64,
        "latitude": 21.1510,
        "longitude": 79.0960,
        "altitude": 105,
        "speed": 28,
        "mission": "SEARCH"
    },
    {
        "id": "DR-003",
        "name": "Sentinel Gamma",
        "status": "STANDBY",
        "battery": 93,
        "latitude": 21.1390,
        "longitude": 79.0800,
        "altitude": 0,
        "speed": 0,
        "mission": None
    },
    {
        "id": "DR-004",
        "name": "Sentinel Delta",
        "status": "ACTIVE",
        "battery": 72,
        "latitude": 21.1580,
        "longitude": 79.0740,
        "altitude": 98,
        "speed": 25,
        "mission": "PATROL"
    }
]


missions = [
    {
        "id": "MSN-001",
        "name": "Nagpur Flood Search",
        "type": "SEARCH",
        "priority": "HIGH",
        "status": "ACTIVE",
        "assigned_drones": [
            "DR-001",
            "DR-002"
        ],
        "created_at": datetime.now().isoformat(
            timespec="seconds"
        )
    }
]


alerts = [
    {
        "id": "ALT-001",
        "type": "PERSON_DETECTED",
        "severity": "HIGH",
        "message": "Possible survivor detected by DR-001",
        "latitude": 21.1490,
        "longitude": 79.0910,
        "drone_id": "DR-001",
        "resolved": False,
        "timestamp": datetime.now().isoformat(
            timespec="seconds"
        )
    }
]


settings = {
    "auto_dispatch": True,
    "alert_threshold": "HIGH",
    "refresh_seconds": 5
}


# ============================================================
# DISASTER ZONE
# ============================================================

DISASTER_ZONE = {
    "south": 21.1450,
    "north": 21.1600,
    "west": 79.0700,
    "east": 79.1000
}


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def current_time():
    return datetime.now().isoformat(
        timespec="seconds"
    )


def find_drone(drone_id):
    return next(
        (
            drone
            for drone in drones
            if drone["id"] == drone_id
        ),
        None
    )


# ============================================================
# HOME
# ============================================================

@app.route("/")
def home():
    return render_template("index.html")


# ============================================================
# HEALTH CHECK
# ============================================================

@app.route("/api/health", methods=["GET"])
def health():

    return jsonify({
        "success": True,
        "status": "online",
        "system": "SkySentinel",
        "mode": "simulation",
        "time": current_time()
    })


# ============================================================
# DASHBOARD
# ============================================================

@app.route("/api/dashboard", methods=["GET"])
def dashboard():

    active_drones = [
        drone
        for drone in drones
        if drone["status"] == "ACTIVE"
    ]

    average_battery = 0

    if drones:
        average_battery = round(
            sum(
                drone["battery"]
                for drone in drones
            ) / len(drones)
        )

    survivors_detected = sum(
        1
        for alert in alerts
        if (
            alert["type"] == "PERSON_DETECTED"
            and not alert["resolved"]
        )
    )

    open_alerts = sum(
        1
        for alert in alerts
        if not alert["resolved"]
    )

    active_mission = any(
        mission["status"] == "ACTIVE"
        for mission in missions
    )

    return jsonify({

        "success": True,

        "active_drones":
            len(active_drones),

        "total_drones":
            len(drones),

        "survivors_detected":
            survivors_detected,

        "mission_status":
            "ACTIVE"
            if active_mission
            else "IDLE",

        "battery":
            average_battery,

        "open_alerts":
            open_alerts
    })


# ============================================================
# DRONES
# ============================================================

@app.route("/api/drones", methods=["GET"])
def get_drones():

    active_count = sum(
        1
        for drone in drones
        if drone["status"] == "ACTIVE"
    )

    return jsonify({

        "success": True,

        "drones":
            drones,

        "active_drones":
            active_count
    })


@app.route(
    "/api/drones/<drone_id>",
    methods=["GET"]
)
def get_drone(drone_id):

    drone = find_drone(drone_id)

    if drone is None:

        return jsonify({
            "success": False,
            "message": "Drone not found"
        }), 404

    return jsonify({
        "success": True,
        "drone": drone
    })


# ============================================================
# DRONE COMMAND
# ============================================================

@app.route(
    "/api/drones/<drone_id>/command",
    methods=["POST"]
)
def drone_command(drone_id):

    drone = find_drone(drone_id)

    if drone is None:

        return jsonify({
            "success": False,
            "message": "Drone not found"
        }), 404

    data = request.get_json(
        silent=True
    ) or {}

    command = str(
        data.get("command", "")
    ).upper()

    allowed_commands = {
        "START",
        "STOP",
        "SEARCH",
        "RESCUE",
        "PATROL",
        "RETURN_HOME"
    }

    if command not in allowed_commands:

        return jsonify({

            "success": False,

            "message":
                "Invalid command. Allowed commands: "
                + ", ".join(
                    sorted(allowed_commands)
                )
        }), 400


    # START
    if command == "START":

        drone["status"] = "ACTIVE"

        drone["altitude"] = 100

        drone["speed"] = 25

        if not drone.get("mission"):
            drone["mission"] = "SEARCH"


    # STOP
    elif command == "STOP":

        drone["status"] = "STANDBY"

        drone["mission"] = None

        drone["altitude"] = 0

        drone["speed"] = 0


    # RETURN HOME
    elif command == "RETURN_HOME":

        drone["status"] = "ACTIVE"

        drone["mission"] = "RETURNING"

        drone["altitude"] = 80

        drone["speed"] = 20


    # SEARCH / RESCUE / PATROL
    else:

        drone["status"] = "ACTIVE"

        drone["mission"] = command

        drone["altitude"] = max(
            drone["altitude"],
            80
        )

        drone["speed"] = max(
            drone["speed"],
            20
        )


    return jsonify({

        "success": True,

        "message":
            f"{command} command sent to "
            f"{drone['name']}",

        "drone":
            drone
    })


# ============================================================
# MISSIONS
# ============================================================

@app.route(
    "/api/missions",
    methods=["GET"]
)
def get_missions():

    return jsonify({

        "success": True,

        "missions":
            missions
    })


@app.route(
    "/api/missions",
    methods=["POST"]
)
def create_mission():

    data = request.get_json(
        silent=True
    ) or {}

    mission = {

        "id":
            "MSN-"
            + uuid.uuid4().hex[:6].upper(),

        "name":
            data.get(
                "name",
                "New Rescue Mission"
            ),

        "type":
            data.get(
                "type",
                "SEARCH"
            ),

        "priority":
            data.get(
                "priority",
                "HIGH"
            ),

        "status":
            "PLANNING",

        "assigned_drones":
            data.get(
                "assigned_drones",
                []
            ),

        "created_at":
            current_time()
    }

    missions.insert(
        0,
        mission
    )

    return jsonify({

        "success": True,

        "mission":
            mission
    }), 201


# ============================================================
# START MISSION
# ============================================================

@app.route(
    "/api/missions/<mission_id>/start",
    methods=["POST"]
)
def start_mission(mission_id):

    mission = next(
        (
            mission
            for mission in missions
            if mission["id"] == mission_id
        ),
        None
    )

    if mission is None:

        return jsonify({
            "success": False,
            "message": "Mission not found"
        }), 404


    mission["status"] = "ACTIVE"


    for drone_id in mission[
        "assigned_drones"
    ]:

        drone = find_drone(
            drone_id
        )

        if drone:

            drone["status"] = "ACTIVE"

            drone["mission"] = (
                mission["type"]
            )

            drone["altitude"] = 100

            drone["speed"] = 25


    return jsonify({

        "success": True,

        "message":
            "Mission started",

        "mission":
            mission
    })


# ============================================================
# STOP MISSION
# ============================================================

@app.route(
    "/api/missions/<mission_id>/stop",
    methods=["POST"]
)
def stop_mission(mission_id):

    mission = next(
        (
            mission
            for mission in missions
            if mission["id"] == mission_id
        ),
        None
    )

    if mission is None:

        return jsonify({
            "success": False,
            "message": "Mission not found"
        }), 404


    mission["status"] = "COMPLETED"


    for drone_id in mission[
        "assigned_drones"
    ]:

        drone = find_drone(
            drone_id
        )

        if drone:

            drone["status"] = "STANDBY"

            drone["mission"] = None

            drone["altitude"] = 0

            drone["speed"] = 0


    return jsonify({

        "success": True,

        "message":
            "Mission completed",

        "mission":
            mission
    })


# ============================================================
# ALERTS
# ============================================================

@app.route(
    "/api/alerts",
    methods=["GET"]
)
def get_alerts():

    return jsonify({

        "success": True,

        "alerts":
            alerts
    })


@app.route(
    "/api/alerts/<alert_id>/resolve",
    methods=["POST"]
)
def resolve_alert(alert_id):

    alert = next(
        (
            alert
            for alert in alerts
            if alert["id"] == alert_id
        ),
        None
    )

    if alert is None:

        return jsonify({

            "success": False,

            "message":
                "Alert not found"
        }), 404


    alert["resolved"] = True


    return jsonify({

        "success": True,

        "message":
            "Alert resolved",

        "alert":
            alert
    })


# ============================================================
# AI DETECTION
# ============================================================

@app.route(
    "/api/ai/detect",
    methods=["POST"]
)
def ai_detect():

    data = request.get_json(
        silent=True
    ) or {}


    latitude = float(
        data.get(
            "latitude",
            21.1458
        )
    )

    longitude = float(
        data.get(
            "longitude",
            79.0882
        )
    )

    drone_id = data.get(
        "drone_id"
    )


    people = random.randint(
        0,
        4
    )

    vehicles = random.randint(
        0,
        3
    )

    buildings = random.randint(
        1,
        10
    )

    risk_level = random.choice([
        "LOW",
        "MEDIUM",
        "HIGH"
    ])


    if people > 0:

        alerts.insert(

            0,

            {

                "id":
                    "ALT-"
                    + uuid.uuid4().hex[:6].upper(),

                "type":
                    "PERSON_DETECTED",

                "severity":
                    "HIGH",

                "message":
                    f"AI detected {people} "
                    "possible survivor(s)",

                "latitude":
                    latitude,

                "longitude":
                    longitude,

                "drone_id":
                    drone_id,

                "resolved":
                    False,

                "timestamp":
                    current_time()
            }
        )


    return jsonify({

        "success": True,

        "mode":
            "simulation",

        "people_detected":
            people,

        "vehicles_detected":
            vehicles,

        "buildings_detected":
            buildings,

        "risk_level":
            risk_level,

        "latitude":
            latitude,

        "longitude":
            longitude
    })


# ============================================================
# RESCUE ROUTE
# ============================================================

@app.route(
    "/api/rescue/route",
    methods=["POST"]
)
def rescue_route():

    data = request.get_json(
        silent=True
    ) or {}


    start = data.get(

        "start",

        {
            "latitude":
                21.1400,

            "longitude":
                79.0800
        }
    )


    target = data.get(

        "target",

        {
            "latitude":
                21.1550,

            "longitude":
                79.0950
        }
    )


    route = []

    steps = 20


    for i in range(
        steps + 1
    ):

        ratio = i / steps


        latitude = (
            start["latitude"]
            + (
                target["latitude"]
                - start["latitude"]
            ) * ratio
        )


        longitude = (
            start["longitude"]
            + (
                target["longitude"]
                - start["longitude"]
            ) * ratio
        )


        route.append([
            latitude,
            longitude
        ])


    return jsonify({

        "success":
            True,

        "route":
            route,

        "distance_km":
            round(
                random.uniform(
                    2,
                    6
                ),
                2
            ),

        "eta_minutes":
            random.randint(
                4,
                15
            ),

        "mode":
            "simulation"
    })


# ============================================================
# SETTINGS
# ============================================================

@app.route(
    "/api/settings",
    methods=["GET"]
)
def get_settings():

    return jsonify({

        "success":
            True,

        "settings":
            settings
    })


@app.route(
    "/api/settings",
    methods=["POST"]
)
def update_settings():

    data = request.get_json(
        silent=True
    ) or {}


    for key in settings:

        if key in data:

            settings[key] = data[key]


    return jsonify({

        "success":
            True,

        "settings":
            settings
    })


# ============================================================
# DRONE AREA ALLOCATION
# ============================================================

def calculate_area_km2(
    south,
    north,
    west,
    east
):

    height_km = (
        abs(
            north - south
        )
        * 111.32
    )


    middle_latitude = (
        south + north
    ) / 2


    width_km = (

        abs(
            east - west
        )

        * 111.32

        * math.cos(
            math.radians(
                middle_latitude
            )
        )
    )


    return round(
        height_km * width_km,
        3
    )


def generate_drone_areas():

    active_drones = [

        drone

        for drone in drones

        if drone["status"]
        == "ACTIVE"

    ]


    drone_count = len(
        active_drones
    )


    if drone_count == 0:

        return []


    rows = max(
        1,
        math.floor(
            math.sqrt(
                drone_count
            )
        )
    )


    columns = math.ceil(
        drone_count / rows
    )


    while (
        rows * columns
        < drone_count
    ):

        rows += 1


    latitude_step = (

        DISASTER_ZONE["north"]
        - DISASTER_ZONE["south"]

    ) / rows


    longitude_step = (

        DISASTER_ZONE["east"]
        - DISASTER_ZONE["west"]

    ) / columns


    areas = []


    for index, drone in enumerate(
        active_drones
    ):

        row = (
            index // columns
        )

        column = (
            index % columns
        )


        south = (

            DISASTER_ZONE["south"]

            + row
            * latitude_step
        )


        north = (
            south
            + latitude_step
        )


        west = (

            DISASTER_ZONE["west"]

            + column
            * longitude_step
        )


        east = (
            west
            + longitude_step
        )


        area_km2 = (
            calculate_area_km2(
                south,
                north,
                west,
                east
            )
        )


        areas.append({

            "drone_id":
                drone["id"],

            "drone_name":
                drone["name"],

            "status":
                drone["status"],

            "battery":
                drone["battery"],

            "mission":
                drone["mission"],

            "area_km2":
                round(
                    area_km2,
                    3
                ),

            "area_hectares":
                round(
                    area_km2 * 100,
                    2
                ),

            "percentage":
                round(
                    100 / drone_count,
                    1
                ),

            "coordinates": [

                [
                    south,
                    west
                ],

                [
                    south,
                    east
                ],

                [
                    north,
                    east
                ],

                [
                    north,
                    west
                ]
            ],

            "bounds": {

                "south":
                    south,

                "north":
                    north,

                "west":
                    west,

                "east":
                    east
            }
        })


    return areas


@app.route(
    "/api/drone-areas",
    methods=["GET"]
)
def get_drone_areas():

    areas = (
        generate_drone_areas()
    )


    total_area = (
        calculate_area_km2(

            DISASTER_ZONE["south"],

            DISASTER_ZONE["north"],

            DISASTER_ZONE["west"],

            DISASTER_ZONE["east"]
        )
    )


    return jsonify({

        "success":
            True,

        "total_area_km2":
            total_area,

        "total_area_hectares":
            round(
                total_area * 100,
                2
            ),

        "active_drones":
            len(areas),

        "disaster_zone":
            DISASTER_ZONE,

        "areas":
            areas
    })


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    app.run(

        host="127.0.0.1",

        port=5000,

        debug=True,

        use_reloader=False
    )