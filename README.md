# Awaaz Pariksha (आवाज़ परीक्षा · ஆவாஸ் பரீக்ஷா)

A voice-first **practice** exam app for blind and low-vision students in India. Students hear each question, answer by voice (written answers are dictated; multiple-choice questions are answered by picking an option and then locking it), review and edit sentence by sentence, mark questions for review, submit, and print an answer sheet. They don't need sight, typing or a human scribe to do any of this.

> **This is not an officially approved examination platform.** It is a practice prototype.

## How a student uses it (v1, agreed in [PLAN.md](PLAN.md))

There is **one thing to remember**:

- **To give the app an instruction:** tap anywhere, press **Space**, or start with **"Awaaz"**. Then say it in your own words: "read it back", "change sentence two", "stop", "next question", "how much time is left". A short ping means the app is listening for the instruction. If nothing is said, it goes back quietly after 8 seconds.
- **Written questions:** the question is read, and recording starts by itself. The student just speaks. Everything said goes into the answer, except what follows a tap or "Awaaz".
  - **Stopping:** "stop" (even when it's misheard as "stop and research") saves at once.
  - **Mistakes:** if a phrase was taken as an instruction by mistake, "that was my answer" puts it back.
- **Multiple-choice questions:** there is nothing to record, so everything said is an instruction ("read the options", "B", "lock B").
- **Changes happen at once and are read back.** "Undo" reverses them. Only submitting the paper and clearing a whole answer ask "yes or no".
- **Unsure phrases** are kept and marked in the log; the student is never stopped to answer a question.
- **Languages:**
  - Answers can be in English, Hindi (including Hinglish), Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Urdu or Odia. Each browser supports a different subset.
  - The app talks in English, Hindi or Tamil.
  - Instructions are heard in the app's language even while answers are heard in another.
- **Devices:** a laptop, an Android phone or an iPhone, in the browser.
- **Screen:** light mode only.

## Hackathon fit: Scaler × Wispr "India Runs on Voice"

The rules say the hackathon is built hands-free with Wispr Flow: teams dictate their code and prompts with Flow while building. They do not require the product to call the Wispr Flow API. Awaaz Pariksha fits the **Education** track ("spoken quizzes in a student's own language") and the **Everyday access** track (apps for people with disabilities).

The app stays on the browser's own speech engine. Wispr's API is built to clean up what people say, removing fillers and self-corrections. That suits homework notes, but in an exam the student's words must be kept exactly, and the API key would need a small backend server. Adding it later as an optional engine for homework mode is possible.

## How exams work for blind students today, checked against the build

Researched on 19 November 2026 from the official guidelines and the sources in the project brief.

**The rules**

- **Which rules apply.** School board, college and university exams follow the DEPwD guidelines of [29 August 2018](https://cdnbbsr.s3waas.gov.in/s3e58aea67b01fa747687f038dfde066f6/uploads/2023/11/202311171735619892.pdf) and [10 August 2022](https://cdnbbsr.s3waas.gov.in/s3e58aea67b01fa747687f038dfde066f6/uploads/2023/11/202311171714558279.pdf). Competitive exams (JEE, NEET, CLAT, UPSC, SSC) are covered by the [Revised Comprehensive Guidelines of 1 August 2025](https://cdnbbsr.s3waas.gov.in/s3e58aea67b01fa747687f038dfde066f6/uploads/2025/08/202508181436575108.pdf). The [DEPwD page](https://depwd.gov.in/en/guidelines-2/) shows those were put in abeyance, most recently extended in June–July 2026, so the 2018/2022 rules are what schools use today.
- **How it works now.** A blind candidate gets a **scribe / reader**: the scribe reads the paper aloud and writes what the candidate dictates. The scribe must be less qualified than the candidate. Candidates choose a scribe or get one from the exam body, and may meet the scribe beforehand. Scribes are hard to find, cost families ₹200–500, cancel at the last minute, and cannot be checked by the student ([IDR](https://idronline.org/ground-up-stories/the-challenge-for-blind-students-to-find-good-scribes/), [The News Minute](https://www.thenewsminute.com/karnataka/visually-impaired-bengaluru-students-struggle-find-scribes-colleges-play-their-own-rules), [DT Next](https://www.dtnext.in/amp/story/news/tamilnadu/shortage-of-tamil-scribes-to-aid-the-blind)).
- **Compensatory time.** It is **not less than 20 minutes per hour**, pro-rata for shorter papers, **never less than 5 minutes and always in multiples of 5**. It is given whether or not a scribe is used. CBSE gives 60 minutes on a 3-hour paper.
- **Technology instead of a scribe.**
  - **2018:** the candidate may choose Braille, computer, large print or **recorded answers**.
  - **2025:** exam bodies "shall encourage candidates to take the examination independently", with laptops, Braille, large print or "by recording their answers", "with comprehensive coverage for Indian Languages and English", and should "decrease the need for scribes gradually". The 2025 text gives the reason: malpractice where "scribes wrote answers independently without adequate dictation".
  - **Courts:** the Supreme Court allowed screen-reader typing for CLAT ([LiveLaw](https://www.livelaw.in/amp/top-stories/supreme-court-order-visually-impaired-candidates-and-clat-examination-301537)) and ordered UPSC to frame assistive-technology rules ([Verdictum](https://www.verdictum.in/court-updates/supreme-court/mission-accessibility-v-union-of-india-2025-insc-1376-pwd-rights-equality-upsc-protocols-screen-reader-software-1599975)).
  - **SSC:** it ended "own scribe" in 2025 ([Careers360](https://news.careers360.com/ssc-ends-own-scribe-facility-for-pwbd-candidates-adopts-depwd-guidelines-accessibility-extra-time-centres-fair-exams)).
- **CBSE (board exams).** Candidates get a scribe and/or compensatory time. They may use a **computer without internet**, with screen readers allowed with prior approval. Questions with visual input (maps, figures) are replaced by **alternative questions** for visually impaired students ([CBSE provisions summary](https://school.careers360.com/boards/cbse/cwsn-benefits-in-cbse)).
- **Centres.** Seating is on the ground floor; audio announcements are made for visually impaired candidates; staff are trained on assistive technology. Communication happens in the medium chosen in the application, with invigilators who know that language. Candidates' data is protected under the DPDP Act 2023.
- **Where things are going.** In 2026, Madras Christian College announced an AI voice scribe for English and Tamil, on a restricted server ([DT Next](https://www.dtnext.in/news/chennai/empowering-tool-mccs-ai-voice-scribe-to-write-exams-for-blind-students)).

**How Awaaz Pariksha compares**

| Real-world rule or practice | In the app |
|---|---|
| Reader reads the paper; candidate can ask again | The app reads each question and option; "Repeat question", "Read options", "Option B" |
| Scribe writes exactly what is dictated | Verbatim dictation; nothing corrected or translated; spoken punctuation only on request |
| Student cannot check a scribe's work | Read back, sentence-by-sentence editing, undo; MCQ picks must be locked |
| Integrity concerns ("answers written without adequate dictation") | Timestamped activity log; each answer on the printed sheet has a **Record** line (dictated parts, voice edits, read-backs, picks, locks, times) |
| Compensatory time: 20 min/hour, pro-rata, min 5, multiples of 5 | Teacher setup adds it by default and rounds by the rule (10 → +5, 45 → +15, 180 → +60); timer warnings at 5 and 1 minutes |
| Medium chosen at application; invigilators know it | Teacher can **fix the exam language**; captions show what was heard and understood |
| Typed or recorded answers printed for evaluation | Printable answer sheet and separate activity log |
| CBSE: computer **without internet** | **Offline mode** uses Chrome's on-device recognition where available. "Exam readiness" checks and installs language packs. ⚠ Availability for en-IN, Hindi and Tamil depends on the browser and device; in our test browser it was not available. Without it, the app needs internet, which a board would not allow today. |
| Alternative questions in place of visual-input questions | The paper parser warns the teacher when a question mentions a figure, map, graph or picture |
| Meeting the scribe / checking the system before the exam | Use the built-in practice paper and the readiness check the day before |
| Separate quiet room | Recommended: the student speaks aloud, so seat them apart or use a headset microphone |

**Still open:** offline speech for Hindi and Tamil, approval by a board, and trials with blind students and invigilators.

## Rebuild prompt

[PROMPT.md](PROMPT.md) is a complete prompt you can paste into Lovable, Replit or a similar tool to rebuild this product. It includes the reasons behind each design choice and a 13-step acceptance test.

## What a sighted person in the room sees

The student can't see the screen, but an invigilator, parent or teacher can. One colour carries the current state everywhere: a strip across the top of the page, the status card and the voice orb.

| State | Colour | Orb |
|---|---|---|
| App speaking | blue | rings ripple outward |
| Listening for a command | teal | swells with the student's voice |
| Recording an answer | red, with a blinking REC chip | swells with the voice; nine bars grow from the middle |
| Thinking (quiet for 5 s, or "Let me think") | amber | breathes slowly, dashed ring |
| Waiting for yes / no | orange | slow ripple |
| Editing | violet | swells with the voice |
| Paused · Submitted · Mic problem | grey · green · red | still |

The orb reads the loudness of the voice from a separate microphone stream with the Web Audio API, only to draw it; nothing is recorded. On Android Chrome, which cannot share the microphone with speech recognition, it pulses when words are recognised instead.

## Multiple choice: pick first, lock when sure

- The question is read, then "It has 4 options. Say Read options, or Option A to hear one at a time." The options are not read until the student asks, so they can think about the question first.
- "Option B" reads one option; "Next" and "Previous" then move through the options.
- **Picking is not final:** "Choose B", "My answer is B", "B is correct", "Select mercury", or just "Mercury". On screen the option turns **dashed amber, "Picked · not locked"**. The student can keep re-reading and change their pick.
- **Locking is final:** "Lock it", "Final answer", "Yes", "पक्का", "லாக் செய்" (or "Lock B" in one go). The option turns **solid green with a check, "Locked"**, and the others fade. "Unlock" reopens it.
- At submission the app names any pick that was never locked, and any question marked for review.

## Thinking time, not nagging

- Silence while recording an answer is never interrupted.
- Elsewhere there is **one** gentle reminder after 30 seconds ("I am still listening. Take your time."), then nothing until the student speaks. The delay can be changed or switched off in Settings.
- "Let me think", "Give me time", "Wait", "One minute", "सोचने दो", "एक मिनट", "யோசிக்கணும்" switch reminders off until the student speaks again.
- "Hmm", "umm" and similar thinking sounds are ignored: they are not written into the answer and do not cause "not understood".

## Say it your way

Every command has several everyday phrasings, in English, Hindi and Tamil, including English loan words such as "स्टार्ट", "सबमिट", "ஸ்கிப்". For example:

- Start answer: "Start", "Start recording", "Take my answer", "I'm ready", "जवाब लिखो", "रिकॉर्डिंग शुरू करो", "பதில் சொல்றேன்"
- Stop answer: "Stop", "I'm done", "That's all", "Save my answer", "बस", "बस हो गया", "போதும்"
- Repeat question: "What was the question", "सवाल क्या था", "கேள்வியை மறுபடி சொல்லு"
- Next question: "Skip", "Move on", "छोड़ो", "ஸ்கிப்"
- Every confirmation is a plain **yes or no** question.

Spoken prompts use everyday words: in Hindi "जवाब", "सवाल", "अनडू", "सेव", "एडिट", not "पूर्ववत", "संपादन", "आदेश". Questions keep the textbook term in brackets next to a plain version, for example "पानी भाप कैसे बनता है? इसे क्या कहते हैं (वाष्पीकरण)?". **A native-speaking teacher should still review the Hindi and Tamil.**

## Upload a question paper

Under "Teacher or parent" on the home page (and under "More" during a test):

- **Upload a PDF** with selectable text, or a .txt file. It is read on the device with pdf.js and never uploaded. Or type / paste the paper.
- The parser understands "1.", "Q1)", "प्रश्न 1", "கேள்வி 1"; options "(a)", "a)", "A.", "(क)", "(அ)" and NEET-style "(1)", one per line or all on one line; marks such as "[2 marks]" or "(1 अंक)"; "Time: 30 minutes" as the time limit; and section headers.
- Lines starting with "Answer:", "Answer key" or "उत्तर:" are **removed** so students never hear the answers.
- The teacher sees "Understood 7 questions: 4 written, 3 multiple choice" with a preview, fixes anything in the text box, and saves.
- Compensatory time (20 minutes per hour, at least 5, in multiples of 5) is added by default, and the teacher can fix the exam language.
- Questions that mention a figure, map, graph or picture are flagged, because blind students get an alternative question in their place.
- Scanned papers (photos of pages) have no text layer; the app says so. Reading them would need OCR, which is a possible next step.

Try it with [samples/sample-paper.pdf](samples/sample-paper.pdf) (regenerate with `node scripts/make-sample-paper.mjs`).

## Editing written answers by voice

"Edit answer" opens a sentence-by-sentence editor:

- **The real sentence is read,** for example "Sentence 1 of 4: …". The app doesn't recite a fixed menu.
- **Move:** "Next", "Previous", "Next paragraph" and "Sentence 4".
- **One word:** "Read words" reads the sentence with numbered words. "Change word 3" fixes one word, and you say only the new word. "Fix sunlite" finds the closest-sounding word. "Delete word 3" removes one word.
- **This sentence:** "Delete this", "Rewrite this" and "Add after this".
- **In one sentence:** "Replace the second line with …" and "Add after photosynthesis …" work without the editor.
- **While dictating:** "Next sentence" and "next para" end a sentence or start a paragraph. They are never written as text.

## Freedom while answering

- **Commands work at any moment, including mid-dictation.** If a whole utterance is a command ("Read my answer", "Go to question 4"), the answer is saved and the command runs. "That was my answer" undoes it if the words were meant as answer text.
- **Commands are matched leniently outside dictation.** "Can you please go to question four" works, and all three recognition alternatives are tried.
- **Starting needs no help:** any key or a tap anywhere starts the app. `?autostart=1` starts it straight away on kiosks that allow autoplay.
- **Spoken prompts get shorter** after the first two times.
- **Sounds and vibration** show what the microphone is doing: two rising notes mean "say a command", three quick notes mean "recording", a chord means "saved", a low buzz means "not understood". Phones also vibrate.
- **Escape skips speech.**

## Run

**With Docker (no keys or accounts needed):**

```bash
docker compose up --build
```

Then open **http://localhost:8080** in Google Chrome and allow the microphone. The build runs all tests first; if a test fails, the image is not built.

**Without Docker:**

```bash
npm install
npm run dev      # http://localhost:5173 in Google Chrome
npm test         # parser, paper parser and end-to-end state-machine tests
npm run build    # static build in dist/
```

Use **Google Chrome** (desktop or Android). Chrome's speech recognition sends audio to an online Google service, so it **needs an internet connection**. Recognition must run on `localhost` or `https` because the microphone needs a secure context.

## Languages

English (`en-IN`), Hindi (`hi-IN`) and Tamil (`ta-IN`). Students choose by voice ("English", "हिंदी", "தமிழ்") or with the buttons. English commands always work; the selected language's commands are added on top. The app only changes language when the student asks. If no speech voice is installed for the language, prompts are shown on screen and sent to the screen reader instead. On Windows, Hindi has a "Google हिन्दी" voice, but Tamil usually needs a Microsoft Tamil voice installed.

## How it is built

| File | Role |
|---|---|
| `src/lib/commandParser.js` | Deterministic parser. A phrase must match a full pattern after normalization (case, punctuation, Hindi nukta and chandrabindu, Tamil sandhi). Numbers, ordinals, Devanagari / Tamil digits and spoken option letters are understood. |
| `src/lib/engine.js` | State machine (`IDLE, SPEAKING, LISTENING_FOR_COMMAND, DICTATING, EDIT_COMMAND, CONFIRMING, SUBMITTED`), multiple-choice pick / lock, review marks, thinking time, confirmations, undo, the activity log and error recovery. |
| `src/lib/speech.js` | Web Speech API wrapper: recognition is stopped while the app speaks and restarted only when expected; duplicate results are dropped; long text is spoken in pieces with a watchdog. |
| `src/lib/micLevel.js` | Voice loudness for the orb (Web Audio `AnalyserNode`). |
| `src/lib/paperParser.js`, `src/lib/pdfText.js` | Question paper parsing and PDF text extraction. |
| `src/lib/sentences.js` | Sentences, paragraphs, words, spoken punctuation and fuzzy word matching. |
| `src/i18n.js`, `src/data/questions.js` | Prompts, labels and the built-in paper in all three languages. |
| `src/App.jsx`, `src/components/*` | The interface: status card and voice orb, question card and options, palette, controls, teacher setup, answer sheet and activity log. |

Answers are stored **exactly as recognized**. Nothing is translated, corrected or generated. Recognition results with a confidence above 0 but below 0.6 are read back with "Keep it? Yes or no."

Every dictated chunk, pick, lock, edit and the full timestamped log are saved to `localStorage`. Reloading the page restores the session.

## Accessibility and keyboard

Every voice command has a button. Shortcuts are **Alt+Shift+letter**: S start answer, X stop, P pause or resume, R repeat question, A read answer, E edit, N next, B previous, Y confirm or lock, C continue, K keep, T try again, U undo, Q submit, M remaining, W where am I, O time left, I read options, G give me time, V mark for review, H help, L repeat last prompt, **1–6** pick an option. **Esc** stops the app speaking. The full table is in the in-app Help panel.

## Printing

After submission, **Print answer sheet** and **Print activity log** open Chrome's print dialog; choose **Save as PDF**. Multiple-choice answers show the chosen option and whether it was locked. The fonts (Noto Sans, Noto Sans Devanagari and Noto Sans Tamil) are bundled, so Devanagari and Tamil print correctly. **The print dialog belongs to the browser and is not voice controlled.**

## Testing

`npm test` runs 194 tests, including the full voice flow with a fake recogniser: dictation, editing, multiple choice pick → think → change → lock, review marks, thinking time with no reminders, the timer with compensatory time, and the paper parser on CBSE, NEET, Hindi and Tamil layouts.

## How this was built

Everything here was written from scratch during the Scaler × Wispr "India Runs on Voice" hackathon (November 2026). No starter template was used. Development happened in a local folder; this repository starts at the Round 2 submission, so its history is short.

- Round 1, Activity 1: the working prototype and its plan ([PLAN.md](PLAN.md)).
- Round 1, Activity 2: the rebuild prompt ([ACTIVITY2.md](ACTIVITY2.md); a longer version is in [PROMPT.md](PROMPT.md)).
- Round 1, Activity 3: impact ([ACTIVITY3.md](ACTIVITY3.md)).
- Round 2: refinements from real tests, Docker packaging, demo and deck.
