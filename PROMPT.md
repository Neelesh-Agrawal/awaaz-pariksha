# Build prompt: Awaaz Pariksha

Paste everything below the line into Lovable, Replit Agent, Bolt, Cursor or a similar tool. It describes the product Awaaz Pariksha implements. It names no framework-specific files, so the tool can choose its own structure. It recommends React and works without a backend. If you need Python, serve the same front end from a small Flask app; the speech features run in the browser either way.

---

## 0. Interaction model (this section overrides anything below that differs)

- **One thing to remember:** to give an instruction, tap anywhere that is not a control, press Space, or start with the wake word "Awaaz".
  - Recognise the wake word in every script: awaaz / awaz / आवाज़ / ஆவாஸ் / ఆవాజ్ / ಆವಾಜ್ / ആവാസ് / আওয়াজ / આવાજ / ਆਵਾਜ਼ / آواز / ଆୱାଜ.
  - Play a short ping and listen for one instruction in the app's language.
  - If nothing is said within 8 seconds, play a soft falling tone and go back.
  - A tap or Space while the app is talking interrupts it.
- **Instructions are understood generously,** because the student has said it is not answer text:
  1. Exact phrases.
  2. Commands with a number inside a sentence ("can you go to question four").
  3. The first key word in a fixed order. Submit; time; left; help; undo; options; think/wait; next/skip; previous/go back; question; stop/finish/done/बस/போதும்; read/hear/padho/सुनाओ; change/edit/fix; start/record/continue; where; slower; faster; repeat.

  So "stop and research" means stop, and "answer padho" means read my answer.
- **Written questions record by themselves** after the question is read. Everything said is answer text, except:
  - what follows a tap or "Awaaz";
  - an utterance that is exactly a known command;
  - a short utterance starting with "stop" / "बस" / "நிறுத்து".

  After any instruction, the app returns to recording, unless the student stopped.
- **Multiple-choice questions:** there is no recording; every utterance is an instruction.
  - Understand in this order:
    1. An exact phrase.
    2. A bare letter ("B", "be", "see").
    3. A choice verb plus a letter or the option's words: choose / select / pick / I want / switch to / change it to / make it / go with / my answer is.
    4. "option X" inside a sentence: read it if the sentence contains read / repeat / what; otherwise choose it.
    5. Key words.
    6. The option's own words, only at 75% similarity or more. Numbers decide between "100" and "200". Never fuzzy-match other speech against the options.
  - "to", "for" and "the" are never option letters or numbers.
- **Picks never get stuck:** choosing another option replaces even a locked one, and the new pick is not locked ("Changed from C to B, Mercury. Not locked yet.").
- **Coming back to an answered question resumes it** instead of repeating the routine: "Question 6. Your answer is C, Earth, locked." / "Question 1. Your answer has 2 sentences. New speech is added at the end."
- **The wake word in English script counts anywhere in an utterance**, because Chrome joins continuous speech. In "…their food awaaz read my answer", the words before it are answer text. In Indian scripts it counts only at the start, because आवाज़ is also an ordinary word. A ping plays as soon as the wake word appears in the live transcript.
- **Undo instead of yes / no:**
  - Stopping saves at once.
  - Every edit is applied at once, read back ("Sentence 2 is now: …") and followed once by "To take it back, tap and say undo".
  - Only submitting and clearing a whole answer ask "yes or no".
  - Low-confidence phrases are kept and logged; the student is never stopped to answer a question.
- **Fewer words:** sounds for recording, saved, written (a soft tick), not understood, instruction ping and back. Long hints are spoken only the first two times.
- **Languages:**
  - **Answer language:** any Indian language the browser can recognise: en-IN, hi-IN (also Hinglish), ta-IN, te-IN, kn-IN, ml-IN, mr-IN, bn-IN, gu-IN, pa-IN, ur-IN, or-IN.
  - **The app's language:** English, Hindi or Tamil, fully translated.
  - **Switching:** listen in the answer language while recording, and in the app's language for instructions.
  - **Choosing:** the student names a language by voice, or a teacher fixes it for the paper.
  - **Question voice:** questions are read in the voice of their script.
