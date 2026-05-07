const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "gallery.db");
const db = new sqlite3.Database(dbPath);

const API_KEY = process.env.PEXELS_API_KEY;

if (!API_KEY) {
  console.error("Missing PEXELS_API_KEY environment variable.");
  console.error('PowerShell example: $env:PEXELS_API_KEY="your_key_here"');
  process.exit(1);
}

const CATEGORY_TARGETS = {
  nature: 100,
  entertainment: 100,
  travel: 100,
  family: 100,
  sports: 100
};

// Category-specific search phrases.
// These are intentionally varied so results feel more real and less repetitive.
const SEARCH_QUERIES = {
  nature: [
    "Nepal mountains",
    "Nepal landscape",
    "Nepal lake nature",
    "Nepal forest",
    "Himalaya sunrise"
  ],
  entertainment: [
    "concert stage",
    "live music performance",
    "festival crowd",
    "cinema audience",
    "stage lights singer"
  ],
  travel: [
    "travel backpacker",
    "mountain road trip",
    "airport travel",
    "city travel photography",
    "adventure journey"
  ],
  family: [
    "family picnic",
    "family home portrait",
    "parents and children",
    "family celebration",
    "siblings together"
  ],
  sports: [
    "cricket player",
    "football player",
    "soccer stadium",
    "cricket match",
    "athlete training"
  ]
};

const cameraMakes = ["Canon", "Nikon", "Sony", "Fujifilm", "Panasonic"];
const cameraModels = ["EOS R50", "D3500", "Alpha A6400", "X-T30", "Lumix G7"];
const lensModels = ["18-45mm", "50mm f/1.8", "24-70mm", "70-200mm", "35mm f/1.4"];
const visibilities = ["private", "public", "shared"];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 4) {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomDate() {
  const year = randomInt(2023, 2026);
  const month = String(randomInt(1, 12)).padStart(2, "0");
  const day = String(randomInt(1, 28)).padStart(2, "0");
  const hour = String(randomInt(0, 23)).padStart(2, "0");
  const minute = String(randomInt(0, 59)).padStart(2, "0");
  const second = String(randomInt(0, 59)).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function titleCase(text) {
  return String(text)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function ensureUsedIdsTable() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS used_image_ids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      externalId TEXT NOT NULL UNIQUE,
      category TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getUsedIds() {
  const rows = await dbAll(`SELECT externalId FROM used_image_ids WHERE provider = 'pexels'`);
  return new Set(rows.map(r => r.externalId));
}

async function markUsed(externalId, category) {
  await dbRun(
    `INSERT OR IGNORE INTO used_image_ids (provider, externalId, category) VALUES ('pexels', ?, ?)`,
    [externalId, category]
  );
}

async function searchPexels(query, page = 1, perPage = 80) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`;

  const response = await fetch(url, {
    headers: {
      Authorization: API_KEY
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pexels API error ${response.status}: ${text}`);
  }

  return response.json();
}

function buildPhotoRecord(category, pexelsPhoto, counter) {
  const createdAt = randomDate();
  const takenAt = randomDate();
  const cameraMake = randomItem(cameraMakes);
  const cameraModel = randomItem(cameraModels);
  const lensModel = randomItem(lensModels);

  const tagSeeds = {
    nature: "nepal,nature,landscape,mountain,outdoors",
    entertainment: "concert,stage,music,festival,show",
    travel: "travel,journey,adventure,trip,explore",
    family: "family,home,memory,celebration,together",
    sports: "sports,cricket,football,athlete,stadium"
  };

  const locationSeeds = {
    nature: "Nepal",
    entertainment: "Event Venue",
    travel: "Travel Destination",
    family: "Family Home",
    sports: "Sports Ground"
  };

  const sourceUrl =
    pexelsPhoto.src?.large2x ||
    pexelsPhoto.src?.large ||
    pexelsPhoto.src?.medium ||
    pexelsPhoto.src?.original;

  return {
    externalId: `pexels:${pexelsPhoto.id}`,
    title: `${titleCase(category)} Photo ${counter}`,
    imageUrl: sourceUrl,
    category,
    description: `Real ${category} image imported from API with automatic metadata.`,
    tags: tagSeeds[category],
    filename: null,
    originalName: null,
    mimeType: "image/jpeg",
    sizeBytes: randomInt(150000, 950000),
    width: pexelsPhoto.width || randomInt(1200, 2200),
    height: pexelsPhoto.height || randomInt(700, 1500),
    sourceType: "url",
    takenAt,
    cameraMake,
    cameraModel,
    lensModel,
    iso: randomItem([100, 200, 400, 800, 1600]),
    shutterSpeed: randomItem(["1/60", "1/125", "1/250", "1/500", "1/1000"]),
    aperture: randomItem(["f/1.8", "f/2.8", "f/4", "f/5.6", "f/8"]),
    focalLength: randomItem(["24mm", "35mm", "50mm", "85mm", "135mm"]),
    locationName: locationSeeds[category],
    latitude: category === "nature" ? randomFloat(26, 29) : null,
    longitude: category === "nature" ? randomFloat(80, 88) : null,
    isFavorite: Math.random() > 0.75 ? 1 : 0,
    visibility: randomItem(visibilities),
    createdAt,
    updatedAt: createdAt
  };
}

