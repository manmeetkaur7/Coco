export const LANGUAGES = [
  { code: "en-US", name: "English", ordering: true },
  {
    code: "pa-IN",
    name: "Punjabi — experimental speech locale",
    ordering: false,
  },
  {
    code: "hi-IN",
    name: "Hindi — experimental speech locale",
    ordering: false,
  },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export const GREETINGS: Record<LanguageCode, string> = {
  "en-US":
    "Hi! Welcome to Round Table Pizza. I'm Coco. What can I help you order today?",
  "pa-IN":
    "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਰਾਊਂਡ ਟੇਬਲ ਪੀਜ਼ਾ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ। ਮੈਂ ਕੋਕੋ ਹਾਂ। ਆਰਡਰਿੰਗ ਹੁਣ ਅੰਗਰੇਜ਼ੀ ਵਿੱਚ ਉਪਲਬਧ ਹੈ।",
  "hi-IN":
    "नमस्ते! राउंड टेबल पिज़्ज़ा में आपका स्वागत है। मैं कोको हूँ। अभी ऑर्डर अंग्रेज़ी में लिए जाते हैं।",
};
