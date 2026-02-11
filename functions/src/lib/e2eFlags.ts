export function isE2eSkipStorage() {
  return process.env.E2E_SKIP_STORAGE === "1";
}

export function isE2eSkipExternalFetch() {
  return process.env.E2E_SKIP_EXTERNAL_FETCH === "1" || isE2eSkipStorage();
}
