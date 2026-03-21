import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gavel, 
  Scale, 
  User, 
  MessageSquare, 
  ChevronRight, 
  RotateCcw, 
  ShieldAlert,
  FileText,
  Stamp
} from 'lucide-react';
import { Step, CaseData, Verdict } from './types';
import { generateCrossExamQuestions, generateVerdict } from './services/geminiService';

const INITIAL_CASE: CaseData = {
  subject: '',
  party1: { name: '', defense: '' },
  party2: { name: '', defense: '' }
};

export default function App() {
  const [step, setStep] = useState<Step>('intro');
  const [caseData, setCaseData] = useState<CaseData>(INITIAL_CASE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    if (step === 'intro') setStep('setup');
    else if (step === 'setup') {
      if (!caseData.subject || !caseData.party1.name || !caseData.party2.name) {
        setError('Evladım, isimleri ve konuyu boş geçemezsin. Kayıtlara geçmez!');
        return;
      }
      setError(null);
      setStep('defense1');
    }
    else if (step === 'defense1') {
      if (!caseData.party1.defense) {
        setError('Savunma yapmadan nereye? Konuş evladım!');
        return;
      }
      setError(null);
      setStep('defense2');
    }
    else if (step === 'defense2') {
      if (!caseData.party2.defense) {
        setError('Sıra sende, dök içini!');
        return;
      }
      setError(null);
      handleGenerateQuestions();
    }
    else if (step === 'cross_exam_answers') {
      if (!caseData.party1.answer || !caseData.party2.answer) {
        setError('Sorulara cevap vermeden hüküm çıkmaz!');
        return;
      }
      setError(null);
      handleGenerateVerdict();
    }
  };

  const handleGenerateQuestions = async () => {
    setLoading(true);
    try {
      const questions = await generateCrossExamQuestions(caseData);
      setCaseData(prev => ({
        ...prev,
        party1: { ...prev.party1, question: questions.party1Question },
        party2: { ...prev.party2, question: questions.party2Question }
      }));
      setStep('cross_exam_questions');
    } catch (err) {
      console.error("Hata detayı:", err);
      setError(err instanceof Error ? err.message : 'Mahmut Tuncer\'in tansiyonu çıktı, bir daha dene evladım.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateVerdict = async () => {
    setLoading(true);
    try {
      const verdict = await generateVerdict(caseData);
      setCaseData(prev => ({ ...prev, verdict }));
      setStep('verdict');
    } catch (err) {
      console.error("Karar hatası:", err);
      setError(err instanceof Error ? err.message : 'Karar defteri kayboldu, tekrar hüküm iste.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setCaseData(INITIAL_CASE);
    setStep('intro');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F5F2ED] text-[#1A1A1A] font-sans selection:bg-[#5A5A40] selection:text-white">
      {/* Background Texture */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')]"></div>

      <main className="relative max-w-2xl mx-auto px-6 py-12 min-h-screen flex flex-col justify-center">
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
              <p className="text-lg text-[#5A5A40] max-w-md mx-auto leading-relaxed">
                "Evladım, kim haklı kim haksız bizde şaşmaz. Adalet mülkün temelidir, mülk de benim masamdır."
              </p>
              <button
                onClick={handleNext}
                className="group relative px-8 py-4 bg-[#5A5A40] text-white rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95"
              >
                <span className="relative z-10 font-medium tracking-wide">DAVAYI AÇ</span>
                <div className="absolute inset-0 bg-black/10 translate-y-full group-hover:translate-y-0 transition-transform"></div>
              </button>
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

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest font-semibold text-[#5A5A40]">Davacı</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A5A40]/40" size={18} />
                    <input
                      type="text"
                      placeholder="İsim"
                      value={caseData.party1.name}
                      onChange={e => setCaseData({ ...caseData, party1: { ...caseData.party1, name: e.target.value } })}
                      className="w-full bg-white border border-black/5 rounded-xl p-4 pl-10 focus:ring-2 focus:ring-[#5A5A40]/20 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest font-semibold text-[#5A5A40]">Davalı</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A5A40]/40" size={18} />
                    <input
                      type="text"
                      placeholder="İsim"
                      value={caseData.party2.name}
                      onChange={e => setCaseData({ ...caseData, party2: { ...caseData.party2, name: e.target.value } })}
                      className="w-full bg-white border border-black/5 rounded-xl p-4 pl-10 focus:ring-2 focus:ring-[#5A5A40]/20 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-red-600 text-sm italic font-medium">! {error}</p>}

              <button
                onClick={handleNext}
                className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#4A4A30] transition-colors"
              >
                SAVUNMALARA GEÇ <ChevronRight size={20} />
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
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-black/5">
                  <MessageSquare className="text-[#5A5A40]" size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-serif">
                    {step === 'defense1' ? caseData.party1.name : caseData.party2.name} Konuşuyor...
                  </h2>
                  <p className="text-sm text-[#5A5A40]">Savunmanı yap, Mahmut Tuncer seni dinliyor.</p>
                </div>
              </div>

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
                {loading ? 'Mahmut Tuncer Not Alıyor...' : step === 'defense1' ? 'DİĞER TARAFA GEÇ' : 'HAKİME GÖNDER'}
                {!loading && <ChevronRight size={20} />}
              </button>
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
                <p className="text-[#5A5A40]">Mahmut Tuncer tutarsızlıkları yakaladı. Cevap verin bakayım!</p>
              </div>

              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#5A5A40] uppercase tracking-widest">
                    <ShieldAlert size={14} /> {caseData.party1.name}'e Soru
                  </div>
                  <p className="text-lg italic font-serif text-[#1A1A1A]">"{caseData.party1.question}"</p>
                  <input
                    type="text"
                    placeholder="Cevabın..."
                    value={caseData.party1.answer || ''}
                    onChange={e => setCaseData({ ...caseData, party1: { ...caseData.party1, answer: e.target.value } })}
                    className="w-full bg-[#F5F2ED] border-none rounded-xl p-4 focus:ring-2 focus:ring-[#5A5A40]/20 outline-none"
                  />
                </div>

                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#5A5A40] uppercase tracking-widest">
                    <ShieldAlert size={14} /> {caseData.party2.name}'e Soru
                  </div>
                  <p className="text-lg italic font-serif text-[#1A1A1A]">"{caseData.party2.question}"</p>
                  <input
                    type="text"
                    placeholder="Cevabın..."
                    value={caseData.party2.answer || ''}
                    onChange={e => setCaseData({ ...caseData, party2: { ...caseData.party2, answer: e.target.value } })}
                    className="w-full bg-[#F5F2ED] border-none rounded-xl p-4 focus:ring-2 focus:ring-[#5A5A40]/20 outline-none"
                  />
                </div>
              </div>

              {error && <p className="text-red-600 text-sm italic font-medium">! {error}</p>}

              <button
                onClick={() => setStep('cross_exam_answers')}
                className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#4A4A30] transition-colors"
              >
                HÜKMÜ BEKLE <ChevronRight size={20} />
              </button>
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
              <h2 className="text-2xl font-serif italic">Mahmut Tuncer Kararını Yazıyor...</h2>
              <p className="text-[#5A5A40] animate-pulse">"Adalet yerini bulacak, sabret evladım."</p>
              <button 
                onClick={handleNext}
                className="px-6 py-2 bg-[#5A5A40] text-white rounded-full text-sm"
              >
                KARARI GÖR
              </button>
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
                  <div>DOSYA NO: {Math.floor(Math.random() * 10000)}/2026</div>
                  <div className="text-right">TARİH: {new Date().toLocaleDateString('tr-TR')}</div>
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

                  <div className="space-y-2">
                    <h5 className="text-sm font-bold uppercase tracking-wider text-[#5A5A40]">GEREKÇE</h5>
                    <p className="text-sm leading-relaxed text-justify indent-8">
                      {caseData.verdict.legalReasoning}
                    </p>
                  </div>

                  <div className="mt-12 p-6 bg-[#F5F2ED] rounded-xl border-l-4 border-[#5A5A40]">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-2">CEZA İNFAZI</h5>
                    <p className="text-xl font-bold text-[#1A1A1A]">{caseData.verdict.punishment}</p>
                  </div>
                </div>

                {/* Seal */}
                <div className="mt-12 flex justify-end">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <motion.div
                      initial={{ scale: 2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 0.8 }}
                      transition={{ delay: 0.5, type: 'spring' }}
                      className="absolute inset-0 border-4 border-red-800 rounded-full flex items-center justify-center rotate-12"
                    >
                      <div className="text-center p-2">
                        <Stamp className="mx-auto text-red-800 mb-1" size={20} />
                        <span className="text-[10px] font-bold text-red-800 uppercase leading-tight block">
                          {caseData.verdict.sealText}
                        </span>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>

              <button
                onClick={reset}
                className="w-full py-4 border-2 border-[#5A5A40] text-[#5A5A40] rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#5A5A40] hover:text-white transition-all"
              >
                <RotateCcw size={20} /> YENİ DAVA AÇ
              </button>
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
