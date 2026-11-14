export const ENV = {
  get geminiApiKey() { return process.env.GEMINI_API_KEY ?? ""; },
  get adminPasscode() { return process.env.QEBULFIT_ADMIN_PASSCODE ?? ""; },
  get sessionSecret() { return process.env.SESSION_SECRET ?? ""; },
  get storageDir() { return process.env.STORAGE_DIR ?? ""; },
  get s3Bucket() { return process.env.S3_BUCKET ?? ""; },
  get s3Endpoint() { return process.env.S3_ENDPOINT ?? ""; },
  get s3Region() { return process.env.S3_REGION ?? "auto"; },
  get s3AccessKeyId() { return process.env.S3_ACCESS_KEY_ID ?? ""; },
  get s3SecretAccessKey() { return process.env.S3_SECRET_ACCESS_KEY ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
};
