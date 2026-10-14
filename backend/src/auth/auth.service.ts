import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppError } from '../common/http';
import { hashPassword, verifyPassword } from '../common/password';
import { PrismaService } from '../prisma.service';

export const REFRESH_TTL_DAYS = 14;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

type Meta = { userAgent?: string; ip?: string };
const publicUser = (u: { id: string; email: string; firstName: string; lastName: string; role: string }) =>
  ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role });

@Injectable()
export class AuthService {
  /** Hash factice, vérifié quand l'email est inconnu pour garder un temps de réponse constant. */
  private dummyHash = hashPassword(randomBytes(16).toString('hex'));

  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  static hashPassword(password: string) { return hashPassword(password); }

  async login(email: string, password: string, meta: Meta) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = await verifyPassword(user?.passwordHash ?? (await this.dummyHash), password);
    if (!user || !ok || user.deletedAt) throw new AppError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect');
    if (user.status !== 'ACTIVE') throw new AppError(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'Compte suspendu');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const refreshToken = await this.createSession(user.id, randomUUID(), meta);
    return { user: publicUser(user), accessToken: await this.sign(user), refreshToken };
  }

  /** Rotation : l'ancien refresh token est révoqué ; s'il est rejoué, toute la famille de sessions est révoquée. */
  async refresh(token: string | undefined, meta: Meta) {
    const invalid = new AppError(HttpStatus.UNAUTHORIZED, 'INVALID_REFRESH_TOKEN', 'Session expirée, reconnectez-vous');
    if (!token) throw invalid;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session) throw invalid;
    if (session.revokedAt) {
      await this.prisma.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw invalid;
    }
    const { user } = session;
    if (session.expiresAt < new Date() || user.status !== 'ACTIVE' || user.deletedAt) throw invalid;

    const raw = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      // Révocation conditionnelle : deux refresh simultanés ne peuvent pas réussir tous les deux.
      const { count } = await tx.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (!count) throw invalid;
      const next = await tx.session.create({ data: this.sessionData(user.id, session.familyId, raw, meta) });
      await tx.session.update({ where: { id: session.id }, data: { replacedById: next.id } });
    });
    return { user: publicUser(user), accessToken: await this.sign(user), refreshToken: raw };
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.prisma.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async me(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Session expirée');
    return publicUser(user);
  }

  private sign(u: { id: string; email: string; role: string }) {
    return this.jwt.signAsync({ sub: u.id, email: u.email, role: u.role });
  }

  private async createSession(userId: string, familyId: string, meta: Meta) {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.session.create({ data: this.sessionData(userId, familyId, raw, meta) });
    return raw;
  }

  private sessionData(userId: string, familyId: string, raw: string, meta: Meta) {
    return {
      userId, familyId, tokenHash: sha256(raw), userAgent: meta.userAgent?.slice(0, 255), ip: meta.ip?.slice(0, 45),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
    };
  }
}
