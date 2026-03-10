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
  if (apiKey) {
    startApp();
  }
}

function saveKey() {
  const key = document.getElementById("apikeyInput").value.trim();
  if (!key) {
    alert("Enter your eBird API key first.");
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

  if (!map) {
    initMap();
  }

  loadCachedLifeList();
  handleModeChange();
}

function initMap() {
  map = L.map("map").setView([40.23, -111.66], 9);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  map.on("click", function (e) {
    if (searchMode === "point") {
      setSinglePoint(e.latlng);
    } else {
      setRoutePoint(e.latlng);
    }
  });
}

function handleModeChange() {
  searchMode = document.getElementById("searchMode").value;
  const help = document.getElementById("modeHelp");
  const spacing = document.getElementById("sampleSpacing");

  if (searchMode === "point") {
    help.textContent = "Single point mode: click the map to choose one search point.";
    spacing.disabled = true;
  } else {
    help.textContent = "Route mode: click the map once for the route start, then again for the route end. The app will sample along the route.";
    spacing.disabled = false;
  }

  clearMapPoints();
}

function clearMapPoints() {
  startPoint = null;
  routeStart = null;
  routeEnd = null;
  routeClickStage = "start";
  speciesLocationCache.clear();
  currentBirds = [];

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

  if (pointMarker) {
    map.removeLayer(pointMarker);
  }

  pointMarker = L.marker(latlng).addTo(map);
}

function setRoutePoint(latlng) {
  if (routeClickStage === "start") {
    routeStart = latlng;
    routeEnd = null;
    routeClickStage = "end";

    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) {
      map.removeLayer(endMarker);
      endMarker = null;
    }
    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }

    startMarker = L.marker(latlng).addTo(map);
    return;
  }

  routeEnd = latlng;
  routeClickStage = "start";

  if (endMarker) {
    map.removeLayer(endMarker);
  }

  endMarker = L.marker(latlng).addTo(map);

  if (routeLine) {
    map.removeLayer(routeLine);
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
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function () {
    const text = String(reader.result || "");

    try {
      lifeSpecies = parseLifeListCsv(text);
      localStorage.setItem(STORAGE_KEYS.lifeListCsv, text);
      localStorage.setItem(STORAGE_KEYS.lifeListImportedAt, new Date().toISOString());
      updateLifeListStatus();
      alert(`Imported ${lifeSpecies.size} species from your eBird CSV.`);
    } catch (error) {
      console.error(error);
      alert("Could not read that CSV.");
    }
  };

  reader.readAsText(file);
  event.target.value = "";
}

function loadCachedLifeList() {
  const cachedCsv = localStorage.getItem(STORAGE_KEYS.lifeListCsv);

  if (!cachedCsv) {
    lifeSpecies = new Set();
    updateLifeListStatus();
    return;
  }

  try {
    lifeSpecies = parseLifeListCsv(cachedCsv);
  } catch (error) {
    console.error(error);
    lifeSpecies = new Set();
  }

  updateLifeListStatus();
}

function clearLifeListCache() {
  localStorage.removeItem(STORAGE_KEYS.lifeListCsv);
  localStorage.removeItem(STORAGE_KEYS.lifeListImportedAt);
  lifeSpecies = new Set();
  updateLifeListStatus();

  document.getElementById("results").innerHTML = "";
  document.getElementById("resultsSummary").textContent = "";
}

function updateLifeListStatus() {
  const statusEl = document.getElementById("lifeListStatus");
  const importedAt = localStorage.getItem(STORAGE_KEYS.lifeListImportedAt);

  if (!lifeSpecies.size) {
    statusEl.textContent = "No cached life list yet. Import your eBird CSV to filter out birds you have already seen.";
    return;
  }

  let text = `Cached life list: ${lifeSpecies.size} species.`;
  if (importedAt) {
    const d = new Date(importedAt);
    if (!Number.isNaN(d.getTime())) {
      text += ` Imported ${d.toLocaleString()}.`;
    }
  }
  statusEl.textContent = text;
}

function parseLifeListCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error("CSV is empty.");
  }

  const headers = rows[0].map((v) => v.trim().toLowerCase());
  const scientificNameIndex = headers.findIndex((h) => h === "scientific name");
  const categoryIndex = headers.findIndex((h) => h === "category");

  if (scientificNameIndex === -1 || categoryIndex === -1) {
    throw new Error("Expected eBird columns not found.");
  }

  const species = new Set();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const category = (row[categoryIndex] || "").trim().toLowerCase();
    const sciName = (row[scientificNameIndex] || "").trim();

    if (category === "species" && sciName) {
      species.add(sciName);
    }
  }

  return species;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        value += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
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

function interpolateLatLng(a, b, fraction) {
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lng: a.lng + (b.lng - a.lng) * fraction
  };
}

function getRouteSamplePoints(a, b, spacingKm) {
  const totalKm = haversine(a.lat, a.lng, b.lat, b.lng);

  if (totalKm === 0) {
    return [a];
  }

  const segments = Math.max(1, Math.ceil(totalKm / spacingKm));
  const points = [];

  for (let i = 0; i <= segments; i += 1) {
    const fraction = i / segments;
    points.push(interpolateLatLng(a, b, fraction));
  }

  return points;
}

function parseObsDate(obsDt) {
  if (!obsDt) return 0;
  const normalized = obsDt.includes("T") ? obsDt : obsDt.replace(" ", "T");
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatObsDate(obsDt) {
  const timestamp = parseObsDate(obsDt);
  if (!timestamp) return obsDt || "Unknown date";

  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (char) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    return map[char];
  });
}

function getLocationUrl(observation) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${observation.lat},${observation.lng}`)}`;
}

function getChecklistUrl(observation) {
  if (!observation.subId) return "";
  return `https://ebird.org/checklist/${encodeURIComponent(observation.subId)}`;
}

function renderObservationBlock(observation) {
  const checklistUrl = getChecklistUrl(observation);
  const checklistHtml = checklistUrl
    ? `<a href="${checklistUrl}" target="_blank" rel="noopener noreferrer">Checklist</a>`
    : `<span class="disabled-link">Checklist</span>`;

  const countText =
    observation.howMany === null || observation.howMany === undefined || observation.howMany === ""
      ? "Unknown"
      : observation.howMany;

  const sampleText = observation.sampleLabel
    ? `<div class="bird-sample">${escapeHtml(observation.sampleLabel)}</div>`
    : "";

  return `
    <div class="observation-block">
      <div class="bird-location">• ${escapeHtml(observation.locName || "Unknown location")}</div>
      ${sampleText}
      <div class="bird-links-row">
        <span>${escapeHtml(formatObsDate(observation.obsDt))}</span>
        <span>—</span>
        ${checklistHtml}
      </div>
      <div class="bird-links-row">
        <a href="${getLocationUrl(observation)}" target="_blank" rel="noopener noreferrer">Map</a>
      </div>
      <div class="bird-count">Count: ${escapeHtml(countText)}</div>
    </div>
  `;
}

function buildBirdListFromInitialResults(observations) {
  const birdMap = new Map();

  for (const obs of observations) {
    if (!obs || !obs.sciName || !obs.comName || !obs.speciesCode) continue;
    if (lifeSpecies.has(obs.sciName)) continue;

    if (!birdMap.has(obs.sciName)) {
      birdMap.set(obs.sciName, {
        sciName: obs.sciName,
        comName: obs.comName,
        speciesCode: obs.speciesCode,
        initialObservation: obs
      });
      continue;
    }

    const existing = birdMap.get(obs.sciName);
    if (parseObsDate(obs.obsDt) > parseObsDate(existing.initialObservation.obsDt)) {
      existing.initialObservation = obs;
    }
  }

  return Array.from(birdMap.values()).sort((a, b) => {
    return parseObsDate(b.initialObservation.obsDt) - parseObsDate(a.initialObservation.obsDt);
  });
}

