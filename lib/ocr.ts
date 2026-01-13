/**
 * OCR (Optical Character Recognition) Module
 * Supports Tesseract.js for client-side OCR and AWS Textract for production
 */

// Types
export type OcrStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NOT_APPLICABLE';

export interface OcrResult {
    status: OcrStatus;
    text?: string;
    confidence?: number; // 0-100
    language?: string;
    processingTime?: number; // milliseconds
    error?: string;
    words?: OcrWord[];
}

export interface OcrWord {
    text: string;
    confidence: number;
    bounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export interface OcrConfig {
    enabled: boolean;
    provider: 'tesseract' | 'aws-textract' | 'azure-vision' | 'mock';
    languages: string[];
    tesseract?: {
        workerPath?: string;
        corePath?: string;
        langPath?: string;
    };
    awsTextract?: {
        region: string;
    };
}

// ============================================================================
// Configuration
// ============================================================================

export function getOcrConfig(): OcrConfig {
    const enabled = process.env.OCR_ENABLED !== 'false';
    const provider = (process.env.OCR_PROVIDER || 'mock') as OcrConfig['provider'];
    const languages = (process.env.OCR_LANGUAGES || 'eng').split(',').map(l => l.trim());

    return {
        enabled,
        provider,
        languages,
        awsTextract: provider === 'aws-textract' ? {
            region: process.env.AWS_REGION || 'us-east-1',
        } : undefined,
    };
}

// ============================================================================
// OCR Interface
// ============================================================================

export interface OcrProcessor {
    processImage(buffer: Buffer, mimeType: string): Promise<OcrResult>;
    processPdf(buffer: Buffer): Promise<OcrResult>;
    isAvailable(): Promise<boolean>;
}

// ============================================================================
// Tesseract.js OCR Processor
// ============================================================================

export class TesseractOcrProcessor implements OcrProcessor {
    private languages: string[];

    constructor(config: OcrConfig) {
        this.languages = config.languages;
    }

    async isAvailable(): Promise<boolean> {
        try {
            // Dynamic import to avoid loading Tesseract if not used
            await import('tesseract.js');
            return true;
        } catch {
            return false;
        }
    }

    async processImage(buffer: Buffer, mimeType: string): Promise<OcrResult> {
        const startTime = Date.now();

        try {
            const Tesseract = await import('tesseract.js');

            // Create worker
            const worker = await Tesseract.createWorker(this.languages.join('+'));

            // Recognize text
            const { data } = await worker.recognize(buffer);

            // Terminate worker
            await worker.terminate();

            const words: OcrWord[] = data.words?.map(word => ({
                text: word.text,
                confidence: word.confidence,
                bounds: word.bbox ? {
                    x: word.bbox.x0,
                    y: word.bbox.y0,
                    width: word.bbox.x1 - word.bbox.x0,
                    height: word.bbox.y1 - word.bbox.y0,
                } : undefined,
            })) || [];

            return {
                status: 'COMPLETED',
                text: data.text,
                confidence: data.confidence,
                language: this.languages[0],
                processingTime: Date.now() - startTime,
                words,
            };
        } catch (error) {
            return {
                status: 'FAILED',
                error: error instanceof Error ? error.message : 'Unknown OCR error',
                processingTime: Date.now() - startTime,
            };
        }
    }

    async processPdf(buffer: Buffer): Promise<OcrResult> {
        const startTime = Date.now();

        try {
            // For PDF processing, we need to convert pages to images first
            // This is a simplified implementation - production would use pdf-to-img
            const pdfParse = await import('pdf-parse');
            const data = await pdfParse.default(buffer);

            // If PDF has embedded text, return it directly
            if (data.text && data.text.trim().length > 0) {
                return {
                    status: 'COMPLETED',
                    text: data.text,
                    confidence: 100, // Embedded text is 100% accurate
                    processingTime: Date.now() - startTime,
                };
            }

            // For image-based PDFs, we would need to convert pages to images
            // and process each one. This requires additional libraries.
            return {
                status: 'FAILED',
                error: 'Image-based PDF OCR not implemented. Consider using AWS Textract for scanned documents.',
                processingTime: Date.now() - startTime,
            };
        } catch (error) {
            return {
                status: 'FAILED',
                error: error instanceof Error ? error.message : 'Unknown PDF processing error',
                processingTime: Date.now() - startTime,
            };
        }
    }
}

// ============================================================================
// AWS Textract Processor
// ============================================================================

export class AwsTextractProcessor implements OcrProcessor {
    private region: string;

    constructor(config: NonNullable<OcrConfig['awsTextract']>) {
        this.region = config.region;
    }

    async isAvailable(): Promise<boolean> {
        try {
            await import('@aws-sdk/client-textract');
            return !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
        } catch {
            return false;
        }
    }

