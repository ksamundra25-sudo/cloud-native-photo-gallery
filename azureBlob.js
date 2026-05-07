require("dotenv").config();

const { BlobServiceClient } = require("@azure/storage-blob");
const path = require("path");

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER;

if (!connectionString) {
  throw new Error("Missing AZURE_STORAGE_CONNECTION_STRING in .env");
}

if (!containerName) {
  throw new Error("Missing AZURE_STORAGE_CONTAINER in .env");
}

if (!connectionString.startsWith("DefaultEndpointsProtocol=")) {
  throw new Error(
    "AZURE_STORAGE_CONNECTION_STRING must be the FULL connection string, not only the storage key"
  );
}

const blobServiceClient =
  BlobServiceClient.fromConnectionString(connectionString);

const containerClient =
  blobServiceClient.getContainerClient(containerName);

async function ensureContainer() {
  await containerClient.createIfNotExists({
    access: "blob",
  });
}

function buildBlobName(originalName = "file") {
  const ext = path.extname(originalName);
  const base = path
    .basename(originalName, ext)
    .replace(/[^\w.-]/g, "_");

  return `${Date.now()}-${base}${ext}`;
}

async function uploadBufferToBlob(buffer, originalName, mimeType) {
  await ensureContainer();

  const blobName = buildBlobName(originalName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: mimeType || "application/octet-stream",
    },
  });

  return {
    blobName,
    imageUrl: blockBlobClient.url,
  };
}

async function deleteBlobByUrl(blobUrl) {
  if (!blobUrl) return;

  try {
    const url = new URL(blobUrl);

    const blobName = decodeURIComponent(
      url.pathname.split("/").slice(2).join("/")
    );

    if (!blobName) return;

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
  } catch (error) {
    console.error("Failed to delete blob:", error.message);
  }
}

module.exports = {
  uploadBufferToBlob,
  deleteBlobByUrl,
  containerClient,
};