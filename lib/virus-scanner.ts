/**
 * Virus Scanner Integration
 * Supports ClamAV daemon and cloud-based virus scanning
 */

// Types
export type ScanStatus = 'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED';

export interface ScanResult {
    status: ScanStatus;
    isInfected: boolean;
    virusName?: string;
    details?: string;
    scannedAt: Date;
    scanDuration?: number; // milliseconds
}

export interface VirusScannerConfig {
    enabled: boolean;
    provider: 'clamav' | 'windows-defender' | 'mock';
    clamav?: {
        host: string;
        port: number;
        timeout: number;
    };
}

// ============================================================================
// Configuration
// ============================================================================

export function getVirusScannerConfig(): VirusScannerConfig {
    const enabled = process.env.VIRUS_SCAN_ENABLED !== 'false';
    const provider = (process.env.VIRUS_SCAN_PROVIDER || 'mock') as VirusScannerConfig['provider'];

    return {
        enabled,
        provider,
        clamav: provider === 'clamav' ? {
            host: process.env.CLAMAV_HOST || 'localhost',
            port: parseInt(process.env.CLAMAV_PORT || '3310', 10),
            timeout: parseInt(process.env.VIRUS_SCAN_TIMEOUT || '60000', 10),
        } : undefined,
    };
}

// ============================================================================
// Scanner Interface
// ============================================================================

export interface VirusScanner {
    scan(buffer: Buffer, fileName: string): Promise<ScanResult>;
    isAvailable(): Promise<boolean>;
}

// ============================================================================
// ClamAV Scanner (requires clamscan daemon running)
// ============================================================================

import * as net from 'net';

export class ClamAVScanner implements VirusScanner {
    private host: string;
    private port: number;
    private timeout: number;

    constructor(config: NonNullable<VirusScannerConfig['clamav']>) {
        this.host = config.host;
        this.port = config.port;
        this.timeout = config.timeout;
    }

    async isAvailable(): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(5000);

            socket.connect(this.port, this.host, () => {
                socket.write('PING\0');
            });

            socket.on('data', (data) => {
                const response = data.toString().trim();
                socket.destroy();
                resolve(response === 'PONG');
            });

            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
        });
    }

    async scan(buffer: Buffer, fileName: string): Promise<ScanResult> {
        const startTime = Date.now();

        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(this.timeout);

            let response = '';

            socket.connect(this.port, this.host, () => {
                // Use INSTREAM to scan data from stream
                const size = Buffer.alloc(4);
                size.writeUInt32BE(buffer.length, 0);

                socket.write('zINSTREAM\0');
                socket.write(size);
                socket.write(buffer);
                socket.write(Buffer.alloc(4)); // Zero-length chunk to end stream
            });

            socket.on('data', (data) => {
                response += data.toString();
            });

            socket.on('end', () => {
                const scanDuration = Date.now() - startTime;
                const result = this.parseResponse(response, scanDuration);
                resolve(result);
            });

            socket.on('error', (err) => {
                socket.destroy();
                resolve({
                    status: 'FAILED',
                    isInfected: false,
                    details: `ClamAV connection error: ${err.message}`,
                    scannedAt: new Date(),
                    scanDuration: Date.now() - startTime,
                });
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve({
                    status: 'FAILED',
                    isInfected: false,
                    details: 'ClamAV scan timeout',
                    scannedAt: new Date(),
                    scanDuration: Date.now() - startTime,
                });
            });
        });
    }

    private parseResponse(response: string, scanDuration: number): ScanResult {
        const trimmed = response.trim();

        if (trimmed.includes('OK')) {
            return {
                status: 'CLEAN',
                isInfected: false,
                scannedAt: new Date(),
                scanDuration,
            };
        }

        if (trimmed.includes('FOUND')) {
            // Parse virus name from response like "stream: Eicar-Test-Signature FOUND"
            const match = trimmed.match(/stream:\s*(.+)\s*FOUND/);
            const virusName = match ? match[1].trim() : 'Unknown';

            return {
                status: 'INFECTED',
                isInfected: true,
                virusName,
                details: trimmed,
                scannedAt: new Date(),
                scanDuration,
            };
        }

        return {
            status: 'FAILED',
            isInfected: false,
            details: `Unexpected response: ${trimmed}`,
            scannedAt: new Date(),
            scanDuration,
        };
    }
}

