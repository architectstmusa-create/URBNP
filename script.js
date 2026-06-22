document.addEventListener("DOMContentLoaded", () => {
  const typeButtons = document.querySelectorAll(".type-btn");
  const developmentTypeInput = document.getElementById("developmentType");
  const form = document.getElementById("siteForm");

  const locationInput = document.getElementById("location");
  const mapLinkInput = document.getElementById("mapLink");
  const coordinatesInput = document.getElementById("coordinates");
  const cityInput = document.getElementById("city");

  let map;
  let marker;

  typeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      typeButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      if (developmentTypeInput) {
        developmentTypeInput.value = button.dataset.type;
      }
    });
  });

  if (document.getElementById("map")) {
    map = L.map("map").setView([-17.8292, 31.0522], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(map);

    marker = L.marker([-17.8292, 31.0522]).addTo(map);
  }

  function extractCoordinates(text) {
    if (!text) return null;

    try {
      text = decodeURIComponent(text);
    } catch (error) {}

    let match = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);

    if (match) {
      return {
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2])
      };
    }

    match = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);

    if (match) {
      return {
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2])
      };
    }

    match = text.match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);

    if (match) {
      return {
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2])
      };
    }

    return null;
  }

  function extractPlaceName(text) {
    if (!text) return "Pinned site location";

    try {
      text = decodeURIComponent(text);
    } catch (error) {}

    const match = text.match(/\/place\/([^/@]+)/);

    if (match) {
      return match[1].replaceAll("+", " ");
    }

    return "Pinned site location";
  }

  function setSiteLocation(lat, lng, placeName = null) {
    if (!map || !marker) return;

    marker.setLatLng([lat, lng]);
    map.setView([lat, lng], 17);

    const formattedCoords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    if (coordinatesInput) {
      coordinatesInput.value = formattedCoords;
    }

    if (locationInput) {
      locationInput.value = placeName || locationInput.value.trim() || "Pinned site location";
    }
  }

  function handleMapLinkInput() {
    if (!mapLinkInput) return;

    const pastedText = mapLinkInput.value.trim();
    const coords = extractCoordinates(pastedText);

    if (coords) {
      const placeName = extractPlaceName(pastedText);
      setSiteLocation(coords.lat, coords.lng, placeName);
    }
  }

  if (mapLinkInput) {
    mapLinkInput.addEventListener("input", handleMapLinkInput);

    mapLinkInput.addEventListener("paste", () => {
      setTimeout(handleMapLinkInput, 100);
    });
  }

  if (map) {
    map.on("click", (e) => {
      setSiteLocation(e.latlng.lat, e.latlng.lng, "Pinned site location");
    });
  }

  async function geocodeAddress(address, city) {
    try {
      const query = `${address}, ${city}, Zimbabwe`;

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
      );

      const data = await response.json();

      if (!data.length) return null;

      return {
        lat: data[0].lat,
        lon: data[0].lon,
        displayName: data[0].display_name
      };
    } catch (error) {
      console.error("Geocoding failed:", error);
      return null;
    }
  }

  async function searchLocation() {
    if (!locationInput || !map || !marker) return;

    const location = locationInput.value.trim();
    const city = cityInput ? cityInput.value.trim() : "";

    if (!location || location === "Pinned site location") return;

    const typedCoords = extractCoordinates(location);

    if (typedCoords) {
      setSiteLocation(typedCoords.lat, typedCoords.lng, "Pinned site location");
      return;
    }

    const result = await geocodeAddress(location, city);

    if (result) {
      setSiteLocation(parseFloat(result.lat), parseFloat(result.lon), result.displayName);
    } else {
      alert("Address not found. Paste a Google Maps link or click directly on the map.");
    }
  }

  if (locationInput) {
    locationInput.addEventListener("change", searchLocation);
  }

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const city = cityInput ? cityInput.value.trim() : "";
      const location = locationInput ? locationInput.value.trim() : "";
      const coordinates = coordinatesInput ? coordinatesInput.value.trim() : "";
      const area = document.getElementById("area").value;
      const unit = document.getElementById("unit").value;
      const type = developmentTypeInput ? developmentTypeInput.value : "Residential";

      if (!coordinates || !area) {
        alert("Please paste a Google Maps link, click the map, or enter coordinates, then enter site area.");
        return;
      }

      localStorage.setItem("urbanpulse_city", city);
      localStorage.setItem("urbanpulse_location", location || "Pinned site location");
      localStorage.setItem("urbanpulse_coordinates", coordinates);
      localStorage.setItem("urbanpulse_area", area);
      localStorage.setItem("urbanpulse_unit", unit);
      localStorage.setItem("urbanpulse_type", type);

      window.location.href = "report.html";
    });
  }
});