- **Devices:** laptop, Android phone or iPhone, in the browser. **Light mode only.**

## 1. What to build and why

Build **Awaaz Pariksha** (आवाज़ परीक्षा, "voice exam"). It is a voice-first web app that lets a **blind or low-vision student in India answer a written test on their own**, without a human scribe.

**Why it matters:** blind students in India usually depend on a scribe to write their exam answers. Scribes can be careless, slow or dishonest. In one real case, a scribe wrote nothing and submitted a blank paper, and the student lost the whole academic year. This app makes the student the author. The student hears each question, dictates the answer, hears it read back, corrects it, and submits it, all by voice. Nobody else needs to see, type or click.

**Who uses it:** students in Classes 6–12 and college who are blind or have low vision, using desktop Chrome or Android Chrome, with a headset if possible. A teacher or parent may set the questions beforehand, but must not be needed during the test.

**Languages:** Indian English (`en-IN`), Hindi (`hi-IN`) and Tamil (`ta-IN`). All spoken prompts, on-screen labels and voice commands exist in all three languages. English commands always work in addition to the selected language's commands.

**Everyday words, not textbook words.** Prompts use the words students actually speak: in Hindi "जवाब", "सवाल", "अनडू", "सेव", "एडिट", "ऑप्शन", "लॉक"; not "पूर्ववत", "संपादन", "आदेश", "वाक् पहचान". Questions keep the textbook term in brackets next to a plain version, for example "पानी भाप कैसे बनता है? इसे क्या कहते हैं (वाष्पीकरण)?". A native-speaking teacher should review all Hindi and Tamil wording.

**Honesty rules:**
- Show "Practice prototype – not an official examination platform" on screen and on the printed sheet.
- Say that browser speech recognition may need the internet. Never claim it works offline.
- Never generate, translate, correct or "improve" the student's words. The answer is exactly what was recognised, except punctuation the student asks for by name.
- Never switch languages on your own.

## 2. Technology

