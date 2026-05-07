"use strict";

const express = require("express");
const path = require("path");
const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob");
require("dotenv").config();

const {
  getAllPhotos,
  createPhoto,
  updatePhoto,
  deletePhoto
} = require("./cosmos");

const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------------------------------------------
   Middleware
------------------------------------------------------- */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

/* -------------------------------------------------------
   Environment Checks
   Cosmos SDK values are no longer required by server.js.
   CRUD now goes through Azure Logic Apps.
------------------------------------------------------- */

function warnIfMissingEnv(name) {
  if (!process.env[name] || !process.env[name].trim()) {
    console.warn(`Warning: Missing ${name}`);
  }
}

warnIfMissingEnv("LOGIC_READ");
warnIfMissingEnv("LOGIC_CREATE");
warnIfMissingEnv("LOGIC_UPDATE");

// DELETE is optional for now
if (!process.env.LOGIC_DELETE || !process.env.LOGIC_DELETE.trim()) {
  console.warn("Warning: LOGIC_DELETE is not configured yet. Delete route may fail until fixed.");
}

warnIfMissingEnv("AZURE_STORAGE_CONNECTION_STRING");
warnIfMissingEnv("AZURE_STORAGE_CONTAINER");

/* -------------------------------------------------------
   Azure Blob Setup
------------------------------------------------------- */

function getBlobContainerClient() {
  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    const error = new Error("Missing AZURE_STORAGE_CONNECTION_STRING");
    error.status = 500;
    error.code = "MISSING_AZURE_STORAGE_CONNECTION_STRING";
    throw error;
  }

  if (!process.env.AZURE_STORAGE_CONTAINER) {
    const error = new Error("Missing AZURE_STORAGE_CONTAINER");
    error.status = 500;
    error.code = "MISSING_AZURE_STORAGE_CONTAINER";
    throw error;
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );

  return blobServiceClient.getContainerClient(
    process.env.AZURE_STORAGE_CONTAINER
  );
}

async function ensureBlobContainerExists() {
  const containerClient = getBlobContainerClient();

  await containerClient.createIfNotExists({
    access: "blob"
  });

  return containerClient;
}

/* -------------------------------------------------------
   Multer Upload Config
------------------------------------------------------- */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }

    cb(null, true);
  }
});

/* -------------------------------------------------------
   Normalization Helpers
------------------------------------------------------- */

function normalizeText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function normalizeNullableText(value) {
  const v = normalizeText(value, "");
  return v === "" ? null : v;
}

function normalizeInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

