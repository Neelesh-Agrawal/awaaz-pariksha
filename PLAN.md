# Awaaz Pariksha — product plan (draft for approval)

Status: **approved 22 Nov 2026** (with the changes below). Once approved, changes go into this plan first and into the code second.

## 1. Who and where

- **Users:** blind and low-vision students in Classes 6–12 and college, studying theory subjects (Science theory, Social Science, languages, commerce). They speak Indian English, Hindi, Tamil or another Indian language, and often mix English words in (for example, "photosynthesis mein plants food banate hain").
- **Where:**
  - Practice and homework at home.
  - School internal tests, with a teacher or invigilator present.
  - Board exams are out of scope for now.
- **Devices:** a laptop, an Android phone or an iPhone, in the browser (Chrome on laptop and Android, Safari on iPhone), preferably with a headset.
- **Languages:**
  - **Answers:** any Indian language the browser's speech engine can recognise. The list is English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Urdu and Odia; each browser supports a different subset.
  - **The app's voice and instructions:** English, Hindi or Tamil, all fully translated. Students who answer in another language hear the app in English, Hindi or Tamil.
  - **Testing:** English, Hindi and Tamil.
- **Not in v1:** maths, formulas, diagrams, board exams, AI for instructions, and Wispr Flow.

## 2. The promise

> A blind student can do a full theory paper (up to 3 hours, or 4 with extra time) alone. They need to remember only **one thing**, and they never lose an answer.

## 3. The five design rules

1. **The answer and talking to the app are kept apart.**
   - **Root cause of today's failure:** "stop answer" was heard as "stop and research" and written into the answer.
   - **The fix:** everything the student says goes into the answer. To talk to the app, they first do the **one thing**:
     - **Tap anywhere on the screen, or press the Space bar.** This works the same in every state.
     - **Or say the wake word "Awaaz"** before the instruction ("Awaaz, read my answer").
   - The app plays a short sound, and the next sentence is treated as an instruction.
   - There are no gestures to learn and no list of commands to memorise.
2. **The student can say an instruction in their own words.**
   - When online, AI turns the instruction into an action. For example, "go back to the second line and read it" becomes "read sentence 2".
   - The AI **only controls the app**. It never writes, completes, corrects or suggests answer text. Answer text is always exactly what the speech engine heard.
   - When offline, a small fixed set of about 10 instructions still works, matched loosely.
3. **Fewer words from the app, more sounds.**
   - Saving, recording, "I didn't understand" and similar states each get a distinctive sound instead of a sentence.
   - The app speaks only when it has something to say: the question, a read-back, or an answer to the student's question.
   - The student can interrupt the app at any time (tap, Space, or "Awaaz").
4. **Undo instead of "yes or no?"**
   - Changes happen immediately and can be undone ("Awaaz, undo").
   - Only two actions ask first: **submitting the paper** and **clearing a whole answer**.
5. **To fix a mistake, say it again.**
   - The app reads the answer back sentence by sentence.
   - At any sentence, the student says "Awaaz, change this" and speaks the sentence again. Or they use their own words: "Awaaz, the second sentence should be: …".
   - Word-by-word editing stays available, but it isn't the main way to fix mistakes.

## 4. The voice flow

| Step | Student | App |
|---|---|---|
| Start | Taps anywhere or presses any key | Plays a sound, then says: "Awaaz Pariksha. Science homework, 8 questions, 1 hour. Tap or say Awaaz to talk to me. Question 1: …" |
| Answer | Just speaks | Writes the words verbatim. A soft tick confirms each saved sentence. Silence is never interrupted. |
| Instruction | Taps, then: "read it back" | Reads the answer, one sentence at a time |
| Fix | Taps, then: "change the second one", then speaks the new sentence | Replaces the sentence and reads it back: "Sentence 2 is now: …" |
| Multiple choice | Taps, then: "read the options", then "I think B", then later "lock B" | Picked (amber) and locked (green) look different. Picks that were never locked are listed at submission. |
| Move | Taps, then: "next" / "go to question 5" / "what's left" | Moves, or answers the question |
| Time | Taps, then: "how much time" | Answers. Also announces 30, 10 and 5 minutes left. |
| Submit | Taps, then: "submit" | "6 of 8 answered; 7 and 8 are empty. Submit?" Only a yes submits. |

## 5. When things go wrong

- **Noise or missed speech:** a short "didn't catch that" sound. After two in a row, the app suggests a headset.
- **Accent or low confidence:** the text is kept and marked, and the student can review it later. The app doesn't stop to ask.
- **Mixed language:** "Hindi + English" mode. Words are written as heard, and English words may appear in Devanagari. *(Decision C.)*
- **An instruction the app didn't understand:** "I didn't get that. You can say read, change, next, time or submit."
- **No internet:** the fixed instructions still work. Speech recognition itself may need internet *(see the offline check)*.
- **Crash or reload:** everything is restored, down to the last word.

## 6. What a sighted person sees

- Light mode only.
- One state colour: speaking, listening, recording, thinking, picked, locked.
- The voice orb.
- The question and answer in large text.
- The question palette.
- Nothing else on the main screen.

## 7. Wispr Flow (checked on 22 Nov 2026)

- The hackathon page does **not** require the product to use Wispr Flow. It says only "built hands-free with Wispr Flow" (the way the team builds).
- The Wispr Flow API exists, but it is **"only available by exclusive access"** (email enterprise@wisprflow.ai).
  - It needs a small server to hold the key.
  - It **cleans up speech** (removes fillers and self-corrections), and the docs don't say this can be turned off.
  - The docs don't list Hindi, Tamil or Hinglish.
- **Plan:** build the speech engine so it can be swapped. Use Chrome by default, and Wispr Flow if access is granted. The automatic clean-up could suit homework, but not tests, where words must be kept exactly.

## 8. Timeline

| Date | What |
|---|---|
| 22 Nov | Approve this plan |
| 23 Nov | Activity 2 prompt (≤ 800 words), written from this plan |
| 23–25 Nov | Rebuild the interaction layer: the one thing, the AI instruction parser with an offline fallback, sounds instead of sentences, undo instead of confirm, light mode |
| 25 Nov | Activity 3 (impact) draft |
| 26 Nov | Round 1 closes |
| After | Test with a blind student, then change this plan based on what we learn |

Round 2 (27–29 Nov) has one common problem statement for everyone, so this app may not be the Round 2 build. It is still the case study and the product.

## 9. Decisions (22 Nov 2026)

- **A. The one thing:** both. Tap anywhere or press Space, **or** say "Awaaz" first.
- **B. AI for instructions:** later. v1 understands instructions on the device:
  - Exact phrases.
  - A command inside a longer sentence.
  - Key words: once the student has tapped or said "Awaaz", the app knows an instruction is coming, so "stop and research" still means stop.
  - Close matches.
- **C. Mixed speech:** written exactly as the speech engine heard it (Hindi mode may write English words in Devanagari). Nothing is converted.
- **D. Wispr Flow:** later. The speech engine can be swapped.

## 10. How the app behaves (v1)

- **Written questions:** after a written question is read, the app is already recording. The student just speaks. Tapping or saying "Awaaz" pauses writing and takes one instruction; then recording continues.
- **Multiple-choice questions:** everything the student says is an instruction ("read options", "B", "lock B"). There is no answer to record.
- **Saving and confirming:**
  - Stopping saves at once, with a sound.
  - Edits happen at once and are read back. "Undo" reverses the last change.
  - Only submitting the paper and clearing a whole answer ask "yes or no".
- **Interrupting:** a tap or Space while the app is talking stops it and takes an instruction.
- **Light mode only.**
