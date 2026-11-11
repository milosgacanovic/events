// Proxies whose X-Forwarded-For Fastify trusts (proxy-addr syntax): loopback
// and private ranges, i.e. Apache reaching the container through the Docker
// gateway and the web container's server-side fetches. Public addresses are
// never trusted, so a client-supplied X-Forwarded-For cannot pick its own IP:
// the rightmost untrusted hop (the one Apache appended) wins.
export const DEFAULT_TRUST_PROXY = "127.0.0.1/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16";
