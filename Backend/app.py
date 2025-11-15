from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import math
import polyline

app = Flask(__name__)
CORS(app)

# Danh sách địa điểm
locations = [
    {"name": "Dinh Độc Lập", "lat": 10.7769, "lng": 106.6953},
    {"name": "Nhà thờ Đức Bà", "lat": 10.7798, "lng": 106.6990},
    {"name": "Bưu điện Thành phố", "lat": 10.7800, "lng": 106.7000},
    # {"name": "Bảo tàng Chứng tích Chiến tranh", "lat": 10.7794, "lng": 106.6820},
    # {"name": "Chợ Bến Thành", "lat": 10.7726, "lng": 106.6982}
]

# Thay bằng API Key thực của bạn
ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImY2MThkYjdmMDQwMjRkYmQ4YzI1NjFjYTBmNzMwODUyIiwiaCI6Im11cm11cjY0In0="  # CẬN THẬN: Thay key thực tại đây

# # Cache khoảng cách để giảm yêu cầu API
distance_cache = {}

def distance_m(start, end):
    # start, end = {"lat":..., "lng":...}
    R = 6371000  # bán kính Trái đất (m)
    phi1 = math.radians(start["lat"])
    phi2 = math.radians(end["lat"])
    dphi = math.radians(end["lat"] - start["lat"])
    dlambda = math.radians(end["lng"] - start["lng"])

    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    c = 2*math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def merge_start_if_too_close(user_location, locations, threshold_m=50):
    for loc in locations:
        dist = distance_m(user_location, loc)  # dùng hàm Euclidean
        if dist < threshold_m:
            print(f"Start quá gần {loc['name']}, merge start với điểm này")
            return loc, [l for l in locations if l != loc]
    return user_location, locations

    return R * c
# Hàm gọi OpenRouteService
def get_route_distance_and_path(start, end):
    """
    Lấy khoảng cách (m) và path (danh sách [lat,lng]) giữa 2 điểm start và end
    Sử dụng OpenRouteService Driving-Car API
    """
    cache_key = f"{start['lat']},{start['lng']}-{end['lat']},{end['lng']}"
    if cache_key in distance_cache:
        return distance_cache[cache_key]

    url = "https://api.openrouteservice.org/v2/directions/driving-car"
    headers = {"Authorization": ORS_API_KEY, "Content-Type": "application/json"}
    body = {
        "coordinates": [[start["lng"], start["lat"]], [end["lng"], end["lat"]]]
    }

    try:
        response = requests.post(url, json=body, headers=headers)
        data = response.json()

        if response.status_code != 200:
            print(f"ORS API error {response.status_code}: {data}")
            return float('inf'), []

        if "routes" in data and len(data["routes"]) > 0:
            route_info = data["routes"][0]
            summary = route_info.get("summary", {})
            distance = summary.get("distance", float('inf'))  # đơn vị mét

            geometry = route_info.get("geometry", "")
            path = [[lat, lng] for lng, lat in polyline.decode(geometry)] if geometry else []

            # lưu cache
            distance_cache[cache_key] = (distance, path)
            return distance, path
        else:
            print(f"No 'routes' found in ORS response: {data}")
            return float('inf'), []

    except Exception as e:
        print(f"Exception calling ORS API: {e}")
        return float('inf'), []

# Thuật toán Greedy TSP
def greedy_tsp(locations):
    n = len(locations)
    current = 0
    route = [current]
    visited = {current}
    total_distance = 0.0
    route_paths = []

    while len(visited) < n:
        min_dist = float('inf')
        next_loc = -1
        best_path = []

        for i in range(n):
            if i not in visited:
                dist, path = get_route_distance_and_path(locations[current], locations[i])
                if dist < min_dist:
                    min_dist = dist
                    next_loc = i
                    best_path = path

        if next_loc != -1:
            route.append(next_loc)
            visited.add(next_loc)
            total_distance += min_dist
            route_paths.append(best_path)
            current = next_loc

    # Quay về điểm xuất phát
    dist, path = get_route_distance_and_path(locations[current], locations[0])
    total_distance += dist
    route.append(0)
    route_paths.append(path)

    return route, total_distance, route_paths

# API endpoints
@app.route('/api/tsp', methods=['GET'])
def get_tsp_route():
    try:
        route, total_distance, route_paths = greedy_tsp(locations)
        route_details = [locations[i] for i in route]
        return jsonify({
            "route": route_details,
            "total_distance_km": total_distance,
            "route_paths": route_paths
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/locations', methods=['GET'])
def get_locations():
    return jsonify(locations)

@app.route('/api/tsp/from_user', methods=['GET'])
def tsp_from_user():
    try:
        user_lat = request.args.get('lat', type=float)
        user_lng = request.args.get('lng', type=float)

        if user_lat is None or user_lng is None:
            return jsonify({"error": "Missing lat or lng"}), 400

        # Tạo một điểm đầu tiên là vị trí người dùng
        user_location = {"name": "Bạn", "lat": user_lat, "lng": user_lng}
        start_point, remaining_locations = merge_start_if_too_close(user_location, locations)
        all_locations = [start_point] + remaining_locations
        route, total_distance, route_paths = greedy_tsp(all_locations)

        route_details = [all_locations[i] for i in route]

        return jsonify({
            "route": route_details,
            "total_distance_km": total_distance,
            "route_paths": route_paths
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)