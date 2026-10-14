import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères'),
  FRONTEND_URL: z.string().min(1).transform((s) => s.split(',').map((u) => u.trim()).filter(Boolean)),
  // Coordonnées affichées au client qui choisit le virement bancaire (facultatives).
  BANK_HOLDER: z.string().optional(),
  BANK_NAME: z.string().optional(),
  BANK_RIB: z.string().optional(),
  UPLOAD_DIR: z.string().default('uploads'),
  // Boutique en accès privé : si défini, il faut ce code pour voir le catalogue et commander.
  SITE_ACCESS_CODE: z.string().min(6, 'SITE_ACCESS_CODE : 6 caractères minimum').optional(),
  // E-mails de commande via Resend (facultatif : sans clé, rien n'est envoyé).
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('MaxiGadget <onboarding@resend.dev>'),
  // Adresse(s) de la boutique prévenue(s) à chaque commande, séparées par des virgules.
  ORDER_NOTIFY_EMAIL: z.string().optional(),
  // Pixel Meta (Facebook) des campagnes publicitaires : identifiant numérique, facultatif.
  FB_PIXEL_ID: z.string().regex(/^\d{5,20}$/, 'FB_PIXEL_ID : identifiant numérique du pixel').optional(),
});

export type Env = z.infer<typeof schema>;

/** Valide les variables d'environnement au démarrage : l'application refuse de démarrer si une valeur manque. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${lines}`);
  }
  return parsed.data;
}
