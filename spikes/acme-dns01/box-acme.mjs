// The box's side: its own account key and TLS key, a CSR for its hostname,
// and the DNS-01 challenge answered through the registry's challenge
// service. The private key never leaves this process.
import acme from "acme-client";

acme.setLogger((message) => console.log(`acme: ${message}`));

export async function obtainCertificate({
  directoryUrl,
  hostname,
  challengeServiceUrl,
  accountKey,
  accountUrl,
}) {
  // The box keeps its account URL from install, so a renewal never registers again.
  const client = new acme.Client({
    directoryUrl,
    accountKey,
    ...(accountUrl ? { accountUrl } : {}),
  });
  const [tlsKey, csr] = await acme.crypto.createCsr({ commonName: hostname, altNames: [hostname] });
  const started = performance.now();
  const certificate = await client.auto({
    csr,
    termsOfServiceAgreed: true,
    challengePriority: ["dns-01"],
    // The box's own resolver cannot see the project zone's test records; the
    // CA's validation is the check that counts.
    skipChallengeVerification: true,
    challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
      if (challenge.type !== "dns-01") throw new Error(`unexpected challenge ${challenge.type}`);
      await fetch(`${challengeServiceUrl}/challenge`, {
        method: "POST",
        body: JSON.stringify({ hostname, value: keyAuthorization }),
      });
    },
    challengeRemoveFn: async () => {
      await fetch(`${challengeServiceUrl}/challenge`, {
        method: "DELETE",
        body: JSON.stringify({ hostname }),
      });
    },
  });
  return {
    certificate,
    tlsKey,
    accountUrl: client.getAccountUrl(),
    ms: Math.round(performance.now() - started),
  };
}
