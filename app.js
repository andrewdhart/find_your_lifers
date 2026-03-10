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
      const parsedSpecies = parseLifeListCsv(text);
      lifeSpecies = parsedSpecies;

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

  const results = document.getElementById("results");
  const summary = document.getElementById("resultsSummary");
  if (results) results.innerHTML = "";
  if (summary) summary.textContent = "";

  alert("Cached life list cleared.");
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

    if (!row.length) {
      continue;
    }

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
  if (!obsDt) {
    return 0;
  }

  const normalized = obsDt.includes("T") ? obsDt : obsDt.replace(" ", "T");
  const timestamp = Date.parse(normalized);

  if (!Number.isNaN(timestamp)) {
    return timestamp;
  }

  return 0;
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

function getLocationUrl(observation) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${observation.lat},${observation.lng}`)}`;
}

function getChecklistUrl(observation) {
  if (!observation.subId) {
    return "";
  }

  return `https://ebird.org/checklist/${encodeURIComponent(observation.subId)}`;
}

function groupLiferObservations(observations) {
  const birdMap = new Map();

  for (const observation of observations) {
    if (!observation || !observation.sciName || !observation.comName) {
      continue;
    }

    if (lifeSpecies.has(observation.sciName)) {
      continue;
    }

    if (!birdMap.has(observation.sciName)) {
      birdMap.set(observation.sciName, {
        sciName: observation.sciName,
        comName: observation.comName,
        locations: []
      });
    }

    const entry = birdMap.get(observation.sciName);
    entry.locations.push(observation);
  }

  const birds = [];

  for (const [, bird] of birdMap) {
    const dedupedByChecklistOrPoint = new Map();

    for (const location of bird.locations) {
      const key = location.subId
        ? `sub:${location.subId}`
        : `pt:${location.locName}|${location.obsDt}|${location.lat}|${location.lng}`;

      const existing = dedupedByChecklistOrPoint.get(key);

      if (!existing || parseObsDate(location.obsDt) > parseObsDate(existing.obsDt)) {
        dedupedByChecklistOrPoint.set(key, location);
      }
    }

    const sortedLocations = Array.from(dedupedByChecklistOrPoint.values())
      .map((location) => ({
        ...location,
        distanceKm: haversine(startPoint.lat, startPoint.lng, location.lat, location.lng)
      }))
      .sort((a, b) => {
        const dateDiff = parseObsDate(b.obsDt) - parseObsDate(a.obsDt);
        if (dateDiff !== 0) {
          return dateDiff;
        }
        return a.distanceKm - b.distanceKm;
      })
      .slice(0, 5);

    birds.push({
      sciName: bird.sciName,
      comName: bird.comName,
      latestObs: sortedLocations[0] ? parseObsDate(sortedLocations[0].obsDt) : 0,
      nearestDistanceKm: sortedLocations.length
        ? Math.min(...sortedLocations.map((location) => location.distanceKm))
        : Infinity,
      locations: sortedLocations
    });
  }

  birds.sort((a, b) => {
    const dateDiff = b.latestObs - a.latestObs;
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return a.nearestDistanceKm - b.nearestDistanceKm;
  });

  return birds;
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
    for (const location of bird.locations) {
      const li = document.createElement("li");
      li.className = "bird-result";

      const mapsUrl = getLocationUrl(location);
      const checklistUrl = getChecklistUrl(location);
      const checklistHtml = checklistUrl
        ? `<a href="${checklistUrl}" target="_blank" rel="noopener noreferrer">Checklist</a>`
        : `<span class="disabled-link">Checklist</span>`;

      li.innerHTML = `
        <div class="bird-name">
          ${escapeHtml(bird.comName)} <span class="sci-name">(${escapeHtml(bird.sciName)})</span>
        </div>

        <div class="bird-location">• ${escapeHtml(location.locName || "Unknown location")}</div>

        <div class="bird-links-row">
          <span>${escapeHtml(formatObsDate(location.obsDt))}</span>
          <span>—</span>
          ${checklistHtml}
        </div>

        <div class="bird-links-row">
          <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Map</a>
        </div>

        <div class="bird-count">Count: ${escapeHtml(location.howMany ?? "Unknown")}</div>
      `;

      list.appendChild(li);
    }
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

  const radius = Number(document.getElementById("radius").value || 20);
  const daysBack = Number(document.getElementById("daysBack").value || 7);
  const results = document.getElementById("results");
  const summary = document.getElementById("resultsSummary");

  results.innerHTML = "<li>Searching…</li>";
  if (summary) {
    summary.textContent = "";
  }

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

    const groupedBirds = groupLiferObservations(data);
    renderResults(groupedBirds, data.length);
  } catch (error) {
    console.error(error);
    results.innerHTML = "";
    if (summary) {
      summary.textContent = "";
    }

    const li = document.createElement("li");
    li.textContent = "There was a problem loading birds. Check your API key and try again.";
    results.appendChild(li);
  }
}