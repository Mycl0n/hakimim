export type Step = 'intro' | 'dashboard' | 'setup' | 'defense1' | 'defense2' | 'cross_exam_questions' | 'cross_exam_answers' | 'verdict' | 'waiting';

export interface Party {
  uid?: string;
  name: string;
  email?: string;
  defense: string;
  question?: string;
  answer?: string;
}

export interface CaseData {
  id?: string;
  subject: string;
  status: Step;
  party1: Party;
  party2: Party;
  verdict?: Verdict;
  createdBy: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Verdict {
  party1Score: number;
  party2Score: number;
  summary: string;
  punishment: string;
  legalReasoning: string;
  sealText: string;
}
