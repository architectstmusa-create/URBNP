document.addEventListener("DOMContentLoaded", async () => {
  console.log("UrbanPulse report loaded");

  const city = localStorage.getItem("urbanpulse_city") || "Harare";
  const location = localStorage.getItem("urbanpulse_location") || "Borrowdale";
  const coordinates = localStorage.getItem("urbanpulse_coordinates") || "";
  const areaValue = Number(localStorage.getItem("urbanpulse_area")) || 2400;
  const unit = localStorage.getItem("urbanpulse_unit") || "sqm";
  const type = localStorage.getItem("urbanpulse_type") || "Residential";

  const siteAreaSqm = unit === "sqm" ? areaValue : areaValue * 10000;
  const hectares = siteAreaSqm / 10000;

  let lat = -17.8292;
  let lon = 31.0522;

  if (coordinates && coordinates.includes(",")) {
    const parts = coordinates.split(",");
    const parsedLat = parseFloat(parts[0].trim());
    const parsedLon = parseFloat(parts[1].trim());

    if (!isNaN(parsedLat) && !isNaN(parsedLon)) {
      lat = parsedLat;
      lon = parsedLon;
    }
  }

  const accessibilityBox = document.getElementById("accessibilityData");

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function money(value) {
    return "$" + Math.round(value).toLocaleString();
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getCoords(el) {
    const elLat = el.lat ?? el.center?.lat;
    const elLon = el.lon ?? el.center?.lon;

    if (elLat === undefined || elLon === undefined) return null;

    return {
      lat: elLat,
      lon: elLon
    };
  }

  function fallbackName(el) {
    if (el.tags?.shop) return `Shop (${el.tags.shop})`;
    if (el.tags?.amenity) return `Amenity (${el.tags.amenity})`;
    if (el.tags?.healthcare) return `Healthcare (${el.tags.healthcare})`;
    if (el.tags?.waterway) return `Waterway (${el.tags.waterway})`;
    if (el.tags?.natural) return `Natural feature (${el.tags.natural})`;
    if (el.tags?.highway) return el.tags?.name || `Road (${el.tags.highway})`;
    if (el.tags?.building) return `Building (${el.tags.building})`;
    return "Unnamed mapped feature";
  }

  function nearestFeature(elements) {
    if (!elements || !elements.length) return null;

    let nearest = null;
    let nearestDistance = Infinity;

    elements.forEach((el) => {
      const coords = getCoords(el);
      if (!coords) return;

      const d = distanceKm(lat, lon, coords.lat, coords.lon);

      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = {
          name: el.tags?.name || fallbackName(el),
          distance: d,
          lat: coords.lat,
          lon: coords.lon,
          tags: el.tags || {}
        };
      }
    });

    return nearest;
  }

  function serviceText(service) {
    if (!service) return "Requires verification";
    return `${service.name} — ${service.distance.toFixed(2)} km`;
  }

  function scoreDistance(distance, excellent, good, moderate) {
    if (distance === null || distance === undefined) return 8;
    if (distance <= excellent) return 25;
    if (distance <= good) return 20;
    if (distance <= moderate) return 14;
    return 8;
  }

  async function fetchOverpass(query) {
    const servers = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://lz4.overpass-api.de/api/interpreter"
    ];

    for (const server of servers) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 18000);

        const response = await fetch(server, {
          method: "POST",
          body: query,
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) continue;

        const data = await response.json();
        return data.elements || [];
      } catch (error) {
        console.warn("Overpass error:", server, error);
      }
    }

    return [];
  }

  async function loadNearbyData() {
    const radius = 5000;

    const query = `
      [out:json][timeout:25];
      (
        node(around:${radius},${lat},${lon})["amenity"];
        way(around:${radius},${lat},${lon})["amenity"];
        relation(around:${radius},${lat},${lon})["amenity"];

        node(around:${radius},${lat},${lon})["shop"];
        way(around:${radius},${lat},${lon})["shop"];
        relation(around:${radius},${lat},${lon})["shop"];

        node(around:${radius},${lat},${lon})["healthcare"];
        way(around:${radius},${lat},${lon})["healthcare"];
        relation(around:${radius},${lat},${lon})["healthcare"];

        way(around:${radius},${lat},${lon})["highway"];
        way(around:1000,${lat},${lon})["building"];
        node(around:1000,${lat},${lon})["building"];

        node(around:${radius},${lat},${lon})["waterway"];
        way(around:${radius},${lat},${lon})["waterway"];
        relation(around:${radius},${lat},${lon})["waterway"];

        node(around:${radius},${lat},${lon})["natural"="water"];
        way(around:${radius},${lat},${lon})["natural"="water"];
        relation(around:${radius},${lat},${lon})["natural"="water"];
      );
      out center tags;
    `;

    return await fetchOverpass(query);
  }

  if (accessibilityBox) {
    accessibilityBox.innerHTML = `
      <div>
        <span>Searching OpenStreetMap...</span>
        <strong>Please wait</strong>
      </div>
    `;
  }

  const osm = await loadNearbyData();

  const schools = osm.filter(el =>
    ["school", "college", "university", "kindergarten"].includes(el.tags?.amenity)
  );

  const health = osm.filter(el =>
    ["hospital", "clinic", "doctors", "pharmacy"].includes(el.tags?.amenity) ||
    el.tags?.healthcare ||
    el.tags?.shop === "chemist"
  );

  const shops = osm.filter(el =>
    el.tags?.shop ||
    el.tags?.amenity === "marketplace"
  );

  const roads = osm.filter(el =>
    ["primary", "secondary", "tertiary", "residential", "unclassified", "service"].includes(el.tags?.highway)
  );

  const majorRoads = osm.filter(el =>
    ["primary", "secondary", "tertiary"].includes(el.tags?.highway)
  );

  const buildings = osm.filter(el => el.tags?.building);

  const waterways = osm.filter(el =>
    el.tags?.waterway ||
    el.tags?.natural === "water"
  );

  const nearestSchool = nearestFeature(schools);
  const nearestHealth = nearestFeature(health);
  const nearestShop = nearestFeature(shops);
  const nearestRoad = nearestFeature(roads);
  const nearestMajorRoad = nearestFeature(majorRoads) || nearestRoad;
  const nearestWaterway = nearestFeature(waterways);

  const schoolDistance = nearestSchool?.distance ?? null;
  const healthDistance = nearestHealth?.distance ?? null;
  const shopDistance = nearestShop?.distance ?? null;
  const roadDistance = nearestRoad?.distance ?? null;
  const majorRoadDistance = nearestMajorRoad?.distance ?? null;

  let accessibilityScore =
    scoreDistance(schoolDistance, 0.5, 1.5, 3) +
    scoreDistance(healthDistance, 1, 2.5, 4) +
    scoreDistance(shopDistance, 0.75, 2, 3.5) +
    scoreDistance(majorRoadDistance, 0.2, 0.8, 1.5);

  accessibilityScore = Math.min(accessibilityScore, 90);

  let accessibilityGrade = "Limited";

  if (accessibilityScore >= 85) {
    accessibilityGrade = "Excellent";
  } else if (accessibilityScore >= 70) {
    accessibilityGrade = "Good";
  } else if (accessibilityScore >= 55) {
    accessibilityGrade = "Moderate";
  }

  const builtUpScore = buildings.length;

  let urbanContext = "Rural";

  if (builtUpScore >= 200) {
    urbanContext = "Highly Urbanised";
  } else if (builtUpScore >= 80) {
    urbanContext = "Urban";
  } else if (builtUpScore >= 30) {
    urbanContext = "Suburban";
  } else if (builtUpScore >= 10) {
    urbanContext = "Peri-Urban";
  }

  const amenityCount = schools.length + health.length + shops.length;

  let roadExposure = "Low";

  if (majorRoadDistance !== null && majorRoadDistance <= 0.2) {
    roadExposure = "High";
  } else if (majorRoadDistance !== null && majorRoadDistance <= 1) {
    roadExposure = "Moderate";
  }

  let developmentIntensity = Math.round(
    accessibilityScore * 0.5 +
    Math.min(builtUpScore, 100) * 0.3 +
    Math.min(amenityCount, 50) * 0.4
  );

  developmentIntensity = Math.min(developmentIntensity, 100);

  let roadRating = "Requires Review";

  if (roadDistance !== null && roadDistance <= 0.2) {
    roadRating = "Excellent";
  } else if (roadDistance !== null && roadDistance <= 0.8) {
    roadRating = "Good";
  } else if (roadDistance !== null && roadDistance <= 1.5) {
    roadRating = "Moderate";
  }

  let waterRating = "Requires Verification";
  let powerRating = "Requires Verification";
  let sewerRating = "Requires Verification";

  if (builtUpScore >= 80 && accessibilityScore >= 70) {
    waterRating = "Likely Available";
    powerRating = "Likely Available";
    sewerRating = "Likely Available / Verify Capacity";
  } else if (builtUpScore >= 30 || accessibilityScore >= 70) {
    waterRating = "Likely Available";
    powerRating = "Likely Available";
    sewerRating = "Requires Verification";
  } else if (builtUpScore >= 10 || accessibilityScore >= 55) {
    waterRating = "Moderate / Verify Supply";
    powerRating = "Moderate / Verify Supply";
    sewerRating = "Requires Review";
  } else {
    waterRating = "Uncertain";
    powerRating = "Uncertain";
    sewerRating = "High Verification Needed";
  }

  let coverageRatio = 0.4;

  if (type === "Mixed-use") coverageRatio = accessibilityScore >= 75 ? 0.6 : 0.5;
  if (type === "Commercial") coverageRatio = accessibilityScore >= 75 ? 0.7 : 0.6;
  if (type === "Residential" && hectares >= 1) coverageRatio = 0.5;

  const buildableArea = Math.round(siteAreaSqm * coverageRatio);

  let bestUse = "Medium Density Residential";

  if (type === "Commercial") bestUse = "Commercial Development";
  if (type === "Mixed-use") bestUse = "Mixed-Use Residential + Retail";
  if (type === "Residential" && hectares < 0.3) bestUse = "Low Density Residential";
  if (type === "Residential" && hectares >= 1) bestUse = "Cluster Housing / Townhouses";

  if (type === "Residential" && accessibilityScore >= 85 && hectares >= 0.4) {
    bestUse = "Townhouses / Medium Density Residential";
  }

  let zoningDesignation = "Residential Development Area";
  let maximumCoverage = "40%";
  let maximumHeight = "2 Storeys";
  let frontSetback = "7.5 m";

  if (type === "Residential") {
    if (hectares < 0.3) {
      zoningDesignation = "Low Density Residential";
      maximumCoverage = "35–40%";
      maximumHeight = "1–2 Storeys";
      frontSetback = "7.5 m";
    } else if (hectares < 1) {
      zoningDesignation = "Medium Density Residential";
      maximumCoverage = "40–50%";
      maximumHeight = accessibilityScore >= 80 ? "2–4 Storeys" : "2 Storeys";
      frontSetback = "5–7.5 m";
    } else {
      zoningDesignation = "Cluster Housing / Medium Density";
      maximumCoverage = "45–55%";
      maximumHeight = "2–4 Storeys";
      frontSetback = "5 m";
    }
  }

  if (type === "Mixed-use") {
    zoningDesignation = "Mixed-Use Development";
    maximumCoverage = accessibilityScore >= 75 ? "60–75%" : "50–60%";
    maximumHeight = accessibilityScore >= 75 ? "3–6 Storeys" : "2–4 Storeys";
    frontSetback = "3–5 m";
  }

  if (type === "Commercial") {
    zoningDesignation = "Commercial Development";
    maximumCoverage = accessibilityScore >= 75 ? "70–85%" : "60–70%";
    maximumHeight = accessibilityScore >= 75 ? "4–8 Storeys" : "2–5 Storeys";
    frontSetback = "0–5 m";
  }

  let lowYield = 0;
  let mediumYield = 0;
  let highYield = 0;

  if (bestUse.includes("Low Density")) {
    lowYield = Math.round(buildableArea / 400);
    mediumYield = Math.round(buildableArea / 180);
    highYield = Math.round(buildableArea / 100);
  } else if (
    bestUse.includes("Medium Density") ||
    bestUse.includes("Cluster") ||
    bestUse.includes("Townhouses")
  ) {
    lowYield = Math.round(buildableArea / 300);
    mediumYield = Math.round(buildableArea / 120);
    highYield = Math.round(buildableArea / 70);
  } else {
    lowYield = Math.round(buildableArea / 250);
    mediumYield = Math.round(buildableArea / 90);
    highYield = Math.round(buildableArea / 50);
  }

  lowYield = Math.max(lowYield, 1);
  mediumYield = Math.max(mediumYield, 1);
  highYield = Math.max(highYield, 1);

  let developmentScore = 12;

  if (hectares >= 0.2) developmentScore = 15;
  if (hectares >= 0.5) developmentScore = 18;
  if (hectares >= 1) developmentScore = 20;

  let infrastructureScore = 10;

  if (roadDistance !== null && roadDistance <= 1.5) infrastructureScore = 14;
  if (roadDistance !== null && roadDistance <= 0.8) infrastructureScore = 17;
  if (roadDistance !== null && roadDistance <= 0.2) infrastructureScore = 20;

  let marketScore = 12;

  if (city === "Harare") marketScore = 16;
  if (city === "Bulawayo") marketScore = 14;
  if (city === "Victoria Falls") marketScore = 17;

  const premiumAreas = [
    "borrowdale",
    "sam levy",
    "glen lorne",
    "chisipite",
    "avondale",
    "mount pleasant",
    "borrowdale brook",
    "helensvale"
  ];

  const developingAreas = [
    "chitungwiza",
    "ruwa",
    "norton",
    "epworth",
    "dzivarasekwa",
    "glen view",
    "budiriro"
  ];

  const lowerLocation = location.toLowerCase();

  if (premiumAreas.some(area => lowerLocation.includes(area))) {
    marketScore += 4;
  }

  if (developingAreas.some(area => lowerLocation.includes(area))) {
    marketScore -= 2;
  }

  marketScore = Math.max(8, Math.min(marketScore, 20));

  let buyScore = Math.round(
    accessibilityScore * 0.45 +
    developmentScore +
    infrastructureScore +
    marketScore
  );

  buyScore = Math.max(35, Math.min(buyScore, 95));

  let buyLabel = "Moderate Opportunity";
  let riskRating = "Moderate";
  let developmentPotential = "Moderate";

  if (buyScore >= 85) {
    buyLabel = "Strong Opportunity";
    riskRating = "Moderate-Low";
    developmentPotential = "High";
  } else if (buyScore >= 70) {
    buyLabel = "Good Opportunity";
    riskRating = "Moderate";
    developmentPotential = "Good";
  } else if (buyScore >= 55) {
    buyLabel = "Selective Opportunity";
    riskRating = "Moderate-High";
    developmentPotential = "Limited";
  } else {
    buyLabel = "Needs Caution";
    riskRating = "High";
    developmentPotential = "Low";
  }

  let landRate = 25;

  if (city === "Harare") landRate = 45;
  if (city === "Bulawayo") landRate = 30;
  if (city === "Victoria Falls") landRate = 60;

  if (premiumAreas.some(area => lowerLocation.includes(area))) landRate += 35;
  if (developingAreas.some(area => lowerLocation.includes(area))) landRate -= 10;

  if (buyScore >= 85) landRate += 15;
  else if (buyScore >= 70) landRate += 8;

  landRate = Math.max(15, landRate);

  let constructionRate = 550;
  let gdvRate = 950;

  if (type === "Mixed-use") {
    constructionRate = 700;
    gdvRate = 1200;
  }

  if (type === "Commercial") {
    constructionRate = 850;
    gdvRate = 1400;
  }

  if (accessibilityScore >= 85) gdvRate += 100;
  if (premiumAreas.some(area => lowerLocation.includes(area))) gdvRate += 150;
  if (developingAreas.some(area => lowerLocation.includes(area))) gdvRate -= 100;

  gdvRate = Math.max(700, gdvRate);

  const landValue = siteAreaSqm * landRate;
  const developmentCost = buildableArea * constructionRate;
  const gdv = buildableArea * gdvRate;
  const profit = gdv - developmentCost - landValue;
  const roi = Math.round((profit / (landValue + developmentCost)) * 100);

  const riskFlags = [];

  if (!nearestRoad) riskFlags.push("Road access requires verification.");
  if (!nearestSchool) riskFlags.push("Education access requires verification.");
  if (!nearestHealth) riskFlags.push("Healthcare access requires verification.");
  if (!nearestShop) riskFlags.push("Retail access requires verification.");
  if (hectares < 0.2) riskFlags.push("Small site size may limit development flexibility.");
  if (builtUpScore < 10) riskFlags.push("Limited surrounding built-up activity detected.");
  if (profit < 0) riskFlags.push("Indicative financial margin appears weak.");

  if (!riskFlags.length) {
    riskFlags.push("No major automated risk flags detected at preliminary screening level.");
  }

  let verdictReason = "balanced access and moderate development fundamentals";

  if (accessibilityScore >= 85) {
    verdictReason = "excellent accessibility and strong nearby service coverage";
  } else if (accessibilityScore >= 70) {
    verdictReason = "good access to nearby services and road infrastructure";
  } else if (accessibilityScore < 55) {
    verdictReason = "limited mapped services and higher infrastructure uncertainty";
  }

  let recommendationTitle = "Proceed with further due diligence.";

  if (buyScore < 70) {
    recommendationTitle = "Proceed cautiously and verify key risks.";
  }

  if (buyScore >= 85) {
    recommendationTitle = "Strong candidate for detailed feasibility review.";
  }

  const recommendationText =
    `${location}, ${city} shows ${developmentPotential.toLowerCase()} development potential for ${type.toLowerCase()} use. The automated model identifies ${verdictReason}. UrbanPulse recommends confirming title, official zoning, water, sewer, power capacity and market values before purchase or design commitment.`;

  let averageSlope = Math.abs(((lat * lon) % 10 + 3)).toFixed(1);

  let buildability = "Excellent";
  let earthworksRisk = "Low";

  if (averageSlope > 5) {
    buildability = "Good";
  }

  if (averageSlope > 10) {
    buildability = "Moderate";
    earthworksRisk = "Moderate";
  }

  if (averageSlope > 15) {
    buildability = "Challenging";
    earthworksRisk = "High";
  }

  let floodRisk = "Low";
  let floodConstraint = "Minimal";

  if (nearestWaterway && nearestWaterway.distance < 0.1) {
    floodRisk = "High";
    floodConstraint = "Significant";
  } else if (nearestWaterway && nearestWaterway.distance < 0.3) {
    floodRisk = "Moderate";
    floodConstraint = "Manageable";
  } else if (nearestWaterway && nearestWaterway.distance < 1) {
    floodRisk = "Low-Moderate";
    floodConstraint = "Verify drainage";
  }

  const population1km = Math.max(250, builtUpScore * 8);
  const population3km = population1km * 4;
  const population5km = population1km * 8;

  setText("reportLocation", location);
  setText("reportCity", city);
  setText("reportArea", unit === "sqm" ? areaValue + " m²" : areaValue + " hectares");
  setText("reportType", type);

  setText("bestUse", bestUse);
  setText("bestUseSummary", bestUse);
  setText("lowYield", lowYield);
  setText("mediumYield", mediumYield);
  setText("highYield", highYield);
  setText("buildableArea", buildableArea.toLocaleString() + " m²");

  setText("zoningDesignation", zoningDesignation);
  setText("maximumCoverage", maximumCoverage);
  setText("maximumHeight", maximumHeight);
  setText("frontSetback", frontSetback);

  setText("buyScore", buyScore + "/100");
  setText("buyScoreLabel", buyLabel);
  setText("riskRating", riskRating);
  setText("riskSummary", riskRating);
  setText("developmentPotential", developmentPotential);
  setText("roiValue", roi + "%");

  setText("landValue", money(landValue));
  setText("developmentCost", money(developmentCost));
  setText("gdv", money(gdv));

  setText("roadAccess", roadRating);
  setText("waterAccess", waterRating);
  setText("powerAccess", powerRating);
  setText("sewerAccess", sewerRating);

  setText("urbanContext", urbanContext);
  setText("buildingCount", builtUpScore);
  setText("amenityCount", amenityCount);
  setText("roadExposure", roadExposure);
  setText("developmentIntensity", developmentIntensity + "/100");

  setText("averageSlope", averageSlope + "%");
  setText("buildabilityRating", buildability);
  setText("earthworksRisk", earthworksRisk);

  setText("floodRisk", floodRisk);
  setText("floodConstraint", floodConstraint);

  setText("population1km", population1km.toLocaleString());
  setText("population3km", population3km.toLocaleString());
  setText("population5km", population5km.toLocaleString());

  if (accessibilityBox) {
    accessibilityBox.innerHTML = `
      <div><span>Accessibility Grade</span><strong>${accessibilityGrade}</strong></div>
      <div><span>Nearest School</span><strong>${serviceText(nearestSchool)}</strong></div>
      <div><span>Nearest Health Facility</span><strong>${serviceText(nearestHealth)}</strong></div>
      <div><span>Nearest Shop / Supermarket</span><strong>${serviceText(nearestShop)}</strong></div>
      <div><span>Nearest Major Road</span><strong>${serviceText(nearestMajorRoad)}</strong></div>
      <div><span>Nearest Waterway</span><strong>${serviceText(nearestWaterway)}</strong></div>
      <div><span>Mapped Buildings Nearby</span><strong>${builtUpScore}</strong></div>
      <div><span>Accessibility Score</span><strong>${accessibilityScore}/100</strong></div>
      <div><span>Data Source Note</span><strong>OpenStreetMap coverage may be incomplete</strong></div>
    `;
  }

  const riskFlagsBox = document.getElementById("riskFlags");

  if (riskFlagsBox) {
    riskFlagsBox.innerHTML = riskFlags.map(flag => `<li>${flag}</li>`).join("");
  }

  setText("recommendationTitle", recommendationTitle);
  setText("recommendationText", recommendationText);
  setText("verdictTitle", `${buyLabel} for ${bestUse}`);

  setText(
    "verdictText",
    `${location}, ${city} scores ${buyScore}/100. The site has ${accessibilityGrade.toLowerCase()} accessibility, ${roadRating.toLowerCase()} road access, and ${builtUpScore} mapped buildings within approximately 1 km. Highest and best use is estimated as ${bestUse}. Financial values are indicative model estimates, not verified valuations.`
  );

  if (document.getElementById("reportMap") && window.L) {
    const reportMap = L.map("reportMap").setView([lat, lon], 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(reportMap);

    L.marker([lat, lon])
      .addTo(reportMap)
      .bindPopup(`<strong>${location}</strong><br>${city}<br>${coordinates}`)
      .openPopup();

    function addMarker(service, label) {
      if (!service) return;

      L.circleMarker([service.lat, service.lon], {
        radius: 7
      })
        .addTo(reportMap)
        .bindPopup(
          `<strong>${label}</strong><br>${service.name}<br>${service.distance.toFixed(2)} km away`
        );
    }

    addMarker(nearestSchool, "Nearest School");
    addMarker(nearestHealth, "Nearest Health Facility");
    addMarker(nearestShop, "Nearest Shop / Supermarket");
    addMarker(nearestMajorRoad, "Nearest Major Road");
    addMarker(nearestWaterway, "Nearest Waterway");

    setTimeout(() => {
      reportMap.invalidateSize();
    }, 500);
  }

  const pdfButton = document.getElementById("downloadPdf");

  if (pdfButton) {
    pdfButton.addEventListener("click", () => {
      const element = document.querySelector(".report-page");

      if (!element || !window.html2pdf) {
        alert("PDF export is not ready. Please refresh and try again.");
        return;
      }

      const safeLocation = location.replace(/[^a-z0-9]/gi, "_").toLowerCase();

      const options = {
        margin: 0.35,
        filename: `UrbanPulse_Report_${safeLocation}.pdf`,
        image: {
          type: "jpeg",
          quality: 1
        },
        html2canvas: {
          scale: 2,
          useCORS: true,
          scrollY: 0
        },
        jsPDF: {
          unit: "in",
          format: "a4",
          orientation: "portrait"
        }
      };

      html2pdf()
        .set(options)
        .from(element)
        .save();
    });
  }
});
