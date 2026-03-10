const STORAGE_KEYS = {
  apiKey: "ebirdKey",
  lifeListCsv: "ebirdLifeListCsv",
  lifeListImportedAt: "ebirdLifeListImportedAt"
};

let apiKey = null;
let map = null;
let marker = null;
let startPoint = null;
let lifeSpecies = new Set();

// Cached from initial search
let currentBirds = [];

// Cache for expanded species-specific location lookups
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
  const apiKeyScreen = document.getElementById("apikeyScreen");
  const app = document.getElementById("app");

  if (apiKeyScreen) apiKeyScreen.classList.add("hidden");
  if (app) app.classList.remove("hidden");

  if (!map) {
    initMap();
  }

  loadCachedLifeList();
}

function initMap() {
  map = L.map("map").setView([40.23, -111.66], 9);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  map.on("click", function (e) {
    startPoint = e.latlng;

    if (marker) {
      map.removeLayer(marker);
    }

    marker = L.marker(e.latlng).addTo(map);
  });
}

function handleLifeListImport(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  }

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
      alert("Could not read that CSV. Make sure you selected your eBird downloaded data file.");
    }
  };

  reader.onerror = function () {
    alert("There was a problem reading that file.");
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

  const list = document.getElementById("results");
  const summary = document.getElementById("resultsSummary");
  if (list) list.innerHTML = "";
  if (summary) summary.textContent = "";
}

function updateLifeListStatus() {
  const statusEl = document.getElementById("lifeListStatus");
  const importedAt = localStorage.getItem(STORAGE_KEYS.lifeListImportedAt);

  if (!statusEl) {
    return;
  }

  if (!lifeSpecies.size) {
    statusEl.textContent = "No cached life list yet. Import your eBird CSV to filter out birds you have already seen.";
    return;
  }

  let message = `Cached life list: ${lifeSpecies.size} species.`;

  if (importedAt) {
    const when = new Date(importedAt);
    if (!Number.isNaN(when.getTime())) {
      message += ` Imported ${when.toLocaleString()}.`;
    }
  }

  statusEl.textContent = message;
}

