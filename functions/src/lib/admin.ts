import admin from "firebase-admin";

export function getAdmin() {
  if (!admin.apps.length) admin.initializeApp();
  return admin;
}

export function db() {
  return getAdmin().firestore();
}

export function bucket() {
  return getAdmin().storage().bucket();
}
