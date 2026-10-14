import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
];

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class MediaService {
  private s3Client: S3Client | null = null;
  private uploadDir: string;
  private s3Bucket: string;
  private s3PublicUrl: string;

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

    if (endpoint && accessKey && secretKey) {
      this.s3Client = new S3Client({
        endpoint,
        region: this.configService.get<string>('S3_REGION', 'us-east-1'),
        credentials: {
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
        },
        forcePathStyle: true,
      });
    }
  }

  async saveFile(file: Express.Multer.File, category: string = 'general', altTextUz?: string, altTextRu?: string) {
    if (!file) {
      throw new BadRequestException('Fayl tanlanmagan');
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Faqat ruxsat etilgan rasm formatlari yuklanishi mumkin (JPEG, PNG, WebP, SVG)');
    }

    // Validate Size
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('Fayl hajmi 5MB dan oshmasligi kerak');
    }

    // Generate safe unique filename
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const safeFileName = `${Date.now()}-${nanoid(12)}${ext}`;

    let fileUrl = '';

    // Try S3 first, fallback to local disk
    let s3Success = false;
    if (this.s3Client) {
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.s3Bucket,
            Key: safeFileName,
            Body: file.buffer,
            ContentType: file.mimetype,
          }),
        );
        fileUrl = `${this.s3PublicUrl}/${safeFileName}`;
        s3Success = true;
      } catch (err) {
        console.warn('S3 upload unavailable, falling back to local storage:', (err as any)?.message);
      }
    }

    if (!s3Success) {
      const localFilePath = path.join(this.uploadDir, safeFileName);
      fs.writeFileSync(localFilePath, file.buffer);
      const appUrl = this.configService.get<string>('APP_URL', 'http://localhost:4000');
      fileUrl = `${appUrl}/uploads/${safeFileName}`;
    }

    // Save record to database
    return this.prisma.mediaAsset.create({
      data: {
        fileName: safeFileName,
        originalName: path.basename(file.originalname),
        mimeType: file.mimetype,
        size: file.size,
        url: fileUrl,
        category,
        altTextUz,
        altTextRu,
      },
    });
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

    return { items, total, page, limit };
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

    // Try remove from S3
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