async function insertPhoto(photo) {
  const sql = `
    INSERT INTO photos (
      title,
      imageUrl,
      category,
      description,
      tags,
      filename,
      originalName,
      mimeType,
      sizeBytes,
      width,
      height,
      sourceType,
      takenAt,
      cameraMake,
      cameraModel,
      lensModel,
      iso,
      shutterSpeed,
      aperture,
      focalLength,
      locationName,
      latitude,
      longitude,
      isFavorite,
      visibility,
      createdAt,
      updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await dbRun(sql, [
    photo.title,
    photo.imageUrl,
    photo.category,
    photo.description,
    photo.tags,
    photo.filename,
    photo.originalName,
    photo.mimeType,
    photo.sizeBytes,
    photo.width,
    photo.height,
    photo.sourceType,
    photo.takenAt,
    photo.cameraMake,
    photo.cameraModel,
    photo.lensModel,
    photo.iso,
    photo.shutterSpeed,
    photo.aperture,
    photo.focalLength,
    photo.locationName,
    photo.latitude,
    photo.longitude,
    photo.isFavorite,
    photo.visibility,
    photo.createdAt,
    photo.updatedAt
  ]);
}

async function seedCategory(category, targetCount, usedIds) {
  const queries = SEARCH_QUERIES[category];
  let inserted = 0;
  let queryIndex = 0;
  let page = 1;
  let safety = 0;

  while (inserted < targetCount && safety < 300) {
    safety++;

    const query = queries[queryIndex % queries.length];
    const data = await searchPexels(query, page, 80);
    const photos = data.photos || [];

    if (!photos.length) {
      queryIndex++;
      page = 1;
      continue;
    }

    for (const item of photos) {
      const externalId = `pexels:${item.id}`;

      if (usedIds.has(externalId)) {
        continue;
      }

      const photo = buildPhotoRecord(category, item, inserted + 1);

      if (!photo.imageUrl) {
        continue;
      }

      await insertPhoto(photo);
      await markUsed(externalId, category);

      usedIds.add(externalId);
      inserted++;

      console.log(`[${category}] inserted ${inserted}/${targetCount} -> ${externalId}`);

      if (inserted >= targetCount) {
        break;
      }
    }

    page++;

    // Move to a different search phrase after a few pages
    if (page > 5) {
      page = 1;
      queryIndex++;
    }
  }

  if (inserted < targetCount) {
    console.warn(
      `[${category}] only inserted ${inserted}/${targetCount}. ` +
      `You may need broader queries or a larger API result pool.`
    );
  }
}

async function main() {
  try {
    await ensureUsedIdsTable();

    const usedIds = await getUsedIds();

    for (const [category, target] of Object.entries(CATEGORY_TARGETS)) {
      await seedCategory(category, target, usedIds);
    }

    console.log("Seeding complete.");
  } catch (error) {
    console.error("Seed failed:", error.message);
  } finally {
    db.close(() => {
      console.log("Database connection closed.");
    });
  }
}

main();