// ============================================================================
// Mock Scanner (for development/testing)
// ============================================================================

export class MockVirusScanner implements VirusScanner {
    // EICAR test signature for testing virus detection
    private readonly EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

    async isAvailable(): Promise<boolean> {
        return true;
    }

    async scan(buffer: Buffer, fileName: string): Promise<ScanResult> {
        const startTime = Date.now();

        // Simulate scan delay
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

        const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1000));
        const scanDuration = Date.now() - startTime;

        // Check for EICAR test signature
        if (content.includes(this.EICAR_SIGNATURE) || content.includes('EICAR')) {
            return {
                status: 'INFECTED',
                isInfected: true,
                virusName: 'Eicar-Test-Signature',
                details: 'EICAR test file detected',
                scannedAt: new Date(),
                scanDuration,
            };
        }

        // Check for suspicious patterns (basic heuristics for testing)
        const suspiciousPatterns = [
            'malware-test',
            'virus-test',
            'trojan-test',
        ];

        for (const pattern of suspiciousPatterns) {
            if (content.toLowerCase().includes(pattern) || fileName.toLowerCase().includes(pattern)) {
                return {
                    status: 'INFECTED',
                    isInfected: true,
                    virusName: `Test-${pattern}`,
                    details: `Suspicious pattern detected: ${pattern}`,
                    scannedAt: new Date(),
                    scanDuration,
                };
            }
        }

        return {
            status: 'CLEAN',
            isInfected: false,
            scannedAt: new Date(),
            scanDuration,
        };
    }
}

// ============================================================================
// Scanner Factory
// ============================================================================

let scannerInstance: VirusScanner | null = null;

export function getVirusScanner(): VirusScanner {
    if (scannerInstance) {
        return scannerInstance;
    }

    const config = getVirusScannerConfig();

    if (!config.enabled) {
        // Return a pass-through scanner that always returns clean
        scannerInstance = {
            async isAvailable() { return true; },
            async scan(buffer, fileName) {
                return {
                    status: 'CLEAN' as const,
                    isInfected: false,
                    details: 'Virus scanning disabled',
                    scannedAt: new Date(),
                };
            },
        };
        return scannerInstance;
    }

    switch (config.provider) {
        case 'clamav':
            if (!config.clamav) {
                throw new Error('ClamAV configuration is missing');
            }
            scannerInstance = new ClamAVScanner(config.clamav);
            break;
        case 'mock':
        default:
            scannerInstance = new MockVirusScanner();
            break;
    }

    return scannerInstance;
}

export function resetVirusScanner(): void {
    scannerInstance = null;
}

// ============================================================================
// High-Level API
// ============================================================================

/**
 * Scan a file buffer and return the result
 */
export async function scanFile(buffer: Buffer, fileName: string): Promise<ScanResult> {
    const scanner = getVirusScanner();
    return scanner.scan(buffer, fileName);
}

/**
 * Check if virus scanning service is available
 */
export async function isVirusScanAvailable(): Promise<boolean> {
    const scanner = getVirusScanner();
    return scanner.isAvailable();
}

/**
 * Scan a file and throw if infected
 */
export async function scanFileOrThrow(buffer: Buffer, fileName: string): Promise<ScanResult> {
    const result = await scanFile(buffer, fileName);

    if (result.isInfected) {
        throw new VirusDetectedError(
            `Virus detected in file "${fileName}": ${result.virusName || 'Unknown virus'}`,
            result
        );
    }

    if (result.status === 'FAILED') {
        throw new ScanFailedError(
            `Virus scan failed for file "${fileName}": ${result.details || 'Unknown error'}`,
            result
        );
    }

    return result;
}

// ============================================================================
// Custom Errors
// ============================================================================

export class VirusDetectedError extends Error {
    public readonly scanResult: ScanResult;

    constructor(message: string, scanResult: ScanResult) {
        super(message);
        this.name = 'VirusDetectedError';
        this.scanResult = scanResult;
    }
}

export class ScanFailedError extends Error {
    public readonly scanResult: ScanResult;

    constructor(message: string, scanResult: ScanResult) {
        super(message);
        this.name = 'ScanFailedError';
        this.scanResult = scanResult;
    }
}
