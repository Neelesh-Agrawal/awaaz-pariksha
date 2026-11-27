// Deterministic voice-command parser. No ML: a phrase matches a known command pattern in full
// (after light normalization), or a known command phrase inside a longer sentence, or it is not a command.
// English patterns are always accepted; the selected language's patterns are added on top.

export function normalize(input) {
  return String(input || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/़/g, '') // Devanagari nukta (ड़ → ड, ज़ → ज)
    .replace(/ँ/g, 'ं') // chandrabindu → anusvara (पाँच → पांच)
    .replace(/[.,!?;:"'“”‘’()[\]।॥\-–—…]/g, ' ')
    // Tamil sandhi doubling at word end: "தேர்வைத்" → "தேர்வை", "பதிலைப்" → "பதிலை"
    .replace(/([அ-ஔா-ௌ])[கசதப]்(?=\s|$)/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const FILLERS_START = /^(?:please|ok|okay|कृपया|ठीक है|தயவுசெய்து|சரி இப்போது)\s+/u;
const FILLERS_END = /\s+(?:please|कृपया|தயவுசெய்து)$/u;

// ---------- numbers ----------
const NUMBER_WORDS = {
  // English
  one: 1, first: 1, won: 1, two: 2, to: 2, too: 2, second: 2, three: 3, third: 3, four: 4, for: 4, fourth: 4,
  last: -1, final: -1, 'आखिरी': -1, 'अंतिम': -1, 'லாஸ்ட்': -1, 'கடைசி': -1, 'கடைசியான': -1,
  five: 5, fifth: 5, six: 6, sixth: 6, seven: 7, seventh: 7, eight: 8, eighth: 8, nine: 9, ninth: 9, ten: 10, tenth: 10,
  // Hindi
  'एक': 1, 'पहला': 1, 'पहले': 1, 'पहली': 1, 'वन': 1,
  'दो': 2, 'दूसरा': 2, 'दूसरे': 2, 'दूसरी': 2, 'टू': 2,
  'तीन': 3, 'तीसरा': 3, 'तीसरे': 3, 'तीसरी': 3, 'थ्री': 3,
  'चार': 4, 'चौथा': 4, 'चौथे': 4, 'चौथी': 4, 'फोर': 4,
  'पांच': 5, 'पांचवां': 5, 'पांचवा': 5, 'पांचवें': 5, 'पांचवीं': 5, 'फाइव': 5,
  'छह': 6, 'छः': 6, 'छठा': 6, 'सात': 7, 'सातवां': 7, 'आठ': 8, 'आठवां': 8, 'नौ': 9, 'नौवां': 9, 'दस': 10, 'दसवां': 10,
  // Tamil
  'ஒன்று': 1, 'ஒன்னு': 1, 'முதல்': 1, 'முதலாவது': 1, 'ஒன்றாவது': 1,
  'இரண்டு': 2, 'ரெண்டு': 2, 'இரண்டாவது': 2, 'இரண்டாம்': 2,
  'மூன்று': 3, 'மூணு': 3, 'மூன்றாவது': 3, 'மூன்றாம்': 3,
  'நான்கு': 4, 'நாலு': 4, 'நான்காவது': 4, 'நான்காம்': 4,
  'ஐந்து': 5, 'அஞ்சு': 5, 'ஐந்தாவது': 5, 'ஐந்தாம்': 5,
  'ஆறு': 6, 'ஏழு': 7, 'எட்டு': 8, 'ஒன்பது': 9, 'பத்து': 10,
};
// Tamil words take case suffixes ("மூன்றுக்கு", "இரண்டை"), so also match by stem.
const TAMIL_STEMS = [
  ['முதல', 1], ['ஒன்ற', 1], ['ஒன்ன', 1], ['இரண்ட', 2], ['ரெண்ட', 2], ['மூன்ற', 3], ['மூண', 3],
  ['நான்க', 4], ['நால', 4], ['ஐந்த', 5], ['அஞ்ச', 5],
];

export function parseNumber(token) {
  if (!token) return null;
  let t = normalize(token);
  t = t.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966));
  t = t.replace(/[௦-௯]/g, (d) => String(d.charCodeAt(0) - 0xbe6));
  let m = t.match(/^#?(\d{1,2})(?:st|nd|rd|th|ஆவது|ஆம்|வது)?$/u);
  if (m) return parseInt(m[1], 10);
  m = t.match(/^(\d{1,2})/u); // "3க்கு", "2ஐ"
  if (m) return parseInt(m[1], 10);
  if (NUMBER_WORDS[t] !== undefined) return NUMBER_WORDS[t];
  for (const [stem, n] of TAMIL_STEMS) if (t.startsWith(stem)) return n;
  return null;
}

// ---------- option letters (multiple choice) ----------
// Chrome writes a spoken letter in many ways: "B", "be", "bee"; "C", "see", "sea". Hindi and Tamil
// papers also label options क ख ग घ / अ ब स द and அ ஆ இ ஈ.
const OPTION_WORDS = {
  a: 1, ay: 1, b: 2, be: 2, bee: 2, bi: 2, c: 3, see: 3, sea: 3, si: 3, cee: 3,
  d: 4, dee: 4, di: 4, e: 5, ee: 5, f: 6, ef: 6,
  'ए': 1, 'बी': 2, 'सी': 3, 'डी': 4, 'ई': 5, 'क': 1, 'ख': 2, 'ग': 3, 'घ': 4, 'अ': 1, 'ब': 2, 'स': 3, 'द': 4,
  'ஏ': 1, 'பி': 2, 'சி': 3, 'டி': 4, 'அ': 1, 'ஆ': 2, 'இ': 3, 'ஈ': 4,
};
export function parseOptionRef(token) {
  if (!token) return null;
  const t = normalize(token);
  if (OPTION_WORDS[t] !== undefined) return OPTION_WORDS[t];
  if (WEAK_OPTION_NUMBERS.has(t)) return null; // "switch to option C": "to" is not option 2
  const n = parseNumber(t);
  return n !== null && n >= 1 && n <= 6 ? n : null;
}
const WEAK_OPTION_NUMBERS = new Set(['to', 'too', 'for', 'won', 'last', 'final']);

// ---------- command table ----------
// Patterns are regex sources matched against the whole normalized phrase.
// {n} = one number token, {o} = one option letter or number.
// Every command has several everyday phrasings: students should not have to learn one exact phrase.
const N = '{n}';
const O = '{o}';
const SEN = '(?:sentences?|sentense|sentance|statements?|lines?|points?)';
const NO = '(?:number |no )?';
const REPL = '(?:replace|change|edit|rewrite|redo|correct|fix|modify|update)';
const DEL = '(?:delete|remove|erase|cut|drop)';
const ADDV = '(?:insert|add|put|write)(?: a| one| new| another)?';
const SEN_HI = '(?:वाक्य|लाइन|पंक्ति|सेंटेंस|सेन्टेन्स|स्टेटमेंट)';
const DEL_HI = '(?:हटाओ|हटाएं|हटा दो|मिटाओ|मिटा दो|डिलीट करो|डिलीट करें|डिलीट कर दो|डिलीट)';
const REPL_HI = '(?:बदलो|बदलें|बदलिए|बदल दो|एडिट करो|ठीक करो|सुधारो|दोबारा लिखो|चेंज करो)';
const SEN_TA = '(?:வாக்கியம்|வாக்கியத்தை|வரி|வரியை|லைன்)';
const DEL_TA = '(?:நீக்கு|அழி|நீக்கவும்|டிலீட் செய்|டிலீட் பண்ணு)';
const REPL_TA = '(?:மாற்று|திருத்து|மாற்றவும்|திருத்தவும்|மாத்து|சேஞ்ச் பண்ணு)';
const OPT_EN = '(?:option|choice|answer option)';
const OPT_HI = '(?:ऑप्शन|आप्शन|विकल्प)';
const OPTS_HI = '(?:ऑप्शन|आप्शन|विकल्प|ऑप्शंस|ऑप्शन्स)';
const OPT_TA = '(?:ஆப்ஷன்|விருப்பம்|தெரிவு|விடை)';
const ANS_HI = '(?:उत्तर|जवाब)';
const Q_HI = '(?:प्रश्न|सवाल)';
const DO_HI = '(?:करो|करें|करिए|कीजिए|कर दो|कर दीजिए)';

export const COMMANDS = [
  // ----- start / stop -----
  { type: 'START_EXAM', en: ['start (?:the )?(?:exam|test|paper)', 'begin (?:the )?(?:exam|test|paper)', 'let(?: s| us) (?:start|begin)(?: the (?:exam|test|paper))?', 'i(?: m| am) ready to (?:start|begin)'],
    hi: [`(?:परीक्षा|पेपर|टेस्ट|एग्जाम) शुरू(?: ${DO_HI})?`, 'स्टार्ट (?:एग्जाम|एगजाम|एक्जाम|टेस्ट|पेपर)', 'चलो (?:परीक्षा|पेपर) शुरू करते हैं'],
    ta: ['தேர்வை தொடங்கு', 'தேர்வு தொடங்கு', 'தேர்வை தொடங்குங்கள்', 'ஸ்டார்ட் எக்ஸாம்', 'தேர்வை ஆரம்பி', 'பேப்பர் ஆரம்பி', 'டெஸ்ட் ஆரம்பி'] },
  { type: 'START_ANSWER', en: ['start', 'begin', 'start (?:my |the )?answer(?:ing)?', 'begin (?:my |the )?answer(?:ing)?', 'start (?:the )?recording', 'record(?: my answer| answer)?', 'start writing', 'write (?:my |the )?answer', 'take (?:down )?my answer', 'note (?:down )?my answer', 'type my answer', 'i (?:want to|will|ll|wanna) answer(?: this| now| this question)?', 'let me answer(?: this| now)?', 'i(?: m| am) ready(?: to answer)?', 'ready', 'start dictation', 'dictate', 'answer(?: now| this| this question| it)?', 'listen to my answer', 'start speaking'],
    hi: [`स्टार्ट (?:आंसर|आन्सर|आनसर|रिकॉर्डिंग)`, `${ANS_HI} शुरू(?: ${DO_HI})?`, `शुरू(?: ${DO_HI})?`, `रिकॉर्डिंग शुरू(?: ${DO_HI})?`, `रिकॉर्ड ${DO_HI}`, `लिखना शुरू(?: ${DO_HI})?`, `(?:मेरा )?${ANS_HI} लिखो`, `${ANS_HI} (?:बोलता|बोलती) हूं`, `मैं ${ANS_HI} (?:देता|देती|बोलता|बोलती) हूं`, 'बोलना शुरू(?: करता हूं| करती हूं)?', 'मैं तैयार हूं', 'तैयार हूं', 'तैयार', 'चलो लिखो'],
    ta: ['பதிலை தொடங்கு', 'பதில் தொடங்கு', 'பதிலை தொடங்குங்கள்', 'ஸ்டார்ட் ஆன்சர்', 'ஆரம்பி', 'தொடங்கு', 'பதில் சொல்றேன்', 'பதில் சொல்கிறேன்', 'ரெக்கார்டிங் ஆரம்பி', 'பதிவு தொடங்கு', 'பதிலை எழுது', 'ரெடி', 'நான் தயார்', 'நான் ரெடி'] },
  { type: 'STOP_ANSWER', en: ['stop', 'stop (?:my |the )?answer(?:ing)?', 'stop (?:the )?recording', 'stop writing', 'stop dictation', 'stop listening', 'end (?:my |the )?answer', 'end (?:the )?recording', 'finish (?:my |the )?answer', 'i(?: m| am) (?:done|finished)(?: answering| with (?:my |the |this )?answer)?', 'that(?: s| is) (?:it|all|my whole answer)', 'save (?:my |the )?answer', 'save (?:it|this)', 'answer (?:over|finished|complete|completed|done)', 'end of (?:my |the )?answer', 'finished', 'over', 'done answering'],
    hi: ['स्टॉप(?: आंसर| आन्सर| रिकॉर्डिंग)?', `${ANS_HI} (?:बंद|समाप्त|खत्म) ${DO_HI}`, 'बस', 'बस हो गया', 'बस इतना ही', 'इतना ही', `रिकॉर्डिंग बंद(?: ${DO_HI})?`, `बंद ${DO_HI}`, `${ANS_HI} (?:पूरा|खत्म) (?:हो गया|हुआ)`, `${ANS_HI} सेव ${DO_HI}`, 'सेव करो'],
    ta: ['பதிலை நிறுத்து', 'பதில் நிறுத்து', 'பதிவை நிறுத்து', 'ஸ்டாப் ஆன்சர்', 'ஸ்டாப்', 'நிறுத்து', 'போதும்', 'முடிஞ்சது', 'பதில் முடிஞ்சது', 'பதில் முடிந்தது', 'ரெக்கார்டிங் நிறுத்து', 'சேவ் பண்ணு', 'அவ்வளவுதான்'] },
  { type: 'PAUSE', en: ['pause', 'pause (?:my )?answer', 'pause (?:the )?recording', 'take a break', 'stop for a (?:moment|minute|second|bit)'],
    hi: ['पॉज', 'पॉज करो', 'रुको', 'रुकें', 'जरा रुको', `${ANS_HI} रोको`, 'रोक दो', 'रिकॉर्डिंग रोको'],
    ta: ['இடைநிறுத்து', 'இடைநிறுத்தம்', 'இடை நிறுத்து', 'நிறுத்தி வை', 'கொஞ்சம் நிறுத்து', 'பாஸ்'] },
  { type: 'RESUME', en: ['resume', 'resume (?:my )?answer', 'continue (?:my )?answer', 'resume recording', 'continue recording', 'keep recording', 'carry on', 'unpause', 'let(?: s| us) continue'],
    hi: ['रिज्यूम(?: आंसर)?', `${ANS_HI} जारी (?:रखो|रखें)`, 'जारी रखो', 'फिर से शुरू करो', 'चालू करो', 'फिर से चालू करो', 'आगे लिखो'],
    ta: ['பதிலை தொடர்', 'பதில் தொடர்', 'தொடர்', 'ரெஸ்யூம்', 'மறுபடி ஆரம்பி', 'தொடர்ந்து பதிவு செய்'] },
  { type: 'THAT_WAS_MY_ANSWER', en: ['that (?:was|is) (?:part of )?my answer', 'that s my answer', 'thats my answer', 'that was (?:for|in) (?:my|the) answer', 'put (?:that|it) (?:back|in my answer)'],
    hi: [`(?:वह|वो|यह|ये) मेरा ${ANS_HI} (?:था|है)`, 'दैट (?:वाज|इज) माई आंसर', `वो ${ANS_HI} का हिस्सा था`],
    ta: ['அது என் பதில்', 'அது என்னுடைய பதில்', 'அது என் பதில் தான்'] },
  { type: 'CONTINUE', en: ['continue', 'continue (?:the )?(?:exam|test)', 'keep going', 'go on with the (?:exam|test)'],
    hi: ['जारी रखें', `(?:परीक्षा|पेपर) जारी (?:रखें|रखो)`, 'कंटिन्यू(?: एग्जाम)?'],
    ta: ['தொடரவும்', 'தேர்வை தொடர்', 'தேர்வை தொடரவும்', 'கண்டினியூ'] },
  { type: 'CONFIRM', en: ['confirm', 'yes', 'yes confirm', 'confirm (?:change|submission|it)', 'i confirm', 'yes please', 'yes do it', 'go ahead'],
    hi: [`पुष्टि (?:करें|करो|करता हूं|करती हूं)`, 'हां', 'हाँ', 'जी हां', 'हां जी', 'कन्फर्म', 'कंफर्म', 'हां करो'],
    ta: ['உறுதி ?செய்', 'உறுதி ?செய்கிறேன்', 'மாற்றத்தை உறுதி ?செய்', 'ஆம்', 'ஆமாம்', 'கன்ஃபர்ம்', 'ஆமா'] },
  { type: 'KEEP', en: ['keep', 'keep it', 'keep that', 'that s right keep it'],
    hi: ['रखो', 'रखें', 'रख लो', 'कीप', 'ठीक है रखो'],
    ta: ['வை', 'வைத்துக்கொள்', 'வைத்துக் கொள்', 'கீப்', 'வச்சுக்கோ'] },
  { type: 'TRY_AGAIN', en: ['try again', 'no', 'retry', 'nope', 'not that', 'wrong'],
    hi: [`फिर से कोशिश ${DO_HI}`, `दोबारा कोशिश ${DO_HI}`, 'नहीं', 'ट्राई अगेन', 'गलत', 'नहीं नहीं'],
    ta: ['மீண்டும் முயற்சி(?: செய்)?', 'இல்லை', 'ட்ரை அகெய்ன்', 'வேண்டாம்', 'தப்பு'] },

  // ----- hearing things again -----
  { type: 'REPEAT_QUESTION', en: ['repeat (?:the )?question', '(?:read|say|tell me) (?:the )?question(?: again)?', 'what (?:is|was) the question', 'what s the question', 'question again', 'read it again from the question'],
    hi: [`${Q_HI} (?:दोहराओ|दोहराएं|दोहराइए|फिर से पढो|फिर से बोलो|फिर से सुनाओ|सुनाओ|बोलो|बताओ|पढो)`, 'रिपीट क्वेश्चन', `${Q_HI} क्या (?:था|है)`, `क्या ${Q_HI} (?:था|है)`, `फिर से ${Q_HI}`],
    ta: ['கேள்வியை மீண்டும் சொல்', 'கேள்வியை திரும்ப ?சொல்', 'கேள்வியை படி', 'ரிப்பீட் கொஸ்டின்', 'கேள்வி என்ன', 'கேள்வியை சொல்லு', 'கேள்வியை மறுபடி சொல்லு'] },
  { type: 'REPEAT', en: ['repeat', 'repeat that', 'say (?:that|it) again', 'pardon', 'come again', 'say again', 'once more', 'one more time', 'i didn t (?:get|hear|catch) (?:that|it|you)', 'sorry what', 'what did you say'],
    hi: ['दोहराओ', 'दोहराएं', 'फिर से बोलो', 'रिपीट', 'दोबारा बोलो', 'क्या कहा', 'समझ नहीं आया', 'फिर से'],
    ta: ['மீண்டும்', 'மீண்டும் சொல்', 'திரும்ப ?சொல்', 'மறுபடி சொல்லு', 'மறுபடியும்', 'புரியல', 'புரியவில்லை', 'என்ன சொன்னீங்க'] },

  // ----- multiple choice -----
  { type: 'READ_OPTIONS', en: ['(?:read|say|tell me|give me|repeat) (?:all )?(?:the )?(?:options|choices)(?: again)?', '(?:what are )?(?:the )?options', 'options please', 'all options', 'choices', 'list (?:the )?options'],
    hi: [`(?:सारे |सब )?${OPTS_HI} (?:पढो|बताओ|सुनाओ|बोलो)`, OPTS_HI, `${OPTS_HI} क्या (?:हैं|है)`],
    ta: ['(?:விருப்பங்களை|ஆப்ஷன்களை|ஆப்ஷன்ஸ்|விடைகளை|தெரிவுகளை) (?:படி|சொல்லு|சொல்)', 'ஆப்ஷன்ஸ்', 'எல்லா ஆப்ஷனும் சொல்லு'] },
  { type: 'NEXT_OPTION', en: [`next ${OPT_EN}`, `go to (?:the )?next ${OPT_EN}`],
    hi: [`अगला ${OPT_HI}`], ta: [`அடுத்த ${OPT_TA}`] },
  { type: 'PREV_OPTION', en: [`previous ${OPT_EN}`, `go to (?:the )?previous ${OPT_EN}`],
    hi: [`पिछला ${OPT_HI}`], ta: [`முந்தைய ${OPT_TA}`] },
  { type: 'READ_OPTION', o: true, en: [`${OPT_EN} ${O}`, `(?:read|repeat|say) ${OPT_EN} ${O}(?: again)?`, `what (?:is|was) ${OPT_EN} ${O}`, `what s ${OPT_EN} ${O}`, `${O} ${OPT_EN}`, `read (?:the )?${O} ${OPT_EN}`],
    hi: [`${OPT_HI} ${O}`, `${O} ${OPT_HI}`, `${OPT_HI} ${O} (?:पढो|बताओ|सुनाओ|क्या है)`, `${O} ${OPT_HI} (?:पढो|बताओ|सुनाओ|क्या है)`],
    ta: [`${OPT_TA} ${O}`, `${O} ${OPT_TA}`, `${OPT_TA} ${O} (?:படி|சொல்லு|என்ன)`] },
  { type: 'MARK_REVIEW', en: ['mark (?:this |it |this question )?for review', '(?:review|check) (?:this |it )?later', 'flag (?:this|it|this question)', 'flag', 'bookmark(?: this| it)?', 'mark (?:this|it|this question)', '(?:i ll|i will|let me) come back(?: to (?:this|it))?(?: later)?', 'come back (?:to (?:this|it) )?later'],
    hi: ['बाद में (?:देखेंगे|देखूंगा|देखूंगी|करेंगे|करूंगा|करूंगी)', `(?:रिव्यू|रिव्यु) (?:के लिए )?मार्क ${DO_HI}`, `मार्क ${DO_HI}`, `(?:इसे |यह ${Q_HI} )?बाद में देखना है`, 'रिव्यू'],
    ta: ['பின்னர் பார்க்க', 'அப்புறம் பார்க்கலாம்', 'மார்க் செய்', 'மார்க் பண்ணு', 'ரிவ்யூ'] },
  { type: 'UNMARK_REVIEW', en: ['unmark(?: this| it)?', 'remove (?:the )?(?:mark|flag|review mark|bookmark)', 'unflag(?: this| it)?', 'no (?:more )?review'],
    hi: [`मार्क हटा(?:ओ| दो)`, 'अनमार्क करो'],
    ta: ['மார்க் நீக்கு', 'அன்மார்க்'] },
  { type: 'LOCK_CHOICE', o: true, en: [`(?:lock|freeze|confirm) (?:${OPT_EN} )?${O}`, `final answer(?: is)? (?:${OPT_EN} )?${O}`, `${O} (?:is )?(?:my )?final(?: answer)?`, `lock (?:in )?(?:${OPT_EN} )?${O}`],
    hi: [`${O} (?:लॉक|पक्का|फाइनल) ${DO_HI}`, `(?:${OPT_HI} )?${O} (?:फाइनल|पक्का)(?: है)?`, `फाइनल (?:${ANS_HI} )?${O}`],
    ta: [`${O} (?:லாக் செய்|லாக் பண்ணு|உறுதி செய்)`, `${O} ஃபைனல்`] },
  { type: 'LOCK_CHOICE', en: ['lock(?: it| this| that| my answer| the answer| my choice| in| it in)?', 'freeze(?: it| my answer)?', 'final(?: answer)?', 'that s (?:my )?final(?: answer)?', 'confirm (?:my )?(?:answer|choice|option|selection)', 'i(?: m| am) sure'],
    hi: [`लॉक ${DO_HI}`, 'लॉक', 'पक्का', `पक्का ${DO_HI}`, 'फाइनल', `फाइनल ${ANS_HI}`, `${ANS_HI} पक्का(?: है)?`],
    ta: ['லாக் செய்', 'லாக் பண்ணு', 'லாக்', 'ஃபைனல்', 'உறுதி', 'இதுதான் பதில்'] },
  { type: 'UNLOCK_CHOICE', en: ['unlock(?: it| my answer| this| the answer)?', 'change (?:my )?(?:choice|option|selection)', 'i want to change (?:my )?(?:choice|option|selection)'],
    hi: [`अनलॉक ${DO_HI}`, 'अनलॉक', `${OPT_HI} बदलना है`],
    ta: ['அன்லாக் செய்', 'அன்லாக்', 'ஆப்ஷன் மாற்று'] },
  { type: 'CLEAR_CHOICE', en: ['(?:clear|remove|delete|erase|cancel) (?:my |the )?(?:selection|choice|option|pick|tick)', 'unselect(?: it| this)?', 'deselect(?: it| this)?', 'untick(?: it| this)?', 'none of (?:these|them)'],
    hi: [`${OPT_HI} हटा(?:ओ| दो)`, 'सेलेक्शन हटाओ', 'कुछ नहीं चुनना'],
    ta: ['தேர்வை நீக்கு', 'ஆப்ஷன் நீக்கு', 'எதுவும் வேண்டாம்'] },
  { type: 'SELECT_OPTION', o: true, en: [`(?:select|choose|pick|tick|take|mark|go with|i choose|i pick|i select|i ll take|i ll go with|i will go with|i want|my answer is|the answer is|answer is|correct answer is|answer) (?:${OPT_EN} )?${O}`, `(?:${OPT_EN} )?${O} is (?:the )?(?:correct|right|my)(?: answer| option)?`, `(?:select|choose|pick|tick|mark) (?:the )?${O} ${OPT_EN}`, `${OPT_EN} ${O} is my answer`, `it s ${O}`, `it is ${O}`],
    hi: [`${O} (?:चुनो|चुनें|चुन लो|सेलेक्ट ${DO_HI}|लगाओ|टिक ${DO_HI}|मार्क ${DO_HI})`, `${OPT_HI} ${O} (?:चुनो|चुनें|चुन लो|सेलेक्ट ${DO_HI}|सही है)`, `मेरा ${ANS_HI} ${O}(?: है)?`, `सही ${ANS_HI} ${O}(?: है)?`, `${O} सही है`, `${ANS_HI} ${O}(?: है)?`],
    ta: [`${O} (?:தேர்வு செய்|தேர்ந்தெடு|செலக்ட் பண்ணு|டிக் பண்ணு)`, `${OPT_TA} ${O} (?:தேர்வு செய்|தேர்ந்தெடு|சரி)`, `என் பதில் ${O}`, `சரியான பதில் ${O}`, `${O} சரி`] },
  { type: 'MY_CHOICE', en: ['what did i (?:choose|select|pick|tick|mark)', 'which (?:option|one) did i (?:choose|select|pick)', 'my (?:choice|selection|option)', 'what is my (?:choice|selection|option)'],
    hi: [`मैंने (?:क्या|कौन सा) (?:चुना|${OPT_HI} चुना)`, `मेरा ${OPT_HI} (?:क्या है|बताओ)`],
    ta: ['நான் எதை தேர்ந்தெடுத்தேன்', 'என் ஆப்ஷன் என்ன'] },

  // ----- thinking time -----
  { type: 'THINK', en: ['let me think', 'give me (?:some |a |a little |more )?(?:time|minute|moment|second|bit)(?: to think)?', 'wait', 'wait a (?:minute|second|moment|bit)', 'one (?:minute|second|moment)', 'just a (?:minute|second|moment)', 'hold on', 'i(?: m| am) thinking', 'thinking', 'i need (?:some |more )?time(?: to think)?', 'don t (?:disturb|rush) me', 'be quiet', 'quiet', 'shh+', 'hmm let me think'],
    hi: ['सोचने दो', 'रुको सोचने दो', 'एक मिनट', 'एक सेकंड', 'रुकिए', `थोडा (?:समय|टाइम) दो`, `सोच (?:रहा|रही) हूं`, 'वेट', 'वेट करो', 'मुझे सोचना है', 'चुप रहो', 'शांत रहो'],
    ta: ['யோசிக்கணும்', 'யோசிக்கிறேன்', 'ஒரு நிமிஷம்', 'ஒரு நிமிடம்', 'கொஞ்சம் நேரம் கொடு', 'இரு', 'காத்திரு', 'வெயிட்', 'வெயிட் பண்ணு'] },

  // ----- answers: read, edit -----
  { type: 'READ_ANSWER', n: true, en: [`read (?:my )?answer ${N}`, `read (?:the )?${N} answer`, `read (?:my )?answer (?:to|for|of) question ${N}`],
    hi: [`${ANS_HI} ${N} (?:पढो|सुनाओ)`, `${N} ${ANS_HI} (?:पढो|सुनाओ)`, `रीड आंसर ${N}`, `${Q_HI} ${N} का ${ANS_HI} (?:पढो|सुनाओ)`],
    ta: [`பதில் ${N} படி`, `${N} பதிலை படி`, `பதில் ${N}`, `${N} ஆவது பதிலை படி`] },
  { type: 'READ_ANSWER', en: ['read (?:my |the )?answer', 'read it back', 'read back', 'what did i (?:say|write|answer)', 'what have i (?:said|written)', 'read (?:back )?what i (?:said|wrote)', 'play (?:back )?my answer', 'let me hear my answer', 'my answer', 'what is my answer', 'read (?:me )?my answer'],
    hi: [`(?:मेरा )?${ANS_HI} (?:पढो|सुनाओ|बताओ)`, 'रीड (?:माई )?आंसर', 'मैंने क्या (?:लिखा|बोला)', 'पढ कर सुनाओ', 'पढकर सुनाओ', `मेरा ${ANS_HI} क्या है`],
    ta: ['என் பதிலை படி', 'பதிலை படி', 'என்னுடைய பதிலை படி', 'ரீட் மை ஆன்சர்', 'நான் என்ன சொன்னேன்', 'என் பதிலை சொல்லு', 'பதிலை படிச்சு காட்டு'] },
  { type: 'EDIT_ANSWER', n: true, en: [`edit (?:my )?answer (?:to question )?${N}`, `edit (?:the )?${N} answer`],
    hi: [`${ANS_HI} ${N} (?:बदलो|बदलें|संपादित करें|एडिट करो)`],
    ta: [`பதில் ${N} திருத்து`] },
  { type: 'NEXT_SENTENCE', en: [`next ${SEN}`, `go to (?:the )?next ${SEN}`],
    hi: [`अगला ${SEN_HI}`, `अगली ${SEN_HI}`],
    ta: [`அடுத்த ${SEN_TA}`] },
  { type: 'PREV_SENTENCE', en: [`previous ${SEN}`, `go to (?:the )?previous ${SEN}`, `(?:go )?back (?:a|one) ${SEN}`],
    hi: [`पिछला ${SEN_HI}`, `पिछली ${SEN_HI}`],
    ta: [`முந்தைய ${SEN_TA}`] },
  { type: 'NEXT_PARAGRAPH', en: ['next para(?:graph)?', 'go to (?:the )?next para(?:graph)?'],
    hi: ['अगला (?:अनुच्छेद|पैराग्राफ|पैरा)'],
    ta: ['அடுத்த பத்தி'] },
  { type: 'PREV_PARAGRAPH', en: ['previous para(?:graph)?', 'go to (?:the )?previous para(?:graph)?'],
    hi: ['पिछला (?:अनुच्छेद|पैराग्राफ|पैरा)'],
    ta: ['முந்தைய பத்தி'] },
  { type: 'READ_WORDS', en: ['read (?:the |all )?words', 'read (?:it |this )?word by word', 'word by word', 'spell (?:it|this|that|the sentence|out)', 'read (?:each|every) word', 'words'],
    hi: ['शब्द (?:पढो|बताओ)', '(?:एक एक|हर) शब्द पढो', 'शब्द शब्द पढो', 'वर्ड्स? (?:पढो|बताओ)'],
    ta: ['(?:சொற்களை|வார்த்தைகளை) படி', 'ஒவ்வொரு (?:சொல்லாக|வார்த்தையாக) படி'] },
  { type: 'DELETE_WORD', n: true, en: [`${DEL} (?:the )?word ${NO}${N}`, `${DEL} (?:the )?${N} word`],
    hi: [`शब्द ${N} ${DEL_HI}`, `${N} शब्द ${DEL_HI}`],
    ta: [`(?:சொல்|வார்த்தை) ${N} ${DEL_TA}`] },
  { type: 'CHANGE_WORD', n: true, en: [`(?:change|replace|fix|correct|edit) (?:the )?word ${NO}${N}`, `(?:change|replace|fix|correct|edit) (?:the )?${N} word`, `word ${NO}${N}`],
    hi: [`शब्द ${N} ${REPL_HI}`, `${N} शब्द ${REPL_HI}`, `शब्द ${N}`],
    ta: [`(?:சொல்|வார்த்தை) ${N} ${REPL_TA}`, `${N} (?:சொல்லை|வார்த்தையை) ${REPL_TA}`, `(?:சொல்|வார்த்தை) ${N}`] },
  { type: 'DELETE_THIS', en: [`${DEL} (?:this|it|that)(?: ${SEN})?`, `${DEL} (?:the )?(?:current|this) ${SEN}`],
    hi: [`(?:इसे|यह ${SEN_HI}) ${DEL_HI}`],
    ta: [`(?:இதை|இந்த ${SEN_TA}) ${DEL_TA}`] },
  { type: 'REWRITE_THIS', en: [`(?:rewrite|replace|change|redo|edit) (?:this|it|that)(?: ${SEN})?`, `(?:rewrite|replace|change|redo) (?:the )?(?:current|this|whole) ${SEN}`],
    hi: [`(?:इसे|यह ${SEN_HI}|पूरा ${SEN_HI}) (?:${REPL_HI.slice(3, -1)}|दोबारा लिखो)`],
    ta: [`(?:இதை|இந்த ${SEN_TA}) ${REPL_TA}`] },
  { type: 'ADD_AFTER_THIS', en: [`${ADDV}(?: ${SEN})? after (?:this|it|that)(?: ${SEN})?`, `${ADDV}(?: ${SEN})? here`],
    hi: ['इसके बाद (?:जोडो|जोडें|लिखो)'],
    ta: ['(?:இதன்|இதற்கு) (?:பின்|பிறகு) சேர்'] },
  { type: 'READ_THIS', en: ['read (?:this|it|that)(?: again| sentence| line)?', 'read again', 'read (?:the )?(?:current|this) (?:sentence|line)', 'again', 'where am i in the answer'],
    hi: ['(?:फिर से|इसे) पढो', `यह ${SEN_HI} पढो`],
    ta: ['மீண்டும் படி', 'இதை படி'] },
  { type: 'GOTO_SENTENCE', n: true, en: [`(?:go to|goto|jump to|move to|take me to) (?:the )?${SEN} ${NO}${N}`, `(?:go to|jump to|move to) (?:the )?${N} ${SEN}`, `${SEN} ${NO}${N}`, `(?:the )?${N} ${SEN}`],
    hi: [`${SEN_HI} ${N}(?: पर (?:जाओ|चलो))?`, `${N} ${SEN_HI}(?: पर (?:जाओ|चलो))?`],
    ta: [`${SEN_TA} ${N}(?: செல்)?`, `${N} ${SEN_TA}(?: செல்)?`] },
  { type: 'READ_SENTENCE', n: true, en: [`read (?:the |out )?${SEN} ${NO}${N}`, `read (?:the )?${N} ${SEN}`],
    hi: [`${SEN_HI} ${N} (?:पढो|पढें|सुनाओ)`, `${N} ${SEN_HI} (?:पढो|पढें|सुनाओ)`],
    ta: [`${SEN_TA} ${N} படி`, `${N} ${SEN_TA} படி`] },
  { type: 'READ_PARAGRAPH', n: true, en: [`read paragraph ${N}`, `read (?:the )?${N} paragraph`],
    hi: [`(?:अनुच्छेद|पैराग्राफ|पैरा) ${N} पढो`, `${N} (?:अनुच्छेद|पैराग्राफ|पैरा) पढो`],
    ta: [`பத்தி ${N} படி`, `${N} பத்தியை படி`] },
  { type: 'INSERT_AFTER', n: true, en: [`${ADDV}(?: ${SEN})? after (?:the )?${SEN} ${NO}${N}`, `${ADDV}(?: ${SEN})? after (?:the )?${N} ${SEN}`],
    hi: [`${SEN_HI} ${N} के बाद (?:जोडो|जोडें|लिखो)`],
    ta: [`${SEN_TA} ${N} பின் சேர்`, `${SEN_TA} ${N} பிறகு சேர்`] },
  { type: 'INSERT_BEFORE', n: true, en: [`${ADDV}(?: ${SEN})? before (?:the )?${SEN} ${NO}${N}`, `${ADDV}(?: ${SEN})? before (?:the )?${N} ${SEN}`],
    hi: [`${SEN_HI} ${N} से पहले (?:जोडो|जोडें|लिखो)`],
    ta: [`${SEN_TA} ${N} முன் சேர்`, `${SEN_TA} ${N} முன்பு சேர்`] },
  { type: 'CLEAR_ANSWER', en: ['(?:clear|erase|delete|wipe) (?:my |the )?(?:whole |entire |full )?answer', 'start (?:my )?answer (?:again|over)', 'start over', 'delete everything'],
    hi: [`(?:पूरा )?${ANS_HI} (?:मिटाओ|साफ करो|हटाओ|डिलीट करो)`, 'सब मिटा दो', 'सब हटा दो'],
    ta: ['பதிலை அழி', 'முழு பதிலையும் அழி', 'எல்லாம் அழி'] },
  { type: 'EDIT_ANSWER', en: ['edit (?:my |the )?answers?', 'edit', 'editing', 'correct (?:my )?answer', 'change (?:my )?answer', 'fix (?:my )?answer', 'i want to (?:edit|change|correct|fix)(?: my answer)?', 'make (?:a )?changes?', 'review (?:my )?answer', 'go to edit'],
    hi: [`${ANS_HI} (?:बदलो|बदलें|संपादित करें|एडिट करो|ठीक करो|सही करो)`, 'एडिट(?: आंसर)?', 'एडिट करो', 'एडिट करना है', 'बदलना है', `${ANS_HI} में बदलाव करना है`],
    ta: ['பதிலை திருத்து', 'பதில் திருத்து', 'எடிட் ஆன்சர்', 'பதிலை மாற்று', 'பதிலை சரி செய்', 'எடிட் பண்ணு'] },
  { type: 'REPLACE_SENTENCE', n: true, en: [`${REPL} (?:the )?${SEN} ${NO}${N}`, `${REPL} (?:the )?${N} ${SEN}`, `${SEN} ${NO}${N} ${REPL}`],
    hi: [`${SEN_HI} ${N} ${REPL_HI}`, `${N} ${SEN_HI} ${REPL_HI}`, `(?:रिप्लेस|एडिट|चेंज) ${SEN_HI} ${N}`],
    ta: [`${SEN_TA} ${N} ${REPL_TA}`, `${N} ${SEN_TA} ${REPL_TA}`, `${N} ஆவது ${SEN_TA} ${REPL_TA}`] },
  { type: 'DELETE_SENTENCE', n: true, en: [`${DEL} (?:the )?${SEN} ${NO}${N}`, `${DEL} (?:the )?${N} ${SEN}`, `${SEN} ${NO}${N} ${DEL}`],
    hi: [`${SEN_HI} ${N} ${DEL_HI}`, `${N} ${SEN_HI} ${DEL_HI}`, `डिलीट ${SEN_HI} ${N}`],
    ta: [`${SEN_TA} ${N} ${DEL_TA}`, `${N} ${SEN_TA} ${DEL_TA}`, `${N} ஆவது ${SEN_TA} ${DEL_TA}`] },
  { type: 'ADD_TO_ANSWER', en: ['add to (?:my |the )?answer', 'add more', `${ADDV} ${SEN}`, 'add', 'append', 'write more', 'add (?:some )?more (?:to (?:my |the )?answer)?', 'i want to add(?: more)?', 'continue writing'],
    hi: [`${ANS_HI} में जोडो`, 'ऐड टू आंसर', `(?:नया )?${SEN_HI} जोडो`, 'और जोडो', 'ऐड', 'ऐड करो', 'और लिखना है', 'कुछ और जोडना है'],
    ta: ['பதிலில் சேர்', 'பதிலுடன் சேர்', 'ஆட் டு ஆன்சர்', 'இன்னும் சேர்', 'ஆட் பண்ணு'] },
  { type: 'UNDO', en: ['undo', 'undo (?:that|it|last|edit|change|the change|the last change)', 'scratch that', 'delete (?:the )?last (?:part|phrase|bit)', 'take that back', 'revert(?: it)?', 'oops undo', 'put it back the way it was'],
    hi: [`पूर्ववत ${DO_HI}`, 'अनडू', 'अन डू', `अनडू ${DO_HI}`, 'बदलाव वापस लो', `वापस ${DO_HI}`, `पहले जैसा ${DO_HI}`],
    ta: ['செயல்தவிர்', 'செயல் தவிர்', 'அன்டூ', 'அன்டூ பண்ணு', 'மாற்றத்தை திரும்ப பெறு', 'பழையபடி மாற்று'] },
  { type: 'DONE', en: ['done', 'done editing', 'finish(?:ed)? editing', 'stop editing', 'cancel', 'exit(?: edit(?:ing)?| the editor)?', 'close (?:the )?editor', 'i(?: m| am) done editing', 'back to (?:the )?question'],
    hi: ['हो गया', 'संपादन (?:समाप्त|बंद) (?:करो|करें)?', `रद्द ${DO_HI}`, 'कैंसल', 'एडिट (?:खत्म|बंद) करो', 'बदलाव पूरे हुए'],
    ta: ['முடிந்தது', 'திருத்தம் முடிந்தது', 'ரத்து ?செய்', 'கேன்சல்', 'எடிட் முடிஞ்சது'] },

  // ----- moving between questions -----
  { type: 'NEXT', en: ['next question', 'go to (?:the )?next question', 'move (?:on )?to (?:the )?next question', 'skip(?: this| this question| question| it)?', 'move on', 'next question please'],
    hi: [`अगला ${Q_HI}`, 'नेक्स्ट क्वेश्चन', `अगले ${Q_HI} पर (?:जाओ|चलो)`, 'आगे बढो', `स्किप(?: ${DO_HI})?`, 'छोडो', `यह ${Q_HI} छोडो`],
    ta: ['அடுத்த கேள்வி', 'நெக்ஸ்ட் கொஸ்டின்', 'அடுத்த கேள்விக்கு போ', 'ஸ்கிப்', 'தவிர்', 'இந்த கேள்வியை விடு'] },
  { type: 'PREV', en: ['previous question', 'go to (?:the )?previous question', 'go back (?:to the |a )?(?:previous |last )?question', 'back to (?:the )?previous question'],
    hi: [`पिछला ${Q_HI}`, 'प्रीवियस क्वेश्चन', `पिछले ${Q_HI} पर (?:जाओ|चलो)`],
    ta: ['முந்தைய கேள்வி', 'முந்தைய கேள்விக்கு போ'] },
  { type: 'NEXT_ITEM', en: ['next', 'next one', 'go next', 'go on', 'forward'],
    hi: ['अगला', 'नेक्स्ट', 'आगे'],
    ta: ['அடுத்தது', 'அடுத்து', 'நெக்ஸ்ட்'] },
  { type: 'PREV_ITEM', en: ['previous', 'previous one', 'go back', 'back'],
    hi: ['पिछला', 'पीछे', 'प्रीवियस', 'पीछे जाओ'],
    ta: ['முந்தையது', 'பின்னால்'] },
  { type: 'ANSWER_QUESTION', n: true, en: [`answer question (?:number )?${N}`, `start answer(?:ing)? question ${N}`, `i want to answer question ${N}`],
    hi: [`${Q_HI} ${N} का ${ANS_HI} (?:दो|दें|लिखो|बोलता हूं|बोलती हूं)`],
    ta: [`கேள்வி ${N} பதில் சொல்`, `கேள்வி ${N} பதிலளி`] },
  { type: 'GOTO', n: true, en: [`(?:go|jump|move|skip|switch|come|take me|bring me) (?:back )?to question (?:number )?${N}`, `goto question (?:number )?${N}`, `question (?:number )?${N}`, `open question ${N}`, `(?:go|jump) to (?:the )?${N} question`],
    hi: [`${Q_HI} ${N} पर (?:जाओ|जाएं|जाइए|चलो)`, `${N} ${Q_HI} पर (?:जाओ|जाएं|जाइए|चलो)`, `${Q_HI} (?:नंबर )?${N}`, `गो टू क्वेश्चन ${N}`, `${N} नंबर ${Q_HI}`],
    ta: [`கேள்வி ${N} செல்`, `கேள்வி ${N}`, `${N} கேள்விக்கு செல்`, `${N} ஆவது கேள்விக்கு செல்`, `கேள்வி எண் ${N}`, `${N} கேள்விக்கு போ`] },
  { type: 'REMAINING', en: ['how many questions (?:remain|remaining|are remaining|are left|left|do i have left)', 'questions remaining', 'remaining questions', 'how many (?:are )?left', 'which questions are (?:left|unanswered|pending)', 'unanswered questions', 'what s left'],
    hi: [`कितने ${Q_HI} (?:बाकी|बचे) (?:हैं|है)`, `बाकी ${Q_HI}`, `कौन से ${Q_HI} बचे हैं`],
    ta: ['எத்தனை கேள்விகள் மீதம்(?: உள்ளன| இருக்கின்றன)?', 'மீதமுள்ள கேள்விகள்', 'எத்தனை கேள்வி பாக்கி', 'மீதி கேள்விகள்'] },
  { type: 'SUBMIT', en: ['submit (?:the |my )?(?:exam|test|paper|answers)', 'submit', 'hand in(?: my| the)?(?: paper| answers| exam)?', 'finish (?:the )?(?:exam|test|paper)', 'end (?:the )?(?:exam|test)', 'i(?: m| am) done with the (?:exam|test|paper)'],
    hi: [`(?:परीक्षा|पेपर) (?:जमा|सबमिट) ${DO_HI}`, 'सबमिट(?: एग्जाम)?', `सबमिट ${DO_HI}`, 'जमा करो', `(?:परीक्षा|पेपर) खत्म ${DO_HI}`],
    ta: ['தேர்வை சமர்ப்பி', 'சமர்ப்பி', 'சப்மிட் எக்ஸாம்', 'சப்மிட்', 'சப்மிட் பண்ணு', 'பேப்பர் சமர்ப்பி', 'தேர்வை முடி'] },
  { type: 'WHERE_AM_I', en: ['where am i', 'status', 'what is my status', 'which question(?: am i on| is this)?', 'what question (?:is this|am i on)', 'where are we', 'progress'],
    hi: ['मैं कहां हूं', 'मैं कहां हूँ', 'स्थिति', 'स्थिति बताओ', `कौन सा ${Q_HI}(?: है| चल रहा है)?`, `मैं किस ${Q_HI} पर हूं`],
    ta: ['நான் எங்கே இருக்கிறேன்', 'நிலை', 'நிலை என்ன', 'எந்த கேள்வி', 'இது எந்த கேள்வி', 'நான் எந்த கேள்வியில் இருக்கேன்'] },
  { type: 'SLOWER', en: ['(?:speak |talk |read )?slower', 'slow down', 'speak slowly', 'too fast', 'more slowly', 'slowly'],
    hi: ['धीरे बोलो', 'धीरे बोलें', 'धीरे', 'आराम से बोलो', 'थोडा धीरे'],
    ta: ['மெதுவாக பேசு', 'மெதுவாக', 'கொஞ்சம் மெதுவா', 'மெதுவா பேசு'] },
  { type: 'FASTER', en: ['(?:speak |talk |read )?faster', 'speed up', 'speak quickly', 'too slow', 'quicker'],
    hi: ['तेज बोलो', 'तेज बोलें', 'जल्दी बोलो', 'थोडा तेज'],
    ta: ['வேகமாக பேசு', 'வேகமாக', 'சீக்கிரம் பேசு'] },
  { type: 'TIME_LEFT', en: ['how much time (?:is )?(?:left|remaining)', 'time left', 'time remaining', 'how much time do i have(?: left)?', 'how much time', 'how many minutes (?:are )?left', 'what(?: s| is) the time left'],
    hi: ['कितना समय बचा है', 'समय कितना बचा है', 'कितना टाइम बचा है', 'बचा हुआ समय', 'टाइम कितना है', 'कितना टाइम है'],
    ta: ['எவ்வளவு நேரம் உள்ளது', 'எவ்வளவு நேரம் மீதம்', 'மீதி நேரம்', 'மீதமுள்ள நேரம்', 'நேரம் எவ்வளவு', 'டைம் எவ்வளவு'] },
  { type: 'HELP', en: ['help', 'help me', 'help menu', 'what can i say', 'what (?:should|do) i (?:say|do)', 'commands', 'what are the commands', 'how (?:do|does) (?:this|it) work', 'i(?: m| am) stuck'],
    hi: ['मदद', 'सहायता', 'हेल्प', 'मदद करो', 'क्या बोलूं', 'क्या बोलना है', 'कमांड बताओ', 'हेल्प करो'],
    ta: ['உதவி', 'ஹெல்ப்', 'உதவி செய்', 'என்ன சொல்லணும்', 'கட்டளைகள்'] },
  { type: 'CHANGE_LANGUAGE', en: ['change (?:the )?language', 'switch (?:the )?language', 'other language'],
    hi: ['भाषा (?:बदलो|बदलें)', 'चेंज लैंग्वेज', 'लैंग्वेज बदलो'],
    ta: ['மொழியை மாற்று', 'மொழி மாற்று'] },
  { type: 'PRINT', en: ['print (?:the |my )?answer sheet', 'print', 'print (?:my )?answers', 'save (?:as )?pdf'],
    hi: [`उत्तर पत्र प्रिंट ${DO_HI}`, `प्रिंट ${DO_HI}`, 'आंसर शीट प्रिंट करो'],
    ta: ['பதில் தாளை அச்சிடு', 'அச்சிடு', 'பிரிண்ட் பண்ணு'] },
];

const LANG_KEY = { 'en-IN': 'en', 'hi-IN': 'hi', 'ta-IN': 'ta' };
const cache = new Map();

function compiled(lang) {
  const key = LANG_KEY[lang] || 'en';
  if (cache.has(key)) return cache.get(key);
  const out = [];
  for (const c of COMMANDS) {
    const pats = [...c.en, ...(key === 'en' ? [] : c[key] || [])];
    for (const p of pats) {
      // Normalize the literal parts of the pattern the same way input is normalized.
      const src = p.split(/\{[no]\}/).map((part) => part.normalize('NFC').replace(/़/g, '').replace(/ँ/g, 'ं')).join('(\\S+)');
      out.push({ type: c.type, needsN: !!c.n, needsO: !!c.o, re: new RegExp(`^(?:${src})$`, 'u') });
    }
  }
  cache.set(key, out);
  return out;
}

function matchTable(text, lang, allowed) {
  for (const { type, needsN, needsO, re } of compiled(lang)) {
    if (allowed && !allowed.includes(type)) continue;
    const m = text.match(re);
    if (!m) continue;
    if (needsO) {
      const n = parseOptionRef(m[1]);
      if (n === null) continue;
      return { type, n };
    }
    if (needsN) {
      const n = parseNumber(m[1]);
      if (n === null) continue;
      return { type, n };
    }
    return { type };
  }
  return null;
}

/** Commands that differ only by a dictated phrase: "change X to Y". Works on the raw text so case is kept. */
const WORD_REPLACE = {
  en: /^(?:please |can you |could you )?(?:replace|change|changes|changed|chains|chain|chance|correct|fix|make|write|turn|swap)(?: the word| the| word)? (.+?) (?:with|to|into|by|2|too|two|tu|as) (.+?)(?: please| instead)?$/iu,
  hinglish: /^(.+?) (?:ko|ki jagah|ke badle) (.+?) (?:karo|kar do|kardo|likho|likh do|badlo|badal do|se badlo|kar dijiye)$/iu,
  hi: /^(.+?) (?:को|की जगह) (.+?) (?:से बदलो|से बदलें|कर दो|करो|लिखो)$/u,
  ta: /^(.+?) (?:ஐ|என்பதை) (.+?) (?:ஆக|என்று) மாற்று$/u,
};

const REPLACE_WITH_EN = /^(?:please )?(?:replace|change|rewrite) (?:the )?(?:(?:sentences?|statements?|lines?) (?:number |no\.? )?(\S+)|(\S+) (?:sentence|statement|line)|(this|it)(?: sentence| line)?) (?:with|to|as|by) (.+)$/iu;
const REPLACE_WITH_HI = /^(?:वाक्य|लाइन|पंक्ति) (\S+) (?:की जगह|को) (.+?) (?:लिखो|कर दो|करो)$/u;
const FIX_WORD = {
  en: /^(?:please )?(?:fix|correct|wrong word|the wrong word is|change the word|replace the word|fix the word|correct the word) (.+)$/iu,
  hi: /^(.+?) (?:गलत है|गलत लिखा है|ठीक करो|सुधारो)$/u,
  ta: /^(.+?) (?:தவறு|தவறாக உள்ளது|திருத்து)$/u,
};
const ADD_AFTER = {
  en: /^(?:please )?(?:add|insert|write|put) (?:these words |this )?after (?:the word |the words |word )?(.+)$/iu,
  hi: /^(.+?) के बाद (.+?) (?:जोडो|जोड़ो|लिखो)$/u,
  ta: /^(.+?) (?:பின்|பிறகு) (.+?) (?:சேர்|எழுது)$/u,
};

const REMOVE_WORDS = {
  en: /^(?:please |can you |could you )?(?:delete|remove|erase|cut|drop|take out|strike out)(?: the words?| words?| the)? (.+?)(?: please| from (?:my |the |this )?(?:answer|sentence))?$/iu,
  hinglish: /^(.+?) (?:hatao|hata do|hatado|mitao|mita do|nikalo|nikal do|delete karo|delete kar do)$/iu,
  hi: /^(.+?) (?:हटाओ|हटा दो|मिटाओ|मिटा दो|निकालो|निकाल दो|डिलीट करो|डिलीट कर दो)$/u,
  ta: /^(.+?) (?:நீக்கு|அழி|எடுத்துவிடு|நீக்கிவிடு)$/u,
};
const ADD_X_AFTER_Y = /^(?:please )?(?:add|insert|put|write) (?!after\b)(.+?) after (?:the word |the words |word )?(.+)$/iu;

/** Commands that also carry dictated words. Works on the raw text so case and spelling are kept. */
export function parseWordReplace(input, lang = 'en-IN') {
  const raw = String(input || '').trim().replace(/[.?!।]+$/u, '').trim();
  const keys = ['en', LANG_KEY[lang], 'hinglish'].filter((v, i, a) => v && a.indexOf(v) === i);
  // "Replace the second line with …" / "Replace sentence 2 with …" / "Replace this with …"
  let m = raw.match(REPLACE_WITH_EN);
  if (m) {
    const which = m[1] || m[2];
    const n = which ? parseNumber(which) : null;
    if ((which && n !== null) || m[3]) return { type: 'REPLACE_WITH', n: m[3] ? null : n, text: m[4].trim() };
  }
  if (keys.includes('hi')) {
    m = raw.match(REPLACE_WITH_HI);
    if (m && parseNumber(m[1]) !== null) return { type: 'REPLACE_WITH', n: parseNumber(m[1]), text: m[2].trim() };
  }
  for (const k of keys) {
    m = raw.match(WORD_REPLACE[k]);
    if (m && m[1].trim() && m[2].trim()) return { type: 'REPLACE_WORD', from: m[1].trim(), to: m[2].trim() };
  }
  // "delete under", "remove the word under", "under hatao", "under हटाओ"
  for (const k of keys) {
    if (!REMOVE_WORDS[k]) continue;
    m = raw.match(REMOVE_WORDS[k]);
    const w = m && (m[1] || '').trim();
    const isNumber = parseNumber(normalize(w).replace(/^(?:number|no) /, '')) !== null;
    if (w && !isNumber && !/^(?:sentence|sentences|line|lines|statement|word|words|paragraph|para|everything|all|it|this|that|वाक्य|लाइन|शब्द|வாக்கியம்|சொல்)(?:\s|$)/iu.test(w) && normalize(w).split(' ').length <= 6) {
      return { type: 'REMOVE_WORDS', words: w };
    }
  }
  // "add sunlight after using"
  m = raw.match(ADD_X_AFTER_Y);
  if (m && m[1].trim() && m[2].trim()) return { type: 'ADD_AFTER_TEXT', anchor: m[2].trim(), text: m[1].trim() };
  for (const k of keys) {
    if (!ADD_AFTER[k]) continue;
    m = raw.match(ADD_AFTER[k]);
    if (m && k === 'en' && m[1].trim()) return { type: 'ADD_AFTER_TEXT', rest: m[1].trim() };
    if (m && k !== 'en' && m[1].trim() && m[2].trim()) return { type: 'ADD_AFTER_TEXT', anchor: m[1].trim(), text: m[2].trim() };
  }
  for (const k of keys) {
    if (!FIX_WORD[k]) continue;
    m = raw.match(FIX_WORD[k]);
    if (m && m[1].trim() && normalize(m[1]).split(' ').length <= 4) return { type: 'FIX_WORD', word: m[1].trim() };
  }
  return null;
}

/** Find a command phrase inside a longer utterance ("can you go to question four please"). */
function containsCommand(text, lang) {
  let best = null;
  for (const { type, needsN, needsO, re } of compiled(lang)) {
    const inner = re.source.slice(4, -2); // strip ^(?: … )$
    const m = text.match(new RegExp(`(?:^|\\s)(${inner})(?=\\s|$)`, 'u'));
    if (!m) continue;
    let n;
    if (needsN || needsO) {
      const sub = m[1].match(re);
      n = sub ? (needsO ? parseOptionRef(sub[1]) : parseNumber(sub[1])) : null;
      if (n === null) continue;
    }
    const len = m[1].length;
    if (!best || len > best.len) best = { len, cmd: needsN || needsO ? { type, n } : { type } };
  }
  return best && best.len >= text.length * 0.4 && best.len >= 4 ? best.cmd : null;
}

/**
 * Parse an utterance as a command. Tries an exact match, then without polite fillers,
 * then (unless strict) a command phrase inside a longer sentence.
 */
export function parseCommand(input, lang = 'en-IN', { strict = false } = {}) {
  let text = normalize(input);
  if (!text) return null;
  const direct = matchTable(text, lang);
  if (direct) return direct;
  if (strict) return parseWordReplace(input, lang);
  const word = parseWordReplace(input, lang);
  if (word) return word;
  text = text.replace(FILLERS_START, '').replace(FILLERS_END, '').trim();
  if (!text) return null;
  return matchTable(text, lang) || containsCommand(text, lang) || parseEditIntent(text);
}

/**
 * "Select mercury" / "my answer is carbon dioxide": a choice given by the option's words.
 * Only used on a multiple-choice question; the engine matches the words against its options.
 */
const CHOICE_TEXT = /^(?:please |ok |okay |so )?(?:(?:i )?(?:want to |would like to |will |ll )?(?:choose|select|pick|tick|mark|take|go with|go for|switch to|change (?:it |my answer |the answer |my choice )?to|make it|put)|i want|i think (?:it is|it s|the answer is)|my answer is|my answer will be|the answer is|answer is|correct answer is|it is|it s|let s go with)\s+(?:the\s+)?(?:option\s+)?(.+?)(?:\s+(?:please|instead|now|as my answer|as the answer))?$/iu;
const CHOICE_TEXT_HI = /^(?:मेरा )?(?:जवाब|उत्तर) (.+?)(?: है)?$|^(.+?) (?:चुनो|चुनें|चुन लो|सही है)$/u;
const CHOICE_TEXT_TA = /^(?:என் பதில்|சரியான பதில்) (.+)$|^(.+?) (?:தேர்வு செய்|தேர்ந்தெடு|சரி)$/u;
export function parseChoiceText(input, lang = 'en-IN') {
  const raw = String(input || '').trim().replace(/[.?!।]+$/u, '').trim();
  // Just the letter: "B", "B please", "be" (as Chrome writes it), "बी", "பி".
  const bare = normalize(raw).replace(/^(?:ok|okay|so|um|option)\s+/u, '').replace(/\s+(?:please|only|hai|है)$/u, '');
  if (bare && !bare.includes(' ')) {
    const n = parseOptionRef(bare);
    if (n !== null) return { type: 'SELECT_OPTION', n };
  }
  const m = raw.match(CHOICE_TEXT) || (lang === 'hi-IN' && raw.match(CHOICE_TEXT_HI)) || (lang === 'ta-IN' && raw.match(CHOICE_TEXT_TA));
  if (!m) return null;
  const text = (m[1] || m[2] || '').trim();
  if (!text || normalize(text).split(' ').length > 6) return null;
  const n = parseOptionRef(text);
  return n !== null ? { type: 'SELECT_OPTION', n } : { type: 'SELECT_OPTION', text };
}

// Sounds people make while thinking. Heard on their own, they are ignored, not "not understood".
const FILLERS = new Set(['hmm', 'hmmm', 'hm', 'umm', 'um', 'uh', 'uhh', 'ah', 'er', 'erm', 'mm', 'mmm', 'so', 'well', 'acha', 'achha',
  'हम्म', 'हम', 'अं', 'अच्छा', 'उम्म', 'ம்ம்', 'ம்', 'அப்போ']);
export function isFiller(input) {
  const t = normalize(input);
  return !t || FILLERS.has(t) || /^(?:h?m+|u+h*m*|a+h+|e+r+m*)$/u.test(t);
}

const YES = new Set(['yes', 'yeah', 'yep', 'yup', 'ya', 'haan', 'ok', 'okay', 'sure', 'lock', 'final', 'confirm', 'confirmed', 'correct', 'right', 'fine', 'proceed', 'हां', 'हा', 'जी', 'ठीक', 'सही', 'कन्फर्म', 'ओके', 'पुष्टि', 'पक्का', 'बिल्कुल', 'लॉक', 'ஆம்', 'ஆமா', 'ஆமாம்', 'சரி', 'ஓகே', 'உறுதி', 'கண்டிப்பா', 'லாக்']);
const NO_WORDS = new Set(['no', 'nope', 'nah', 'cancel', 'wrong', 'again', 'not', 'dont', 'don', 'नहीं', 'ना', 'गलत', 'रद्द', 'दोबारा', 'இல்லை', 'வேண்டாம்', 'தவறு', 'மீண்டும்']);

/** For confirmation questions: 'yes' | 'no' | null. A "no" word wins ("no, try again"). */
export function parseYesNo(input) {
  const words = normalize(input).split(' ');
  if (words.some((w) => NO_WORDS.has(w))) return 'no';
  if (words.some((w) => YES.has(w))) return 'yes';
  return null;
}

const V = {
  del: new Set(['delete', 'remove', 'erase', 'cut', 'drop', 'हटाओ', 'हटा', 'हटाएं', 'मिटाओ', 'मिटा', 'डिलीट', 'நீக்கு', 'அழி', 'டிலீட்']),
  rep: new Set(['replace', 'change', 'edit', 'rewrite', 'redo', 'correct', 'fix', 'modify', 'update', 'बदलो', 'बदल', 'बदलें', 'एडिट', 'सुधारो', 'रिप्लेस', 'மாற்று', 'திருத்து', 'எடிட்']),
  read: new Set(['read', 'पढो', 'पढें', 'सुनाओ', 'படி']),
  ins: new Set(['insert', 'add', 'put', 'जोडो', 'जोड', 'சேர்']),
  after: new Set(['after', 'बाद', 'பின்', 'பிறகு']),
  before: new Set(['before', 'पहले', 'முன்', 'முன்பு']),
  sentence: /^(?:sentences?|sentense|sentance|statements?|lines?|points?|वाक्य|लाइन|पंक्ति|सेंटेंस|स्टेटमेंट|வாக்கிய|வரி)/u,
  nav: /^(?:question|questions|answer|answers|प्रश्न|सवाल|उत्तर|जवाब|கேள்வி|பதில்)/u,
};
const WEAK_NUMBERS = new Set(['to', 'too', 'for', 'won']);

/**
 * Last-chance understanding of an edit request from its key words: an edit verb plus a
 * sentence number anywhere ("please delete number one", "sentence 2 ko badlo").
 */
export function parseEditIntent(input) {
  const words = normalize(input).split(' ').filter(Boolean);
  if (words.some((w) => V.nav.test(w))) return null;
  let n = null;
  for (const weak of [false, true]) {
    for (const w of words) {
      if (WEAK_NUMBERS.has(w) !== weak) continue;
      const v = parseNumber(w);
      if (v !== null) {
        n = v;
        break;
      }
    }
    if (n !== null) break;
  }
  const has = (set) => words.some((w) => set.has(w));
  const mentionsSentence = words.some((w) => V.sentence.test(w));
  if (has(V.ins) && n !== null && has(V.after)) return { type: 'INSERT_AFTER', n };
  if (has(V.ins) && n !== null && has(V.before)) return { type: 'INSERT_BEFORE', n };
  if (has(V.del) && n !== null) return { type: 'DELETE_SENTENCE', n };
  if (has(V.rep) && n !== null) return { type: 'REPLACE_SENTENCE', n };
  if (has(V.read) && n !== null && mentionsSentence) return { type: 'READ_SENTENCE', n };
  if (has(V.ins) && n === null && (mentionsSentence || words.length <= 3)) return { type: 'ADD_TO_ANSWER' };
  return null;
}

/** Try each recognition alternative; the first that parses wins. */
export function parseCommandAlternatives(alts, lang, opts) {
  for (const a of alts || []) {
    const cmd = parseCommand(a, lang, opts);
    if (cmd) return cmd;
  }
  return null;
}

/**
 * During dictation only standalone stop / pause phrases (and resume / restore while paused)
 * are commands. Matching is strict: the whole utterance must be the phrase, no fillers.
 */
export const DICTATION_COMMANDS = ['STOP_ANSWER', 'PAUSE', 'RESUME', 'THAT_WAS_MY_ANSWER'];
export function parseDictationCommand(input, lang = 'en-IN') {
  const text = normalize(input);
  if (!text) return null;
  return matchTable(text, lang, DICTATION_COMMANDS);
}

const LANGUAGE_WORDS = {
  'en-IN': ['english', 'angrezi', 'inglish', 'इंग्लिश', 'अंग्रेजी', 'அங்கிலம்', 'ஆங்கிலம்', 'இங்கிலீஷ்'],
  'hi-IN': ['hindi', 'हिंदी', 'हिन्दी', 'இந்தி', 'ஹிந்தி', 'hinglish', 'हिंग्लिश'],
  'ta-IN': ['tamil', 'thamizh', 'tamizh', 'தமிழ்', 'तमिल'],
  'te-IN': ['telugu', 'తెలుగు', 'तेलुगु', 'தெலுங்கு'],
  'kn-IN': ['kannada', 'ಕನ್ನಡ', 'कन्नड़', 'कन्नड', 'கன்னடம்'],
  'ml-IN': ['malayalam', 'മലയാളം', 'मलयालम', 'மலையாளம்'],
  'mr-IN': ['marathi', 'मराठी'],
  'bn-IN': ['bengali', 'bangla', 'বাংলা', 'बांग्ला', 'बंगाली'],
  'gu-IN': ['gujarati', 'ગુજરાતી', 'गुजराती'],
  'pa-IN': ['punjabi', 'ਪੰਜਾਬੀ', 'पंजाबी'],
  'ur-IN': ['urdu', 'اردو', 'उर्दू'],
  'or-IN': ['odia', 'oriya', 'ଓଡ଼ିଆ', 'ଓଡିଆ', 'ओड़िया', 'ओडिया', 'उड़िया'],
};

/** Returns a language code ('en-IN', 'hi-IN', 'te-IN', …) when exactly one language is named, else null. */
export function parseLanguage(input) {
  const words = normalize(input).split(' ');
  const hits = Object.entries(LANGUAGE_WORDS)
    .filter(([, list]) => list.some((w) => words.includes(normalize(w))))
    .map(([code]) => code);
  return hits.length === 1 ? hits[0] : null;
}

// ---------- the one way to talk to the app: "Awaaz …" ----------
// The wake word as speech engines write it, in every script the app can listen in.
const WAKE = /^\s*(?:awaaz|awaz|awaaj|awaj|aawaz|aawaaz|aawaj|avaaz|avaz|awaas|awas|aawas|avas|avaas|awaaze|awaze|अवाज|आवाज|आवाज़|आवाझ|ஆவாஸ்|ஆவாஜ்|அவாஸ்|ఆవాజ్|అవాజ్|ಆವಾಜ್|ആവാസ്|ആവാജ്|আওয়াজ|আবাজ|આવાજ|ਆਵਾਜ਼|ਆਵਾਜ|آواز|ଆୱାଜ|ଆବାଜ)(?=[\s,.!?:;।-]|$)[\s,.!?:;।-]*/iu;

/** "Awaaz, read my answer" → { found: true, rest: 'read my answer' }. */
export function stripWake(input) {
  const raw = String(input || '').normalize('NFC');
  const m = raw.replace(/़/g, '').match(WAKE) || raw.match(WAKE);
  if (!m) return { found: false, rest: raw };
  const base = raw.replace(/़/g, '').match(WAKE) ? raw.replace(/़/g, '') : raw;
  return { found: true, rest: base.slice(m[0].length).trim() };
}

// Once the student has tapped or said "Awaaz", the app knows an instruction is coming, so a
// key word is enough: "stop and research" (a misheard "stop answer") still means stop.
// Order matters: the first group that matches wins. Includes romanised Hindi ("answer padho").
const B = '(?:^|\\s)';
const E = '(?=\\s|$)';
const KEYWORDS = [
  ['SUBMIT', `${B}(?:submit|hand in|jama|जमा|सबमिट|சமர்ப்பி|சப்மிட்)`],
  ['TIME_LEFT', `${B}(?:time|minutes?|samay|taim|समय|टाइम|मिनट|நேரம்|டைம்|நிமிட)`],
  ['REMAINING', `${B}(?:left|remaining|baki|baaki|बाकी|बचे|मीतम|மீதம்|பாக்கி)${E}`],
  ['HELP', `${B}(?:help|madad|मदद|हेल्प|उதவி|உதவி)`],
  ['UNDO', `${B}(?:undo|scratch|take (?:that|it) back|andu|अनडू|वापस|அன்டூ)`],
  ['READ_OPTIONS', `${B}(?:options?|choices?|ऑप्शन|विकल्प|ஆப்ஷன்|விருப்ப)`],
  ['THINK', `${B}(?:think|wait|hold on|soch|सोच|वेट|யோசி|வெயிட்)`],
  ['NEXT_ITEM', `${B}(?:next|skip|agla|agle|अगला|अगले|अगली|आगे|छोड|அடுத்த|ஸ்கிப்)`],
  ['PREV_ITEM', `${B}(?:previous|go back|pichla|पिछला|पिछले|पीछे|முந்தைய|பின்னால்)`],
  ['REPEAT_QUESTION', `${B}(?:question|sawal|savaal|सवाल|प्रश्न|கேள்வி)`],
  ['STOP_ANSWER', `${B}(?:stop|finish(?:ed)?|done|end|save|over|bas|band|बस|बंद|स्टॉप|सेव|खत्म|நிறுத்து|போதும்|முடி|ஸ்டாப்|சேவ்)`],
  ['READ_ANSWER', `${B}(?:read|hear|listen|padho|padh|suna|पढ|सुना|सुनाओ|படி|கேள்)`],
  ['EDIT_ANSWER', `${B}(?:change|edit|correct|fix|badlo|badal|बदल|एडिट|ठीक|சரி செய்|மாற்று|திருத்து|எடிட்)`],
  ['START_ANSWER', `${B}(?:start|record|write|continue|resume|likho|shuru|शुरू|लिख|चालू|ஆரம்பி|தொடங்கு|தொடர்|எழுது)`],
  ['WHERE_AM_I', `${B}(?:where|kahan|कहां|कहाँ|எங்கே)`],
  ['SLOWER', `${B}(?:slow|dheere|धीरे|மெதுவ)`],
  ['FASTER', `${B}(?:fast|quick|tez|तेज|வேகம|வேகமா)`],
  ['REPEAT', `${B}(?:repeat|again|pardon|dobara|दोबारा|फिर से|மறுபடி|மீண்டும்)`],
].map(([type, src]) => [type, new RegExp(src, 'u')]);

/**
 * Understand an instruction generously. Exact phrases and commands inside a sentence first,
 * then the first key word. Never used on answer text, only after a tap or "Awaaz".
 */
export function parseInstruction(input, lang = 'en-IN') {
  const exact = parseCommand(input, lang, { strict: true });
  if (exact) return exact;
  const loose = parseCommand(input, lang);
  if (loose && loose.n !== undefined) return loose; // "can you go to question four"
  const t = normalize(input);
  if (!t) return null;
  for (const [type, re] of KEYWORDS) if (re.test(t)) return { type };
  return loose;
}

// "can you mark option B for me", "read option C again", "option b is right": the option is named
// inside a longer sentence. Reading words mean "read it to me"; anything else means "choose it".
const OPTION_MENTION = /(?:^|\s)(?:option|choice|answer|ऑप्शन|विकल्प|ஆப்ஷன்|விடை)\s+(\S+)/u;
const READ_WORDS = /(?:^|\s)(?:read|repeat|say|tell|hear|what|again|पढ|बताओ|सुनाओ|क्या|படி|சொல்லு|என்ன)/u;
export function parseOptionMention(input) {
  const t = normalize(input);
  const m = t.match(OPTION_MENTION);
  if (!m) return null;
  const n = parseOptionRef(m[1]);
  if (n === null) return null;
  return READ_WORDS.test(t) ? { type: 'READ_OPTION', n } : { type: 'SELECT_OPTION', n };
}

/** Similarity 0…1 between two short strings (edit distance). */
export function similarity(a, b) {
  a = normalize(a);
  b = normalize(b);
  if (!a || !b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

// In English-script speech, "Awaaz" can come in the middle of a sentence: Chrome joins
// "…make their food Awaaz read my answer" into one result. Words before it are answer text.
// In Indian scripts it counts only at the start, because आवाज़ / ஆவாஸ் are also ordinary words.
const WAKE_LATIN = /(?:^|\s)(?:awaaz|awaz|awaaj|awaj|aawaz|aawaaz|aawaj|avaaz|avaz|awaas|awas|aawas|avas|avaas|awaaze|awaze)(?=[\s,.!?:;-]|$)[\s,.!?:;-]*/iu;
export function findWake(input) {
  const start = stripWake(input);
  if (start.found) return { found: true, before: '', rest: start.rest };
  // The first word close to "awaaz" as the recogniser may spell it ("awaas", "aawaj", "avaaz").
  const first = String(input || '').trim().split(/\s+/)[0] || '';
  const f = first.toLowerCase().replace(/[^a-z]/g, '');
  if (f.length >= 4 && f.length <= 8 && Math.max(similarity(f, 'awaaz'), similarity(f, 'awaz')) >= 0.75) {
    return { found: true, before: '', rest: String(input).trim().slice(first.length).replace(/^[\s,.!?:;-]+/, '').trim() };
  }
  const raw = String(input || '');
  const m = raw.match(WAKE_LATIN);
  if (!m) return { found: false, before: raw, rest: '' };
  return { found: true, before: raw.slice(0, m.index).trim(), rest: raw.slice(m.index + m[0].length).trim() };
}

// On a multiple-choice question, any lock word means "lock": "lock my option", "lock the answer
// please", and "block answer" (how Chrome often hears "lock answer"). "unlock" is a different word.
const LOCK_WORD = /(?:^|\s)(?:lock|lok|block|blocked|locked|freeze|final|finalise|finalize|confirm|pakka|पक्का|लॉक|ब्लॉक|ஃபைனல்|லாக்)(?=\s|$)/u;
export function parseLockIntent(input) {
  const t = normalize(input);
  if (!LOCK_WORD.test(t) || /(?:^|\s)(?:unlock|un lock|अनलॉक|அன்லாக்)(?=\s|$)/u.test(t)) return null;
  const m = t.match(/(?:^|\s)(?:option|choice|ऑप्शन|विकल्प|ஆப்ஷன்)\s+(\S+)/u) || t.match(/\s(\S+)$/u);
  const n = m ? parseOptionRef(m[1]) : null;
  return n ? { type: 'LOCK_CHOICE', n } : { type: 'LOCK_CHOICE' };
}
