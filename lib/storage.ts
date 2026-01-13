/**
 * Cloud Storage Abstraction Layer
 * Supports AWS S3 and Azure Blob Storage with a unified interface
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
// Note: Azure SDK import would be: import { BlobServiceClient } from '@azure/storage-blob';

// Types
export interface StorageUploadResult {
    url: string;
    path: string;
    etag?: string;
}

export interface StorageMetadata {
    contentType: string;
    tenantId: string;
    caseId: string;
    documentId: string;
    fileName: string;
    encryptionKey?: string;
    [key: string]: string | undefined;
}

export interface StorageProvider {
    uploadFile(buffer: Buffer, key: string, metadata: StorageMetadata): Promise<StorageUploadResult>;
    downloadFile(key: string): Promise<Buffer>;
    deleteFile(key: string): Promise<void>;
    generatePresignedUrl(key: string, expiresIn: number): Promise<string>;
    copyFile(sourceKey: string, destKey: string): Promise<void>;
}

// Configuration
export interface StorageConfig {
    provider: 's3' | 'azure' | 'local';
    s3?: {
        region: string;
        bucket: string;
        accessKeyId: string;
        secretAccessKey: string;
        endpoint?: string;
    };
    azure?: {
        connectionString: string;
        containerName: string;
    };
    local?: {
        basePath: string;
    };
}

// Get storage configuration from environment
export function getStorageConfig(): StorageConfig {
    const provider = (process.env.STORAGE_PROVIDER || 'local') as 's3' | 'azure' | 'local';

    return {
        provider,
        s3: provider === 's3' ? {
            region: process.env.AWS_REGION || 'us-east-1',
            bucket: process.env.AWS_S3_BUCKET || '',
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            endpoint: process.env.AWS_S3_ENDPOINT,
        } : undefined,
        azure: provider === 'azure' ? {
            connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
            containerName: process.env.AZURE_STORAGE_CONTAINER || 'documents',
        } : undefined,
        local: provider === 'local' ? {
            basePath: process.env.LOCAL_STORAGE_PATH || './uploads',
        } : undefined,
    };
}

// Generate storage path for a document
export function generateStoragePath(
    tenantId: string,
    caseId: string,
    documentId: string,
    fileName: string
): string {
    // Sanitize filename to prevent path traversal
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${tenantId}/documents/${caseId}/${documentId}/${sanitizedFileName}`;
}

// ============================================================================
// AWS S3 Storage Provider
// ============================================================================

export class S3StorageProvider implements StorageProvider {
    private client: S3Client;
    private bucket: string;

    constructor(config: NonNullable<StorageConfig['s3']>) {
        this.client = new S3Client({
            region: config.region,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
            endpoint: config.endpoint,
        });
        this.bucket = config.bucket;
    }

    async uploadFile(buffer: Buffer, key: string, metadata: StorageMetadata): Promise<StorageUploadResult> {
        // Convert metadata to S3 metadata format (all values must be strings)
        const s3Metadata: Record<string, string> = {};
        for (const [k, v] of Object.entries(metadata)) {
            if (v !== undefined) {
                s3Metadata[k] = String(v);
            }
        }

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: metadata.contentType,
            Metadata: s3Metadata,
            ServerSideEncryption: 'AES256', // Enable SSE-S3 encryption
        });

        const result = await this.client.send(command);

        return {
            url: `https://${this.bucket}.s3.amazonaws.com/${key}`,
            path: key,
            etag: result.ETag,
        };
    }

    async downloadFile(key: string): Promise<Buffer> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        const response = await this.client.send(command);

        if (!response.Body) {
            throw new Error('Empty response body from S3');
        }

        // Convert stream to buffer
        const chunks: Uint8Array[] = [];
        const stream = response.Body as AsyncIterable<Uint8Array>;
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }

    async deleteFile(key: string): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        await this.client.send(command);
    }

    async generatePresignedUrl(key: string, expiresIn: number = 900): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        return getSignedUrl(this.client, command, { expiresIn });
    }

    async copyFile(sourceKey: string, destKey: string): Promise<void> {
        const command = new CopyObjectCommand({
            Bucket: this.bucket,
            CopySource: `${this.bucket}/${sourceKey}`,
            Key: destKey,
        });

        await this.client.send(command);
    }
}

// ============================================================================
// Azure Blob Storage Provider
// ============================================================================

export class AzureStorageProvider implements StorageProvider {
    private connectionString: string;
    private containerName: string;

    constructor(config: NonNullable<StorageConfig['azure']>) {
        this.connectionString = config.connectionString;
        this.containerName = config.containerName;
    }

    async uploadFile(buffer: Buffer, key: string, metadata: StorageMetadata): Promise<StorageUploadResult> {
        // Dynamic import for Azure SDK (only when needed)
        const { BlobServiceClient } = await import('@azure/storage-blob');

        const blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
        const containerClient = blobServiceClient.getContainerClient(this.containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(key);

        await blockBlobClient.upload(buffer, buffer.length, {
            blobHTTPHeaders: {
                blobContentType: metadata.contentType,
            },
            metadata: Object.fromEntries(
                Object.entries(metadata)
                    .filter(([_, v]) => v !== undefined)
                    .map(([k, v]) => [k, String(v)])
            ),
        });

        return {
            url: blockBlobClient.url,
            path: key,
        };
    }

    async downloadFile(key: string): Promise<Buffer> {
        const { BlobServiceClient } = await import('@azure/storage-blob');

        const blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
        const containerClient = blobServiceClient.getContainerClient(this.containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(key);

        const response = await blockBlobClient.downloadToBuffer();
        return response;
    }

    async deleteFile(key: string): Promise<void> {
        const { BlobServiceClient } = await import('@azure/storage-blob');

        const blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
        const containerClient = blobServiceClient.getContainerClient(this.containerName);
        await containerClient.getBlockBlobClient(key).delete();
    }

    async generatePresignedUrl(key: string, expiresIn: number = 900): Promise<string> {
        const { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } = await import('@azure/storage-blob');

        const blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
        const containerClient = blobServiceClient.getContainerClient(this.containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(key);

        // Generate SAS token with read permission
        const expiresOn = new Date(Date.now() + expiresIn * 1000);
        const permissions = BlobSASPermissions.parse('r');

        // Note: This requires proper credential extraction from connection string
        // For production, use a more robust SAS generation method
        const sasUrl = blockBlobClient.generateSasUrl({
            expiresOn,
            permissions,
        });

        return sasUrl;
    }

    async copyFile(sourceKey: string, destKey: string): Promise<void> {
        const { BlobServiceClient } = await import('@azure/storage-blob');

        const blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
        const containerClient = blobServiceClient.getContainerClient(this.containerName);

        const sourceBlob = containerClient.getBlockBlobClient(sourceKey);
        const destBlob = containerClient.getBlockBlobClient(destKey);

        await destBlob.beginCopyFromURL(sourceBlob.url);
    }
}

// ============================================================================
// Local File Storage Provider (for development/testing)
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export class LocalStorageProvider implements StorageProvider {
    private basePath: string;

    constructor(config: NonNullable<StorageConfig['local']>) {
        this.basePath = config.basePath;
    }

    private getFullPath(key: string): string {
        return path.join(this.basePath, key);
    }

    async uploadFile(buffer: Buffer, key: string, _metadata: StorageMetadata): Promise<StorageUploadResult> {
        const fullPath = this.getFullPath(key);

        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        // Write file
        await fs.writeFile(fullPath, buffer);

        // Store metadata as a sidecar JSON file
        const metadataPath = `${fullPath}.meta.json`;
        await fs.writeFile(metadataPath, JSON.stringify(_metadata, null, 2));

        return {
            url: `file://${fullPath}`,
            path: key,
        };
    }

    async downloadFile(key: string): Promise<Buffer> {
        const fullPath = this.getFullPath(key);
        return fs.readFile(fullPath);
    }

    async deleteFile(key: string): Promise<void> {
        const fullPath = this.getFullPath(key);
        await fs.unlink(fullPath).catch(() => { }); // Ignore if not exists
        await fs.unlink(`${fullPath}.meta.json`).catch(() => { });
    }

    async generatePresignedUrl(key: string, expiresIn: number = 900): Promise<string> {
        // For local storage, generate a signed token that can be verified
        const fullPath = this.getFullPath(key);
        const expiresAt = Date.now() + expiresIn * 1000;
        const secret = process.env.LOCAL_STORAGE_SECRET || 'dev-secret';

        const payload = `${key}:${expiresAt}`;
        const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

        // Return a URL that can be used with a local file serving endpoint
        return `/api/documents/file?key=${encodeURIComponent(key)}&expires=${expiresAt}&sig=${signature}`;
    }

    async copyFile(sourceKey: string, destKey: string): Promise<void> {
        const sourcePath = this.getFullPath(sourceKey);
        const destPath = this.getFullPath(destKey);

        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.copyFile(sourcePath, destPath);

        // Copy metadata too
        try {
            const metaData = await fs.readFile(`${sourcePath}.meta.json`);
            await fs.writeFile(`${destPath}.meta.json`, metaData);
        } catch {
            // Metadata file might not exist
        }
    }
}

// ============================================================================
// Storage Factory
// ============================================================================

let storageInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
    if (storageInstance) {
        return storageInstance;
    }

    const config = getStorageConfig();

    switch (config.provider) {
        case 's3':
            if (!config.s3) {
                throw new Error('S3 configuration is missing');
            }
            storageInstance = new S3StorageProvider(config.s3);
            break;
        case 'azure':
            if (!config.azure) {
                throw new Error('Azure configuration is missing');
            }
            storageInstance = new AzureStorageProvider(config.azure);
            break;
        case 'local':
        default:
            storageInstance = new LocalStorageProvider(config.local || { basePath: './uploads' });
            break;
    }

    return storageInstance;
}

// Reset storage instance (useful for testing)
export function resetStorageProvider(): void {
    storageInstance = null;
}

// Utility: Validate file is within size limits
export function validateFileSize(size: number, maxSizeMB: number = 50): boolean {
    return size <= maxSizeMB * 1024 * 1024;
}

// Utility: Validate file MIME type
export function validateMimeType(mimeType: string, allowedTypes?: string[]): boolean {
    const defaultAllowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/jpg',
        'image/gif',
        'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];

    const allowed = allowedTypes || defaultAllowedTypes;
    return allowed.includes(mimeType);
}

// Utility: Generate checksum for file integrity
export function generateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}