function dedupeObservations(observations) {
  const deduped = new Map();

  for (const obs of observations) {
    const key = obs.subId
      ? `sub:${obs.subId}`
      : `pt:${obs.locId || ""}|${obs.locName || ""}|${obs.obsDt || ""}|${obs.lat}|${obs.lng}`;

    const existing = deduped.get(key);
    if (!existing || parseObsDate(obs.obsDt) > parseObsDate(existing.obsDt)) {
      deduped.set(key, obs);
    }
  }

  return Array.from(deduped.values());
}

function renderResults(birds, summaryText) {
  const list = document.getElementById("results");
  const summary = document.getElementById("resultsSummary");

  list.innerHTML = "";
  summary.textContent = summaryText || "";

  if (!birds.length) {
    const li = document.createElement("li");
    li.textContent = "No lifers found for this search.";
    list.appendChild(li);
    return;
  }

  for (const bird of birds) {
    const li = document.createElement("li");
    li.className = "bird-result";

    li.innerHTML = `
      <div class="bird-name">
        ${escapeHtml(bird.comName)} <span class="sci-name">(${escapeHtml(bird.sciName)})</span>
      </div>
      <div class="bird-observations" id="obs-${bird.speciesCode}">
        ${renderObservationBlock(bird.initialObservation)}
      </div>
      <div class="bird-actions">
        <button
          class="text-button"
          id="toggle-${bird.speciesCode}"
          onclick="toggleMoreLocations('${bird.speciesCode}')"
        >
          More locations
        </button>
        <span class="meta" id="status-${bird.speciesCode}"></span>
      </div>
    `;

    list.appendChild(li);
  }
}

