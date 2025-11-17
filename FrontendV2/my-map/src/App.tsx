/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

import icon from "./assets/icon.png";
import iconShadow from "./assets/shadow.png";
import redIconImg from "./assets/icon-red.png";
import {
  Box,
  Button,
  Fade,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Modal,
  Paper,
  TextField,
} from "@mui/material";

const style = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 400,
  bgcolor: "background.paper",
  boxShadow: 24,
  p: 2,
  color: "black",
  borderRadius: 2,
};

const normalIcon = new L.Icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [40, 45],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

const redIcon = new L.Icon({
  iconUrl: redIconImg,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

type LatLng = { lat: number; lng: number };
type Suggestion = {
  place_id: number | string;
  display_name: string;
  lat: string;
  lon: string;
};

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const API_BASE = "http://localhost:5000/api";

function App() {
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const polylinesRef = useRef<L.LayerGroup | null>(null);

  const [userLocation, setUserLocation] = useState<LatLng>({
    lat: 10.7769,
    lng: 106.6953,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [routeText, setRouteText] = useState<string>("Không có lộ trình.");
  const [open, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  // Debounce search term
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    if (!debouncedSearchTerm) {
      setSuggestions([]);
      return;
    }
    fetchSuggestions(debouncedSearchTerm);
  }, [debouncedSearchTerm]);

  const fetchSuggestions = useCallback(async (text: string) => {
    const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(
      text
    )}&format=json&limit=5`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Network response was not ok");
      const data = (await res.json()) as Suggestion[];
      setSuggestions(data || []);
    } catch (err) {
      console.error("Error fetching Nominatim suggestions:", err);
      setSuggestions([]);
    }
  }, []);

  const clearPolylines = useCallback(() => {
    if (polylinesRef.current) polylinesRef.current.clearLayers();
  }, []);

  const drawRoutePaths = useCallback(
    (route_paths: Array<Array<[number, number]>>, color = "blue") => {
      if (!mapRef.current) return;
      if (!polylinesRef.current) {
        polylinesRef.current = L.layerGroup().addTo(mapRef.current);
      }
      route_paths.forEach((path) => {
        const latlngs = path.map((p) => [p[1], p[0]]) as L.LatLngExpression[];
        L.polyline(latlngs, { color, weight: 5 }).addTo(polylinesRef.current!);
      });
    },
    []
  );

  const handleSelect = async (suggestion: Suggestion) => {
    setSearchTerm(suggestion.display_name);
    setSuggestions([]);
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setUserLocation({ lat, lng });
      // loadRouteFromUser will run using updated userLocation effect or can be called directly:
      await loadRouteFromUser({ lat, lng });
    }
  };

  const loadRouteFromUser = useCallback(
    async (loc?: LatLng) => {
      const cur = loc ?? userLocation;
      if (!mapRef.current) return;
      if (!Number.isFinite(cur.lat) || !Number.isFinite(cur.lng)) return;

      // update or create user marker
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([cur.lat, cur.lng]);
      } else {
        userMarkerRef.current = L.marker([cur.lat, cur.lng], { icon: redIcon })
          .addTo(mapRef.current)
          .bindPopup("<b>Vị trí của bạn</b>");
      }

      const url = `${API_BASE}/tsp/from_user?lat=${cur.lat}&lng=${cur.lng}`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();
        clearPolylines();
        const { route_paths = [], total_distance_km = 0, route = [] } = data;
        if (route_paths.length) {
          drawRoutePaths(route_paths, "red");
        }
        setRouteText(
          `${(route || [])
            .map((x: any) => x.name)
            .join(" -> ")} (Tổng: ${Number(total_distance_km).toFixed(2)} m)`
        );
      } catch (err) {
        console.error("Failed to load route from user location:", err);
        setRouteText("Không thể tìm đường đi (kiểm tra API server).");
      }
    },
    [clearPolylines, drawRoutePaths, userLocation]
  );

  // Initialize map and load initial data
  useEffect(() => {
    if (mapRef.current) return;

    const { lat, lng } = userLocation;
    mapRef.current = L.map("map").setView([lat, lng], 15);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapRef.current);

    polylinesRef.current = L.layerGroup().addTo(mapRef.current);

    const loadLocations = async () => {
      const resp = await fetch(`${API_BASE}/locations`);
      if (!resp.ok) throw new Error("Failed to load locations");
      return resp.json();
    };

    // const loadRoute = async () => {
    //   const resp = await fetch(`${API_BASE}/tsp`);
    //   if (!resp.ok) throw new Error("Failed to load route");
    //   return resp.json();
    // };

    (async function init() {
      try {
        const locations = await loadLocations();
        userMarkerRef.current = L.marker([lat, lng], { icon: redIcon })
          .addTo(mapRef.current!)
          .bindPopup("<b>Vị trí của bạn</b>");

        (locations || []).forEach((loc: any) => {
          L.marker([loc.lat, loc.lng], { icon: normalIcon })
            .addTo(mapRef.current!)
            .bindPopup(`<b>${loc.name}</b>`);
        });

        // const {
        //   route_paths = [],
        //   total_distance_km = 0,
        //   route = [],
        // } = await loadRoute();
        // if (route_paths && route_paths.length) {
        //   drawRoutePaths(route_paths, "blue");
        // }
        // setRouteText(
        //   `${(route || [])
        //     .map((x: any) => x.name)
        //     .join(" -> ")} (Tổng: ${Number(total_distance_km).toFixed(2)} m)`
        // );
      } catch (err) {
        console.error("Init error: Failed to load initial data.", err);
        setRouteText("Lỗi tải dữ liệu ban đầu (kiểm tra API server).");
      }
    })();

    return () => {
      // cleanup map on unmount
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // init once

  // Keep marker in sync when userLocation changes (if changed via inputs)
  useEffect(() => {
    if (!mapRef.current) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
      mapRef.current.setView([userLocation.lat, userLocation.lng]);
    }
  }, [userLocation.lat, userLocation.lng]);

  return (
    <div className="app">
      <Box
        sx={{
          position: "absolute",
          width: 350,
          top: 10,
          left: 50,
          zIndex: 1000,
        }}
      >
        <TextField
          sx={{
            backgroundColor: "white",
          }}
          fullWidth
          label="Tìm kiếm Địa điểm"
          variant="filled"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onBlur={() => setTimeout(() => setSuggestions([]), 200)}
          onFocus={() => {
            if (searchTerm) fetchSuggestions(searchTerm);
          }}
        />

        {/* Danh sách gợi ý */}
        {suggestions.length > 0 && (
          <Paper
            elevation={3}
            sx={{
              position: "absolute",
              zIndex: 10,
              width: "100%",
              maxHeight: 250,
              overflowY: "auto",
            }}
          >
            <List dense>
              {suggestions.map((item) => (
                <ListItem key={item.place_id} disablePadding>
                  <ListItemButton onMouseDown={() => handleSelect(item)}>
                    <ListItemText
                      primary={item.display_name}
                      secondary={`Lat: ${item.lat}, Lon: ${item.lon}`}
                      sx={{ padding: 1 }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
      </Box>
      <div id="map" style={{ height: "100vh", width: "100vw" }}></div>
      <Button
        onClick={handleOpen}
        variant="contained"
        sx={{ position: "fixed", right: 10, top: 10, zIndex: 10000000 }}
      >
        Xem Lộ Trình
      </Button>
      <Modal
        aria-labelledby="transition-modal-title"
        aria-describedby="transition-modal-description"
        open={open}
        onClose={handleClose}
        closeAfterTransition
        slotProps={{
          backdrop: {
            timeout: 500,
          },
        }}
      >
        <Fade in={open}>
          <Box sx={style}>
            <div id="route">
              Lộ trình:{" "}
              <span
                id="route-text"
                style={{ color: "black" }}
                className="font-medium text-indigo-700"
              >
                {routeText}
              </span>
            </div>
          </Box>
        </Fade>
      </Modal>
    </div>
  );
}

export default App;
