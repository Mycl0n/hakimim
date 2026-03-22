import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gavel, 
  Scale, 
  User, 
  MessageSquare, 
  ChevronRight, 
  RotateCcw, 
  ShieldAlert,
  ShieldCheck,
  FileText,
  Stamp,
  LogIn,
  LogOut,
  Plus,
  History,
  Share2,
  Copy,
  Check
} from 'lucide-react';
import { Step, CaseData, Verdict } from './types';
import { generateCrossExamQuestions, generateVerdict } from './services/geminiService';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  FirebaseUser,
  handleFirestoreError,
  OperationType,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from './firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';

const INITIAL_CASE: CaseData = {
  subject: '',
  status: 'setup',
  party1: { name: '', defense: '', isAnswerSaved: false },
  party2: { name: '', email: '', defense: '', isAnswerSaved: false },
  isLocal: false,
  createdBy: ''
};

// Error Boundary Component
function ErrorBoundary({ error, onRetry }: { error: string, onRetry: () => void }) {
  let displayMessage = "Bir hata oluştu.";
  try {
    const parsed = JSON.parse(error);
    if (parsed.error) displayMessage = parsed.error;
  } catch {
    displayMessage = error;
  }

  return (
    <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-800 space-y-4">
      <div className="flex items-center gap-2 font-bold">
        <ShieldAlert size={20} />
        <span>Hata Oluştu</span>
      </div>
      <p className="text-sm italic">{displayMessage}</p>
      <button 
        onClick={onRetry}
        className="px-4 py-2 bg-red-800 text-white rounded-lg text-sm font-medium hover:bg-red-900 transition-colors"
      >
        Tekrar Dene
      </button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [step, setStep] = useState<Step>('intro');
  const [dashboardView, setDashboardView] = useState<'main' | 'my_cases' | 'incoming_cases' | 'history'>('main');
  const [caseData, setCaseData] = useState<CaseData>(INITIAL_CASE);
  const [activeCases, setActiveCases] = useState<CaseData[]>([]);
  const [pastCases, setPastCases] = useState<CaseData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const stepRef = React.useRef<Step>(step);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Auth Form State
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'google'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Save user to Firestore
        try {
          await setDoc(doc(db, 'users', u.uid), {
            uid: u.uid,
            displayName: u.displayName,
            email: u.email,
            photoURL: u.photoURL,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${u.uid}`);
        }
        setStep('dashboard');
        setDashboardView('main');
      } else {
        setStep('intro');
      }
    });
    return () => unsubscribe();
  }, []);

  // Cases Listener
  useEffect(() => {
    if (!user || !user.email) return;

    // 1. Active Cases (Created by me OR against me, not verdict)
    const qMyActive = query(
      collection(db, 'cases'),
      where('createdBy', '==', user.uid),
      where('status', '!=', 'verdict')
    );
    const qIncomingActive = query(
      collection(db, 'cases'),
      where('party2.email', '==', user.email),
      where('status', '!=', 'verdict')
    );

    const unsubMy = onSnapshot(qMyActive, (snapshot) => {
      const cases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CaseData));
      setActiveCases(prev => {
        const combined = [...cases, ...prev.filter(c => c.party2.email === user.email && c.createdBy !== user.uid)];
        return Array.from(new Map(combined.map(item => [item.id, item])).values())
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cases'));

    const unsubIncoming = onSnapshot(qIncomingActive, (snapshot) => {
      const cases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CaseData));
      setActiveCases(prev => {
        const combined = [...cases, ...prev.filter(c => c.createdBy === user.uid)];
        return Array.from(new Map(combined.map(item => [item.id, item])).values())
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cases'));

    // 2. Past Cases (All finished cases where I'm involved)
    const qPast1 = query(
      collection(db, 'cases'),
      where('createdBy', '==', user.uid),
      where('status', '==', 'verdict')
    );
    const qPast2 = query(
      collection(db, 'cases'),
      where('party2.email', '==', user.email),
      where('status', '==', 'verdict')
    );

    const unsubPast1 = onSnapshot(qPast1, (snap) => {
      const cases = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CaseData));
      setPastCases(prev => {
        const combined = [...cases, ...prev.filter(c => c.party2.email === user.email && c.createdBy !== user.uid)];
        return Array.from(new Map(combined.map(item => [item.id, item])).values())
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cases'));

    const unsubPast2 = onSnapshot(qPast2, (snap) => {
      const cases = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CaseData));
      setPastCases(prev => {
        const combined = [...cases, ...prev.filter(c => c.createdBy === user.uid)];
        return Array.from(new Map(combined.map(item => [item.id, item])).values())
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cases'));

    return () => {
      unsubMy();
      unsubIncoming();
      unsubPast1();
      unsubPast2();
    };
  }, [user]);

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Helper to convert VAPID key
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Request Notification Permission and Subscribe to Push
  const requestNotificationPermission = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;
      
      // Get VAPID public key from server
      const response = await fetch('/api/vapid-public-key');
      const { publicKey } = await response.json();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      // Send subscription to server
      await fetch('/api/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
        headers: { 'Content-Type': 'application/json' }
      });

      setNotificationsEnabled(true);
    } catch (err) {
      console.error("Subscription failed:", err);
    }
  };

  useEffect(() => {
    if ("Notification" in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Real-time Case Sync
  useEffect(() => {
    if (!caseData.id) return;
    const unsubscribe = onSnapshot(doc(db, 'cases', caseData.id), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as CaseData;
        
        setCaseData(prev => {
          // Preserve local unsaved changes during real-time sync
          const isParty1 = user?.uid === data.party1.uid;
          const isParty2 = user?.uid === data.party2.uid;

          const updatedParty1 = { ...data.party1 };
          const updatedParty2 = { ...data.party2 };

          if (isParty1) {
            if (stepRef.current === 'defense1' && !data.party1.defense) updatedParty1.defense = prev.party1.defense;
            if (stepRef.current === 'cross_exam_questions' && !data.party1.isAnswerSaved) updatedParty1.answer = prev.party1.answer;
          }
          if (isParty2) {
            if (stepRef.current === 'defense2' && !data.party2.defense) updatedParty2.defense = prev.party2.defense;
            if (stepRef.current === 'cross_exam_questions' && !data.party2.isAnswerSaved) updatedParty2.answer = prev.party2.answer;
          }

          return { 
            ...data, 
            id: snapshot.id,
            party1: updatedParty1,
            party2: updatedParty2
          };
        });

        // Auto-advance step if remote update happens
        if (data.status !== stepRef.current && data.status !== 'waiting') {
          setStep(data.status);
        }
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `cases/${caseData.id}`);
    });
    return () => unsubscribe();
  }, [caseData.id, user?.uid]);

  // Handle URL Case ID (Joining a case)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('case');
    if (caseId && isAuthReady && user) {
      loadCase(caseId);
    }
  }, [isAuthReady, user]);

  const loadCase = async (id: string) => {
    setLoading(true);
    try {
      const docRef = doc(db, 'cases', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as CaseData;
        setCaseData({ id: snap.id, ...data });
        setStep(data.status);
        
        // If I am party2 and haven't joined yet
        if (data.createdBy !== user?.uid && !data.party2.uid) {
          await updateDoc(docRef, {
            'party2.uid': user?.uid,
            'party2.name': user?.displayName || 'Davalı',
            updatedAt: serverTimestamp()
          });
        }
      } else {
        setError('Dava bulunamadı.');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `cases/${id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError('Giriş başarısız oldu.');
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    reset();
  };

  const syncCase = useCallback(async (updates: any) => {
    if (!caseData.id) return;
    try {
      await updateDoc(doc(db, 'cases', caseData.id), {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `cases/${caseData.id}`);
    }
  }, [caseData.id]);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        displayName,
        email,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      setError(err.message || 'Kayıt başarısız.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err.message || 'Giriş başarısız.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const questions = await generateCrossExamQuestions(caseData);
      await syncCase({
        status: 'cross_exam_questions',
        'party1.question': questions.party1Question,
        'party2.question': questions.party2Question
      });
      setStep('cross_exam_questions');
    } catch (err) {
      console.error("Hata detayı:", err);
      setError(err instanceof Error ? err.message : 'Baki Bey\'in tansiyonu çıktı, bir daha dene evladım.');
    } finally {
      setLoading(false);
    }
  }, [caseData, syncCase]);

  const handleGenerateVerdict = useCallback(async () => {
    setLoading(true);
    try {
      const verdict = await generateVerdict(caseData);
      await syncCase({
        status: 'verdict',
        verdict: verdict
      });
      setStep('verdict');
    } catch (err) {
      console.error("Karar hatası:", err);
      setError(err instanceof Error ? err.message : 'Karar defteri kayboldu, tekrar hüküm iste.');
    } finally {
      setLoading(false);
    }
  }, [caseData, syncCase]);

  // Auto-generate verdict when entering cross_exam_answers
  useEffect(() => {
    if (step === 'cross_exam_answers' && user?.uid === caseData.createdBy && !caseData.verdict && !loading && !error) {
      handleGenerateVerdict();
    }
  }, [step, user?.uid, caseData.createdBy, !!caseData.verdict, loading, !!error, handleGenerateVerdict]);

  const handleNext = useCallback(async () => {
    if (step === 'intro') return; // Handled by forms
    else if (step === 'dashboard') {
      setCaseData({ ...INITIAL_CASE, createdBy: user?.uid || '', party1: { ...INITIAL_CASE.party1, name: user?.displayName || '' } });
      setStep('setup');
    }
    else if (step === 'setup') {
      if (!caseData.subject || !caseData.party1.name || !caseData.party2.name) {
        setError('Evladım, isimleri ve konuyu boş geçemezsin!');
        return;
      }
      const isLocal = !caseData.party2.email;
      setError(null);
      setLoading(true);
      try {
        const docRef = await addDoc(collection(db, 'cases'), {
          ...caseData,
          isLocal,
          status: 'defense1',
          party1: { ...caseData.party1, uid: user?.uid || null },
          createdBy: user?.uid || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setCaseData(prev => ({ ...prev, id: docRef.id, status: 'defense1', isLocal }));
        setStep('defense1');
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'cases');
      } finally {
        setLoading(false);
      }
    }
    else if (step === 'defense1') {
      if (!caseData.party1.defense) {
        setError('Savunma yapmadan nereye? Konuş evladım!');
        return;
      }
      setError(null);
      await syncCase({ status: 'defense2', 'party1.defense': caseData.party1.defense });
      setStep('defense2');
    }
    else if (step === 'defense2') {
      if (!caseData.party2.defense) {
        setError('Sıra sende, dök içini!');
        return;
      }
      setError(null);
      await syncCase({ 'party2.defense': caseData.party2.defense });
      handleGenerateQuestions();
    }
    else if (step === 'cross_exam_answers') {
      if (!caseData.party1.answer || !caseData.party2.answer) {
        setError('Sorulara cevap vermeden hüküm çıkmaz!');
        return;
      }
      setError(null);
      await syncCase({ 
        'party1.answer': caseData.party1.answer,
        'party2.answer': caseData.party2.answer
      });
      handleGenerateVerdict();
    }
  }, [step, user, caseData, syncCase, handleGenerateQuestions, handleGenerateVerdict]);

  const handleSaveAnswer = async () => {
    setLoading(true);
    try {
      if (user?.uid === caseData.party1.uid) {
        if (!caseData.party1.answer) {
          setError('Cevabını yazmadan kaydedemezsin!');
          return;
        }
        setError(null);
        await syncCase({ 'party1.answer': caseData.party1.answer, 'party1.isAnswerSaved': true });
      } else if (user?.uid === caseData.party2.uid) {
        if (!caseData.party2.answer) {
          setError('Cevabını yazmadan kaydedemezsin!');
          return;
        }
        setError(null);
        await syncCase({ 'party2.answer': caseData.party2.answer, 'party2.isAnswerSaved': true });
      }
    } catch (err) {
      setError('Cevap kaydedilemedi, tekrar dene.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setCaseData(INITIAL_CASE);
    setStep(user ? 'dashboard' : 'intro');
    setError(null);
    window.history.replaceState({}, '', window.location.pathname);
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?case=${caseData.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isMyTurn = () => {
    if (caseData.isLocal) return true;
    if (step === 'defense1') return user?.uid === caseData.party1.uid;
    if (step === 'defense2') return user?.uid === caseData.party2.uid;
    return true;
  };

  if (!isAuthReady) return null;

  return (
    <div className="min-h-screen bg-[#F5F2ED] text-[#1A1A1A] font-sans selection:bg-[#5A5A40] selection:text-white">
      {/* Background Texture */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')]"></div>

      {/* Header */}
      {user && (
        <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-black/5 z-50 px-4 sm:px-6 py-2 sm:py-3 flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-4">
            {step !== 'dashboard' && (
              <button 
                onClick={reset}
                className="p-2 hover:bg-black/5 rounded-full transition-colors text-[#5A5A40]"
                title="Ana Sayfaya Dön"
              >
                <RotateCcw size={18} className="-rotate-90" />
              </button>
            )}
            <div className="flex items-center gap-2 font-serif italic text-[#5A5A40]">
              <Gavel size={18} className="sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base font-bold">Dijital Kadı</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {step === 'dashboard' && !notificationsEnabled && (
              <button 
                onClick={requestNotificationPermission}
                className="flex items-center gap-2 text-[9px] sm:text-[10px] font-bold text-[#5A5A40]/40 hover:text-[#5A5A40] transition-colors uppercase tracking-widest"
              >
                <ShieldAlert size={12} /> Bildirimleri Aç
              </button>
            )}
            <div className="flex items-center gap-2">
              {user.photoURL && <img src={user.photoURL} alt="" className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border border-black/10" />}
              <span className="text-xs sm:text-sm font-medium hidden xs:inline truncate max-w-[80px] sm:max-w-none">{user.displayName}</span>
            </div>
            <button onClick={handleLogout} className="p-1.5 sm:p-2 text-[#5A5A40] hover:bg-black/5 rounded-full transition-colors">
              <LogOut size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        </header>
      )}

      <main className="relative max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 min-h-screen flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {step === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-8"
            >
              <div className="inline-block p-4 bg-white rounded-full shadow-sm border border-black/5 mb-4">
                <Gavel size={48} className="text-[#5A5A40]" />
              </div>
              <h1 className="text-5xl font-serif font-light tracking-tight">
                Hakimim: <span className="italic">Dijital Kadı</span>
              </h1>
              
              <div className="max-w-sm mx-auto bg-white p-8 rounded-3xl shadow-sm border border-black/5 space-y-6">
                {authMode === 'google' ? (
                  <div className="space-y-4">
                    <button
                      onClick={handleLogin}
                      className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#4A4A30] transition-colors"
                    >
                      <LogIn size={20} /> GOOGLE İLE GİRİŞ
                    </button>
                    <button
                      onClick={() => setAuthMode('login')}
                      className="w-full py-4 border-2 border-[#5A5A40] text-[#5A5A40] rounded-xl font-medium hover:bg-[#5A5A40] hover:text-white transition-all"
                    >
                      E-POSTA İLE GİRİŞ
                    </button>
                  </div>
                ) : (
                  <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailSignup} className="space-y-4 text-left">
                    <h2 className="text-xl font-serif text-center mb-4">
                      {authMode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
                    </h2>
                    {authMode === 'signup' && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#5A5A40] uppercase">Ad Soyad</label>
                        <input
                          type="text"
                          required
                          value={displayName}
                          onChange={e => setDisplayName(e.target.value)}
                          className="w-full p-3 bg-[#F5F2ED] rounded-xl outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#5A5A40] uppercase">E-Posta</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full p-3 bg-[#F5F2ED] rounded-xl outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#5A5A40] uppercase">Şifre</label>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full p-3 bg-[#F5F2ED] rounded-xl outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                      />
                    </div>
                    {error && <p className="text-red-600 text-xs italic">{error}</p>}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-[#5A5A40] text-white rounded-xl font-medium disabled:opacity-50"
                    >
                      {loading ? 'Bekleyiniz...' : (authMode === 'login' ? 'GİRİŞ YAP' : 'KAYIT OL')}
                    </button>
                    <div className="text-center text-sm">
                      <button
                        type="button"
                        onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                        className="text-[#5A5A40] underline"
                      >
                        {authMode === 'login' ? 'Hesabın yok mu? Kayıt ol' : 'Zaten hesabın var mı? Giriş yap'}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAuthMode('google')}
                      className="w-full text-xs text-[#5A5A40]/60 hover:text-[#5A5A40]"
                    >
                      Geri Dön
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          )}

          {step === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="text-3xl font-serif">Selamun Aleyküm, {user?.displayName?.split(' ')[0]}</h2>
                <p className="text-[#5A5A40]">Baki Bey'in huzuruna hoş geldin.</p>
              </div>

              {dashboardView === 'main' ? (
                <div className="grid gap-4">
                  <button
                    onClick={() => handleNext()}
                    className="group bg-white p-8 rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all text-left flex items-center gap-6"
                  >
                    <div className="p-4 bg-[#5A5A40] text-white rounded-2xl group-hover:scale-110 transition-transform">
                      <Plus size={32} />
                    </div>
                    <div>
                      <h3 className="text-xl font-serif font-bold">Dava Aç</h3>
                      <p className="text-sm text-[#5A5A40]/60">Yeni bir adalet arayışı başlat.</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setDashboardView('incoming_cases')}
                    className="group bg-white p-6 sm:p-8 rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all text-left flex items-center gap-4 sm:gap-6"
                  >
                    <div className="p-3 sm:p-4 bg-amber-600 text-white rounded-2xl group-hover:scale-110 transition-transform">
                      <ShieldAlert size={28} className="sm:w-8 sm:h-8" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg sm:text-xl font-serif font-bold">Davaları Gör</h3>
                      <p className="text-xs sm:text-sm text-[#5A5A40]/60">Aktif davalarını gör ve savunma yap.</p>
                    </div>
                    {activeCases.length > 0 && (
                      <span className="bg-red-500 text-white text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1 rounded-full animate-bounce">
                        {activeCases.length} AKTİF
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setDashboardView('history')}
                    className="group bg-white p-6 sm:p-8 rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all text-left flex items-center gap-4 sm:gap-6"
                  >
                    <div className="p-3 sm:p-4 bg-slate-600 text-white rounded-2xl group-hover:scale-110 transition-transform">
                      <History size={28} className="sm:w-8 sm:h-8" />
                    </div>
                    <div>
                      <h3 className="text-lg sm:text-xl font-serif font-bold">Geçmiş Davalar</h3>
                      <p className="text-xs sm:text-sm text-[#5A5A40]/60">Sonuçlanmış tüm davalarını incele.</p>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setDashboardView('main')} className="p-2 hover:bg-black/5 rounded-full">
                      <RotateCcw size={20} className="-rotate-90" />
                    </button>
                    <h3 className="text-xl font-serif font-bold">
                      {dashboardView === 'incoming_cases' ? 'Aktif Davalar' : 'Geçmiş Davalar'}
                    </h3>
                  </div>

                  <div className="grid gap-4">
                    {(dashboardView === 'incoming_cases' ? activeCases : pastCases).length === 0 ? (
                      <div className="bg-white/50 border-2 border-dashed border-[#5A5A40]/20 rounded-3xl p-12 text-center space-y-4">
                        <FileText className="mx-auto text-[#5A5A40]/20" size={48} />
                        <p className="text-[#5A5A40]/60 italic">Burada henüz bir şey yok evladım.</p>
                      </div>
                    ) : (
                      (dashboardView === 'incoming_cases' ? activeCases : pastCases).map(c => (
                        <button
                          key={c.id}
                          onClick={() => loadCase(c.id!)}
                          className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm hover:shadow-md transition-all text-left flex justify-between items-center group"
                        >
                          <div className="space-y-1">
                            <h3 className="font-serif text-lg group-hover:text-[#5A5A40] transition-colors">{c.subject}</h3>
                            <p className="text-xs text-[#5A5A40]/60 uppercase tracking-wider">
                              {c.party1.name} vs {c.party2.name} • {c.status}
                            </p>
                          </div>
                          <ChevronRight className="text-[#5A5A40]/20 group-hover:text-[#5A5A40] transition-colors" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {step === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest font-semibold text-[#5A5A40]">Dava Mevzusu</label>
                <input
                  type="text"
                  placeholder="Örn: Bulaşıkları kim yıkayacak?"
                  value={caseData.subject}
                  onChange={e => setCaseData({ ...caseData, subject: e.target.value })}
                  className="w-full bg-white border-b-2 border-[#5A5A40]/20 p-4 text-xl focus:border-[#5A5A40] outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest font-semibold text-[#5A5A40]">Davacı</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A5A40]/40" size={18} />
                    <input
                      type="text"
                      placeholder="İsim"
                      value={caseData.party1.name}
                      onChange={e => setCaseData({ ...caseData, party1: { ...caseData.party1, name: e.target.value } })}
                      className="w-full bg-white border border-black/5 rounded-xl p-3 sm:p-4 pl-10 focus:ring-2 focus:ring-[#5A5A40]/20 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest font-semibold text-[#5A5A40]">Davalı İsim</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A5A40]/40" size={18} />
                    <input
                      type="text"
                      placeholder="İsim"
                      value={caseData.party2.name}
                      onChange={e => setCaseData({ ...caseData, party2: { ...caseData.party2, name: e.target.value } })}
                      className="w-full bg-white border border-black/5 rounded-xl p-3 sm:p-4 pl-10 focus:ring-2 focus:ring-[#5A5A40]/20 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest font-semibold text-[#5A5A40]">Davalı E-Posta (Boş bırakırsan tek telefonda yerel dava açılır)</label>
                <div className="relative">
                  <LogIn className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A5A40]/40" size={18} />
                  <input
                    type="email"
                    placeholder="davali@eposta.com"
                    value={caseData.party2.email || ''}
                    onChange={e => setCaseData({ ...caseData, party2: { ...caseData.party2, email: e.target.value } })}
                    className="w-full bg-white border border-black/5 rounded-xl p-4 pl-10 focus:ring-2 focus:ring-[#5A5A40]/20 outline-none transition-all"
                  />
                </div>
              </div>

              {error && <p className="text-red-600 text-sm italic font-medium">! {error}</p>}

              <button
                onClick={handleNext}
                disabled={loading}
                className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#4A4A30] transition-colors disabled:opacity-50"
              >
                {loading ? 'Kayıt Yapılıyor...' : 'DAVAYI OLUŞTUR'} <ChevronRight size={20} />
              </button>
            </motion.div>
          )}

          {(step === 'defense1' || step === 'defense2') && (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              {/* Share Link Section */}
              {caseData.id && (
                <div className="bg-white p-4 rounded-2xl border border-black/5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-sm text-[#5A5A40]">
                    <Share2 size={16} />
                    <span>Davayı Paylaş:</span>
                  </div>
                  <button 
                    onClick={copyShareLink}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#F5F2ED] rounded-lg text-xs font-bold hover:bg-[#5A5A40] hover:text-white transition-all"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'KOPYALANDI' : 'LİNKİ KOPYALA'}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-black/5 shrink-0">
                  <MessageSquare className="text-[#5A5A40] w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-serif">
                    {step === 'defense1' ? caseData.party1.name : caseData.party2.name} Konuşuyor...
                  </h2>
                  <p className="text-xs sm:text-sm text-[#5A5A40]">Savunmanı yap, Baki Bey seni dinliyor.</p>
                </div>
              </div>

              {!isMyTurn() ? (
                <div className="bg-white/50 border-2 border-dashed border-[#5A5A40]/20 rounded-3xl p-12 text-center space-y-4">
                  <RotateCcw className="mx-auto text-[#5A5A40]/20 animate-spin-slow" size={48} />
                  <p className="text-[#5A5A40]/60 italic">Sıra sende değil evladım. Karşı tarafın savunmasını bekliyoruz.</p>
                </div>
              ) : (
                <>
                  <textarea
                    autoFocus
                    placeholder="Anlat bakalım, ne oldu?"
                    value={step === 'defense1' ? caseData.party1.defense : caseData.party2.defense}
                    onChange={e => {
                      const val = e.target.value;
                      if (step === 'defense1') setCaseData({ ...caseData, party1: { ...caseData.party1, defense: val } });
                      else setCaseData({ ...caseData, party2: { ...caseData.party2, defense: val } });
                    }}
                    className="w-full h-48 bg-white border border-black/5 rounded-2xl p-6 focus:ring-2 focus:ring-[#5A5A40]/20 outline-none transition-all resize-none text-lg leading-relaxed"
                  />

                  {error && <p className="text-red-600 text-sm italic font-medium">! {error}</p>}

                  <button
                    onClick={handleNext}
                    disabled={loading}
                    className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#4A4A30] transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Baki Bey Not Alıyor...' : step === 'defense1' ? 'SAVUNMAYI KAYDET' : 'HAKİME GÖNDER'}
                    {!loading && <ChevronRight size={20} />}
                  </button>
                </>
              )}
            </motion.div>
          )}

          {step === 'cross_exam_questions' && (
            <motion.div
              key="cross_exam"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <Scale className="mx-auto text-[#5A5A40]" size={40} />
                <h2 className="text-3xl font-serif italic">Çapraz Sorgu</h2>
                <p className="text-[#5A5A40]">Baki Bey tutarsızlıkları yakaladı. Cevap verin bakayım!</p>
              </div>

              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#5A5A40] uppercase tracking-widest">
                    <ShieldAlert size={14} /> {caseData.party1.name}'e Soru
                  </div>
                  <p className="text-lg italic font-serif text-[#1A1A1A]">"{caseData.party1.question}"</p>
                  {user?.uid === caseData.party1.uid ? (
                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="Cevabın..."
                        value={caseData.party1.answer || ''}
                        onChange={e => setCaseData({ ...caseData, party1: { ...caseData.party1, answer: e.target.value } })}
                        className="w-full bg-[#F5F2ED] border-none rounded-xl p-4 focus:ring-2 focus:ring-[#5A5A40]/20 outline-none"
                      />
                      {!caseData.party1.isAnswerSaved && (
                        <button
                          onClick={handleSaveAnswer}
                          className="px-4 py-2 bg-[#5A5A40] text-white rounded-lg text-sm font-medium hover:bg-[#4A4A30] transition-colors"
                        >
                          Yanıtı Kaydet
                        </button>
                      )}
                      {caseData.party1.isAnswerSaved && (
                        <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <Check size={14} /> Yanıtın kaydedildi.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-[#5A5A40]/60 italic">{caseData.party1.answer || 'Cevap bekleniyor...'}</p>
                  )}
                </div>

                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#5A5A40] uppercase tracking-widest">
                    <ShieldAlert size={14} /> {caseData.party2.name}'e Soru
                  </div>
                  <p className="text-lg italic font-serif text-[#1A1A1A]">"{caseData.party2.question}"</p>
                  {user?.uid === caseData.party2.uid ? (
                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="Cevabın..."
                        value={caseData.party2.answer || ''}
                        onChange={e => setCaseData({ ...caseData, party2: { ...caseData.party2, answer: e.target.value } })}
                        className="w-full bg-[#F5F2ED] border-none rounded-xl p-4 focus:ring-2 focus:ring-[#5A5A40]/20 outline-none"
                      />
                      {!caseData.party2.isAnswerSaved && (
                        <button
                          onClick={handleSaveAnswer}
                          className="px-4 py-2 bg-[#5A5A40] text-white rounded-lg text-sm font-medium hover:bg-[#4A4A30] transition-colors"
                        >
                          Yanıtı Kaydet
                        </button>
                      )}
                      {caseData.party2.isAnswerSaved && (
                        <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <Check size={14} /> Yanıtın kaydedildi.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-[#5A5A40]/60 italic">{caseData.party2.answer || 'Cevap bekleniyor...'}</p>
                  )}
                </div>
              </div>

              {error && <p className="text-red-600 text-sm italic font-medium">! {error}</p>}

              <div className="flex flex-col gap-4">
                {user?.uid === caseData.createdBy && (
                  <button
                    onClick={() => syncCase({ status: 'cross_exam_answers' })}
                    disabled={!caseData.party1.isAnswerSaved || !caseData.party2.isAnswerSaved || loading}
                    className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#4A4A30] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'HAZIRLANIYOR...' : 'HÜKMÜ BEKLE'} <ChevronRight size={20} />
                  </button>
                )}
                {user?.uid === caseData.createdBy && (!caseData.party1.isAnswerSaved || !caseData.party2.isAnswerSaved) && (
                  <p className="text-center text-xs text-[#5A5A40]/60 italic">
                    Hüküm için her iki tarafın da yanıtlarını "Yanıtı Kaydet" butonuyla mühürlemesi gerekir.
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {step === 'cross_exam_answers' && (
            <motion.div
              key="loading_verdict"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center space-y-6"
            >
              <div className="relative w-24 h-24 mx-auto">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-4 border-t-[#5A5A40] border-transparent rounded-full"
                />
                <Gavel className="absolute inset-0 m-auto text-[#5A5A40]" size={32} />
              </div>
              <h2 className="text-2xl font-serif italic">Baki Bey Kararını Yazıyor...</h2>
              <p className="text-[#5A5A40] animate-pulse">"Adalet yerini bulacak, sabret evladım."</p>
              {error && <p className="text-red-600 text-sm italic font-medium">! {error}</p>}
            </motion.div>
          )}

          {step === 'verdict' && caseData.verdict && (
            <motion.div
              key="verdict"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Official Court Document Style */}
              <div className="bg-white p-8 md:p-12 rounded-sm shadow-2xl border-t-[12px] border-[#5A5A40] relative overflow-hidden">
                {/* Document Header */}
                <div className="text-center border-b-2 border-black/10 pb-6 mb-8">
                  <h3 className="text-xs font-bold tracking-[0.3em] uppercase mb-2">T.C. DİJİTAL KADI MAHKEMESİ</h3>
                  <h4 className="text-xl font-serif font-bold uppercase tracking-widest">GEREKÇELİ KARAR</h4>
                </div>

                {/* Case Info */}
                <div className="grid grid-cols-2 gap-4 text-xs font-mono mb-8 opacity-60">
                  <div>DOSYA NO: {caseData.id?.slice(-6).toUpperCase()}</div>
                  <div className="text-right">TARİH: {caseData.createdAt?.toDate().toLocaleDateString('tr-TR') || new Date().toLocaleDateString('tr-TR')}</div>
                </div>

                {/* Verdict Content */}
                <div className="space-y-6 font-serif">
                  <div className="flex justify-between items-end border-b border-black/5 pb-4">
                    <div className="space-y-1">
                      <span className="text-xs uppercase font-bold text-[#5A5A40]">HAKLILIK ORANI</span>
                      <div className="text-3xl font-bold">{caseData.party1.name}: %{caseData.verdict.party1Score}</div>
                    </div>
                    <div className="space-y-1 text-right">
                      <span className="text-xs uppercase font-bold text-[#5A5A40]">HAKLILIK ORANI</span>
                      <div className="text-3xl font-bold">{caseData.party2.name}: %{caseData.verdict.party2Score}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h5 className="text-sm font-bold uppercase tracking-wider text-[#5A5A40]">HÜKÜM ÖZETİ</h5>
                    <p className="text-lg italic leading-relaxed">"{caseData.verdict.summary}"</p>
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-sm font-bold uppercase tracking-wider text-[#5A5A40]">GEREKÇE VE HÜKÜM</h5>
                    <p className="text-sm leading-relaxed text-justify indent-8">
                      {caseData.verdict.legalReasoning}
                    </p>
                    <div className="pt-4 border-t border-black/5">
                      <p className="text-base sm:text-lg font-bold text-[#1A1A1A]">
                        <span className="text-xs uppercase tracking-widest text-[#5A5A40] block mb-1">KARAR:</span>
                        {caseData.verdict.punishment}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Seal */}
                <div className="mt-12 flex justify-end relative">
                  <div className="relative w-32 h-32 sm:w-40 sm:h-40 flex items-center justify-center">
                    <motion.div
                      initial={{ scale: 3, opacity: 0, rotate: 0 }}
                      animate={{ scale: 1, opacity: 0.5, rotate: -15 }}
                      transition={{ delay: 0.8, type: 'spring', damping: 12 }}
                      className="absolute inset-0 border-[4px] border-red-900/60 rounded-full flex items-center justify-center"
                    >
                      <div className="text-center p-4 flex flex-col items-center justify-center">
                        <Stamp className="text-red-900/40 mb-1" size={20} />
                        <span className="text-[8px] sm:text-[10px] font-black text-red-900/70 uppercase leading-none tracking-tighter max-w-[70px] sm:max-w-[90px] break-words text-center">
                          {caseData.verdict.sealText}
                        </span>
                        <div className="mt-1 text-[6px] text-red-900/30 font-mono">
                          {caseData.id?.slice(-4).toUpperCase()}
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={reset}
                  className="flex-1 py-4 bg-[#5A5A40] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#4A4A30] transition-colors shadow-lg"
                >
                  <Plus size={20} /> YENİ DAVA AÇ
                </button>
                <button
                  onClick={copyShareLink}
                  className="flex-1 py-4 bg-white border-2 border-[#5A5A40] text-[#5A5A40] rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#5A5A40] hover:text-white transition-all shadow-sm"
                >
                  {copied ? <Check size={20} /> : <Share2 size={20} />}
                  {copied ? 'KOPYALANDI' : 'KARARI PAYLAŞ'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-6 w-full text-center text-[10px] uppercase tracking-[0.2em] opacity-30 font-bold">
        Hakimim: Dijital Kadı &copy; 2026 - Adalet Mülkün Temelidir
      </footer>
    </div>
  );
}
