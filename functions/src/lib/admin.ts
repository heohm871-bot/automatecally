import admin from "firebase-admin";

export function getAdmin() {
  if (!admin.apps.length) admin.initializeApp();
  return admin;
}

export function db() {
  return getAdmin().firestore();
}

export function bucket() {
  const override = process.env.CONTENT_BUCKET;
  if (override && override.trim()) {
    return getAdmin().storage().bucket(override.trim());
  }
  return getAdmin().storage().bucket();
}