async function fetchRecentAtPoint(latlng, radius, daysBack, sampleLabel = "") {
  const url = `https://api.ebird.org/v2/data/obs/geo/recent?lat=${encodeURIComponent(latlng.lat)}&lng=${encodeURIComponent(latlng.lng)}&dist=${encodeURIComponent(radius)}&back=${encodeURIComponent(daysBack)}&maxResults=1000`;

  const response = await fetch(url, {
    headers: {
      "X-eBirdApiToken": apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`eBird request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Unexpected eBird response.");
  }

  return data.map((obs) => ({
    ...obs,
    sampleLabel
  }));
}

async function findBirds() {
  if (!apiKey) {
    alert("Missing API key.");
    return;
  }

  if (!lifeSpecies.size) {
    alert("Import your life list first.");
    return;
  }

  speciesLocationCache.clear();
  currentBirds = [];

  const radius = Number(document.getElementById("radius").value || 20);
  const daysBack = Number(document.getElementById("daysBack").value || 7);
  const spacingKm = Number(document.getElementById("sampleSpacing").value || 10);

  const list = document.getElementById("results");
  const summary = document.getElementById("resultsSummary");

  list.innerHTML = "<li>Searching…</li>";
  summary.textContent = "";

  try {
    let observations = [];

    if (searchMode === "point") {
      if (!startPoint) {
        alert("Click the map to choose a search point.");
        return;
      }

      observations = await fetchRecentAtPoint(startPoint, radius, daysBack, "Search point");
      currentBirds = buildBirdListFromInitialResults(observations);
      renderResults(currentBirds, `${currentBirds.length} lifer species found.`);
      return;
    }

    if (!routeStart || !routeEnd) {
      alert("In route mode, click once for start and once for end.");
      return;
    }

    const samplePoints = getRouteSamplePoints(routeStart, routeEnd, spacingKm);

    for (let i = 0; i < samplePoints.length; i += 1) {
      const point = samplePoints[i];
      const sampleLabel = `Route sample ${i + 1} of ${samplePoints.length}`;
      const chunk = await fetchRecentAtPoint(point, radius, daysBack, sampleLabel);
      observations.push(...chunk);
    }

    observations = dedupeObservations(observations);
    currentBirds = buildBirdListFromInitialResults(observations);

    renderResults(
      currentBirds,
      `${currentBirds.length} lifer species found from ${samplePoints.length} route samples.`
    );
  } catch (error) {
    console.error(error);
    list.innerHTML = "";
    summary.textContent = "";

    const li = document.createElement("li");
    li.textContent = "There was a problem loading birds. Check your API key and try again.";
    list.appendChild(li);
  }
}

async function toggleMoreLocations(speciesCode) {
  const container = document.getElementById(`obs-${speciesCode}`);
  const button = document.getElementById(`toggle-${speciesCode}`);
  const status = document.getElementById(`status-${speciesCode}`);

  if (!container || !button || !status) return;

  const bird = currentBirds.find((item) => item.speciesCode === speciesCode);
  if (!bird) return;

  if (button.dataset.expanded === "true") {
    container.innerHTML = renderObservationBlock(bird.initialObservation);
    button.textContent = "More locations";
    button.dataset.expanded = "false";
    status.textContent = "";
    return;
  }

  if (speciesLocationCache.has(speciesCode)) {
    const cached = speciesLocationCache.get(speciesCode);
    container.innerHTML = cached.map(renderObservationBlock).join("");
    button.textContent = "Show less";
    button.dataset.expanded = "true";
    status.textContent = `${cached.length} recent location${cached.length === 1 ? "" : "s"}`;
    return;
  }

  const radius = Number(document.getElementById("radius").value || 20);
  const daysBack = Number(document.getElementById("daysBack").value || 7);

  button.disabled = true;
  status.textContent = "Loading…";

  try {
    let observations = [];

    if (searchMode === "point") {
      const url = `https://api.ebird.org/v2/data/obs/geo/recent/${encodeURIComponent(speciesCode)}?lat=${encodeURIComponent(startPoint.lat)}&lng=${encodeURIComponent(startPoint.lng)}&dist=${encodeURIComponent(radius)}&back=${encodeURIComponent(daysBack)}&maxResults=50`;

      const response = await fetch(url, {
        headers: { "X-eBirdApiToken": apiKey }
      });

      if (!response.ok) {
        throw new Error(`Species request failed with status ${response.status}`);
      }

      observations = await response.json();
    } else {
      const spacingKm = Number(document.getElementById("sampleSpacing").value || 10);
      const samplePoints = getRouteSamplePoints(routeStart, routeEnd, spacingKm);

      for (let i = 0; i < samplePoints.length; i += 1) {
        const point = samplePoints[i];
        const url = `https://api.ebird.org/v2/data/obs/geo/recent/${encodeURIComponent(speciesCode)}?lat=${encodeURIComponent(point.lat)}&lng=${encodeURIComponent(point.lng)}&dist=${encodeURIComponent(radius)}&back=${encodeURIComponent(daysBack)}&maxResults=50`;

        const response = await fetch(url, {
          headers: { "X-eBirdApiToken": apiKey }
        });

        if (!response.ok) {
          throw new Error(`Species request failed with status ${response.status}`);
        }

        const chunk = await response.json();
        const labeled = chunk.map((obs) => ({
          ...obs,
          sampleLabel: `Route sample ${i + 1} of ${samplePoints.length}`
        }));
        observations.push(...labeled);
      }
    }

    const filtered = Array.isArray(observations)
      ? observations.filter((obs) => obs && obs.sciName === bird.sciName)
      : [];

    const finalObservations = dedupeObservations(filtered)
      .sort((a, b) => parseObsDate(b.obsDt) - parseObsDate(a.obsDt))
      .slice(0, 5);

    const output = finalObservations.length ? finalObservations : [bird.initialObservation];

    speciesLocationCache.set(speciesCode, output);
    container.innerHTML = output.map(renderObservationBlock).join("");
    button.textContent = "Show less";
    button.dataset.expanded = "true";
    status.textContent = `${output.length} recent location${output.length === 1 ? "" : "s"}`;
  } catch (error) {
    console.error(error);
    status.textContent = "Could not load more locations.";
  } finally {
    button.disabled = false;
  }
}