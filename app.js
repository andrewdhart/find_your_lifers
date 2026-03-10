const STORAGE_KEYS = {
  apiKey: "ebirdKey",
  lifeListCsv: "ebirdLifeListCsv",
  lifeListImportedAt: "ebirdLifeListImportedAt"
};

let apiKey = null;
let map = null;

let searchMode = "point";

let pointMarker = null;
let startMarker = null;
let endMarker = null;
let routeLine = null;

let startPoint = null;
let routeStart = null;
let routeEnd = null;

let routeClickStage = "start";

let lifeSpecies = new Set();
let currentBirds = [];

const speciesLocationCache = new Map();

init();

function init() {
  apiKey = localStorage.getItem(STORAGE_KEYS.apiKey);
  if (apiKey) startApp();
}

function saveKey() {
  const key = document.getElementById("apikeyInput").value.trim();
  if (!key) {
    alert("Enter your eBird API key.");
    return;
  }

  localStorage.setItem(STORAGE_KEYS.apiKey, key);
  apiKey = key;
  startApp();
}

function changeKey() {
  localStorage.removeItem(STORAGE_KEYS.apiKey);
  location.reload();
}

function startApp() {
  document.getElementById("apikeyScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  if (!map) initMap();

  loadCachedLifeList();
  handleModeChange();
}

function initMap() {
  map = L.map("map").setView([40.23, -111.66], 9);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19 }
  ).addTo(map);

  map.on("click", (e) => {
    if (searchMode === "point") setSinglePoint(e.latlng);
    else setRoutePoint(e.latlng);
  });
}

function handleModeChange() {
  searchMode = document.getElementById("searchMode").value;
  clearMapPoints();
}

function clearMapPoints() {
  startPoint = null;
  routeStart = null;
  routeEnd = null;
  routeClickStage = "start";

  currentBirds = [];
  speciesLocationCache.clear();

  if (pointMarker) {
    map.removeLayer(pointMarker);
    pointMarker = null;
  }

  if (startMarker) {
    map.removeLayer(startMarker);
    startMarker = null;
  }

  if (endMarker) {
    map.removeLayer(endMarker);
    endMarker = null;
  }

  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
}

function setSinglePoint(latlng) {
  startPoint = latlng;

  if (pointMarker) map.removeLayer(pointMarker);
  pointMarker = L.marker(latlng).addTo(map);
}

function setRoutePoint(latlng) {
  // First click: set start
  if (!routeStart || (routeStart && routeEnd)) {
    // If a full old route already exists, clear it first
    if (startMarker) {
      map.removeLayer(startMarker);
      startMarker = null;
    }

    if (endMarker) {
      map.removeLayer(endMarker);
      endMarker = null;
    }

    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }

    routeStart = latlng;
    routeEnd = null;
    routeClickStage = "end";

    startMarker = L.marker(latlng).addTo(map);
    return;
  }

  // Second click: set end
  routeEnd = latlng;
  routeClickStage = "start";

  if (endMarker) {
    map.removeLayer(endMarker);
    endMarker = null;
  }

  endMarker = L.marker(latlng).addTo(map);

  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }

  routeLine = L.polyline(
    [
      [routeStart.lat, routeStart.lng],
      [routeEnd.lat, routeEnd.lng]
    ],
    { weight: 4 }
  ).addTo(map);

  map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
}

function handleLifeListImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function () {
    const text = reader.result;
    lifeSpecies = parseLifeListCsv(text);

    localStorage.setItem(STORAGE_KEYS.lifeListCsv, text);
    localStorage.setItem(
      STORAGE_KEYS.lifeListImportedAt,
      new Date().toISOString()
    );

    updateLifeListStatus();
  };

  reader.readAsText(file);
}

function loadCachedLifeList() {
  const csv = localStorage.getItem(STORAGE_KEYS.lifeListCsv);
  if (!csv) return;

  lifeSpecies = parseLifeListCsv(csv);
  updateLifeListStatus();
}

function clearLifeListCache() {
  localStorage.removeItem(STORAGE_KEYS.lifeListCsv);
  lifeSpecies = new Set();
  updateLifeListStatus();
}

function updateLifeListStatus() {
  const el = document.getElementById("lifeListStatus");

  if (!lifeSpecies.size) {
    el.textContent = "No cached life list.";
    return;
  }

  el.textContent = `Cached life list: ${lifeSpecies.size} species`;
}

function parseLifeListCsv(text) {
  const rows = text.split("\n").map((r) => r.split(","));
  const headers = rows[0].map((h) => h.toLowerCase());

  const sciIndex = headers.indexOf("scientific name");
  const catIndex = headers.indexOf("category");

  const set = new Set();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][catIndex] === "species") {
      set.add(rows[i][sciIndex]);
    }
  }

  return set;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function interpolate(a, b, t) {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t
  };
}

