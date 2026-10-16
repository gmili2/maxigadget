import proxyaddr from 'proxy-addr';

/** Plages d'adresses de Cloudflare (https://www.cloudflare.com/ips/), relevées le 16/10/2026. */
const CLOUDFLARE = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];
const isCloudflare = proxyaddr.compile(CLOUDFLARE);

/**
 * Réglage « trust proxy » d'Express : le serveur web de l'hébergement (premier relais) est toujours cru,
 * puis Cloudflare s'il est devant le site. req.ip est ainsi l'adresse du visiteur, et non celle d'un
 * serveur Cloudflare partagé par des milliers de clients (les limites par adresse resteraient sinon bloquées).
 */
export const trustProxy = (addr: string, hop: number) => hop === 0 || isCloudflare(addr, hop);