function normalizeFloat(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function normalizeBooleanToInt(value) {
  if (
    value === true ||
    value === "true" ||
    value === "1" ||
    value === 1 ||
    value === "on" ||
    value === "yes"
  ) {
    return 1;
  }

  return 0;
}

/*
  IMPORTANT:
  Old code changed unknown categories like "test" into "other".
  That caused your POST body category "test" to become "other".

  This version preserves custom categories.
  Examples:
  - "test" stays "test"
  - "travel" stays "travel"
  - "trip" becomes "travel"
  - empty category becomes "other"
*/
function normalizeCategory(value) {
  const v = normalizeText(value, "other").toLowerCase();

  if (!v) return "other";

  const categoryMap = {
    trip: "travel",
    vacation: "travel",
    holiday: "travel",

    friend: "friends",

    forest: "nature",
    beach: "nature",
    sunset: "nature",

    music: "entertainment",
    concert: "entertainment",

    sport: "sports",
    football: "sports",
    cricket: "sports",

    uncategorized: "other"
  };

  return categoryMap[v] || v;
}

function normalizeVisibility(value) {
  const allowed = ["private", "public", "shared"];
  const v = normalizeText(value, "private").toLowerCase();

  return allowed.includes(v) ? v : "private";
}

function buildMetadataFromBody(body = {}) {
  return {
    title: normalizeText(body.title),
    category: normalizeCategory(body.category),
    description: normalizeText(body.description),
    tags: normalizeText(body.tags),

    width: normalizeInteger(body.width),
    height: normalizeInteger(body.height),

    takenAt: normalizeNullableText(body.takenAt),

    cameraMake: normalizeNullableText(body.cameraMake),
    cameraModel: normalizeNullableText(body.cameraModel),
    lensModel: normalizeNullableText(body.lensModel),

    iso: normalizeInteger(body.iso),
    shutterSpeed: normalizeNullableText(body.shutterSpeed),
    aperture: normalizeNullableText(body.aperture),
    focalLength: normalizeNullableText(body.focalLength),

    locationName: normalizeNullableText(body.locationName),
    latitude: normalizeFloat(body.latitude),
    longitude: normalizeFloat(body.longitude),

    isFavorite: normalizeBooleanToInt(body.isFavorite),
    visibility: normalizeVisibility(body.visibility)
  };
}

function hasOwn(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function buildMetadataPatchFromBody(body = {}) {
  const patch = {};

  if (hasOwn(body, "title")) patch.title = normalizeText(body.title);
  if (hasOwn(body, "category")) patch.category = normalizeCategory(body.category);
  if (hasOwn(body, "description")) patch.description = normalizeText(body.description);
  if (hasOwn(body, "tags")) patch.tags = normalizeText(body.tags);

  if (hasOwn(body, "width")) patch.width = normalizeInteger(body.width);
  if (hasOwn(body, "height")) patch.height = normalizeInteger(body.height);

  if (hasOwn(body, "takenAt")) patch.takenAt = normalizeNullableText(body.takenAt);

  if (hasOwn(body, "cameraMake")) patch.cameraMake = normalizeNullableText(body.cameraMake);
  if (hasOwn(body, "cameraModel")) patch.cameraModel = normalizeNullableText(body.cameraModel);
  if (hasOwn(body, "lensModel")) patch.lensModel = normalizeNullableText(body.lensModel);

  if (hasOwn(body, "iso")) patch.iso = normalizeInteger(body.iso);
  if (hasOwn(body, "shutterSpeed")) patch.shutterSpeed = normalizeNullableText(body.shutterSpeed);
  if (hasOwn(body, "aperture")) patch.aperture = normalizeNullableText(body.aperture);
  if (hasOwn(body, "focalLength")) patch.focalLength = normalizeNullableText(body.focalLength);

  if (hasOwn(body, "locationName")) patch.locationName = normalizeNullableText(body.locationName);
  if (hasOwn(body, "latitude")) patch.latitude = normalizeFloat(body.latitude);
  if (hasOwn(body, "longitude")) patch.longitude = normalizeFloat(body.longitude);

  if (hasOwn(body, "isFavorite")) patch.isFavorite = normalizeBooleanToInt(body.isFavorite);
  if (hasOwn(body, "visibility")) patch.visibility = normalizeVisibility(body.visibility);

  return patch;
}

function validatePhotoInput({ title, imageUrl = null, requireImageUrl = false }) {
  if (!title) return "Title is required";
  if (requireImageUrl && !imageUrl) return "Image URL is required";
  return null;
}

function cleanPhoto(photo) {
  if (!photo) return null;

  const {
    _rid,
    _self,
    _etag,
    _attachments,
    _ts,
    ...cleaned
  } = photo;

  return cleaned;
}

function cleanPhotos(photos = []) {
  return photos.map(cleanPhoto);
}

async function findPhotoById(id) {
  const allPhotos = await getAllPhotos();

  return allPhotos.find((item) => String(item.id) === String(id)) || null;
}

function buildBlobName(originalName) {
  const safeOriginalName = String(originalName || "photo.jpg")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-");

  return `${Date.now()}-${safeOriginalName}`;
}

function sendApiError(res, error, fallbackMessage) {
  console.error("API ERROR:", error);

  res.status(error.status || 500).json({
    error: fallbackMessage || error.message || "Server error",
    code: error.code || "SERVER_ERROR",
    details: error.responseBody || undefined
  });
}

/* -------------------------------------------------------
   Page Routes
------------------------------------------------------- */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

/* -------------------------------------------------------
   Test / Health Routes
------------------------------------------------------- */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Photo Gallery API is running",
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/test-cosmos", async (req, res) => {
  try {
    const photos = await getAllPhotos();

    res.json({
      ok: true,
      message: "Logic App READ works",
      count: photos.length
    });
  } catch (error) {
    console.error("Logic App READ test error:", error);

    res.status(error.status || 500).json({
      ok: false,
      error: error.message,
      code: error.code || "READ_TEST_FAILED",
      details: error.responseBody || undefined
    });
  }
});

/* -------------------------------------------------------
   Photo Routes
   Express Backend -> Azure Logic Apps -> Cosmos DB
------------------------------------------------------- */

