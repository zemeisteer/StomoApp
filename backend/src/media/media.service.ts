import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp, { Sharp, Metadata } from 'sharp';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DIMENSION = 4096; // 4096 px width/height
const MAX_PIXELS = 16_000_000; // 16 Megapixels

export interface ProcessedImageResult {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private s3Client: S3Client | null = null;
  private uploadDir: string;
  private s3Bucket: string;
  private s3PublicUrl: string;
  private storageDriver: 's3' | 'local';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.uploadDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const accessKey = this.configService.get<string>('S3_ACCESS_KEY');
    const secretKey = this.configService.get<string>('S3_SECRET_KEY');
    this.s3Bucket = this.configService.get<string>('S3_BUCKET', 'dentacare');
    this.s3PublicUrl = this.configService.get<string>('S3_PUBLIC_URL', 'http://localhost:9000/dentacare');

    const configuredDriver = (this.configService.get<string>('STORAGE_DRIVER') || '').toLowerCase();
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (configuredDriver === 's3') {
      if (!endpoint || !accessKey || !secretKey) {
        throw new Error(
          'S3 storage driver is configured but missing S3 credentials (S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY).',
        );
      }
      this.s3Client = new S3Client({
        endpoint,
        region: this.configService.get<string>('S3_REGION', 'us-east-1'),
        credentials: {
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
        },
        forcePathStyle: true,
      });
      this.storageDriver = 's3';
    } else if (configuredDriver === 'local') {
      this.storageDriver = 'local';
    } else {
      if (nodeEnv === 'production') {
        throw new Error(
          'STORAGE_DRIVER must be explicitly set to "s3" or "local" in production. Ephemeral fallback is prohibited.',
        );
      }
      this.storageDriver = 'local';
    }
  }

  /**
   * Rigorous magic bytes & raster image validation and normalization.
   * Disallows SVG, rejects spoofed headers, enforces dimension bounds,
   * and re-encodes image to strip active scripting / metadata exploits.
   */
  async validateAndProcessImage(file: Express.Multer.File): Promise<ProcessedImageResult> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Fayl tanlanmagan yoki bo\'sh');
    }

    if (file.size > MAX_SIZE_BYTES || file.buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException('Fayl hajmi 5MB dan oshmasligi kerak');
    }

    const buf = file.buffer;

    // 1. Check for SVG / XML signatures or content (Strict SVG rejection)
    const headerAscii = buf.slice(0, 1024).toString('ascii').toLowerCase();
    if (
      headerAscii.includes('<svg') ||
      headerAscii.includes('<?xml') ||
      headerAscii.includes('<!doctype svg') ||
      file.mimetype === 'image/svg+xml'
    ) {
      throw new BadRequestException(
        'SVG format xavfsizlik sababli qabul qilinmaydi. Faqat raster formatlar (JPEG, PNG, WebP) ruxsat etilgan.',
      );
    }

    // 2. Validate magic bytes
    let detectedFormat: 'jpeg' | 'png' | 'webp' | null = null;
    const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng =
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a;
    const isWebp =
      buf.length >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP';

    if (isJpeg) detectedFormat = 'jpeg';
    else if (isPng) detectedFormat = 'png';
    else if (isWebp) detectedFormat = 'webp';

    if (!detectedFormat) {
      throw new BadRequestException(
        'Faqat haqiqiy JPEG, PNG va WebP rasm fayllari qabul qilinadi. Fayl formati yoki signaturasi noto\'g\'ri.',
      );
    }

    // 3. Decode and check metadata with sharp
    let sharpInstance: Sharp;
    let metadata: Metadata;
    try {
      sharpInstance = sharp(buf, { failOn: 'error' });
      metadata = await sharpInstance.metadata();
    } catch (err: any) {
      throw new BadRequestException('Rasm fayli buzilgan yoki o\'qib bo\'lmadi');
    }

    if (!metadata.format || (metadata.format !== 'jpeg' && metadata.format !== 'png' && metadata.format !== 'webp')) {
      throw new BadRequestException('Fayl formati tasdiqlangan raster turlariga mos kelmadi');
    }

    const width = metadata.width || 0;
    const height = metadata.height || 0;
    if (width === 0 || height === 0) {
      throw new BadRequestException('Rasm o\'lchamlarini aniqlab bo\'lmadi');
    }

    if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
      throw new BadRequestException(
        `Rasm o'lchamlari ruxsat etilgan chegaradan oshib ketdi (Maksimal: ${MAX_DIMENSION}x${MAX_DIMENSION}px / 16MP)`,
      );
    }

    // 4. Re-encode raster image to strip dangerous metadata/payloads
    let processedBuffer: Buffer;
    let mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    let extension: 'jpg' | 'png' | 'webp';

    try {
      if (detectedFormat === 'jpeg') {
        processedBuffer = await sharpInstance.rotate().jpeg({ quality: 85, progressive: true }).toBuffer();
        mimeType = 'image/jpeg';
        extension = 'jpg';
      } else if (detectedFormat === 'png') {
        processedBuffer = await sharpInstance.rotate().png({ compressionLevel: 8 }).toBuffer();
        mimeType = 'image/png';
        extension = 'png';
      } else {
        processedBuffer = await sharpInstance.rotate().webp({ quality: 85 }).toBuffer();
        mimeType = 'image/webp';
        extension = 'webp';
      }
    } catch (err: any) {
      throw new BadRequestException('Rasmni qayta ishlashda xatolik yuz berdi');
    }

    return {
      buffer: processedBuffer,
      mimeType,
      extension,
      width,
      height,
    };
  }

  async saveFile(file: Express.Multer.File, category: string = 'general', altTextUz?: string, altTextRu?: string) {
    const processed = await this.validateAndProcessImage(file);

    // Derived extension strictly from validated format, not user original name
    const safeFileName = `${Date.now()}-${nanoid(12)}.${processed.extension}`;
    let fileUrl = '';
    const isProd = process.env.NODE_ENV === 'production';

    let localWrittenPath: string | null = null;
    let s3UploadedKey: string | null = null;

    if (this.storageDriver === 's3' && this.s3Client) {
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.s3Bucket,
            Key: safeFileName,
            Body: processed.buffer,
            ContentType: processed.mimeType,
          }),
        );
        s3UploadedKey = safeFileName;
        fileUrl = `${this.s3PublicUrl}/${safeFileName}`;
      } catch (err: any) {
        this.logger.error(`S3 upload error: ${err?.message}`);
        if (isProd) {
          throw new InternalServerErrorException(
            'Faylni S3 saqlash xizmatiga yuklab bo\'lmadi. Prod muhitida vaqtinchalik saqlash o\'chirilgan.',
          );
        }
      }
    }

    // Local fallback only if not in production or storage driver is local
    if (!s3UploadedKey) {
      if (isProd && this.storageDriver === 's3') {
        throw new InternalServerErrorException('S3 saqlash xizmati mavjud emas');
      }
      const localFilePath = path.join(this.uploadDir, safeFileName);
      fs.writeFileSync(localFilePath, processed.buffer);
      localWrittenPath = localFilePath;

      const appUrl = this.configService.get<string>('APP_URL', 'http://localhost:4000');
      fileUrl = `${appUrl}/api/admin/media/file/${safeFileName}`;
    }

    // Atomic DB record creation with cleanup on failure
    try {
      return await this.prisma.mediaAsset.create({
        data: {
          fileName: safeFileName,
          originalName: path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_'),
          mimeType: processed.mimeType,
          size: processed.buffer.length,
          url: fileUrl,
          category,
          altTextUz,
          altTextRu,
        },
      });
    } catch (dbErr: any) {
      this.logger.error(`Database asset record creation failed: ${dbErr?.message}. Cleaning up storage...`);
      // Cleanup orphan storage file
      if (s3UploadedKey && this.s3Client) {
        try {
          await this.s3Client.send(
            new DeleteObjectCommand({
              Bucket: this.s3Bucket,
              Key: s3UploadedKey,
            }),
          );
        } catch {}
      }
      if (localWrittenPath && fs.existsSync(localWrittenPath)) {
        try {
          fs.unlinkSync(localWrittenPath);
        } catch {}
      }
      throw new InternalServerErrorException('Fayl ma\'lumotlarini bazada saqlashda xatolik yuz berdi');
    }
  }

  async findAll(params: { category?: string; page?: number; limit?: number }) {
    const { category, page = 1, limit = 50 } = params;
    const where: any = {};
    if (category) where.category = category;

    const [items, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
      // Also provide items property for legacy callers
      items,
    };
  }

  async getLocalFile(fileName: string): Promise<{ filePath: string; mimeType: string }> {
    // Prevent directory traversal: allow only strictly alphanumeric, dash, underscore, and dot
    const sanitized = path.basename(fileName);
    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(sanitized)) {
      throw new BadRequestException('Noto\'g\'ri fayl nomi');
    }

    const filePath = path.join(this.uploadDir, sanitized);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Fayl topilmadi');
    }

    const ext = path.extname(sanitized).toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';

    return { filePath, mimeType };
  }

  async delete(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Fayl topilmadi');

    // Remove from local disk if exists
    const localPath = path.join(this.uploadDir, asset.fileName);
    if (fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
      } catch {}
    }

    // Remove from S3 if configured
    if (this.s3Client) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.s3Bucket,
            Key: asset.fileName,
          }),
        );
      } catch {}
    }

    return this.prisma.mediaAsset.delete({ where: { id } });
  }
}
