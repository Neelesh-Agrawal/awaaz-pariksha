Build Awaaz Pariksha, a voice-first practice exam prototype.

PROBLEM
Blind students depend on human scribes to write exams. Scribes are hard to find, may write carelessly or influence answers, and students cannot verify what was written.

USERS
Blind and low-vision students in India, Class 6 to college. They:
speak Indian English, Hindi or Tamil with regional accents, often mixing languages ("photosynthesis mein plants food banate hain");
use a laptop or phone browser, often in noisy rooms;
must be able to finish without sight, counting words, or memorising commands.
Teachers set papers; invigilators monitor.

WHAT TO BUILD
Students hear questions, dictate, edit and submit by voice. Keep recognised words verbatim; never generate, correct or suggest answer content.
Technology: single page; browser speech recognition (continuous, with alternatives) and speech synthesis; no login; autosave and restore.
Out of scope: maths notation, diagrams, AI-written content.

THE ONE RULE
While dictating, speech is answer text, except standalone punctuation and known stop phrases. To talk to the app, the student taps anywhere, presses Space, or says "Awaaz" (even mid-sentence; earlier words stay in the answer). Ping, then accept one instruction in the student's own words. If nothing is said within eight seconds, resume recording.

VOICE FLOW
1. Any key starts. App: "Welcome. Choose English, Hindi or Tamil." Student: "Hindi", then "start exam". App gives the question count and the one rule, once.
2. Written question: the app reads it; a rising tone starts recording. The student speaks freely; silence is never interrupted. "Full stop", "comma" and "new paragraph" become punctuation.
3. Natural instructions include "read it back", "stop", "next question", "mark for review" and "how much time is left". Read-back resumes recording. Stop saves; then every utterance is an instruction until "continue" resumes recording.
4. Editing works like telling a scribe: name words, never numbers. "Delete under", "change biogas to biofuel", "add sunlight after using", "under hatao". App applies it: "Sentence 2 is now: …". "Undo" reverts. "Edit my answer" gets only "What should I change?".
5. Multiple choice: the app reads the question and option count, then waits. Student: "read the options", then any natural answer ("B", "my answer is B", "I want Mercury"). App: "You picked B, Mercury. Not locked yet." "Lock it" locks. Changing a locked choice leaves the new pick unlocked.
6. Returning to a question resumes it: "Question 6. Your answer is B, Mercury, locked."
7. "Submit": the app summarises answered, empty, unlocked and review-marked questions, then asks "Submit now? Yes or no." Only Yes locks answers and offers a printable sheet and timestamped log.

INTERFACE
Spoken replies are short, never command lists. Screen: light, calm, large text; top to bottom:
1. A thin strip whose colour shows the state: blue speaking, teal listening, red recording, amber thinking, orange yes/no, violet editing, green submitted.
2. Top bar: name, paper title, language selector, timer.
3. Status card: the state in large text, a voice indicator moving with the student's voice, one plain hint, a "Give an instruction (Space)" button, and "You said: … → understood as …".
4. Question page styled like an answer sheet: "Question N of M, type, marks, status", then the question in large bold.
   Written answers appear live on ruled lines.
   Options are full-width rows with circled letters. Picked: dashed amber outline, "Picked, not locked". Locked: filled green, "Locked".
5. Two or three large buttons per state.
6. Side column (below on phones): numbered tiles (not visited, unanswered, answered, picked-not-locked, review), labels, and Submit.
Home: one card with the paper details and a large Start button.

NOISE, ACCENTS, MIXED LANGUAGES AND MISHEARD INPUT
Unintelligible speech in an instruction turn: buzz and ask to retry. After two failures, suggest a headset. Silence during dictation gets no response.
Accent or low confidence: keep the words, flag them, don't interrupt.
Mixed language: keep exactly as heard; never translate.
Misheard instructions: check recognition alternatives for commands, not dictation, and reject ambiguous matches. Handle "2"/"too" for "to", "bio gas" for "biogas", "block" for "lock", and "stop and research" for "stop answer".
Unclear: "Sorry, I did not understand. Please say it another way."
"That was my answer" restores a phrase taken as an instruction. "Hmm" is ignored.
Blocked microphone or offline: explain aloud and on screen; show "Retry microphone".

ACCEPTANCE TESTS
Told only the tap/"Awaaz" rule, a student can:
1. complete any paper with written and multiple-choice questions by voice alone;
2. fix one word in a 200-word answer without counting or re-dictating;
3. pick, lock, leave, return, and change a choice in one sentence; check that the new choice is unlocked;
4. confirm that "stop and research" stops recording, "stop air pollution" is saved verbatim, and "block answer" locks;
5. reload and find answers, choice locks, review marks and position restored.
Nothing requires sight.
