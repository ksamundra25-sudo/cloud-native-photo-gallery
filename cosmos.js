"use strict";

const { randomUUID } = require("crypto");

const LOGIC_APP_TIMEOUT_MS = Number(process.env.LOGIC_APP_TIMEOUT_MS || 30000);

class LogicAppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "LogicAppError";
    this.code = options.code || "LOGIC_APP_ERROR";
    this.status = options.status || 500;
    this.operation = options.operation;
    this.logicAppStatus = options.logicAppStatus;
    this.logicAppStatusText = options.logicAppStatusText;
    this.responseBody = options.responseBody;
    this.cause = options.cause;
  }
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new LogicAppError(`Missing required environment variable: ${name}`, {
      code: "MISSING_ENV",
      status: 500,
    });
  }

  return value.trim();
}

function optionalEnv(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function ensureFetchAvailable() {
  if (typeof fetch !== "function") {
    throw new LogicAppError(
      "fetch() is not available. Use Node.js 18+.",
      {
        code: "FETCH_NOT_AVAILABLE",
        status: 500,
      }
    );
  }
}

function safeJsonParse(text) {
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapLogicAppBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  if (Object.prototype.hasOwnProperty.call(value, "body")) {
    return value.body;
  }

  return value;
}

async function postToLogicApp(operation, url, payload = {}, options = {}) {
  ensureFetchAvailable();

  console.log(`Calling ${operation} Logic App with payload:`, payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOGIC_APP_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);

    throw new LogicAppError(`${operation} Logic App request failed`, {
      code: "LOGIC_APP_REQUEST_FAILED",
      status: 502,
      operation,
      cause: error,
    });
  }

  clearTimeout(timeout);

  const rawText = await response.text();
  const parsedBody = safeJsonParse(rawText);
  const unwrappedBody = unwrapLogicAppBody(parsedBody);

  console.log(`${operation} Logic App status:`, response.status);
  console.log(`${operation} Logic App response:`, unwrappedBody);

  if (!response.ok) {
    throw new LogicAppError(`${operation} Logic App returned HTTP ${response.status}`, {
      code: "LOGIC_APP_HTTP_ERROR",
      status: response.status,
      operation,
      logicAppStatus: response.status,
      logicAppStatusText: response.statusText,
      responseBody: parsedBody || rawText,
    });
  }

  if (unwrappedBody === undefined && options.allowEmptyResponse !== true) {
    throw new LogicAppError(
      `${operation} Logic App returned an empty response.`,
      {
        code: "LOGIC_APP_EMPTY_RESPONSE",
        status: 502,
        operation,
      }
    );
  }

  return unwrappedBody;
}

function normalizeCategory(category) {
  if (category === undefined || category === null) return "";
  return String(category).trim();
}

function normalizePhoto(photo) {
  const value = unwrapLogicAppBody(photo);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  return {
    ...value,
    id: value.id !== undefined && value.id !== null ? String(value.id) : value.id,
    title: value.title ?? "",
    description: value.description ?? "",
    category: value.category ?? "",
    imageUrl: value.imageUrl ?? value.imageURL ?? value.url ?? "",
    createdAt: value.createdAt ?? value.created_at ?? null,
    updatedAt: value.updatedAt ?? value.updated_at ?? null,
  };
}

