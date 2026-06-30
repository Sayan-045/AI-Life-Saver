import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";

// The actual provisioned configuration for the applet
const firebaseConfig = {
  apiKey: "AIzaSyAyqczsN-3eQa4hSs7B0uWzRXNWog8RKP4",
  authDomain: "deft-crowbar-s6d0h.firebaseapp.com",
  projectId: "deft-crowbar-s6d0h",
  storageBucket: "deft-crowbar-s6d0h.firebasestorage.app",
  messagingSenderId: "362351694101",
  appId: "1:362351694101:web:6787c020e0deaa6f9dd91c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Initialize Firestore with the custom database ID provisioned for this applet
const databaseId = "ai-studio-lifesaver-69491534-30ee-4391-940c-b64f4b284669";
export const db = getFirestore(app, databaseId);

// Validate Firestore connection on boot (Prerequisite Pattern from firebase-integration skill)
async function validateConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error: any) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration or connection state.");
    }
  }
}
validateConnection();
