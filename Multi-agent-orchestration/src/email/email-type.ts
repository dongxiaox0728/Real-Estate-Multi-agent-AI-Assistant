export type EmailStatus =
  | "pending_approval"
  | "approved"
  | "sent"
  | "cancelled";

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  status: EmailStatus;
}