    async processImage(buffer: Buffer, mimeType: string): Promise<OcrResult> {
        const startTime = Date.now();

        try {
            const { TextractClient, DetectDocumentTextCommand } = await import('@aws-sdk/client-textract');

            const client = new TextractClient({ region: this.region });

            const command = new DetectDocumentTextCommand({
                Document: {
                    Bytes: buffer,
                },
            });

            const response = await client.send(command);

            // Extract text from blocks
            const lines: string[] = [];
            const words: OcrWord[] = [];
            let totalConfidence = 0;
            let confidenceCount = 0;

            for (const block of response.Blocks || []) {
                if (block.BlockType === 'LINE' && block.Text) {
                    lines.push(block.Text);
                }
                if (block.BlockType === 'WORD' && block.Text) {
                    words.push({
                        text: block.Text,
                        confidence: block.Confidence || 0,
                        bounds: block.Geometry?.BoundingBox ? {
                            x: block.Geometry.BoundingBox.Left || 0,
                            y: block.Geometry.BoundingBox.Top || 0,
                            width: block.Geometry.BoundingBox.Width || 0,
                            height: block.Geometry.BoundingBox.Height || 0,
                        } : undefined,
                    });
                    if (block.Confidence) {
                        totalConfidence += block.Confidence;
                        confidenceCount++;
                    }
                }
            }

            return {
                status: 'COMPLETED',
                text: lines.join('\n'),
                confidence: confidenceCount > 0 ? totalConfidence / confidenceCount : undefined,
                processingTime: Date.now() - startTime,
                words,
            };
        } catch (error) {
            return {
                status: 'FAILED',
                error: error instanceof Error ? error.message : 'AWS Textract error',
                processingTime: Date.now() - startTime,
            };
        }
    }

    async processPdf(buffer: Buffer): Promise<OcrResult> {
        // AWS Textract supports PDF directly for DetectDocumentText
        return this.processImage(buffer, 'application/pdf');
    }
}

// ============================================================================
// Mock OCR Processor (for development/testing)
// ============================================================================

export class MockOcrProcessor implements OcrProcessor {
    async isAvailable(): Promise<boolean> {
        return true;
    }

    async processImage(buffer: Buffer, mimeType: string): Promise<OcrResult> {
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

        // Check if this is a test image with known content
        const content = buffer.toString('utf8', 0, Math.min(buffer.length, 500));

        if (content.includes('INVOICE') || content.includes('invoice')) {
            return this.generateMockInvoiceOcr();
        }

        if (content.includes('ID') || content.includes('LICENSE')) {
            return this.generateMockIdOcr();
        }

        return this.generateMockGenericOcr();
    }

    async processPdf(buffer: Buffer): Promise<OcrResult> {
        return this.processImage(buffer, 'application/pdf');
    }

    private generateMockInvoiceOcr(): OcrResult {
        return {
            status: 'COMPLETED',
            text: `INVOICE #12345
Date: 2024-01-15
 
Bill To:
ABC Company Ltd
123 Business Street
City, State 12345

Description                  Amount
Professional Services        $1,500.00
Consulting                   $2,500.00
                             ---------
Total                        $4,000.00

Payment Terms: Net 30`,
            confidence: 95.5,
            processingTime: 250,
        };
    }

    private generateMockIdOcr(): OcrResult {
        return {
            status: 'COMPLETED',
            text: `GOVERNMENT OF INDIA
IDENTITY CARD

Name: John Doe
ID Number: XXXX-XXXX-1234
Date of Birth: 01/01/1990
Address: 123 Main Street, City

Valid Until: 2030`,
            confidence: 92.3,
            processingTime: 180,
        };
    }

    private generateMockGenericOcr(): OcrResult {
        return {
            status: 'COMPLETED',
            text: 'Sample text extracted from document. This is mock OCR output for development purposes.',
            confidence: 88.0,
            processingTime: 150,
        };
    }
}

// ============================================================================
// OCR Factory
// ============================================================================

let ocrInstance: OcrProcessor | null = null;

export function getOcrProcessor(): OcrProcessor {
    if (ocrInstance) {
        return ocrInstance;
    }

    const config = getOcrConfig();

    if (!config.enabled) {
        // Return a processor that marks everything as not applicable
        ocrInstance = {
            async isAvailable() { return true; },
            async processImage() {
                return { status: 'NOT_APPLICABLE' as const };
            },
            async processPdf() {
                return { status: 'NOT_APPLICABLE' as const };
            },
        };
        return ocrInstance;
    }

    switch (config.provider) {
        case 'tesseract':
            ocrInstance = new TesseractOcrProcessor(config);
            break;
        case 'aws-textract':
            if (!config.awsTextract) {
                throw new Error('AWS Textract configuration is missing');
            }
            ocrInstance = new AwsTextractProcessor(config.awsTextract);
            break;
        case 'mock':
        default:
            ocrInstance = new MockOcrProcessor();
            break;
    }

    return ocrInstance;
}

export function resetOcrProcessor(): void {
    ocrInstance = null;
}

// ============================================================================
// High-Level API
// ============================================================================

/**
 * Determine if a file type supports OCR
 */
export function isOcrSupported(mimeType: string): boolean {
    const supportedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/tiff',
        'image/bmp',
        'application/pdf',
    ];
    return supportedTypes.includes(mimeType);
}

/**
 * Process a document for OCR
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<OcrResult> {
    if (!isOcrSupported(mimeType)) {
        return { status: 'NOT_APPLICABLE' };
    }

    const processor = getOcrProcessor();

    if (mimeType === 'application/pdf') {
        return processor.processPdf(buffer);
    }

    return processor.processImage(buffer, mimeType);
}

/**
 * Check if OCR service is available
 */
export async function isOcrAvailable(): Promise<boolean> {
    const processor = getOcrProcessor();
    return processor.isAvailable();
}

/**
 * Process document and return just the extracted text
 */
export async function extractTextSimple(buffer: Buffer, mimeType: string): Promise<string | null> {
    const result = await extractText(buffer, mimeType);

    if (result.status === 'COMPLETED' && result.text) {
        return result.text;
    }

    return null;
}
