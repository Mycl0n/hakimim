import { CaseData, Verdict } from "../types";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = "deepseek/deepseek-chat";

const SYSTEM_INSTRUCTION = `Sen "Emekli Hakim Baki Bey"sin. 
Kişilik: 30 yıl ağır cezada dirsek çürütmüş, hafif bıkkın, görmüş geçirmiş, hukuk terimlerini mahalle ağzıyla harmanlayan eski bir reissin. 
Sivri dillisin ama adilsin. Mantık hatalarını (fallacy) hemen yakalarsın. 
Gençlerin "trip", "ghostlama", "story atma" gibi dertlerine hem hakimsin hem de "bizim zamanımızda böyle miydi" diye inceden ayar verirsin.
Türkçe konuşuyorsun.`;

async function callOpenRouter(prompt: string, isJson: boolean = false) {
  if (!OPENROUTER_API_KEY) {
    const msg = "OPENROUTER_API_KEY eksik! Lütfen AI Studio Ayarlar (Settings) menüsünden bu anahtarı ekleyin.";
    console.error(msg);
    throw new Error(msg);
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "Hakimim: Dijital Kadi",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: prompt }
        ],
        response_format: isJson ? { type: "json_object" } : undefined,
      }),
    });

    const data = await response.json();
    
    if (data.error) {
      console.error("OpenRouter API Hatası:", data.error);
      throw new Error(data.error.message || "OpenRouter API hatası");
    }

    if (!data.choices || data.choices.length === 0) {
      console.error("OpenRouter Yanıtı Boş:", data);
      throw new Error("API'den yanıt alınamadı.");
    }

    return data.choices[0].message.content;
  } catch (error) {
    console.error("Ağ Hatası veya API Hatası:", error);
    throw error;
  }
}

export async function generateCrossExamQuestions(caseData: CaseData) {
  const prompt = `Dava Konusu: ${caseData.subject}
  
  Davacı (${caseData.party1.name}) Savunması: ${caseData.party1.defense}
  Davalı (${caseData.party2.name}) Savunması: ${caseData.party2.defense}
  
  Baki Bey olarak, bu iki savunmadaki tutarsızlıkları veya eksik noktaları bul. 
  Her iki tarafa da birer tane "terletici", "çapraz sorgu" tadında soru sor. 
  Sorular kısa, öz ve vurucu olsun. 
  
  Yanıtı şu JSON formatında ver:
  {
    "party1Question": "soru metni",
    "party2Question": "soru metni"
  }`;

  const content = await callOpenRouter(prompt, true);
  return JSON.parse(content);
}

export async function generateVerdict(caseData: CaseData): Promise<Verdict> {
  const prompt = `Dava Konusu: ${caseData.subject}
  
  Davacı (${caseData.party1.name}):
  - Savunma: ${caseData.party1.defense}
  - Çapraz Sorgu Yanıtı: ${caseData.party1.answer}
  
  Davalı (${caseData.party2.name}):
  - Savunma: ${caseData.party2.defense}
  - Çapraz Sorgu Yanıtı: ${caseData.party2.answer}
  
  Baki Bey olarak nihai hükmünü ver. 
  1. Haklılık paylarını yüzde olarak belirle (toplam 100).
  2. "Gerekçeli Karar" yaz (Baki Bey üslubuyla, hafif bıkkın ama adil).
  3. Bir "Ceza" belirle.
  4. Mühür metni oluştur (Maksimum 3-4 kelime, damganın içine sığacak şekilde kısa).
  
  Yanıtı şu JSON formatında ver:
  {
    "party1Score": 60,
    "party2Score": 40,
    "summary": "Kısa özet karar",
    "punishment": "Ceza metni",
    "legalReasoning": "Gerekçeli karar metni",
    "sealText": "Mühür metni"
  }`;

  const content = await callOpenRouter(prompt, true);
  return JSON.parse(content);
}
