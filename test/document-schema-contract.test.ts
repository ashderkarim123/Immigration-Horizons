import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import contract from "../docs/architecture/document-schema-contract.json" with { type: "json" };

import { DocumentCategory } from "../src/lib/models/DocumentCategory";
import { CaseDocument } from "../src/lib/models/CaseDocument";
import { DocumentVersion } from "../src/lib/models/DocumentVersion";
import { DocumentRequest } from "../src/lib/models/DocumentRequest";
import { DocumentAccessLog } from "../src/lib/models/DocumentAccessLog";
import {
  CATEGORY_VISIBILITY,
  CATEGORY_ALLOWED_UPLOADER_TYPES,
  UPLOADED_BY_TYPE,
  DOCUMENT_VISIBILITY,
  DOCUMENT_STATUSES,
  SCAN_STATUSES,
  DOCUMENT_REQUEST_STATUSES,
  ACTIVE_REQUEST_STATUSES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_MAX_FILES_PER_REQUEST,
  DEFAULT_CATEGORY_TEMPLATE,
} from "../src/lib/content/document-constants";
import { LocalPrivateStorageProvider } from "../src/lib/documents/local-private-storage-provider";
import os from "os";

test("collection names match the contract", () => {
  assert.equal(DocumentCategory.collection.collectionName, contract.collections.DocumentCategory);
  assert.equal(CaseDocument.collection.collectionName, contract.collections.CaseDocument);
  assert.equal(DocumentVersion.collection.collectionName, contract.collections.DocumentVersion);
  assert.equal(DocumentRequest.collection.collectionName, contract.collections.DocumentRequest);
  assert.equal(DocumentAccessLog.collection.collectionName, contract.collections.DocumentAccessLog);
});

test("category/document/request enums match the contract", () => {
  assert.deepEqual(CATEGORY_VISIBILITY, contract.categoryVisibilityValues);
  assert.deepEqual(CATEGORY_ALLOWED_UPLOADER_TYPES, contract.categoryAllowedUploaderTypeValues);
  assert.deepEqual(UPLOADED_BY_TYPE, contract.uploadedByTypeValues);
  assert.deepEqual(DOCUMENT_VISIBILITY, contract.documentVisibilityValues);
  assert.deepEqual(DOCUMENT_STATUSES, contract.documentStatusValues);
  assert.deepEqual(SCAN_STATUSES, contract.scanStatusValues);
  assert.deepEqual(DOCUMENT_REQUEST_STATUSES, contract.documentRequestStatusValues);
  assert.deepEqual(ACTIVE_REQUEST_STATUSES, contract.activeRequestStatusValues);
});

test("upload allowlist matches the contract", () => {
  assert.deepEqual([...ALLOWED_MIME_TYPES], contract.allowedMimeTypes);
  assert.deepEqual([...ALLOWED_EXTENSIONS], contract.allowedExtensions);
  assert.equal(DEFAULT_MAX_FILE_SIZE_BYTES, contract.defaultMaxFileSizeBytes);
  assert.equal(DEFAULT_MAX_FILES_PER_REQUEST, contract.defaultMaxFilesPerRequest);
});

test("default category template keys and order match the contract", () => {
  const keysInOrder = [...DEFAULT_CATEGORY_TEMPLATE].sort((a, b) => a.order - b.order).map((t) => t.templateKey);
  assert.deepEqual(keysInOrder, contract.defaultCategoryTemplateKeys);
});

test("storage key format matches the contract — both apps must resolve a key to the same on-disk path (ADR-004 §3)", () => {
  const provider = new LocalPrivateStorageProvider(os.tmpdir());
  const key = provider.generateStorageKey();
  const pattern = new RegExp(contract.storageKeyPattern);
  assert.match(key, pattern);
});

test("required-field sets both apps rely on are present", () => {
  const requiredOnCategory = ["case", "name", "slug", "order", "visibility", "allowedUploaderTypes"];
  for (const field of requiredOnCategory) {
    assert.ok(DocumentCategory.schema.path(field), `DocumentCategory.${field} must exist`);
  }
  const requiredOnDocument = ["case", "workspace", "category", "uploadedByType", "storageKey", "checksum", "status", "visibility"];
  for (const field of requiredOnDocument) {
    assert.ok(CaseDocument.schema.path(field), `CaseDocument.${field} must exist`);
  }
  const requiredOnVersion = ["document", "versionNumber", "storageKey", "checksum", "uploadedByType"];
  for (const field of requiredOnVersion) {
    assert.ok(DocumentVersion.schema.path(field), `DocumentVersion.${field} must exist`);
  }
  const requiredOnRequest = ["case", "workspace", "category", "title", "requestedFrom", "requestedBy", "status"];
  for (const field of requiredOnRequest) {
    assert.ok(DocumentRequest.schema.path(field), `DocumentRequest.${field} must exist`);
  }
});
