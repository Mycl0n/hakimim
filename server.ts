import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import bodyParser from 'body-parser';
import admin from 'firebase-admin';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
let firebaseConfig: any = {};
try {
  const configPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else {
    console.warn("firebase-applet-config.json not found");
  }
} catch (err) {
  console.error("Failed to load Firebase config:", err);
}

// Initialize Firebase Admin
let adminDb: any;
try {
  if (firebaseConfig.projectId) {
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
    adminDb = admin.firestore(admin.apps[0]);
    console.log("Firebase Admin initialized successfully");
  }
} catch (err) {
  console.error("Firebase Admin initialization failed:", err);
}

// VAPID Keys
const keys = webpush.generateVAPIDKeys();
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || keys.publicKey;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || keys.privateKey;

try {
  webpush.setVapidDetails(
    'mailto:ardabuyukaslan1@gmail.com',
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
} catch (err) {
  console.error("Web Push setup failed:", err);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(bodyParser.json());

  const subscriptions: any[] = [];

  app.get('/api/vapid-public-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC });
  });

  app.post('/api/subscribe', (req, res) => {
    const subscription = req.body;
    subscriptions.push(subscription);
    res.status(201).json({});
  });

  // Watch Firestore
  if (adminDb) {
    try {
      adminDb.collection('cases').onSnapshot((snapshot: any) => {
        snapshot.docChanges().forEach((change: any) => {
          if (change.type === 'modified' || change.type === 'added') {
            const caseData = change.doc.data();
            const payload = JSON.stringify({
              title: "Dijital Kadı Güncellemesi",
              body: `"${caseData.subject}" davasında yeni bir gelişme var!`,
              icon: "/icon-192.png",
              data: { url: `/?case=${change.doc.id}` }
            });

            subscriptions.forEach(sub => {
              webpush.sendNotification(sub, payload).catch(err => {
                console.error("Push error:", err);
              });
            });
          }
        });
      }, (err: any) => {
        console.error("Firestore snapshot error:", err);
      });
    } catch (err) {
      console.error("Firestore watch failed:", err);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log("Vite middleware added");
    } catch (err) {
      console.error("Failed to load Vite middleware:", err);
      // Fallback to serving dist if vite fails
      app.use(express.static(path.join(__dirname, 'dist')));
    }
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu http://localhost:${PORT} üzerinde çalışıyor...`);
  });
}

startServer();
