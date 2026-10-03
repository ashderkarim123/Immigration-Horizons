// Explicit shutdown also releases Next development workers on Windows.
export default async function teardown() {
  await fetch("http://localhost:3180/__browser_shutdown", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}