- A React single-page app, with no login and no backend.
- Speech input uses the browser `SpeechRecognition` (or `webkitSpeechRecognition`) with `continuous = true`, `interimResults = true` and `maxAlternatives = 3`.
- **Offline mode:** school boards such as CBSE allow a computer for blind candidates only without internet. Add a setting that sets `recognition.processLocally = true` (Chrome's on-device recognition). Add an "Exam readiness" panel that calls `SpeechRecognition.available({ langs: [lang], processLocally: true, quality: 'dictation' })` for each language and shows: installed, downloadable (with an **Install** button calling `SpeechRecognition.install(...)` from the click), downloading, or unavailable. If offline mode is on and recognition fails with `service-not-allowed` or `language-not-supported`, explain that the offline language pack is missing.
- Speech output uses `speechSynthesis`, choosing a voice whose `lang` matches the selected language. If no voice exists for that language, show the prompt on screen and send it to an `aria-live` region instead.
- Save everything in `localStorage` so a page reload loses nothing.
- Short sounds ("earcons") come from the Web Audio API and need no audio files.
- Command recognition uses a **deterministic** parser built from regular expressions. Do not use an LLM to decide what a command means.
- For printing, use `window.print()` with print-only CSS. Bundle Noto Sans, Noto Sans Devanagari and Noto Sans Tamil so the printed sheet renders correctly in every script.

## 3. Starting without help

Browsers block sound and microphone use until the user makes a gesture, so the start must be as easy as possible.

- The home screen shows the app name in three scripts, one line ("Take a test by voice. No scribe needed."), **one very large round Start button**, a small card with the paper's title, question count (written / multiple choice) and time, and a "Teacher or parent: upload or type a question paper" disclosure at the bottom.
- **Any key** (except Tab, Shift, Ctrl, Alt, Meta and Caps Lock) or **a tap anywhere** on the page starts the app. The Start button has focus when the page loads. The student never has to find anything.
- If saved answers exist, the button says **Continue** and the session resumes where it stopped.
- With `?autostart=1` in the URL, try to start immediately. This is for exam-centre kiosks whose browser allows autoplay.
- On start:
  1. Request microphone permission.
  2. Play an earcon.
  3. Say, in all three languages: "Welcome to Awaaz Pariksha. Choose English, Hindi or Tamil."
- The student says "English", "हिंदी" or "தமிழ்". Language buttons are also available. Then say "English selected. Say Start exam."

## 4. Speech states, which must always be visible and audible

The states are `IDLE`, `SPEAKING`, `LISTENING_FOR_COMMAND`, `DICTATING`, `EDIT_COMMAND`, `CONFIRMING` and `SUBMITTED`.

- **While the app speaks,** stop recognition so it doesn't hear itself. When speech ends, restart recognition in the correct next state.
- **Restarts:** restart recognition after an unexpected `onend` only if listening is still expected.
- **Escape:** pressing Escape skips the current speech and starts listening at once. The "Stop speaking" button does the same.
- **Earcons:**
  - Two rising notes mean "listening for a command".
  - Three quick notes mean "recording your answer".
  - A chord means "saved".
  - A low buzz means "not understood or error".
- **Visible state for anyone in the room (invigilator, parent, teacher).** One colour carries the current state everywhere: a 5px strip across the very top of the page, the status card's tint and the voice orb.
  - Speaking (blue): the app is talking.
  - Listening (teal): waiting for a command.
  - Recording (red, with a blinking "REC" chip): the student is dictating.
  - Thinking (amber): listening, but the student has been quiet for 5 seconds or said "Let me think". While recording, it says "Thinking · take your time" and keeps the REC chip so it is clear the microphone is still on.
  - Waiting (orange): a yes / no question is open.
  - Editing (violet), Paused (grey), Submitted (green), Microphone problem (red).
- **Voice orb** (like Siri's orb or Wispr Flow's line): a soft circle that swells with the loudness of the student's voice, read from a Web Audio `AnalyserNode` on a separate `getUserMedia` stream (the visual only; nothing is recorded). Under it, nine small bars grow from the middle outwards with the voice. While the app speaks, rings ripple outward. While thinking, the orb breathes slowly and its ring turns dashed. Paused, submitted and error states are still. On Android Chrome, which cannot share the microphone with speech recognition, the orb pulses whenever recognition reports words instead. Respect `prefers-reduced-motion`.
- **"Say now" line:** below the state title, one line lists 3–4 commands that work at this moment. Below that are live captions: what the app said, what it heard (interim text in italics), and what it understood.
- **Silence is thinking time, never a reason to nag.**
  - While recording an answer, silence is never interrupted.
  - Elsewhere, one gentle reminder after a long silence (default 30 seconds; Settings: off, 10 s, 30 s, 1 min, 2 min): "I am still listening. Take your time. Say Help if you need it, or Let me think for more time." Never a second reminder until the student speaks again.
  - "Let me think", "Give me time", "Wait", "One minute", "सोचने दो", "एक मिनट", "யோசிக்கணும்", "ஒரு நிமிஷம்" switch reminders off until the student speaks. While recording, they are not written into the answer.
  - Thinking sounds on their own ("hmm", "umm", "अं", "ம்ம்") are ignored: not answer text, not "not understood".
- **Haptics:** on phones, vibrate briefly with each earcon (only after the student's first tap; browsers block it before).

## 5. Exam flow

1. Saying "Start exam" (or "Start", "Begin", "Let's start") gets the reply "Eight questions. Say Repeat question, Start answer or Go to question two." The app then reads question 1.
2. **Questions:** the default paper has five written science questions and three multiple-choice questions, with hand-written Hindi and Tamil translations:
   - What is photosynthesis? · Name three states of matter. · What is evaporation? · What causes day and night? · Give two ways to save water.
   - Which planet is closest to the Sun? (Venus / Mercury / Earth / Mars)
   - At what temperature does pure water boil at sea level? (0 / 50 / 100 / 200 degrees Celsius)
   - Which gas do plants take in from the air to make food? (Oxygen / Nitrogen / Carbon dioxide / Hydrogen)

   A teacher can replace them by uploading a PDF or typing a paper (section 10).
3. **Dictation:** "Start answer" gets the reply "Recording answer one." Each new *final* recognition result is appended to the answer exactly once. De-duplicate by session and result index. On Android, remove repeated words that an earlier final result already contained.
4. **Stop:** "Stop answer" (or "Stop", "I'm done", "That's all", "Save my answer", "बस", "बस हो गया", "போதும்") gets "Stop recording and save your answer? Yes or no." "Yes" gets "Answer saved." The first two times this happens, the app adds hints: "Say Read my answer, Edit answer or Next question." "No" continues recording.
5. **Submit:** "Submit exam" reads how many questions are answered, lists the unanswered ones, names multiple-choice questions whose pick is not locked ("they will be submitted as picked") and questions marked for review, then asks "Submit now? Yes or no." After "yes", all answers are locked, and the app offers **Print answer sheet** and a separate **Print activity log**. Tell the student that the browser's print dialog is not voice controlled.

### 5a. Multiple-choice questions: pick first, lock when sure

A sighted student reads the question, reads the options, thinks, marks one, may change it, and only then is done. A blind student must get exactly the same freedom, and anyone watching must be able to see the difference between "picked" and "final".

- Reading a multiple-choice question says the question, then "It has 4 options. Say Read options to hear them all, or Option A to hear one at a time." It does **not** read the options until asked, so the student can think about the question first.
- **Hearing options:** "Read options" / "What are the options" reads all ("Option A: Venus. Option B: Mercury. …"). "Option B" / "What is option B" reads one and puts an option cursor there; then plain "Next" and "Previous" move through the options (outside this, "Next" means next question). "Next option" always works.
- **Picking (not final):** "Choose B", "Select B", "My answer is B", "B is correct", "I'll go with B", or the option's words: "Select mercury", "My answer is carbon dioxide", or just "Mercury". Letters are recognised as Chrome writes them ("be", "bee", "see", "sea", "dee"), as numbers ("option 2"), and as Hindi / Tamil labels (क ख ग घ, अ ब स द, அ ஆ இ ஈ). The reply: "You picked option B, Mercury. It is not locked yet. Take your time. Say Lock it when you are sure, or pick another option." The student can keep re-reading options and change the pick freely.
- **Locking (final):** "Lock it", "Final answer", "Confirm my answer", "Yes", "पक्का", "लॉक करो", "லாக் செய்", or in one go "Lock B" / "Final answer B". Reply: "Option B, Mercury, is locked as your answer." A locked answer cannot be changed by picking another option ("Option B is already locked. Say Unlock to change it."). "Unlock" / "Change my answer" reopens it; "Clear my selection" removes an unlocked pick.
- **On screen:** options are large cards with a letter badge. The option being read has a blue ring and a "Reading" tag. A picked option has a dashed amber border and the tag "Picked · not locked". A locked option is solid green with a check in the badge and a "Locked" tag, and the other options fade. Clicking an option picks it (for low-vision students who use a mouse).
- "Start answer" on a multiple-choice question says how to answer it; picking an option on a written question says it needs a written answer.
- "What did I pick?" / "Read my answer" says the pick and whether it is locked.

### 5b. Question states and the palette

Every question has one state, shown in a palette of numbered tiles (like national computer-based tests) with a legend:
- **Not visited** (plain), **Not answered** (visited, red outline), **Answered** (green: written answer present, or option locked), **Picked, not locked** (dashed amber, with the picked letter), **Marked for review** (violet dot, on top of any state).
- "Mark for review", "Flag this", "Come back later", "बाद में देखेंगे", "மார்க் செய்" toggle the review mark; "Unmark" removes it. A "Mark for review" toggle is also in the question card header.

## 6. Freedom: commands work at any moment

This is the most important requirement. The student must never feel stuck.

- **While dictating:** if a whole utterance is exactly a known command, act on it. Examples: "Read my answer", "Go to question 4", "Edit answer", "Replace sentence 2", "Submit exam". **Save the answer first** ("Answer saved.") and then run the command.
  - Single common words such as "yes", "no", "done", "continue" and "repeat" stay answer text.
  - "Stop answer", "Pause", "Help" and "Scratch that" (or "Undo") work as single phrases.
- **Mistaken commands:** if a phrase was taken as a command by mistake, the student says **"That was my answer"**. The phrase is added back to the right answer and dictation resumes there.
- **Pause:** "Pause" stops writing. While paused, the app listens only for "Resume answer", "Stop answer", "That was my answer", "Help" and "Where am I". It still accepts any command that leaves dictation.
- **Outside dictation, matching is lenient.** It ignores polite fillers ("please", "okay", "कृपया") and finds a command inside a longer sentence. For example, "can you please go to question four" means "go to question 4". Try each of the three recognition alternatives and use the first one that parses. On a multiple-choice question, try exact commands, then a choice in words, and only then the loose search, so "my answer is mercury" picks Mercury instead of reading the answer.
- **Many ways to say every command.** Students should never have to learn one exact phrase. Examples (each list continues in Hindi and Tamil, including English loan words written in Devanagari or Tamil script):
  - Start answer: start, begin, start recording, record my answer, take my answer, write my answer, I'm ready, let me answer, answer this · शुरू करो, रिकॉर्डिंग शुरू करो, मेरा जवाब लिखो, मैं तैयार हूं · ஆரம்பி, பதில் சொல்றேன், ரெடி.
  - Stop answer: stop, stop recording, I'm done, that's all, save my answer, end answer, finished · बस, बस हो गया, रिकॉर्डिंग बंद करो, जवाब पूरा हुआ · நிறுத்து, போதும், முடிஞ்சது.
  - Repeat the question: what was the question, read the question again · सवाल फिर से बोलो, सवाल क्या था · கேள்வியை மறுபடி சொல்லு.
  - Read my answer: what did I write, read it back, my answer · मैंने क्या लिखा, मेरा जवाब सुनाओ.
  - Next question: skip, move on · छोड़ो, आगे बढ़ो, स्किप · ஸ்கிப், அடுத்த கேள்விக்கு போ.
  - Yes / no in every confirmation: yes, okay, sure, go ahead, हां, ठीक है, पक्का, ஆமாம், சரி · no, not that, नहीं, இல்லை, வேண்டாம்.
- **Numbers** can be digits, words or ordinals in all three languages, including Devanagari and Tamil digits. "Last", "आखिरी" and "கடைசி" mean the last item.
- **Navigation:**
  - "Next question" and "Previous question"
  - "Go to question 3", "Jump to question 3" and "Question 3"
  - "Answer question 4", which jumps there and starts recording
  - "Read answer 2"
  - "How many questions remain?"
  - "Where am I?" says the question number, the sentence count, how many questions are answered and the time left.
- **Speech and timing:** "Speak slower" and "Speak faster" change the reading speed. "How much time is left?" reports the timer. "Repeat" says the last prompt again. "Help" lists the commands for the current state.

## 7. Writing and editing long answers

- **Spoken punctuation:** "full stop", "comma", "question mark" and "new paragraph" are converted into the marks or a paragraph break. The Hindi forms are पूर्ण विराम, अल्पविराम, प्रश्नवाचक चिह्न and नया अनुच्छेद; the Tamil forms are முற்றுப்புள்ளி, காற்புள்ளி, கேள்விக்குறி and புதிய பத்தி. If one of these is said on its own, attach it to the previous text. No other word is changed.
- **Model:** an answer is a list of dictated chunks. `\n` marks a paragraph break. Sentences are split at `. ? ! । ॥` followed by a space; a chunk without punctuation counts as one sentence. Sentence numbers run through the whole answer, across paragraphs.
- **Reading:** "Read my answer" reads "Answer 1 has 4 sentences. Paragraph 1. Sentence 1. … Paragraph 2. Sentence 3. …". "Read sentence 3" and "Read paragraph 2" read just that part.
- **Sentence-by-sentence editor (the main way to edit):**
  - "Edit answer" says: "Editing answer 1. It has 4 sentences. I will read one sentence at a time. Sentence 1 of 4: …".
  - The app then keeps a **cursor** on one sentence. Never speak a fixed example such as "delete sentence two" as if it were the menu.
  - **Moving:** "Next" and "Previous" move between sentences. "Next paragraph" and "Previous paragraph" jump to the first sentence of a paragraph. "Sentence 4" or "Last sentence" jumps straight there. Outside the editor, "Next" means next question.
  - **Words:** "Read words" reads the current sentence word by word with numbers ("1, they. 2, use. 3, sunlite…").
  - **Fixing ONE word without re-dictating the sentence:**
    - "Change word 3", then the student says the new word.
    - "Fix sunlite": the app finds the closest word using fuzzy matching (edit distance), because the recogniser usually spells the student's correction correctly the second time.
    - "Delete word 3".
  - **This sentence:** "Delete this", "Rewrite this", "Add after this".
  - **In one breath, from the brief:** "Replace the second line with …" and "Add after photosynthesis …". For the second, find the anchor words in the answer, with each word matched closely, and insert the rest after them.
  - Every change is read back as "Sentence 2 will be: …. Confirm or try again?".
  - On screen, the current sentence is highlighted and its words are numbered. Clicking a sentence moves the cursor to it.
- **While dictating, "next sentence" and "next paragraph" (or "next para") are breaks, never answer text.** This works when said inline or on their own.
- **Edit commands by number** also work from the command state; the student doesn't have to say "Edit answer" first:
  - "Replace sentence 2" reads sentence 2, then the student dictates the new one.
  - "Delete sentence 2" and "Delete the last sentence"
  - "Insert after sentence 2" and "Insert before sentence 1"
  - "Add to answer"
  - "Change sunlite to sunlight" fixes one word or phrase. Use whole-word matching first, then any substring. If the word appears more than once, say how many times and change the first one.
  - "Clear answer"
  - "Undo", which restores the previous version and can be repeated
- **Accept everyday wording:**
  - "sentence", "statement", "line" and "point" all mean a sentence, including plurals and common mis-hearings such as "sentense".
  - Allow "number" or "no." before the number ("delete sentence number 1").
  - Accept the number before or after the noun ("delete the first line", "sentence 1 delete").
  - Verbs: edit, change, rewrite, correct, fix and replace all mean *replace*. Delete, remove and erase mean *delete*. "Add statement" and "add a sentence" mean *add to answer*.
  - Fallback: if nothing matches, an edit verb plus a number anywhere in the utterance still works ("please delete number one").
  - Hindi forms such as "वाक्य एक डिलीट करो" and "पहली लाइन हटाओ" work the same way.
- **Confirmation replies:** any yes word confirms: yes, ok, okay, sure, haan / हां, ठीक है, சரி. Any no word means "try again": no, cancel, नहीं, இல்லை.
- **Changing your mind:** while the app waits for a replacement sentence, a clear command such as "delete sentence 1" cancels the replacement and runs.
- **Show understanding on screen:** always display "You said: …" and "Understood as: …" (or ✗), so the student or a tester can see why a command did or did not work.
- **Every change is read back and needs a reply:** "New sentence 2: …. Keep this change? Yes or no." Apply the change only after "yes". "No" asks for the replacement again. All confirmations end in a plain "Yes or no?".
- **History:** keep a per-question undo stack. Log every change with a timestamp, the old text and the new text.

## 8. Errors and recovery

- **Empty result or recognition error:** say "Sorry, I did not catch that. Please repeat." After two failures in a row, add "Move closer to the microphone or use a headset."
- **Low confidence:** if confidence is above 0 but below 0.6, read the phrase back and ask "Keep it? Yes or no.". A confidence of 0, or none at all, gives no information, so accept the phrase. The student can review everything later.
- **Specific errors:** explain blocked microphone permission, network failure (stop restarting after three quick failures), an unsupported language and a missing microphone. Each shows a **Retry microphone** button.
- **Test controls:** under "More", provide a labelled **"Simulate transcription error"** button and a **"Treat next phrase as low confidence"** checkbox, so testers can check the recovery paths.

## 9. Screen layout: calm, polished and readable from across the room

The student cannot see the screen, but the people around them can, and many students have low vision. The screen must look like a finished product: not bare, not decorated. Neutral warm-white background (#f5f4f0), white cards with a 1px border and a soft shadow, 18px corner radius, one navy brand colour for primary buttons (#1c2a5c) with a small saffron accent in the logo, Noto Sans throughout. Colour is reserved for state (section 4) and answer status. No gradients on text, no emoji icons (use simple stroke SVG icons), no decorative illustrations. A full dark theme follows the system setting.

- **Top bar** (sticky): logo mark, app name, paper title; on the right a countdown timer pill (amber under 5 minutes, solid red under 1 minute) and a segmented language switch.
- **Two columns on desktop:** the main column has the status card, the question card and the controls; a 300px sticky side column holds the question palette (section 5b), the legend and the Submit button. One column on phones.
- **Status card:** the voice orb on the left; on the right the state as a large title in the state colour, the "Say now" line and the captions (section 4).
- **Question card:** eyebrow "QUESTION 2 / 8", chips for the type ("Written answer" / "Multiple choice"), marks and status, and a "Mark for review" toggle; then the question in very large text (at least 28px). In Hindi or Tamil mode, the English original appears smaller underneath.
- **Answer:** written answers show as paragraphs with small number badges before each sentence and a blinking red caret while recording, plus the interim words in grey italics. In edit mode the answer becomes a sentence list with the current sentence highlighted in violet and its words numbered. Multiple-choice options are described in section 5a.
- **Buttons:** at most four large buttons for the current state. For example:
  - Command state: Start answer, Read my answer, Edit answer, Next question
  - Dictating: Stop answer, Pause
  - Confirming: Confirm, Try again or Continue

  Everything else goes inside a "More actions" disclosure.
- **Question palette:** see section 5b. Tiles are disabled while recording or while a yes / no question is open.
- **"More" section:** a single collapsed section at the bottom holds the help table (every command in English, Hindi and Tamil, with keyboard shortcuts), settings, teacher setup, the activity log, test controls and a browser check.
- **Accessibility:**
  - High contrast in light and dark themes, with a visible focus ring of 4px or more.
  - Touch targets at least 48px tall.
  - Real `<button>` elements with labels.
  - `lang` attributes on Hindi and Tamil text.
  - A polite live region and an assertive one.
  - Focus moves to the banner on start, to the first Confirm button when a question is asked, and to the results heading after submitting.
- **Keyboard shortcuts:** Alt+Shift+letter. S start answer, X stop, P pause or resume, R repeat question, A read answer, E edit, N next, B previous, Y confirm (locks a multiple-choice pick), C continue, T try again, K keep, U undo, Q submit, M remaining, W where am I, O time left, I read options, G give me time, V mark for review, H help, L repeat the last prompt, 1–6 pick an option. Escape skips speech.
- **Settings:** speak prompts on or off; earcons on or off; vibration on or off; spoken punctuation on or off; send prompts to the screen reader as well; reminder after silence (off, 10 s, 30 s, 1 min, 2 min); speech rate; and "Start over", which asks for confirmation.

## 10. Teacher or parent setup (homework and class tests)

- **Upload a question paper:** a drop zone accepts a PDF (with selectable text) or a .txt file. The file is read in the browser with pdf.js (`pdfjs-dist`, loaded only when needed) and never uploaded. Rebuild lines from text items that share a baseline, left to right. If a PDF has almost no text (a scanned paper), say so and ask for a typed PDF.
- **Or type / paste the paper** into a text area. Both go through the same parser:
  - Questions: "1. …", "1) …", "Q1. …", "Q.1 …", "प्रश्न 1. …", "கேள்வி 1. …"; numbering must continue (a stray number inside text is not a new question).
  - Options: "(a) …", "a) …", "A. …", "(क) …", "(அ) …", NEET-style "(1) …", or "1) …" directly under a question; one per line or all on one line ("(a) Venus (b) Mercury …"). Two or more options make a multiple-choice question.
  - Marks: "[2 marks]", "(3 marks)", "(2 M)", "(1 अंक)", "2 marks" at the end.
  - Lines before the first question: the first short line is the title; "Time: 30 minutes" / "Duration: 1 hour" / "समय: 2 घंटे" sets the time limit.
  - "Section A", "Part B", "खंड क" headers are skipped. Lines starting with "Answer", "Answer key", "Ans:", "उत्तर:", "விடை:" are **removed so students never hear the answers**, with a note to the teacher.
  - If nothing is numbered, each line is one written question.
- **Review before saving:** show "Understood 7 questions: 4 written, 3 multiple choice" and a numbered preview with type and marks chips and the options. The teacher fixes anything in the text area and the preview updates live.
- **Time:** minutes (0 = no limit) and a checkbox, on by default: "Add compensatory time: 20 minutes per hour (at least 5, in multiples of 5), as in the Government of India guidelines for candidates with disabilities", showing the extra minutes and the total. Rule (DEPwD OMs of 29.08.2018 and 10.08.2022): extra = max(5, ceil(minutes × 20 / 60 / 5) × 5). So 10 → +5, 45 → +15, 60 → +20, 180 → +60 (CBSE's figure for a 3-hour paper).
- **Exam language (medium):** "Student chooses at the start" or fixed to English, Hindi or Tamil, as on real exam forms. When fixed, the language question is skipped and "Change language" says "Your teacher has set this paper in Hindi."
- **Figures:** warn when a question mentions a figure, map, graph, picture, चित्र, मानचित्र or படம். Guidelines give visually impaired candidates an alternative question in place of visual ones, so the teacher should replace it.
- Saving new questions clears the current answers after a confirmation. "Use the built-in practice paper" restores the default set.

When a timer is running, the app warns at 5 minutes and at 1 minute. At zero it says "Time is up." and asks for submission confirmation.

## 11. Printable outputs

- **Answer sheet:** title, the disclaimer, language, submission time, blank lines for the student's name and roll number, and each question with its marks followed by its answer as paragraphs. Multiple-choice questions list the options, underline the chosen one and state "Answer: (B) Mercury", adding "picked, not locked" if it was never locked. "(Not answered)" appears where needed. Under each answer, print a **Record** line from the activity log: dictated parts, voice edits and read-backs (or picks and locks), with the first and last time. The 2025 government guidelines cite scribes who "wrote answers independently without adequate dictation"; this line shows an evaluator how each answer was produced. The footer states the time allowed plus compensatory time and whether offline recognition was used. The footer says: "Dictated by the student using browser speech recognition and reviewed by voice, without a human scribe. Wording preserved exactly as recognised."
- **Activity log**, printed separately: every event with date and time, question number, event type and details. Events include dictated chunks, uncertain phrases kept or discarded, spoken punctuation, edits with old and new text, undo, navigation, errors, time warnings and submission.

## 12. Acceptance test (all by voice, with no mouse and nobody helping)

1. Open the page and press any key. Say "English", then "Start exam".
2. "Start answer". Dictate three sentences using "full stop", then "new paragraph", then two more sentences.
3. In the middle of dictating, say "Read my answer". The answer is saved and read back with paragraph labels.
4. Say "Go to question 4". Then say "That was my answer". The phrase returns to answer 1 and recording resumes. Say "Scratch that" to remove it.
5. Say "Change [a word] to [another word]", then "Confirm". Say "Insert after sentence 1", dictate a sentence, then "Confirm change". Say "Replace the last sentence", dictate, then "Confirm".
6. Say "Undo". The previous version is back.
7. Press "Simulate transcription error" twice. The app asks you to repeat, then suggests a headset.
8. Say "Answer question 2", dictate, then "Stop answer" and "Confirm". Answer the remaining questions using "Next question" and "Go to question N".
9. Say "Where am I?" and "How many questions remain?".
10. Say "Go to question 6". The app reads the question and waits. Say "Option A", then "Next". Say "Choose A": the option turns dashed amber, "Picked · not locked". Say "Let me think" and stay silent for two minutes: nothing interrupts. Say "My answer is mercury", then "Lock it": B turns solid green and the tile turns green. Say "Select C": the app says B is already locked.
11. On question 8 say "I choose carbon dioxide" and "Mark for review", but do not lock it. Say "Submit exam": the summary names question 8 as picked but not locked and as marked for review. Say "yes". Say "Read answer 2". Then press Print answer sheet, choose Save as PDF, and check that Hindi and Tamil text renders.
12. Reload the page in the middle of the test and press any key. Everything is restored.
13. As a teacher, upload a PDF question paper with numbered questions, "(a) (b) (c) (d)" options, "[2 marks]" and an "Answer:" line. The preview shows the right questions, types and marks, and the answer line is gone. Save, start, and take the paper by voice.
