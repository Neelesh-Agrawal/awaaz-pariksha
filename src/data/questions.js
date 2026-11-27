// Built-in practice paper: five written questions and three multiple-choice questions.
// Wording is everyday Hindi / Tamil with the textbook term kept in brackets, so a student who
// knows only one of the two still understands. Have a subject teacher who is a native speaker
// review the translations before using them with students.
//
// A question is { type: 'text' | 'mcq', marks, 'en-IN', 'hi-IN', 'ta-IN', options?: [{ 'en-IN', … }] }.
// Questions loaded by a teacher (typed or uploaded) use { type, marks, text, options: [string] }.
export const QUESTIONS = [
  {
    type: 'text',
    marks: 2,
    'en-IN': 'What is photosynthesis?',
    'hi-IN': 'पौधे अपना खाना कैसे बनाते हैं? इसे क्या कहते हैं (प्रकाश संश्लेषण)?',
    'ta-IN': 'ஒளிச்சேர்க்கை (photosynthesis) என்றால் என்ன?',
  },
  {
    type: 'text',
    marks: 2,
    'en-IN': 'Name three states of matter.',
    'hi-IN': 'चीज़ें किन तीन रूपों में मिलती हैं? (पदार्थ की तीन अवस्थाएं) नाम बताइए।',
    'ta-IN': 'பொருள் இருக்கும் மூன்று நிலைகளைச் சொல்லுங்கள்.',
  },
  {
    type: 'text',
    marks: 2,
    'en-IN': 'What is evaporation?',
    'hi-IN': 'पानी भाप कैसे बनता है? इसे क्या कहते हैं (वाष्पीकरण)?',
    'ta-IN': 'தண்ணீர் ஆவியாக மாறுவது (ஆவியாதல்) என்றால் என்ன?',
  },
  {
    type: 'text',
    marks: 2,
    'en-IN': 'What causes day and night?',
    'hi-IN': 'दिन और रात क्यों होते हैं?',
    'ta-IN': 'பகலும் இரவும் ஏன் வருகின்றன?',
  },
  {
    type: 'text',
    marks: 2,
    'en-IN': 'Give two ways to save water.',
    'hi-IN': 'पानी बचाने के दो तरीके बताइए।',
    'ta-IN': 'தண்ணீரைச் சேமிக்க இரண்டு வழிகளைச் சொல்லுங்கள்.',
  },
  {
    type: 'mcq',
    marks: 1,
    'en-IN': 'Which planet is closest to the Sun?',
    'hi-IN': 'सूरज के सबसे पास कौन सा ग्रह है?',
    'ta-IN': 'சூரியனுக்கு மிக அருகில் உள்ள கோள் எது?',
    options: [
      { 'en-IN': 'Venus', 'hi-IN': 'शुक्र (वीनस)', 'ta-IN': 'வெள்ளி' },
      { 'en-IN': 'Mercury', 'hi-IN': 'बुध (मरकरी)', 'ta-IN': 'புதன்' },
      { 'en-IN': 'Earth', 'hi-IN': 'पृथ्वी', 'ta-IN': 'பூமி' },
      { 'en-IN': 'Mars', 'hi-IN': 'मंगल (मार्स)', 'ta-IN': 'செவ்வாய்' },
    ],
  },
  {
    type: 'mcq',
    marks: 1,
    'en-IN': 'At what temperature does pure water boil at sea level?',
    'hi-IN': 'साफ़ पानी समुद्र तल पर कितने तापमान पर उबलता है?',
    'ta-IN': 'கடல் மட்டத்தில் தூய நீர் எந்த வெப்பநிலையில் கொதிக்கும்?',
    options: [
      { 'en-IN': '0 degrees Celsius', 'hi-IN': '0 डिग्री सेल्सियस', 'ta-IN': '0 டிகிரி செல்சியஸ்' },
      { 'en-IN': '50 degrees Celsius', 'hi-IN': '50 डिग्री सेल्सियस', 'ta-IN': '50 டிகிரி செல்சியஸ்' },
      { 'en-IN': '100 degrees Celsius', 'hi-IN': '100 डिग्री सेल्सियस', 'ta-IN': '100 டிகிரி செல்சியஸ்' },
      { 'en-IN': '200 degrees Celsius', 'hi-IN': '200 डिग्री सेल्सियस', 'ta-IN': '200 டிகிரி செல்சியஸ்' },
    ],
  },
  {
    type: 'mcq',
    marks: 1,
    'en-IN': 'Which gas do plants take in from the air to make food?',
    'hi-IN': 'खाना बनाने के लिए पौधे हवा से कौन सी गैस लेते हैं?',
    'ta-IN': 'உணவு தயாரிக்க தாவரங்கள் காற்றிலிருந்து எந்த வாயுவை எடுக்கின்றன?',
    options: [
      { 'en-IN': 'Oxygen', 'hi-IN': 'ऑक्सीजन', 'ta-IN': 'ஆக்ஸிஜன்' },
      { 'en-IN': 'Nitrogen', 'hi-IN': 'नाइट्रोजन', 'ta-IN': 'நைட்ரஜன்' },
      { 'en-IN': 'Carbon dioxide', 'hi-IN': 'कार्बन डाइऑक्साइड', 'ta-IN': 'கார்பன் டை ஆக்சைடு' },
      { 'en-IN': 'Hydrogen', 'hi-IN': 'हाइड्रोजन', 'ta-IN': 'ஹைட்ரஜன்' },
    ],
  },
];

export const QUESTION_COUNT = QUESTIONS.length;
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
