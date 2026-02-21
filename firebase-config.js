// ========================================
// FIREBASE CONFIGURATION — SMILE.app
// ========================================

const firebaseConfig = {
  apiKey: "AIzaSyB5l8pl4jzcJAvPahEu4w0Ay1PyFwvCgnk",
  authDomain: "smile-theapp.firebaseapp.com",
  projectId: "smile-theapp",
  storageBucket: "smile-theapp.firebasestorage.app",
  messagingSenderId: "723824118344",
  appId: "1:723824118344:web:aea955f3258d212343e67d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

console.log('🔥 Firebase initialized — SMILE.app');