app.get("/api/photos", async (req, res) => {
  try {
    let photos = await getAllPhotos();

    const {
      category,
      visibility,
      sourceType,
      favorite,
      search,
      tag,
      sort
    } = req.query;

    if (category) {
      const normalizedCategory = normalizeCategory(category);

      photos = photos.filter(
        (photo) => normalizeCategory(photo.category) === normalizedCategory
      );
    }

    if (visibility) {
      photos = photos.filter(
        (photo) =>
          normalizeVisibility(photo.visibility) === normalizeVisibility(visibility)
      );
    }

    if (sourceType) {
      photos = photos.filter((photo) => photo.sourceType === sourceType);
    }

    if (favorite === "1" || favorite === "true") {
      photos = photos.filter((photo) => Number(photo.isFavorite) === 1);
    }

    if (tag) {
      const needle = String(tag).toLowerCase();

      photos = photos.filter((photo) =>
        String(photo.tags || "").toLowerCase().includes(needle)
      );
    }

    if (search) {
      const needle = String(search).toLowerCase();

      photos = photos.filter((photo) =>
        [
          photo.title,
          photo.description,
          photo.category,
          photo.tags,
          photo.locationName,
          photo.cameraMake,
          photo.cameraModel
        ].some((value) => String(value || "").toLowerCase().includes(needle))
      );
    }

    if (sort === "oldest") {
      photos.sort(
        (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
      );
    } else if (sort === "title_asc") {
      photos.sort((a, b) =>
        String(a.title || "").localeCompare(String(b.title || ""))
      );
    } else if (sort === "title_desc") {
      photos.sort((a, b) =>
        String(b.title || "").localeCompare(String(a.title || ""))
      );
    } else {
      photos.sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
    }

    console.log(`GET /api/photos returned ${photos.length} photos`);

    res.json(cleanPhotos(photos));
  } catch (error) {
    sendApiError(res, error, "Failed to fetch photos");
  }
});

app.get("/api/photos/:id", async (req, res) => {
  try {
    const photo = await findPhotoById(req.params.id);

    if (!photo) {
      return res.status(404).json({
        error: "Photo not found"
      });
    }

    res.json(cleanPhoto(photo));
  } catch (error) {
    sendApiError(res, error, "Failed to fetch photo");
  }
});

app.post("/api/photos", async (req, res) => {
  try {
    console.log("POST /api/photos body:", req.body);

    const metadata = buildMetadataFromBody(req.body);
    const imageUrl = normalizeText(req.body.imageUrl);

    const validationError = validatePhotoInput({
      title: metadata.title,
      imageUrl,
      requireImageUrl: true
    });

    if (validationError) {
      return res.status(400).json({
        error: validationError
      });
    }

    const payload = {
      ...metadata,
      imageUrl,
      filename: null,
      originalName: null,
      mimeType: null,
      sizeBytes: null,
      sourceType: "url"
    };

    console.log("CREATE payload sent to Logic App:", payload);

    const photo = await createPhoto(payload);

    console.log("CREATE photo returned from Logic App:", photo);

    res.status(201).json({
      message: "Photo saved successfully",
      photo: cleanPhoto(photo)
    });
  } catch (error) {
    sendApiError(res, error, "Failed to save photo");
  }
});

app.post("/api/photos/upload", upload.any(), async (req, res) => {
  try {
    console.log("POST /api/photos/upload body:", req.body);
    console.log("POST /api/photos/upload files:", req.files);

    const file = req.files && req.files.length > 0 ? req.files[0] : null;

    if (!file) {
      return res.status(400).json({
        error: "Photo file is required"
      });
    }

    const containerClient = await ensureBlobContainerExists();

    const metadata = buildMetadataFromBody(req.body);

    const validationError = validatePhotoInput({
      title: metadata.title,
      imageUrl: "temporary-url",
      requireImageUrl: true
    });

    if (validationError) {
      return res.status(400).json({
        error: validationError
      });
    }

    const blobName = buildBlobName(file.originalname);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: {
        blobContentType: file.mimetype
      }
    });

    const imageUrl = blockBlobClient.url;

    const payload = {
      ...metadata,
      imageUrl,
      filename: blobName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      sourceType: "upload"
    };

    console.log("UPLOAD CREATE payload sent to Logic App:", payload);

    const photo = await createPhoto(payload);

    console.log("UPLOAD photo returned from Logic App:", photo);

    res.status(201).json({
      message: "Photo uploaded successfully",
      photo: cleanPhoto(photo)
    });
  } catch (error) {
    sendApiError(res, error, "Failed to upload photo");
  }
});

