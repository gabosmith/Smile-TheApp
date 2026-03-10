// SMILE.app — Firebase config
// Proyecto: smile-theapp (multi-tenant SaaS)
// Todas las clínicas creadas desde onboarding viven aquí.

const firebaseConfig = {
  apiKey: "AIzaSyB5l8pl4jzcJAvPahEu4w0Ay1PyFwvCgnk",
  authDomain: "smiledental.app",
  projectId: "smile-theapp",
  storageBucket: "smile-theapp.firebasestorage.app",
  messagingSenderId: "723824118344",
  appId: "1:723824118344:web:aea955f3258d212343e67d"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