function getRouteSamplePoints(a, b, spacingKm) {
  const dist = haversine(a.lat, a.lng, b.lat, b.lng);
  const segments = Math.ceil(dist / spacingKm);

  const pts = [];

  for (let i = 0; i <= segments; i++) {
    pts.push(interpolate(a, b, i / segments));
  }

  return pts;
}

async function fetchRecentAtPoint(latlng, radius, daysBack, label) {
  const url = `https://api.ebird.org/v2/data/obs/geo/recent?lat=${latlng.lat}&lng=${latlng.lng}&dist=${radius}&back=${daysBack}&maxResults=1000`;

  const res = await fetch(url, {
    headers: { "X-eBirdApiToken": apiKey }
  });

  const data = await res.json();

  return data.map((o) => ({
    ...o,
    sampleLabel: label
  }));
}

function buildBirdListFromInitialResults(observations) {
  const map = new Map();

  for (const obs of observations) {
    if (lifeSpecies.has(obs.sciName)) continue;

    if (!map.has(obs.sciName)) {
      map.set(obs.sciName, {
        comName: obs.comName,
        sciName: obs.sciName,
        speciesCode: obs.speciesCode,
        initialObservation: obs
      });
      continue;
    }

    const existing = map.get(obs.sciName);

    if (new Date(obs.obsDt) > new Date(existing.initialObservation.obsDt)) {
      existing.initialObservation = obs;
    }
  }

  return Array.from(map.values());
}

function renderObservationBlock(o) {
  const checklist = o.subId
    ? `<a href="https://ebird.org/checklist/${o.subId}" target="_blank">Checklist</a>`
    : "Checklist";

  const mapLink = `<a href="https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}" target="_blank">Map</a>`;

  return `
  <div>
    <div>• ${o.locName}</div>
    <div>${o.obsDt} — ${checklist}</div>
    <div>${mapLink}</div>
    <div>Count: ${o.howMany ?? "Unknown"}</div>
  </div>`;
}

function renderResults(birds, summary) {
  const list = document.getElementById("results");
  const sum = document.getElementById("resultsSummary");

  list.innerHTML = "";
  sum.textContent = summary;

  for (const bird of birds) {
    const li = document.createElement("li");

    li.innerHTML = `
      <div><strong>${bird.comName}</strong> (${bird.sciName})</div>
      <div id="obs-${bird.speciesCode}">
        ${renderObservationBlock(bird.initialObservation)}
      </div>
      <button onclick="toggleMoreLocations('${bird.speciesCode}')">
        More locations
      </button>
    `;

    list.appendChild(li);
  }
}

async function findBirds() {
  const radius = document.getElementById("radius").value;
  const daysBack = document.getElementById("daysBack").value;
  const spacing = document.getElementById("sampleSpacing").value;

  let observations = [];

  if (searchMode === "point") {
    observations = await fetchRecentAtPoint(
      startPoint,
      radius,
      daysBack,
      "Search point"
    );
  } else {
    const samples = getRouteSamplePoints(routeStart, routeEnd, spacing);

    const startChunk = await fetchRecentAtPoint(
      routeStart,
      radius,
      daysBack,
      "Route start"
    );

    observations.push(...startChunk);

    for (let i = 1; i < samples.length - 1; i++) {
      const mid = await fetchRecentAtPoint(
        samples[i],
        radius,
        daysBack,
        `Route sample`
      );
      observations.push(...mid);
    }

    const endChunk = await fetchRecentAtPoint(
      routeEnd,
      radius,
      daysBack,
      "Route end"
    );

    observations.push(...endChunk);
  }

  currentBirds = buildBirdListFromInitialResults(observations);

  renderResults(currentBirds, `${currentBirds.length} lifer species found.`);
}

async function toggleMoreLocations(speciesCode) {
  if (speciesLocationCache.has(speciesCode)) {
    document.getElementById(
      `obs-${speciesCode}`
    ).innerHTML = speciesLocationCache
      .get(speciesCode)
      .map(renderObservationBlock)
      .join("");

    return;
  }

  const bird = currentBirds.find((b) => b.speciesCode === speciesCode);

  const url = `https://api.ebird.org/v2/data/obs/geo/recent/${speciesCode}?lat=${bird.initialObservation.lat}&lng=${bird.initialObservation.lng}&dist=20&back=7`;

  const res = await fetch(url, {
    headers: { "X-eBirdApiToken": apiKey }
  });

  const data = await res.json();

  const top = data.slice(0, 5);

  speciesLocationCache.set(speciesCode, top);

  document.getElementById(
    `obs-${speciesCode}`
  ).innerHTML = top.map(renderObservationBlock).join("");
}

