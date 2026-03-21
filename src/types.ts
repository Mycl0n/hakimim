export type Step = 'intro' | 'setup' | 'defense1' | 'defense2' | 'cross_exam_questions' | 'cross_exam_answers' | 'verdict';

export interface Party {
  name: string;
  defense: string;
  question?: string;
  answer?: string;
}

export interface CaseData {
  subject: string;
  party1: Party;
  party2: Party;
  verdict?: Verdict;
}

export interface Verdict {
  party1Score: number;
  party2Score: number;
  summary: string;
  punishment: string;
  legalReasoning: string;
  sealText: string;
}
