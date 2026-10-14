import { Global, HttpStatus, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import { AppError } from './http';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Sous /api : en hébergement cPanel, seul ce chemin est confié à l'application Node.js. */
export const UPLOADS_URL = '/api/uploads';

/** Formats acceptés, reconnus par leur signature binaire (le type annoncé par le navigateur n'est pas fiable). */
function detect(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Adresses privées, locales ou réservées (IPv4 et IPv6). */
function isPrivateAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
}

/**
 * Stockage local des images (dossier UPLOAD_DIR, servi sous /uploads).
 * À remplacer par Cloudinary/S3 pour un hébergement à plusieurs serveurs.
 */
@Injectable()
export class UploadsService {
  private logger = new Logger('Uploads');
  readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOAD_DIR') ?? 'uploads');
  }

  async saveImage(file: Express.Multer.File | undefined, folder: 'products' | 'categories') {
    if (!file?.buffer?.length) throw new AppError(HttpStatus.BAD_REQUEST, 'FILE_REQUIRED', 'Aucune image reçue');
    return this.saveBuffer(file.buffer, folder);
  }

  async saveBuffer(buffer: Buffer, folder: 'products' | 'categories') {
    if (buffer.length > MAX_UPLOAD_BYTES) throw new AppError(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE', 'Image trop lourde (5 Mo maximum)');
    const ext = detect(buffer);
    if (!ext) throw new AppError(HttpStatus.BAD_REQUEST, 'FILE_TYPE', 'Format accepté : JPG, PNG ou WebP');
    const name = `${randomUUID()}.${ext}`;
    await mkdir(join(this.root, folder), { recursive: true });
    await writeFile(join(this.root, folder, name), buffer, { flag: 'wx' });
    return { key: `${folder}/${name}`, url: `${UPLOADS_URL}/${folder}/${name}` };
  }

  /**
   * Télécharge une image depuis une adresse https publique (import de catalogue fournisseur).
   * Refuse les adresses internes (protection SSRF), limite la taille et la durée, vérifie le format réel.
   */
  async fetchImage(url: string, folder: 'products' | 'categories') {
    let u: URL;
    try { u = new URL(url); } catch { throw new Error('adresse invalide'); }
    if (u.protocol !== 'https:') throw new Error('seules les adresses https sont acceptées');
    const { address } = await lookup(u.hostname);
    if (isPrivateAddress(address)) throw new Error('adresse interne refusée');
    const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'MaxiGadget-import/1.0' } });
    if (!res.ok || !res.body) throw new Error(`réponse ${res.status}`);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) throw new Error('image de plus de 5 Mo');
      chunks.push(Buffer.from(chunk));
    }
    return this.saveBuffer(Buffer.concat(chunks), folder);
  }

  /** Supprime un fichier envoyé ici ; ignore les autres adresses (photos du site, futurs fichiers Cloudinary). */
  async removeByUrl(url: string | null | undefined) {
    if (!url?.startsWith(UPLOADS_URL + '/')) return;
    const path = resolve(this.root, url.slice(UPLOADS_URL.length + 1));
    if (!path.startsWith(this.root + '/')) return;
    await unlink(path).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') this.logger.warn(`Suppression impossible : ${path}`); });
  }
}

@Global()
@Module({ providers: [UploadsService], exports: [UploadsService] })
export class UploadsModule {}
