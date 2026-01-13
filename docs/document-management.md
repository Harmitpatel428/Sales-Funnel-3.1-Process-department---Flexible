# Document Management System Documentation

## Overview
The Document Management System (DMS) provides enterprise-grade document handling, including secure storage, encryption, virus scanning, and OCR capabilities.

## Architecture

### 1. Database Schema
- **Document**: Stores metadata, encryption info, and storage paths.
- **DocumentVersion**: Tracks file history.
- **DocumentAccessLog**: Audit trail for all document access/actions.

### 2. Storage System (`lib/storage.ts`)
- **Abstract Provider**: Supports AWS S3, Azure Blob Storage, and Local File System.
- **Pre-signed URLs**: Secure, time-limited access to files.

### 3. Security
- **Encryption** (`lib/document-encryption.ts`):
  - AES-256-GCM encryption for file content.
  - Unique encryption key per document.
  - Master key (KMS/Vault) required to unwrap document keys.
- **Virus Scanning** (`lib/virus-scanner.ts`):
  - ClamAV integration.
  - Scans files before storage.

### 4. OCR (`lib/ocr.ts`)
- Tesseract.js (or AWS Textract) integration.
- Extracts text from images and PDFs for searchability.

### 5. API Routes
- `GET /api/documents`: List/Search documents.
- `POST /api/documents`: Upload new document.
- `GET /api/documents/[id]`: Get details/versions.
- `GET /api/documents/[id]/download`: Get secure download URL.
- `PATCH /api/documents/[id]`: Update metadata.
- `POST /api/documents/[id]/verify`: Mark as verified.
- `POST /api/documents/[id]/reject`: Mark as rejected.
- `POST /api/documents/[id]/versions`: Upload new version.
- `GET /api/documents/templates`: Get document checklist.

## Configuration

### Environment Variables
See `.env.example` for full list. Key variables:
- `STORAGE_PROVIDER`: `aws` | `azure` | `local`
- `AWS_S3_BUCKET` / `AZURE_STORAGE_CONTAINER`
- `DOCUMENT_MASTER_KEY`: 32-byte hex string for encryption.
- `VIRUS_SCAN_ENABLED`: `true` | `false`

### Permissions
New permissions added:
- `documents.upload`
- `documents.view.all` / `documents.view.case`
- `documents.verify`
- `documents.download`

## Setup
1. **Migrations**: Run `npx prisma migrate dev`.
2. **Seed**: Run `npx prisma db seed` to setup permissions.
3. **Environment**: Configure `.env`.
4. **Dependencies**: `npm install` (see package.json).

## Testing
- Run `npm run test` (if available).
- Use postman or the frontend UI to verify uploads.
