/** Domaine réservé (.invalid) des comptes créés sans e-mail : le client est identifié par son téléphone. */
export const NO_EMAIL_DOMAIN = 'sans-email.maxigadget.invalid';
export const emailForPhone = (phone: string) => `${phone.replace(/\D/g, '')}@${NO_EMAIL_DOMAIN}`;
export const hasRealEmail = (email: string) => !email.endsWith('@' + NO_EMAIL_DOMAIN);
