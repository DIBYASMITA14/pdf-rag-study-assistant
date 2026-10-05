// Shared Study Progress & Performance Tracking Management
// Unifies Quiz Mode/Flashcards, Answer Checker Evaluations, and Chapter-wise Mastery into reactive localStorage persistence.

export interface EvaluatedAnswerRecord {
  id: string;
  timestamp: number;
  question: string;
  marks: number;
  score: number; // e.g., 7 for 7/10
  topic: string;
  strengths: string[];
  missingPoints: string[];
  corrections: string[];
  keywords: string[];
  improvedAnswer?: string;
  filename?: string;
}

export interface SavedQuestion {
  id: string;
  question: string;
  marks: number;
  difficulty: "Easy" | "Medium" | "Hard" | string;
  topic: string;
  source?: string;
  savedAt: number;
}

export interface ChapterProgressItem {
  name: string;
  questionsAttempted: number;
  questionsCorrect: number;
  quizzesCompleted: number;
  answersChecked: number;
  averageScorePercent: number;
  progressPercent: number;
  status: "strong" | "practice" | "revision";
}

export interface StudyProgressState {
  overallProgress: number; // 0 - 100
  quizAccuracy: number; // 0 - 100
  questionsAttempted: number;
  questionsCorrect: number;
  answersCheckedCount: number;
  averageAnswerScorePercent: number;
  revisionItemsMastered: number;
  totalRevisionItems: number;
  chapters: Record<string, ChapterProgressItem>;
  savedQuestions: SavedQuestion[];
  evaluationHistory: EvaluatedAnswerRecord[];
  flashcardMastery: Record<string, boolean>;
}

const STORAGE_KEY = "insightai_study_progress_v2";

const DEFAULT_STATE: StudyProgressState = {
  overallProgress: 68,
  quizAccuracy: 75,
  questionsAttempted: 24,
  questionsCorrect: 18,
  answersCheckedCount: 6,
  averageAnswerScorePercent: 78,
  revisionItemsMastered: 14,
  totalRevisionItems: 20,
  chapters: {
    "Introduction to Operating Systems": {
      name: "Introduction to Operating Systems",
      questionsAttempted: 12,
      questionsCorrect: 10,
      quizzesCompleted: 2,
      answersChecked: 3,
      averageScorePercent: 82,
      progressPercent: 80,
      status: "strong",
    },
    "Process Management & Scheduling": {
      name: "Process Management & Scheduling",
      questionsAttempted: 8,
      questionsCorrect: 5,
      quizzesCompleted: 1,
      answersChecked: 2,
      averageScorePercent: 65,
      progressPercent: 62,
      status: "practice",
    },
    "Memory Management & Paging": {
      name: "Memory Management & Paging",
      questionsAttempted: 4,
      questionsCorrect: 3,
      quizzesCompleted: 1,
      answersChecked: 1,
      averageScorePercent: 72,
      progressPercent: 70,
      status: "strong",
    },
    "Storage & File Systems": {
      name: "Storage & File Systems",
      questionsAttempted: 3,
      questionsCorrect: 1,
      quizzesCompleted: 0,
      answersChecked: 1,
      averageScorePercent: 45,
      progressPercent: 42,
      status: "revision",
    },
  },
  savedQuestions: [],
  evaluationHistory: [],
  flashcardMastery: {},
};

export function getStudyProgress(): StudyProgressState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STATE));
      return DEFAULT_STATE;
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      chapters: { ...DEFAULT_STATE.chapters, ...(parsed.chapters || {}) },
    };
  } catch (e) {
    console.error("Failed to read study progress from localStorage:", e);
    return DEFAULT_STATE;
  }
}

export function saveStudyProgress(state: StudyProgressState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("insightai_study_progress_updated", { detail: state }));
  } catch (e) {
    console.error("Failed to save study progress:", e);
  }
}

