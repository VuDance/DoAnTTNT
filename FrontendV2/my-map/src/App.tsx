/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

import icon from "./assets/icon.png";
import iconShadow from "./assets/shadow.png";
import redIconImg from "./assets/icon-red.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [40, 45],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

// Icon user
const redIcon = new L.Icon({
  iconUrl: redIconImg,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

function App() {
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // Khởi tạo userLocation
  const [userLocation, setUserLocation] = useState({
    lat: 10.7769,
    lng: 106.6953,
  });

  async function loadRouteFromUser() {
    if (!userLocation.lat || !userLocation.lng || !mapRef.current) return;

    // Cập nhật vị trí marker người dùng
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      // Nếu chưa có, tạo marker và lưu vào ref (chỉ xảy ra nếu init() chưa chạy)
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: redIcon,
      })
        .addTo(mapRef.current!)
        .bindPopup("<b>Vị trí của bạn</b>");
    }

    const url = `http://localhost:5000/api/tsp/from_user?lat=${userLocation.lat}&lng=${userLocation.lng}`;
    try {
      const response = await fetch(url);
      const data = await response.json();

      // Xoá polyline cũ
      mapRef.current.eachLayer((layer) => {
        // Chỉ xoá Polyline, không xoá Marker
        if (layer instanceof L.Polyline) mapRef.current?.removeLayer(layer);
      });

      // Vẽ route mới
      const { route_paths, total_distance_km, route } = data;
      route_paths.forEach((path: Array<[number, number]>) => {
        const fixed = path.map((p: [number, number]) => [
          p[1],
          p[0],
        ]) as L.LatLngExpression[];
        if (mapRef.current) {
          L.polyline(fixed, { color: "red", weight: 5 }).addTo(mapRef.current);
        }
      });

      const routeTextElement = document.getElementById("route-text");
      if (routeTextElement) {
        routeTextElement.textContent = `${route
          .map((x: any) => x.name)
          .join(" -> ")} (Tổng: ${total_distance_km.toFixed(2)} m)`;
      }
    } catch (err) {
      console.error("Failed to load route from user location:", err);
      const routeErrorElement = document.getElementById("route-text");
      if (routeErrorElement) {
        routeErrorElement.textContent =
          "Không thể tìm đường đi (kiểm tra API server).";
      }
    }
  }

  useEffect(() => {
    // ❗ Chỉ tạo map nếu nó chưa được tạo
    if (mapRef.current) return;

    const initialLat = userLocation.lat;
    const initialLng = userLocation.lng;

    mapRef.current = L.map("map").setView([initialLat, initialLng], 15);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapRef.current!);

    async function loadLocations() {
      const response = await fetch("http://localhost:5000/api/locations");
      return await response.json();
    }

    async function loadRoute() {
      const response = await fetch("http://localhost:5000/api/tsp");
      return await response.json();
    }

    async function init() {
      try {
        const locations = await loadLocations();

        // Marker người dùng: Khởi tạo lần đầu
        userMarkerRef.current = L.marker([initialLat, initialLng], {
          icon: redIcon,
        })
          .addTo(mapRef.current!)
          .bindPopup("<b>Vị trí của bạn</b>");

        locations.forEach((loc: any) => {
          L.marker([loc.lat, loc.lng])
            .addTo(mapRef.current!)
            .bindPopup(`<b>${loc.name}</b>`);
        });

        // Tải lộ trình TSP và vẽ lên bản đồ
        const { route, total_distance_km, route_paths } = await loadRoute();

        if (route_paths && route_paths.length > 0) {
          route_paths.forEach((path: any) => {
            const fixed = path.map((p: any) => [
              p[1],
              p[0],
            ]) as L.LatLngExpression[];
            L.polyline(fixed, { color: "blue", weight: 5 }).addTo(
              mapRef.current!
            );
            const routeNames = route.map((x: any) => x.name).join(" -> ");
            const routeTextElement = document.getElementById("route-text");
            if (routeTextElement) {
              routeTextElement.textContent = `${routeNames} (Tổng: ${total_distance_km.toFixed(
                2
              )} m)`;
            }
          });
        }
      } catch (err) {
        console.error(
          "Init error: Failed to load initial data (check API server).",
          err
        );
        const routeTextElement = document.getElementById("route-text");
        if (routeTextElement) {
          routeTextElement.textContent =
            "Lỗi tải dữ liệu ban đầu (kiểm tra API server).";
        }
      }
    }

    init();
  }, [userLocation.lat, userLocation.lng]);

  return (
    <div className="app">
      <div id="user-input">
        <input
          type="number"
          placeholder="Vĩ độ (Lat)"
          value={userLocation.lat}
          onChange={(e) =>
            setUserLocation({
              ...userLocation,
              lat: parseFloat(e.target.value),
            })
          }
          className="p-2 border border-gray-300 rounded-lg shadow-sm w-32 focus:ring-blue-500 focus:border-blue-500"
        />
        <input
          type="number"
          placeholder="Kinh độ (Lng)"
          value={userLocation.lng}
          onChange={(e) =>
            setUserLocation({
              ...userLocation,
              lng: parseFloat(e.target.value),
            })
          }
          className="p-2 border border-gray-300 rounded-lg shadow-sm w-32 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={loadRouteFromUser}
          className="ml-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition duration-150 ease-in-out"
        >
          Tính đường đi từ vị trí bạn
        </button>
      </div>

      <h1 className="text-2xl font-bold mt-4 mb-3">
        Lộ trình tham quan danh thắng TP.HCM
      </h1>
      <div id="map"></div>
      <div
        id="route"
        className="mt-3 p-3 bg-gray-100 rounded-lg shadow-inner text-lg"
      >
        Lộ trình:{" "}
        <span id="route-text" className="font-medium text-indigo-700">
          Đang tải...
        </span>
      </div>
    </div>
  );
}

export default App;
