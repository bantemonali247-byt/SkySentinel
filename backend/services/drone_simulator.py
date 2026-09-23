import threading
import time


class DroneSimulator:

    def __init__(self, drones, disaster_zone):
        self.drones = drones
        self.disaster_zone = disaster_zone

        self.running = False
        self.thread = None

        self.lock = threading.Lock()

        self.directions = {}
        self.trails = {}
        self.coverage = {}

        self._initialize()

    # ============================================================
    # INITIALIZE
    # ============================================================

    def _initialize(self):

        for drone in self.drones:

            drone_id = drone["id"]

            self.directions[drone_id] = {
                "latitude": 1,
                "longitude": 1
            }

            self.trails[drone_id] = [
                {
                    "latitude": drone["latitude"],
                    "longitude": drone["longitude"]
                }
            ]

            self.coverage[drone_id] = 0.0

            drone.setdefault("coverage", 0.0)
            drone.setdefault("heading", 0)
            drone.setdefault("last_update", time.time())

    # ============================================================
    # START
    # ============================================================

    def start(self):

        if self.running:
            return

        self.running = True

        self.thread = threading.Thread(
            target=self._run,
            daemon=True
        )

        self.thread.start()

        print("✓ Drone simulator started")

    # ============================================================
    # STOP
    # ============================================================

    def stop(self):

        self.running = False

        print("✓ Drone simulator stopped")

    # ============================================================
    # MAIN LOOP
    # ============================================================

    def _run(self):

        while self.running:

            try:
                self.update()

            except Exception as error:
                print(
                    "Drone simulator error:",
                    error
                )

            time.sleep(1)

    # ============================================================
    # UPDATE
    # ============================================================

    def update(self):

        with self.lock:

            for drone in self.drones:

                if drone.get("status") != "ACTIVE":
                    continue

                self._move_drone(drone)

                self._update_battery(drone)

                self._update_coverage(drone)

                self._update_trail(drone)

                drone["last_update"] = time.time()

    # ============================================================
    # MOVE DRONE
    # ============================================================

    def _move_drone(self, drone):

        drone_id = drone["id"]

        direction = self.directions[drone_id]

        # Movement per second
        movement = 0.00008

        latitude = drone["latitude"]
        longitude = drone["longitude"]

        new_latitude = (
            latitude
            + movement * direction["latitude"]
        )

        new_longitude = (
            longitude
            + movement * direction["longitude"]
        )

        # --------------------------------------------------------
        # BOUNDARY CHECK
        # --------------------------------------------------------

        if new_latitude >= self.disaster_zone["north"]:

            direction["latitude"] = -1

            new_latitude = (
                self.disaster_zone["north"]
                - movement
            )

        elif new_latitude <= self.disaster_zone["south"]:

            direction["latitude"] = 1

            new_latitude = (
                self.disaster_zone["south"]
                + movement
            )

        if new_longitude >= self.disaster_zone["east"]:

            direction["longitude"] = -1

            new_longitude = (
                self.disaster_zone["east"]
                - movement
            )

        elif new_longitude <= self.disaster_zone["west"]:

            direction["longitude"] = 1

            new_longitude = (
                self.disaster_zone["west"]
                + movement
            )

        # --------------------------------------------------------
        # SAVE POSITION
        # --------------------------------------------------------

        drone["latitude"] = round(
            new_latitude,
            6
        )

        drone["longitude"] = round(
            new_longitude,
            6
        )

        # --------------------------------------------------------
        # HEADING
        # --------------------------------------------------------

        heading = 0

        if direction["latitude"] > 0:
            heading += 0

        else:
            heading += 180

        if direction["longitude"] > 0:
            heading += 45

        else:
            heading += 315

        drone["heading"] = heading % 360

        # --------------------------------------------------------
        # ALTITUDE
        # --------------------------------------------------------

        altitude = drone.get(
            "altitude",
            100
        )

        altitude += 0.5 * direction["latitude"]

        if altitude > 150:
            altitude = 150

        if altitude < 80:
            altitude = 80

        drone["altitude"] = round(
            altitude,
            1
        )

        # --------------------------------------------------------
        # SPEED
        # --------------------------------------------------------

        base_speed = drone.get(
            "speed",
            25
        )

        drone["speed"] = round(
            max(
                15,
                min(
                    40,
                    base_speed
                )
            ),
            1
        )

    # ============================================================
    # BATTERY
    # ============================================================

    def _update_battery(self, drone):

        battery = float(
            drone.get(
                "battery",
                100
            )
        )

        # Very slow simulated battery drain
        battery -= 0.01

        battery = max(
            0,
            battery
        )

        drone["battery"] = round(
            battery,
            2
        )

        # Low battery state
        if battery <= 10:

            drone["status"] = "LOW_BATTERY"

            drone["speed"] = 15

        elif battery <= 20:

            drone["status"] = "LOW_BATTERY"

    # ============================================================
    # COVERAGE
    # ============================================================

    def _update_coverage(self, drone):

        drone_id = drone["id"]

        coverage = self.coverage.get(
            drone_id,
            0
        )

        coverage += 0.05

        if coverage >= 100:
            coverage = 100

        self.coverage[drone_id] = round(
            coverage,
            2
        )

        drone["coverage"] = (
            self.coverage[drone_id]
        )

    # ============================================================
    # TRAIL
    # ============================================================

    def _update_trail(self, drone):

        drone_id = drone["id"]

        trail = self.trails.setdefault(
            drone_id,
            []
        )

        trail.append({
            "latitude": drone["latitude"],
            "longitude": drone["longitude"]
        })

        # Keep last 150 points
        if len(trail) > 150:

            del trail[
                0:
                len(trail) - 150
            ]

    # ============================================================
    # GET TRAIL
    # ============================================================

    def get_trail(self, drone_id):

        with self.lock:

            return list(
                self.trails.get(
                    drone_id,
                    []
                )
            )

    # ============================================================
    # CLEAR TRAIL
    # ============================================================

    def clear_trail(self, drone_id):

        with self.lock:

            drone = next(
                (
                    d for d in self.drones
                    if d["id"] == drone_id
                ),
                None
            )

            if drone:

                self.trails[drone_id] = [
                    {
                        "latitude":
                            drone["latitude"],
                        "longitude":
                            drone["longitude"]
                    }
                ]

    # ============================================================
    # RESET
    # ============================================================

    def reset(self):

        with self.lock:

            for drone in self.drones:

                drone_id = drone["id"]

                self.coverage[
                    drone_id
                ] = 0

                drone["coverage"] = 0

                self.trails[
                    drone_id
                ] = [
                    {
                        "latitude":
                            drone["latitude"],
                        "longitude":
                            drone["longitude"]
                    }
                ]

    # ============================================================
    # STATUS
    # ============================================================

    def get_status(self):

        return {
            "running": self.running,
            "drone_count": len(
                self.drones
            )
        }