function parseLifeListCsv(text) {
  const rows = parseCsv(text);

  if (rows.length < 2) {
    throw new Error("CSV is empty.");
  }

  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const scientificNameIndex = headers.findIndex((header) => header === "scientific name");
  const categoryIndex = headers.findIndex((header) => header === "category");

  if (scientificNameIndex === -1 || categoryIndex === -1) {
    throw new Error("Expected eBird download columns were not found.");
  }

  const species = new Set();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row.length) continue;

    const category = (row[categoryIndex] || "").trim().toLowerCase();
    const scientificName = (row[scientificNameIndex] || "").trim();

    if (category === "species" && scientificName) {
      species.add(scientificName);
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
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
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

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseObsDate(obsDt) {
  if (!obsDt) return 0;

  const normalized = obsDt.includes("T") ? obsDt : obsDt.replace(" ", "T");
  const timestamp = Date.parse(normalized);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatObsDate(obsDt) {
  const timestamp = parseObsDate(obsDt);

  if (!timestamp) {
    return obsDt || "Unknown date";
  }

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

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
  if (!observation.subId) {
    return "";
  }

  return `https://ebird.org/checklist/${encodeURIComponent(observation.subId)}`;
}

function sortObservationsMostRecentFirst(a, b) {
  const dateDiff = parseObsDate(b.obsDt) - parseObsDate(a.obsDt);
  if (dateDiff !== 0) return dateDiff;

  const aDistance = haversine(startPoint.lat, startPoint.lng, a.lat, a.lng);
  const bDistance = haversine(startPoint.lat, startPoint.lng, b.lat, b.lng);
  return aDistance - bDistance;
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

function buildBirdListFromInitialResults(observations) {
  const birdMap = new Map();

  for (const obs of observations) {
    if (!obs || !obs.sciName || !obs.comName || !obs.speciesCode) {
      continue;
    }

    if (lifeSpecies.has(obs.sciName)) {
      continue;
    }

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

  const birds = Array.from(birdMap.values()).sort((a, b) => {
    const dateDiff = parseObsDate(b.initialObservation.obsDt) - parseObsDate(a.initialObservation.obsDt);
    if (dateDiff !== 0) return dateDiff;

    const aDistance = haversine(startPoint.lat, startPoint.lng, a.initialObservation.lat, a.initialObservation.lng);
    const bDistance = haversine(startPoint.lat, startPoint.lng, b.initialObservation.lat, b.initialObservation.lng);
    return aDistance - bDistance;
  });

  return birds;
}

function renderObservationBlock(observation) {
  const mapsUrl = getLocationUrl(observation);
  const checklistUrl = getChecklistUrl(observation);
  const checklistHtml = checklistUrl
    ? `<a href="${checklistUrl}" target="_blank" rel="noopener noreferrer">Checklist</a>`
    : `<span class="disabled-link">Checklist</span>`;

  const countText =
    observation.howMany === null || observation.howMany === undefined || observation.howMany === ""
      ? "Unknown"
      : observation.howMany;

  return `
    <div class="observation-block">
      <div class="bird-location">• ${escapeHtml(observation.locName || "Unknown location")}</div>
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

function renderResults(birds, rawCount) {
  const list = document.getElementById("results");
  const summary = document.getElementById("resultsSummary");

  list.innerHTML = "";

  if (!birds.length) {
    if (summary) {
      summary.textContent = `No lifers found in ${rawCount} recent observations.`;
    }

    const li = document.createElement("li");
    li.textContent = "No lifers found for this search.";
    list.appendChild(li);
    return;
  }

  if (summary) {
    summary.textContent = `${birds.length} lifer species found.`;
  }

  for (const bird of birds) {
    const li = document.createElement("li");
    li.className = "bird-result";
    li.id = `bird-${bird.speciesCode}`;

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

async function findBirds() {
  if (!startPoint) {
    alert("Click the map to choose a search point.");
    return;
  }

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
  const list = document.getElementById("results");
  const summary = document.getElementById("resultsSummary");

  list.innerHTML = "<li>Searching…</li>";
  if (summary) summary.textContent = "";

  const url = `https://api.ebird.org/v2/data/obs/geo/recent?lat=${encodeURIComponent(startPoint.lat)}&lng=${encodeURIComponent(startPoint.lng)}&dist=${encodeURIComponent(radius)}&back=${encodeURIComponent(daysBack)}&maxResults=1000`;

  try {
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

    currentBirds = buildBirdListFromInitialResults(data);
    renderResults(currentBirds, data.length);
  } catch (error) {
    console.error(error);
    list.innerHTML = "";

    const li = document.createElement("li");
    li.textContent = "There was a problem loading birds. Check your API key and try again.";
    list.appendChild(li);
  }
}

async function toggleMoreLocations(speciesCode) {
  const container = document.getElementById(`obs-${speciesCode}`);
  const button = document.getElementById(`toggle-${speciesCode}`);
  const status = document.getElementById(`status-${speciesCode}`);

  if (!container || !button || !status) {
    return;
  }

  const bird = currentBirds.find((item) => item.speciesCode === speciesCode);
  if (!bird) {
    return;
  }

  // Collapse if already expanded
  if (button.dataset.expanded === "true") {
    container.innerHTML = renderObservationBlock(bird.initialObservation);
    button.textContent = "More locations";
    button.dataset.expanded = "false";
    status.textContent = "";
    return;
  }

  // Use cache if already loaded
  if (speciesLocationCache.has(speciesCode)) {
    const cachedObservations = speciesLocationCache.get(speciesCode);
    container.innerHTML = cachedObservations.map(renderObservationBlock).join("");
    button.textContent = "Show less";
    button.dataset.expanded = "true";
    status.textContent = `${cachedObservations.length} recent location${cachedObservations.length === 1 ? "" : "s"}`;
    return;
  }

  if (!startPoint) {
    alert("Choose a search point first.");
    return;
  }

  const radius = Number(document.getElementById("radius").value || 20);
  const daysBack = Number(document.getElementById("daysBack").value || 7);

  button.disabled = true;
  status.textContent = "Loading…";

  const url = `https://api.ebird.org/v2/data/obs/geo/recent/${encodeURIComponent(speciesCode)}?lat=${encodeURIComponent(startPoint.lat)}&lng=${encodeURIComponent(startPoint.lng)}&dist=${encodeURIComponent(radius)}&back=${encodeURIComponent(daysBack)}&maxResults=50`;

  try {
    const response = await fetch(url, {
      headers: {
        "X-eBirdApiToken": apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Species request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Unexpected species response.");
    }

    const filtered = data.filter((obs) => obs && obs.sciName === bird.sciName);
    const deduped = dedupeObservations(filtered)
      .sort(sortObservationsMostRecentFirst)
      .slice(0, 5);

    const finalObservations = deduped.length ? deduped : [bird.initialObservation];

    speciesLocationCache.set(speciesCode, finalObservations);
    container.innerHTML = finalObservations.map(renderObservationBlock).join("");
    button.textContent = "Show less";
    button.dataset.expanded = "true";
    status.textContent = `${finalObservations.length} recent location${finalObservations.length === 1 ? "" : "s"}`;
  } catch (error) {
    console.error(error);
    status.textContent = "Could not load more locations.";
  } finally {
    button.disabled = false;
  }
}