app.put("/api/photos/:id", async (req, res) => {
  try {
    console.log("PUT /api/photos/:id params:", req.params);
    console.log("PUT /api/photos/:id body:", req.body);

    const existingPhoto = await findPhotoById(req.params.id);

    if (!existingPhoto) {
      return res.status(404).json({
        error: "Photo not found"
      });
    }

    const metadataPatch = buildMetadataPatchFromBody(req.body);

    const titleToValidate = hasOwn(metadataPatch, "title")
      ? metadataPatch.title
      : existingPhoto.title;

    if (!titleToValidate) {
      return res.status(400).json({
        error: "Title is required"
      });
    }

    const mergedPhoto = {
      ...existingPhoto,
      ...metadataPatch,
      id: existingPhoto.id,
      title: titleToValidate,
      category: metadataPatch.category || existingPhoto.category,
      imageUrl: existingPhoto.imageUrl,
      updatedAt: new Date().toISOString()
    };

    console.log("UPDATE payload sent to Logic App:", mergedPhoto);

    /*
      IMPORTANT:
      New Logic-App-based cosmos.js expects:
      updatePhoto(id, updates)
    */
    const updatedPhoto = await updatePhoto(existingPhoto.id, mergedPhoto);

    console.log("UPDATE photo returned from Logic App:", updatedPhoto);

    res.json({
      message: "Photo updated successfully",
      photo: cleanPhoto(updatedPhoto)
    });
  } catch (error) {
    sendApiError(res, error, "Failed to update photo");
  }
});

app.delete("/api/photos/:id", async (req, res) => {
  try {
    console.log("DELETE /api/photos/:id params:", req.params);
    console.log("DELETE /api/photos/:id query:", req.query);
    console.log("DELETE /api/photos/:id body:", req.body);

    const existingPhoto = await findPhotoById(req.params.id);

    if (!existingPhoto) {
      return res.status(404).json({
        error: "Photo not found"
      });
    }

    /*
      DELETE Logic App is still optional.
      If LOGIC_DELETE is empty, deletePhoto will return a controlled error.
    */
    await deletePhoto(existingPhoto.id, existingPhoto.category);

    /*
      Blob delete only happens after Cosmos delete succeeds.
      Since DELETE Logic App is currently unstable, this avoids deleting
      the blob while the Cosmos document remains.
    */
    if (existingPhoto.filename && existingPhoto.sourceType === "upload") {
      try {
        const containerClient = getBlobContainerClient();
        const blockBlobClient = containerClient.getBlockBlobClient(
          existingPhoto.filename
        );

        await blockBlobClient.deleteIfExists();
      } catch (blobError) {
        console.error("Blob delete warning:", blobError.message);
      }
    }

    res.json({
      message: "Photo deleted successfully"
    });
  } catch (error) {
    sendApiError(res, error, "Failed to delete photo");
  }
});

/* -------------------------------------------------------
   Frontend Page Routes
------------------------------------------------------- */

app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

app.get("/gallery", (req, res) => {
  res.sendFile(path.join(__dirname, "gallery.html"));
});

app.get("/upload", (req, res) => {
  res.sendFile(path.join(__dirname, "upload.html"));
});

app.get("/albums", (req, res) => {
  res.sendFile(path.join(__dirname, "albums.html"));
});

app.get("/features", (req, res) => {
  res.sendFile(path.join(__dirname, "features.html"));
});

app.get("/about", (req, res) => {
  res.sendFile(path.join(__dirname, "about.html"));
});

app.get("/contact", (req, res) => {
  res.sendFile(path.join(__dirname, "contact.html"));
});

/* -------------------------------------------------------
   404 Handling
------------------------------------------------------- */

app.use("/api", (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "home.html"));
});

/* -------------------------------------------------------
   Global Error Handler
------------------------------------------------------- */

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: error.message,
      code: error.code
    });
  }

  if (error.message === "Only image files are allowed") {
    return res.status(400).json({
      error: error.message
    });
  }

  sendApiError(res, error, "Server error");
});

/* -------------------------------------------------------
   Start Server
------------------------------------------------------- */

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Photos API: http://localhost:${PORT}/api/photos`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error("Stop the old server with Ctrl + C, or run:");
    console.error(`netstat -ano | findstr :${PORT}`);
    console.error("Then kill the shown PID with:");
    console.error("taskkill /PID YOUR_PID /F");
    process.exit(1);
  }

  throw error;
});