export function recordAnswerEvaluation(record: Omit<EvaluatedAnswerRecord, "id" | "timestamp">): EvaluatedAnswerRecord {
  const current = getStudyProgress();
  const newRecord: EvaluatedAnswerRecord = {
    ...record,
    id: "eval_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    timestamp: Date.now(),
  };

  const scorePct = record.marks > 0 ? (record.score / record.marks) * 100 : 70;
  const newAnswersChecked = current.answersCheckedCount + 1;
  const newAvgScore = Math.round(
    (current.averageAnswerScorePercent * current.answersCheckedCount + scorePct) / newAnswersChecked
  );

  const topicKey = record.topic || "General Study Document";
  const existingChapter = current.chapters[topicKey] || {
    name: topicKey,
    questionsAttempted: 0,
    questionsCorrect: 0,
    quizzesCompleted: 0,
    answersChecked: 0,
    averageScorePercent: 70,
    progressPercent: 50,
    status: "practice",
  };

  const updatedChapterAnswers = existingChapter.answersChecked + 1;
  const updatedChapterAvg = Math.round(
    (existingChapter.averageScorePercent * existingChapter.answersChecked + scorePct) / updatedChapterAnswers
  );
  const updatedChapterProgress = Math.min(100, Math.round(existingChapter.progressPercent + 8));

  let status: "strong" | "practice" | "revision" = "practice";
  if (updatedChapterAvg >= 75) status = "strong";
  else if (updatedChapterAvg < 50) status = "revision";

  const updatedChapters = {
    ...current.chapters,
    [topicKey]: {
      ...existingChapter,
      answersChecked: updatedChapterAnswers,
      averageScorePercent: updatedChapterAvg,
      progressPercent: updatedChapterProgress,
      status,
    },
  };

  // Recalculate overall progress
  const chapterList = Object.values(updatedChapters);
  const overallProg = chapterList.length > 0
    ? Math.round(chapterList.reduce((acc, c) => acc + c.progressPercent, 0) / chapterList.length)
    : current.overallProgress;

  const updatedState: StudyProgressState = {
    ...current,
    answersCheckedCount: newAnswersChecked,
    averageAnswerScorePercent: newAvgScore,
    overallProgress: overallProg,
    evaluationHistory: [newRecord, ...(current.evaluationHistory || [])].slice(0, 30),
    chapters: updatedChapters,
  };

  saveStudyProgress(updatedState);
  return newRecord;
}

export function recordFlashcardMastery(cardId: string, isMastered: boolean, topicName = "General Study Document"): void {
  const current = getStudyProgress();
  const flashcardMastery = { ...current.flashcardMastery, [cardId]: isMastered };

  const masteredCount = Object.values(flashcardMastery).filter(Boolean).length;
  const totalAttempted = Object.keys(flashcardMastery).length;
  const accuracy = totalAttempted > 0 ? Math.round((masteredCount / totalAttempted) * 100) : current.quizAccuracy;

  const existingChapter = current.chapters[topicName] || {
    name: topicName,
    questionsAttempted: 0,
    questionsCorrect: 0,
    quizzesCompleted: 0,
    answersChecked: 0,
    averageScorePercent: 70,
    progressPercent: 50,
    status: "practice",
  };

  const chapterStatus: "strong" | "practice" | "revision" = accuracy >= 75 ? "strong" : accuracy < 50 ? "revision" : "practice";

  const updatedChapters: Record<string, ChapterProgressItem> = {
    ...current.chapters,
    [topicName]: {
      ...existingChapter,
      questionsAttempted: existingChapter.questionsAttempted + 1,
      questionsCorrect: existingChapter.questionsCorrect + (isMastered ? 1 : 0),
      progressPercent: Math.min(100, existingChapter.progressPercent + (isMastered ? 3 : 1)),
      status: chapterStatus,
    },
  };

  const updatedState: StudyProgressState = {
    ...current,
    flashcardMastery,
    questionsAttempted: current.questionsAttempted + 1,
    questionsCorrect: current.questionsCorrect + (isMastered ? 1 : 0),
    quizAccuracy: accuracy,
    chapters: updatedChapters,
  };

  saveStudyProgress(updatedState);
}

export function saveQuestionToBank(question: Omit<SavedQuestion, "id" | "savedAt">): SavedQuestion {
  const current = getStudyProgress();
  const newQuestion: SavedQuestion = {
    ...question,
    id: "q_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    savedAt: Date.now(),
  };

  // Avoid duplicate question text
  const exists = current.savedQuestions.some(
    q => q.question.toLowerCase().trim() === question.question.toLowerCase().trim()
  );

  const updatedSaved = exists
    ? current.savedQuestions
    : [newQuestion, ...(current.savedQuestions || [])];

  const updatedState: StudyProgressState = {
    ...current,
    savedQuestions: updatedSaved,
  };

  saveStudyProgress(updatedState);
  return newQuestion;
}

export function removeSavedQuestion(id: string): void {
  const current = getStudyProgress();
  const updatedSaved = current.savedQuestions.filter(q => q.id !== id);
  saveStudyProgress({ ...current, savedQuestions: updatedSaved });
}