function normalizePhotoArray(result) {
  const data = unwrapLogicAppBody(result);

  if (Array.isArray(data)) {
    return data.map(normalizePhoto);
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  if (Array.isArray(data.photos)) return data.photos.map(normalizePhoto);
  if (Array.isArray(data.items)) return data.items.map(normalizePhoto);
  if (Array.isArray(data.documents)) return data.documents.map(normalizePhoto);
  if (Array.isArray(data.Documents)) return data.Documents.map(normalizePhoto);
  if (Array.isArray(data.value)) return data.value.map(normalizePhoto);
  if (Array.isArray(data.result)) return data.result.map(normalizePhoto);

  if (data.id) {
    return [normalizePhoto(data)];
  }

  return [];
}

function extractSinglePhoto(result, fallback) {
  const data = unwrapLogicAppBody(result);

  if (!data) {
    return normalizePhoto(fallback);
  }

  if (Array.isArray(data)) {
    return normalizePhoto(data[0] || fallback);
  }

  if (typeof data === "object") {
    return normalizePhoto(
      data.photo ||
        data.item ||
        data.document ||
        data.Document ||
        data.result ||
        data
    );
  }

  return normalizePhoto(fallback);
}

function buildCreatePayload(photo = {}) {
  const payload = { ...photo };

  payload.id = payload.id ? String(payload.id) : randomUUID();
  payload.title = payload.title ? String(payload.title).trim() : "Untitled";
  payload.description = payload.description ? String(payload.description).trim() : "";
  payload.category = normalizeCategory(payload.category);
  payload.imageUrl = payload.imageUrl ? String(payload.imageUrl).trim() : "";
  payload.createdAt = payload.createdAt || new Date().toISOString();

  if (!payload.category) {
    throw new LogicAppError(
      "createPhoto requires category because Cosmos partition key is /category",
      {
        code: "PARTITION_KEY_REQUIRED",
        status: 400,
      }
    );
  }

  if (!payload.imageUrl) {
    throw new LogicAppError("createPhoto requires imageUrl", {
      code: "IMAGE_URL_REQUIRED",
      status: 400,
    });
  }

  return payload;
}

async function getAllPhotos() {
  const url = requireEnv("LOGIC_READ");

  const result = await postToLogicApp("READ", url, {});

  return normalizePhotoArray(result);
}

async function getPhotoById(id) {
  if (!id) {
    throw new LogicAppError("getPhotoById requires id", {
      code: "ID_REQUIRED",
      status: 400,
    });
  }

  const photos = await getAllPhotos();
  return photos.find((photo) => String(photo.id) === String(id)) || null;
}

async function createPhoto(photo) {
  const url = requireEnv("LOGIC_CREATE");
  const payload = buildCreatePayload(photo);

  const result = await postToLogicApp("CREATE", url, payload);

  return extractSinglePhoto(result, payload);
}

async function updatePhoto(id, updates = {}) {
  if (!id) {
    throw new LogicAppError("updatePhoto requires id", {
      code: "ID_REQUIRED",
      status: 400,
    });
  }

  const url = requireEnv("LOGIC_UPDATE");

  const payload = {
    ...updates,
    id: String(id),
    updatedAt: new Date().toISOString(),
  };

  payload.category = normalizeCategory(payload.category);

  if (!payload.category) {
    const existing = await getPhotoById(id);

    if (existing && existing.category) {
      payload.category = existing.category;
    }
  }

  if (!payload.category) {
    throw new LogicAppError(
      "updatePhoto requires category because Cosmos partition key is /category",
      {
        code: "PARTITION_KEY_REQUIRED",
        status: 400,
      }
    );
  }

  const result = await postToLogicApp("UPDATE", url, payload);

  return extractSinglePhoto(result, payload);
}

async function deletePhoto(id, category) {
  if (!id) {
    throw new LogicAppError("deletePhoto requires id", {
      code: "ID_REQUIRED",
      status: 400,
    });
  }

  const url = optionalEnv("LOGIC_DELETE");

  if (!url) {
    throw new LogicAppError(
      "Delete Logic App is not configured yet. Set LOGIC_DELETE when ready.",
      {
        code: "DELETE_NOT_CONFIGURED",
        status: 501,
      }
    );
  }

  let partitionKey = normalizeCategory(category);

  if (!partitionKey) {
    const existing = await getPhotoById(id);

    if (existing && existing.category) {
      partitionKey = existing.category;
    }
  }

  if (!partitionKey) {
    throw new LogicAppError(
      "deletePhoto requires category because Cosmos partition key is /category",
      {
        code: "PARTITION_KEY_REQUIRED",
        status: 400,
      }
    );
  }

  const payload = {
    id: String(id),
    category: partitionKey,
  };

  const result = await postToLogicApp("DELETE", url, payload, {
    allowEmptyResponse: true,
  });

  return result || {
    success: true,
    id: payload.id,
    category: payload.category,
  };
}

module.exports = {
  getAllPhotos,
  getPhotoById,
  createPhoto,
  updatePhoto,
  deletePhoto,
  LogicAppError,
};